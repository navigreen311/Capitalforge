// ============================================================
// Unit Tests — FundingRoundService
//
// Covers:
//   - Round creation (auto-increment, event publication)
//   - APR alert trigger logic (60 / 30 / 15 day windows)
//   - Round completion (metrics derivation, event publication)
//   - Performance scoring edge cases
//   - Round 2 eligibility assessment
//   - Cross-round comparison and ranking
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FundingRoundService,
  type RoundPerformanceMetrics,
} from '@backend/services/funding-round.service.js';
import { eventBus, EventBus } from '@backend/events/event-bus.js';
import { EVENT_TYPES } from '@shared/constants/index.js';
import { addDays, subDays, subMonths } from 'date-fns';

// ── Prisma mock factory ───────────────────────────────────────────────────────

/**
 * Build a minimal Prisma mock. Tests override individual methods as needed.
 */
function makePrismaMock() {
  return {
    fundingRound: {
      create:    vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany:  vi.fn(),
      update:    vi.fn(),
    },
    creditProfile: {
      findFirst: vi.fn(),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT_ID   = 'tenant-abc';
const BUSINESS_ID = 'biz-001';
const ROUND_ID    = 'round-001';

function makeRound(overrides: Record<string, unknown> = {}) {
  return {
    id:             ROUND_ID,
    businessId:     BUSINESS_ID,
    roundNumber:    1,
    targetCredit:   { toNumber: () => 100_000, toString: () => '100000' },
    targetCardCount: 5,
    status:         'completed',
    aprExpiryDate:  null,
    alertSent60:    false,
    alertSent30:    false,
    alertSent15:    false,
    startedAt:      new Date('2025-01-01'),
    completedAt:    new Date('2025-02-01'),
    createdAt:      new Date('2025-01-01'),
    updatedAt:      new Date('2025-02-01'),
    applications:   [],
    ...overrides,
  };
}

function makeApplication(overrides: Record<string, unknown> = {}) {
  return {
    id:              `app-${Math.random()}`,
    businessId:      BUSINESS_ID,
    fundingRoundId:  ROUND_ID,
    issuer:          'Chase',
    cardProduct:     'Sapphire Preferred',
    status:          'approved',
    creditLimit:     { toNumber: () => 20_000 },
    introApr:        { toNumber: () => 0 },
    introAprExpiry:  null,
    regularApr:      { toNumber: () => 0.24 },
    annualFee:       { toNumber: () => 95 },
    cashAdvanceFee:  null,
    consentCapturedAt: null,
    submittedAt:     new Date(),
    decidedAt:       new Date(),
    declineReason:   null,
    adverseActionNotice: null,
    createdAt:       new Date(),
    updatedAt:       new Date(),
    ...overrides,
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset the event bus singleton so tests don't leak subscriptions
  EventBus.reset();
  // Silence the real EventBus's publishAndPersist (no DB in unit tests)
  vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Round Creation ─────────────────────────────────────────────────────────────

describe('FundingRoundService.createRound', () => {
  it('creates a round with roundNumber = 1 when no prior rounds exist', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.findFirst.mockResolvedValue(null);
    prisma.fundingRound.create.mockResolvedValue(
      makeRound({ status: 'planning', completedAt: null }),
    );

    const svc = new FundingRoundService(prisma as never);
    const round = await svc.createRound({
      businessId: BUSINESS_ID,
      tenantId:   TENANT_ID,
      targetCredit: 50_000,
    });

    expect(prisma.fundingRound.create).toHaveBeenCalledOnce();
    const createCall = prisma.fundingRound.create.mock.calls[0]![0] as {
      data: { roundNumber: number; status: string };
    };
    expect(createCall.data.roundNumber).toBe(1);
    expect(createCall.data.status).toBe('planning');
    expect(round.roundNumber).toBe(1);
  });

  it('increments roundNumber when prior rounds exist', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.findFirst.mockResolvedValue({ roundNumber: 2 });
    prisma.fundingRound.create.mockResolvedValue(
      makeRound({ roundNumber: 3, status: 'planning' }),
    );

    const svc = new FundingRoundService(prisma as never);
    await svc.createRound({ businessId: BUSINESS_ID, tenantId: TENANT_ID });

    const createCall = prisma.fundingRound.create.mock.calls[0]![0] as {
      data: { roundNumber: number };
    };
    expect(createCall.data.roundNumber).toBe(3);
  });

  it('publishes a ROUND_STARTED event', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.findFirst.mockResolvedValue(null);
    prisma.fundingRound.create.mockResolvedValue(makeRound({ status: 'planning' }));

    const publishSpy = vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);

    const svc = new FundingRoundService(prisma as never);
    await svc.createRound({ businessId: BUSINESS_ID, tenantId: TENANT_ID });

    expect(publishSpy).toHaveBeenCalledOnce();
    const [calledTenantId, calledEnvelope] = publishSpy.mock.calls[0]!;
    expect(calledTenantId).toBe(TENANT_ID);
    expect(calledEnvelope.eventType).toBe(EVENT_TYPES.ROUND_STARTED);
    expect(calledEnvelope.aggregateId).toBe(ROUND_ID);
  });

  it('throws when businessId is missing', async () => {
    const svc = new FundingRoundService(makePrismaMock() as never);
    await expect(
      svc.createRound({ businessId: '', tenantId: TENANT_ID }),
    ).rejects.toThrow('businessId is required');
  });

  it('throws when tenantId is missing', async () => {
    const svc = new FundingRoundService(makePrismaMock() as never);
    await expect(
      svc.createRound({ businessId: BUSINESS_ID, tenantId: '' }),
    ).rejects.toThrow('tenantId is required');
  });
});

// ── APR Alert Triggers ─────────────────────────────────────────────────────────

describe('FundingRoundService.evaluateAprAlerts', () => {
  it('fires 60-day alert when daysRemaining <= 60 and flag not set', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.update.mockResolvedValue({});
    const publishSpy = vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);

    const svc  = new FundingRoundService(prisma as never);
    const now  = new Date('2026-01-01');
    const round = makeRound({
      aprExpiryDate: addDays(now, 55), // 55 days away — within 60-day window
      alertSent60: false,
      alertSent30: false,
      alertSent15: false,
    });

    const { windowsFired } = await svc.evaluateAprAlerts(round as never, TENANT_ID, now);

    expect(windowsFired).toContain(60);
    expect(windowsFired).not.toContain(30);
    expect(windowsFired).not.toContain(15);

    expect(publishSpy).toHaveBeenCalledOnce();
    const envelope = publishSpy.mock.calls[0]![1];
    expect(envelope.eventType).toBe(EVENT_TYPES.APR_EXPIRY_APPROACHING);
    expect(envelope.payload['alertWindow']).toBe(60);
  });

  it('fires 30-day alert when daysRemaining <= 30', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.update.mockResolvedValue({});
    const publishSpy = vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);

    const svc  = new FundingRoundService(prisma as never);
    const now  = new Date('2026-01-01');
    const round = makeRound({
      aprExpiryDate: addDays(now, 25), // 25 days — within 30 and 60 window
      alertSent60: true,               // 60-day already sent
      alertSent30: false,
      alertSent15: false,
    });

    const { windowsFired } = await svc.evaluateAprAlerts(round as never, TENANT_ID, now);

    expect(windowsFired).toContain(30);
    expect(windowsFired).not.toContain(60); // already sent
    expect(publishSpy).toHaveBeenCalledOnce();
  });

  it('fires all three alerts when none have been sent and expiry is 10 days away', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.update.mockResolvedValue({});
    const publishSpy = vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);

    const svc  = new FundingRoundService(prisma as never);
    const now  = new Date('2026-01-01');
    const round = makeRound({
      aprExpiryDate: addDays(now, 10),
      alertSent60: false,
      alertSent30: false,
      alertSent15: false,
    });

    const { windowsFired } = await svc.evaluateAprAlerts(round as never, TENANT_ID, now);

    expect(windowsFired).toEqual(expect.arrayContaining([60, 30, 15]));
    expect(publishSpy).toHaveBeenCalledTimes(3);
  });

  it('does not fire any alerts when all flags are already set', async () => {
    const prisma = makePrismaMock();
    const publishSpy = vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);

    const svc  = new FundingRoundService(prisma as never);
    const now  = new Date('2026-01-01');
    const round = makeRound({
      aprExpiryDate: addDays(now, 5),
      alertSent60: true,
      alertSent30: true,
      alertSent15: true,
    });

    const { windowsFired } = await svc.evaluateAprAlerts(round as never, TENANT_ID, now);

    expect(windowsFired).toHaveLength(0);
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('does not fire alerts when aprExpiryDate is null', async () => {
    const prisma = makePrismaMock();
    const publishSpy = vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);

    const svc  = new FundingRoundService(prisma as never);
    const round = makeRound({ aprExpiryDate: null });

    const { windowsFired } = await svc.evaluateAprAlerts(round as never, TENANT_ID, new Date());

    expect(windowsFired).toHaveLength(0);
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('marks alertSent flag in DB when alert fires', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.update.mockResolvedValue({});
    vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);

    const svc  = new FundingRoundService(prisma as never);
    const now  = new Date('2026-01-01');
    const round = makeRound({
      aprExpiryDate: addDays(now, 14),
      alertSent60: true,
      alertSent30: true,
      alertSent15: false,
    });

    await svc.evaluateAprAlerts(round as never, TENANT_ID, now);

    expect(prisma.fundingRound.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ROUND_ID },
        data: { alertSent15: true },
      }),
    );
  });
});

// ── Round Completion ───────────────────────────────────────────────────────────

describe('FundingRoundService.completeRound', () => {
  it('completes a round and derives earliestAprExpiry from approved applications', async () => {
    const prisma = makePrismaMock();
    const now    = new Date('2026-03-31');

    const expiry1 = addDays(now, 300);
    const expiry2 = addDays(now, 180); // earliest

    const apps = [
      makeApplication({ status: 'approved', creditLimit: { toNumber: () => 20_000 }, introAprExpiry: expiry1, annualFee: { toNumber: () => 95 } }),
      makeApplication({ status: 'approved', creditLimit: { toNumber: () => 15_000 }, introAprExpiry: expiry2, annualFee: { toNumber: () => 0 } }),
      makeApplication({ status: 'declined',  creditLimit: null }),
    ];

    const roundData = makeRound({
      status:       'in_progress',
      applications: apps,
    });

    prisma.fundingRound.findUnique.mockResolvedValue(roundData);
    prisma.fundingRound.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...roundData, ...data, completedAt: now }),
    );
    vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);

    const svc = new FundingRoundService(prisma as never);
    const { round, metrics } = await svc.completeRound(ROUND_ID, TENANT_ID);

    // earliestAprExpiry should be expiry2 (the sooner one)
    const updateCall = prisma.fundingRound.update.mock.calls[0]![0] as {
      data: { aprExpiryDate: Date; status: string };
    };
    expect(updateCall.data.status).toBe('completed');
    expect(updateCall.data.aprExpiryDate).toEqual(expiry2);

    // Metrics
    expect(metrics.approvedCount).toBe(2);
    expect(metrics.submittedCount).toBe(3);
    expect(metrics.totalCreditObtained).toBe(35_000);
    expect(metrics.approvalRate).toBeCloseTo(2 / 3, 3);
  });

  it('throws when round is already completed', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.findUnique.mockResolvedValue(
      makeRound({ status: 'completed' }),
    );

    const svc = new FundingRoundService(prisma as never);
    await expect(svc.completeRound(ROUND_ID, TENANT_ID)).rejects.toThrow('already completed');
  });

  it('throws when round is cancelled', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.findUnique.mockResolvedValue(
      makeRound({ status: 'cancelled' }),
    );

    const svc = new FundingRoundService(prisma as never);
    await expect(svc.completeRound(ROUND_ID, TENANT_ID)).rejects.toThrow('cancelled');
  });

  it('throws when round does not exist', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.findUnique.mockResolvedValue(null);

    const svc = new FundingRoundService(prisma as never);
    await expect(svc.completeRound('nonexistent', TENANT_ID)).rejects.toThrow('not found');
  });

  it('publishes ROUND_COMPLETED event on successful completion', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.findUnique.mockResolvedValue(makeRound({ status: 'in_progress', applications: [] }));
    prisma.fundingRound.update.mockResolvedValue(makeRound({ status: 'completed' }));
    const publishSpy = vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);

    const svc = new FundingRoundService(prisma as never);
    await svc.completeRound(ROUND_ID, TENANT_ID);

    expect(publishSpy).toHaveBeenCalledOnce();
    const [tid, envelope] = publishSpy.mock.calls[0]!;
    expect(tid).toBe(TENANT_ID);
    expect(envelope.eventType).toBe(EVENT_TYPES.ROUND_COMPLETED);
  });
});

// ── Performance Scoring ────────────────────────────────────────────────────────

describe('Performance scoring', () => {
  it('gives a perfect score when all cards approved at target credit with 0 fees', async () => {
    const prisma = makePrismaMock();
    const svc    = new FundingRoundService(prisma as never);

    // Target = 100k, obtained = 100k, all submitted approved, 0 annual fees, has introApr
    const apps = [
      makeApplication({
        status:      'approved',
        creditLimit: { toNumber: () => 100_000 },
        introApr:    { toNumber: () => 0 },
        annualFee:   { toNumber: () => 0 },
        introAprExpiry: addDays(new Date(), 365),
      }),
    ];

    const round = makeRound({ targetCredit: { toNumber: () => 100_000 }, applications: apps });
    prisma.fundingRound.findUnique.mockResolvedValue(round);

    const metrics = await svc.computeRoundMetrics(ROUND_ID);

    // Full attainment, 100% approval, 0 fees, has intro APR → should be near max
    expect(metrics.performanceScore).toBeGreaterThanOrEqual(85);
    expect(metrics.creditAttainmentRate).toBe(1);
    expect(metrics.approvalRate).toBe(1);
  });

  it('returns 0 creditAttainmentRate when no targetCredit is set', () => {
    const svc = new FundingRoundService(makePrismaMock() as never);

    const round = makeRound({
      targetCredit: null,
      applications: [
        makeApplication({ status: 'approved', creditLimit: { toNumber: () => 10_000 }, annualFee: { toNumber: () => 0 } }),
      ],
    });

    // Access private method for unit testing
    const metrics = (svc as unknown as {
      _computeMetrics(r: unknown): RoundPerformanceMetrics;
    })._computeMetrics(round);

    expect(metrics.creditAttainmentRate).toBeNull();
    expect(metrics.totalCreditObtained).toBe(10_000);
  });

  it('computes weighted avg intro APR correctly', () => {
    const svc = new FundingRoundService(makePrismaMock() as never);

    // Card A: limit 10k, introApr 0 (0%)
    // Card B: limit 10k, introApr 0.1999 (19.99%)
    // Weighted avg = (0 * 10000 + 0.1999 * 10000) / 20000 = 0.09995
    const apps = [
      makeApplication({ status: 'approved', creditLimit: { toNumber: () => 10_000 }, introApr: { toNumber: () => 0 }, annualFee: { toNumber: () => 0 } }),
      makeApplication({ status: 'approved', creditLimit: { toNumber: () => 10_000 }, introApr: { toNumber: () => 0.1999 }, annualFee: { toNumber: () => 0 } }),
    ];

    const round = makeRound({ applications: apps });
    const metrics = (svc as unknown as {
      _computeMetrics(r: unknown): ReturnType<FundingRoundService['computeRoundMetrics']>;
    })._computeMetrics(round);

    expect(metrics.weightedAvgIntroApr).toBeCloseTo(0.09995, 4);
  });

  it('returns null weightedAvgIntroApr when no approved apps have introApr', () => {
    const svc = new FundingRoundService(makePrismaMock() as never);

    const apps = [
      makeApplication({ status: 'approved', creditLimit: { toNumber: () => 10_000 }, introApr: null, annualFee: { toNumber: () => 0 } }),
    ];

    const round = makeRound({ applications: apps });
    const metrics = (svc as unknown as {
      _computeMetrics(r: unknown): ReturnType<FundingRoundService['computeRoundMetrics']>;
    })._computeMetrics(round);

    expect(metrics.weightedAvgIntroApr).toBeNull();
  });
});

// ── Round 2 Eligibility ────────────────────────────────────────────────────────

describe('FundingRoundService.assessRound2Eligibility', () => {
  it('returns eligible when all four criteria pass', async () => {
    const prisma = makePrismaMock();
    const now    = new Date('2026-03-31');

    // Round 1 started > 6 months ago
    prisma.fundingRound.findFirst.mockResolvedValue({
      status:      'completed',
      startedAt:   subMonths(now, 8),
      completedAt: subMonths(now, 7),
    });

    // Good credit profile
    prisma.creditProfile.findFirst
      .mockResolvedValueOnce({
        utilization:     { toNumber: () => 0.18 },  // 18% — under 30%
        derogatoryCount: 0,
        score:           720,
        pulledAt:        subDays(now, 10),
      })
      .mockResolvedValueOnce({
        score: 700, // baseline at round 1 start — score improved by 20
      });

    const svc = new FundingRoundService(prisma as never);
    const result = await svc.assessRound2Eligibility(BUSINESS_ID, now);

    expect(result.eligible).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.creditScoreChange).toBe(20);
  });

  it('fails when Round 1 has not been completed', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.findFirst.mockResolvedValue(null);
    prisma.creditProfile.findFirst.mockResolvedValue(null);

    const svc = new FundingRoundService(prisma as never);
    const result = await svc.assessRound2Eligibility(BUSINESS_ID);

    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('No completed Round 1'))).toBe(true);
  });

  it('fails when Round 1 started less than 6 months ago', async () => {
    const prisma = makePrismaMock();
    const now    = new Date('2026-03-31');

    prisma.fundingRound.findFirst.mockResolvedValue({
      status:      'completed',
      startedAt:   subMonths(now, 3), // Only 3 months ago
      completedAt: subMonths(now, 2),
    });
    prisma.creditProfile.findFirst.mockResolvedValue({
      utilization:     { toNumber: () => 0.15 },
      derogatoryCount: 0,
      score:           730,
      pulledAt:        subDays(now, 5),
    });

    const svc = new FundingRoundService(prisma as never);
    const result = await svc.assessRound2Eligibility(BUSINESS_ID, now);

    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('month(s) ago'))).toBe(true);
  });

  it('fails when utilization >= 30%', async () => {
    const prisma = makePrismaMock();
    const now    = new Date('2026-03-31');

    prisma.fundingRound.findFirst.mockResolvedValue({
      status:      'completed',
      startedAt:   subMonths(now, 8),
      completedAt: subMonths(now, 7),
    });
    prisma.creditProfile.findFirst.mockResolvedValue({
      utilization:     { toNumber: () => 0.45 }, // 45% — too high
      derogatoryCount: 0,
      score:           680,
      pulledAt:        subDays(now, 5),
    });

    const svc = new FundingRoundService(prisma as never);
    const result = await svc.assessRound2Eligibility(BUSINESS_ID, now);

    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('utilization'))).toBe(true);
    expect(result.currentUtilization).toBeCloseTo(0.45, 2);
  });

  it('fails when derogatory marks exist', async () => {
    const prisma = makePrismaMock();
    const now    = new Date('2026-03-31');

    prisma.fundingRound.findFirst.mockResolvedValue({
      status:      'completed',
      startedAt:   subMonths(now, 10),
      completedAt: subMonths(now, 9),
    });
    prisma.creditProfile.findFirst.mockResolvedValue({
      utilization:     { toNumber: () => 0.20 },
      derogatoryCount: 2, // missed payments
      score:           650,
      pulledAt:        subDays(now, 5),
    });

    const svc = new FundingRoundService(prisma as never);
    const result = await svc.assessRound2Eligibility(BUSINESS_ID, now);

    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('derogatory'))).toBe(true);
  });

  it('fails when credit score declined', async () => {
    const prisma = makePrismaMock();
    const now    = new Date('2026-03-31');

    prisma.fundingRound.findFirst.mockResolvedValue({
      status:      'completed',
      startedAt:   subMonths(now, 9),
      completedAt: subMonths(now, 8),
    });

    prisma.creditProfile.findFirst
      .mockResolvedValueOnce({
        utilization:     { toNumber: () => 0.25 },
        derogatoryCount: 0,
        score:           660,             // current score
        pulledAt:        subDays(now, 5),
      })
      .mockResolvedValueOnce({ score: 720 }); // score at Round 1 start — declined by 60

    const svc = new FundingRoundService(prisma as never);
    const result = await svc.assessRound2Eligibility(BUSINESS_ID, now);

    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes('declined'))).toBe(true);
    expect(result.creditScoreChange).toBe(-60);
  });

  it('throws when businessId is missing', async () => {
    const svc = new FundingRoundService(makePrismaMock() as never);
    await expect(svc.assessRound2Eligibility('')).rejects.toThrow('businessId is required');
  });
});

// ── Round Comparison ───────────────────────────────────────────────────────────

describe('FundingRoundService.compareRounds', () => {
  it('returns an empty array when no completed rounds exist', async () => {
    const prisma = makePrismaMock();
    prisma.fundingRound.findMany.mockResolvedValue([]);

    const svc = new FundingRoundService(prisma as never);
    const results = await svc.compareRounds(BUSINESS_ID);

    expect(results).toHaveLength(0);
  });

  it('ranks a higher-performing round above a lower-performing one', async () => {
    const prisma = makePrismaMock();
    const now    = new Date('2026-03-31');

    // Round 1: mediocre — 50% attainment, 50% approval, high fees
    const round1 = makeRound({
      id: 'round-1', roundNumber: 1,
      targetCredit: { toNumber: () => 100_000 },
      completedAt:  subMonths(now, 6),
      applications: [
        makeApplication({ status: 'approved', creditLimit: { toNumber: () => 25_000 }, annualFee: { toNumber: () => 500 }, introApr: null }),
        makeApplication({ status: 'declined',  creditLimit: null }),
      ],
    });

    // Round 2: excellent — 100% attainment, 100% approval, 0 fees
    const round2 = makeRound({
      id: 'round-2', roundNumber: 2,
      targetCredit: { toNumber: () => 50_000 },
      completedAt:  subMonths(now, 1),
      applications: [
        makeApplication({ status: 'approved', creditLimit: { toNumber: () => 50_000 }, annualFee: { toNumber: () => 0 }, introApr: { toNumber: () => 0 }, introAprExpiry: addDays(now, 400) }),
      ],
    });

    prisma.fundingRound.findMany.mockResolvedValue([round1, round2]);

    const svc = new FundingRoundService(prisma as never);
    const results = await svc.compareRounds(BUSINESS_ID);

    expect(results).toHaveLength(2);

    const r2Result = results.find((r) => r.roundId === 'round-2')!;
    const r1Result = results.find((r) => r.roundId === 'round-1')!;

    // Round 2 should rank higher (rank 1)
    expect(r2Result.rank).toBeLessThan(r1Result.rank);
    expect(r2Result.compositeScore).toBeGreaterThan(r1Result.compositeScore);
  });

  it('returns results ordered by roundNumber (ascending) for display', async () => {
    const prisma = makePrismaMock();

    const rounds = [
      makeRound({ id: 'r1', roundNumber: 1, completedAt: new Date(), applications: [] }),
      makeRound({ id: 'r2', roundNumber: 2, completedAt: new Date(), applications: [] }),
      makeRound({ id: 'r3', roundNumber: 3, completedAt: new Date(), applications: [] }),
    ];
    prisma.fundingRound.findMany.mockResolvedValue(rounds);

    const svc = new FundingRoundService(prisma as never);
    const results = await svc.compareRounds(BUSINESS_ID);

    expect(results.map((r) => r.roundNumber)).toEqual([1, 2, 3]);
  });
});
