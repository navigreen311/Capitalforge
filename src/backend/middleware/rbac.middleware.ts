// ============================================================
// CapitalForge — RBAC Middleware
// Deny-by-default role and permission enforcement.
// Must be composed AFTER requireAuth so tenantContext exists.
// ============================================================

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ROLES, PERMISSIONS } from '@shared/constants/index.js';

// ── Types ────────────────────────────────────────────────────

export type Role       = typeof ROLES[keyof typeof ROLES];
export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ── Role hierarchy ───────────────────────────────────────────
// Higher index = more privileged.  SUPER_ADMIN is not in the
// normal hierarchy — it is handled separately as a bypass.

const ROLE_HIERARCHY: ReadonlyArray<Role> = [
  ROLES.READONLY,
  ROLES.CLIENT,
  ROLES.ADVISOR,
  ROLES.COMPLIANCE_OFFICER,
  ROLES.TENANT_ADMIN,
];

// ── Default permission grants per role ───────────────────────
// These mirror the least-privilege model in the domain design.
// SUPER_ADMIN carries all permissions — checked dynamically.

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  [ROLES.SUPER_ADMIN]: new Set(Object.values(PERMISSIONS) as Permission[]),

  [ROLES.TENANT_ADMIN]: new Set<Permission>([
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
  ] as Permission[]),

  [ROLES.COMPLIANCE_OFFICER]: new Set<Permission>([
    PERMISSIONS.BUSINESS_READ,
    PERMISSIONS.COMPLIANCE_READ,
    PERMISSIONS.COMPLIANCE_WRITE,
    PERMISSIONS.CONSENT_MANAGE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.REPORTS_VIEW,
  ] as Permission[]),

  [ROLES.ADVISOR]: new Set<Permission>([
    PERMISSIONS.BUSINESS_READ,
    PERMISSIONS.BUSINESS_WRITE,
    PERMISSIONS.APPLICATION_SUBMIT,
    PERMISSIONS.CONSENT_MANAGE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.REPORTS_VIEW,
  ] as Permission[]),

  [ROLES.CLIENT]: new Set<Permission>([
    PERMISSIONS.BUSINESS_READ,
    PERMISSIONS.APPLICATION_SUBMIT,
    PERMISSIONS.DOCUMENT_READ,
  ] as Permission[]),

  [ROLES.READONLY]: new Set<Permission>([
    PERMISSIONS.BUSINESS_READ,
    PERMISSIONS.DOCUMENT_READ,
  ] as Permission[]),
};

// ── Internal helpers ─────────────────────────────────────────

function forbidden(res: Response, message: string): void {
  res.status(403).json({
    success: false,
    error: {
      code:    'FORBIDDEN',
      message,
    },
  });
}

/**
 * Checks whether a role inherits from (is >= ) another in the hierarchy.
 * Returns false for SUPER_ADMIN — callers should check that separately.
 */
function roleAtLeast(userRole: string, minimumRole: Role): boolean {
  const userIdx = ROLE_HIERARCHY.indexOf(userRole as Role);
  const minIdx  = ROLE_HIERARCHY.indexOf(minimumRole);
  if (userIdx === -1 || minIdx === -1) return false;
  return userIdx >= minIdx;
}

/**
 * Resolves the effective permission set for a user.
 * Token permissions are authoritative; role defaults are the fallback.
 */
function effectivePermissions(
  role: string,
  tokenPermissions: string[],
): Set<string> {
  if (tokenPermissions.length > 0) {
    return new Set(tokenPermissions);
  }
  return new Set(
    (ROLE_PERMISSIONS[role as Role] ?? new Set()) as Iterable<string>,
  );
}

// ── Middleware factories ─────────────────────────────────────

/**
 * `requirePermissions(...perms)`
 *
 * Denies the request unless the authenticated user holds **all** of the
 * listed permissions.  SUPER_ADMIN bypasses all permission checks.
 *
 * Usage:
 *   router.get('/applications', requireAuth, requirePermissions(PERMISSIONS.APPLICATION_APPROVE), handler)
 */
export function requirePermissions(
  ...required: Permission[]
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = req.tenant;

    // Deny-by-default: no context means requireAuth was not applied first.
    if (!ctx) {
      forbidden(res, 'Access denied. Authentication context is missing.');
      return;
    }

    // SUPER_ADMIN bypasses all permission gates.
    if (ctx.role === ROLES.SUPER_ADMIN) {
      next();
      return;
    }

    const effective = effectivePermissions(ctx.role, ctx.permissions as string[]);
    const missing   = required.filter((p) => !effective.has(p));

    if (missing.length > 0) {
      // Do NOT enumerate which permission was missing — information leakage.
      forbidden(res, 'Access denied. Insufficient permissions.');
      return;
    }

    next();
  };
}

/**
 * `requireRole(...roles)`
 *
 * Denies the request unless the authenticated user holds **one of** the
 * listed roles.  SUPER_ADMIN always passes.
 *
 * Usage:
 *   router.delete('/users/:id', requireAuth, requireRole(ROLES.TENANT_ADMIN), handler)
 */
export function requireRole(...allowedRoles: Role[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = req.tenant;

    if (!ctx) {
      forbidden(res, 'Access denied. Authentication context is missing.');
      return;
    }

    if (ctx.role === ROLES.SUPER_ADMIN) {
      next();
      return;
    }

    if (!(allowedRoles as string[]).includes(ctx.role)) {
      forbidden(res, 'Access denied. Role not authorised for this resource.');
      return;
    }

    next();
  };
}

/**
 * `requireMinimumRole(minimumRole)`
 *
 * Denies the request unless the authenticated user's role is at or above
 * `minimumRole` in the defined hierarchy.  SUPER_ADMIN always passes.
 *
 * Usage:
 *   router.post('/compliance', requireAuth, requireMinimumRole(ROLES.COMPLIANCE_OFFICER), handler)
 */
export function requireMinimumRole(minimumRole: Role): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = req.tenant;

    if (!ctx) {
      forbidden(res, 'Access denied. Authentication context is missing.');
      return;
    }

    if (ctx.role === ROLES.SUPER_ADMIN) {
      next();
      return;
    }

    if (!roleAtLeast(ctx.role, minimumRole)) {
      forbidden(res, 'Access denied. Role does not meet minimum requirement.');
      return;
    }

    next();
  };
}

/**
 * `requireSelf(userIdParam?)`
 *
 * Denies the request unless the authenticated user is acting on their own
 * resource (by matching userId from the route param against tenantContext.userId),
 * OR the user holds TENANT_ADMIN or above.
 *
 * @param userIdParam — name of the route param holding the target userId (default: 'userId')
 */
export function requireSelf(userIdParam = 'userId'): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = req.tenant;

    if (!ctx) {
      forbidden(res, 'Access denied. Authentication context is missing.');
      return;
    }

    if (ctx.role === ROLES.SUPER_ADMIN || roleAtLeast(ctx.role, ROLES.TENANT_ADMIN)) {
      next();
      return;
    }

    const targetUserId = req.params[userIdParam];
    if (!targetUserId || targetUserId !== ctx.userId) {
      forbidden(res, 'Access denied. You may only access your own resources.');
      return;
    }

    next();
  };
}

// ── Re-exports for convenience ───────────────────────────────
export { ROLE_PERMISSIONS, ROLE_HIERARCHY };
