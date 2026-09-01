// ============================================================
// CapitalForge — Business ↔ tenant ownership
//
// One predicate, because there were two ways to get this wrong and both
// happened.
//
//   1. Not checking at all. `businessId` arrives in a path parameter and the
//      tenant arrives in a verified JWT. Taking the tenant from the token is
//      necessary and not sufficient: nothing tied the two together, so a caller
//      could write a row under its own tenantId against another tenant's
//      business, and the FK on Business would happily accept it.
//
//   2. Checking in one query and not the one beside it. `application_submit`
//      read consentRecord with a tenantId filter and productAcknowledgment
//      without one, three lines apart.
//
// Returning a boolean rather than throwing, because the callers do not agree on
// how to fail: some throw `notFound` into an error middleware, some write the
// response directly. A helper that picks one forces the other to be rewritten
// around it, which is how the second copy gets written.
// ============================================================

import type { PrismaClient } from '@prisma/client';

/**
 * Whether `businessId` exists AND belongs to `tenantId`.
 *
 * The two questions are answered together on purpose. Splitting them tempts a
 * caller into reporting "no such business" and "not yours" differently, which
 * tells an unauthorised caller which business IDs are real.
 */
export async function businessBelongsToTenant(
  prisma: PrismaClient,
  businessId: string,
  tenantId: string,
): Promise<boolean> {
  if (!businessId?.trim() || !tenantId?.trim()) return false;

  const row = await prisma.business.findFirst({
    where: { id: businessId, tenantId },
    select: { id: true },
  });
  return row !== null;
}
