// ============================================================
// CapitalForge — Soft Delete Utility
// Marks records as inactive (isActive: false) instead of
// hard-deleting. Keeps audit trail and prevents orphaned FKs.
// ============================================================

import type { PrismaClient } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────

/** Models that support soft delete via isActive flag */
export type SoftDeletableModel = 'tenant' | 'user';

/** Shape of a soft-deletable record */
export interface SoftDeletable {
  id: string;
  isActive: boolean;
}

/** Args accepted by soft-delete write helpers */
export interface SoftDeleteArgs {
  where: { id: string };
  deletedAt?: Date;
  metadata?: Record<string, unknown>;
}

// ── Core transform helpers ────────────────────────────────────

/**
 * Returns the Prisma `update` payload that performs a soft delete.
 * Sets isActive = false and stamps updatedAt via Prisma's @updatedAt.
 */
export function buildSoftDeletePayload(extra?: Record<string, unknown>) {
  return {
    data: {
      isActive: false,
      ...extra,
    },
  };
}

/**
 * Injects `where: { isActive: true }` into any query's where clause
 * so that soft-deleted records are transparently excluded.
 */
export function excludeDeleted<T extends { where?: Record<string, unknown> }>(
  args: T = {} as T,
): T {
  return {
    ...args,
    where: {
      ...(args.where ?? {}),
      isActive: true,
    },
  };
}

/**
 * Returns a Prisma where clause that selects only soft-deleted records
 * (useful for admin screens / restore flows).
 */
export function onlyDeleted<T extends { where?: Record<string, unknown> }>(
  args: T = {} as T,
): T {
  return {
    ...args,
    where: {
      ...(args.where ?? {}),
      isActive: false,
    },
  };
}

// ── Model-specific helpers ────────────────────────────────────

/**
 * Soft-delete a Tenant by id.
 * Returns the updated record.
 */
export async function softDeleteTenant(
  prisma: PrismaClient,
  id: string,
): Promise<{ id: string; isActive: boolean; updatedAt: Date }> {
  return prisma.tenant.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, isActive: true, updatedAt: true },
  });
}

/**
 * Soft-delete a User by id.
 * Caller should also invalidate active sessions for this user.
 */
export async function softDeleteUser(
  prisma: PrismaClient,
  id: string,
): Promise<{ id: string; isActive: boolean; updatedAt: Date }> {
  return prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, isActive: true, updatedAt: true },
  });
}

/**
 * Soft-delete all users belonging to a tenant in a single batch.
 * Typically called before soft-deleting the tenant itself.
 */
export async function softDeleteTenantUsers(
  prisma: PrismaClient,
  tenantId: string,
): Promise<{ count: number }> {
  return prisma.user.updateMany({
    where: { tenantId, isActive: true },
    data: { isActive: false },
  });
}

// ── Restore helpers ───────────────────────────────────────────

/**
 * Restore a soft-deleted Tenant.
 */
export async function restoreTenant(
  prisma: PrismaClient,
  id: string,
): Promise<{ id: string; isActive: boolean; updatedAt: Date }> {
  return prisma.tenant.update({
    where: { id },
    data: { isActive: true },
    select: { id: true, isActive: true, updatedAt: true },
  });
}

/**
 * Restore a soft-deleted User.
 */
export async function restoreUser(
  prisma: PrismaClient,
  id: string,
): Promise<{ id: string; isActive: boolean; updatedAt: Date }> {
  return prisma.user.update({
    where: { id },
    data: { isActive: true },
    select: { id: true, isActive: true, updatedAt: true },
  });
}

// ── Query modifier proxy ──────────────────────────────────────

/**
 * Wraps a Prisma model delegate to silently exclude soft-deleted
 * records from findMany and findFirst queries. Useful when you want
 * transparent soft-delete behaviour without modifying every call site.
 *
 * Only applies to models that have `isActive` (Tenant, User).
 *
 * @example
 *   const users = withSoftDeleteFilter(prisma.user);
 *   const active = await users.findMany({ where: { tenantId } });
 *   // always excludes isActive: false rows
 */
export function withSoftDeleteFilter<
  T extends {
    findMany: (args?: Record<string, unknown>) => Promise<unknown[]>;
    findFirst: (args?: Record<string, unknown>) => Promise<unknown | null>;
  },
>(delegate: T): T {
  return new Proxy(delegate, {
    get(target, prop) {
      const original = (target as Record<string | symbol, unknown>)[prop];
      if (typeof original !== 'function') return original;

      const name = String(prop);

      if (name === 'findMany' || name === 'findFirst') {
        return (args?: Record<string, unknown>) =>
          (original as Function).call(target, excludeDeleted(args));
      }

      return original;
    },
  }) as T;
}
