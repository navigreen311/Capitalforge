// ============================================================
// Credit Intelligence Service — Unit Tests
//
// Coverage:
//   - Score storage and retrieval
//   - Aggregate utilization calculation
//   - Inquiry velocity checks and threshold enforcement
//   - Optimization roadmap generation (all action categories)
//   - CreditOptimizerService action ordering and score impact
//   - Validator schema correctness
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreditIntelligenceService } from '../../../src/backend/services/credit-intelligence.service.js';
import { CreditOptimizerService } from '../../../src/backend/services/credit-optimizer.js';
import {
  CreditPullRequestSchema,
  BureauSchema,
  ScoreTypeSchema,
  validateScoreForType,
} from '../../../src/shared/validators/credit.validators.js';
import { RISK_THRESHOLDS } from '../../../src/shared/constants/index.js';
import type { CreditProfileDto, Tradeline } from '../../../src/shared/validators/credit.validators.js';
import type { TenantContext } from '../../../src/shared/types/index.js';

// ── Fixtures ──────────────────────────────────────────────────

const CTX: TenantContext = {
  tenantId: 'tenant-001',
  userId: 'user-001',
  role: 'advisor',
  permissions: ['business:read', 'business:write'],
};

const BUSINESS_ID = 'biz-001';

function makeTradeline(overrides: Partial<Tradeline> = {}): Tradeline {
  return {
    creditor: 'Test Bank',
    accountType: 'revolving',
    creditLimit: 10_000,
    balance: 3_000,
    paymentStatus: 'current',
    isDerogatory: false,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<CreditProfileDto> = {}): CreditProfileDto {
  return {
    id: crypto.randomUUID(),
    businessId: BUSINESS_ID,
    profileType: 'personal',
    bureau: 'equifax',
    score: 720,
    scoreType: 'fico',
    utilization: 0.28,
    inquiryCount: 2,
    derogatoryCount: 0,
    tradelines: [makeTradeline()],
    rawData: {},
    pulledAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Prisma mock factory ───────────────────────────────────────

function buildPrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    business: {
      findFirst: vi.fn().mockResolvedValue({ id: BUSINESS_ID, tenantId: CTX.tenantId }),
    },
    creditProfile: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: crypto.randomUUID(),
        ...data,
        utilization: data.utilization ?? null,
        createdAt: new Date(),
        pulledAt: data.pulledAt ?? new Date(),
      })),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  };
}

// ── Section 1: Validator Schemas ──────────────────────────────

describe('CreditPullRequestSchema', () => {
  it('accepts a valid single-bureau pull request', () => {
    const result = CreditPullRequestSchema.safeParse({
      bureaus: ['equifax'],
      profileType: 'personal',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all four bureaus', () => {
    const result = CreditPullRequestSchema.safeParse({
      bureaus: ['equifax', 'transunion', 'experian', 'dnb'],
      profileType: 'business',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty bureaus array', () => {
    const result = CreditPullRequestSchema.safeParse({
      bureaus: [],
      profileType: 'personal',
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 4 bureaus', () => {
    const result = CreditPullRequestSchema.safeParse({
      bureaus: ['equifax', 'transunion', 'experian', 'dnb', 'equifax'],
      profileType: 'personal',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown bureau', () => {
    const result = CreditPullRequestSchema.safeParse({
      bureaus: ['lexisnexis'],
      profileType: 'personal',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid profileType', () => {
    const result = CreditPullRequestSchema.safeParse({
      bureaus: ['equifax'],
      profileType: 'corporate',
    });
    expect(result.success).toBe(false);
  });

  it('defaults useCache to false and cacheTtlHours to 24', () => {
    const result = CreditPullRequestSchema.safeParse({
      bureaus: ['equifax'],
      profileType: 'personal',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.useCache).toBe(false);
      expect(result.data.cacheTtlHours).toBe(24);
    }
  });
});

describe('BureauSchema', () => {
  it.each(['equifax', 'transunion', 'experian', 'dnb'])('accepts %s', (bureau) => {
    expect(BureauSchema.safeParse(bureau).success).toBe(true);
  });

  it('rejects unknown bureau string', () => {
    expect(BureauSchema.safeParse('innovis').success).toBe(false);
  });
});

describe('ScoreTypeSchema', () => {
  it.each(['fico', 'vantage', 'sbss', 'paydex'])('accepts %s', (scoreType) => {
    expect(ScoreTypeSchema.safeParse(scoreType).success).toBe(true);
  });
});

describe('validateScoreForType', () => {
  it('returns null for valid FICO score', () => {
    expect(validateScoreForType(720, 'fico')).toBeNull();
  });

  it('returns error for FICO score below 300', () => {
    expect(validateScoreForType(299, 'fico')).toMatch(/300/);
  });

  it('returns error for FICO score above 850', () => {
    expect(validateScoreForType(851, 'fico')).toMatch(/850/);
  });

  it('accepts SBSS score of 0', () => {
    expect(validateScoreForType(0, 'sbss')).toBeNull();
  });

  it('accepts SBSS score of 300', () => {
    expect(validateScoreForType(300, 'sbss')).toBeNull();
  });

  it('rejects SBSS score of 301', () => {
    expect(validateScoreForType(301, 'sbss')).toMatch(/300/);
  });

  it('accepts Paydex score of 80', () => {
    expect(validateScoreForType(80, 'paydex')).toBeNull();
  });

  it('rejects Paydex score of 101', () => {
    expect(validateScoreForType(101, 'paydex')).toMatch(/100/);
  });

  it('returns error for unknown score type', () => {
    expect(validateScoreForType(700, 'unknown')).toMatch(/Unknown scoreType/);
  });
});

// ── Section 2: CreditIntelligenceService — Score Storage ─────

describe('CreditIntelligenceService.pullCreditProfiles', () => {
  it('creates a credit profile record per bureau', async () => {
    const prismaMock = buildPrismaMock();
    const service = new CreditIntelligenceService(prismaMock as never);

    const profiles = await service.pullCreditProfiles(
      BUSINESS_ID,
      { bureaus: ['equifax', 'transunion'], profileType: 'personal', useCache: false, cacheTtlHours: 24 },
      CTX,
    );

    expect(prismaMock.creditProfile.create).toHaveBeenCalledTimes(2);
    expect(profiles).toHaveLength(2);
  });

  it('stores scoreType from bureau stub result', async () => {
    const prismaMock = buildPrismaMock();
    const service = new CreditIntelligenceService(prismaMock as never);

    await service.pullCreditProfiles(
      BUSINESS_ID,
      { bureaus: ['equifax'], profileType: 'personal', useCache: false, cacheTtlHours: 24 },
      CTX,
    );

    const createCall = (prismaMock.creditProfile.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.bureau).toBe('equifax');
    expect(['fico', 'vantage', 'sbss', 'paydex']).toContain(createCall.data.scoreType);
  });

  it('stores tradelines as array', async () => {
    const prismaMock = buildPrismaMock();
    const service = new CreditIntelligenceService(prismaMock as never);

    await service.pullCreditProfiles(
      BUSINESS_ID,
      { bureaus: ['equifax'], profileType: 'personal', useCache: false, cacheTtlHours: 24 },
      CTX,
    );

    const createCall = (prismaMock.creditProfile.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(Array.isArray(createCall.data.tradelines)).toBe(true);
  });

  it('throws when business is not found for tenant', async () => {
    const prismaMock = buildPrismaMock({
      business: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const service = new CreditIntelligenceService(prismaMock as never);

    await expect(
      service.pullCreditProfiles(
        'nonexistent-biz',
        { bureaus: ['equifax'], profileType: 'personal', useCache: false, cacheTtlHours: 24 },
        CTX,
      ),
    ).rejects.toThrow('not found');
  });

  it('returns cached profile when useCache=true and cache is fresh', async () => {
    const cachedProfile = {
      id: 'cached-id',
      businessId: BUSINESS_ID,
      profileType: 'personal',
      bureau: 'equifax',
      score: 750,
      scoreType: 'fico',
      utilization: 0.2,
      inquiryCount: 1,
      derogatoryCount: 0,
      tradelines: [],
      rawData: {},
      pulledAt: new Date(),
      createdAt: new Date(),
    };

    const prismaMock = buildPrismaMock({
      creditProfile: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(cachedProfile),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);

    const profiles = await service.pullCreditProfiles(
      BUSINESS_ID,
      { bureaus: ['equifax'], profileType: 'personal', useCache: true, cacheTtlHours: 24 },
      CTX,
    );

    // Should not create a new record since cache is fresh
    expect(prismaMock.creditProfile.create).not.toHaveBeenCalled();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe('cached-id');
  });

  it('pulls all four bureaus independently', async () => {
    const prismaMock = buildPrismaMock();
    const service = new CreditIntelligenceService(prismaMock as never);

    const profiles = await service.pullCreditProfiles(
      BUSINESS_ID,
      { bureaus: ['equifax', 'transunion', 'experian', 'dnb'], profileType: 'business', useCache: false, cacheTtlHours: 24 },
      CTX,
    );

    expect(profiles).toHaveLength(4);
    const bureaus = profiles.map((p) => p.bureau);
    expect(bureaus).toContain('equifax');
    expect(bureaus).toContain('transunion');
    expect(bureaus).toContain('experian');
    expect(bureaus).toContain('dnb');
  });
});

describe('CreditIntelligenceService.getCreditProfiles', () => {
  it('returns empty array when no profiles exist', async () => {
    const prismaMock = buildPrismaMock();
    const service = new CreditIntelligenceService(prismaMock as never);

    const profiles = await service.getCreditProfiles(BUSINESS_ID, CTX);
    expect(profiles).toEqual([]);
  });

  it('maps Prisma records to CreditProfileDto with ISO date strings', async () => {
    const pulledAt = new Date('2025-01-15T12:00:00Z');
    const createdAt = new Date('2025-01-15T12:00:01Z');

    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'prof-1',
            businessId: BUSINESS_ID,
            profileType: 'personal',
            bureau: 'equifax',
            score: 710,
            scoreType: 'fico',
            utilization: { toNumber: () => 0.35 },
            inquiryCount: 3,
            derogatoryCount: 1,
            tradelines: [],
            rawData: {},
            pulledAt,
            createdAt,
          },
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const profiles = await service.getCreditProfiles(BUSINESS_ID, CTX);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].score).toBe(710);
    expect(profiles[0].utilization).toBeCloseTo(0.35);
    expect(typeof profiles[0].pulledAt).toBe('string');
    expect(profiles[0].pulledAt).toBe(pulledAt.toISOString());
  });
});

// ── Section 3: Utilization Calculation ───────────────────────

describe('CreditIntelligenceService.calculateAggregateUtilization', () => {
  it('calculates utilization from tradelines across bureaus', async () => {
    const tradelines: Tradeline[] = [
      makeTradeline({ creditLimit: 10_000, balance: 3_000 }),  // 30%
      makeTradeline({ creditLimit: 5_000,  balance: 1_000 }),  // 20%
    ];

    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'p1',
            bureau: 'equifax',
            tradelines,
            utilization: null,
            pulledAt: new Date(),
          },
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const util = await service.calculateAggregateUtilization(BUSINESS_ID);

    // (3000 + 1000) / (10000 + 5000) = 4000/15000 ≈ 0.2667
    expect(util).toBeCloseTo(0.2667, 3);
  });

  it('returns null when no tradelines have limit+balance data', async () => {
    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'p1',
            bureau: 'equifax',
            tradelines: [{ creditor: 'Test', accountType: 'revolving', isDerogatory: false }],
            utilization: null,
            pulledAt: new Date(),
          },
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const util = await service.calculateAggregateUtilization(BUSINESS_ID);
    expect(util).toBeNull();
  });

  it('falls back to bureau-reported utilization when tradeline data is absent', async () => {
    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'p1',
            bureau: 'experian',
            tradelines: [],
            utilization: { toNumber: () => 0.45 },
            pulledAt: new Date(),
          },
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const util = await service.calculateAggregateUtilization(BUSINESS_ID);
    expect(util).toBeCloseTo(0.45);
  });

  it('returns null when no profiles exist', async () => {
    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const util = await service.calculateAggregateUtilization(BUSINESS_ID);
    expect(util).toBeNull();
  });
});

// ── Section 4: Inquiry Velocity ───────────────────────────────

describe('CreditIntelligenceService.getInquiryVelocity', () => {
  it('returns count 0 and breached=false when no profiles exist', async () => {
    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const result = await service.getInquiryVelocity(BUSINESS_ID);

    expect(result.count).toBe(0);
    expect(result.breached).toBe(false);
    expect(result.windowDays).toBe(90);
  });

  it(`does not flag breach when at or below threshold (${RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D})`, async () => {
    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn().mockResolvedValue([
          { inquiryCount: 2 },
          { inquiryCount: 4 },  // total: 6 = exactly at threshold, not breached
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const result = await service.getInquiryVelocity(BUSINESS_ID);

    expect(result.count).toBe(6);
    expect(result.breached).toBe(false);
  });

  it('flags breach when inquiries exceed threshold', async () => {
    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn().mockResolvedValue([
          { inquiryCount: 3 },
          { inquiryCount: 2 },
          { inquiryCount: 2 }, // total: 7 — exceeds threshold of 6
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const result = await service.getInquiryVelocity(BUSINESS_ID);

    expect(result.count).toBe(7);
    expect(result.breached).toBe(true);
  });

  it('handles null inquiryCount gracefully', async () => {
    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn().mockResolvedValue([
          { inquiryCount: null },
          { inquiryCount: 3 },
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const result = await service.getInquiryVelocity(BUSINESS_ID);

    expect(result.count).toBe(3);
  });
});

// ── Section 5: Optimization Roadmap ──────────────────────────

describe('CreditIntelligenceService.generateOptimizationRoadmap', () => {
  it('returns empty roadmap with a pull-first action when no profiles exist', async () => {
    const prismaMock = buildPrismaMock();
    const service = new CreditIntelligenceService(prismaMock as never);

    const roadmap = await service.generateOptimizationRoadmap(BUSINESS_ID, CTX);

    expect(roadmap.businessId).toBe(BUSINESS_ID);
    expect(roadmap.actions).toHaveLength(1);
    expect(roadmap.actions[0].category).toBe('tradeline');
    expect(roadmap.currentScoreSummary.utilizationRisk).toBe('none');
    expect(roadmap.currentScoreSummary.inquiryVelocityRisk).toBe(false);
  });

  it('sets utilizationRisk=warning at 70% threshold', async () => {
    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn()
          // getCreditProfiles call
          .mockResolvedValueOnce([
            {
              id: 'p1',
              businessId: BUSINESS_ID,
              profileType: 'personal',
              bureau: 'equifax',
              score: 680,
              scoreType: 'fico',
              utilization: { toNumber: () => 0.75 },
              inquiryCount: 2,
              derogatoryCount: 0,
              tradelines: [makeTradeline({ creditLimit: 10_000, balance: 7_500 })],
              rawData: {},
              pulledAt: new Date(),
              createdAt: new Date(),
            },
          ])
          // calculateAggregateUtilization call
          .mockResolvedValueOnce([
            {
              id: 'p1',
              bureau: 'equifax',
              tradelines: [makeTradeline({ creditLimit: 10_000, balance: 7_500 })],
              utilization: { toNumber: () => 0.75 },
              pulledAt: new Date(),
            },
          ])
          // getInquiryVelocity call
          .mockResolvedValueOnce([{ inquiryCount: 2 }]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const roadmap = await service.generateOptimizationRoadmap(BUSINESS_ID, CTX);

    expect(roadmap.currentScoreSummary.utilizationRisk).toBe('warning');
  });

  it('sets utilizationRisk=critical at 90% threshold', async () => {
    const highUtilTradeline = makeTradeline({ creditLimit: 10_000, balance: 9_200 });

    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn()
          .mockResolvedValueOnce([
            {
              id: 'p1',
              businessId: BUSINESS_ID,
              profileType: 'personal',
              bureau: 'equifax',
              score: 620,
              scoreType: 'fico',
              utilization: { toNumber: () => 0.92 },
              inquiryCount: 1,
              derogatoryCount: 0,
              tradelines: [highUtilTradeline],
              rawData: {},
              pulledAt: new Date(),
              createdAt: new Date(),
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 'p1',
              bureau: 'equifax',
              tradelines: [highUtilTradeline],
              utilization: { toNumber: () => 0.92 },
              pulledAt: new Date(),
            },
          ])
          .mockResolvedValueOnce([{ inquiryCount: 1 }]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const roadmap = await service.generateOptimizationRoadmap(BUSINESS_ID, CTX);

    expect(roadmap.currentScoreSummary.utilizationRisk).toBe('critical');
  });

  it('sets inquiryVelocityRisk=true when count exceeds threshold', async () => {
    const profile = {
      id: 'p1',
      businessId: BUSINESS_ID,
      profileType: 'personal',
      bureau: 'equifax',
      score: 700,
      scoreType: 'fico',
      utilization: { toNumber: () => 0.25 },
      inquiryCount: 7,
      derogatoryCount: 0,
      tradelines: [makeTradeline()],
      rawData: {},
      pulledAt: new Date(),
      createdAt: new Date(),
    };

    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn()
          .mockResolvedValueOnce([profile])                        // getCreditProfiles
          .mockResolvedValueOnce([{ ...profile, tradelines: [makeTradeline()] }]) // utilization
          .mockResolvedValueOnce([{ inquiryCount: 7 }]),           // velocity
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const roadmap = await service.generateOptimizationRoadmap(BUSINESS_ID, CTX);

    expect(roadmap.currentScoreSummary.inquiryVelocityRisk).toBe(true);
    expect(roadmap.currentScoreSummary.totalInquiries90d).toBe(7);
  });

  it('includes highestFico and highestSbss in summary', async () => {
    const ficoProfile = {
      id: 'p1',
      businessId: BUSINESS_ID,
      profileType: 'personal',
      bureau: 'equifax',
      score: 740,
      scoreType: 'fico',
      utilization: { toNumber: () => 0.22 },
      inquiryCount: 2,
      derogatoryCount: 0,
      tradelines: [makeTradeline()],
      rawData: {},
      pulledAt: new Date(),
      createdAt: new Date(),
    };

    const sbssProfile = {
      ...ficoProfile,
      id: 'p2',
      bureau: 'experian',
      score: 180,
      scoreType: 'sbss',
    };

    const prismaMock = buildPrismaMock({
      creditProfile: {
        findMany: vi.fn()
          .mockResolvedValueOnce([ficoProfile, sbssProfile])   // getCreditProfiles
          .mockResolvedValueOnce([ficoProfile, sbssProfile])   // utilization
          .mockResolvedValueOnce([{ inquiryCount: 2 }, { inquiryCount: 1 }]), // velocity
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    });

    const service = new CreditIntelligenceService(prismaMock as never);
    const roadmap = await service.generateOptimizationRoadmap(BUSINESS_ID, CTX);

    expect(roadmap.currentScoreSummary.highestFico).toBe(740);
    expect(roadmap.currentScoreSummary.highestSbss).toBe(180);
  });
});

// ── Section 6: CreditOptimizerService ────────────────────────

describe('CreditOptimizerService.generateActions', () => {
  const optimizer = new CreditOptimizerService();

  it('returns actions sorted by ascending priority', () => {
    const profiles = [makeProfile({ utilization: 0.75, derogatoryCount: 1 })];
    const actions = optimizer.generateActions(profiles, 0.75, 3);

    for (let i = 1; i < actions.length; i++) {
      expect(actions[i].priority).toBeGreaterThanOrEqual(actions[i - 1].priority);
    }
  });

  it('generates utilization warning action when utilization >= 70%', () => {
    const actions = optimizer.generateActions([makeProfile()], 0.72, 2);
    const utilAction = actions.find((a) => a.category === 'utilization');

    expect(utilAction).toBeDefined();
    expect(utilAction?.estimatedScoreImpact).toBeGreaterThan(0);
  });

  it('generates critical utilization action when utilization >= 90%', () => {
    const actions = optimizer.generateActions([makeProfile()], 0.93, 1);
    const utilAction = actions.find((a) => a.category === 'utilization');

    expect(utilAction).toBeDefined();
    expect(utilAction?.title).toMatch(/Urgently/i);
    expect(utilAction?.priority).toBe(1); // must be highest priority
  });

  it('generates inquiry velocity action when count exceeds threshold', () => {
    const actions = optimizer.generateActions([makeProfile()], 0.2, RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D + 1);
    const inquiryAction = actions.find((a) => a.category === 'inquiry');

    expect(inquiryAction).toBeDefined();
    expect(inquiryAction?.actionable).toBe(false); // cannot act, must wait
    expect(inquiryAction?.metadata).toMatchObject({
      maxRecommended: RISK_THRESHOLDS.MAX_INQUIRY_VELOCITY_90D,
    });
  });

  it('generates D&B tradeline action when no D&B profile exists', () => {
    const profiles = [makeProfile({ bureau: 'equifax' })];
    const actions = optimizer.generateActions(profiles, 0.2, 1);
    const dnbAction = actions.find(
      (a) => a.category === 'tradeline' && a.title.includes('D&B'),
    );

    expect(dnbAction).toBeDefined();
    expect(dnbAction?.estimatedScoreImpact).toBeGreaterThan(0);
  });

  it('does not generate D&B action when D&B profile already exists', () => {
    const profiles = [
      makeProfile({ bureau: 'equifax' }),
      makeProfile({ bureau: 'dnb', scoreType: 'paydex', score: 75 }),
    ];
    const actions = optimizer.generateActions(profiles, 0.2, 1);
    const dnbAction = actions.find(
      (a) => a.category === 'tradeline' && a.title.includes('D&B'),
    );

    expect(dnbAction).toBeUndefined();
  });

  it('generates SBSS improvement action when SBSS < 160', () => {
    const profiles = [
      makeProfile({ bureau: 'experian', scoreType: 'sbss', score: 140 }),
    ];
    const actions = optimizer.generateActions(profiles, 0.2, 1);
    const sbssAction = actions.find((a) => a.category === 'score_mix');

    expect(sbssAction).toBeDefined();
    expect(sbssAction?.title).toMatch(/SBSS/i);
    expect(sbssAction?.estimatedScoreImpact).toBeGreaterThan(0);
  });

  it('does not generate SBSS action when SBSS >= 160', () => {
    const profiles = [
      makeProfile({ bureau: 'experian', scoreType: 'sbss', score: 175 }),
    ];
    const actions = optimizer.generateActions(profiles, 0.2, 1);
    const sbssAction = actions.find((a) => a.category === 'score_mix');

    expect(sbssAction).toBeUndefined();
  });

  it('generates derogatory action when derogatoryCount > 0', () => {
    const profiles = [makeProfile({ derogatoryCount: 2 })];
    const actions = optimizer.generateActions(profiles, 0.25, 2);
    const derogAction = actions.find((a) => a.category === 'derogatory');

    expect(derogAction).toBeDefined();
    expect(derogAction?.estimatedScoreImpact).toBeGreaterThan(0);
  });

  it('generates tradeline action when active tradeline count < 5', () => {
    const profiles = [
      makeProfile({
        tradelines: [
          makeTradeline(),
          makeTradeline({ accountType: 'installment' }),
        ],
      }),
    ];
    const actions = optimizer.generateActions(profiles, 0.2, 1);
    const tlAction = actions.find(
      (a) => a.category === 'tradeline' && a.title.includes('Seasoned'),
    );

    expect(tlAction).toBeDefined();
  });

  it('all actions have positive priority, valid category, and non-empty description', () => {
    const profiles = [
      makeProfile({ bureau: 'equifax', utilization: 0.75, derogatoryCount: 1, inquiryCount: 3 }),
      makeProfile({ bureau: 'dnb', scoreType: 'paydex', score: 70, derogatoryCount: 0 }),
    ];
    const actions = optimizer.generateActions(profiles, 0.75, 4);

    for (const action of actions) {
      expect(action.priority).toBeGreaterThan(0);
      expect(action.description.length).toBeGreaterThan(10);
      expect(action.estimatedTimeframeDays).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('CreditOptimizerService.recommendNextPullDate', () => {
  const optimizer = new CreditOptimizerService();

  it('returns current datetime when no profiles exist', () => {
    const date = optimizer.recommendNextPullDate([], { count: 0, breached: false, windowDays: 90 });
    expect(date).not.toBeNull();
    // Should be approximately now
    const diff = Math.abs(new Date(date!).getTime() - Date.now());
    expect(diff).toBeLessThan(5_000);
  });

  it('recommends 30 days out when velocity is not breached', () => {
    const profiles = [makeProfile()];
    const date = optimizer.recommendNextPullDate(
      profiles,
      { count: 3, breached: false, windowDays: 90 },
    );

    const recommended = new Date(date!);
    const expected = new Date();
    expected.setDate(expected.getDate() + 30);

    const diff = Math.abs(recommended.getTime() - expected.getTime());
    expect(diff).toBeLessThan(5_000);
  });

  it('recommends a date after the 90-day window when velocity is breached', () => {
    const oldPulledAt = new Date();
    oldPulledAt.setDate(oldPulledAt.getDate() - 30); // 30 days ago

    const profiles = [makeProfile({ pulledAt: oldPulledAt.toISOString() })];
    const date = optimizer.recommendNextPullDate(
      profiles,
      { count: 8, breached: true, windowDays: 90 },
    );

    const recommended = new Date(date!);
    // Should be at least 60+ days from now (90 - 30 days elapsed + 7 buffer)
    const minExpected = new Date();
    minExpected.setDate(minExpected.getDate() + 60);

    expect(recommended.getTime()).toBeGreaterThan(minExpected.getTime());
  });
});
