// ============================================================
// Portfolio health over an empty portfolio — a third state, not an F
//
// Every one of the six dimensions is a ratio over the number of businesses on
// file. Each percentage initialises to 0 and its division is guarded by
// `if (totalBusinesses > 0)`, so a tenant with no clients fell straight through
// all six guards with every percentage still at its initialiser — producing a
// score of 0 and a grade of F.
//
// "No clients yet" is not the bottom of the scale. It is off the scale, and it
// was the first thing a new tenant saw about their own portfolio.
//
// This is the same collapse `specification.md` §5.2 records in the other
// direction — "a compliance score of 100 for a tenant with no checks, the
// strongest claim the endpoint can make, derived from no evidence at all."
// Sign flipped, same defect.
// ============================================================

import { describe, it, expect, vi } from 'vitest';

import { calculatePortfolioHealth } from '../../../src/backend/services/portfolio-health.js';
import type { PrismaClient } from '@prisma/client';

/** Every model the calculation reads, all empty. */
function emptyPrisma(): PrismaClient {
  const findMany = vi.fn().mockResolvedValue([]);
  return {
    business: { findMany },
    consentRecord: { findMany },
    productAcknowledgment: { findMany },
    complianceCheck: { findMany },
    fundingRound: { findMany },
    cardApplication: { findMany },
    paymentSchedule: { findMany },
  } as unknown as PrismaClient;
}

/** One business, so the assessed path still runs. */
function onePrisma(): PrismaClient {
  const p = emptyPrisma() as unknown as Record<string, { findMany: ReturnType<typeof vi.fn> }>;
  p['business']!.findMany = vi.fn().mockResolvedValue([{ id: 'biz-1' }]);
  return p as unknown as PrismaClient;
}

describe('calculatePortfolioHealth with no clients on file', () => {
  it('reports that it was not assessed rather than scoring zero', async () => {
    const result = await calculatePortfolioHealth(emptyPrisma(), 'tenant-1');

    expect(result.assessed).toBe(false);
    expect(result.score).toBeNull();
    expect(result.grade).toBeNull();

    // The two that would have been rendered. A zero here is a claim about the
    // portfolio; a null is a statement that there is no portfolio to claim
    // anything about.
    expect(result.score).not.toBe(0);
    expect(result.grade).not.toBe('F');
  });

  it('says why, and reports the denominator', async () => {
    const result = await calculatePortfolioHealth(emptyPrisma(), 'tenant-1');

    expect(result.businessesAssessed).toBe(0);
    expect(result.notAssessedReason).toMatch(/no clients on file/i);
  });

  it('offers no trend and no action items, rather than a flat zero-delta trend', async () => {
    const result = await calculatePortfolioHealth(emptyPrisma(), 'tenant-1');

    // "0 pts vs last month" is a comparison between two things that do not
    // exist. The widget renders the trend only when it is present.
    expect(result.trend).toBeNull();
    expect(result.actionItems).toEqual([]);
    expect(result.components).toEqual([]);
  });

  it('still scores a portfolio that has one business in it', async () => {
    // The guard must be "nothing to divide by", not "the numbers are bad".
    const result = await calculatePortfolioHealth(onePrisma(), 'tenant-1');

    expect(result.assessed).toBe(true);
    expect(result.businessesAssessed).toBe(1);
    expect(typeof result.score).toBe('number');
    expect(result.grade).not.toBeNull();
    expect(result.notAssessedReason).toBeNull();
  });
});
