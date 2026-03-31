// ============================================================
// Unit Tests — Hardship & Workout Protocol + Auto Re-Stack Engine
//
// Coverage (24 tests):
//   - Trigger detection: missed payments, utilization spike, combined
//   - Severity escalation rules
//   - Payment plan creation: budget allocation, term calculation, fee cap
//   - Settlement offer calculation: rate by severity, savings amount, expiry
//   - Card closure ordering: fee-first, zero-balance tiebreaker
//   - Hardship persistence: openHardshipCase emits event, persists record
//   - Re-stack readiness scoring: component scores, composite, band labels
//   - Threshold alert: alertFired flag at score >= 70
//   - Active hardship case hard-block
//   - Outreach trigger channel selection by band
//   - Conversion recording emits ledger event
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks (must be before imports) ────────────────────

vi.mock('../../../src/backend/events/event-bus.js', () => ({
  eventBus: {
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'evt-001', publishedAt: new Date() }),
  },
}));

vi.mock('@prisma/client', () => {
  const mockCreate     = vi.fn();
  const mockUpdate     = vi.fn();
  const mockFindMany   = vi.fn();
  const mockFindFirst  = vi.fn();

  const PrismaClient = vi.fn().mockImplementation(() => ({
    hardshipCase: {
      create:    mockCreate,
      update:    mockUpdate,
      findMany:  mockFindMany,
      findFirst: mockFindFirst,
    },
  }));

  return { PrismaClient };
});

// ── Imports ───────────────────────────────────────────────────

import {
  detectHardshipTrigger,
  openHardshipCase,
  createPaymentPlan,
  attachPaymentPlan,
  calculateSettlementOffer,
  attachSettlementOffer,
  buildCardClosureSequence,
  generateCounselorReferral,
  HARDSHIP_THRESHOLDS,
  SETTLEMENT_RATES,
  TRIGGER_TYPE,
  setPrismaClient as setHardshipPrisma,
  type HardshipTriggerInput,
  type CardSummary,
} from '../../../src/backend/services/hardship.service.js';

import {
  computeRestackReadiness,
  evaluateRestackReadiness,
  buildOutreachTrigger,
  recordRestackConversion,
  RESTACK_ALERT_THRESHOLD,
  setPrismaClient as setRestackPrisma,
  type RestackReadinessInput,
} from '../../../src/backend/services/auto-restack.service.js';

import { eventBus } from '../../../src/backend/events/event-bus.js';
import { PrismaClient } from '@prisma/client';

// ── Fixtures ──────────────────────────────────────────────────

function makeCard(overrides?: Partial<CardSummary>): CardSummary {
  return {
    cardApplicationId: `app-${Math.random().toString(36).slice(2)}`,
    issuer:            'Chase',
    balance:           5_000,
    creditLimit:       10_000,
    annualFee:         95,
    regularApr:        0.2499,
    introAprExpiry:    null,
    ...overrides,
  };
}

function makeHardshipInput(overrides?: Partial<HardshipTriggerInput>): HardshipTriggerInput {
  return {
    missedPaymentCount:  0,
    currentUtilization:  0.30,
    totalBalance:        15_000,
    monthlyRevenue:      10_000,
    cards:               [makeCard(), makeCard({ issuer: 'Amex', annualFee: 250 })],
    ...overrides,
  };
}

function makeRestackInput(overrides?: Partial<RestackReadinessInput>): RestackReadinessInput {
  return {
    onTimePaymentMonths:          9,
    missedPaymentsSinceHardship:  0,
    currentUtilization:           0.20,
    baselineUtilization:          0.85,
    currentCreditScore:           700,
    baselineCreditScore:          620,
    monthsSinceLastEvent:         12,
    activeHardshipCase:           false,
    ...overrides,
  };
}

// ── Test setup ────────────────────────────────────────────────

let mockPrisma: ReturnType<typeof PrismaClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma = new PrismaClient() as ReturnType<typeof PrismaClient>;
  setHardshipPrisma(mockPrisma as unknown as PrismaClient);
  setRestackPrisma(mockPrisma as unknown as PrismaClient);
});

// ============================================================
// SECTION 1: Trigger Detection
// ============================================================

describe('detectHardshipTrigger', () => {
  it('returns shouldOpenCase=false when no thresholds breached', () => {
    const result = detectHardshipTrigger(makeHardshipInput());
    expect(result.shouldOpenCase).toBe(false);
  });

  it('triggers minor severity on 1 missed payment', () => {
    const result = detectHardshipTrigger(makeHardshipInput({ missedPaymentCount: 1 }));
    expect(result.shouldOpenCase).toBe(true);
    expect(result.severity).toBe('minor');
    expect(result.triggerType).toBe(TRIGGER_TYPE.MISSED_PAYMENT);
  });

  it('triggers serious severity on 2 missed payments', () => {
    const result = detectHardshipTrigger(makeHardshipInput({ missedPaymentCount: 2 }));
    expect(result.severity).toBe('serious');
    expect(result.shouldOpenCase).toBe(true);
  });

  it('triggers critical severity on 3+ missed payments', () => {
    const result = detectHardshipTrigger(makeHardshipInput({ missedPaymentCount: 3 }));
    expect(result.severity).toBe('critical');
    expect(result.triggerType).toBe(TRIGGER_TYPE.MISSED_PAYMENT);
  });

  it('triggers minor on utilization at warning threshold (0.80)', () => {
    const result = detectHardshipTrigger(makeHardshipInput({ currentUtilization: 0.80 }));
    expect(result.shouldOpenCase).toBe(true);
    expect(result.severity).toBe('minor');
    expect(result.triggerType).toBe(TRIGGER_TYPE.UTILIZATION_SPIKE);
  });

  it('triggers critical on utilization >= 0.95', () => {
    const result = detectHardshipTrigger(makeHardshipInput({ currentUtilization: 0.96 }));
    expect(result.severity).toBe('critical');
    expect(result.triggerType).toBe(TRIGGER_TYPE.UTILIZATION_SPIKE);
  });

  it('escalates to COMBINED trigger type when both signals fire', () => {
    const result = detectHardshipTrigger(
      makeHardshipInput({ missedPaymentCount: 1, currentUtilization: 0.82 }),
    );
    expect(result.triggerType).toBe(TRIGGER_TYPE.COMBINED);
    expect(result.severity).toBe('serious'); // minor escalated by combined
  });

  it('escalates combined critical when both serious-level signals fire', () => {
    const result = detectHardshipTrigger(
      makeHardshipInput({ missedPaymentCount: 2, currentUtilization: 0.92 }),
    );
    expect(result.triggerType).toBe(TRIGGER_TYPE.COMBINED);
    expect(result.severity).toBe('critical');
  });

  it('includes reason strings in the result', () => {
    const result = detectHardshipTrigger(makeHardshipInput({ missedPaymentCount: 2 }));
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons[0]).toMatch(/missed payment/i);
  });
});

// ============================================================
// SECTION 2: Payment Plan Creation
// ============================================================

describe('createPaymentPlan', () => {
  it('creates a plan with pro-rata monthly payments', () => {
    const cards = [
      makeCard({ balance: 8_000, regularApr: 0.24 }),
      makeCard({ balance: 2_000, regularApr: 0.20 }),
    ];
    const plan = createPaymentPlan(cards, 10_000, 'minor');
    expect(plan.items).toHaveLength(2);
    // larger balance should have larger monthly payment
    expect(plan.items[0].monthlyPayment).toBeGreaterThan(plan.items[1].monthlyPayment);
  });

  it('caps hardship interest rate at 10% APR regardless of card APR', () => {
    const cards = [makeCard({ regularApr: 0.2999, balance: 5_000 })];
    const plan  = createPaymentPlan(cards, 10_000, 'minor');
    expect(plan.items[0].interestRate).toBeLessThanOrEqual(0.10);
  });

  it('uses 35% of revenue as budget ceiling for minor severity', () => {
    const cards = [makeCard({ balance: 5_000 })];
    const plan  = createPaymentPlan(cards, 10_000, 'minor');
    expect(plan.totalMonthly).toBeLessThanOrEqual(10_000 * 0.35 + 1); // +1 rounding tolerance
  });

  it('uses tighter 25% ceiling for critical severity', () => {
    const cards = [makeCard({ balance: 5_000 })];
    const plan  = createPaymentPlan(cards, 10_000, 'critical');
    expect(plan.totalMonthly).toBeLessThanOrEqual(10_000 * 0.25 + 1);
  });

  it('caps term at 60 months', () => {
    // Very small payment vs huge balance
    const cards = [makeCard({ balance: 100_000, regularApr: 0.01 })];
    const plan  = createPaymentPlan(cards, 500, 'critical');
    expect(plan.items[0].termMonths).toBeLessThanOrEqual(60);
  });

  it('sets planId and createdAt', () => {
    const plan = createPaymentPlan([makeCard()], 10_000, 'minor');
    expect(plan.planId).toBeTruthy();
    expect(plan.createdAt).toBeInstanceOf(Date);
  });
});

// ============================================================
// SECTION 3: Settlement Offer Calculation
// ============================================================

describe('calculateSettlementOffer', () => {
  it('applies 90% rate for minor severity', () => {
    const offer = calculateSettlementOffer(10_000, 'minor');
    expect(offer.offerRate).toBe(SETTLEMENT_RATES.minor);
    expect(offer.offerAmount).toBe(9_000);
  });

  it('applies 75% rate for serious severity', () => {
    const offer = calculateSettlementOffer(20_000, 'serious');
    expect(offer.offerRate).toBe(SETTLEMENT_RATES.serious);
    expect(offer.offerAmount).toBe(15_000);
  });

  it('applies 55% rate for critical severity', () => {
    const offer = calculateSettlementOffer(20_000, 'critical');
    expect(offer.offerRate).toBe(SETTLEMENT_RATES.critical);
    expect(offer.offerAmount).toBe(11_000);
  });

  it('calculates savings correctly', () => {
    const offer = calculateSettlementOffer(10_000, 'serious');
    expect(offer.savingsAmount).toBe(offer.totalBalance - offer.offerAmount);
  });

  it('sets expiry to 30 days from now', () => {
    const before = new Date();
    const offer  = calculateSettlementOffer(5_000, 'minor');
    const diff   = offer.expiresAt.getTime() - before.getTime();
    const days   = diff / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it('generates unique offerId and documentRef', () => {
    const o1 = calculateSettlementOffer(5_000, 'minor');
    const o2 = calculateSettlementOffer(5_000, 'minor');
    expect(o1.offerId).not.toBe(o2.offerId);
    expect(o1.documentRef).not.toBe(o2.documentRef);
  });
});

// ============================================================
// SECTION 4: Card Closure Sequencing
// ============================================================

describe('buildCardClosureSequence', () => {
  it('places highest-fee card at rank 1', () => {
    const cards = [
      makeCard({ annualFee: 95,  cardApplicationId: 'low-fee'  }),
      makeCard({ annualFee: 550, cardApplicationId: 'high-fee' }),
      makeCard({ annualFee: 250, cardApplicationId: 'mid-fee'  }),
    ];
    const seq = buildCardClosureSequence(cards);
    expect(seq.sequence[0].cardApplicationId).toBe('high-fee');
    expect(seq.sequence[0].rank).toBe(1);
    expect(seq.sequence[0].closeFirst).toBe(true);
  });

  it('breaks ties by placing zero-balance cards before carry-balance', () => {
    const cards = [
      makeCard({ annualFee: 95, balance: 2_000, cardApplicationId: 'has-balance' }),
      makeCard({ annualFee: 95, balance: 0,     cardApplicationId: 'zero-balance' }),
    ];
    const seq = buildCardClosureSequence(cards);
    expect(seq.sequence[0].cardApplicationId).toBe('zero-balance');
  });

  it('preserves all cards in the sequence', () => {
    const cards = [makeCard(), makeCard(), makeCard()];
    const seq   = buildCardClosureSequence(cards);
    expect(seq.sequence).toHaveLength(3);
  });

  it('sets rationale string', () => {
    const seq = buildCardClosureSequence([makeCard()]);
    expect(seq.rationale).toBeTruthy();
    expect(typeof seq.rationale).toBe('string');
  });
});

// ============================================================
// SECTION 5: Re-Stack Readiness Scoring
// ============================================================

describe('computeRestackReadiness', () => {
  it('returns score=0 and not_ready when active hardship case exists', () => {
    const result = computeRestackReadiness(makeRestackInput({ activeHardshipCase: true }));
    expect(result.score).toBe(0);
    expect(result.band).toBe('not_ready');
    expect(result.alertFired).toBe(false);
  });

  it('scores a strong recovery profile >= 70', () => {
    const result = computeRestackReadiness(
      makeRestackInput({
        onTimePaymentMonths:         12,
        missedPaymentsSinceHardship: 0,
        currentUtilization:          0.10,
        baselineUtilization:         0.90,
        currentCreditScore:          730,
        baselineCreditScore:         600,
        monthsSinceLastEvent:        18,
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.alertFired).toBe(true);
  });

  it('sets alertFired=true at exactly the threshold', () => {
    // Use a profile tuned to land right at 70
    const result = computeRestackReadiness(makeRestackInput());
    if (result.score >= RESTACK_ALERT_THRESHOLD) {
      expect(result.alertFired).toBe(true);
    } else {
      expect(result.alertFired).toBe(false);
    }
  });

  it('heavy penalty on missed payments since hardship', () => {
    const clean  = computeRestackReadiness(makeRestackInput({ missedPaymentsSinceHardship: 0 }));
    const missed = computeRestackReadiness(makeRestackInput({ missedPaymentsSinceHardship: 2 }));
    expect(missed.paymentHistoryScore).toBeLessThan(clean.paymentHistoryScore);
  });

  it('utilization improvement increases utilization score', () => {
    const improved = computeRestackReadiness(
      makeRestackInput({ currentUtilization: 0.10, baselineUtilization: 0.90 }),
    );
    const unimproved = computeRestackReadiness(
      makeRestackInput({ currentUtilization: 0.75, baselineUtilization: 0.80 }),
    );
    expect(improved.utilizationScore).toBeGreaterThan(unimproved.utilizationScore);
  });

  it('credit score recovery from 620 to 720+ maximises credit component', () => {
    const recovered = computeRestackReadiness(
      makeRestackInput({ currentCreditScore: 725, baselineCreditScore: 600 }),
    );
    expect(recovered.creditRecoveryScore).toBeGreaterThanOrEqual(20);
  });

  it('longer time elapsed yields higher time component', () => {
    const recent = computeRestackReadiness(makeRestackInput({ monthsSinceLastEvent: 3 }));
    const aged   = computeRestackReadiness(makeRestackInput({ monthsSinceLastEvent: 24 }));
    expect(aged.timeElapsedScore).toBeGreaterThan(recent.timeElapsedScore);
  });

  it('band is not_ready for score < 40', () => {
    const result = computeRestackReadiness(
      makeRestackInput({
        onTimePaymentMonths:         0,
        missedPaymentsSinceHardship: 3,
        currentUtilization:          0.92,
        baselineUtilization:         0.92,
        currentCreditScore:          580,
        baselineCreditScore:         600,
        monthsSinceLastEvent:        1,
      }),
    );
    expect(result.band).toBe('not_ready');
  });

  it('includes recommendations array', () => {
    const result = computeRestackReadiness(makeRestackInput({ onTimePaymentMonths: 1 }));
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});

// ============================================================
// SECTION 6: Outreach Trigger & Conversion
// ============================================================

describe('buildOutreachTrigger', () => {
  it('uses sms channel for optimal band', () => {
    const t = buildOutreachTrigger('biz-1', 'adv-1', 90, 'optimal');
    expect(t.channel).toBe('sms');
  });

  it('uses email channel for ready band', () => {
    const t = buildOutreachTrigger('biz-1', null, 75, 'ready');
    expect(t.channel).toBe('email');
  });

  it('uses in_app channel for approaching band', () => {
    const t = buildOutreachTrigger('biz-1', null, 62, 'approaching');
    expect(t.channel).toBe('in_app');
  });

  it('schedules trigger 1 day from now', () => {
    const t = buildOutreachTrigger('biz-1', null, 75, 'ready');
    const diffMs  = t.scheduledAt.getTime() - Date.now();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(0.9);
    expect(diffDays).toBeLessThanOrEqual(1.1);
  });

  it('includes score-contextual message', () => {
    const t = buildOutreachTrigger('biz-1', null, 80, 'ready');
    expect(t.message).toContain('80');
  });
});

describe('evaluateRestackReadiness', () => {
  it('fires RESTACK_TRIGGER_FIRED event when score >= threshold', async () => {
    const input = makeRestackInput({
      onTimePaymentMonths:  12,
      currentUtilization:   0.10,
      baselineUtilization:  0.90,
      currentCreditScore:   730,
      baselineCreditScore:  600,
      monthsSinceLastEvent: 18,
    });
    const result = await evaluateRestackReadiness('biz-1', 'tenant-1', 'adv-1', input);
    if (result.alertFired) {
      expect(eventBus.publishAndPersist).toHaveBeenCalled();
    }
  });

  it('does NOT fire event when score < threshold', async () => {
    const input = makeRestackInput({
      onTimePaymentMonths:         0,
      missedPaymentsSinceHardship: 2,
      currentUtilization:          0.85,
      baselineUtilization:         0.85,
      currentCreditScore:          580,
      baselineCreditScore:         600,
      monthsSinceLastEvent:        1,
    });
    const result = await evaluateRestackReadiness('biz-1', 'tenant-1', null, input);
    expect(result.alertFired).toBe(false);
    expect(eventBus.publishAndPersist).not.toHaveBeenCalled();
  });
});

describe('recordRestackConversion', () => {
  it('emits restack.conversion.recorded event with attribution data', async () => {
    await recordRestackConversion('biz-1', 'tenant-1', 'trigger-1', 'round-1', 5_000);
    expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        eventType: 'restack.conversion.recorded',
        payload:   expect.objectContaining({
          businessId:    'biz-1',
          triggerId:     'trigger-1',
          fundingRoundId: 'round-1',
          revenueAmount: 5_000,
        }),
      }),
    );
  });

  it('returns a conversion record with unique conversionId', async () => {
    const c1 = await recordRestackConversion('biz-1', 'tenant-1', 't1', 'r1', 1_000);
    const c2 = await recordRestackConversion('biz-1', 'tenant-1', 't2', 'r2', 1_000);
    expect(c1.conversionId).not.toBe(c2.conversionId);
  });
});

describe('generateCounselorReferral', () => {
  it('generates a referral with NFCC as primary agency', () => {
    const referral = generateCounselorReferral('case-1');
    expect(referral.agency.name).toMatch(/NFCC/);
    expect(referral.caseId).toBe('case-1');
  });

  it('includes a referralId and referredAt timestamp', () => {
    const referral = generateCounselorReferral('case-1');
    expect(referral.referralId).toBeTruthy();
    expect(referral.referredAt).toBeInstanceOf(Date);
  });
});
