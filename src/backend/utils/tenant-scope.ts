// ============================================================
// CapitalForge — Tenant Isolation Utility
// Wraps Prisma delegates to enforce tenantId on every query.
// Prevents cross-tenant data leaks at the data-access layer.
// ============================================================

import type { PrismaClient, Prisma } from '@prisma/client';
import type { TenantContext } from '../../shared/types/index.js';

// ── Types ─────────────────────────────────────────────────────

/**
 * Generic shape of a Prisma model delegate that supports
 * findMany / findFirst / findUnique / count / create / update / delete / updateMany / deleteMany.
 * Using a broad type so we don't have to enumerate every model.
 */
type AnyPrismaDelegate = {
  findMany: (args?: Record<string, unknown>) => Promise<unknown[]>;
  findFirst: (args?: Record<string, unknown>) => Promise<unknown | null>;
  findUnique: (args?: Record<string, unknown>) => Promise<unknown | null>;
  count: (args?: Record<string, unknown>) => Promise<number>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
  delete: (args: Record<string, unknown>) => Promise<unknown>;
  updateMany: (args: Record<string, unknown>) => Promise<Prisma.BatchPayload>;
  deleteMany: (args: Record<string, unknown>) => Promise<Prisma.BatchPayload>;
};

type ScopedArgs = Record<string, unknown>;

// ── Core scope injector ───────────────────────────────────────

/**
 * Merges `{ where: { tenantId } }` into any args object.
 * Safely merges with an existing `where` clause rather than overwriting it.
 */
export function withTenantScope(
  tenantId: string,
  args: ScopedArgs = {},
): ScopedArgs {
  const existingWhere = (args['where'] as Record<string, unknown> | undefined) ?? {};
  return {
    ...args,
    where: {
      ...existingWhere,
      tenantId,
    },
  };
}

/**
 * Injects tenantId into a `data` payload for create operations.
 * Useful when creating records that require tenantId on the row itself.
 */
export function withTenantData(
  tenantId: string,
  args: ScopedArgs = {},
): ScopedArgs {
  const existingData = (args['data'] as Record<string, unknown> | undefined) ?? {};
  return {
    ...args,
    data: {
      ...existingData,
      tenantId,
    },
  };
}

// ── Scoped delegate factory ───────────────────────────────────

/**
 * Wraps a Prisma model delegate so that every read, update,
 * and delete operation is automatically scoped to the given tenantId.
 *
 * Usage:
 *   const biz = scopedDelegate(prisma.business, tenantId);
 *   const rows = await biz.findMany({ where: { status: 'active' } });
 *   // Executes: WHERE status='active' AND tenantId='<tenantId>'
 */
export function scopedDelegate<T extends AnyPrismaDelegate>(
  delegate: T,
  tenantId: string,
): T {
  return new Proxy(delegate, {
    get(target, prop) {
      const original = (target as Record<string | symbol, unknown>)[prop];
      if (typeof original !== 'function') return original;

      const name = String(prop);

      // Read operations: inject tenantId into where clause
      if (
        name === 'findMany' ||
        name === 'findFirst' ||
        name === 'count'
      ) {
        return (args?: ScopedArgs) =>
          (original as Function).call(target, withTenantScope(tenantId, args));
      }

      // findUnique does not support AND on unique fields the same way;
      // still scope to prevent accidents on non-unique queries that land here
      if (name === 'findUnique') {
        return (args?: ScopedArgs) =>
          (original as Function).call(target, withTenantScope(tenantId, args));
      }

      // Write operations that mutate via where clause
      if (
        name === 'update' ||
        name === 'delete' ||
        name === 'updateMany' ||
        name === 'deleteMany'
      ) {
        return (args: ScopedArgs) =>
          (original as Function).call(target, withTenantScope(tenantId, args));
      }

      // Create: inject tenantId into data
      if (name === 'create') {
        return (args: ScopedArgs) =>
          (original as Function).call(target, withTenantData(tenantId, args));
      }

      return original;
    },
  }) as T;
}

// ── Scoped client factory ─────────────────────────────────────

/**
 * Returns a lightweight object exposing all tenant-scoped model delegates.
 * Services should call this at request boundary (e.g., in middleware) and
 * pass the scoped client down rather than calling prisma directly.
 *
 * Models that don't have a direct tenantId column (e.g., BusinessOwner,
 * CardApplication, DebitEvent) are exposed un-scoped — tenant isolation
 * is achieved by always filtering through their parent business.
 */
export function createScopedPrisma(prisma: PrismaClient, tenantId: string) {
  return {
    // Directly tenant-scoped models
    tenant: scopedDelegate(prisma.tenant as unknown as AnyPrismaDelegate, tenantId),
    user: scopedDelegate(prisma.user as unknown as AnyPrismaDelegate, tenantId),
    business: scopedDelegate(prisma.business as unknown as AnyPrismaDelegate, tenantId),
    ledgerEvent: scopedDelegate(prisma.ledgerEvent as unknown as AnyPrismaDelegate, tenantId),
    consentRecord: scopedDelegate(prisma.consentRecord as unknown as AnyPrismaDelegate, tenantId),
    complianceCheck: scopedDelegate(prisma.complianceCheck as unknown as AnyPrismaDelegate, tenantId),
    document: scopedDelegate(prisma.document as unknown as AnyPrismaDelegate, tenantId),
    auditLog: prisma.auditLog,       // tenantId present but no relation; use raw

    // Parent-scoped via businessId — expose unscoped but document intent
    businessOwner: prisma.businessOwner,
    creditProfile: prisma.creditProfile,
    fundingRound: prisma.fundingRound,
    cardApplication: prisma.cardApplication,
    suitabilityCheck: prisma.suitabilityCheck,
    productAcknowledgment: prisma.productAcknowledgment,
    achAuthorization: prisma.achAuthorization,
    debitEvent: prisma.debitEvent,
    costCalculation: prisma.costCalculation,

    // Pass-through for transactions
    $transaction: prisma.$transaction.bind(prisma),
    $queryRaw: prisma.$queryRaw.bind(prisma),
    $executeRaw: prisma.$executeRaw.bind(prisma),

    // The raw client for escape hatches
    _raw: prisma,
    tenantId,
  };
}

export type ScopedPrismaClient = ReturnType<typeof createScopedPrisma>;

// ── Context-aware helper ──────────────────────────────────────

/**
 * Convenience wrapper: accepts a TenantContext and the global prisma client,
 * returns a fully scoped client ready to use in a service.
 */
export function prismaForContext(
  prisma: PrismaClient,
  ctx: Pick<TenantContext, 'tenantId'>,
): ScopedPrismaClient {
  return createScopedPrisma(prisma, ctx.tenantId);
}

// ── Assertion helpers ─────────────────────────────────────────

/**
 * Throws if the retrieved record's tenantId does not match the expected one.
 * Use as a belt-and-suspenders check after any raw Prisma call.
 */
export function assertTenantOwnership(
  record: { tenantId: string } | null | undefined,
  expectedTenantId: string,
  resourceName = 'resource',
): asserts record is { tenantId: string } {
  if (!record) {
    throw Object.assign(new Error(`${resourceName} not found`), { code: 'NOT_FOUND' });
  }
  if (record.tenantId !== expectedTenantId) {
    throw Object.assign(
      new Error(`Unauthorized: ${resourceName} belongs to a different tenant`),
      { code: 'FORBIDDEN' },
    );
  }
}
