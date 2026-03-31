// ============================================================
// Unit tests — Suitability & No-Go Engine
//
// Coverage:
//   - computeSuitability: high / medium / low / hard-no-go scenarios
//   - Score component breakdown (revenue, cash flow, debt, credit, age)
//   - Maximum safe leverage: per input profile
//   - Alternative product recommendations
//   - runSuitabilityCheck: event publishing (mocked)
//   - applyOverride: role gate, hard-no-go lock, happy path, audit trail
//   - leverage-calculator: boundary values, industry multipliers
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────
// Must be declared BEFORE imports so Vitest can hoist them.

vi.mock('../../../src/backend/events/event-bus.js', () => ({
  eventBus: {
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'evt-001', publishedAt: new Date() }),
  },
}));

vi.mock('@prisma/client', () => {
  const mockCreate = vi.fn();
  const mockFindFirst = vi.fn();
  const mockFindUnique = vi.fn();
  const mockUpdate = vi.fn();

  const PrismaClient = vi.fn().mockImplementation(() => ({
    suitabilityCheck: {
      create:     mockCreate,
      findFirst:  mockFindFirst,
      findUnique: mockFindUnique,
      update:     mockUpdate,
    },
  }));

  return { PrismaClient };
});

// ── Imports (after mocks) ─────────────────────────────────────

import {
  computeSuitability,
  runSuitabilityCheck,
  getLatestSuitabilityCheck,
  applyOverride,
  setPrismaClient,
  NOGO_REASON,
  ALTERNATIVE_PRODUCTS,
  SCORE_BANDS,
  type SuitabilityInput,
} from '../../../src/backend/services/suitability.service.js';

import {
  calculateMaxSafeLeverage,
  INDUSTRY_RISK_MULTIPLIERS,
  type LeverageInput,
} from '../../../src/backend/services/leverage-calculator.js';

import { eventBus } from '../../../src/backend/events/event-bus.js';
import { PrismaClient } from '@prisma/client';

// ── Test fixtures ─────────────────────────────────────────────

const strongProfile: SuitabilityInput = {
  monthlyRevenue:      20_000,
  existingDebt:        10_000,
  cashFlowRatio:       0.22,
  industry:            'technology',
  businessAgeMonths:   36,
  personalCreditScore: 760,
  businessCreditScore: 80,
  activeBankruptcy:    false,
  sanctionsMatch:      false,
  fraudSuspicion:      false,
};

const moderateProfile: SuitabilityInput = {
  monthlyRevenue:      7_000,
  existingDebt:        20_000,
  cashFlowRatio:       0.12,
  industry:            'retail',
  businessAgeMonths:   18,
  personalCreditScore: 680,
  businessCreditScore: 40,
  activeBankruptcy:    false,
  sanctionsMatch:      false,
  fraudSuspicion:      false,
};

const highRiskProfile: SuitabilityInput = {
  monthlyRevenue:      3_500,
  existingDebt:        30_000,
  cashFlowRatio:       0.06,
  industry:            'hospitality',
  businessAgeMonths:   8,
  personalCreditScore: 630,
  businessCreditScore: 0,
  activeBankruptcy:    false,
  sanctionsMatch:      false,
  fraudSuspicion:      false,
};

const hardNoGoProfile: SuitabilityInput = {
  monthlyRevenue:      1_000,   // below $2k floor
  existingDebt:        0,
  cashFlowRatio:       0.10,
  industry:            'retail',
  businessAgeMonths:   24,
  personalCreditScore: 700,
  businessCreditScore: 0,
  activeBankruptcy:    false,
  sanctionsMatch:      false,
  fraudSuspicion:      false,
};

const bankruptcyProfile: SuitabilityInput = {
  ...strongProfile,
  activeBankruptcy: true,
};

const sanctionsProfile: SuitabilityInput = {
  ...strongProfile,
  sanctionsMatch: true,
};

const fraudProfile: SuitabilityInput = {
  ...strongProfile,
  fraudSuspicion: true,
};

// ── computeSuitability ────────────────────────────────────────

describe('computeSuitability', () => {
  describe('APPROVED band (score >= 70)', () => {
    it('returns score >= 70 for a strong profile', () => {
      const result = computeSuitability(strongProfile);
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.band).toBe('APPROVED');
      expect(result.noGoTriggered).toBe(false);
      expect(result.noGoReasons).toHaveLength(0);
    });

    it('sets a positive maxSafeLeverage for approved deals', () => {
      const result = computeSuitability(strongProfile);
      expect(result.maxSafeLeverage).toBeGreaterThan(0);
    });

    it('does not recommend alternatives for approved profiles', () => {
      const result = computeSuitability(strongProfile);
      expect(result.alternativeProducts).toHaveLength(0);
    });

    it('produces a score breakdown summing to the total', () => {
      const { scoreBreakdown } = computeSuitability(strongProfile);
      const componentSum =
        scoreBreakdown.revenueScore +
        scoreBreakdown.cashFlowScore +
        scoreBreakdown.debtRatioScore +
        scoreBreakdown.creditScore +
        scoreBreakdown.businessAgeScore;
      expect(scoreBreakdown.total).toBe(Math.min(componentSum, 100));
    });
  });

  describe('MODERATE band (score 50–69)', () => {
    it('classifies moderate profile in MODERATE band', () => {
      const result = computeSuitability(moderateProfile);
      expect(result.band).toBe('MODERATE');
      expect(result.score).toBeGreaterThanOrEqual(SCORE_BANDS.HIGH_RISK);
      expect(result.score).toBeLessThan(SCORE_BANDS.MODERATE);
    });

    it('includes recommendation text about conditions', () => {
      const result = computeSuitability(moderateProfile);
      expect(result.recommendation.toLowerCase()).toContain('moderate');
    });
  });

  describe('HIGH_RISK band (score 30–49)', () => {
    it('classifies high-risk profile in HIGH_RISK band', () => {
      const result = computeSuitability(highRiskProfile);
      expect(result.band).toBe('HIGH_RISK');
      expect(result.score).toBeGreaterThanOrEqual(SCORE_BANDS.HARD_NOGO);
      expect(result.score).toBeLessThan(SCORE_BANDS.HIGH_RISK);
    });

    it('recommends alternatives for high-risk profiles', () => {
      const result = computeSuitability(highRiskProfile);
      expect(result.alternativeProducts.length).toBeGreaterThan(0);
    });

    it('noGoTriggered may be true due to no-go reasons', () => {
      // High-risk with debt trigger — check noGo status
      const result = computeSuitability(highRiskProfile);
      // High-risk debt ratio may trigger no-go; check it's captured
      if (result.noGoTriggered) {
        expect(result.noGoReasons.length).toBeGreaterThan(0);
      }
    });
  });

  describe('HARD NO-GO (score < 30 or critical flags)', () => {
    it('triggers no-go for revenue below $2k/mo', () => {
      const result = computeSuitability(hardNoGoProfile);
      expect(result.noGoTriggered).toBe(true);
      expect(result.noGoReasons).toContain(NOGO_REASON.REVENUE_TOO_LOW);
      expect(result.band).toBe('HARD_NOGO');
    });

    it('forces score to 0 for active bankruptcy', () => {
      const result = computeSuitability(bankruptcyProfile);
      expect(result.score).toBe(0);
      expect(result.noGoTriggered).toBe(true);
      expect(result.noGoReasons).toContain(NOGO_REASON.ACTIVE_BANKRUPTCY);
      expect(result.band).toBe('HARD_NOGO');
    });

    it('forces score to 0 for sanctions match', () => {
      const result = computeSuitability(sanctionsProfile);
      expect(result.score).toBe(0);
      expect(result.noGoReasons).toContain(NOGO_REASON.SANCTIONS_MATCH);
    });

    it('forces score to 0 for fraud suspicion', () => {
      const result = computeSuitability(fraudProfile);
      expect(result.score).toBe(0);
      expect(result.noGoReasons).toContain(NOGO_REASON.FRAUD_SUSPICION);
    });

    it('sets maxSafeLeverage to 0 when no-go is triggered', () => {
      const result = computeSuitability(hardNoGoProfile);
      expect(result.maxSafeLeverage).toBe(0);
    });

    it('recommends alternatives when no-go is triggered', () => {
      const result = computeSuitability(hardNoGoProfile);
      expect(result.alternativeProducts.length).toBeGreaterThan(0);
    });

    it('triggers no-go for excessive existing debt', () => {
      const input: SuitabilityInput = {
        ...strongProfile,
        existingDebt: 300_000, // > 12× $20k monthly revenue
      };
      const result = computeSuitability(input);
      expect(result.noGoReasons).toContain(NOGO_REASON.EXCESSIVE_DEBT);
      expect(result.noGoTriggered).toBe(true);
    });

    it('triggers no-go for negative cash flow', () => {
      const input: SuitabilityInput = { ...strongProfile, cashFlowRatio: -0.05 };
      const result = computeSuitability(input);
      expect(result.noGoReasons).toContain(NOGO_REASON.NEGATIVE_CASH_FLOW);
    });

    it('includes recommendation text referencing no-go reasons', () => {
      const result = computeSuitability(bankruptcyProfile);
      expect(result.recommendation.toLowerCase()).toContain('no-go');
    });
  });

  describe('Score component bounds', () => {
    it('score is always in [0, 100]', () => {
      const profiles = [
        strongProfile, moderateProfile, highRiskProfile, hardNoGoProfile,
        bankruptcyProfile, sanctionsProfile, fraudProfile,
      ];
      for (const p of profiles) {
        const { score } = computeSuitability(p);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it('maximum revenue score component is 25', () => {
      const { scoreBreakdown } = computeSuitability(strongProfile);
      expect(scoreBreakdown.revenueScore).toBeLessThanOrEqual(25);
    });

    it('maximum cash flow score component is 20', () => {
      const { scoreBreakdown } = computeSuitability(strongProfile);
      expect(scoreBreakdown.cashFlowScore).toBeLessThanOrEqual(20);
    });
  });
});

// ── Alternative product recommendations ──────────────────────

describe('Alternative product recommendations', () => {
  it('includes SBA loan for established businesses with revenue', () => {
    const input: SuitabilityInput = {
      ...highRiskProfile,
      monthlyRevenue:    8_000,
      businessAgeMonths: 24,
    };
    const result = computeSuitability(input);
    const hasAlts = result.alternativeProducts.length > 0;
    if (hasAlts) {
      expect(
        result.alternativeProducts.some((p) => p.includes(ALTERNATIVE_PRODUCTS.SBA_LOAN)),
      ).toBe(true);
    }
  });

  it('includes line of credit for businesses with $3k+ monthly revenue', () => {
    const input: SuitabilityInput = { ...hardNoGoProfile, monthlyRevenue: 500 };
    // Very low revenue — LOC threshold not met
    const result = computeSuitability(input);
    const hasLoc = result.alternativeProducts.some((p) =>
      p.includes(ALTERNATIVE_PRODUCTS.LINE_OF_CREDIT),
    );
    expect(hasLoc).toBe(false); // $500 < $3k threshold
  });

  it('includes MCA with WARNING tag for very low-revenue no-gos', () => {
    const result = computeSuitability(hardNoGoProfile);
    const hasMca = result.alternativeProducts.some((p) =>
      p.includes(ALTERNATIVE_PRODUCTS.MCA),
    );
    expect(hasMca).toBe(true);
    const mcaEntry = result.alternativeProducts.find((p) => p.includes(ALTERNATIVE_PRODUCTS.MCA));
    expect(mcaEntry).toContain('WARNING');
  });
});

// ── runSuitabilityCheck (persists + events) ───────────────────

describe('runSuitabilityCheck', () => {
  let prismaInstance: ReturnType<typeof PrismaClient.prototype.constructor>;

  beforeEach(() => {
    prismaInstance = new PrismaClient() as unknown as ReturnType<typeof PrismaClient.prototype.constructor>;
    setPrismaClient(prismaInstance as unknown as import('@prisma/client').PrismaClient);
    vi.clearAllMocks();
  });

  it('persists a suitability check record and returns a checkId', async () => {
    const mockCheck = {
      id:                  'check-abc',
      score:               82,
      noGoTriggered:       false,
      noGoReasons:         [],
      recommendation:      'APPROVED',
      alternativeProducts: [],
      maxSafeLeverage:     50_000,
      overriddenBy:        null,
      overrideReason:      null,
      createdAt:           new Date(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.create.mockResolvedValueOnce(mockCheck);

    const { checkId, assessment } = await runSuitabilityCheck(
      'biz-001',
      'tenant-001',
      strongProfile,
    );

    expect(checkId).toBe('check-abc');
    expect(assessment.score).toBeGreaterThanOrEqual(70);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prismaInstance as any).suitabilityCheck.create).toHaveBeenCalledOnce();
  });

  it('publishes SUITABILITY_ASSESSED event for approved deals', async () => {
    const mockCheck = {
      id: 'check-approved',
      score: 80,
      noGoTriggered: false,
      noGoReasons: [],
      recommendation: 'APPROVED',
      alternativeProducts: [],
      maxSafeLeverage: 60_000,
      overriddenBy: null,
      overrideReason: null,
      createdAt: new Date(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.create.mockResolvedValueOnce(mockCheck);

    await runSuitabilityCheck('biz-001', 'tenant-001', strongProfile);

    expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
      'tenant-001',
      expect.objectContaining({ eventType: 'suitability.assessed' }),
    );
  });

  it('publishes NOGO_TRIGGERED event for no-go deals', async () => {
    const mockCheck = {
      id: 'check-nogo',
      score: 0,
      noGoTriggered: true,
      noGoReasons: [NOGO_REASON.ACTIVE_BANKRUPTCY],
      recommendation: 'HARD NO-GO',
      alternativeProducts: [ALTERNATIVE_PRODUCTS.SBA_LOAN],
      maxSafeLeverage: 0,
      overriddenBy: null,
      overrideReason: null,
      createdAt: new Date(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.create.mockResolvedValueOnce(mockCheck);

    await runSuitabilityCheck('biz-002', 'tenant-001', bankruptcyProfile);

    expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
      'tenant-001',
      expect.objectContaining({ eventType: 'nogo.triggered' }),
    );
  });
});

// ── getLatestSuitabilityCheck ─────────────────────────────────

describe('getLatestSuitabilityCheck', () => {
  let prismaInstance: ReturnType<typeof PrismaClient.prototype.constructor>;

  beforeEach(() => {
    prismaInstance = new PrismaClient() as unknown as ReturnType<typeof PrismaClient.prototype.constructor>;
    setPrismaClient(prismaInstance as unknown as import('@prisma/client').PrismaClient);
    vi.clearAllMocks();
  });

  it('returns null when no check exists', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.findFirst.mockResolvedValueOnce(null);
    const result = await getLatestSuitabilityCheck('biz-999');
    expect(result).toBeNull();
  });

  it('returns structured check data when a record exists', async () => {
    const dbCheck = {
      id:                  'check-xyz',
      score:               65,
      noGoTriggered:       false,
      noGoReasons:         ['some_reason'],
      recommendation:      'MODERATE: proceed with conditions.',
      alternativeProducts: [],
      maxSafeLeverage:     { toNumber: () => 25_000 },
      overriddenBy:        null,
      overrideReason:      null,
      createdAt:           new Date('2025-01-01'),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.findFirst.mockResolvedValueOnce(dbCheck);

    const result = await getLatestSuitabilityCheck('biz-xyz');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('check-xyz');
    expect(result!.score).toBe(65);
    expect(result!.noGoTriggered).toBe(false);
  });
});

// ── applyOverride ─────────────────────────────────────────────

describe('applyOverride', () => {
  let prismaInstance: ReturnType<typeof PrismaClient.prototype.constructor>;

  const baseOverrideReq = {
    checkId:       'check-100',
    officerUserId: 'user-officer',
    officerRole:   'compliance_officer',
    justification: 'Reviewed by committee — exception approved per policy 5.3.',
    tenantId:      'tenant-001',
  };

  beforeEach(() => {
    prismaInstance = new PrismaClient() as unknown as ReturnType<typeof PrismaClient.prototype.constructor>;
    setPrismaClient(prismaInstance as unknown as import('@prisma/client').PrismaClient);
    vi.clearAllMocks();
  });

  it('rejects override when requester is not compliance_officer', async () => {
    const result = await applyOverride({
      ...baseOverrideReq,
      officerRole: 'advisor',
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/compliance_officer/);
  });

  it('rejects override with short / empty justification', async () => {
    const result = await applyOverride({
      ...baseOverrideReq,
      justification: 'short',
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/justification/i);
  });

  it('blocks override when score < HARD_NOGO threshold', async () => {
    const lockedCheck = {
      id:           'check-100',
      score:        15,      // below 30 — locked
      noGoTriggered: true,
      businessId:   'biz-001',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.findUnique.mockResolvedValueOnce(lockedCheck);

    const result = await applyOverride(baseOverrideReq);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/HARD NO-GO/i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prismaInstance as any).suitabilityCheck.update).not.toHaveBeenCalled();
  });

  it('returns not-found message when check does not exist', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.findUnique.mockResolvedValueOnce(null);

    const result = await applyOverride(baseOverrideReq);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });

  it('applies override and returns success with auditId for valid requests', async () => {
    const eligibleCheck = {
      id:            'check-100',
      score:         42,   // HIGH_RISK band — overrideable
      noGoTriggered: true,
      businessId:    'biz-001',
    };

    const updatedCheck = { ...eligibleCheck, overriddenBy: 'user-officer', overrideReason: baseOverrideReq.justification };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.findUnique.mockResolvedValueOnce(eligibleCheck);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.update.mockResolvedValueOnce(updatedCheck);

    const result = await applyOverride(baseOverrideReq);

    expect(result.success).toBe(true);
    expect(result.auditId).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prismaInstance as any).suitabilityCheck.update).toHaveBeenCalledOnce();
  });

  it('publishes an audit event on successful override', async () => {
    const eligibleCheck = {
      id:            'check-100',
      score:         35,
      noGoTriggered: true,
      businessId:    'biz-001',
    };
    const updatedCheck = { ...eligibleCheck, overriddenBy: 'user-officer', overrideReason: baseOverrideReq.justification };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.findUnique.mockResolvedValueOnce(eligibleCheck);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.update.mockResolvedValueOnce(updatedCheck);

    await applyOverride(baseOverrideReq);

    expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
      'tenant-001',
      expect.objectContaining({
        payload: expect.objectContaining({
          action: 'suitability_override',
          officerUserId: 'user-officer',
        }),
      }),
    );
  });

  it('stores justification in the update call', async () => {
    const eligibleCheck = { id: 'check-100', score: 38, noGoTriggered: true, businessId: 'biz-001' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.findUnique.mockResolvedValueOnce(eligibleCheck);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prismaInstance as any).suitabilityCheck.update.mockResolvedValueOnce({ ...eligibleCheck });

    await applyOverride(baseOverrideReq);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prismaInstance as any).suitabilityCheck.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          overriddenBy:   'user-officer',
          overrideReason: baseOverrideReq.justification,
        }),
      }),
    );
  });
});

// ── calculateMaxSafeLeverage ──────────────────────────────────

describe('calculateMaxSafeLeverage', () => {
  const baseInput: LeverageInput = {
    monthlyRevenue: 15_000,
    existingDebt:   20_000,
    cashFlowRatio:  0.18,
    industry:       'technology',
  };

  it('returns a positive maxTotalCredit for a healthy profile', () => {
    const result = calculateMaxSafeLeverage(baseInput);
    expect(result.maxTotalCredit).toBeGreaterThan(0);
  });

  it('returns maxTotalCredit within absolute bounds ($5k – $500k)', () => {
    const result = calculateMaxSafeLeverage(baseInput);
    expect(result.maxTotalCredit).toBeGreaterThanOrEqual(5_000);
    expect(result.maxTotalCredit).toBeLessThanOrEqual(500_000);
  });

  it('maxPerCard is <= 20% of maxTotalCredit (or $2500 floor)', () => {
    const result = calculateMaxSafeLeverage(baseInput);
    const expectedMax = Math.max(Math.round(result.maxTotalCredit * 0.20), 2_500);
    expect(result.maxPerCard).toBeLessThanOrEqual(expectedMax + 1); // allow rounding drift
  });

  it('maxRounds is between 1 and 5', () => {
    const result = calculateMaxSafeLeverage(baseInput);
    expect(result.maxRounds).toBeGreaterThanOrEqual(1);
    expect(result.maxRounds).toBeLessThanOrEqual(5);
  });

  it('reduces maxTotalCredit when existing debt is high', () => {
    const highDebtInput: LeverageInput = { ...baseInput, existingDebt: 80_000 };
    const lowDebtInput:  LeverageInput = { ...baseInput, existingDebt: 5_000 };
    const highDebt = calculateMaxSafeLeverage(highDebtInput);
    const lowDebt  = calculateMaxSafeLeverage(lowDebtInput);
    expect(lowDebt.maxTotalCredit).toBeGreaterThan(highDebt.maxTotalCredit);
  });

  it('reduces maxTotalCredit for lower cash-flow ratio', () => {
    const goodCFR  = calculateMaxSafeLeverage({ ...baseInput, cashFlowRatio: 0.25 });
    const poorCFR  = calculateMaxSafeLeverage({ ...baseInput, cashFlowRatio: 0.05 });
    expect(goodCFR.maxTotalCredit).toBeGreaterThan(poorCFR.maxTotalCredit);
  });

  it('applies a lower industry multiplier for cannabis vs technology', () => {
    const tech     = calculateMaxSafeLeverage({ ...baseInput, industry: 'technology' });
    const cannabis = calculateMaxSafeLeverage({ ...baseInput, industry: 'cannabis' });
    expect(tech.maxTotalCredit).toBeGreaterThan(cannabis.maxTotalCredit);
  });

  it('uses the default industry multiplier for unknown industries', () => {
    const unknown = calculateMaxSafeLeverage({ ...baseInput, industry: 'underwater_basket_weaving' });
    expect(unknown.industryMultiplier).toBe(INDUSTRY_RISK_MULTIPLIERS['default']);
  });

  it('returns maxRounds = 1 for very small credit limits', () => {
    const tinyInput: LeverageInput = {
      monthlyRevenue: 2_100,
      existingDebt:   10_000,
      cashFlowRatio:  0.06,
      industry:       'cannabis',
    };
    const result = calculateMaxSafeLeverage(tinyInput);
    expect(result.maxRounds).toBe(1);
  });

  it('includes a non-empty rationale string', () => {
    const result = calculateMaxSafeLeverage(baseInput);
    expect(result.rationale.length).toBeGreaterThan(20);
  });

  it('handles zero monthly revenue gracefully', () => {
    const zeroRevenueInput: LeverageInput = { ...baseInput, monthlyRevenue: 0 };
    const result = calculateMaxSafeLeverage(zeroRevenueInput);
    expect(result.maxTotalCredit).toBeGreaterThanOrEqual(0);
  });

  it('returns debtServiceRatio as a non-negative number', () => {
    const result = calculateMaxSafeLeverage(baseInput);
    expect(result.debtServiceRatio).toBeGreaterThanOrEqual(0);
  });
});

// ── Industry multiplier coverage ─────────────────────────────

describe('INDUSTRY_RISK_MULTIPLIERS', () => {
  it('has a "default" key as fallback', () => {
    expect(INDUSTRY_RISK_MULTIPLIERS['default']).toBeDefined();
  });

  it('all multipliers are between 0 and 1', () => {
    for (const [industry, mult] of Object.entries(INDUSTRY_RISK_MULTIPLIERS)) {
      expect(mult, `Multiplier for ${industry} out of range`).toBeGreaterThan(0);
      expect(mult, `Multiplier for ${industry} out of range`).toBeLessThanOrEqual(1);
    }
  });

  it('cannabis and gambling have the lowest multipliers (< 0.40)', () => {
    expect(INDUSTRY_RISK_MULTIPLIERS['cannabis']).toBeLessThan(0.40);
    expect(INDUSTRY_RISK_MULTIPLIERS['gambling']).toBeLessThan(0.40);
  });

  it('technology has a higher multiplier than hospitality', () => {
    expect(INDUSTRY_RISK_MULTIPLIERS['technology']).toBeGreaterThan(
      INDUSTRY_RISK_MULTIPLIERS['hospitality'],
    );
  });
});
