// ============================================================
// Tenant Middleware
// Extracts tenant context from a verified JWT and attaches it
// to req.tenant. All downstream queries MUST filter by tenantId
// to guarantee data isolation.
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { jwtVerify, decodeJwt } from 'jose';
import type { TenantContext, ApiResponse } from '@shared/types/index.js';
import { JWT_SECRET, IS_PRODUCTION } from '../config/index.js';
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

  try {
    const secretBytes = new TextEncoder().encode(JWT_SECRET);

    let payload: JwtPayload;

    if (IS_PRODUCTION) {
      // Full verification: signature + expiry
      const { payload: verified } = await jwtVerify(token, secretBytes);
      payload = verified as unknown as JwtPayload;
    } else {
      // In dev/test environments allow decode-only (useful for local tooling)
      // Still validate shape; just skip signature check
      payload = decodeJwt(token) as unknown as JwtPayload;
    }

    if (!payload.tenantId || !payload.sub || !payload.role) {
      throw new Error('JWT missing required tenant claims (tenantId, sub, role).');
    }

    req.tenant = {
      tenantId: payload.tenantId,
      userId: payload.sub,
      role: payload.role,
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    };

    next();
  } catch (err) {
    const reqLog = logger.child({ requestId: req.requestId });
    reqLog.warn('Tenant middleware: invalid or expired token', {
      error: err instanceof Error ? err.message : String(err),
    });

    const body: ApiResponse = {
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token is invalid or has expired.' },
    };
    res.status(401).json(body);
  }
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

  try {
    const secretBytes = new TextEncoder().encode(JWT_SECRET);
    let payload: JwtPayload;

    if (IS_PRODUCTION) {
      const { payload: verified } = await jwtVerify(token, secretBytes);
      payload = verified as unknown as JwtPayload;
    } else {
      payload = decodeJwt(token) as unknown as JwtPayload;
    }

    if (payload.tenantId && payload.sub && payload.role) {
      req.tenant = {
        tenantId: payload.tenantId,
        userId: payload.sub,
        role: payload.role,
        permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
      };
    }
  } catch {
    // Silently ignore in optional mode
  }

  next();
}
