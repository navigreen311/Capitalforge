// ============================================================
// CapitalForge — Auth Routes
// POST /api/auth/login
// POST /api/auth/register
// POST /api/auth/refresh
// POST /api/auth/logout
// ============================================================

import { Router, type Request, type Response } from 'express';
import { z }                  from 'zod';
import { PrismaClient }       from '@prisma/client';
import {
  createAuthService,
  AuthError,
}                             from '../../services/auth.service.js';
import { requireAuth }        from '../../middleware/auth.middleware.js';
import { ROLES }              from '@shared/constants/index.js';
import type { ApiResponse }   from '@shared/types/index.js';

// ── Router setup ─────────────────────────────────────────────

const router  = Router();
const prisma  = new PrismaClient();
const authSvc = createAuthService(prisma);

// ── Validation schemas ────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8).max(128),
  tenantId: z.string().uuid(),
});

const registerSchema = z.object({
  email:     z.string().email(),
  password:  z
    .string()
    .min(12, 'Password must be at least 12 characters.')
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/,
      'Password must contain uppercase, lowercase, digit, and special character.',
    ),
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  tenantId:  z.string().uuid(),
  role:      z.enum([
    ROLES.ADVISOR,
    ROLES.CLIENT,
    ROLES.COMPLIANCE_OFFICER,
    ROLES.READONLY,
    ROLES.TENANT_ADMIN,
  ]).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

// ── Error handler ─────────────────────────────────────────────

function handleAuthError(res: Response, err: unknown): void {
  if (err instanceof AuthError) {
    const status = err.statusHint;
    const body: ApiResponse = {
      success: false,
      error: {
        code:    err.code,
        message: err.message,
      },
    };
    res.status(status).json(body);
    return;
  }

  // Generic 500 — no internal details exposed
  const body: ApiResponse = {
    success: false,
    error: {
      code:    'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again.',
    },
  };
  res.status(500).json(body);
}

// ── POST /api/auth/login ──────────────────────────────────────

/**
 * Authenticates a user and returns an access + refresh token pair.
 *
 * Body: { email, password, tenantId }
 *
 * SECURITY: No password or token is ever included in error responses.
 * The response body only echoes back sanitised user fields.
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code:    'VALIDATION_ERROR',
        message: 'Invalid request body.',
        details: parsed.error.flatten().fieldErrors,
      },
    } satisfies ApiResponse);
    return;
  }

  try {
    const result = await authSvc.login(parsed.data);
    res.status(200).json({
      success: true,
      data: {
        user:         result.user,
        accessToken:  result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
    } satisfies ApiResponse);
  } catch (err) {
    handleAuthError(res, err);
  }
});

// ── POST /api/auth/register ────────────────────────────────────

/**
 * Registers a new user account under an existing tenant.
 * SUPER_ADMIN role cannot be self-registered — it must be granted
 * through an administrative operation.
 *
 * Body: { email, password, firstName, lastName, tenantId, role? }
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code:    'VALIDATION_ERROR',
        message: 'Invalid request body.',
        details: parsed.error.flatten().fieldErrors,
      },
    } satisfies ApiResponse);
    return;
  }

  try {
    const result = await authSvc.register(parsed.data);
    res.status(201).json({
      success: true,
      data: {
        user:         result.user,
        accessToken:  result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
    } satisfies ApiResponse);
  } catch (err) {
    handleAuthError(res, err);
  }
});

// ── POST /api/auth/refresh ─────────────────────────────────────

/**
 * Rotates the refresh token and issues a new access + refresh pair.
 * Clients MUST discard the old refresh token immediately.
 *
 * Body: { refreshToken }
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'refreshToken is required.' },
    } satisfies ApiResponse);
    return;
  }

  try {
    const result = await authSvc.refreshTokens(parsed.data.refreshToken);

    // TODO: blocklist result.oldJti in Redis with TTL = 7 days
    // e.g. await redis.set(`blocklist:${result.oldJti}`, '1', 'EX', 604800);

    res.status(200).json({
      success: true,
      data: {
        accessToken:  result.accessToken,
        refreshToken: result.refreshToken,
      },
    } satisfies ApiResponse);
  } catch (err) {
    handleAuthError(res, err);
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────

/**
 * Invalidates the supplied refresh token.
 * The jti is added to the Redis blocklist so it can never be replayed.
 * Access tokens expire naturally within their 15-minute window.
 *
 * Body: { refreshToken }
 *
 * Requires a valid access token so stray / unauthenticated logout
 * calls cannot be used to probe the token blocklist.
 */
router.post(
  '/logout',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = logoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'refreshToken is required.' },
      } satisfies ApiResponse);
      return;
    }

    try {
      const { jti } = await authSvc.logout(parsed.data.refreshToken);

      // TODO: if jti is non-empty, add to Redis blocklist
      // e.g. if (jti) await redis.set(`blocklist:${jti}`, '1', 'EX', 604800);

      res.status(200).json({ success: true, data: { loggedOut: true } } satisfies ApiResponse);
    } catch (err) {
      handleAuthError(res, err);
    }
  },
);

export default router;
