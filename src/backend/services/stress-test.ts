// ============================================================
// CapitalForge — Cash Flow Stress Test
//
// Models 24-month cash flow projections across three scenarios:
//
//   BEST CASE  — All balances at promo APR (0%), full repayment
//                before promotional period ends, no carry.
//
//   BASE CASE  — Partial revolving at post-promo APR, some
//                annual/processor fees hit, normal utilisation.
//
//   WORST CASE — All balances carry past promo windows, cash
//                advance fees compound, missed payment penalties,
//                maximum "interest shock" on balance roll-over.
//
// Outputs monthly cash flow projections for exactly 24 months.
// ============================================================

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreditCard {
  id: string;
  /** Credit limit on this card */
  creditLimit: number;
  /** Current outstanding balance */
  currentBalance: number;
  /** Promotional APR (e.g. 0.00 for 0%) */
  promoApr: number;
  /** Post-promotional / standard purchase APR (e.g. 0.2499 for 24.99%) */
  standardApr: number;
  /** Month index (1-based) when promotional period ends (relative to projection start) */
  promoExpiryMonth: number;
  /** Annual card fee (billed once per year, month 1 and month 13) */
  annualFee: number;
  /** Minimum payment as a fraction of the balance (e.g. 0.02 = 2%) */
  minPaymentRate: number;
  /** Whether this card has been used for a cash advance in the base/worst scenarios */
  hasCashAdvance?: boolean;
  /** Cash advance balance (subset of currentBalance) */
  cashAdvanceBalance?: number;
  /** Cash advance APR (typically higher than standard APR) */
  cashAdvanceApr?: number;
}

export interface StressTestInput {
  cards: CreditCard[];
  /** Monthly revenue the business expects */
  monthlyRevenue: number;
  /** Monthly operating expenses EXCLUDING debt service */
  monthlyOperatingExpenses: number;
  /**
   * Percentage of available cash flow the business allocates to
   * credit card repayment each month (0.0 – 1.0).
   * Best: 1.0, Base: 0.6, Worst: 0.3 — overridden per scenario.
   */
  repaymentCapacityRate?: number;
  /**
   * Program / broker fee paid at the start (one-time).
   * Deducted in month 1 of each scenario.
   */
  programFee?: number;
  /**
   * Monthly processor fee (e.g. Square/Stripe fees for using
   * business cards through a processor).
   */
  monthlyProcessorFee?: number;
  /** Missed payment penalty per card per occurrence */
  lateFeePerCard?: number;
}

export interface MonthlyProjection {
  month: number;        // 1–24
  scenario: ScenarioName;
  openingBalance: number;
  interest: number;
  fees: number;         // annual fees + processor fees + late fees
  payment: number;      // total principal payment made
  cashAdvanceFees: number;
  closingBalance: number;
  /** Net monthly cash flow after all debt service */
  netCashFlow: number;
  /** Cumulative interest paid so far in this scenario */
  cumulativeInterest: number;
  /** Running total cost of capital (interest + fees) */
  cumulativeTotalCost: number;
  /** Flag: promotional period expired on at least one card this month */
  interestShockMonth: boolean;
  /** APR shock magnitude — incremental interest due to promo expiry this month */
  interestShockAmount: number;
  notes: string[];
}

export interface StressTestResult {
  scenario: ScenarioName;
  projections: MonthlyProjection[];
  summary: StressTestSummary;
}

export interface StressTestSummary {
  totalInterestPaid: number;
  totalFeesPaid: number;
  totalCashAdvanceFees: number;
  totalCostOfCapital: number;
  peakOutstandingBalance: number;
  finalBalance: number;
  /** Month when balance first reaches zero (null if never in this scenario) */
  payoffMonth: number | null;
  /** Whether the business runs out of cash (negative net cash flow) in any month */
  cashFlowNegativeMonths: number[];
  /** Total interest shock dollars experienced across all promo expiries */
  totalInterestShock: number;
  /** Effective APR across the full 24-month scenario */
  effectiveApr: number | null;
}

export type ScenarioName = 'best' | 'base' | 'worst';

export interface FullStressTestResult {
  best: StressTestResult;
  base: StressTestResult;
  worst: StressTestResult;
  comparisonTable: ScenarioComparison[];
}

export interface ScenarioComparison {
  metric: string;
  best: string;
  base: string;
  worst: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECTION_MONTHS = 24;

/** Best case: full cash flow allocated to repayment */
const BEST_REPAYMENT_RATE = 1.0;
/** Base case: 60% of available cash flow to repayment */
const BASE_REPAYMENT_RATE = 0.6;
/** Worst case: 30% of available cash flow to repayment (liquidity crunch) */
const WORST_REPAYMENT_RATE = 0.3;

/** Late fee per card per missed payment in worst case */
const DEFAULT_LATE_FEE = 39;
/** Cash advance transaction fee rate (% of advance, charged once) */
const CASH_ADVANCE_TRANSACTION_FEE_RATE = 0.05; // 5%
/** Default cash advance APR */
const DEFAULT_CASH_ADVANCE_APR = 0.2999; // 29.99%

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all three scenarios and return a combined result with comparison table.
 */
export function runFullStressTest(input: StressTestInput): FullStressTestResult {
  const best = runScenario(input, 'best');
  const base = runScenario(input, 'base');
  const worst = runScenario(input, 'worst');

  return {
    best,
    base,
    worst,
    comparisonTable: buildComparisonTable(best.summary, base.summary, worst.summary),
  };
}

/**
 * Run a single named scenario.
 */
export function runScenario(
  input: StressTestInput,
  scenario: ScenarioName,
): StressTestResult {
  const projections = projectScenario(input, scenario);
  const summary = summariseScenario(projections, input);
  return { scenario, projections, summary };
}

// ── Scenario Engine ───────────────────────────────────────────────────────────

function projectScenario(
  input: StressTestInput,
  scenario: ScenarioName,
): MonthlyProjection[] {
  const projections: MonthlyProjection[] = [];

  // Deep-copy card state so scenario mutations don't bleed across calls
  const cards: CreditCard[] = input.cards.map((c) => ({
    ...c,
    currentBalance: c.currentBalance,
    cashAdvanceBalance: c.cashAdvanceBalance ?? 0,
  }));

  const repaymentRate = resolveRepaymentRate(scenario, input.repaymentCapacityRate);
  const programFee = input.programFee ?? 0;
  const monthlyProcessorFee = input.monthlyProcessorFee ?? 0;
  const lateFeePerCard = input.lateFeePerCard ?? DEFAULT_LATE_FEE;

  let cumulativeInterest = 0;
  let cumulativeTotalCost = 0;

  for (let month = 1; month <= PROJECTION_MONTHS; month++) {
    const notes: string[] = [];
    let totalInterest = 0;
    let totalFees = 0;
    let totalCashAdvanceFees = 0;
    let totalPayment = 0;
    let interestShockAmount = 0;
    let interestShockMonth = false;

    // ── One-time program fee in month 1 ─────────────────────
    if (month === 1 && programFee > 0) {
      totalFees += programFee;
      notes.push(`Program fee: $${fmt(programFee)}`);
    }

    // ── Monthly processor fee ────────────────────────────────
    if (monthlyProcessorFee > 0) {
      totalFees += monthlyProcessorFee;
    }

    // ── Per-card calculations ────────────────────────────────
    const openingBalance = cards.reduce((s, c) => s + c.currentBalance, 0);

    for (const card of cards) {
      if (card.currentBalance <= 0) continue;

      const isPromoActive = month <= card.promoExpiryMonth;
      const wasPromoActive = (month - 1) <= card.promoExpiryMonth;

      // ── Annual fee (month 1 and month 13) ─────────────────
      if (card.annualFee > 0 && (month === 1 || month === 13)) {
        totalFees += card.annualFee;
        notes.push(`Annual fee (${card.id}): $${fmt(card.annualFee)}`);
      }

      // ── Cash advance fees (worst/base: one-time in month 1 if applicable) ─
      if (
        month === 1 &&
        card.hasCashAdvance &&
        (card.cashAdvanceBalance ?? 0) > 0 &&
        scenario !== 'best'
      ) {
        const caFee = (card.cashAdvanceBalance ?? 0) * CASH_ADVANCE_TRANSACTION_FEE_RATE;
        totalCashAdvanceFees += caFee;
        notes.push(`Cash advance fee (${card.id}): $${fmt(caFee)}`);
      }

      // ── Interest calculation ───────────────────────────────
      let cardInterest = 0;

      if (isPromoActive) {
        // Promo period: interest charged at promo APR (commonly 0%)
        cardInterest = (card.currentBalance * card.promoApr) / 12;
      } else {
        // Post-promo: standard purchase APR
        const purchaseBalance =
          card.currentBalance - (card.cashAdvanceBalance ?? 0);
        const purchaseInterest =
          (Math.max(0, purchaseBalance) * card.standardApr) / 12;

        // Cash advance interest (accrues immediately — no grace period)
        const caApr = card.cashAdvanceApr ?? DEFAULT_CASH_ADVANCE_APR;
        const caInterest =
          ((card.cashAdvanceBalance ?? 0) * caApr) / 12;

        cardInterest = purchaseInterest + caInterest;
      }

      // ── Interest shock detection ──────────────────────────
      // A shock occurs in the first post-promo month (promo was active
      // last month, not active this month).
      if (wasPromoActive && !isPromoActive && month > 1) {
        const preShockInterest = (card.currentBalance * card.promoApr) / 12;
        const postShockInterest = (card.currentBalance * card.standardApr) / 12;
        const shock = postShockInterest - preShockInterest;
        if (shock > 0) {
          interestShockAmount += shock;
          interestShockMonth = true;
          notes.push(
            `INTEREST SHOCK: ${card.id} promo expired. Monthly interest jumped by $${fmt(shock)} ` +
            `(${(card.standardApr * 100).toFixed(2)}% APR applied to $${fmt(card.currentBalance)})`,
          );
        }
      }

      totalInterest += cardInterest;
      card.currentBalance += cardInterest;

      // ── Worst case: missed payment penalty ────────────────
      if (scenario === 'worst' && Math.random() < 0.15) {
        // 15% probability of a late payment per card per month in worst case
        // (deterministic seeding not used — production version should use
        // a seeded PRNG for reproducibility; for now we use a fixed schedule)
        // To keep tests deterministic, we do NOT use Math.random in worst-case
        // core logic. Instead, flag via parameter.
      }
    }

    // ── Worst case: add late fees for cards with minimum payment risk ──
    if (scenario === 'worst') {
      const atRiskCards = cards.filter(
        (c) => c.currentBalance > 0 && month > 6, // late payments start after month 6
      );
      // Model 1 missed payment per 4 months per at-risk card (deterministic)
      const missedThisMonth = atRiskCards.filter((_, i) => (month + i) % 4 === 0);
      for (const card of missedThisMonth) {
        totalFees += lateFeePerCard;
        notes.push(`Late fee (${card.id}): $${fmt(lateFeePerCard)}`);
      }
    }

    // ── Available cash for debt service ──────────────────────
    const operatingCashFlow =
      input.monthlyRevenue - input.monthlyOperatingExpenses - monthlyProcessorFee;
    const availableForRepayment = Math.max(0, operatingCashFlow * repaymentRate);

    // Allocate payment proportionally across cards by balance weight
    const totalBalance = cards.reduce((s, c) => s + Math.max(0, c.currentBalance), 0);

    if (totalBalance > 0 && availableForRepayment > 0) {
      const actualPayment = Math.min(availableForRepayment, totalBalance);
      totalPayment = actualPayment;

      for (const card of cards) {
        if (card.currentBalance <= 0) continue;
        const share = card.currentBalance / totalBalance;
        const cardPayment = actualPayment * share;
        card.currentBalance = Math.max(0, card.currentBalance - cardPayment);
        // Reduce cash advance balance proportionally
        if ((card.cashAdvanceBalance ?? 0) > 0) {
          const caShare = (card.cashAdvanceBalance ?? 0) / (card.currentBalance + cardPayment);
          card.cashAdvanceBalance = Math.max(
            0,
            (card.cashAdvanceBalance ?? 0) - cardPayment * caShare,
          );
        }
      }
    }

    const closingBalance = cards.reduce((s, c) => s + Math.max(0, c.currentBalance), 0);
    const netCashFlow =
      operatingCashFlow - totalPayment - totalFees - totalCashAdvanceFees;

    cumulativeInterest += totalInterest;
    cumulativeTotalCost += totalInterest + totalFees + totalCashAdvanceFees;

    projections.push({
      month,
      scenario,
      openingBalance,
      interest: round2(totalInterest),
      fees: round2(totalFees),
      payment: round2(totalPayment),
      cashAdvanceFees: round2(totalCashAdvanceFees),
      closingBalance: round2(closingBalance),
      netCashFlow: round2(netCashFlow),
      cumulativeInterest: round2(cumulativeInterest),
      cumulativeTotalCost: round2(cumulativeTotalCost),
      interestShockMonth,
      interestShockAmount: round2(interestShockAmount),
      notes,
    });

    // Early exit if fully paid off (keep remaining months as $0 balance)
    if (closingBalance <= 0) {
      for (let m = month + 1; m <= PROJECTION_MONTHS; m++) {
        projections.push(zeroPaidOffMonth(m, scenario, cumulativeInterest, cumulativeTotalCost));
      }
      break;
    }
  }

  return projections;
}

// ── Summary Computation ───────────────────────────────────────────────────────

function summariseScenario(
  projections: MonthlyProjection[],
  input: StressTestInput,
): StressTestSummary {
  const totalInterestPaid = projections.reduce((s, p) => s + p.interest, 0);
  const totalFeesPaid = projections.reduce((s, p) => s + p.fees, 0);
  const totalCashAdvanceFees = projections.reduce((s, p) => s + p.cashAdvanceFees, 0);
  const totalCostOfCapital = totalInterestPaid + totalFeesPaid + totalCashAdvanceFees;
  const peakOutstandingBalance = Math.max(...projections.map((p) => p.openingBalance));
  const finalBalance = projections[projections.length - 1]?.closingBalance ?? 0;

  const payoffProjection = projections.find((p) => p.closingBalance <= 0);
  const payoffMonth = payoffProjection?.month ?? null;

  const cashFlowNegativeMonths = projections
    .filter((p) => p.netCashFlow < 0)
    .map((p) => p.month);

  const totalInterestShock = projections
    .filter((p) => p.interestShockMonth)
    .reduce((s, p) => s + p.interestShockAmount, 0);

  // Effective APR: annualise the 24-month total cost over average balance
  const initialBalance = input.cards.reduce((s, c) => s + c.currentBalance, 0);
  const averageBalance = projections.reduce((s, p) => s + p.openingBalance, 0) / projections.length;
  const effectiveApr =
    averageBalance > 0
      ? (totalCostOfCapital / (averageBalance * (PROJECTION_MONTHS / 12))) * (12 / PROJECTION_MONTHS)
      : null;

  return {
    totalInterestPaid: round2(totalInterestPaid),
    totalFeesPaid: round2(totalFeesPaid),
    totalCashAdvanceFees: round2(totalCashAdvanceFees),
    totalCostOfCapital: round2(totalCostOfCapital),
    peakOutstandingBalance: round2(peakOutstandingBalance),
    finalBalance: round2(finalBalance),
    payoffMonth,
    cashFlowNegativeMonths,
    totalInterestShock: round2(totalInterestShock),
    effectiveApr: effectiveApr !== null ? round4(effectiveApr) : null,
  };
}

// ── Comparison Table ──────────────────────────────────────────────────────────

function buildComparisonTable(
  best: StressTestSummary,
  base: StressTestSummary,
  worst: StressTestSummary,
): ScenarioComparison[] {
  const pct = (n: number | null) => (n !== null ? `${(n * 100).toFixed(2)}%` : 'N/A');
  const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const mo = (n: number | null) => (n !== null ? `Month ${n}` : 'Not paid off');

  return [
    {
      metric: 'Total Interest Paid',
      best: usd(best.totalInterestPaid),
      base: usd(base.totalInterestPaid),
      worst: usd(worst.totalInterestPaid),
    },
    {
      metric: 'Total Fees Paid',
      best: usd(best.totalFeesPaid),
      base: usd(base.totalFeesPaid),
      worst: usd(worst.totalFeesPaid),
    },
    {
      metric: 'Total Cash Advance Fees',
      best: usd(best.totalCashAdvanceFees),
      base: usd(base.totalCashAdvanceFees),
      worst: usd(worst.totalCashAdvanceFees),
    },
    {
      metric: 'Total Cost of Capital',
      best: usd(best.totalCostOfCapital),
      base: usd(base.totalCostOfCapital),
      worst: usd(worst.totalCostOfCapital),
    },
    {
      metric: 'Peak Outstanding Balance',
      best: usd(best.peakOutstandingBalance),
      base: usd(base.peakOutstandingBalance),
      worst: usd(worst.peakOutstandingBalance),
    },
    {
      metric: 'Final Balance (Month 24)',
      best: usd(best.finalBalance),
      base: usd(base.finalBalance),
      worst: usd(worst.finalBalance),
    },
    {
      metric: 'Payoff Month',
      best: mo(best.payoffMonth),
      base: mo(base.payoffMonth),
      worst: mo(worst.payoffMonth),
    },
    {
      metric: 'Months with Negative Cash Flow',
      best: String(best.cashFlowNegativeMonths.length),
      base: String(base.cashFlowNegativeMonths.length),
      worst: String(worst.cashFlowNegativeMonths.length),
    },
    {
      metric: 'Total Interest Shock',
      best: usd(best.totalInterestShock),
      base: usd(base.totalInterestShock),
      worst: usd(worst.totalInterestShock),
    },
    {
      metric: 'Effective APR (24-month)',
      best: pct(best.effectiveApr),
      base: pct(base.effectiveApr),
      worst: pct(worst.effectiveApr),
    },
  ];
}

// ── Utility ───────────────────────────────────────────────────────────────────

function resolveRepaymentRate(
  scenario: ScenarioName,
  override?: number,
): number {
  if (override !== undefined) return override;
  switch (scenario) {
    case 'best':  return BEST_REPAYMENT_RATE;
    case 'base':  return BASE_REPAYMENT_RATE;
    case 'worst': return WORST_REPAYMENT_RATE;
  }
}

function zeroPaidOffMonth(
  month: number,
  scenario: ScenarioName,
  cumulativeInterest: number,
  cumulativeTotalCost: number,
): MonthlyProjection {
  return {
    month,
    scenario,
    openingBalance: 0,
    interest: 0,
    fees: 0,
    payment: 0,
    cashAdvanceFees: 0,
    closingBalance: 0,
    netCashFlow: 0,
    cumulativeInterest,
    cumulativeTotalCost,
    interestShockMonth: false,
    interestShockAmount: 0,
    notes: ['Balance fully paid off'],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
