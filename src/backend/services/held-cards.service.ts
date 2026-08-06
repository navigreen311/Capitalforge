// ============================================================
// CapitalForge — cards a client already holds
//
// Chase 5/24 was counted from `CardApplication`: applications made *through
// CapitalForge*. Nothing recorded a card a client arrived with, so a client who
// opened four bank cards before onboarding counted as zero and the panel read
// "5 of 5 slots open".
//
// The error ran one way — the count could only be too low, which reads as
// headroom, and the auto-decline is the first anyone hears of the four cards.
//
// This is an attestation, not a bureau pull. That is a real limitation and it
// is recorded per row rather than assumed away: the 5/24 answer is only ever as
// good as the typing behind it, and a figure whose provenance is recorded can
// be weighed while one that merely appears cannot.
// ============================================================

import type { PrismaClient } from '@prisma/client';
import { isCreditUnionIssuerName } from '../../shared/constants/issuers.js';
import logger from '../config/logger.js';

/** The subset of a held card the 5/24 arithmetic needs. */
export interface CountableHeldCard {
  issuer: string;
  /** Null when nobody recorded when it was opened. */
  openedAt: Date | null;
}

export interface FiveTwentyFourTally {
  /** Bank cards with an opening date inside the window. */
  counted: number;
  /**
   * Bank cards that exist but cannot be placed in time.
   *
   * Not counted and not ignored. They are why the answer is "at most N slots
   * open" rather than "N" — the distinction the stacking optimizer already
   * draws and the issuer-rules path did not.
   */
  unplaceable: number;
  /**
   * Credit-union cards, excluded because they do not drive 5/24.
   *
   * Reported rather than silently subtracted: a smaller number is
   * indistinguishable from cards having been missed.
   */
  creditUnionExcluded: number;
}

/**
 * How held cards bear on 5/24.
 *
 * Pure, so the rule can be tested without a database — and because this is the
 * arithmetic the caveat on the eligibility result describes, the two must not
 * be able to drift.
 *
 * A **closed** card still counts if it was opened inside the window: 5/24
 * counts openings, not current holdings. That is the rule most often got wrong
 * by intuition, so it is asserted rather than assumed.
 */
export function tallyHeldCardsForFiveTwentyFour(
  cards: readonly CountableHeldCard[],
  windowStart: Date,
  now: Date = new Date(),
): FiveTwentyFourTally {
  let counted = 0;
  let unplaceable = 0;
  let creditUnionExcluded = 0;

  for (const card of cards) {
    if (isCreditUnionIssuerName(card.issuer)) {
      creditUnionExcluded += 1;
      continue;
    }

    if (card.openedAt === null) {
      unplaceable += 1;
      continue;
    }

    // A future-dated opening is data entry, not a card. Counting it would
    // spend a 5/24 slot on something that has not happened.
    if (card.openedAt > now) continue;

    if (card.openedAt > windowStart) counted += 1;
  }

  return { counted, unplaceable, creditUnionExcluded };
}

export function createHeldCardsService(prisma: PrismaClient) {
  async function listForBusiness(businessId: string, tenantId: string) {
    return prisma.heldCard.findMany({
      where: { businessId, tenantId },
      orderBy: [{ openedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Record a card the client says they hold.
   *
   * `attestedBy` is required rather than defaulted. An attestation with no
   * attestor is the same shape as a measurement, and this is not one.
   */
  async function record(input: {
    tenantId: string;
    businessId: string;
    issuer: string;
    productName?: string | null;
    openedAt?: Date | null;
    closedAt?: Date | null;
    creditLimit?: number | null;
    attestedBy: string;
  }) {
    const card = await prisma.heldCard.create({
      data: {
        tenantId: input.tenantId,
        businessId: input.businessId,
        issuer: input.issuer,
        productName: input.productName ?? null,
        openedAt: input.openedAt ?? null,
        closedAt: input.closedAt ?? null,
        creditLimit: input.creditLimit ?? null,
        attestedBy: input.attestedBy,
        source: 'advisor_attested',
      },
    });

    logger.info('[held-cards] Recorded', {
      businessId: input.businessId,
      issuer: input.issuer,
      placeable: input.openedAt != null,
    });

    return card;
  }

  async function remove(id: string, tenantId: string): Promise<boolean> {
    const { count } = await prisma.heldCard.deleteMany({ where: { id, tenantId } });
    return count === 1;
  }

  /** The tally for one business, read from the record. */
  async function tallyForBusiness(
    businessId: string,
    tenantId: string,
    windowStart: Date,
    now: Date = new Date(),
  ): Promise<FiveTwentyFourTally> {
    const cards = await prisma.heldCard.findMany({
      where: { businessId, tenantId },
      select: { issuer: true, openedAt: true },
    });
    return tallyHeldCardsForFiveTwentyFour(cards, windowStart, now);
  }

  return { listForBusiness, record, remove, tallyForBusiness };
}

export type HeldCardsService = ReturnType<typeof createHeldCardsService>;
