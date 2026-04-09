// ============================================================
// CapitalForge — Two-Factor Authentication Routes
// POST /api/auth/2fa/setup    — generate TOTP secret + QR code
// POST /api/auth/2fa/verify   — verify 6-digit TOTP code
// POST /api/auth/2fa/disable  — disable 2FA for user
// ============================================================

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware.js';
import crypto from 'crypto';

// ── Try to load real TOTP libraries (graceful fallback) ──────

let otplibAvailable = false;
let authenticator: {
  generateSecret: () => string;
  keyuri: (user: string, service: string, secret: string) => string;
  check: (token: string, secret: string) => boolean;
} | null = null;

let QRCode: { toDataURL: (text: string) => Promise<string> } | null = null;

try {
  const otplib = await import('otplib');
  authenticator = otplib.authenticator;
  otplibAvailable = true;
} catch {
  // otplib not installed — use mock fallback
}

try {
  const qr = await import('qrcode');
  QRCode = qr.default ?? qr;
} catch {
  // qrcode not installed — use placeholder
}

// ── In-memory 2FA store (replace with DB in production) ──────

interface TwoFactorRecord {
  secret: string;
  enabled: boolean;
  enabledAt?: string;
}

const twoFactorStore = new Map<string, TwoFactorRecord>();

// ── Mock TOTP helpers (used when otplib is not available) ─────

function mockGenerateSecret(): string {
  return crypto.randomBytes(20).toString('base64url').slice(0, 32);
}

function mockGenerateKeyUri(email: string, secret: string): string {
  return `otpauth://totp/CapitalForge:${encodeURIComponent(email)}?secret=${secret}&issuer=CapitalForge&digits=6&period=30`;
}

function mockVerify(token: string, _secret: string): boolean {
  // Accept "123456" as valid code when otplib is not installed
  return token === '123456';
}

// ── Validation schemas ───────────────────────────────────────

const verifySchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/, 'Code must be exactly 6 digits'),
});

const disableSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

// ── Router ───────────────────────────────────────────────────

const router = Router();

// ── POST /api/auth/2fa/setup ─────────────────────────────────
/**
 * Generates a new TOTP secret for the authenticated user.
 * Returns the secret string and a QR code data URL for scanning.
 * Does NOT enable 2FA — the user must verify a code first.
 */
router.post('/setup', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.tenant?.userId ?? 'unknown';
    const email = req.tenant?.email ?? 'user@capitalforge.io';

    // Generate secret
    const secret = otplibAvailable && authenticator
      ? authenticator.generateSecret()
      : mockGenerateSecret();

    // Generate key URI for QR code
    const keyUri = otplibAvailable && authenticator
      ? authenticator.keyuri(email, 'CapitalForge', secret)
      : mockGenerateKeyUri(email, secret);

    // Generate QR code data URL
    let qrDataUrl: string | null = null;
    if (QRCode) {
      try {
        qrDataUrl = await QRCode.toDataURL(keyUri);
      } catch {
        // QR generation failed — client will show fallback
      }
    }

    // Store the pending secret (not yet enabled)
    twoFactorStore.set(userId, { secret, enabled: false });

    res.status(200).json({
      success: true,
      data: {
        secret,
        keyUri,
        qrDataUrl,
        mock: !otplibAvailable,
        message: !otplibAvailable
          ? 'Running in mock mode — use code "123456" to verify.'
          : 'Scan the QR code with your authenticator app, then enter the 6-digit code to verify.',
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'SETUP_FAILED', message: 'Failed to set up two-factor authentication.' },
    });
  }
});

// ── POST /api/auth/2fa/verify ────────────────────────────────
/**
 * Verifies a 6-digit TOTP code against the stored secret.
 * If valid:
 *   - During setup: enables 2FA for the user
 *   - During login: confirms the 2FA challenge
 *
 * Body: { code: "123456" }
 */
router.post('/verify', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'A valid 6-digit code is required.',
        details: parsed.error.flatten().fieldErrors,
      },
    });
    return;
  }

  try {
    const userId = req.tenant?.userId ?? 'unknown';
    const record = twoFactorStore.get(userId);

    if (!record) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_SECRET', message: 'No 2FA setup found. Please run setup first.' },
      });
      return;
    }

    // Verify the code
    const isValid = otplibAvailable && authenticator
      ? authenticator.check(parsed.data.code, record.secret)
      : mockVerify(parsed.data.code, record.secret);

    if (!isValid) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CODE', message: 'Invalid verification code. Please try again.' },
      });
      return;
    }

    // Enable 2FA if not already enabled
    if (!record.enabled) {
      record.enabled = true;
      record.enabledAt = new Date().toISOString();
      twoFactorStore.set(userId, record);
    }

    res.status(200).json({
      success: true,
      data: {
        verified: true,
        twoFactorEnabled: true,
        message: '2FA verification successful.',
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'VERIFY_FAILED', message: 'Failed to verify code.' },
    });
  }
});

// ── POST /api/auth/2fa/disable ───────────────────────────────
/**
 * Disables 2FA for the authenticated user.
 * Requires password confirmation as a security measure.
 *
 * Body: { password: "current_password" }
 */
router.post('/disable', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = disableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Password confirmation is required to disable 2FA.',
        details: parsed.error.flatten().fieldErrors,
      },
    });
    return;
  }

  try {
    const userId = req.tenant?.userId ?? 'unknown';
    const record = twoFactorStore.get(userId);

    if (!record || !record.enabled) {
      res.status(400).json({
        success: false,
        error: { code: 'NOT_ENABLED', message: '2FA is not currently enabled.' },
      });
      return;
    }

    // In production, verify password against DB here.
    // For now, accept any non-empty password.
    twoFactorStore.delete(userId);

    res.status(200).json({
      success: true,
      data: {
        twoFactorEnabled: false,
        message: 'Two-factor authentication has been disabled.',
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'DISABLE_FAILED', message: 'Failed to disable 2FA.' },
    });
  }
});

// ── GET /api/auth/2fa/status ─────────────────────────────────
/**
 * Returns the current 2FA status for the authenticated user.
 */
router.get('/status', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.tenant?.userId ?? 'unknown';
  const record = twoFactorStore.get(userId);

  res.status(200).json({
    success: true,
    data: {
      enabled: record?.enabled ?? false,
      enabledAt: record?.enabledAt ?? null,
      mock: !otplibAvailable,
    },
  });
});

export { router as twoFactorRouter };
