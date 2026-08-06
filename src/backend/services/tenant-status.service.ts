// ============================================================
// CapitalForge — is this tenant still allowed in?
//
// `Tenant.isActive` existed and was read by exactly one place: `register`. So
// suspending a tenant blocked new sign-ups and nothing else — existing
// sessions continued, existing users still logged in, every request still
// passed. The suspend endpoint meanwhile answered 200 with a `suspendedAt`
// timestamp and wrote nothing at all.
//
// Enforcement now happens at three points, and it needs all three:
//
//   login           — otherwise a suspended tenant's users simply sign in
//   token refresh   — otherwise a session outlives the suspension by the
//                     refresh token's lifetime, which is seven days
//   tenantMiddleware— otherwise an access token issued before the suspension
//                     keeps working until it expires
//
// Any two of the three leaves a hole big enough to drive a session through.
//
// ── The design decision, stated rather than drifted into
//
// `tenantMiddleware` runs on every authenticated request and performed **zero
// database reads**: a pure JWT decode. That is a real property, and this
// change either keeps it, spends it, or bounds it. Three options were
// available:
//
//   1. Query the database in the middleware.
//      Correct immediately, and a round trip on every authenticated request.
//
//   2. Cache the answer with a short TTL.
//      One query per tenant per TTL. A suspension takes effect within the TTL.
//
//   3. Put it in the JWT and refresh at login.
//      Free, and a suspension does not bite until the access token expires —
//      up to fifteen minutes, during which the tenant carries on working.
//
// **Option 2, with a 30-second TTL.** Option 3 was rejected: fifteen minutes of
// continued access after an operator suspends a tenant is the kind of gap the
// suspension exists to close. Option 1 is the safest and would put a query on
// the hottest path in the application for a value that changes approximately
// never.
//
// The cache is per-process and invalidated locally on suspend/unsuspend, so
// the instance handling the change is correct immediately and the others catch
// up within the TTL. **A suspension is therefore effective within 30 seconds,
// not instantly**, and that is the bound this design accepts. If it ever needs
// to be instant, the answer is a shared invalidation channel, not a longer
// comment.
// ============================================================

import type { PrismaClient } from '@prisma/client';
import logger from '../config/logger.js';

/** How long a cached answer is trusted. See the note above. */
export const TENANT_STATUS_TTL_MS = 30_000;

interface CacheEntry {
  active: boolean;
  readAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test seam, and what `suspend`/`unsuspend` call on the serving instance. */
export function invalidateTenantStatus(tenantId?: string): void {
  if (tenantId === undefined) cache.clear();
  else cache.delete(tenantId);
}

export function createTenantStatusService(prisma: PrismaClient) {
  /**
   * Whether the tenant may be used at all.
   *
   * A missing tenant is inactive, not an error: a token naming a tenant that
   * no longer exists should stop working, and returning `true` on a lookup
   * miss is how a fail-open creeps in.
   */
  async function isTenantActive(tenantId: string, now = Date.now()): Promise<boolean> {
    const hit = cache.get(tenantId);
    if (hit !== undefined && now - hit.readAt < TENANT_STATUS_TTL_MS) {
      return hit.active;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { isActive: true },
    });

    const active = tenant?.isActive === true;
    cache.set(tenantId, { active, readAt: now });
    return active;
  }

  async function suspend(
    tenantId: string,
    suspendedBy: string,
    reason: string | null,
  ): Promise<void> {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        isActive: false,
        suspendedAt: new Date(),
        suspendedBy,
        suspendedReason: reason,
      },
    });

    invalidateTenantStatus(tenantId);
    logger.warn('[tenant] Suspended', { tenantId, suspendedBy, reason });
  }

  /**
   * Lift a suspension.
   *
   * A one-way access control is its own defect — and here it was the thing
   * that hid the original mock, because nobody could try to undo a suspension
   * and discover that suspending had done nothing.
   *
   * `suspendedAt` and friends are cleared: they describe the current
   * suspension, not a history. A history belongs in the audit log.
   */
  async function unsuspend(tenantId: string, by: string): Promise<void> {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        isActive: true,
        suspendedAt: null,
        suspendedBy: null,
        suspendedReason: null,
      },
    });

    invalidateTenantStatus(tenantId);
    logger.warn('[tenant] Reinstated', { tenantId, by });
  }

  return { isTenantActive, suspend, unsuspend };
}

export type TenantStatusService = ReturnType<typeof createTenantStatusService>;
