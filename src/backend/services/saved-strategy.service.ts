// ============================================================
// CapitalForge — saved optimizer strategies
//
// A strategy is a **snapshot of a recommendation made at a moment**, not live
// data. Everything here follows from that.
//
// ── The four decisions this needed, and how they went
//
// **Saving appends; it does not replace.** One strategy per client would mean
// the second save destroys the record of what was discussed at the first. The
// numbers an advisor took a client through are exactly the thing that has to
// survive, so this keeps a history and the list view is the cost.
//
// **Anyone in the tenant with write access can save**, and `createdBy` records
// which of them did. Restricting to "the advisor on the deal" needs a notion of
// deal ownership this system does not have, and inventing one here would put a
// second, weaker answer next to the RBAC that already exists.
//
// **A saved strategy never expires and is never deleted.** `OptimizerResult`
// carries `expiresAt` because a live recommendation goes stale — the card
// products, the client's file and the issuer rules all move. A *record* of a
// recommendation does not go stale; it becomes historical, which is a
// different thing. Callers get `createdAt` and can say "planned in March"
// rather than being handed a plan that quietly presents itself as current.
//
// **A round links to the strategy it was planned from**, on the round rather
// than on the strategy — see the schema comment. Rounds created from the
// Funding Rounds page carry null, which is honest: not every round comes from
// a plan.
// ============================================================

import type { PrismaClient, Prisma } from '@prisma/client';

/** What the optimizer produced, as it was returned. */
export interface StrategyPlanInput {
  totalEstimatedCredit?: number | null;
  recommendations?: unknown[];
  cardCount?: number | null;
  prioritizationMode?: string | null;
  /**
   * The optimizer's provenance block. A record keyed by input name, not a
   * list — and it already carries its own `hasAssumedDefaults`.
   */
  inputProvenance?: { hasAssumedDefaults?: boolean; assumedDefaults?: string[] } | null;
  [key: string]: unknown;
}

export interface SaveStrategyInput {
  tenantId: string;
  businessId: string;
  plan: StrategyPlanInput;
  createdBy?: string | null;
}

/**
 * Whether any input behind this plan was assumed rather than observed.
 *
 * Denormalised onto the row so a list can flag estimate-only plans without
 * parsing every blob — load-bearing rather than cosmetic, because a list that
 * cannot tell a plan built from a credit pull from one built from constants
 * presents both as the same kind of claim.
 *
 * **Reads the optimizer's own flag rather than re-deriving it.** The first
 * version of this scanned `inputProvenance` for entries with
 * `source === 'assumed_default'`, which was wrong twice over: the block is a
 * record keyed by input name, not a list — so the scan would have found
 * nothing and reported every plan as fully observed — and it already publishes
 * `hasAssumedDefaults`. A second implementation of a rule is how a checker
 * drifts from the thing it checks; this codebase has the scar.
 *
 * Falls back to the `assumedDefaults` label list only when the flag is absent,
 * which covers a plan shape that predates it.
 */
export function planHasAssumedDefaults(plan: StrategyPlanInput): boolean {
  const provenance = plan.inputProvenance;
  if (!provenance) return false;
  if (typeof provenance.hasAssumedDefaults === 'boolean') {
    return provenance.hasAssumedDefaults;
  }
  return Array.isArray(provenance.assumedDefaults) && provenance.assumedDefaults.length > 0;
}

/**
 * Cards recommended.
 *
 * Prefers the plan's own `cardCount` and falls back to the length of
 * `recommendations`. Those can differ — `recommendations` has held cards that
 * were considered and excluded — so taking the length unconditionally would
 * denormalise a different number from the one the plan reports.
 */
export function planCardCount(plan: StrategyPlanInput): number {
  if (typeof plan.cardCount === 'number') return plan.cardCount;
  return Array.isArray(plan.recommendations) ? plan.recommendations.length : 0;
}

export function createSavedStrategyService(prisma: PrismaClient) {
  return {
    /** Append a strategy to a client's history. */
    async save(input: SaveStrategyInput) {
      const { plan } = input;
      return prisma.savedStrategy.create({
        data: {
          tenantId: input.tenantId,
          businessId: input.businessId,
          // Stored whole. Narrowing to the fields understood today would make
          // a plan unreadable the moment the plan shape changes.
          plan: plan as unknown as Prisma.InputJsonValue,
          totalEstimatedCredit:
            plan.totalEstimatedCredit == null ? null : plan.totalEstimatedCredit,
          cardCount: planCardCount(plan),
          prioritizationMode: plan.prioritizationMode ?? 'unspecified',
          hasAssumedDefaults: planHasAssumedDefaults(plan),
          createdBy: input.createdBy ?? null,
        },
      });
    },

    /** A client's saved strategies, newest first. */
    async listForBusiness(businessId: string, tenantId: string) {
      return prisma.savedStrategy.findMany({
        where: { businessId, tenantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          createdBy: true,
          totalEstimatedCredit: true,
          cardCount: true,
          prioritizationMode: true,
          hasAssumedDefaults: true,
        },
      });
    },

    /** One strategy in full, scoped to its tenant. */
    async getById(id: string, tenantId: string) {
      return prisma.savedStrategy.findFirst({ where: { id, tenantId } });
    },
  };
}

export type SavedStrategyService = ReturnType<typeof createSavedStrategyService>;
