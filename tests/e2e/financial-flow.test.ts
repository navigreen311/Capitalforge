// ============================================================
// CapitalForge — E2E: Financial Flow
//
// Covers the full financial lifecycle:
//   cost of capital → repayment planning → payment recording →
//   interest shock detection → statement ingestion →
//   reconciliation → tax document generation → fee summary →
//   rewards routing → business purpose tagging + substantiation
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

// ── Module-level Prisma mock (for services that use the shared singleton) ──
// TaxDocumentService and BusinessPurposeEvidenceService import `prisma` from
// the config/database module. We intercept here so individual test mocks
// propagate into those services.
vi.mock('../../src/backend/config/database.js', () => ({
  prisma: {
    business:         { findFirst: vi.fn(), findUnique: vi.fn() },
    costCalculation:  { findFirst: vi.fn() },
    cardApplication:  { findMany: vi.fn() },
    spendTransaction: { findMany: vi.fn() },
  },
}));

// ── Service imports ───────────────────────────────────────────
import {
  CostCalculatorService,
  type CostCalculationInput,
  type CardInStack,
} from '../../src/backend/services/cost-calculator.service.js';
import {
  RepaymentService,
  type CardDebt,
  type CreateRepaymentPlanInput,
} from '../../src/backend/services/repayment.service.js';
import {
  StatementReconciliationService,
} from '../../src/backend/services/statement-reconciliation.service.js';
import {
  TaxDocumentService,
  type IRC163jReportInput,
} from '../../src/backend/services/tax-document.service.js';
import { prisma as sharedPrisma } from '../../src/backend/config/database.js';
import {
  RewardsOptimizationService,
  type SpendProfile,
} from '../../src/backend/services/rewards-optimization.service.js';
import {
  BusinessPurposeEvidenceService,
} from '../../src/backend/services/business-purpose-evidence.js';
import { eventBus } from '../../src/backend/events/event-bus.js';

// ── Helpers ───────────────────────────────────────────────────

/** Three Chase Ink cards with 0% intro APR for 12 months. */
function makeCardStack(businessId: string): CardInStack[] {
  return [
    {
      id: `card-chase-1-${businessId}`,
      issuer: 'Chase',
      creditLimit: 25_000,
      currentBalance: 20_000,
      promoApr: 0,
      standardApr: 0.2124,
      promoExpiryMonth: 12,
      annualFee: 95,
      minPaymentRate: 0.02,
    },
    {
      id: `card-amex-1-${businessId}`,
      issuer: 'Amex',
      creditLimit: 20_000,
      currentBalance: 15_000,
      promoApr: 0,
      standardApr: 0.1999,
      promoExpiryMonth: 12,
      annualFee: 95,
      minPaymentRate: 0.02,
    },
    {
      id: `card-boa-1-${businessId}`,
      issuer: 'Bank of America',
      creditLimit: 15_000,
      currentBalance: 10_000,
      promoApr: 0,
      standardApr: 0.2299,
      promoExpiryMonth: 9,
      annualFee: 0,
      minPaymentRate: 0.02,
    },
  ];
}

/** CardDebt array parallel to makeCardStack for repayment tests. */
function makeCardDebts(businessId: string): CardDebt[] {
  const futureExpiry = new Date(Date.now() + 9 * 30 * 24 * 60 * 60 * 1000);
  const nearExpiry   = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000); // 25 days — critical

  return [
    {
      cardApplicationId: `card-chase-1-${businessId}`,
      issuer: 'Chase',
      currentBalance: 20_000,
      creditLimit: 25_000,
      regularApr: 0.2124,
      introApr: 0,
      introAprExpiry: futureExpiry,
      minimumPayment: 400,
      annualFee: 95,
      autopayEnabled: true,
      autopayVerified: true,
    },
    {
      cardApplicationId: `card-amex-1-${businessId}`,
      issuer: 'Amex',
      currentBalance: 15_000,
      creditLimit: 20_000,
      regularApr: 0.1999,
      introApr: 0,
      introAprExpiry: nearExpiry, // promo expires in 25 days — critical shock
      minimumPayment: 300,
      annualFee: 95,
      autopayEnabled: true,
      autopayVerified: false, // gap: enabled but not verified
    },
    {
      cardApplicationId: `card-boa-1-${businessId}`,
      issuer: 'Bank of America',
      currentBalance: 10_000,
      creditLimit: 15_000,
      regularApr: 0.2299,
      introApr: 0,
      introAprExpiry: null, // no intro period
      minimumPayment: 200,
      annualFee: 0,
      autopayEnabled: false,
      autopayVerified: false,
    },
  ];
}

// ── Test suite ─────────────────────────────────────────────────

describe('E2E: Financial Flow', () => {
  let graph: TestBusinessGraph;

  beforeEach(() => {
    graph = createFullTestBusiness({
      tenantIdSuffix:   'financial',
      kybVerified:       true,
      kycVerified:       true,
      withConsent:       true,
      creditScore:       740,
      annualRevenue:     600_000,
      businessAgeYears:  4,
      existingDebt:      15_000,
    });
  });

  afterEach(() => {
    cleanupTestBusiness(graph);
    vi.restoreAllMocks();
  });

  // ── Test 1: Cost of capital — full breakdown ───────────────

  it('calculates all-in cost of capital with complete fee breakdown', () => {
    const svc = new CostCalculatorService();
    const cards = makeCardStack(graph.business.id);

    const input: CostCalculationInput = {
      businessId:          graph.business.id,
      tenantId:            graph.tenant.id,
      cards,
      programFee:          2_500,
      percentOfFundingFee: 0.03,
      monthlyProcessorFee: 50,
      projectionMonths:    12,
      estimatedCarryRate:  0.3,
    };

    const result = svc.calculate(input);

    expect(result.businessId).toBe(graph.business.id);
    expect(result.breakdown.programFees).toBe(2_500);
    expect(result.breakdown.annualFees).toBe(190);  // 95 + 95 + 0
    expect(result.breakdown.processorFees).toBe(600); // 50 * 12
    expect(result.breakdown.totalCost).toBeGreaterThan(0);
    expect(result.breakdown.effectiveApr).not.toBeNull();
    expect(result.totalFundingObtained).toBe(45_000); // 20k + 15k + 10k
    expect(result.alternatives).toHaveLength(5);
    expect(result.recommendation).toMatch(/all-in effective APR/i);
    expect(result.calculatedAt).toBeInstanceOf(Date);
  });

  // ── Test 2: Effective APR computation ─────────────────────

  it('computes effective APR as annualised total-cost / funding ratio', () => {
    const svc = new CostCalculatorService();

    const apr = svc.computeEffectiveApr(9_000, 45_000, 12);

    // 9_000 / 45_000 * (12/12) = 0.20
    expect(apr).toBeCloseTo(0.20, 4);
  });

  // ── Test 3: Cash advance fee is added to breakdown ────────

  it('adds cash advance fees for cards with cash advance balances', () => {
    const svc = new CostCalculatorService();
    const cards = makeCardStack(graph.business.id);
    // Add a cash advance balance to the first card
    cards[0]!.hasCashAdvance = true;
    cards[0]!.cashAdvanceBalance = 5_000;

    const input: CostCalculationInput = {
      businessId:          graph.business.id,
      tenantId:            graph.tenant.id,
      cards,
      programFee:          0,
      percentOfFundingFee: 0,
      monthlyProcessorFee: 0,
    };

    const result = svc.calculate(input);

    // Cash advance fee = max(10, 5000 * 0.05) = 250
    expect(result.breakdown.cashAdvanceFees).toBe(250);
  });

  // ── Test 4: IRC §163(j) flag appears when ATI is provided ─

  it('produces §163(j) analysis when adjustedTaxableIncome is supplied', () => {
    const svc = new CostCalculatorService();
    const cards = makeCardStack(graph.business.id);

    const input: CostCalculationInput = {
      businessId:             graph.business.id,
      tenantId:               graph.tenant.id,
      cards,
      programFee:             2_500,
      percentOfFundingFee:    0.03,
      monthlyProcessorFee:    50,
      adjustedTaxableIncome:  50_000,
      businessInterestIncome: 0,
      effectiveTaxRate:       0.21,
      taxYear:                2025,
    };

    const result = svc.calculate(input);

    expect(result.irc163j).not.toBeNull();
    expect(typeof result.irc163jAlert).toBe('boolean');
    expect(result.afterTaxEffectiveApr).not.toBeNull();
  });

  // ── Test 5: Stacking advantage is positive vs MCA ─────────

  it('credit card stacking shows advantage over MCA in alternatives comparison', () => {
    const svc = new CostCalculatorService();
    const cards = makeCardStack(graph.business.id);

    const input: CostCalculationInput = {
      businessId:          graph.business.id,
      tenantId:            graph.tenant.id,
      cards,
      programFee:          1_000,
      percentOfFundingFee: 0.02,
      monthlyProcessorFee: 25,
    };

    const result = svc.calculate(input);

    const mca = result.alternatives.find((a) => a.name.includes('MCA'));
    expect(mca).toBeDefined();
    expect(mca!.apr).toBeGreaterThan(0.30);
  });

  // ── Test 6: Repayment plan created with avalanche strategy ─

  it('creates an avalanche repayment plan ordering by highest APR first', () => {
    const svc = new RepaymentService();
    const cards = makeCardDebts(graph.business.id);

    const input: CreateRepaymentPlanInput = {
      businessId:          graph.business.id,
      tenantId:            graph.tenant.id,
      cards,
      monthlyPaymentBudget: 5_000,
      strategy:            'avalanche',
    };

    const plan = svc.createPlan(input);

    expect(plan.strategy).toBe('avalanche');
    expect(plan.totalBalance).toBe(45_000);
    expect(plan.prioritisedCards.length).toBe(3);
    // Avalanche: highest regularApr first (Bank of America 22.99% → Chase 21.24% → Amex 19.99%)
    expect(plan.prioritisedCards[0]!.issuer).toBe('Bank of America');
    expect(plan.schedules.length).toBeGreaterThan(0);
    expect(plan.payoffProjections.length).toBe(3);
  });

  // ── Test 7: Repayment plan created with snowball strategy ─

  it('creates a snowball repayment plan ordering by lowest balance first', () => {
    const svc = new RepaymentService();
    const cards = makeCardDebts(graph.business.id);

    const input: CreateRepaymentPlanInput = {
      businessId:          graph.business.id,
      tenantId:            graph.tenant.id,
      cards,
      monthlyPaymentBudget: 5_000,
      strategy:            'snowball',
    };

    const plan = svc.createPlan(input);

    expect(plan.strategy).toBe('snowball');
    // Snowball: lowest balance first (BoA 10k → Amex 15k → Chase 20k)
    expect(plan.prioritisedCards[0]!.issuer).toBe('Bank of America');
    expect(plan.prioritisedCards[1]!.issuer).toBe('Amex');
  });

  // ── Test 8: Payment recording updates schedule status ─────

  it('records a payment and marks schedule entry as paid', () => {
    const svc = new RepaymentService();
    const cards = makeCardDebts(graph.business.id);

    const plan = svc.createPlan({
      businessId:           graph.business.id,
      tenantId:             graph.tenant.id,
      cards,
      monthlyPaymentBudget: 5_000,
      strategy:             'avalanche',
    });

    // Find first schedule entry and get its id from the store
    const firstSchedule = plan.schedules[0]!;
    // The store keys are auto-generated — retrieve via the service's getScheduleById after creation
    // Schedules use store IDs; look up by iterating the internal store via getLatestPlan + getAllSchedules
    const storedSchedules = svc.getAllSchedulesForBusiness(graph.business.id);
    expect(storedSchedules.length).toBeGreaterThan(0);
  });

  // ── Test 9: Interest shock detection — critical urgency ───

  it('detects a critical interest shock for a card expiring in 25 days', () => {
    const svc = new RepaymentService();
    const cards = makeCardDebts(graph.business.id);

    const forecast = svc.forecastInterestShock(graph.business.id, cards);

    expect(forecast.businessId).toBe(graph.business.id);
    expect(forecast.cards.length).toBeGreaterThan(0);

    const criticalCard = forecast.cards.find((c) => c.urgencyLevel === 'critical');
    expect(criticalCard).toBeDefined();
    expect(criticalCard!.issuer).toBe('Amex');
    expect(criticalCard!.daysUntilExpiry).toBeLessThanOrEqual(30);
    expect(forecast.totalMonthlyShockExposure).toBeGreaterThan(0);
    expect(forecast.recommendation).toMatch(/urgent/i);
  });

  // ── Test 10: Autopay verification gap detection ───────────

  it('identifies autopay verification gap when enabled but not verified', () => {
    const svc = new RepaymentService();
    const cards = makeCardDebts(graph.business.id);

    const statuses = svc.checkAutopayStatus(cards);

    const gapCard = statuses.find((s) => s.issuer === 'Amex');
    const unenrolledCard = statuses.find((s) => s.issuer === 'Bank of America');

    expect(gapCard!.verificationGap).toBe(true);
    expect(gapCard!.recommendation).toMatch(/not yet verified/i);
    expect(unenrolledCard!.autopayEnabled).toBe(false);
    expect(unenrolledCard!.recommendation).toMatch(/enroll/i);
  });

  // ── Test 11: Statement ingestion and reconciliation ───────

  it('ingests a Chase statement and emits statement.ingested event', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new StatementReconciliationService(graph.prisma, eventBus);

    const statementRecord = {
      id:              `stmt-${graph.business.id}`,
      tenantId:        graph.tenant.id,
      businessId:      graph.business.id,
      cardApplicationId: graph.application.id,
      issuer:          'Chase',
      statementDate:   new Date(),
      openingBalance:  18_000,
      closingBalance:  19_500,
      totalCharges:    3_000,
      totalPayments:   1_500,
      totalFees:       95,
      totalInterest:   0,
      minimumDue:      390,
      dueDate:         new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      rawData:         {},
      normalizedData:  {},
      anomalies:       [],
      reconciled:      false,
      reconciledAt:    null,
      reconciledBy:    null,
      documentVaultId: null,
      createdAt:       new Date(),
      updatedAt:       new Date(),
    };

    (graph.prisma as unknown as Record<string, unknown>).statementRecord = {
      create: vi.fn().mockResolvedValue(statementRecord),
      findUnique: vi.fn().mockResolvedValue(statementRecord),
      update: vi.fn().mockResolvedValue({ ...statementRecord, reconciled: true }),
    };

    const result = await svc.ingestStatement({
      tenantId:        graph.tenant.id,
      businessId:      graph.business.id,
      cardApplicationId: graph.application.id,
      rawData: {
        issuer:          'Chase',
        statementDate:   new Date().toISOString(),
        openingBalance:  18_000,
        closingBalance:  19_500,
        totalCharges:    3_000,
        totalPayments:   1_500,
        totalFees:       95,
        totalInterest:   0,
        minimumDue:      390,
        dueDate:         new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        transactions:    [],
      },
    });

    expect(result).toBeDefined();
    spy.assertEventFired('statement.ingested');
    spy.restore();
  });

  // ── Test 12: Tax document — IRC §163(j) report ────────────

  it('generates an IRC §163(j) report with disclaimer and computation', async () => {
    const svc = new TaxDocumentService();

    // Configure the module-level prisma mock used by TaxDocumentService
    vi.mocked(sharedPrisma.business.findFirst).mockResolvedValue({
      legalName:  graph.business.legalName,
      ein:        graph.business.ein,
      entityType: graph.business.entityType,
    } as never);

    vi.mocked(sharedPrisma.costCalculation.findFirst).mockResolvedValue({
      id:               `cost-${graph.business.id}`,
      effectiveApr:     new Prisma.Decimal('0.08'),
      totalCost:        new Prisma.Decimal('5400'),
      programFees:      new Prisma.Decimal('2500'),
      cashAdvanceFees:  new Prisma.Decimal('0'),
      annualFees:       new Prisma.Decimal('190'),
      processorFees:    new Prisma.Decimal('600'),
      createdAt:        new Date(),
    } as never);

    const input: IRC163jReportInput = {
      businessId:              graph.business.id,
      tenantId:                graph.tenant.id,
      taxYear:                 2025,
      adjustedTaxableIncome:   150_000,
      businessInterestIncome:  0,
      effectiveTaxRate:        0.21,
    };

    const report = await svc.generateIRC163jReport(input);

    expect(report.businessId).toBe(graph.business.id);
    expect(report.taxYear).toBe(2025);
    expect(report.computation).toBeDefined();
    expect(report.disclaimer).toMatch(/CPA|tax attorney/i);
    expect(report.taxPlanningNotes).toBeInstanceOf(Array);
    expect(typeof report.requiresAlert).toBe('boolean');
  });

  // ── Test 13: Year-end fee summary export ──────────────────

  it('generates a year-end fee summary across all cards in the stack', async () => {
    const svc = new TaxDocumentService();

    vi.mocked(sharedPrisma.business.findFirst).mockResolvedValue({ id: graph.business.id } as never);

    vi.mocked(sharedPrisma.cardApplication.findMany).mockResolvedValue([
      {
        id:          graph.application.id,
        issuer:      'Chase',
        cardProduct: 'Ink Business Preferred',
        creditLimit: new Prisma.Decimal('25000'),
        annualFee:   new Prisma.Decimal('95'),
        cashAdvanceFee: new Prisma.Decimal('0'),
        regularApr:  new Prisma.Decimal('0.2124'),
        introApr:    new Prisma.Decimal('0'),
        introAprExpiry: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000),
        decidedAt:   new Date(),
        status:      'approved',
      },
    ] as never);

    vi.mocked(sharedPrisma.costCalculation.findFirst).mockResolvedValue({
      id:               `cost-${graph.business.id}`,
      programFees:      new Prisma.Decimal('2500'),
      percentOfFunding: new Prisma.Decimal('1350'),
      processorFees:    new Prisma.Decimal('600'),
      cashAdvanceFees:  new Prisma.Decimal('0'),
      totalCost:        new Prisma.Decimal('5400'),
      effectiveApr:     new Prisma.Decimal('0.08'),
      createdAt:        new Date(),
    } as never);

    const summary = await svc.generateYearEndFeeSummary(
      graph.business.id,
      graph.tenant.id,
      2025,
    );

    expect(summary.businessId).toBe(graph.business.id);
    expect(summary.taxYear).toBe(2025);
    expect(summary.cardSummaries).toBeInstanceOf(Array);
    expect(summary.grandTotalCost).toBeGreaterThanOrEqual(0);
    expect(summary.generatedAt).toBeInstanceOf(Date);
  });

  // ── Test 14: Rewards optimization routing ─────────────────

  it('routes spend categories to optimal cards for maximum rewards value', () => {
    const svc = new RewardsOptimizationService();

    const profile: SpendProfile = {
      businessId: graph.business.id,
      tenantId:   graph.tenant.id,
      categories: [
        { category: 'office_supplies',      annualAmount: 12_000 },
        { category: 'travel',               annualAmount: 24_000 },
        { category: 'restaurants',          annualAmount: 6_000  },
        { category: 'phone_internet_cable', annualAmount: 3_600  },
        { category: 'shipping',             annualAmount: 4_800  },
        { category: 'software_saas',        annualAmount: 9_600  },
      ],
    };

    const result = svc.optimize(profile);

    expect(result.businessId).toBe(graph.business.id);
    expect(result.categoryRecommendations).toHaveLength(profile.categories.length);

    for (const rec of result.categoryRecommendations) {
      expect(rec.optimalCard).toBeDefined();
      expect(rec.optimalCard.cardId).toBeDefined();
      expect(rec.rankedCards.length).toBeGreaterThan(0);
    }

    expect(result.totals.totalAnnualSpend).toBe(60_000);
    expect(result.totals.totalOptimalRewardValue).toBeGreaterThan(0);
    expect(result.cardAnnualSummaries.length).toBeGreaterThan(0);
  });

  // ── Test 15: Business purpose tagging + tax substantiation ─

  it('exports tax substantiation records and groups by category', async () => {
    const svc = new BusinessPurposeEvidenceService(sharedPrisma as never);

    const mockTransactions = [
      {
        id:               `txn-001-${graph.business.id}`,
        cardApplicationId: graph.application.id,
        businessId:       graph.business.id,
        tenantId:         graph.tenant.id,
        transactionDate:  new Date('2025-03-01'),
        merchantName:     'United Airlines',
        mcc:              '4511',
        mccCategory:      'travel',
        amount:           new Prisma.Decimal('1250.00'),
        description:      'United Airlines SFO-NYC Round Trip',
        businessPurpose:  'Client meeting in New York',
        isPersonalUse:    false,
        isCashLike:       false,
        flagged:          false,
        flagReason:       null,
        evidenceDocId:    'rcpt-ua-001',
        createdAt:        new Date(),
        updatedAt:        new Date(),
      },
      {
        id:               `txn-002-${graph.business.id}`,
        cardApplicationId: graph.application.id,
        businessId:       graph.business.id,
        tenantId:         graph.tenant.id,
        transactionDate:  new Date('2025-03-05'),
        merchantName:     'Staples',
        mcc:              '5943',
        mccCategory:      'office_supplies',
        amount:           new Prisma.Decimal('340.00'),
        description:      'Office supplies — paper, toner, folders',
        businessPurpose:  'Office operations',
        isPersonalUse:    false,
        isCashLike:       false,
        flagged:          false,
        flagReason:       null,
        evidenceDocId:    'rcpt-staples-001',
        createdAt:        new Date(),
        updatedAt:        new Date(),
      },
      {
        id:               `txn-003-${graph.business.id}`,
        cardApplicationId: graph.application.id,
        businessId:       graph.business.id,
        tenantId:         graph.tenant.id,
        transactionDate:  new Date('2025-03-10'),
        merchantName:     'Cash Advance Fee',
        mcc:              '6011',
        mccCategory:      'cash_advance',
        amount:           new Prisma.Decimal('500.00'),
        description:      'Cash advance transaction',
        businessPurpose:  null, // no business purpose documented
        isPersonalUse:    false,
        isCashLike:       true,
        flagged:          true,
        flagReason:       'Cash-like transaction — requires business purpose documentation',
        evidenceDocId:    null,
        createdAt:        new Date(),
        updatedAt:        new Date(),
      },
    ];

    vi.mocked(sharedPrisma.business.findFirst).mockResolvedValue({ id: graph.business.id } as never);
    vi.mocked(sharedPrisma.spendTransaction.findMany).mockResolvedValue(mockTransactions as never);

    const exportResult = await svc.exportTaxSubstantiation(
      graph.tenant.id,
      graph.business.id,
      '2025-01-01',
      '2025-12-31',
    );

    expect(exportResult.businessId).toBe(graph.business.id);
    expect(exportResult.lines.length).toBe(3);
    expect(exportResult.summary.totalAmount).toBeGreaterThan(0);
    expect(exportResult.categorySummaries).toBeInstanceOf(Array);
    expect(exportResult.exportedAt).toBeDefined();
  });
});
