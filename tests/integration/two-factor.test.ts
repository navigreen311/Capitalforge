// ============================================================
// Two-factor authentication — against a real database
//
// The control this replaces did not exist. Secrets and enabled flags lived in
// a process-local `Map`, so a restart disabled 2FA for every user silently;
// and the login page stored the access token *before* asking whether a second
// factor was required, so the session existed before the challenge did.
//
// These assert the two properties that were missing:
//
//   1. Enrolment survives a restart — everything is re-read from the database.
//   2. A password alone does not produce a session for an enrolled user.
//
// Integration rather than unit, because "it persists" is the whole claim.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateSync as totp } from 'otplib';
import {
  createTwoFactorService,
  isMfaEnrolled,
  currentStep,
} from '../../src/backend/services/two-factor.service';
import { createAuthService, isMfaChallenge } from '../../src/backend/services/auth.service';
import { decrypt } from '../../src/backend/services/encryption.service';

const prisma = new PrismaClient();
const twoFactor = createTwoFactorService(prisma);
const auth = createAuthService(prisma);

const SUFFIX = `2fa-${process.pid}-${Date.now()}`;
const PASSWORD = 'Str0ng!password#';

let tenantId: string;
let userId: string;
let email: string;
let secret: string;
let recoveryCodes: string[];

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: `2FA Tenant ${SUFFIX}`, slug: `twofa-${SUFFIX}` },
  });
  tenantId = tenant.id;
  email = `user-${SUFFIX}@example.com`;

  const user = await prisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      firstName: 'Two',
      lastName: 'Factor',
      role: 'advisor',
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

/** Re-read from the database, never from a return value. */
async function readUser() {
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

describe('enrolment persists', () => {
  it('signs in with a password alone before enrolment', async () => {
    const outcome = await auth.login({ email, password: PASSWORD, tenantId });
    expect(isMfaChallenge(outcome)).toBe(false);
  });

  it('stores the secret encrypted, and does not enable the factor yet', async () => {
    const started = await twoFactor.beginEnrolment(userId, email);
    secret = started.secret;

    const row = await readUser();
    expect(row.mfaSecret).not.toBeNull();
    // Encrypted at rest: the column must not contain the secret itself.
    expect(row.mfaSecret).not.toContain(secret);
    expect(decrypt(row.mfaSecret!)).toBe(secret);

    // Not on yet — a user who closes the tab here must still be able to log in.
    expect(row.mfaEnabled).toBe(false);
    expect(isMfaEnrolled(row)).toBe(false);
  });

  it('a half-finished enrolment does not gate login', async () => {
    const outcome = await auth.login({ email, password: PASSWORD, tenantId });
    expect(isMfaChallenge(outcome)).toBe(false);
  });

  it('turns the factor on only once a code proves the app holds the secret', async () => {
    const result = await twoFactor.confirmEnrolment(userId, totp({ secret }));
    recoveryCodes = result.recoveryCodes;

    const row = await readUser();
    expect(row.mfaEnabled).toBe(true);
    expect(row.mfaEnrolledAt).not.toBeNull();
    expect(isMfaEnrolled(row)).toBe(true);
  });

  it('stores recovery codes hashed, never readable', async () => {
    const rows = await prisma.twoFactorRecoveryCode.findMany({ where: { userId } });
    expect(rows).toHaveLength(10);

    // A code in this table is a login, so it is as sensitive as the password.
    for (const row of rows) {
      expect(recoveryCodes).not.toContain(row.codeHash);
    }
    expect(await bcrypt.compare(recoveryCodes[0]!, rows[0]!.codeHash)).toBe(true);
  });
});

describe('the challenge gates token issue', () => {
  it('returns a challenge instead of a session for an enrolled user', async () => {
    const outcome = await auth.login({ email, password: PASSWORD, tenantId });

    // The property the old flow lacked: a correct password is not a session.
    expect(isMfaChallenge(outcome)).toBe(true);
    if (!isMfaChallenge(outcome)) return;
    expect(outcome.challengeToken).toBeTruthy();
    expect(outcome).not.toHaveProperty('tokens');
  });

  it('exchanges a challenge and a code for a session', async () => {
    const outcome = await auth.login({ email, password: PASSWORD, tenantId });
    if (!isMfaChallenge(outcome)) throw new Error('expected a challenge');

    // A fresh step, so this is not the code spent during enrolment.
    await advanceStep();

    const session = await auth.completeMfaChallenge(
      outcome.challengeToken,
      totp({ secret }),
    );
    expect(session.tokens.accessToken).toBeTruthy();
    expect(session.user.email).toBe(email);
  });

  it('refuses a challenge token that is not one', async () => {
    await expect(auth.completeMfaChallenge('not-a-token', '000000')).rejects.toThrow();
  });
});

describe('replay, lockout and recovery', () => {
  it('refuses a code from a step already used', async () => {
    const outcome = await auth.login({ email, password: PASSWORD, tenantId });
    if (!isMfaChallenge(outcome)) throw new Error('expected a challenge');

    // The same step as the successful exchange above. A code is valid for its
    // whole 30-second window, so one observed over a shoulder works until the
    // window closes — unless the step is remembered.
    const row = await readUser();
    expect(row.mfaLastUsedStep).toBe(currentStep());

    await expect(
      auth.completeMfaChallenge(outcome.challengeToken, totp({ secret })),
    ).rejects.toThrow(/already been used/i);
  });

  it('spends a recovery code once and only once', async () => {
    await advanceStep();
    const code = recoveryCodes[1]!;

    const first = await auth.login({ email, password: PASSWORD, tenantId });
    if (!isMfaChallenge(first)) throw new Error('expected a challenge');
    const session = await auth.completeMfaChallenge(first.challengeToken, code);
    expect(session.tokens.accessToken).toBeTruthy();

    const spent = await prisma.twoFactorRecoveryCode.findFirst({
      where: { userId, usedAt: { not: null } },
    });
    expect(spent).not.toBeNull();

    // The same code again is refused.
    const second = await auth.login({ email, password: PASSWORD, tenantId });
    if (!isMfaChallenge(second)) throw new Error('expected a challenge');
    await expect(auth.completeMfaChallenge(second.challengeToken, code)).rejects.toThrow();
  });

  it('locks the factor after repeated failures', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { mfaFailedAttempts: 0, mfaLockedUntil: null },
    });

    // Five wrong codes. A six-digit code is a million possibilities, which is
    // a short afternoon at unlimited request rates.
    for (let i = 0; i < 5; i++) {
      await expect(twoFactor.verifyCode(userId, '000000')).rejects.toThrow();
    }

    const row = await readUser();
    expect(row.mfaLockedUntil).not.toBeNull();
    expect(row.mfaLockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // Even a correct code is refused while locked.
    await advanceStep();
    await expect(twoFactor.verifyCode(userId, totp({ secret }))).rejects.toThrow(
      /too many/i,
    );
  });
});

// Placed here deliberately. These tests reset `mfaLastUsedStep`, and the replay
// block above asserts on the step left behind by the successful exchange before
// it, so sitting between the two breaks that chain. Ending on a failed
// verification leaves the row at null, which is what the disabling block wants.
describe('clock skew', () => {
  // The defect this exists for, and it was live in production code rather than
  // only in tests.
  //
  // The service asked otplib for `window: 1`, intending one step of tolerance
  // either side. otplib v13 has no `window` option — the tolerance option is
  // `epochTolerance`, in seconds, defaulting to 0 — so the request was ignored
  // and a code was valid only inside its own 30-second step. A user reading a
  // code at second 29 and submitting it at second 31 was told it was invalid,
  // and no allowance existed for a device clock differing from the server's.
  //
  // It surfaced as an intermittent CI failure: the enrolment code straddled a
  // step boundary about once in eight runs on a loaded machine, and nine tests
  // failed downstream of the one that mattered.
  //
  // The type never caught it because the service declares otplib's shape in a
  // hand-written interface, and that interface named `window`. The compiler
  // checked the call against our model of the library rather than the library.
  it('accepts a code minted one step ago', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const previousStep = totp({ secret, epoch: nowSeconds - 30 });

    // Enrolled and not yet used this step, so only tolerance decides this.
    await prisma.user.update({
      where: { id: userId },
      data: { mfaLastUsedStep: null, mfaFailedAttempts: 0, mfaLockedUntil: null },
    });

    await expect(twoFactor.verifyCode(userId, previousStep)).resolves.toBeUndefined();
  });

  // Tolerance and the replay guard are coupled, and adding the first without
  // revisiting the second opens a hole rather than closing one.
  //
  // The guard used to record `currentStep()` — the step we verified in. While
  // tolerance was zero that was always the token's own step too, so the guard
  // was right for a reason it did not state. With one step of tolerance the two
  // come apart: a code from step N is still verifiable during step N+1, and a
  // guard reading the clock sees N+1 > N, concludes the code is fresh, and lets
  // an observed code through a second time.
  //
  // This asserts the recorded step is the TOKEN's, which is the difference
  // between the two implementations. Asserting only that a replay is refused
  // would pass under both, because a same-step replay is caught either way.
  it('records the step the token came from, not the step it was verified in', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const tokenStep = Math.floor((nowSeconds - 30) / 30);
    const previousStep = totp({ secret, epoch: nowSeconds - 30 });

    await prisma.user.update({
      where: { id: userId },
      data: { mfaLastUsedStep: null, mfaFailedAttempts: 0, mfaLockedUntil: null },
    });

    await twoFactor.verifyCode(userId, previousStep);

    const row = await readUser();
    expect(row.mfaLastUsedStep).toBe(tokenStep);
    expect(row.mfaLastUsedStep).not.toBe(currentStep());

    // And the code is now spent, though the clock has moved past its step.
    await expect(twoFactor.verifyCode(userId, previousStep)).rejects.toThrow(/already been used/i);
  });

  it('still refuses a code from far outside the tolerance', async () => {
    // Tolerance is one step, not unlimited. A code from five minutes ago is a
    // replayed code, and widening the window to hide a flake would have traded
    // a test failure for a security hole.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const longExpired = totp({ secret, epoch: nowSeconds - 300 });

    await prisma.user.update({
      where: { id: userId },
      data: { mfaLastUsedStep: null, mfaFailedAttempts: 0, mfaLockedUntil: null },
    });

    await expect(twoFactor.verifyCode(userId, longExpired)).rejects.toThrow(/not valid/i);
  });
});

describe('disabling requires a code', () => {
  it('refuses to disable on a wrong code', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { mfaFailedAttempts: 0, mfaLockedUntil: null, mfaLastUsedStep: null },
    });

    // Otherwise a stolen session removes the control that exists to make a
    // stolen session insufficient.
    await expect(twoFactor.disable(userId, '000000')).rejects.toThrow();
    expect((await readUser()).mfaEnabled).toBe(true);
  });

  it('clears the secret and the recovery codes when it does disable', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { mfaFailedAttempts: 0, mfaLockedUntil: null, mfaLastUsedStep: null },
    });

    await twoFactor.disable(userId, totp({ secret }));

    const row = await readUser();
    expect(row.mfaEnabled).toBe(false);
    expect(row.mfaSecret).toBeNull();
    expect(await prisma.twoFactorRecoveryCode.count({ where: { userId } })).toBe(0);

    // And a password alone signs in again.
    expect(isMfaChallenge(await auth.login({ email, password: PASSWORD, tenantId }))).toBe(false);
  });
});

describe('a flag with no secret is not an enrolment', () => {
  it('does not gate login, and does not lock the account out', async () => {
    // `admin@demoadvisors.io` was found in exactly this state: mfaEnabled with
    // a null secret, left by the in-memory implementation. Enforcing on the
    // flag alone would have locked it out permanently — nothing to verify a
    // code against and no recovery codes.
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaSecret: null },
    });

    const row = await readUser();
    expect(row.mfaEnabled).toBe(true);
    expect(isMfaEnrolled(row)).toBe(false);

    const outcome = await auth.login({ email, password: PASSWORD, tenantId });
    expect(isMfaChallenge(outcome)).toBe(false);
  });
});

/**
 * Make the current TOTP step usable again.
 *
 * The replay guard refuses a step at or below `mfaLastUsedStep`, so after a
 * successful verification the current code is spent. Waiting out the real
 * 30-second window would make these tests slow and clock-dependent; winding
 * the recorded step back one is the same precondition, deterministically.
 *
 * The guard itself is tested directly, without this.
 */
async function advanceStep(): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { mfaLastUsedStep: currentStep() - 1 },
  });
}
