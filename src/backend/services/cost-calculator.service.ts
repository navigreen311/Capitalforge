// ============================================================
// CapitalForge — Cost of Capital Calculator Service
//
// Computes the all-in cost of a credit card stacking strategy:
//   • Program/broker fees
//   • Percent-of-funding fees (origination-style)
//   • Annual card fees (sum across the stack)
//   • Projected interest (purchase + cash advance)
//   • Processor fees
//
// Outputs:
//   • CostBreakdown (per shared/types)
//   • Effective APR across the full credit stack
//   • IRC §163(j) deductibility impact
//   • True APR comparison vs SBA 7(a), traditional LOC, and MCA
//   • Three-scenario stress test (delegates to stress-test.ts)
// ============================================================

import type { CostBreakdown } from '@shared/types/index.js';
import { computeIRC163j, requiresIRC163jAlert } from './irc163j.js';
import type { IRC163jInput, IRC163jResult } from './irc163j.js';
import { runFullStressTest } from './stress-test.js';
import type {
  StressTestInput,
  FullStressTestResult,
  CreditCard as StressTestCard,
} from './stress-test.js';

// ── Input / Output Types ──────────────────────────────────────────────────────

export interface CardInStack {
  id: string;
  issuer: string;
  /** Total approved credit limit */
  creditLimit: number;
  /** Amount currently drawn / utilised */
  currentBalance: number;
  /** Promotional APR (e.g. 0 = 0%) */
  promoApr: number;
  /** Standard/post-promo purchase APR */
  standardApr: number;
  /** Month index (1-based) when promotional period ends */
  promoExpiryMonth: number;
  /** Annual card fee in dollars */
  annualFee: number;
  /** Minimum payment fraction (e.g. 0.02) */
  minPaymentRate: number;
  /** Cash advance balance */
  cashAdvanceBalance?: number;
  /** Cash advance APR (defaults to standardApr + 5%) */
  cashAdvanceApr?: number;
  hasCashAdvance?: boolean;
}

export interface CostCalculationInput {
  businessId: string;
  tenantId: string;

  /** All credit cards in the stacking strategy */
  cards: CardInStack[];

  /**
   * One-time program / broker fee charged by CapitalForge or a partner.
   * Expressed in dollars.
   */
  programFee: number;

  /**
   * Percentage of total funding obtained charged as an origination-style fee.
   * Express as a decimal (e.g. 0.03 = 3%).
   */
  percentOfFundingFee: number;

  /**
   * Monthly processor fee (e.g. Stripe / Square fees routed through the cards).
   * Expressed in dollars per month.
   */
  monthlyProcessorFee: number;

  /**
   * Projection horizon in months for interest/cost modelling.
   * Defaults to 12 months.
   */
  projectionMonths?: number;

  /**
   * Estimated fraction of balances expected to carry past promo periods
   * in the "base case". 0.0 = none carry, 1.0 = all carry.
   * Defaults to 0.3 (30%).
   */
  estimatedCarryRate?: number;

  /** Business interest income (for §163(j) calc) */
  businessInterestIncome?: number;
  /** Adjusted Taxable Income for §163(j) calc */
  adjustedTaxableIncome?: number;
  /** Average annual gross receipts for §163(j) small-business exemption test */
  averageAnnualGrossReceipts?: number;
  /** Tax year for §163(j) calc */
  taxYear?: number;
  /** Effective income tax rate (decimal) for §163(j) disallowance impact */
  effectiveTaxRate?: number;

  /** Monthly revenue for stress test */
  monthlyRevenue?: number;
  /** Monthly operating expenses (excl. debt service) for stress test */
  monthlyOperatingExpenses?: number;
}

export interface AlternativeProduct {
  name: string;
  /** True APR (decimal) */
  apr: number;
  /** Total cost if same funding amount borrowed over projectionMonths */
  totalCost: number;
  /** Monthly payment */
  monthlyPayment: number;
  notes: string;
}

export interface CostCalculationResult {
  businessId: string;
  calculatedAt: Date;

  /** Breakdown of all cost components */
  breakdown: CostBreakdown;

  /** Total funding obtained (sum of current balances) */
  totalFundingObtained: number;

  /** Post-tax effective cost after §163(j) deduction benefit */
  afterTaxEffectiveApr: number | null;

  /** IRC §163(j) analysis */
  irc163j: IRC163jResult | null;
  irc163jAlert: boolean;

  /** Comparison against alternative financing products */
  alternatives: AlternativeProduct[];

  /** Cost advantage of stacking vs the cheapest alternative (negative = stacking costs more) */
  stackingAdvantage: number | null;

  /** Three-scenario stress test results (24-month projections) */
  stressTest: FullStressTestResult | null;

  /** Human-readable recommendation */
  recommendation: string;
}

// ── Benchmark Rates ───────────────────────────────────────────────────────────
// Updated Q1 2026 representative market rates. In production these should
// be fetched from a live rate-data service or updated via admin config.

const BENCHMARK_RATES = {
  SBA_7A_PRIME_PLUS: 0.1050,        // SBA 7(a) variable ~Prime + 2.75% (Q1 2026)
  SBA_7A_FIXED_SMALL: 0.1175,       // SBA 7(a) fixed, loans ≤ $25K
  TRADITIONAL_LOC: 0.0925,          // Bank business LOC prime-linked
  MCA_FACTOR_LOW: 0.35,             // MCA low factor rate (annualised)
  MCA_FACTOR_HIGH: 0.60,            // MCA high factor rate (annualised)
  REVENUE_BASED_FINANCE: 0.28,      // RBF mid-market rate (annualised)
} as const;

// ── Main Calculator ───────────────────────────────────────────────────────────

export class CostCalculatorService {

  /**
   * Compute the full all-in cost of the credit card stacking strategy.
   * This is the primary entry point.
   */
  calculate(input: CostCalculationInput): CostCalculationResult {
    const projectionMonths = input.projectionMonths ?? 12;
    const estimatedCarryRate = input.estimatedCarryRate ?? 0.3;

    // ── Funding obtained ───────────────────────────────────────
    const totalFundingObtained = input.cards.reduce(
      (sum, c) => sum + c.currentBalance,
      0,
    );

    // ── Fee components ─────────────────────────────────────────
    const programFees = input.programFee;
    const percentOfFunding = totalFundingObtained * input.percentOfFundingFee;
    const annualFees = input.cards.reduce((sum, c) => sum + c.annualFee, 0);
    const cashAdvanceFees = this.calculateCashAdvanceFees(input.cards);
    const processorFees = input.monthlyProcessorFee * projectionMonths;

    // ── Projected interest ─────────────────────────────────────
    const projectedInterest = this.projectInterest(
      input.cards,
      projectionMonths,
      estimatedCarryRate,
    );

    // ── Total cost & effective APR ─────────────────────────────
    const totalCost =
      programFees +
      percentOfFunding +
      annualFees +
      cashAdvanceFees +
      processorFees +
      projectedInterest;

    const effectiveApr = this.computeEffectiveApr(
      totalCost,
      totalFundingObtained,
      projectionMonths,
    );

    const breakdown: CostBreakdown = {
      programFees: round2(programFees),
      percentOfFunding: round2(percentOfFunding),
      annualFees: round2(annualFees),
      cashAdvanceFees: round2(cashAdvanceFees),
      processorFees: round2(processorFees),
      totalCost: round2(totalCost),
      effectiveApr,
    };

    // ── IRC §163(j) ────────────────────────────────────────────
    const irc163jResult = this.computeIRC163j(input, projectedInterest);
    const irc163jAlert = irc163jResult ? requiresIRC163jAlert(irc163jResult) : false;

    const afterTaxEffectiveApr = this.computeAfterTaxApr(
      effectiveApr,
      irc163jResult,
      input.effectiveTaxRate ?? 0.21,
    );

    // ── Alternatives comparison ────────────────────────────────
    const alternatives = this.buildAlternatives(
      totalFundingObtained,
      projectionMonths,
    );

    const stackingAdvantage = this.computeStackingAdvantage(
      totalCost,
      alternatives,
    );

    // ── Stress test ────────────────────────────────────────────
    const stressTest = this.runStressTest(input);

    // ── Recommendation ─────────────────────────────────────────
    const recommendation = this.buildRecommendation(
      breakdown,
      irc163jResult,
      irc163jAlert,
      stackingAdvantage,
      alternatives,
      stressTest,
    );

    return {
      businessId: input.businessId,
      calculatedAt: new Date(),
      breakdown,
      totalFundingObtained: round2(totalFundingObtained),
      afterTaxEffectiveApr,
      irc163j: irc163jResult,
      irc163jAlert,
      alternatives,
      stackingAdvantage: stackingAdvantage !== null ? round2(stackingAdvantage) : null,
      stressTest,
      recommendation,
    };
  }

  // ── Fee Calculators ─────────────────────────────────────────────────────────

  /**
   * Compute total one-time cash advance transaction fees.
   * Cash advance fee = 5% of cash advance balance (min $10 per card, per standard terms).
   */
  private calculateCashAdvanceFees(cards: CardInStack[]): number {
    return cards.reduce((sum, card) => {
      if (!card.hasCashAdvance || !card.cashAdvanceBalance) return sum;
      const fee = Math.max(10, card.cashAdvanceBalance * 0.05);
      return sum + fee;
    }, 0);
  }

  /**
   * Project total interest over the projection period.
   *
   * During the promo period: interest at promoApr.
   * After promo: interest at standardApr on the carried portion.
   * estimatedCarryRate determines what fraction of the balance carries past promo.
   */
  private projectInterest(
    cards: CardInStack[],
    projectionMonths: number,
    carryRate: number,
  ): number {
    let totalInterest = 0;

    for (const card of cards) {
      const promoMonths = Math.min(card.promoExpiryMonth, projectionMonths);
      const postPromoMonths = Math.max(0, projectionMonths - promoMonths);

      // Interest during promo window
      const promoInterest =
        card.currentBalance * (card.promoApr / 12) * promoMonths;

      // Estimate the balance that carries past promo
      const carriedBalance = card.currentBalance * carryRate;

      // Cash advance portion: always at cash advance APR (no promo grace)
      const caBalance = card.cashAdvanceBalance ?? 0;
      const caApr = card.cashAdvanceApr ?? card.standardApr + 0.05;
      const caInterest = caBalance * (caApr / 12) * projectionMonths;

      // Purchase balance post-promo interest
      const postPromoInterest =
        (carriedBalance - caBalance) * (card.standardApr / 12) * postPromoMonths;

      totalInterest += promoInterest + postPromoInterest + caInterest;
    }

    return Math.max(0, totalInterest);
  }

  /**
   * Compute annualised effective APR across the full credit stack.
   *
   * Effective APR = (totalCost / totalFunding) × (12 / projectionMonths)
   *
   * This is a simplified cost-of-funds APR (not XIRR). For a rigorous
   * IRR calculation, use the stress-test cash flow projections with
   * a Newton-Raphson solver.
   */
  computeEffectiveApr(
    totalCost: number,
    totalFunding: number,
    projectionMonths: number,
  ): number | null {
    if (totalFunding <= 0) return null;
    const rawApr = (totalCost / totalFunding) * (12 / projectionMonths);
    return round4(rawApr);
  }

  // ── IRC §163(j) ─────────────────────────────────────────────────────────────

  private computeIRC163j(
    input: CostCalculationInput,
    projectedInterest: number,
  ): IRC163jResult | null {
    // Skip if caller has not provided ATI data
    if (input.adjustedTaxableIncome === undefined) return null;

    const irc163jInput: IRC163jInput = {
      adjustedTaxableIncome: input.adjustedTaxableIncome,
      businessInterestExpense: projectedInterest,
      businessInterestIncome: input.businessInterestIncome ?? 0,
      taxYear: input.taxYear ?? new Date().getFullYear(),
      averageAnnualGrossReceipts: input.averageAnnualGrossReceipts,
    };

    return computeIRC163j(irc163jInput, input.effectiveTaxRate ?? 0.21);
  }

  private computeAfterTaxApr(
    effectiveApr: number | null,
    irc163j: IRC163jResult | null,
    taxRate: number,
  ): number | null {
    if (effectiveApr === null) return null;

    // If no §163(j) data, assume interest is fully deductible
    if (irc163j === null || irc163j.isExempt) {
      return round4(effectiveApr * (1 - taxRate));
    }

    // Deductible portion lowers effective cost; non-deductible portion does not
    // after-tax APR = APR × (1 - taxRate × deductibleFraction)
    const deductibleFraction =
      irc163j.totalInterestSubjectToLimit > 0
        ? irc163j.deductibleInterest / irc163j.totalInterestSubjectToLimit
        : 1;

    return round4(effectiveApr * (1 - taxRate * deductibleFraction));
  }

  // ── Alternatives ─────────────────────────────────────────────────────────────

  private buildAlternatives(
    loanAmount: number,
    termMonths: number,
  ): AlternativeProduct[] {
    if (loanAmount <= 0) return [];

    return [
      this.buildAmortizingProduct(
        'SBA 7(a) Variable Rate',
        BENCHMARK_RATES.SBA_7A_PRIME_PLUS,
        loanAmount,
        termMonths,
        'SBA-guaranteed loan. Best rate available but requires 2+ years in business, ' +
        '680+ personal FICO, and collateral. Approval takes 30–90 days.',
      ),
      this.buildAmortizingProduct(
        'Traditional Bank LOC',
        BENCHMARK_RATES.TRADITIONAL_LOC,
        loanAmount,
        termMonths,
        'Revolving line of credit from a community bank or credit union. ' +
        'Lower rate but requires strong financials and may need personal guarantee.',
      ),
      {
        name: 'Merchant Cash Advance (MCA) — Low Factor',
        apr: BENCHMARK_RATES.MCA_FACTOR_LOW,
        totalCost: loanAmount * BENCHMARK_RATES.MCA_FACTOR_LOW * (termMonths / 12),
        monthlyPayment: (loanAmount * BENCHMARK_RATES.MCA_FACTOR_LOW * (termMonths / 12)) / termMonths,
        notes:
          'Fast funding (24–48 hrs), no credit check. ' +
          'Annualised cost 35–60%. Daily ACH debits strain cash flow. ' +
          'Not recommended for businesses with irregular revenue.',
      },
      {
        name: 'Merchant Cash Advance (MCA) — High Factor',
        apr: BENCHMARK_RATES.MCA_FACTOR_HIGH,
        totalCost: loanAmount * BENCHMARK_RATES.MCA_FACTOR_HIGH * (termMonths / 12),
        monthlyPayment: (loanAmount * BENCHMARK_RATES.MCA_FACTOR_HIGH * (termMonths / 12)) / termMonths,
        notes:
          'High-cost MCA for businesses with poor credit or very recent start. ' +
          'Annualised cost up to 60%+. Consider as last resort only.',
      },
      {
        name: 'Revenue-Based Financing',
        apr: BENCHMARK_RATES.REVENUE_BASED_FINANCE,
        totalCost: loanAmount * BENCHMARK_RATES.REVENUE_BASED_FINANCE * (termMonths / 12),
        monthlyPayment: (loanAmount * BENCHMARK_RATES.REVENUE_BASED_FINANCE * (termMonths / 12)) / termMonths,
        notes:
          'Repayment tied to monthly revenue (typically 5–15%). ' +
          'Flexible but expensive vs bank financing. Good fit for seasonal businesses.',
      },
    ];
  }

  private buildAmortizingProduct(
    name: string,
    apr: number,
    principal: number,
    termMonths: number,
    notes: string,
  ): AlternativeProduct {
    const monthlyRate = apr / 12;
    // Standard amortisation formula
    const monthlyPayment =
      monthlyRate > 0
        ? (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
          (Math.pow(1 + monthlyRate, termMonths) - 1)
        : principal / termMonths;

    const totalPaid = monthlyPayment * termMonths;
    const totalCost = totalPaid - principal;

    return {
      name,
      apr,
      totalCost: round2(totalCost),
      monthlyPayment: round2(monthlyPayment),
      notes,
    };
  }

  private computeStackingAdvantage(
    stackingTotalCost: number,
    alternatives: AlternativeProduct[],
  ): number | null {
    if (alternatives.length === 0) return null;

    // Compare against the cheapest "legitimate" alternative (SBA or LOC)
    const cheapestAlt = alternatives.reduce(
      (min, alt) => (alt.totalCost < min.totalCost ? alt : min),
      alternatives[0],
    );

    // Positive = stacking is cheaper; negative = stacking is more expensive
    return cheapestAlt.totalCost - stackingTotalCost;
  }

  // ── Stress Test ──────────────────────────────────────────────────────────────

  private runStressTest(input: CostCalculationInput): FullStressTestResult | null {
    if (!input.monthlyRevenue || !input.monthlyOperatingExpenses) return null;

    const stressCards: StressTestCard[] = input.cards.map((c) => ({
      id: c.id,
      creditLimit: c.creditLimit,
      currentBalance: c.currentBalance,
      promoApr: c.promoApr,
      standardApr: c.standardApr,
      promoExpiryMonth: c.promoExpiryMonth,
      annualFee: c.annualFee,
      minPaymentRate: c.minPaymentRate,
      hasCashAdvance: c.hasCashAdvance,
      cashAdvanceBalance: c.cashAdvanceBalance,
      cashAdvanceApr: c.cashAdvanceApr,
    }));

    const stressInput: StressTestInput = {
      cards: stressCards,
      monthlyRevenue: input.monthlyRevenue,
      monthlyOperatingExpenses: input.monthlyOperatingExpenses,
      programFee: input.programFee,
      monthlyProcessorFee: input.monthlyProcessorFee,
    };

    return runFullStressTest(stressInput);
  }

  // ── Recommendation ────────────────────────────────────────────────────────────

  private buildRecommendation(
    breakdown: CostBreakdown,
    irc163j: IRC163jResult | null,
    irc163jAlert: boolean,
    stackingAdvantage: number | null,
    alternatives: AlternativeProduct[],
    stressTest: FullStressTestResult | null,
  ): string {
    const parts: string[] = [];

    const aprStr =
      breakdown.effectiveApr !== null
        ? `${(breakdown.effectiveApr * 100).toFixed(2)}%`
        : 'N/A';
    parts.push(
      `All-in effective APR: ${aprStr}. ` +
      `Total projected cost: $${breakdown.totalCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}.`,
    );

    if (stackingAdvantage !== null) {
      const cheapestAlt = alternatives.reduce(
        (min, a) => (a.totalCost < min.totalCost ? a : min),
        alternatives[0],
      );
      if (stackingAdvantage > 0) {
        parts.push(
          `Credit card stacking saves an estimated $${stackingAdvantage.toLocaleString('en-US', { maximumFractionDigits: 0 })} ` +
          `vs. ${cheapestAlt.name} over the projection period.`,
        );
      } else {
        parts.push(
          `CAUTION: Credit card stacking costs $${Math.abs(stackingAdvantage).toLocaleString('en-US', { maximumFractionDigits: 0 })} MORE ` +
          `than ${cheapestAlt.name}. Evaluate whether accessibility and speed justify the premium.`,
        );
      }
    }

    if (irc163jAlert && irc163j) {
      parts.push(
        `TAX ALERT: §163(j) limitation in effect — $${irc163j.disallowedAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })} ` +
        `of interest expense is non-deductible this year. Consult your CPA.`,
      );
    } else if (irc163j && !irc163j.isExempt) {
      parts.push(`§163(j) review complete — interest expense is within deductible limits this year.`);
    }

    if (stressTest) {
      const worst = stressTest.worst.summary;
      if (worst.cashFlowNegativeMonths.length > 0) {
        parts.push(
          `STRESS TEST WARNING: Worst-case scenario projects negative cash flow in ` +
          `${worst.cashFlowNegativeMonths.length} month(s). ` +
          `Ensure a 3–6 month cash reserve before proceeding.`,
        );
      }
      if (worst.totalInterestShock > 0) {
        parts.push(
          `Promotional period expiry could trigger an interest shock of ` +
          `$${worst.totalInterestShock.toLocaleString('en-US', { maximumFractionDigits: 0 })} ` +
          `in worst case. Set repayment calendar alerts 60 days before each promo expiry.`,
        );
      }
    }

    return parts.join(' ');
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

export const costCalculatorService = new CostCalculatorService();

// ── In-memory store for "latest" result per business ─────────────────────────
// In production this would be persisted to Postgres via Prisma.

const latestResults = new Map<string, CostCalculationResult>();

export function saveLatestResult(result: CostCalculationResult): void {
  latestResults.set(result.businessId, result);
}

export function getLatestResult(businessId: string): CostCalculationResult | undefined {
  return latestResults.get(businessId);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
