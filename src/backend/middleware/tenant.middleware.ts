// ============================================================
// Tenant Middleware
// Extracts tenant context from a verified JWT and attaches it
// to req.tenant. All downstream queries MUST filter by tenantId
// to guarantee data isolation.
// ============================================================

import { Request, Response, NextFunction } from 'express';
import type { TenantContext, ApiResponse } from '@shared/types/index.js';
import { verifyAccessToken } from '../config/auth.js';
import logger from '../config/logger.js';

// ── Request augmentation ──────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

// Expected shape of the JWT payload issued by CapitalForge auth
interface JwtPayload {
  sub: string;        // userId
  tenantId: string;
  role: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

// ── Main middleware ───────────────────────────────────────────
export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearerToken(req);

  if (!token) {
    const body: ApiResponse = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication token required.' },
    };
    res.status(401).json(body);
    return;
  }

  // Verification goes through config/auth.ts — the same module that signs the
  // tokens — so the signer and the verifier can never drift apart.
  //
  // They previously did: this middleware read JWT_ACCESS_SECRET from
  // config/index.ts, which captures process.env once at module load and falls
  // back to a hardcoded dev default when the variable is not set at that
  // instant. config/auth.ts reads the variable lazily, per call. Whenever the
  // two resolved differently, every route behind this middleware rejected
  // tokens that had just been issued by this same server.
  const result = await verifyAccessToken(token);

  if (!result.valid) {
    const reqLog = logger.child({ requestId: req.requestId });
    reqLog.warn('Tenant middleware: token rejected', { reason: result.reason });

    const body: ApiResponse = {
      success: false,
      error: result.reason === 'expired'
        ? { code: 'TOKEN_EXPIRED', message: 'Token has expired.' }
        : { code: 'INVALID_TOKEN', message: 'Token is invalid.' },
    };
    res.status(401).json(body);
    return;
  }

  const payload = result.payload;

  if (!payload.tenantId || !payload.sub || !payload.role) {
    const body: ApiResponse = {
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token is missing required tenant claims.' },
    };
    res.status(401).json(body);
    return;
  }

  req.tenant = {
    tenantId: payload.tenantId,
    userId: payload.sub,
    role: payload.role,
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
  };

  next();
}

// ── Optional variant — skips auth on public routes ────────────
// Use this on routes where auth is optional but tenant context
// is enriched when a token IS provided.
export async function optionalTenantMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    next();
    return;
  }

  // Same single verification path as the required variant.
  const result = await verifyAccessToken(token);

  if (result.valid) {
    const payload = result.payload;
    if (payload.tenantId && payload.sub && payload.role) {
      req.tenant = {
        tenantId: payload.tenantId,
        userId: payload.sub,
        role: payload.role,
        permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
      };
    }
  }
  // An invalid token is ignored in optional mode — the route stays public.

  next();
}
