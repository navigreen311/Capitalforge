// ============================================================
// CapitalForge — E2E: Deal Lifecycle Flow
//
// Covers the complete deal journey from business intake through
// graduation and re-stacking:
//
//   business creation → readiness scoring → track assignment
//   credit builder track → milestone progression → stacking unlock
//   suitability → optimize → apply → approve → round complete
//   decline → recovery → reconsideration
//   hardship detection → workout plan → settlement
//   re-stack readiness → trigger → Round 2
//
// All Prisma calls are mocked. Services are tested with real logic
// wired to injected mocks — no HTTP layer involved.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  createFullTestBusiness,
  cleanupTestBusiness,
  createEventBusSpy,
  buildCallerContext,
  type TestBusinessGraph,
} from './helpers/test-setup.js';

// ── Service imports ───────────────────────────────────────────
import {
  calculateFundingReadiness,
  type FundingReadinessInput,
} from '../../src/backend/services/funding-readiness.js';
import {
  buildCreditRoadmap,
  evaluateStackingUnlock,
  evaluateMilestoneProgress,
  SBSS_SCORE_MILESTONES,
  type CreditBuilderRoadmap,
} from '../../src/backend/services/credit-builder.service.js';
import {
  GRADUATION_TRACKS,
  TRACK_THRESHOLDS,
  checkTrackEligibility,
  type GraduationInput,
  setPrismaClient as setGraduationPrisma,
} from '../../src/backend/services/client-graduation.service.js';
import {
  SuitabilityService,
  setPrismaClient as setSuitabilityPrisma,
  NOGO_REASON,
} from '../../src/backend/services/suitability.service.js';
import {
  StackingOptimizerService,
} from '../../src/backend/services/stacking-optimizer.service.js';
import {
  ApplicationPipelineService,
  setPrismaClient as setAppPrisma,
} from '../../src/backend/services/application-pipeline.service.js';
import {
  FundingRoundService,
  setPrismaClient as setRoundPrisma,
} from '../../src/backend/services/funding-round.service.js';
import {
  createDeclineRecovery,
  categorizeDeclineReasons,
  generateReconsiderationLetter,
  setPrismaClient as setDeclinePrisma,
  type CreateDeclineRecoveryInput,
} from '../../src/backend/services/decline-recovery.service.js';
import {
  detectHardshipTrigger,
  openHardshipCase,
  createPaymentPlan,
  calculateSettlementOffer,
  attachPaymentPlan,
  attachSettlementOffer,
  buildCardClosureSequence,
  setPrismaClient as setHardshipPrisma,
  HARDSHIP_THRESHOLDS,
  SETTLEMENT_RATES,
  type HardshipTriggerInput,
  type CardSummary,
} from '../../src/backend/services/hardship.service.js';
import {
  computeRestackReadiness,
  evaluateRestackReadiness,
  buildOutreachTrigger,
  RESTACK_ALERT_THRESHOLD,
  type RestackReadinessInput,
} from '../../src/backend/services/auto-restack.service.js';
import { eventBus } from '../../src/backend/events/event-bus.js';

// ── Shared helpers ────────────────────────────────────────────

function makeGraduationInput(overrides: Partial<GraduationInput> = {}): GraduationInput {
  return {
    ficoScore:           740,
    businessAgeMonths:   36,
    monthlyRevenue:      50_000,
    businessCreditScore: 80,
    tradelineCount:      5,
    currentUtilization:  0.25,
    ...overrides,
  };
}

function makeCardSummaries(businessId: string): CardSummary[] {
  return [
    {
      cardApplicationId: `card-chase-${businessId}`,
      issuer:            'Chase',
      balance:           18_000,
      creditLimit:       25_000,
      annualFee:         95,
      regularApr:        0.2124,
      introAprExpiry:    null,
    },
    {
      cardApplicationId: `card-amex-${businessId}`,
      issuer:            'Amex',
      balance:           12_000,
      creditLimit:       20_000,
      annualFee:         250,
      regularApr:        0.1999,
      introAprExpiry:    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    },
    {
      cardApplicationId: `card-boa-${businessId}`,
      issuer:            'Bank of America',
      balance:           8_000,
      creditLimit:       15_000,
      annualFee:         0,
      regularApr:        0.2299,
      introAprExpiry:    null,
    },
  ];
}

// ── Test suite ─────────────────────────────────────────────────

describe('E2E: Deal Lifecycle Flow', () => {
  let graph: TestBusinessGraph;

  beforeEach(() => {
    graph = createFullTestBusiness({
      tenantIdSuffix:   'deal-lifecycle',
      kybVerified:       true,
      kycVerified:       true,
      withConsent:       true,
      creditScore:       740,
      annualRevenue:     600_000,
      businessAgeYears:  3,
      existingDebt:      20_000,
    });
    setSuitabilityPrisma(graph.prisma);
    setAppPrisma(graph.prisma);
    setRoundPrisma(graph.prisma);
    setGraduationPrisma(graph.prisma);
    setDeclinePrisma(graph.prisma);
    setHardshipPrisma(graph.prisma);
  });

  afterEach(() => {
    cleanupTestBusiness(graph);
    vi.restoreAllMocks();
  });

  // ── Test 1: Business readiness score routes to stacking track

  it('calculates funding readiness score ≥ 70 and routes to stacking track', () => {
    const input: FundingReadinessInput = {
      annualRevenue:       600_000,
      personalCreditScore: 740,
      businessCreditScore: 80,
      dateOfFormation:     new Date(Date.now() - 3 * 365.25 * 24 * 60 * 60 * 1000),
      mcc:                 '5734', // computer and software stores (low risk)
      industry:            'technology consulting',
      existingDebtBalance: 20_000,
    };

    const result = calculateFundingReadiness(input);

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.track).toBe('stacking');
    expect(result.trackLabel).toMatch(/stacking/i);
    expect(result.componentScores.revenue).toBeGreaterThan(0);
    expect(result.componentScores.creditScore).toBeGreaterThan(0);
    expect(result.componentScores.businessAge).toBeGreaterThan(0);
  });

  // ── Test 2: Low-score business routes to credit builder track

  it('routes a low-score business to the credit_builder track', () => {
    const input: FundingReadinessInput = {
      annualRevenue:       48_000,
      personalCreditScore: 580,
      businessCreditScore: 0,
      dateOfFormation:     new Date(Date.now() - 4 * 30 * 24 * 60 * 60 * 1000), // 4 months
      mcc:                 '5999',
      industry:            'retail',
      existingDebtBalance: 80_000,
    };

    const result = calculateFundingReadiness(input);

    expect(result.score).toBeLessThan(70);
    expect(['credit_builder', 'alternative']).toContain(result.track);
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  // ── Test 3: Credit builder roadmap generation ─────────────

  it('generates a credit builder roadmap with DUNS steps and vendor recommendations', () => {
    const input = makeGraduationInput({ ficoScore: 590, tradelineCount: 1 });

    const roadmap: CreditBuilderRoadmap = buildCreditRoadmap(
      graph.business.id,
      'technology consulting',
      input,
    );

    expect(roadmap.businessId).toBe(graph.business.id);
    expect(roadmap.dunsSteps.length).toBeGreaterThan(0);
    expect(roadmap.recommendedVendors.length).toBeGreaterThan(0);
    expect(roadmap.sbssMilestones.length).toBe(SBSS_SCORE_MILESTONES.length);
    expect(roadmap.stackingUnlockStatus).toBeDefined();
    expect(roadmap.generatedAt).toBeInstanceOf(Date);
  });

  // ── Test 4: Milestone progression toward SBSS 80 ──────────

  it('evaluates milestone progression and surfaces required actions for SBSS 80', () => {
    const progress = evaluateMilestoneProgress(55);

    const sbss80Milestone = progress.find((m) => m.targetScore === 80);
    expect(sbss80Milestone).toBeDefined();
    expect(sbss80Milestone!.achieved).toBe(false);
    expect(sbss80Milestone!.gap).toBe(25);
    expect(sbss80Milestone!.requiredActions.length).toBeGreaterThan(0);

    const achievedMilestone = progress.find((m) => m.targetScore === 50);
    expect(achievedMilestone!.achieved).toBe(true);
    expect(achievedMilestone!.requiredActions).toHaveLength(0);
  });

  // ── Test 5: Stacking unlock is blocked before criteria met ─

  it('stacking unlock is blocked when FICO is below threshold', () => {
    const input = makeGraduationInput({
      ficoScore:        580,  // below 620 minimum
      tradelineCount:   1,    // below 2 minimum
    });

    const status = evaluateStackingUnlock(input);

    expect(status.unlocked).toBe(false);
    expect(status.blockingReasons.length).toBeGreaterThan(0);
    expect(status.recommendedActions.length).toBeGreaterThan(0);
    const ficoReason = status.blockingReasons.find((r) => /fico/i.test(r.toLowerCase()) || /620/i.test(r));
    expect(ficoReason).toBeDefined();
  });

  // ── Test 6: Stacking unlock succeeds when all gates pass ──

  it('unlocks stacking track when all graduation gates are met', () => {
    const input = makeGraduationInput({
      ficoScore:          680,
      businessAgeMonths:  12,
      monthlyRevenue:     5_000,
      tradelineCount:     3,
      currentUtilization: 0.40,
    });

    const status = evaluateStackingUnlock(input);

    expect(status.unlocked).toBe(true);
    expect(status.blockingReasons).toHaveLength(0);
    expect(status.track).toBe(GRADUATION_TRACKS.STARTER_STACK);
  });

  // ── Test 7: Suitability approved for qualified business ───

  it('suitability check approves a business meeting all criteria', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new SuitabilityService(graph.prisma);

    const result = await svc.assess({
      businessId:        graph.business.id,
      tenantId:          graph.tenant.id,
      monthlyRevenue:    50_000,
      existingDebt:      20_000,
      creditScore:       740,
      businessAgeMonths: 36,
      industry:          'technology consulting',
      mcc:               '7372',
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.noGoTriggered).toBe(false);
    expect(result.recommendation).toMatch(/APPROVED/i);
    spy.assertEventFired('suitability.assessed');
    spy.restore();
  });

  // ── Test 8: Optimizer produces a ranked application plan ─

  it('optimizer produces a Round 1 card application plan', () => {
    const optimizer = new StackingOptimizerService();

    const plan = optimizer.optimize({
      personal: {
        ficoScore:        740,
        utilizationRatio: 0.22,
        derogatoryCount:  0,
        inquiries12m:     1,
        creditAgeMonths:  84,
      },
      business: {
        businessId:        graph.business.id,
        yearsInOperation:  3,
        annualRevenue:     600_000,
        targetCreditLimit: 120_000,
      },
      existingCards: [],
    });

    expect(plan.rounds).toBeDefined();
    expect(plan.rounds.length).toBeGreaterThan(0);
    expect(plan.rounds[0]!.applications.length).toBeGreaterThan(0);
    expect(plan.totalEstimatedCredit).toBeGreaterThan(0);
  });

  // ── Test 9: Application approved → round completed ────────

  it('approves a card application and completes the funding round', async () => {
    const spy = createEventBusSpy(eventBus);
    const appSvc   = new ApplicationPipelineService(graph.prisma);
    const roundSvc = new FundingRoundService(graph.prisma);
    const ctx      = buildCallerContext(graph, 'compliance_officer');

    graph.prisma.cardApplication.findFirst = vi.fn().mockResolvedValue({
      ...graph.application,
      status:    'submitted',
      tenantId:  graph.tenant.id,
      createdBy: graph.advisorUser.id,
    });
    graph.prisma.cardApplication.update = vi.fn().mockResolvedValue({
      ...graph.application,
      status: 'approved',
    });

    const approved = await appSvc.transitionStatus({
      applicationId: graph.application.id,
      tenantId:      graph.tenant.id,
      toStatus:      'approved',
    }, ctx);

    expect(approved.status).toBe('approved');
    spy.assertEventFired('application.approved');

    // Complete the round
    graph.prisma.fundingRound.findUnique = vi.fn().mockResolvedValue({
      ...graph.fundingRound,
      status:       'planning',
      applications: [{ ...graph.application, status: 'approved' }],
    });
    graph.prisma.fundingRound.update = vi.fn().mockResolvedValue({
      ...graph.fundingRound,
      status: 'completed',
    });
    graph.prisma.cardApplication.findMany = vi.fn().mockResolvedValue([
      { ...graph.application, status: 'approved' },
    ]);

    const round = await roundSvc.completeRound({
      fundingRoundId: graph.fundingRound.id,
      tenantId:       graph.tenant.id,
    }, ctx);

    expect(round.status).toBe('completed');
    spy.assertEventFired('funding_round.completed');
    spy.restore();
  });

  // ── Test 10: Decline → recovery record created ────────────

  it('creates a decline recovery record and categorizes decline reasons', async () => {
    const spy = createEventBusSpy(eventBus);

    const declineRecord = {
      id:                    `decline-${graph.application.id}`,
      tenantId:              graph.tenant.id,
      businessId:            graph.business.id,
      applicationId:         graph.application.id,
      issuer:                'Chase',
      declineReasons:        [],
      adverseActionRaw:      null,
      reconsiderationStatus: 'pending',
      reapplyCooldownDate:   new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      letterGenerated:       false,
      createdAt:             new Date(),
      updatedAt:             new Date(),
    };

    (graph.prisma as unknown as Record<string, unknown>).declineRecovery = {
      create: vi.fn().mockResolvedValue(declineRecord),
    };

    const input: CreateDeclineRecoveryInput = {
      tenantId:       graph.tenant.id,
      businessId:     graph.business.id,
      applicationId:  graph.application.id,
      issuer:         'Chase',
      declineReasons: [
        { code: '08', text: 'Too many recent inquiries last 12 months' },
        { code: '10', text: 'Proportion of balances to credit limits too high' },
      ],
      declinedAt: new Date(),
    };

    const recovery = await createDeclineRecovery(input);

    expect(recovery.applicationId).toBe(graph.application.id);
    expect(recovery.issuer).toBe('Chase');
    expect(recovery.reapplyCooldownDate).toBeInstanceOf(Date);
    spy.assertEventFired('decline.recovery.created');
    spy.restore();
  });

  // ── Test 11: Reconsideration letter generation ────────────

  it('generates an ECOA-compliant reconsideration letter for a declined application', () => {
    const reasons = categorizeDeclineReasons([
      { text: 'Too many inquiries in the past 12 months' },
      { text: 'Credit utilization too high on revolving accounts' },
    ]);

    const letter = generateReconsiderationLetter(
      graph.business.id,
      graph.business.legalName,
      'Chase',
      reasons,
      graph.application.id,
    );

    expect(letter.letterId).toBeDefined();
    expect(letter.subject).toMatch(/reconsideration/i);
    expect(letter.body).toMatch(/ECOA/i);
    expect(letter.body).toMatch(/FCRA/i);
    expect(letter.body).toContain(graph.business.legalName);
    expect(letter.declineReasons).toHaveLength(2);
  });

  // ── Test 12: Hardship detection — combined trigger ────────

  it('detects a combined hardship trigger (missed payments + utilization spike)', () => {
    const input: HardshipTriggerInput = {
      missedPaymentCount: 2,
      currentUtilization: 0.88,
      totalBalance:       38_000,
      monthlyRevenue:     50_000,
      cards:              makeCardSummaries(graph.business.id),
    };

    const trigger = detectHardshipTrigger(input);

    expect(trigger.shouldOpenCase).toBe(true);
    expect(trigger.triggerType).toBe('combined');
    expect(trigger.severity).toBe('critical');  // combined escalates serious → critical
    expect(trigger.reasons.length).toBeGreaterThan(0);
  });

  // ── Test 13: Hardship case opened and payment plan attached ─

  it('opens a hardship case, creates a payment plan, and attaches it to the case', async () => {
    const spy = createEventBusSpy(eventBus);

    const hardshipCaseRecord = {
      id:          `hcase-${graph.business.id}`,
      tenantId:    graph.tenant.id,
      businessId:  graph.business.id,
      triggerType: 'combined',
      severity:    'critical',
      status:      'open',
      createdAt:   new Date(),
      updatedAt:   new Date(),
    };

    (graph.prisma as unknown as Record<string, unknown>).hardshipCase = {
      create: vi.fn().mockResolvedValue(hardshipCaseRecord),
      update: vi.fn().mockResolvedValue({ ...hardshipCaseRecord, status: 'payment_plan' }),
    };

    const hardshipInput: HardshipTriggerInput = {
      missedPaymentCount: 2,
      currentUtilization: 0.85,
      totalBalance:       38_000,
      monthlyRevenue:     50_000,
      cards:              makeCardSummaries(graph.business.id),
    };

    const { caseId, trigger } = await openHardshipCase(
      graph.business.id,
      graph.tenant.id,
      hardshipInput,
    );

    expect(caseId).toBeDefined();
    expect(trigger.shouldOpenCase).toBe(true);
    spy.assertEventFired('hardship.opened');

    // Create and attach payment plan
    const plan = createPaymentPlan(
      makeCardSummaries(graph.business.id),
      50_000,
      trigger.severity,
    );

    expect(plan.planId).toBeDefined();
    expect(plan.totalMonthly).toBeGreaterThan(0);
    expect(plan.items.length).toBe(3);
    expect(plan.termMonths).toBeGreaterThan(0);
    expect(plan.termMonths).toBeLessThanOrEqual(60);

    await attachPaymentPlan(caseId, graph.tenant.id, plan);
    spy.assertEventFired('hardship.payment_plan.created');
    spy.restore();
  });

  // ── Test 14: Settlement offer calculation and attachment ──

  it('calculates a 55-cent-on-the-dollar settlement for a critical hardship case', async () => {
    const spy = createEventBusSpy(eventBus);

    const hardshipCaseRecord = {
      id:          `hcase-settle-${graph.business.id}`,
      tenantId:    graph.tenant.id,
      businessId:  graph.business.id,
      triggerType: 'combined',
      severity:    'critical',
      status:      'payment_plan',
      createdAt:   new Date(),
      updatedAt:   new Date(),
    };

    (graph.prisma as unknown as Record<string, unknown>).hardshipCase = {
      create: vi.fn().mockResolvedValue(hardshipCaseRecord),
      update: vi.fn().mockResolvedValue({ ...hardshipCaseRecord, status: 'settlement' }),
    };

    const totalBalance = 38_000;
    const offer = calculateSettlementOffer(totalBalance, 'critical');

    expect(offer.offerId).toBeDefined();
    expect(offer.offerRate).toBe(SETTLEMENT_RATES.critical); // 0.55
    expect(offer.offerAmount).toBeCloseTo(totalBalance * 0.55, 2);
    expect(offer.savingsAmount).toBeCloseTo(totalBalance * 0.45, 2);
    expect(offer.expiresAt).toBeInstanceOf(Date);

    await attachSettlementOffer(hardshipCaseRecord.id, graph.tenant.id, offer);
    spy.assertEventFired('hardship.settlement.offered');
    spy.restore();
  });

  // ── Test 15: Card closure sequence — highest fee first ────

  it('sequences card closures with highest annual-fee card first', () => {
    const cards = makeCardSummaries(graph.business.id);
    // Amex has $250 fee → Chase has $95 → BoA has $0

    const sequence = buildCardClosureSequence(cards);

    expect(sequence.sequence[0]!.issuer).toBe('Amex');   // highest fee: $250
    expect(sequence.sequence[0]!.closeFirst).toBe(true);
    expect(sequence.sequence[1]!.issuer).toBe('Chase');  // $95
    expect(sequence.sequence[2]!.issuer).toBe('Bank of America'); // $0
    expect(sequence.rationale).toBeDefined();
  });

  // ── Test 16: Re-stack readiness — active hardship blocks ─

  it('returns score 0 and not_ready band when active hardship case is open', () => {
    const input: RestackReadinessInput = {
      onTimePaymentMonths:      12,
      missedPaymentsSinceHardship: 0,
      currentUtilization:       0.15,
      baselineUtilization:      0.85,
      currentCreditScore:       720,
      baselineCreditScore:      640,
      monthsSinceLastEvent:     12,
      activeHardshipCase:       true,
    };

    const result = computeRestackReadiness(input);

    expect(result.score).toBe(0);
    expect(result.band).toBe('not_ready');
    expect(result.alertFired).toBe(false);
    expect(result.recommendations[0]).toMatch(/hardship/i);
  });

  // ── Test 17: Re-stack readiness crosses alert threshold ───

  it('fires advisor alert when re-stack score reaches threshold (≥ 70)', async () => {
    const spy = createEventBusSpy(eventBus);

    const input: RestackReadinessInput = {
      onTimePaymentMonths:      12,  // 30 pts
      missedPaymentsSinceHardship: 0,
      currentUtilization:       0.18, // 16 pts utilization + improvement below
      baselineUtilization:      0.85, // 50%+ improvement → 10 pts
      currentCreditScore:       720,  // 15 pts
      baselineCreditScore:      660,  // +60 gain → 10 pts
      monthsSinceLastEvent:     12,   // 9 pts time
      activeHardshipCase:       false,
    };

    const result = await evaluateRestackReadiness(
      graph.business.id,
      graph.tenant.id,
      graph.advisorUser.id,
      input,
    );

    expect(result.score).toBeGreaterThanOrEqual(RESTACK_ALERT_THRESHOLD);
    expect(result.alertFired).toBe(true);
    expect(['ready', 'optimal']).toContain(result.band);
    spy.assertEventFired('restack.trigger.fired');
    spy.restore();
  });

  // ── Test 18: Outreach trigger built for optimal band ──────

  it('builds an SMS outreach trigger for a business at optimal re-stack band', () => {
    const trigger = buildOutreachTrigger(
      graph.business.id,
      graph.advisorUser.id,
      90,
      'optimal',
    );

    expect(trigger.triggerId).toBeDefined();
    expect(trigger.businessId).toBe(graph.business.id);
    expect(trigger.channel).toBe('sms');
    expect(trigger.score).toBe(90);
    expect(trigger.band).toBe('optimal');
    expect(trigger.message).toMatch(/optimal/i);
    expect(trigger.scheduledAt).toBeInstanceOf(Date);
    // Scheduled 1 business day out
    expect(trigger.scheduledAt.getTime()).toBeGreaterThan(Date.now());
  });
});
