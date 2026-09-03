// ============================================================
// A fundability score missing its credit component is not a score
//
//   `scoreCreditScore` returned `{ points: 0, label: 'no data' }` when nobody
//   had pulled the client's credit. On a component worth 25 of 100 that is a
//   different measurement wearing the same scale: a client with no credit on
//   file and a client with a 580 FICO were 25 points apart in reality and 0
//   apart in the function, and the first also read worse than they were.
//
//   And the recompute path threw the data away. `refreshReadinessScore` and
//   `updateBusiness` rebuilt the scorer's input from five business columns
//   with no credit fields in it at all, so a real score recorded by `addOwner`
//   was discarded on the next profile edit — 78 became 53, silently, in the
//   same column.
//
//   These two are one defect. Returning null for absent credit does nothing if
//   the path that recomputes the score is what makes the credit absent.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@backend/events/event-bus.js', () => ({
  eventBus: {
    publish: vi.fn().mockResolvedValue(undefined),
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'e1', publishedAt: new Date() }),
  },
}));

vi.mock('@backend/config/database.js', () => ({ prisma: {} }));

import {
  calculateFundingReadiness,
  type FundingReadinessInput,
} from '../../../src/backend/services/funding-readiness.js';
import {
  setPrismaClient,
  refreshReadinessScore,
  updateBusiness,
  addOwner,
} from '../../../src/backend/services/onboarding.service.js';

// A business with everything EXCEPT credit. Every other component scores.
const NO_CREDIT: FundingReadinessInput = {
  annualRevenue:       800_000,
  dateOfFormation:     new Date(Date.now() - 5 * 365.25 * 24 * 60 * 60 * 1000).toISOString(),
  industry:            'technology consulting',
  existingDebtBalance: 0,
};

describe('a score with no credit on record', () => {
  it('is null, not zero, and not the sum of the other four components', () => {
    const result = calculateFundingReadiness(NO_CREDIT);

    expect(result.score).toBeNull();
    // The other four sum to 70+ on this input. Returning that number would be
    // a score out of 75 presented on a 0–100 scale and routed against
    // thresholds written for the full one.
    expect(result.score).not.toBe(0);
  });

  it('names why, in the vocabulary the credit read endpoints already use', () => {
    // `no_credit_profile_on_record` is the basis GET /credit/recommendations
    // returns for the same absence. One absence, one name.
    expect(calculateFundingReadiness(NO_CREDIT).notAssessedReason)
      .toBe('no_credit_profile_on_record');
  });

  it('has no track, because there is no score to route', () => {
    const result = calculateFundingReadiness(NO_CREDIT);

    expect(result.track).toBeNull();
    expect(result.trackLabel).toBe('Not assessed');
    // The summary must not read as a verdict about the client.
    expect(result.summary).toContain('not been assessed');
    expect(result.summary).not.toContain('Alternative Products');
  });

  it('reports the credit component as not assessed rather than as zero points', () => {
    expect(calculateFundingReadiness(NO_CREDIT).componentScores.creditScore).toBeNull();
  });

  it('still reports the gap, at high impact', () => {
    const gap = calculateFundingReadiness(NO_CREDIT).gaps
      .find((g) => g.dimension === 'Personal Credit Score');

    expect(gap).toBeDefined();
    expect(gap!.impact).toBe('high');
    expect(gap!.currentValue).toBe('No credit profile on record');
  });

  it('is a score again as soon as either credit type is on record', () => {
    const personal = calculateFundingReadiness({ ...NO_CREDIT, personalCreditScore: 760 });
    const business = calculateFundingReadiness({ ...NO_CREDIT, businessCreditScore: 200 });

    expect(personal.score).not.toBeNull();
    expect(personal.notAssessedReason).toBeNull();
    expect(personal.track).toBe('stacking');

    expect(business.score).not.toBeNull();
    expect(business.componentScores.creditScore).not.toBeNull();
  });

  it('separates a real low score from an unassessed one', () => {
    // The case the null exists for: 550 is a real, poor score. Absent is not.
    const poor = calculateFundingReadiness({ ...NO_CREDIT, personalCreditScore: 550 });

    expect(poor.score).not.toBeNull();
    expect(poor.componentScores.creditScore).toBe(4);
    expect(poor.notAssessedReason).toBeNull();
  });
});

// ── The recompute paths ───────────────────────────────────────

const businessFindFirst = vi.fn();
const businessUpdate = vi.fn();
const creditFindFirst = vi.fn();
const ownerCreate = vi.fn();

const TENANT = 'tenant-1';
const BUSINESS = 'biz-1';

/** A business whose five non-credit columns score well on their own. */
const BUSINESS_ROW = {
  id: BUSINESS,
  tenantId: TENANT,
  annualRevenue: 800_000,
  monthlyRevenue: null,
  dateOfFormation: new Date(Date.now() - 5 * 365.25 * 24 * 60 * 60 * 1000),
  mcc: null,
  industry: 'technology consulting',
};

/** The latest pull of each type, as `creditInputsOnRecord` reads them. */
function creditOnRecord(personal: number | null, business: number | null) {
  creditFindFirst.mockImplementation((args: { where: { profileType: string } }) =>
    Promise.resolve(
      args.where.profileType === 'personal'
        ? (personal === null ? null : { score: personal })
        : (business === null ? null : { score: business }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  businessFindFirst.mockResolvedValue(BUSINESS_ROW);
  businessUpdate.mockResolvedValue({ ...BUSINESS_ROW });
  ownerCreate.mockResolvedValue({ id: 'owner-1' });
  creditOnRecord(null, null);

  setPrismaClient({
    business: { findFirst: businessFindFirst, update: businessUpdate },
    creditProfile: { findFirst: creditFindFirst },
    businessOwner: { create: ownerCreate },
  } as never);
});

/** The score the recompute wrote to the column. */
function writtenScore(): number | null {
  const call = businessUpdate.mock.calls[0] as [{ data: { fundingReadinessScore: number | null } }];
  return call[0].data.fundingReadinessScore;
}

describe('refreshReadinessScore reads the credit that exists', () => {
  it('does not recompute without the credit component', async () => {
    // The whole defect in one assertion: a 762 FICO is on record, and the
    // refresh used to build its input from revenue, formation date, MCC and
    // industry only — so it scored the client as having no credit at all.
    creditOnRecord(762, null);

    const result = await refreshReadinessScore(TENANT, BUSINESS);

    expect(result.componentScores.creditScore).toBe(25);
    expect(result.score).toBe(writtenScore());
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('picks up a business credit pull when there is no personal one', async () => {
    creditOnRecord(null, 250);

    const result = await refreshReadinessScore(TENANT, BUSINESS);

    expect(result.componentScores.creditScore).not.toBeNull();
    expect(result.notAssessedReason).toBeNull();
  });

  it('reads the latest pull of each type', async () => {
    creditOnRecord(700, 200);
    await refreshReadinessScore(TENANT, BUSINESS);

    for (const [args] of creditFindFirst.mock.calls as [
      { where: Record<string, unknown>; orderBy: Record<string, unknown> },
    ][]) {
      // Scoped through the relation as well as by id. This reads bureau data,
      // and every caller verifying the business first is a claim about callers
      // rather than about this query.
      expect(args.where).toMatchObject({
        businessId: BUSINESS,
        business: { tenantId: TENANT },
      });
      expect(args.orderBy).toEqual({ pulledAt: 'desc' });
    }
  });

  it('writes null when nothing has been pulled', async () => {
    const result = await refreshReadinessScore(TENANT, BUSINESS);

    expect(result.score).toBeNull();
    expect(writtenScore()).toBeNull();
  });

  it('still lets an explicit override win', async () => {
    // The override is how a caller scores against a pull that is not persisted
    // yet. It must not be shadowed by what is on record.
    creditOnRecord(550, null);

    const result = await refreshReadinessScore(TENANT, BUSINESS, { personalCreditScore: 780 });

    expect(result.componentScores.creditScore).toBe(25);
  });
});

describe('updateBusiness does not discard credit when a profile field changes', () => {
  it('keeps the credit component across a revenue edit', async () => {
    // The 78-becomes-53 case. Editing revenue recomputed the score with no
    // credit in the input, so the credit component silently went to zero.
    creditOnRecord(762, null);

    await updateBusiness(TENANT, BUSINESS, { annualRevenue: 900_000 });

    const [{ data }] = businessUpdate.mock.calls[0] as [
      { data: { fundingReadinessScore?: number | null } },
    ];
    expect(data.fundingReadinessScore).toBeGreaterThanOrEqual(70);
  });

  it('writes a null score for a client with no credit on record', async () => {
    await updateBusiness(TENANT, BUSINESS, { annualRevenue: 900_000 });

    const [{ data }] = businessUpdate.mock.calls[0] as [
      { data: { fundingReadinessScore?: number | null } },
    ];
    expect(data.fundingReadinessScore).toBeNull();
  });

  it('does not touch the score when no readiness-relevant field changes', async () => {
    await updateBusiness(TENANT, BUSINESS, { legalName: 'New Name' });

    const [{ data }] = businessUpdate.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data).not.toHaveProperty('fundingReadinessScore');
    expect(creditFindFirst).not.toHaveBeenCalled();
  });
});

describe('addOwner combines the supplied score with what is on record', () => {
  it('takes the business credit pull it used to ignore', async () => {
    creditOnRecord(null, 280);

    const { updatedReadiness } = await addOwner(
      TENANT, BUSINESS,
      { firstName: 'A', lastName: 'B', ownershipPercent: 100, isBeneficialOwner: true } as never,
      640,
    );

    // 640 personal scores 13; a 280 SBSS normalises above it and scores more.
    // Passing the personal score alone would have scored 13.
    expect(updatedReadiness!.componentScores.creditScore).toBeGreaterThan(13);
  });

  it('lets the supplied personal score win over an older pull', async () => {
    creditOnRecord(600, null);

    const { updatedReadiness } = await addOwner(
      TENANT, BUSINESS,
      { firstName: 'A', lastName: 'B', ownershipPercent: 100, isBeneficialOwner: true } as never,
      760,
    );

    expect(updatedReadiness!.componentScores.creditScore).toBe(25);
  });
});
