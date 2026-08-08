// ============================================================
// Shapes and derivations for a simulator scenario result.
//
// The page used to render the whole response through one loop that
// JSON.stringify'd anything that was not a primitive, so four structured
// objects arrived as raw JSON. These types mirror
// src/backend/services/funding-simulator.service.ts.
//
// Nothing here computes a figure. Every number rendered comes from the
// response; the only things derived are orderings and comparisons
// between values already in it.
// ============================================================

export type ProductType = 'credit_card_stack' | 'sba_7a' | 'line_of_credit' | 'mca';

export interface ProductOption {
  readonly productType: ProductType;
  readonly productName: string;
  readonly estimatedAmount: number;
  readonly effectiveApr: number;
  readonly approvalTimelineDays: number;
  readonly approvalProbability: number;
  readonly estimatedMonthlyPayment: number;
  readonly totalCost24m: number;
  readonly pros: readonly string[];
  readonly cons: readonly string[];
  readonly suitabilityScore: number;
}

export interface AlternativeComparison {
  readonly profileSummary: {
    readonly ficoScore: number;
    readonly annualRevenue: number;
    readonly existingDebt: number;
    readonly debtServiceRatio: number;
  };
  readonly options: readonly ProductOption[];
  readonly recommendation: {
    readonly primaryChoice: ProductType;
    readonly rationale: string;
    readonly warnings: readonly string[];
  };
}

export interface RepaymentMonthSnapshot {
  readonly month: number;
  readonly remainingBalance: number;
  readonly interestCharge: number;
  readonly requiredPayment: number;
  readonly isShockMonth: boolean;
}

export interface WorstCaseRepaymentPath {
  readonly interestShockMonth: number;
  readonly balanceAtShock: number;
  readonly postShockMonthlyPayment: number;
  readonly preShockMonthlyPayment: number;
  readonly paymentIncreaseRatio: number;
  readonly totalInterest24m: number;
  readonly monthlySchedule: readonly RepaymentMonthSnapshot[];
  readonly revenueCoverageRatio: number;
  readonly isSustainable: boolean;
  readonly alerts: readonly string[];
}

export interface RoundProjection {
  readonly roundNumber: number;
  readonly cardCount: number;
  readonly estimatedCreditTotal: number;
  readonly avgApprovalProbability: number;
  readonly recommendedDelayDays: number;
  readonly ficoImpactEstimate: number;
  readonly cumulativeCreditTotal: number;
}

export interface MultiRoundModel {
  readonly rounds: readonly RoundProjection[];
  readonly totalEstimatedCredit: number;
  readonly totalCards: number;
  readonly targetMet: boolean;
  readonly totalDuration: string;
  readonly confidenceRating: 'high' | 'medium' | 'low';
}

export interface ApprovalProbabilityReport {
  readonly overallStackApprovalRate: number;
  readonly atLeastOneApproval: number;
  readonly allApprovedProbability: number;
  readonly cardBreakdown: ReadonlyArray<{
    readonly issuer: string;
    readonly cardName: string;
    readonly approvalProbability: number;
    readonly minFicoRequired: number;
    readonly ficoGap: number;
  }>;
  readonly riskFactors: readonly string[];
  readonly positiveFactors: readonly string[];
}

export interface ScenarioResult {
  readonly scenarioId: string;
  readonly generatedAt: string;
  readonly label: string;
  readonly multiRoundModel: MultiRoundModel;
  readonly approvalProbabilityReport: ApprovalProbabilityReport;
  readonly worstCaseRepayment: WorstCaseRepaymentPath;
  readonly alternativeComparison: AlternativeComparison;
}

// ── The verdict ─────────────────────────────────────────────

/**
 * What the recommendation actually is, once its own scores are read
 * back against it.
 *
 * `recommendation.rationale` always says the chosen product "offers the
 * highest suitability score (N/100)", but the service picks by a rule
 * that can override the ranking — FICO under 600 and under a year in
 * operation forces a Merchant Cash Advance whatever the scores say. On
 * that path the sentence is false about data in the same response: a
 * real run returns MCA at 30 while card stacking sits at 60.
 *
 * Scores also saturate at 100, and ties break on the order the options
 * were built in, so three products at the cap report a single winner
 * with nothing to say a tie happened.
 *
 * Neither is fixable here — both are service defects, filed separately.
 * What this can do is refuse to repeat the claim, and say which of the
 * three situations produced the answer on screen.
 */
export type Verdict =
  | { readonly kind: 'clear'; readonly chosen: ProductOption }
  | { readonly kind: 'tied'; readonly chosen: ProductOption; readonly tiedWith: readonly ProductOption[] }
  | { readonly kind: 'overridden'; readonly chosen: ProductOption; readonly outscoredBy: readonly ProductOption[] };

export function deriveVerdict(comparison: AlternativeComparison): Verdict | null {
  const { options, recommendation } = comparison;
  const chosen = options.find((o) => o.productType === recommendation.primaryChoice);

  // The recommendation names a product that is not in the list. Rendering
  // a verdict would mean inventing one.
  if (chosen === undefined) return null;

  const top = options.reduce(
    (best, o) => (o.suitabilityScore > best ? o.suitabilityScore : best),
    Number.NEGATIVE_INFINITY,
  );

  if (chosen.suitabilityScore < top) {
    const outscoredBy = options.filter((o) => o.suitabilityScore > chosen.suitabilityScore);
    return { kind: 'overridden', chosen, outscoredBy };
  }

  const tiedWith = options.filter(
    (o) => o.productType !== chosen.productType && o.suitabilityScore === chosen.suitabilityScore,
  );

  return tiedWith.length > 0 ? { kind: 'tied', chosen, tiedWith } : { kind: 'clear', chosen };
}

/**
 * Options ranked by the score the response reported, worst last.
 *
 * The ranking is the whole demotion mechanism. Nothing checks for a
 * product type: a Merchant Cash Advance sinks to the bottom on a strong
 * profile because it scores 15 there, and rises to the top on a
 * distressed one because it scores 65 and the service recommends it.
 * Hard-coding "MCA is the bad one" would misrepresent the second case.
 */
export function rankedOptions(options: readonly ProductOption[]): readonly ProductOption[] {
  return [...options].sort((a, b) => b.suitabilityScore - a.suitabilityScore);
}

/**
 * A share of the largest effective APR in this set, for a comparison bar.
 *
 * Relative to the run's own maximum rather than a fixed ceiling, so the
 * bar cannot imply a rate that was not returned. Returns null when there
 * is nothing to compare against — a caller must not fall back to zero,
 * which would draw an empty bar for a real rate.
 */
export function aprShare(option: ProductOption, options: readonly ProductOption[]): number | null {
  const max = options.reduce(
    (m, o) => (Number.isFinite(o.effectiveApr) && o.effectiveApr > m ? o.effectiveApr : m),
    0,
  );
  if (max <= 0 || !Number.isFinite(option.effectiveApr)) return null;
  return option.effectiveApr / max;
}

// ── Formatting ──────────────────────────────────────────────

/**
 * Every formatter returns a marker rather than a number when the value
 * is missing or not finite. A dash reads as "the response did not say";
 * a zero reads as "the answer is zero", and this page is read by an
 * advisor talking to a client.
 */
export const NOT_REPORTED = '—';

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_REPORTED;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_REPORTED;
  return `${(value * 100).toFixed(digits)}%`;
}

export function ratio(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_REPORTED;
  return `${value.toFixed(digits)}×`;
}

export function count(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_REPORTED;
  return value.toLocaleString('en-US');
}

/** Product labels come from the response; this is only the fallback. */
export function productLabel(option: ProductOption): string {
  return option.productName !== '' ? option.productName : option.productType;
}
