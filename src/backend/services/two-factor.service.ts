// ============================================================
// CapitalForge — Two-factor authentication
//
// Replaces a process-local `Map` that held every secret and enabled flag in
// memory. A restart silently disabled 2FA for every user; with two instances
// the answer depended which one you reached. Nothing was ever written down.
//
// The other half was worse: the login page stored the access token and *then*
// asked whether a second factor was required. The session existed before the
// challenge, so anyone who did not follow the redirect was already signed in.
//
// This module holds the rules. The routes are transport.
// ============================================================

import type { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { encrypt, decrypt } from './encryption.service.js';
import logger from '../config/logger.js';

// ── TOTP ─────────────────────────────────────────────────────

/** 30-second steps, the TOTP default and what every authenticator app assumes. */
const STEP_SECONDS = 30;

/**
 * How many steps either side of now are accepted.
 *
 * One step — 30 seconds of clock skew in each direction. Wider is friendlier
 * and proportionally weaker: every extra step is another code an attacker may
 * present.
 */
const WINDOW_STEPS = 1;

const RECOVERY_CODE_COUNT = 10;

/**
 * Failed attempts before the factor locks.
 *
 * A six-digit code is a million possibilities, which is a short afternoon at
 * unlimited request rates. The lock is what makes the search infeasible rather
 * than merely long.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export class TwoFactorError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'TwoFactorError';
  }
}

// ── otplib, with an explicit failure rather than a silent mock ───────────────

/**
 * otplib v13's surface, which is not v12's.
 *
 * The previous code did `authenticator = otplib.authenticator` inside a
 * try/catch and set `otplibAvailable = true` on success. v13 has no
 * `authenticator` export, so that assigned `undefined` and reported the
 * library as available — every later `authenticator.check(...)` would have
 * thrown. The "graceful fallback" degraded to a hand-rolled mock only when the
 * require itself failed, which it never did.
 */
interface OtpLib {
  generateSecret: () => string;
  generateSync: (opts: { secret: string }) => string;
  verifySync: (opts: { secret: string; token: string; window?: number }) => { valid: boolean };
  generateURI: (opts: {
    issuer: string;
    label: string;
    secret: string;
    period?: number;
    digits?: number;
  }) => string;
}

let otp: OtpLib | null = null;

try {
  // require, not `await import`: this backend compiles to CommonJS.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const lib = require('otplib') as Partial<OtpLib>;
  // Check the functions actually exist rather than trusting the import — that
  // assumption is exactly what broke before.
  otp =
    typeof lib.generateSecret === 'function' &&
    typeof lib.generateSync === 'function' &&
    typeof lib.verifySync === 'function' &&
    typeof lib.generateURI === 'function'
      ? (lib as OtpLib)
      : null;
} catch {
  otp = null;
}

/**
 * There is no mock fallback, deliberately.
 *
 * The previous implementation substituted a hand-rolled "mock TOTP" that was
 * indistinguishable from the real thing to every caller. A second factor that
 * quietly degrades to something weaker is worse than one that refuses: the
 * refusal gets noticed.
 */
function requireOtp(): OtpLib {
  if (otp === null) {
    throw new TwoFactorError(
      'Two-factor authentication is unavailable: the TOTP library is missing or incompatible.',
      'MFA_UNAVAILABLE',
      503,
    );
  }
  return otp;
}

/** The TOTP step a moment falls in. Used to refuse a replayed code. */
export function currentStep(at: Date = new Date()): number {
  return Math.floor(at.getTime() / 1000 / STEP_SECONDS);
}

// ── Enrolment state ──────────────────────────────────────────

type MfaUser = Pick<User, 'mfaEnabled' | 'mfaSecret'>;

/**
 * Enrolled means a flag **and** a secret.
 *
 * `admin@demoadvisors.io` was found with `mfaEnabled = true` and a null secret,
 * because the old routes kept state in memory and never wrote these columns.
 * Enforcing on the flag alone would lock that account out permanently: nothing
 * to verify a code against, and no recovery codes to fall back on.
 *
 * A flag with no credential behind it is not an enrolment, and treating it as
 * one would turn a data inconsistency into a lockout.
 */
export function isMfaEnrolled(user: MfaUser | null | undefined): boolean {
  return user?.mfaEnabled === true && user.mfaSecret !== null && user.mfaSecret !== '';
}

// ── Service ──────────────────────────────────────────────────

export interface EnrolmentStart {
  /** For manual entry when a camera is not available. */
  secret: string;
  /** otpauth:// URI the authenticator app consumes. */
  keyuri: string;
}

export interface EnrolmentResult {
  /**
   * Shown once, at enrolment, and never retrievable again — only hashes are
   * stored. Displaying them later would require keeping them readable, which
   * is the property that makes the table dangerous.
   */
  recoveryCodes: string[];
}

export function createTwoFactorService(prisma: PrismaClient) {
  /**
   * Begin enrolment: generate a secret and store it **without enabling**.
   *
   * Enabling here would leave a user who closed the tab mid-setup unable to
   * log in — enrolled against a secret their authenticator never received.
   * The factor turns on only once a code proves the app holds the secret.
   */
  async function beginEnrolment(userId: string, email: string): Promise<EnrolmentStart> {
    const lib = requireOtp();
    const secret = lib.generateSecret();

    await prisma.user.update({
      where: { id: userId },
      // Encrypted at rest. A TOTP secret is a credential: whoever holds it can
      // generate valid codes indefinitely, so it cannot sit in a plain column
      // beside the password hash and be treated as ordinary profile data.
      data: { mfaSecret: encrypt(secret), mfaEnabled: false, mfaEnrolledAt: null },
    });

    return {
      secret,
      keyuri: lib.generateURI({
        issuer: 'CapitalForge',
        label: email,
        secret,
        period: STEP_SECONDS,
      }),
    };
  }

  /**
   * Finish enrolment: prove the app holds the secret, then turn the factor on
   * and issue recovery codes.
   */
  async function confirmEnrolment(userId: string, code: string): Promise<EnrolmentResult> {
    const lib = requireOtp();
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.mfaSecret === null) {
      throw new TwoFactorError('Start enrolment before confirming it.', 'MFA_NOT_STARTED');
    }

    if (!lib.verifySync({ secret: decrypt(user.mfaSecret), token: code, window: WINDOW_STEPS }).valid) {
      throw new TwoFactorError('That code is not valid.', 'MFA_CODE_INVALID', 401);
    }

    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));

    await prisma.$transaction([
      // Replace any codes from a previous enrolment rather than adding to them.
      prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      prisma.twoFactorRecoveryCode.createMany({
        data: hashes.map((codeHash) => ({ userId, codeHash })),
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaEnrolledAt: new Date(),
          mfaLastUsedStep: currentStep(),
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
        },
      }),
    ]);

    logger.info('[2fa] Enrolment confirmed', { userId });
    return { recoveryCodes: codes };
  }

  /**
   * Verify a code at login. Accepts a TOTP code or a recovery code.
   *
   * Throws rather than returning false, so a caller cannot treat a failure as
   * a pass by forgetting to check the result.
   */
  async function verifyCode(userId: string, code: string): Promise<void> {
    const lib = requireOtp();
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!isMfaEnrolled(user)) {
      throw new TwoFactorError('Two-factor is not enabled for this account.', 'MFA_NOT_ENABLED');
    }

    if (user!.mfaLockedUntil !== null && user!.mfaLockedUntil > new Date()) {
      throw new TwoFactorError(
        'Too many incorrect codes. Try again later.',
        'MFA_LOCKED',
        429,
      );
    }

    const trimmed = code.trim().replace(/\s+/g, '');

    // TOTP first, then recovery. A recovery code is longer and cannot collide
    // with a six-digit code, so the order costs nothing.
    if (/^\d{6}$/.test(trimmed)) {
      const step = currentStep();
      // Replay guard. A code is valid for its whole window, so one observed
      // over a shoulder or in a log works until the window closes.
      if (user!.mfaLastUsedStep !== null && step <= user!.mfaLastUsedStep) {
        await recordFailure(user!);
        throw new TwoFactorError('That code has already been used.', 'MFA_CODE_REUSED', 401);
      }

      if (lib.verifySync({ secret: decrypt(user!.mfaSecret!), token: trimmed, window: WINDOW_STEPS }).valid) {
        await prisma.user.update({
          where: { id: userId },
          data: { mfaLastUsedStep: step, mfaFailedAttempts: 0, mfaLockedUntil: null },
        });
        return;
      }
    } else if (await spendRecoveryCode(userId, trimmed)) {
      await prisma.user.update({
        where: { id: userId },
        data: { mfaFailedAttempts: 0, mfaLockedUntil: null },
      });
      logger.warn('[2fa] Recovery code spent', { userId });
      return;
    }

    await recordFailure(user!);
    throw new TwoFactorError('That code is not valid.', 'MFA_CODE_INVALID', 401);
  }

  /**
   * Turn the factor off — and require a valid code to do it.
   *
   * Without that, anyone holding a stolen session can remove the control that
   * exists to make a stolen session insufficient.
   */
  async function disable(userId: string, code: string): Promise<void> {
    await verifyCode(userId, code);

    await prisma.$transaction([
      prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaEnrolledAt: null,
          mfaLastUsedStep: null,
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
        },
      }),
    ]);

    logger.warn('[2fa] Disabled', { userId });
  }

  /** How many unspent recovery codes remain. */
  async function remainingRecoveryCodes(userId: string): Promise<number> {
    return prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } });
  }

  async function spendRecoveryCode(userId: string, candidate: string): Promise<boolean> {
    const rows = await prisma.twoFactorRecoveryCode.findMany({
      where: { userId, usedAt: null },
    });

    for (const row of rows) {
      if (await bcrypt.compare(candidate, row.codeHash)) {
        // Conditional on still being unused, so two concurrent attempts with
        // the same code cannot both succeed.
        const { count } = await prisma.twoFactorRecoveryCode.updateMany({
          where: { id: row.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        return count === 1;
      }
    }
    return false;
  }

  async function recordFailure(user: User): Promise<void> {
    const attempts = user.mfaFailedAttempts + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaFailedAttempts: locked ? 0 : attempts,
        mfaLockedUntil: locked
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
          : user.mfaLockedUntil,
      },
    });

    if (locked) logger.warn('[2fa] Locked after repeated failures', { userId: user.id });
  }

  return {
    beginEnrolment,
    confirmEnrolment,
    verifyCode,
    disable,
    remainingRecoveryCodes,
  };
}

export type TwoFactorService = ReturnType<typeof createTwoFactorService>;

/** Readable, unambiguous, and long enough that guessing is not a strategy. */
function generateRecoveryCode(): string {
  // Crockford-ish: no I, L, O, U — the characters people transcribe wrongly.
  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = crypto.randomBytes(10);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 5).join('')}-${chars.slice(5, 10).join('')}`;
}
