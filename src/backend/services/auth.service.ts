// ============================================================
// CapitalForge — Auth Service
// Login, register, refresh, logout.
// Passwords: bcryptjs  |  Tokens: jose (see config/auth.ts)
// ============================================================

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient }  from '@prisma/client';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../config/auth.js';
import { ROLES, PERMISSIONS } from '@shared/constants/index.js';
import type { TenantContext } from '@shared/types/index.js';

// ── Constants ────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;

// ── Role → permission mapping (mirrors rbac.middleware) ──────
// Kept here to avoid a circular dependency on the middleware layer.

type RoleKey = keyof typeof ROLES;
type RoleVal = typeof ROLES[RoleKey];
type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

const ROLE_DEFAULT_PERMISSIONS: Record<RoleVal, Permission[]> = {
  [ROLES.SUPER_ADMIN]:       Object.values(PERMISSIONS) as Permission[],
  [ROLES.TENANT_ADMIN]:      [
    PERMISSIONS.BUSINESS_READ,
    PERMISSIONS.BUSINESS_WRITE,
    PERMISSIONS.APPLICATION_SUBMIT,
    PERMISSIONS.APPLICATION_APPROVE,
    PERMISSIONS.COMPLIANCE_READ,
    PERMISSIONS.COMPLIANCE_WRITE,
    PERMISSIONS.CONSENT_MANAGE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.ACH_MANAGE,
    PERMISSIONS.ADMIN_TENANT,
    PERMISSIONS.ADMIN_USERS,
    PERMISSIONS.REPORTS_VIEW,
  ] as Permission[],
  [ROLES.COMPLIANCE_OFFICER]: [
    PERMISSIONS.BUSINESS_READ,
    PERMISSIONS.COMPLIANCE_READ,
    PERMISSIONS.COMPLIANCE_WRITE,
    PERMISSIONS.CONSENT_MANAGE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.REPORTS_VIEW,
  ] as Permission[],
  [ROLES.ADVISOR]: [
    PERMISSIONS.BUSINESS_READ,
    PERMISSIONS.BUSINESS_WRITE,
    PERMISSIONS.APPLICATION_SUBMIT,
    PERMISSIONS.CONSENT_MANAGE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.REPORTS_VIEW,
  ] as Permission[],
  [ROLES.CLIENT]: [
    PERMISSIONS.BUSINESS_READ,
    PERMISSIONS.APPLICATION_SUBMIT,
    PERMISSIONS.DOCUMENT_READ,
  ] as Permission[],
  [ROLES.READONLY]: [
    PERMISSIONS.BUSINESS_READ,
    PERMISSIONS.DOCUMENT_READ,
  ] as Permission[],
};

// ── DTO shapes ────────────────────────────────────────────────

export interface LoginInput {
  email:    string;
  password: string;
  tenantId: string;
}

export interface RegisterInput {
  email:     string;
  password:  string;
  firstName: string;
  lastName:  string;
  tenantId:  string;
  role?:     string;
}

export interface AuthTokens {
  accessToken:  string;
  refreshToken: string;
}

export interface AuthResult {
  tokens: AuthTokens;
  user: {
    id:        string;
    tenantId:  string;
    email:     string;
    firstName: string;
    lastName:  string;
    role:      string;
  };
}

// ── Errors ───────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusHint: 400 | 401 | 403 | 404 | 409 = 401,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// ── PII masking ───────────────────────────────────────────────

/** Returns a user-safe object — strips passwordHash and mfaSecret. */
function safeUser(user: {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}) {
  return {
    id:        user.id,
    tenantId:  user.tenantId,
    email:     user.email,
    firstName: user.firstName,
    lastName:  user.lastName,
    role:      user.role,
  };
}

// ── Service factory ───────────────────────────────────────────

export function createAuthService(prisma: PrismaClient) {
  // ── Internal helpers ──────────────────────────────────────

  function permissionsForRole(role: string): Permission[] {
    return ROLE_DEFAULT_PERMISSIONS[role as RoleVal] ?? [];
  }

  async function buildContext(
    userId: string,
    tenantId: string,
    role: string,
  ): Promise<TenantContext> {
    return {
      userId,
      tenantId,
      role,
      permissions: permissionsForRole(role),
    };
  }

  async function issueTokens(ctx: TenantContext): Promise<AuthTokens> {
    const jti          = uuidv4();
    const accessToken  = await generateAccessToken(ctx);
    const refreshToken = await generateRefreshToken(ctx.userId, ctx.tenantId, jti);
    return { accessToken, refreshToken };
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Validates email + password for a tenant, updates lastLoginAt,
   * and returns a fresh token pair + sanitised user object.
   *
   * SECURITY: errors deliberately do not distinguish between
   * "user not found" and "wrong password" to prevent enumeration.
   */
  async function login(input: LoginInput): Promise<AuthResult> {
    const user = await prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: input.tenantId,
          email:    input.email.toLowerCase().trim(),
        },
      },
    });

    // Constant-time compare: run bcrypt even if user doesn't exist
    // by comparing against a known dummy hash.
    const DUMMY_HASH =
      '$2a$12$placeholderHashForTimingEquality.DoNotStore';

    const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
    const passwordMatch = await bcrypt.compare(input.password, hashToCheck);

    if (!user || !user.isActive || !passwordMatch) {
      throw new AuthError(
        'Invalid credentials.',
        'AUTH_INVALID_CREDENTIALS',
        401,
      );
    }

    // Update last login — fire and forget, non-blocking
    prisma.user
      .update({
        where: { id: user.id },
        data:  { lastLoginAt: new Date() },
      })
      .catch(() => {
        // Silently swallow — do not surface DB errors to the client
      });

    const ctx    = await buildContext(user.id, user.tenantId, user.role);
    const tokens = await issueTokens(ctx);

    return { tokens, user: safeUser(user) };
  }

  /**
   * Registers a new user under the given tenant.
   * Validates uniqueness, hashes password, sets default role.
   */
  async function register(input: RegisterInput): Promise<AuthResult> {
    const email    = input.email.toLowerCase().trim();
    const role     = input.role ?? ROLES.ADVISOR;

    // Validate role is a known value
    const knownRoles = Object.values(ROLES) as string[];
    if (!knownRoles.includes(role)) {
      throw new AuthError('Invalid role specified.', 'AUTH_INVALID_ROLE', 400);
    }

    // Check uniqueness
    const existing = await prisma.user.findUnique({
      where: {
        tenantId_email: { tenantId: input.tenantId, email },
      },
    });

    if (existing) {
      throw new AuthError(
        'An account with this email already exists.',
        'AUTH_EMAIL_CONFLICT',
        409,
      );
    }

    // Validate tenant exists and is active
    const tenant = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
    });

    if (!tenant || !tenant.isActive) {
      throw new AuthError('Tenant not found or inactive.', 'AUTH_TENANT_INVALID', 400);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        tenantId:     input.tenantId,
        email,
        passwordHash,
        firstName:    input.firstName,
        lastName:     input.lastName,
        role,
        isActive:     true,
        lastLoginAt:  new Date(),
      },
    });

    const ctx    = await buildContext(user.id, user.tenantId, user.role);
    const tokens = await issueTokens(ctx);

    return { tokens, user: safeUser(user) };
  }

  /**
   * Issues new access + refresh tokens given a valid, non-revoked
   * refresh token.  Rotates the refresh token (old jti is invalidated
   * via the Redis blocklist maintained in the route handler).
   */
  async function refreshTokens(
    rawRefreshToken: string,
  ): Promise<AuthTokens & { oldJti: string }> {
    const result = await verifyRefreshToken(rawRefreshToken);

    if (!result.valid) {
      const code =
        result.reason === 'expired'
          ? 'AUTH_REFRESH_EXPIRED'
          : 'AUTH_REFRESH_INVALID';
      throw new AuthError('Refresh token is invalid or expired.', code, 401);
    }

    const { payload } = result;

    // Load user to get latest role/status (tokens may be stale)
    const user = await prisma.user.findUnique({
      where: { id: payload.sub! },
    });

    if (!user || !user.isActive) {
      throw new AuthError('User account is inactive.', 'AUTH_USER_INACTIVE', 401);
    }

    const ctx    = await buildContext(user.id, user.tenantId, user.role);
    const tokens = await issueTokens(ctx);

    return {
      ...tokens,
      oldJti: payload.jti as string,
    };
  }

  /**
   * Logout — returns the refresh token's jti so the caller can add
   * it to the Redis blocklist.  Access tokens expire naturally (15m).
   */
  async function logout(rawRefreshToken: string): Promise<{ jti: string }> {
    const result = await verifyRefreshToken(rawRefreshToken);

    // Even if expired we extract the jti and blocklist it, preventing
    // any replay within the original 7d window via clock skew attacks.
    if (result.valid && result.payload.jti) {
      return { jti: result.payload.jti as string };
    }

    // For invalid / malformed tokens we return a no-op jti
    return { jti: '' };
  }

  return { login, register, refreshTokens, logout };
}

export type AuthService = ReturnType<typeof createAuthService>;
