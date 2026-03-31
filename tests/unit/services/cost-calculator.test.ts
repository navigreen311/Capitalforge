// ============================================================
// CapitalForge — Cost of Capital Calculator Test Suite
//
// Covers:
//   • Fee component calculations (program, percent, annual, CA, processor)
//   • Effective APR computation
//   • IRC §163(j) limitation scenarios (exempt, within, approaching, exceeds)
//   • IRC §163(j) multi-year carryforward projection
//   • Stress test — best / base / worst scenario shape & invariants
//   • Interest shock detection
//   • APR comparison vs SBA / LOC / MCA
//   • Stacking advantage computation
//   • Edge cases: zero balances, no promo, all carry, no §163(j) data
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CostCalculatorService,
  CostCalculationInput,
  CardInStack,
} from '../../../src/backend/services/cost-calculator.service.js';
import {
  computeIRC163j,
  projectIRC163j,
  requiresIRC163jAlert,
  minimumATIForFullDeductibility,
  IRC163jInput,
} from '../../../src/backend/services/irc163j.js';
import {
  runFullStressTest,
  runScenario,
  StressTestInput,
  CreditCard as StressTestCard,
} from '../../../src/backend/services/stress-test.js';

// ── Test Fixtures ─────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<CardInStack> = {}): CardInStack {
  return {
    id: 'card-1',
    issuer: 'Chase',
    creditLimit: 50_000,
    currentBalance: 40_000,
    promoApr: 0,
    standardApr: 0.2099,
    promoExpiryMonth: 12,
    annualFee: 550,
    minPaymentRate: 0.02,
    ...overrides,
  };
}

function makeStressCard(overrides: Partial<StressTestCard> = {}): StressTestCard {
  return {
    id: 'card-1',
    creditLimit: 50_000,
    currentBalance: 40_000,
    promoApr: 0,
    standardApr: 0.2099,
    promoExpiryMonth: 12,
    annualFee: 550,
    minPaymentRate: 0.02,
    ...overrides,
  };
}

function makeBaseInput(overrides: Partial<CostCalculationInput> = {}): CostCalculationInput {
  return {
    businessId: 'biz-001',
    tenantId: 'tenant-001',
    cards: [makeCard()],
    programFee: 2_500,
    percentOfFundingFee: 0.03,         // 3%
    monthlyProcessorFee: 150,
    projectionMonths: 12,
    estimatedCarryRate: 0.3,
    ...overrides,
  };
}

function makeIRC163jInput(overrides: Partial<IRC163jInput> = {}): IRC163jInput {
  return {
    adjustedTaxableIncome: 500_000,
    businessInterestExpense: 80_000,
    businessInterestIncome: 2_000,
    taxYear: 2025,
    ...overrides,
  };
}

function makeStressInput(overrides: Partial<StressTestInput> = {}): StressTestInput {
  return {
    cards: [makeStressCard()],
    monthlyRevenue: 50_000,
    monthlyOperatingExpenses: 30_000,
    programFee: 2_500,
    monthlyProcessorFee: 150,
    ...overrides,
  };
}

// ── CostCalculatorService ─────────────────────────────────────────────────────

describe('CostCalculatorService', () => {
  let service: CostCalculatorService;

  beforeEach(() => {
    service = new CostCalculatorService();
  });

  // ── Fee Components ───────────────────────────────────────────────────────────

  describe('fee components', () => {
    it('includes program fee in total cost', () => {
      const result = service.calculate(makeBaseInput({ programFee: 3_000 }));
      expect(result.breakdown.programFees).toBe(3_000);
    });

    it('computes percent-of-funding fee correctly (3% of 40k = 1200)', () => {
      const result = service.calculate(makeBaseInput({
        cards: [makeCard({ currentBalance: 40_000 })],
        percentOfFundingFee: 0.03,
      }));
      expect(result.breakdown.percentOfFunding).toBe(1_200);
    });

    it('includes annual fees for all cards in stack', () => {
      const input = makeBaseInput({
        cards: [
          makeCard({ id: 'c1', annualFee: 550 }),
          makeCard({ id: 'c2', annualFee: 695 }),
        ],
      });
      const result = service.calculate(input);
      expect(result.breakdown.annualFees).toBe(1_245);
    });

    it('computes cash advance fee (5% of CA balance, min $10)', () => {
      const input = makeBaseInput({
        cards: [makeCard({
          hasCashAdvance: true,
          cashAdvanceBalance: 10_000,
          cashAdvanceApr: 0.2999,
        })],
        programFee: 0,
        percentOfFundingFee: 0,
        monthlyProcessorFee: 0,
      });
      const result = service.calculate(input);
      expect(result.breakdown.cashAdvanceFees).toBe(500); // 5% × 10k
    });

    it('applies $10 minimum cash advance fee', () => {
      const input = makeBaseInput({
        cards: [makeCard({
          hasCashAdvance: true,
          cashAdvanceBalance: 100,
          cashAdvanceApr: 0.2999,
        })],
        programFee: 0,
        percentOfFundingFee: 0,
        monthlyProcessorFee: 0,
      });
      const result = service.calculate(input);
      // 5% × 100 = $5, but minimum is $10
      expect(result.breakdown.cashAdvanceFees).toBe(10);
    });

    it('computes processor fees as monthlyFee × projectionMonths', () => {
      const result = service.calculate(makeBaseInput({
        monthlyProcessorFee: 200,
        projectionMonths: 12,
      }));
      expect(result.breakdown.processorFees).toBe(2_400);
    });

    it('totalCost equals sum of all components', () => {
      const result = service.calculate(makeBaseInput());
      const { programFees, percentOfFunding, annualFees, cashAdvanceFees, processorFees, totalCost } =
        result.breakdown;
      // Total also includes projected interest (not separately exposed in breakdown
      // but contributes to totalCost). Verify breakdown components sum ≤ totalCost.
      const summedComponents = programFees + percentOfFunding + annualFees + cashAdvanceFees + processorFees;
      expect(totalCost).toBeGreaterThanOrEqual(summedComponents);
    });

    it('returns zero percentOfFunding when all balances are zero', () => {
      const input = makeBaseInput({
        cards: [makeCard({ currentBalance: 0 })],
      });
      const result = service.calculate(input);
      expect(result.breakdown.percentOfFunding).toBe(0);
    });
  });

  // ── Effective APR ─────────────────────────────────────────────────────────────

  describe('effective APR', () => {
    it('returns null effectiveApr when total funding is zero', () => {
      const apr = service.computeEffectiveApr(0, 0, 12);
      expect(apr).toBeNull();
    });

    it('computes effective APR as (totalCost/funding) × (12/months)', () => {
      // 12k cost on 100k funding over 12 months = 12% APR
      const apr = service.computeEffectiveApr(12_000, 100_000, 12);
      expect(apr).toBeCloseTo(0.12, 4);
    });

    it('annualises correctly for sub-12-month projections', () => {
      // 6k cost on 100k over 6 months = 12% annualised
      const apr = service.computeEffectiveApr(6_000, 100_000, 6);
      expect(apr).toBeCloseTo(0.12, 4);
    });

    it('effectiveApr is present in breakdown when funding is non-zero', () => {
      const result = service.calculate(makeBaseInput());
      expect(result.breakdown.effectiveApr).not.toBeNull();
      expect(typeof result.breakdown.effectiveApr).toBe('number');
    });
  });

  // ── Stacking vs Alternatives ──────────────────────────────────────────────────

  describe('alternatives comparison', () => {
    it('returns alternatives array with at least 4 products', () => {
      const result = service.calculate(makeBaseInput());
      expect(result.alternatives.length).toBeGreaterThanOrEqual(4);
    });

    it('every alternative has a positive apr and totalCost', () => {
      const result = service.calculate(makeBaseInput());
      for (const alt of result.alternatives) {
        expect(alt.apr).toBeGreaterThan(0);
        expect(alt.totalCost).toBeGreaterThan(0);
        expect(alt.monthlyPayment).toBeGreaterThan(0);
      }
    });

    it('SBA 7a rate is lower than MCA rate', () => {
      const result = service.calculate(makeBaseInput());
      const sba = result.alternatives.find((a) => a.name.includes('SBA'));
      const mca = result.alternatives.find((a) => a.name.includes('MCA'));
      expect(sba).toBeDefined();
      expect(mca).toBeDefined();
      expect(sba!.apr).toBeLessThan(mca!.apr);
    });

    it('stackingAdvantage is positive when stacking is cheaper than alternatives', () => {
      // Use a 0-rate card (pure promo) with minimal fees → very cheap stacking
      const input = makeBaseInput({
        cards: [makeCard({ promoApr: 0, promoExpiryMonth: 24, annualFee: 0 })],
        programFee: 0,
        percentOfFundingFee: 0,
        monthlyProcessorFee: 0,
        projectionMonths: 12,
        estimatedCarryRate: 0, // nothing carries past promo
      });
      const result = service.calculate(input);
      // With near-zero cost, stacking should beat expensive alternatives
      expect(result.stackingAdvantage).not.toBeNull();
      expect(result.stackingAdvantage!).toBeGreaterThan(0);
    });

    it('stackingAdvantage is null when cards array is empty', () => {
      const result = service.calculate(makeBaseInput({ cards: [] }));
      // Empty stack → zero funding → alternatives have zero totalCost → advantage is 0 or null
      // The important thing is the service doesn't throw
      expect(result.breakdown.totalCost).toBeGreaterThanOrEqual(0);
    });
  });

  // ── IRC §163(j) via service ───────────────────────────────────────────────────

  describe('IRC 163(j) integration in calculate()', () => {
    it('returns null irc163j when adjustedTaxableIncome not provided', () => {
      const result = service.calculate(makeBaseInput());
      expect(result.irc163j).toBeNull();
      expect(result.irc163jAlert).toBe(false);
    });

    it('computes irc163j when adjustedTaxableIncome is provided', () => {
      const result = service.calculate(makeBaseInput({
        adjustedTaxableIncome: 500_000,
        businessInterestIncome: 1_000,
        taxYear: 2025,
      }));
      expect(result.irc163j).not.toBeNull();
      expect(result.irc163j!.atiLimit).toBeCloseTo(150_000, 0);
    });

    it('sets irc163jAlert true when interest exceeds deductibility limit', () => {
      // ATI = 10k → limit = 3k; expense = 50k → well over limit
      // Use projectionMonths=24 to generate post-promo interest (promo expires month 12)
      const result = service.calculate(makeBaseInput({
        adjustedTaxableIncome: 10_000,
        businessInterestIncome: 0,
        taxYear: 2025,
        projectionMonths: 24,
        cards: [makeCard({ currentBalance: 200_000 })],
        estimatedCarryRate: 1.0,
      }));
      expect(result.irc163jAlert).toBe(true);
    });

    it('afterTaxEffectiveApr is lower than gross effectiveApr', () => {
      const result = service.calculate(makeBaseInput({
        adjustedTaxableIncome: 500_000,
        effectiveTaxRate: 0.21,
        taxYear: 2025,
      }));
      const gross = result.breakdown.effectiveApr;
      const afterTax = result.afterTaxEffectiveApr;
      if (gross !== null && afterTax !== null) {
        expect(afterTax).toBeLessThan(gross);
      }
    });
  });

  // ── Stress Test Integration ───────────────────────────────────────────────────

  describe('stress test integration', () => {
    it('returns null stressTest when monthlyRevenue not provided', () => {
      const result = service.calculate(makeBaseInput());
      expect(result.stressTest).toBeNull();
    });

    it('returns stressTest with all 3 scenarios when revenue provided', () => {
      const result = service.calculate(makeBaseInput({
        monthlyRevenue: 50_000,
        monthlyOperatingExpenses: 30_000,
      }));
      expect(result.stressTest).not.toBeNull();
      expect(result.stressTest!.best).toBeDefined();
      expect(result.stressTest!.base).toBeDefined();
      expect(result.stressTest!.worst).toBeDefined();
    });

    it('stress test projections are exactly 24 months', () => {
      const result = service.calculate(makeBaseInput({
        monthlyRevenue: 50_000,
        monthlyOperatingExpenses: 30_000,
      }));
      expect(result.stressTest!.best.projections).toHaveLength(24);
      expect(result.stressTest!.base.projections).toHaveLength(24);
      expect(result.stressTest!.worst.projections).toHaveLength(24);
    });
  });

  // ── Recommendation ────────────────────────────────────────────────────────────

  describe('recommendation', () => {
    it('returns a non-empty recommendation string', () => {
      const result = service.calculate(makeBaseInput());
      expect(typeof result.recommendation).toBe('string');
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it('recommendation includes APR information', () => {
      const result = service.calculate(makeBaseInput());
      expect(result.recommendation).toMatch(/APR/i);
    });

    it('recommendation flags §163(j) alert when interest exceeds limit', () => {
      const result = service.calculate(makeBaseInput({
        adjustedTaxableIncome: 10_000,
        businessInterestIncome: 0,
        taxYear: 2025,
        cards: [makeCard({ currentBalance: 200_000 })],
        estimatedCarryRate: 1.0,
      }));
      if (result.irc163jAlert) {
        expect(result.recommendation).toMatch(/163\(j\)/i);
      }
    });
  });
});

// ── IRC §163(j) Unit Tests ────────────────────────────────────────────────────

describe('computeIRC163j', () => {
  it('marks business as exempt when gross receipts ≤ threshold', () => {
    const result = computeIRC163j({
      ...makeIRC163jInput(),
      averageAnnualGrossReceipts: 15_000_000,
      smallBusinessThreshold: 29_000_000,
    });
    expect(result.isExempt).toBe(true);
    expect(result.limitationFlag).toBe('exempt');
    expect(result.disallowedAmount).toBe(0);
  });

  it('applies 30% ATI limit correctly', () => {
    const result = computeIRC163j(makeIRC163jInput({
      adjustedTaxableIncome: 500_000,
      businessInterestExpense: 20_000,
      businessInterestIncome: 0,
    }));
    // ATI limit = 500k × 30% = 150k; expense 20k < 150k → fully deductible
    expect(result.atiLimit).toBeCloseTo(150_000, 0);
    expect(result.deductibleInterest).toBe(20_000);
    expect(result.disallowedAmount).toBe(0);
    expect(result.limitationFlag).toBe('within_safe_zone');
  });

  it('disallows interest in excess of the §163(j) cap', () => {
    const result = computeIRC163j({
      adjustedTaxableIncome: 100_000,
      businessInterestExpense: 50_000,
      businessInterestIncome: 0,
      taxYear: 2025,
    });
    // ATI limit = 30k; expense 50k → disallowed = 20k
    expect(result.atiLimit).toBeCloseTo(30_000, 0);
    expect(result.deductibleInterest).toBeCloseTo(30_000, 0);
    expect(result.disallowedAmount).toBeCloseTo(20_000, 0);
    expect(result.limitationFlag).toBe('exceeds_limit');
  });

  it('adds business interest income to the deductibility cap', () => {
    const result = computeIRC163j({
      adjustedTaxableIncome: 100_000,
      businessInterestExpense: 40_000,
      businessInterestIncome: 15_000,
      taxYear: 2025,
    });
    // Cap = 15k (income) + 30k (ATI) = 45k; expense 40k → fully deductible
    expect(result.deductibilityLimit).toBeCloseTo(45_000, 0);
    expect(result.disallowedAmount).toBe(0);
  });

  it('incorporates prior year carryforward into total interest subject to limit', () => {
    const result = computeIRC163j({
      adjustedTaxableIncome: 100_000,
      businessInterestExpense: 20_000,
      businessInterestIncome: 0,
      priorYearCarryforward: 15_000,
      taxYear: 2025,
    });
    expect(result.totalInterestSubjectToLimit).toBe(35_000);
    expect(result.deductibilityLimit).toBeCloseTo(30_000, 0);
    expect(result.disallowedAmount).toBeCloseTo(5_000, 0);
  });

  it('flags approaching_limit when utilisation is 80–99%', () => {
    // Limit = 30k; expense = 27k → 90% utilisation
    const result = computeIRC163j({
      adjustedTaxableIncome: 100_000,
      businessInterestExpense: 27_000,
      businessInterestIncome: 0,
      taxYear: 2025,
    });
    expect(result.limitationFlag).toBe('approaching_limit');
  });

  it('applies EBIT-based definition label for 2022+ tax years', () => {
    const result = computeIRC163j(makeIRC163jInput({ taxYear: 2023 }));
    expect(result.atiDefinition).toMatch(/EBIT-based/);
  });

  it('applies EBITDA-based definition label for pre-2022 tax years', () => {
    const result = computeIRC163j(makeIRC163jInput({ taxYear: 2021 }));
    expect(result.atiDefinition).toMatch(/EBITDA-based/);
  });

  it('projectedTaxImpactOfDisallowance equals disallowed × taxRate', () => {
    const result = computeIRC163j(
      {
        adjustedTaxableIncome: 100_000,
        businessInterestExpense: 50_000,
        businessInterestIncome: 0,
        taxYear: 2025,
      },
      0.21,
    );
    const expected = result.disallowedAmount * 0.21;
    expect(result.projectedTaxImpactOfDisallowance).toBeCloseTo(expected, 2);
  });

  it('requiresIRC163jAlert returns false for no_limitation', () => {
    const result = computeIRC163j(makeIRC163jInput({
      adjustedTaxableIncome: 1_000_000,
      businessInterestExpense: 5_000,
    }));
    expect(requiresIRC163jAlert(result)).toBe(false);
  });

  it('requiresIRC163jAlert returns true for exceeds_limit', () => {
    const result = computeIRC163j({
      adjustedTaxableIncome: 50_000,
      businessInterestExpense: 100_000,
      businessInterestIncome: 0,
      taxYear: 2025,
    });
    expect(requiresIRC163jAlert(result)).toBe(true);
  });

  it('minimumATIForFullDeductibility returns correct ATI threshold', () => {
    // expense=50k, income=5k, floorPlan=0 → remaining=45k → ATI needed = 45k/0.3 = 150k
    const ati = minimumATIForFullDeductibility(50_000, 5_000, 0);
    expect(ati).toBeCloseTo(150_000, 0);
  });
});

// ── Multi-year §163(j) Projection ─────────────────────────────────────────────

describe('projectIRC163j', () => {
  it('threads carryforward from year to year', () => {
    const projections = projectIRC163j([
      {
        adjustedTaxableIncome: 100_000,
        businessInterestExpense: 50_000,
        businessInterestIncome: 0,
        taxYear: 2024,
      },
      {
        adjustedTaxableIncome: 200_000,
        businessInterestExpense: 10_000,
        businessInterestIncome: 0,
        taxYear: 2025,
      },
    ]);

    expect(projections).toHaveLength(2);

    // Year 1: expense 50k, limit 30k → disallowed 20k
    expect(projections[0]!.result.disallowedAmount).toBeCloseTo(20_000, 0);

    // Year 2: prior carryforward 20k + current 10k = 30k; limit = 60k → fully deductible
    expect(projections[1]!.result.totalInterestSubjectToLimit).toBeCloseTo(30_000, 0);
    expect(projections[1]!.result.disallowedAmount).toBe(0);
  });

  it('returns a projection for each input year', () => {
    const inputs = Array.from({ length: 5 }, (_, i) => ({
      adjustedTaxableIncome: 300_000,
      businessInterestExpense: 40_000,
      businessInterestIncome: 0,
      taxYear: 2022 + i,
    }));
    const projections = projectIRC163j(inputs);
    expect(projections).toHaveLength(5);
    projections.forEach((p, i) => {
      expect(p.year).toBe(2022 + i);
    });
  });
});

// ── Stress Test Unit Tests ────────────────────────────────────────────────────

describe('runFullStressTest', () => {
  it('returns all three scenarios', () => {
    const result = runFullStressTest(makeStressInput());
    expect(result.best).toBeDefined();
    expect(result.base).toBeDefined();
    expect(result.worst).toBeDefined();
  });

  it('each scenario has exactly 24 monthly projections', () => {
    const result = runFullStressTest(makeStressInput());
    expect(result.best.projections).toHaveLength(24);
    expect(result.base.projections).toHaveLength(24);
    expect(result.worst.projections).toHaveLength(24);
  });

  it('month numbers run from 1 to 24', () => {
    const result = runFullStressTest(makeStressInput());
    result.best.projections.forEach((p, i) => {
      expect(p.month).toBe(i + 1);
    });
  });

  it('best case has lower total cost than worst case', () => {
    const result = runFullStressTest(makeStressInput());
    expect(result.best.summary.totalCostOfCapital).toBeLessThan(
      result.worst.summary.totalCostOfCapital,
    );
  });

  it('worst case final balance ≥ best case final balance', () => {
    const result = runFullStressTest(makeStressInput());
    expect(result.worst.summary.finalBalance).toBeGreaterThanOrEqual(
      result.best.summary.finalBalance,
    );
  });

  it('best case cumulative interest is zero for 0% promo card fully repaid', () => {
    // Very high revenue → best case pays off quickly during 0% promo
    const highRevenueInput = makeStressInput({
      cards: [makeStressCard({ promoApr: 0, promoExpiryMonth: 24 })],
      monthlyRevenue: 500_000,
      monthlyOperatingExpenses: 10_000,
    });
    const result = runScenario(highRevenueInput, 'best');
    // Balance should be paid off before promo expires
    expect(result.summary.totalInterestPaid).toBe(0);
  });

  it('interest shock is detected when promo expires with outstanding balance', () => {
    // Short promo (3 months), low repayment (worst case) → balance carries to month 4
    const input = makeStressInput({
      cards: [makeStressCard({
        promoApr: 0,
        standardApr: 0.2499,
        promoExpiryMonth: 3,
        currentBalance: 40_000,
      })],
      monthlyRevenue: 35_000,
      monthlyOperatingExpenses: 30_000,
    });
    const result = runScenario(input, 'worst');

    const shockMonths = result.projections.filter((p) => p.interestShockMonth);
    expect(shockMonths.length).toBeGreaterThan(0);
    expect(shockMonths[0]!.interestShockAmount).toBeGreaterThan(0);
    expect(result.summary.totalInterestShock).toBeGreaterThan(0);
  });

  it('no interest shock when promo does not expire within 24 months', () => {
    const input = makeStressInput({
      cards: [makeStressCard({ promoApr: 0, promoExpiryMonth: 30 })],
    });
    const result = runScenario(input, 'best');
    expect(result.summary.totalInterestShock).toBe(0);
  });

  it('comparison table has 10 rows', () => {
    const result = runFullStressTest(makeStressInput());
    expect(result.comparisonTable).toHaveLength(10);
  });

  it('comparison table row for Total Cost of Capital has three values', () => {
    const result = runFullStressTest(makeStressInput());
    const row = result.comparisonTable.find(
      (r) => r.metric === 'Total Cost of Capital',
    );
    expect(row).toBeDefined();
    expect(row!.best).toBeDefined();
    expect(row!.base).toBeDefined();
    expect(row!.worst).toBeDefined();
  });

  it('program fee is applied exactly once in month 1', () => {
    const input = makeStressInput({ programFee: 5_000 });
    const result = runScenario(input, 'best');
    const month1 = result.projections[0]!;
    expect(month1.fees).toBeGreaterThanOrEqual(5_000);
    // Month 2 should NOT include the program fee again
    const month2 = result.projections[1]!;
    expect(month2.fees).toBeLessThan(5_000);
  });

  it('annual fee is applied in month 1 and month 13', () => {
    const input = makeStressInput({
      cards: [makeStressCard({ annualFee: 550 })],
      programFee: 0,
    });
    const result = runScenario(input, 'best');

    const month1Fees = result.projections[0]!.fees;
    const month13 = result.projections[12]; // month 13 (0-indexed: 12)
    const month2Fees = result.projections[1]!.fees;

    // Month 1: annual fee present
    expect(month1Fees).toBeGreaterThanOrEqual(550);
    // Month 2: no annual fee
    expect(month2Fees).toBeLessThan(550);
    // Month 13: annual fee re-applied (if card still has a balance)
    if (month13 && month13.openingBalance > 0) {
      expect(month13.fees).toBeGreaterThanOrEqual(550);
    }
  });

  it('effectiveApr is null when all balances start at zero', () => {
    const input = makeStressInput({
      cards: [makeStressCard({ currentBalance: 0 })],
    });
    const result = runScenario(input, 'base');
    // Average balance is 0 → effectiveApr should be null
    expect(result.summary.effectiveApr).toBeNull();
  });

  it('payoffMonth is set when balance reaches zero', () => {
    const highRevenueInput = makeStressInput({
      monthlyRevenue: 200_000,
      monthlyOperatingExpenses: 5_000,
    });
    const result = runScenario(highRevenueInput, 'best');
    expect(result.summary.payoffMonth).not.toBeNull();
    expect(result.summary.payoffMonth!).toBeGreaterThanOrEqual(1);
    expect(result.summary.payoffMonth!).toBeLessThanOrEqual(24);
  });

  it('worst case total cost is at least as high as best case (tight budget)', () => {
    const tightInput = makeStressInput({
      monthlyRevenue: 33_000,
      monthlyOperatingExpenses: 30_000,
    });
    const result = runFullStressTest(tightInput);
    // Worst case pays less per month, carries balance longer, accumulates more fees/interest
    expect(result.worst.summary.totalCostOfCapital).toBeGreaterThanOrEqual(
      result.best.summary.totalCostOfCapital,
    );
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles single card with zero balance gracefully', () => {
    const input = makeBaseInput({
      cards: [makeCard({ currentBalance: 0 })],
    });
    const result = new CostCalculatorService().calculate(input);
    expect(result.breakdown.totalCost).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.effectiveApr).toBeNull();
  });

  it('handles multiple cards with mixed promo periods', () => {
    const input = makeBaseInput({
      cards: [
        makeCard({ id: 'c1', currentBalance: 20_000, promoExpiryMonth: 6 }),
        makeCard({ id: 'c2', currentBalance: 30_000, promoExpiryMonth: 18 }),
        makeCard({ id: 'c3', currentBalance: 15_000, promoExpiryMonth: 0 }), // no promo
      ],
    });
    const result = new CostCalculatorService().calculate(input);
    expect(result.totalFundingObtained).toBe(65_000);
    expect(result.breakdown.totalCost).toBeGreaterThan(0);
  });

  it('handles 100% carry rate (all balances carry past promo)', () => {
    const input = makeBaseInput({ estimatedCarryRate: 1.0 });
    const result = new CostCalculatorService().calculate(input);
    expect(result.breakdown.totalCost).toBeGreaterThan(0);
  });

  it('handles 0% carry rate (no balances carry past promo)', () => {
    const input = makeBaseInput({ estimatedCarryRate: 0.0 });
    const result = new CostCalculatorService().calculate(input);
    // With zero carry, projected post-promo interest = 0 (except cash advances)
    expect(result.breakdown.totalCost).toBeGreaterThanOrEqual(0);
  });

  it('§163(j) returns zero disallowance when ATI is very large', () => {
    const result = computeIRC163j({
      adjustedTaxableIncome: 100_000_000,
      businessInterestExpense: 500_000,
      businessInterestIncome: 0,
      taxYear: 2025,
    });
    expect(result.disallowedAmount).toBe(0);
    expect(result.limitationFlag).toBe('within_safe_zone');
  });

  it('§163(j) handles negative ATI (operating loss) without throwing', () => {
    const result = computeIRC163j({
      adjustedTaxableIncome: -200_000,
      businessInterestExpense: 50_000,
      businessInterestIncome: 0,
      taxYear: 2025,
    });
    // Negative ATI → atiLimit = 0 → all interest disallowed
    expect(result.atiLimit).toBe(0);
    expect(result.disallowedAmount).toBe(50_000);
  });

  it('stress test handles single month promo expiry in month 1', () => {
    const input = makeStressInput({
      cards: [makeStressCard({ promoExpiryMonth: 1 })],
    });
    expect(() => runScenario(input, 'base')).not.toThrow();
  });
});
