// ============================================================
// CapitalForge — Two-Factor Authentication Routes
//
//   POST /api/auth/2fa/setup     — begin enrolment (secret + otpauth URI)
//   POST /api/auth/2fa/confirm   — prove the app holds it, get recovery codes
//   POST /api/auth/2fa/disable   — turn it off, requires a valid code
//   GET  /api/auth/2fa/status    — enrolled? how many recovery codes left?
//   POST /api/auth/2fa/challenge — exchange a login challenge for a session
//
// These are transport. The rules live in `two-factor.service`.
//
// What this replaces: a process-local `Map` holding every secret and enabled
// flag, so a restart silently disabled 2FA for every user and two instances
// disagreed; a hand-rolled "mock TOTP" that stood in silently when otplib was
// missing; and a login flow that issued tokens *before* asking for a second
// factor, which made the challenge advisory — anyone who ignored the redirect
// was already signed in.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import {
  createTwoFactorService,
  isMfaEnrolled,
  TwoFactorError,
} from '../../services/two-factor.service.js';
import { createAuthService, AuthError } from '../../services/auth.service.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

const router = Router();
const twoFactor = createTwoFactorService(sharedPrisma);
const authSvc = createAuthService(sharedPrisma);

let QRCode: { toDataURL: (text: string) => Promise<string> } | null = null;
try {
  // require, not `await import`: this backend compiles to CommonJS.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const qr = require('qrcode');
  QRCode = qr.default ?? qr;
} catch {
  QRCode = null;
}

function fail(res: Response, err: unknown): void {
  if (err instanceof TwoFactorError) {
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    } satisfies ApiResponse);
    return;
  }
  if (err instanceof AuthError) {
    res.status(err.statusHint).json({
      success: false,
      error: { code: err.code, message: err.message },
    } satisfies ApiResponse);
    return;
  }
  logger.error('[2fa] Unhandled error', { err });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Two-factor request failed.' },
  } satisfies ApiResponse);
}

const CodeSchema = z.object({ code: z.string().min(6).max(32) });

// ── POST /setup ──────────────────────────────────────────────

router.post('/setup', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.tenant!;
    const user = await sharedPrisma.user.findUniqueOrThrow({ where: { id: userId } });

    const { secret, keyuri } = await twoFactor.beginEnrolment(userId, user.email);

    // The factor is NOT on yet. Enabling here would strand a user who closed
    // the tab mid-setup: enrolled against a secret their app never received.
    res.json({
      success: true,
      data: {
        secret,
        keyuri,
        qrCode: QRCode ? await QRCode.toDataURL(keyuri) : null,
        enabled: false,
      },
    } satisfies ApiResponse);
  } catch (err) {
    fail(res, err);
  }
});

// ── POST /confirm ────────────────────────────────────────────

router.post('/confirm', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = CodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'A code is required.' },
    } satisfies ApiResponse);
    return;
  }

  try {
    const { userId } = req.tenant!;
    const { recoveryCodes } = await twoFactor.confirmEnrolment(userId, parsed.data.code);

    // Shown once. Only hashes are stored, so this response is the single
    // opportunity to record them — which is what makes them safe to keep.
    res.json({
      success: true,
      data: {
        enabled: true,
        recoveryCodes,
        notice:
          'Store these now. They are not retrievable — only hashes are kept — and each works once.',
      },
    } satisfies ApiResponse);
  } catch (err) {
    fail(res, err);
  }
});

// ── POST /disable ────────────────────────────────────────────

router.post('/disable', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = CodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        // Disabling requires a code for the same reason enabling does: without
        // it, a stolen session can remove the control that exists to make a
        // stolen session insufficient.
        message: 'A valid code is required to disable two-factor authentication.',
      },
    } satisfies ApiResponse);
    return;
  }

  try {
    await twoFactor.disable(req.tenant!.userId, parsed.data.code);
    res.json({ success: true, data: { enabled: false } } satisfies ApiResponse);
  } catch (err) {
    fail(res, err);
  }
});

// ── GET /status ──────────────────────────────────────────────

router.get('/status', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.tenant!;
    const user = await sharedPrisma.user.findUniqueOrThrow({ where: { id: userId } });

    // `isMfaEnrolled`, not `user.mfaEnabled`. A flag with no secret behind it
    // is not an enrolment — see the service for the account that proved it.
    const enrolled = isMfaEnrolled(user);

    res.json({
      success: true,
      data: {
        enabled: enrolled,
        enrolledAt: user.mfaEnrolledAt,
        recoveryCodesRemaining: enrolled ? await twoFactor.remainingRecoveryCodes(userId) : 0,
      },
    } satisfies ApiResponse);
  } catch (err) {
    fail(res, err);
  }
});

// ── POST /challenge ──────────────────────────────────────────

const ChallengeSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().min(6).max(32),
});

/**
 * Exchange the challenge `login` returned for an actual session.
 *
 * Deliberately unauthenticated: the caller has no session yet, which is the
 * whole point. The challenge token is the credential, and it is worthless on
 * its own — `verifyAccessToken` refuses any payload whose `type` is not
 * `access`, so a challenge cannot be presented to the API as a bearer token
 * even though it verifies against the same secret.
 */
router.post('/challenge', async (req: Request, res: Response): Promise<void> => {
  const parsed = ChallengeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'A challenge token and a code are required.' },
    } satisfies ApiResponse);
    return;
  }

  try {
    const result = await authSvc.completeMfaChallenge(
      parsed.data.challengeToken,
      parsed.data.code,
    );

    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
    } satisfies ApiResponse);
  } catch (err) {
    fail(res, err);
  }
});

export { router as twoFactorRouter };
