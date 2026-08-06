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

// ── MFA challenge token ──────────────────────────────────────

/**
 * Short-lived proof that a password was accepted, and nothing more.
 *
 * The login page used to store the access token and *then* ask whether a
 * second factor was required, so the session existed before the challenge did.
 * Anyone who did not follow the redirect was already signed in.
 *
 * This is what `login` returns instead of tokens for an enrolled user. It is
 * signed with the **access** secret but carries `type: 'mfa_challenge'`, and
 * `verifyAccessToken` rejects any type other than `access` — so a challenge
 * cannot be presented to the API as a session even though the signature
 * verifies. It carries no permissions for the same reason.
 */
const MFA_CHALLENGE_TTL = '5m';

export interface MfaChallengePayload {
  sub: string;
  tenantId: string;
  type: 'mfa_challenge';
}

export async function generateMfaChallengeToken(
  userId: string,
  tenantId: string,
): Promise<string> {
  return new SignJWT({ tenantId, type: 'mfa_challenge' })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(MFA_CHALLENGE_TTL)
    .sign(getAccessSecret());
}

/** The user a challenge names, or null if it is not a valid challenge. */
export async function verifyMfaChallengeToken(
  token: string,
): Promise<{ userId: string; tenantId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getAccessSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    // An access token would verify against this secret too. The type check is
    // what stops a session being presented as a completed challenge.
    if (payload['type'] !== 'mfa_challenge') return null;
    if (typeof payload.sub !== 'string' || typeof payload['tenantId'] !== 'string') return null;

    return { userId: payload.sub, tenantId: payload['tenantId'] };
  } catch {
    return null;
  }
}
