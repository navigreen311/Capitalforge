// ============================================================
// CapitalForge — IRC §163(j) Business Interest Deductibility
//
// IRC §163(j) limits the deduction for business interest expense
// to the sum of:
//   (1) Business interest income
//   (2) Floor plan financing interest
//   (3) 30% of Adjusted Taxable Income (ATI)
//
// Excess interest is carried forward indefinitely.
//
// Note: Small businesses (average annual gross receipts ≤ $29M
// under §448(c) for 2024, inflation-adjusted) are exempt from
// §163(j). This service models the limitation for businesses
// that exceed the threshold or elect to be subject to it.
//
// This is a financial modeling tool — not legal or tax advice.
// Always engage a qualified CPA or tax attorney.
// ============================================================

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IRC163jInput {
  /**
   * Adjusted Taxable Income (ATI) for the tax year.
   * For tax years beginning before 1 Jan 2022: EBITDA-based (add back D&A).
   * For tax years beginning on/after 1 Jan 2022: EBIT-based (no D&A add-back).
   * Caller is responsible for computing ATI correctly per §163(j)(8).
   */
  adjustedTaxableIncome: number;

  /** Total business interest expense for the year (credit card interest, loans, etc.) */
  businessInterestExpense: number;

  /** Total business interest income for the year (bank interest, note receivable, etc.) */
  businessInterestIncome: number;

  /**
   * Floor plan financing interest (auto dealers / inventory financing).
   * Fully deductible, does not count against the §163(j) cap.
   * Defaults to 0 for non-floor-plan businesses.
   */
  floorPlanFinancingInterest?: number;

  /**
   * Disallowed business interest expense carried forward from prior years.
   * Increases total interest subject to the limitation in the current year.
   */
  priorYearCarryforward?: number;

  /** Calendar year for the computation (affects ATI definition pre/post 2022) */
  taxYear: number;

  /**
   * Average annual gross receipts over the prior 3 years.
   * Used to check small-business exemption threshold.
   */
  averageAnnualGrossReceipts?: number;

  /**
   * Small-business exemption threshold for the tax year.
   * Defaults to $29,000,000 (2024 inflation-adjusted figure).
   * Update annually per IRS Rev. Proc.
   */
  smallBusinessThreshold?: number;
}

export interface IRC163jResult {
  /** Whether this business qualifies for the small-business exemption */
  isExempt: boolean;

  /** The 30%-of-ATI ceiling on deductible business interest */
  atiLimit: number;

  /** Maximum deductible business interest this year (income + floor plan + ATI limit) */
  deductibilityLimit: number;

  /** Total business interest expense entering the §163(j) computation */
  totalInterestSubjectToLimit: number;

  /** Deductible business interest expense for this tax year */
  deductibleInterest: number;

  /** Disallowed amount — becomes carryforward to next year */
  disallowedAmount: number;

  /** Updated total carryforward (prior carryforward + this year's disallowed) */
  updatedCarryforward: number;

  /** Human-readable flag when interest expense risks exceeding deductible limits */
  limitationFlag: IRC163jLimitationFlag;

  /** Projected tax impact of the disallowed amount (informational only) */
  projectedTaxImpactOfDisallowance: number;

  /** Summary narrative for display in the CapitalForge UI */
  narrative: string;

  /** ATI definition applied ('EBITDA-based (pre-2022)' | 'EBIT-based (2022+)') */
  atiDefinition: string;
}

export type IRC163jLimitationFlag =
  | 'no_limitation'        // interest expense is fully deductible
  | 'within_safe_zone'     // usage < 80% of limit — monitor
  | 'approaching_limit'    // usage 80–99% of limit — high alert
  | 'at_limit'             // exactly at the limit
  | 'exceeds_limit'        // disallowed amount generated — carryforward created
  | 'exempt';              // small-business exemption applies

// ── Constants ─────────────────────────────────────────────────────────────────

const ATI_RATE = 0.30; // §163(j)(1)(B) — 30% of ATI
const DEFAULT_SMALL_BUSINESS_THRESHOLD = 29_000_000; // 2024 figure
const APPROACHING_LIMIT_THRESHOLD = 0.80; // warn at 80% utilisation

// ── Core Calculator ───────────────────────────────────────────────────────────

/**
 * Compute the §163(j) business interest expense limitation.
 *
 * @param input - Yearly financial inputs required for the §163(j) analysis.
 * @param effectiveTaxRate - Optional blended tax rate for projecting the
 *   cash cost of the disallowed deduction (default: 0.21 federal C-corp rate).
 * @returns A structured result with deductibility limits, carryforward, and flags.
 */
export function computeIRC163j(
  input: IRC163jInput,
  effectiveTaxRate = 0.21,
): IRC163jResult {
  const {
    adjustedTaxableIncome,
    businessInterestExpense,
    businessInterestIncome,
    floorPlanFinancingInterest = 0,
    priorYearCarryforward = 0,
    taxYear,
    averageAnnualGrossReceipts,
    smallBusinessThreshold = DEFAULT_SMALL_BUSINESS_THRESHOLD,
  } = input;

  // ── Small-business exemption check ──────────────────────────
  const isExempt =
    averageAnnualGrossReceipts !== undefined &&
    averageAnnualGrossReceipts <= smallBusinessThreshold;

  if (isExempt) {
    const deductible = businessInterestExpense + priorYearCarryforward;
    return {
      isExempt: true,
      atiLimit: 0,
      deductibilityLimit: Infinity,
      totalInterestSubjectToLimit: deductible,
      deductibleInterest: deductible,
      disallowedAmount: 0,
      updatedCarryforward: 0,
      limitationFlag: 'exempt',
      projectedTaxImpactOfDisallowance: 0,
      atiDefinition: atiDefinitionLabel(taxYear),
      narrative: buildNarrative('exempt', deductible, 0, 0, isExempt),
    };
  }

  // ── ATI definition note ──────────────────────────────────────
  const atiDefinition = atiDefinitionLabel(taxYear);

  // ── §163(j) three-part cap ───────────────────────────────────
  // Cap = business interest income + floor plan financing + (30% × ATI)
  const atiComponent = Math.max(0, adjustedTaxableIncome) * ATI_RATE;
  const deductibilityLimit =
    Math.max(0, businessInterestIncome) +
    Math.max(0, floorPlanFinancingInterest) +
    atiComponent;

  // Total interest entering the test = current year + prior carryforward
  const totalInterestSubjectToLimit =
    Math.max(0, businessInterestExpense) + Math.max(0, priorYearCarryforward);

  // Deductible this year is the lesser of the interest subject to limit or the cap
  const deductibleInterest = Math.min(totalInterestSubjectToLimit, deductibilityLimit);

  // Disallowed amount carries forward to next year indefinitely
  const disallowedAmount = Math.max(0, totalInterestSubjectToLimit - deductibilityLimit);
  const updatedCarryforward = disallowedAmount;

  // ── Limitation flag ──────────────────────────────────────────
  const limitationFlag = deriveLimitationFlag(
    totalInterestSubjectToLimit,
    deductibilityLimit,
    disallowedAmount,
  );

  // ── Projected tax impact of disallowance ─────────────────────
  // The disallowed amount is a deduction deferred — it increases
  // taxable income now by the disallowed amount.
  const projectedTaxImpactOfDisallowance = disallowedAmount * effectiveTaxRate;

  const narrative = buildNarrative(
    limitationFlag,
    deductibleInterest,
    disallowedAmount,
    updatedCarryforward,
    isExempt,
    atiComponent,
    deductibilityLimit,
    totalInterestSubjectToLimit,
    taxYear,
  );

  return {
    isExempt,
    atiLimit: atiComponent,
    deductibilityLimit,
    totalInterestSubjectToLimit,
    deductibleInterest,
    disallowedAmount,
    updatedCarryforward,
    limitationFlag,
    projectedTaxImpactOfDisallowance,
    atiDefinition,
    narrative,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function atiDefinitionLabel(taxYear: number): string {
  return taxYear < 2022
    ? 'EBITDA-based (pre-2022): depreciation & amortization added back to ATI'
    : 'EBIT-based (2022+): depreciation & amortization NOT added back to ATI';
}

function deriveLimitationFlag(
  totalInterest: number,
  limit: number,
  disallowed: number,
): IRC163jLimitationFlag {
  if (disallowed > 0) return 'exceeds_limit';
  if (limit === 0 && totalInterest === 0) return 'no_limitation';
  if (totalInterest === limit) return 'at_limit';

  const utilisationRatio = limit > 0 ? totalInterest / limit : 0;

  if (utilisationRatio >= APPROACHING_LIMIT_THRESHOLD) return 'approaching_limit';
  if (utilisationRatio > 0) return 'within_safe_zone';
  return 'no_limitation';
}

function buildNarrative(
  flag: IRC163jLimitationFlag,
  deductible: number,
  disallowed: number,
  carryforward: number,
  isExempt: boolean,
  atiComponent?: number,
  limit?: number,
  total?: number,
  taxYear?: number,
): string {
  const fmt = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  if (isExempt) {
    return (
      'This business qualifies for the §163(j) small-business exemption ' +
      '(average gross receipts ≤ threshold). All business interest expense is ' +
      `fully deductible — ${fmt(deductible)} deducted with no carryforward.`
    );
  }

  const yearNote = taxYear && taxYear >= 2022
    ? ' Note: post-2022 ATI excludes depreciation & amortization, which reduces the deductible limit.'
    : '';

  switch (flag) {
    case 'no_limitation':
      return `Business interest expense is below the §163(j) cap. ${fmt(deductible)} is fully deductible. No carryforward created.${yearNote}`;

    case 'within_safe_zone':
      return (
        `Business interest expense of ${fmt(total ?? 0)} is within the §163(j) limit ` +
        `of ${fmt(limit ?? 0)} (30% ATI component: ${fmt(atiComponent ?? 0)}). ` +
        `Fully deductible. Monitor as credit utilisation grows.${yearNote}`
      );

    case 'approaching_limit':
      return (
        `WARNING: Business interest expense of ${fmt(total ?? 0)} is approaching the ` +
        `§163(j) cap of ${fmt(limit ?? 0)}. Consider timing strategies (pay down balances, ` +
        `increase ATI, or elect RPTOB exception if eligible) before year-end.${yearNote}`
      );

    case 'at_limit':
      return (
        `Business interest expense of ${fmt(total ?? 0)} exactly equals the §163(j) limit. ` +
        `Any additional interest this year will be disallowed. No carryforward yet.${yearNote}`
      );

    case 'exceeds_limit':
      return (
        `ALERT: §163(j) limitation triggered. Total interest subject to test: ${fmt(total ?? 0)}. ` +
        `Deductibility cap (30% ATI + interest income): ${fmt(limit ?? 0)}. ` +
        `Deductible this year: ${fmt(deductible)}. ` +
        `Disallowed amount (carried forward indefinitely): ${fmt(disallowed)}. ` +
        `This carryforward reduces future deductibility until utilised. ` +
        `Consult a tax advisor immediately.${yearNote}`
      );

    default:
      return `§163(j) computation complete. Deductible: ${fmt(deductible)}, Carryforward: ${fmt(carryforward)}.`;
  }
}

// ── Multi-year Projection ─────────────────────────────────────────────────────

export interface IRC163jYearlyInput extends Omit<IRC163jInput, 'priorYearCarryforward'> {
  /** Not supplied here — carried forward automatically between years */
  priorYearCarryforward?: never;
}

export interface IRC163jProjection {
  year: number;
  result: IRC163jResult;
}

/**
 * Project §163(j) carryforward dynamics across multiple years.
 * Automatically threads the `updatedCarryforward` from each year
 * into the next year's `priorYearCarryforward`.
 *
 * @param yearlyInputs - One entry per year, in chronological order.
 * @param effectiveTaxRate - Blended tax rate for disallowance cost projection.
 */
export function projectIRC163j(
  yearlyInputs: IRC163jYearlyInput[],
  effectiveTaxRate = 0.21,
): IRC163jProjection[] {
  const projections: IRC163jProjection[] = [];
  let carryforward = 0;

  for (const yearInput of yearlyInputs) {
    const inputWithCarryforward: IRC163jInput = {
      ...yearInput,
      priorYearCarryforward: carryforward,
    };

    const result = computeIRC163j(inputWithCarryforward, effectiveTaxRate);
    projections.push({ year: yearInput.taxYear, result });

    // Thread carryforward forward
    carryforward = result.updatedCarryforward;
  }

  return projections;
}

// ── Summary Helpers ───────────────────────────────────────────────────────────

/**
 * Returns true if the §163(j) limitation flag warrants an immediate alert.
 * Use to trigger notifications or compliance flags in CapitalForge.
 */
export function requiresIRC163jAlert(result: IRC163jResult): boolean {
  return (
    result.limitationFlag === 'approaching_limit' ||
    result.limitationFlag === 'at_limit' ||
    result.limitationFlag === 'exceeds_limit'
  );
}

/**
 * Compute the minimum ATI required for the entire current-year
 * interest expense to be fully deductible (assuming interest income
 * and floor plan financing are already accounted for).
 */
export function minimumATIForFullDeductibility(
  businessInterestExpense: number,
  businessInterestIncome: number,
  floorPlanFinancingInterest = 0,
): number {
  const remainingAfterIncome = Math.max(
    0,
    businessInterestExpense - businessInterestIncome - floorPlanFinancingInterest,
  );
  // remaining ≤ 0.30 × ATI → ATI ≥ remaining / 0.30
  return remainingAfterIncome / ATI_RATE;
}
