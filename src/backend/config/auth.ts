// ============================================================
// CapitalForge — JWT Auth Configuration
// Uses jose v6 (Web Crypto API — no Node crypto dependency)
// ============================================================

import {
  SignJWT,
  jwtVerify,
  type JWTPayload,
  errors as joseErrors,
} from 'jose';
import { TenantContext } from '@shared/types/index.js';

// ── Constants ────────────────────────────────────────────────
export const ACCESS_TOKEN_TTL  = '15m';
export const REFRESH_TOKEN_TTL = '7d';
export const JWT_ALGORITHM     = 'HS256' as const;
export const JWT_ISSUER        = 'capitalforge';
export const JWT_AUDIENCE      = 'capitalforge-api';

// ── Token payload shape ──────────────────────────────────────
export interface AccessTokenPayload extends JWTPayload {
  sub: string;          // userId
  tenantId: string;
  role: string;
  permissions: string[];
  type: 'access';
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string;          // userId
  tenantId: string;
  jti: string;          // unique token id — used for revocation
  type: 'refresh';
}

// ── Secret derivation ────────────────────────────────────────
// Derives a CryptoKey from the raw env string. Called once per
// process; callers cache the result via the exported helpers.

function requireSecret(envVar: string): string {
  const val = process.env[envVar];
  if (!val || val.length < 32) {
    throw new Error(
      `[auth] ${envVar} must be set and at least 32 characters long.`,
    );
  }
  return val;
}

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function getAccessSecret(): Uint8Array {
  return encodeSecret(requireSecret('JWT_ACCESS_SECRET'));
}

function getRefreshSecret(): Uint8Array {
  return encodeSecret(requireSecret('JWT_REFRESH_SECRET'));
}

// ── Token generation ─────────────────────────────────────────

/**
 * Creates a signed access JWT.
 * Access tokens are short-lived (15 min) and carry the full TenantContext.
 */
export async function generateAccessToken(ctx: TenantContext): Promise<string> {
  const payload: Omit<AccessTokenPayload, keyof JWTPayload> = {
    tenantId:    ctx.tenantId,
    role:        ctx.role,
    permissions: ctx.permissions,
    type:        'access',
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(ctx.userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(getAccessSecret());
}

/**
 * Creates a signed refresh JWT.
 * Refresh tokens are long-lived (7 days) and carry only identity fields.
 * The jti should be persisted in Redis/DB for revocation checks.
 */
export async function generateRefreshToken(
  userId: string,
  tenantId: string,
  jti: string,
): Promise<string> {
  const payload: Omit<RefreshTokenPayload, keyof JWTPayload> = {
    tenantId,
    jti,
    type: 'refresh',
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .sign(getRefreshSecret());
}

// ── Token verification ───────────────────────────────────────

export interface VerifyResult<T extends JWTPayload = JWTPayload> {
  payload: T;
  valid: true;
}

export interface VerifyError {
  valid: false;
  reason: 'expired' | 'invalid' | 'malformed';
}

export type VerifyOutcome<T extends JWTPayload> = VerifyResult<T> | VerifyError;

/**
 * Verifies an access token.
 * Returns a discriminated union — never throws to callers.
 */
export async function verifyAccessToken(
  token: string,
): Promise<VerifyOutcome<AccessTokenPayload>> {
  try {
    const { payload } = await jwtVerify<AccessTokenPayload>(
      token,
      getAccessSecret(),
      {
        issuer:    JWT_ISSUER,
        audience:  JWT_AUDIENCE,
        algorithms: [JWT_ALGORITHM],
      },
    );

    if (payload.type !== 'access') {
      return { valid: false, reason: 'invalid' };
    }

    return { valid: true, payload };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { valid: false, reason: 'expired' };
    }
    if (
      err instanceof joseErrors.JWTInvalid ||
      err instanceof joseErrors.JWSInvalid ||
      err instanceof joseErrors.JWTClaimValidationFailed
    ) {
      return { valid: false, reason: 'invalid' };
    }
    return { valid: false, reason: 'malformed' };
  }
}

/**
 * Verifies a refresh token.
 * Returns a discriminated union — never throws to callers.
 */
export async function verifyRefreshToken(
  token: string,
): Promise<VerifyOutcome<RefreshTokenPayload>> {
  try {
    const { payload } = await jwtVerify<RefreshTokenPayload>(
      token,
      getRefreshSecret(),
      {
        issuer:    JWT_ISSUER,
        audience:  JWT_AUDIENCE,
        algorithms: [JWT_ALGORITHM],
      },
    );

    if (payload.type !== 'refresh') {
      return { valid: false, reason: 'invalid' };
    }

    return { valid: true, payload };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return { valid: false, reason: 'expired' };
    }
    if (
      err instanceof joseErrors.JWTInvalid ||
      err instanceof joseErrors.JWSInvalid ||
      err instanceof joseErrors.JWTClaimValidationFailed
    ) {
      return { valid: false, reason: 'invalid' };
    }
    return { valid: false, reason: 'malformed' };
  }
}
