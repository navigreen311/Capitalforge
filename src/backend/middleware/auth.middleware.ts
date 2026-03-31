// ============================================================
// CapitalForge — Authentication Middleware
// Extracts Bearer token, verifies it, attaches TenantContext.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../config/auth.js';
import type { TenantContext } from '@shared/types/index.js';

// ── Express type augmentation ────────────────────────────────
// req.tenant is already declared in tenant.middleware.ts.
// auth.middleware.ts reuses the same field for compatibility
// so that all downstream handlers have a single source of truth.
//
// If tenant.middleware.ts is not loaded, the augmentation below
// acts as the canonical declaration.

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

/** Extracts the raw token from `Authorization: Bearer <token>`. */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;

  const token = parts[1];
  return token && token.length > 0 ? token : null;
}

/** Builds a sanitised 401 JSON response — no token echoed, no PII. */
function unauthorized(
  res: Response,
  code: string,
  message: string,
): void {
  res.status(401).json({
    success: false,
    error: { code, message },
  });
}

// ── Middleware ───────────────────────────────────────────────

/**
 * `requireAuth` — mandatory authentication gate.
 *
 * Reads the Bearer token, verifies it as an access JWT, and
 * attaches a `TenantContext` to `req.tenant`.
 * Rejects with 401 on any failure — expired, invalid, missing.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearerToken(req);

  if (!token) {
    unauthorized(res, 'AUTH_TOKEN_MISSING', 'Authorization token is required.');
    return;
  }

  const result = await verifyAccessToken(token);

  if (!result.valid) {
    switch (result.reason) {
      case 'expired':
        unauthorized(res, 'AUTH_TOKEN_EXPIRED', 'Access token has expired.');
        return;
      case 'invalid':
        unauthorized(res, 'AUTH_TOKEN_INVALID', 'Access token is invalid.');
        return;
      default:
        unauthorized(res, 'AUTH_TOKEN_MALFORMED', 'Access token is malformed.');
        return;
    }
  }

  const { payload } = result;

  // Defensive: ensure all required claims are present
  if (
    !payload.sub ||
    !payload.tenantId ||
    !payload.role ||
    !Array.isArray(payload.permissions)
  ) {
    unauthorized(res, 'AUTH_TOKEN_INCOMPLETE', 'Access token is missing required claims.');
    return;
  }

  req.tenant = {
    userId:      payload.sub,
    tenantId:    payload.tenantId,
    role:        payload.role,
    permissions: payload.permissions,
  };

  next();
}

/**
 * `optionalAuth` — best-effort authentication.
 *
 * If a valid Bearer token is present it populates `req.tenant`.
 * If the token is absent or invalid the request continues unauthenticated.
 * Useful for public endpoints that tailor responses for logged-in users.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearerToken(req);

  if (token) {
    const result = await verifyAccessToken(token);
    if (result.valid) {
      const { payload } = result;
      if (
        payload.sub &&
        payload.tenantId &&
        payload.role &&
        Array.isArray(payload.permissions)
      ) {
        req.tenant = {
          userId:      payload.sub,
          tenantId:    payload.tenantId,
          role:        payload.role,
          permissions: payload.permissions,
        };
      }
    }
  }

  next();
}
