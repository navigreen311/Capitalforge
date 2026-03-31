// ============================================================
// CapitalForge Funding Readiness Score Engine
//
// Weights:
//   Revenue          30%
//   Credit Score     25%
//   Business Age     20%
//   Industry Risk    15%
//   Existing Debt    10%
//
// Routing:
//   >= 70  → Stacking track
//   40-69  → Credit Builder
//   < 40   → Alternative products (LOC / SBA referral)
// ============================================================

// ── Input / Output types ──────────────────────────────────────

export interface FundingReadinessInput {
  /** Monthly revenue in USD (used if annualRevenue is absent) */
  monthlyRevenue?: number | null;
  /** Annual revenue in USD */
  annualRevenue?: number | null;
  /** Best personal FICO/Vantage score across all owners */
  personalCreditScore?: number | null;
  /** Business credit score (SBSS, Paydex, or equivalent 0–300 normalised internally) */
  businessCreditScore?: number | null;
  /** ISO 8601 date string or Date for when the business was formed */
  dateOfFormation?: string | Date | null;
  /** ISO 18245 MCC code (4-digit string) — used for industry risk lookup */
  mcc?: string | null;
  /** Plain-text industry label fallback when MCC is unavailable */
  industry?: string | null;
  /** Total outstanding debt balance in USD */
  existingDebtBalance?: number | null;
  /** Monthly debt service (loan payments) — used to refine debt burden */
  monthlyDebtService?: number | null;
}

export type FundingTrack = 'stacking' | 'credit_builder' | 'alternative';

export interface GapItem {
  dimension: string;
  currentValue: string;
  targetValue: string;
  impact: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface FundingReadinessResult {
  score: number; // 0–100, integer
  track: FundingTrack;
  trackLabel: string;
  componentScores: {
    revenue: number;       // 0–30
    creditScore: number;   // 0–25
    businessAge: number;   // 0–20
    industryRisk: number;  // 0–15
    debtBurden: number;    // 0–10
  };
  gaps: GapItem[];
  summary: string;
}

// ── Industry risk table ───────────────────────────────────────

/**
 * Industry risk multiplier (0 = highest risk, 1 = lowest risk).
 * Higher multiplier → more points awarded from the 15-point industry budget.
 * Keyed by MCC prefix ranges and common industry keywords.
 */
const HIGH_RISK_MCC_PREFIXES = new Set([
  '5900', // Retail — misc
  '7995', // Gambling
  '5912', // Drug stores / pharmacies
  '7011', // Hotels / motels
  '5812', // Eating places / restaurants
  '7389', // Services — misc business
  '5999', // Misc retail
  '4812', // Telecom
  '6300', // Insurance
  '7372', // Computer programming / data processing
]);

const HIGH_RISK_INDUSTRY_KEYWORDS = [
  'cannabis', 'marijuana', 'gambling', 'gaming', 'adult', 'crypto',
  'cryptocurrency', 'firearms', 'gun', 'tobacco', 'vaping', 'pawn',
  'payday', 'lending', 'collections', 'debt', 'travel agent',
];

const LOW_RISK_INDUSTRY_KEYWORDS = [
  'medical', 'healthcare', 'dental', 'accounting', 'law', 'legal',
  'technology', 'software', 'engineering', 'consulting', 'real estate',
  'insurance agency', 'financial advisory',
];

function industryRiskMultiplier(mcc?: string | null, industry?: string | null): number {
  // Check MCC first
  if (mcc) {
    if (HIGH_RISK_MCC_PREFIXES.has(mcc)) return 0.2;
  }

  // Check industry text
  const lower = (industry ?? '').toLowerCase();
  if (HIGH_RISK_INDUSTRY_KEYWORDS.some((kw) => lower.includes(kw))) return 0.2;
  if (LOW_RISK_INDUSTRY_KEYWORDS.some((kw) => lower.includes(kw))) return 1.0;

  // Default: moderate risk
  return 0.65;
}

// ── Score component calculators ───────────────────────────────

/** Revenue component — 0 to 30 points */
function scoreRevenue(annual: number | null): { points: number; label: string } {
  if (annual === null || annual <= 0) {
    return { points: 0, label: '$0' };
  }
  if (annual >= 1_000_000) return { points: 30, label: `$${(annual / 1000).toFixed(0)}k` };
  if (annual >= 500_000)   return { points: 26, label: `$${(annual / 1000).toFixed(0)}k` };
  if (annual >= 250_000)   return { points: 22, label: `$${(annual / 1000).toFixed(0)}k` };
  if (annual >= 120_000)   return { points: 17, label: `$${(annual / 1000).toFixed(0)}k` };
  if (annual >= 60_000)    return { points: 12, label: `$${(annual / 1000).toFixed(0)}k` };
  if (annual >= 24_000)    return { points: 7,  label: `$${(annual / 1000).toFixed(0)}k` };
  return { points: 2, label: `$${(annual / 1000).toFixed(0)}k` };
}

/** Credit score component — 0 to 25 points */
function scoreCreditScore(personal: number | null, business: number | null): { points: number; label: string } {
  // Prefer personal FICO/Vantage (300–850) — normalise business SBSS (0–300) to same range
  let best: number | null = personal;

  if (business !== null && business !== undefined) {
    // If score looks like SBSS/Paydex (0–300 range) normalise to 300–850 range
    const normBusiness = business <= 300 ? 300 + (business / 300) * 550 : business;
    if (best === null || normBusiness > best) best = normBusiness;
  }

  if (best === null) return { points: 0, label: 'no data' };
  if (best >= 750) return { points: 25, label: String(Math.round(best)) };
  if (best >= 720) return { points: 22, label: String(Math.round(best)) };
  if (best >= 680) return { points: 18, label: String(Math.round(best)) };
  if (best >= 640) return { points: 13, label: String(Math.round(best)) };
  if (best >= 600) return { points: 8,  label: String(Math.round(best)) };
  if (best >= 550) return { points: 4,  label: String(Math.round(best)) };
  return { points: 1, label: String(Math.round(best)) };
}

/** Business age component — 0 to 20 points */
function scoreBusinessAge(dateOfFormation: string | Date | null | undefined): { points: number; label: string } {
  if (!dateOfFormation) return { points: 0, label: 'unknown' };

  const formed = typeof dateOfFormation === 'string' ? new Date(dateOfFormation) : dateOfFormation;
  if (isNaN(formed.getTime())) return { points: 0, label: 'invalid date' };

  const ageMonths = (Date.now() - formed.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

  if (ageMonths >= 60)  return { points: 20, label: `${Math.floor(ageMonths / 12)}y` };
  if (ageMonths >= 36)  return { points: 17, label: `${Math.floor(ageMonths / 12)}y` };
  if (ageMonths >= 24)  return { points: 14, label: `${Math.floor(ageMonths / 12)}y` };
  if (ageMonths >= 12)  return { points: 10, label: `${Math.floor(ageMonths)}mo` };
  if (ageMonths >= 6)   return { points: 5,  label: `${Math.floor(ageMonths)}mo` };
  if (ageMonths >= 2)   return { points: 2,  label: `${Math.floor(ageMonths)}mo` };
  return { points: 0, label: `${Math.floor(ageMonths)}mo` };
}

/** Industry risk component — 0 to 15 points */
function scoreIndustryRisk(mcc?: string | null, industry?: string | null): { points: number; label: string } {
  // If no industry data at all, return 0 (no data to score)
  if ((mcc === null || mcc === undefined) && (industry === null || industry === undefined)) {
    return { points: 0, label: 'unknown' };
  }
  const multiplier = industryRiskMultiplier(mcc, industry);
  const points = Math.round(15 * multiplier);
  const label = industry ?? mcc ?? 'unknown';
  return { points, label };
}

/** Debt burden component — 0 to 10 points */
function scoreDebtBurden(
  debtBalance: number | null | undefined,
  annualRevenue: number | null,
  monthlyDebtService: number | null | undefined,
): { points: number; label: string } {
  // No debt data provided — cannot score (return 0, not 10)
  if (debtBalance === null || debtBalance === undefined) {
    return { points: 0, label: 'no data' };
  }
  if (debtBalance === 0) {
    return { points: 10, label: 'no debt' };
  }

  // Debt-to-revenue ratio (annualised)
  const dtr = annualRevenue && annualRevenue > 0 ? debtBalance / annualRevenue : null;

  // Debt-service coverage ratio proxy
  const monthlyRev = annualRevenue ? annualRevenue / 12 : null;
  const dscr = monthlyRev && monthlyDebtService && monthlyDebtService > 0
    ? monthlyRev / monthlyDebtService
    : null;

  // Use DSCR if available, otherwise fall back to DTR
  if (dscr !== null) {
    if (dscr >= 3.0)  return { points: 10, label: `DSCR ${dscr.toFixed(1)}x` };
    if (dscr >= 2.0)  return { points: 8,  label: `DSCR ${dscr.toFixed(1)}x` };
    if (dscr >= 1.5)  return { points: 6,  label: `DSCR ${dscr.toFixed(1)}x` };
    if (dscr >= 1.25) return { points: 4,  label: `DSCR ${dscr.toFixed(1)}x` };
    if (dscr >= 1.0)  return { points: 2,  label: `DSCR ${dscr.toFixed(1)}x` };
    return { points: 0, label: `DSCR ${dscr.toFixed(1)}x` };
  }

  if (dtr !== null) {
    if (dtr <= 0.25) return { points: 10, label: `DTR ${(dtr * 100).toFixed(0)}%` };
    if (dtr <= 0.50) return { points: 7,  label: `DTR ${(dtr * 100).toFixed(0)}%` };
    if (dtr <= 0.75) return { points: 5,  label: `DTR ${(dtr * 100).toFixed(0)}%` };
    if (dtr <= 1.00) return { points: 3,  label: `DTR ${(dtr * 100).toFixed(0)}%` };
    if (dtr <= 1.50) return { points: 1,  label: `DTR ${(dtr * 100).toFixed(0)}%` };
    return { points: 0, label: `DTR ${(dtr * 100).toFixed(0)}%` };
  }

  // Debt present but no revenue data — penalise moderately
  return { points: 3, label: `$${(debtBalance / 1000).toFixed(0)}k outstanding` };
}

// ── Gap analysis ──────────────────────────────────────────────

function buildGaps(
  components: FundingReadinessResult['componentScores'],
  input: FundingReadinessInput,
): GapItem[] {
  const gaps: GapItem[] = [];

  // Revenue gap
  if (components.revenue < 22) {
    gaps.push({
      dimension: 'Annual Revenue',
      currentValue: input.annualRevenue
        ? `$${(input.annualRevenue / 1000).toFixed(0)}k`
        : 'Not provided',
      targetValue: '$250k+',
      impact: components.revenue < 10 ? 'high' : 'medium',
      suggestion:
        'Document and grow revenue to $250k+ annually. Consider adding revenue streams or improving collections.',
    });
  }

  // Credit score gap
  if (components.creditScore < 18) {
    gaps.push({
      dimension: 'Personal Credit Score',
      currentValue: input.personalCreditScore
        ? String(input.personalCreditScore)
        : 'Not provided',
      targetValue: '680+',
      impact: components.creditScore < 8 ? 'high' : 'medium',
      suggestion:
        'Work on reducing utilisation below 30%, paying down balances, and resolving any derogatory marks.',
    });
  }

  // Business age gap
  if (components.businessAge < 14) {
    const formed = input.dateOfFormation ? new Date(input.dateOfFormation) : null;
    const ageMonths = formed
      ? Math.floor((Date.now() - formed.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
      : null;

    gaps.push({
      dimension: 'Business Age',
      currentValue: ageMonths !== null ? `${ageMonths} months` : 'Unknown',
      targetValue: '24+ months',
      impact: components.businessAge < 5 ? 'high' : 'medium',
      suggestion:
        'Continue operating to build business history. Ensure business entity is actively filing and reporting.',
    });
  }

  // Industry risk gap
  if (components.industryRisk < 8) {
    gaps.push({
      dimension: 'Industry Risk',
      currentValue: input.industry ?? input.mcc ?? 'Not classified',
      targetValue: 'Low-risk industry',
      impact: 'medium',
      suggestion:
        'High-risk industry classification limits lender appetite. Focus on compliance documentation and strong financials to offset.',
    });
  }

  // Debt burden gap
  if (components.debtBurden < 5) {
    gaps.push({
      dimension: 'Debt Burden',
      currentValue: input.existingDebtBalance
        ? `$${(input.existingDebtBalance / 1000).toFixed(0)}k outstanding`
        : 'Not provided',
      targetValue: 'Debt-to-revenue < 50%',
      impact: components.debtBurden === 0 ? 'high' : 'medium',
      suggestion:
        'Reduce outstanding debt balances relative to revenue. Pay down highest-utilisation accounts first.',
    });
  }

  return gaps;
}

// ── Track resolution ──────────────────────────────────────────

function resolveTrack(score: number): { track: FundingTrack; trackLabel: string; summary: string } {
  if (score >= 70) {
    return {
      track: 'stacking',
      trackLabel: 'Credit Card Stacking',
      summary:
        'Strong funding profile. Client qualifies for the full card stacking programme. Proceed to issuer sequencing and round planning.',
    };
  }
  if (score >= 40) {
    return {
      track: 'credit_builder',
      trackLabel: 'Credit Builder Track',
      summary:
        'Moderate profile. Enroll in Credit Builder to improve credit scores, establish tradelines, and grow revenue over 6–12 months before stacking.',
    };
  }
  return {
    track: 'alternative',
    trackLabel: 'Alternative Products',
    summary:
      'Profile needs significant development. Refer to alternative products: LOC, SBA micro-loan, or revenue-based financing. Revisit stacking eligibility in 12+ months.',
  };
}

// ── Public API ────────────────────────────────────────────────

/**
 * Calculate the funding readiness score (0–100) and gap analysis
 * for a business given its financial and profile data.
 */
export function calculateFundingReadiness(input: FundingReadinessInput): FundingReadinessResult {
  // Derive annual revenue (prefer explicit, fall back to monthly * 12)
  const annual =
    input.annualRevenue != null
      ? Number(input.annualRevenue)
      : input.monthlyRevenue != null
        ? Number(input.monthlyRevenue) * 12
        : null;

  const personalCredit = input.personalCreditScore != null ? Number(input.personalCreditScore) : null;
  const businessCredit = input.businessCreditScore != null ? Number(input.businessCreditScore) : null;
  const debtBalance = input.existingDebtBalance != null ? Number(input.existingDebtBalance) : null;
  const monthlyDebtService = input.monthlyDebtService != null ? Number(input.monthlyDebtService) : null;

  const revComponent   = scoreRevenue(annual);
  const creditComponent = scoreCreditScore(personalCredit, businessCredit);
  const ageComponent   = scoreBusinessAge(input.dateOfFormation);
  const industryComponent = scoreIndustryRisk(input.mcc, input.industry);
  const debtComponent  = scoreDebtBurden(debtBalance, annual, monthlyDebtService);

  const componentScores = {
    revenue:     revComponent.points,
    creditScore: creditComponent.points,
    businessAge: ageComponent.points,
    industryRisk: industryComponent.points,
    debtBurden:  debtComponent.points,
  };

  const rawScore =
    componentScores.revenue +
    componentScores.creditScore +
    componentScores.businessAge +
    componentScores.industryRisk +
    componentScores.debtBurden;

  // Clamp to 0–100 (should already be in range given max 30+25+20+15+10=100)
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  const { track, trackLabel, summary } = resolveTrack(score);
  const gaps = buildGaps(componentScores, input);

  return {
    score,
    track,
    trackLabel,
    componentScores,
    gaps,
    summary,
  };
}
