// ============================================================
// CapitalForge — Suitability & No-Go Engine (Phase 3)
//
// Pure scoring engine with:
//   1. 6-component scoring (100 points total)
//   2. Hard no-go trigger enforcement
//   3. Tier classification (suitable / marginal / not_suitable)
//   4. Max safe leverage calculation
//   5. Soft warnings & alternative recommendations
// ============================================================

// ── Input Types ──────────────────────────────────────────────

export interface SuitabilityEngineInput {
  /** FICO credit score (300-850) */
  creditScore: number;

  /** Credit utilization ratio (0-1, e.g. 0.25 = 25%) */
  utilizationRatio: number;

  /** Business age in months */
  businessAgeMonths: number;

  /** Annual revenue in USD */
  annualRevenue: number;

  /** Debt service ratio: monthly debt payments / monthly revenue */
  debtServiceRatio: number;

  /** Number of hard credit inquiries in last 12 months */
  inquiries: number;

  /** Number of derogatory marks on credit report */
  derogatoryMarks: number;

  /** Whether the advisor has confirmed debt servicing capacity */
  advisorConfirmedDebtServicing: boolean;

  /** Whether the client has acknowledged personal guarantee obligations */
  clientAcknowledgedPersonalGuarantee: boolean;

  /** Whether the client has acknowledged APR risk */
  clientAcknowledgedAprRisk: boolean;

  /** NAICS code for the business (4-digit string) */
  naicsCode: string;
}

// ── Output Types ─────────────────────────────────────────────

export type SuitabilityTier = 'suitable' | 'marginal' | 'not_suitable';

export interface ComponentScore {
  component: string;
  label: string;
  points: number;
  maxPoints: number;
  reason: string;
}

export interface HardNoGoTrigger {
  code: string;
  label: string;
  description: string;
}

export interface SoftWarning {
  code: string;
  label: string;
  description: string;
}

export interface Alternative {
  product: string;
  description: string;
  reason: string;
}

export interface SuitabilityResult {
  /** Composite score (0-100), forced to 0 when any hard no-go fires */
  score: number;

  /** Tier classification */
  tier: SuitabilityTier;

  /** Maximum safe number of cards to stack */
  maxSafeLeverage: number;

  /** Breakdown of 6 component scores */
  componentScores: ComponentScore[];

  /** Hard no-go triggers that fired (any = not_suitable, score 0) */
  hardNoGoTriggers: HardNoGoTrigger[];

  /** Soft warnings (advisory, do not block) */
  softWarnings: SoftWarning[];

  /** Human-readable recommendation text */
  recommendation: string;

  /** Alternative products when not suitable */
  alternatives: Alternative[];
}

// ── Constants ────────────────────────────────────────────────

/** NAICS codes considered high-risk for card stacking */
const HIGH_RISK_NAICS = new Set(['7132', '5912', '7941', '5271', '5521']);

// ── Scoring Functions ────────────────────────────────────────

function scoreCreditScore(fico: number): ComponentScore {
  let points: number;
  let reason: string;

  if (fico >= 780) {
    points = 25;
    reason = 'Excellent credit (780+)';
  } else if (fico >= 740) {
    points = 22;
    reason = 'Very good credit (740-779)';
  } else if (fico >= 700) {
    points = 18;
    reason = 'Good credit (700-739)';
  } else if (fico >= 660) {
    points = 13;
    reason = 'Fair credit (660-699)';
  } else if (fico >= 620) {
    points = 8;
    reason = 'Below average credit (620-659)';
  } else {
    points = 0;
    reason = `Poor credit (${fico}) — below 620 threshold`;
  }

  return {
    component: 'credit_score',
    label: 'Credit Score',
    points,
    maxPoints: 25,
    reason,
  };
}

function scoreUtilization(ratio: number): ComponentScore {
  const pct = Math.round(ratio * 100);
  let points: number;
  let reason: string;

  if (ratio <= 0.10) {
    points = 15;
    reason = `Excellent utilization (${pct}%, <=10%)`;
  } else if (ratio <= 0.20) {
    points = 12;
    reason = `Good utilization (${pct}%, <=20%)`;
  } else if (ratio <= 0.30) {
    points = 9;
    reason = `Fair utilization (${pct}%, <=30%)`;
  } else if (ratio <= 0.50) {
    points = 5;
    reason = `High utilization (${pct}%, <=50%)`;
  } else {
    points = 2;
    reason = `Very high utilization (${pct}%, >50%)`;
  }

  return {
    component: 'utilization',
    label: 'Credit Utilization',
    points,
    maxPoints: 15,
    reason,
  };
}

function scoreBusinessAge(months: number): ComponentScore {
  let points: number;
  let reason: string;

  if (months >= 60) {
    points = 15;
    reason = `Established business (${Math.floor(months / 12)}+ years)`;
  } else if (months >= 36) {
    points = 12;
    reason = `Maturing business (${Math.floor(months / 12)} years)`;
  } else if (months >= 24) {
    points = 9;
    reason = `Growing business (${Math.floor(months / 12)} years)`;
  } else if (months >= 12) {
    points = 6;
    reason = `Young business (${Math.floor(months / 12)} year${months >= 24 ? 's' : ''})`;
  } else {
    points = 3;
    reason = `Very new business (${months} months)`;
  }

  return {
    component: 'business_age',
    label: 'Business Age',
    points,
    maxPoints: 15,
    reason,
  };
}

function scoreRevenue(annualRevenue: number): ComponentScore {
  let points: number;
  let reason: string;
  const formatted = `$${annualRevenue.toLocaleString()}`;

  if (annualRevenue >= 500_000) {
    points = 20;
    reason = `Strong revenue (${formatted}, >=500K)`;
  } else if (annualRevenue >= 250_000) {
    points = 16;
    reason = `Good revenue (${formatted}, >=250K)`;
  } else if (annualRevenue >= 100_000) {
    points = 12;
    reason = `Moderate revenue (${formatted}, >=100K)`;
  } else if (annualRevenue >= 50_000) {
    points = 8;
    reason = `Low revenue (${formatted}, >=50K)`;
  } else {
    points = 4;
    reason = `Very low revenue (${formatted}, <50K)`;
  }

  return {
    component: 'revenue',
    label: 'Annual Revenue',
    points,
    maxPoints: 20,
    reason,
  };
}

function scoreDebtService(ratio: number): ComponentScore {
  const pct = Math.round(ratio * 100);
  let points: number;
  let reason: string;

  if (ratio <= 0.1) {
    points = 15;
    reason = `Excellent debt service capacity (${pct}% ratio)`;
  } else if (ratio <= 0.2) {
    points = 12;
    reason = `Good debt service capacity (${pct}% ratio)`;
  } else if (ratio <= 0.3) {
    points = 8;
    reason = `Fair debt service capacity (${pct}% ratio)`;
  } else if (ratio <= 0.4) {
    points = 4;
    reason = `Strained debt service (${pct}% ratio)`;
  } else {
    points = 0;
    reason = `Overextended debt service (${pct}% ratio, >40%)`;
  }

  return {
    component: 'debt_service',
    label: 'Debt Service Capacity',
    points,
    maxPoints: 15,
    reason,
  };
}

function scoreInquiries(count: number): ComponentScore {
  let points: number;
  let reason: string;

  if (count === 0) {
    points = 10;
    reason = 'No recent inquiries';
  } else if (count <= 2) {
    points = 7;
    reason = `${count} recent inquir${count === 1 ? 'y' : 'ies'}`;
  } else if (count <= 4) {
    points = 4;
    reason = `${count} recent inquiries (elevated)`;
  } else {
    points = 1;
    reason = `${count} recent inquiries (excessive)`;
  }

  return {
    component: 'inquiries',
    label: 'Credit Inquiries (12mo)',
    points,
    maxPoints: 10,
    reason,
  };
}

// ── Hard No-Go Detection ─────────────────────────────────────

function detectHardNoGoTriggers(input: SuitabilityEngineInput): HardNoGoTrigger[] {
  const triggers: HardNoGoTrigger[] = [];

  if (input.creditScore < 620) {
    triggers.push({
      code: 'fico_below_620',
      label: 'FICO Below 620',
      description: `Credit score ${input.creditScore} is below the minimum 620 threshold for card stacking.`,
    });
  }

  if (input.derogatoryMarks >= 2) {
    triggers.push({
      code: 'derogatory_marks',
      label: 'Multiple Derogatory Marks',
      description: `${input.derogatoryMarks} derogatory marks detected (max allowed: 1).`,
    });
  }

  if (input.businessAgeMonths < 6) {
    triggers.push({
      code: 'business_too_young',
      label: 'Business Under 6 Months',
      description: `Business is ${input.businessAgeMonths} months old. Minimum 6 months required.`,
    });
  }

  if (!input.advisorConfirmedDebtServicing) {
    triggers.push({
      code: 'no_debt_service_confirmation',
      label: 'Debt Servicing Not Confirmed',
      description: 'Advisor has not confirmed the client can service the debt.',
    });
  }

  if (!input.clientAcknowledgedPersonalGuarantee) {
    triggers.push({
      code: 'no_pg_acknowledgment',
      label: 'Personal Guarantee Not Acknowledged',
      description: 'Client has not acknowledged personal guarantee obligations.',
    });
  }

  if (!input.clientAcknowledgedAprRisk) {
    triggers.push({
      code: 'no_apr_risk_acknowledgment',
      label: 'APR Risk Not Acknowledged',
      description: 'Client has not acknowledged the APR risk associated with card stacking.',
    });
  }

  if (HIGH_RISK_NAICS.has(input.naicsCode)) {
    triggers.push({
      code: 'high_risk_naics',
      label: 'High-Risk Industry',
      description: `NAICS code ${input.naicsCode} is classified as high-risk for card stacking.`,
    });
  }

  return triggers;
}

// ── Soft Warnings ────────────────────────────────────────────

function detectSoftWarnings(input: SuitabilityEngineInput): SoftWarning[] {
  const warnings: SoftWarning[] = [];

  if (input.creditScore >= 620 && input.creditScore < 680) {
    warnings.push({
      code: 'low_credit_score',
      label: 'Low Credit Score',
      description: `Credit score ${input.creditScore} is near the minimum. Consider credit-building first.`,
    });
  }

  if (input.utilizationRatio > 0.30 && input.utilizationRatio <= 0.50) {
    warnings.push({
      code: 'elevated_utilization',
      label: 'Elevated Utilization',
      description: `${Math.round(input.utilizationRatio * 100)}% utilization is above ideal. Reducing could improve approval odds.`,
    });
  }

  if (input.businessAgeMonths >= 6 && input.businessAgeMonths < 12) {
    warnings.push({
      code: 'young_business',
      label: 'Young Business',
      description: 'Business is under 1 year old. Limited credit history may restrict options.',
    });
  }

  if (input.debtServiceRatio > 0.2 && input.debtServiceRatio <= 0.4) {
    warnings.push({
      code: 'elevated_debt_service',
      label: 'Elevated Debt Service',
      description: `${Math.round(input.debtServiceRatio * 100)}% debt service ratio is approaching capacity limits.`,
    });
  }

  if (input.inquiries > 2 && input.inquiries <= 4) {
    warnings.push({
      code: 'multiple_inquiries',
      label: 'Multiple Recent Inquiries',
      description: `${input.inquiries} inquiries in the last 12 months. Additional inquiries may impact score.`,
    });
  }

  if (input.derogatoryMarks === 1) {
    warnings.push({
      code: 'single_derogatory',
      label: 'Derogatory Mark Present',
      description: '1 derogatory mark found. A second would trigger a hard no-go.',
    });
  }

  if (input.annualRevenue < 100_000 && input.annualRevenue >= 50_000) {
    warnings.push({
      code: 'low_revenue',
      label: 'Low Revenue',
      description: `Annual revenue of $${input.annualRevenue.toLocaleString()} limits stacking capacity.`,
    });
  }

  return warnings;
}

// ── Tier Classification ──────────────────────────────────────

function classifyTier(score: number): SuitabilityTier {
  if (score >= 70) return 'suitable';
  if (score >= 45) return 'marginal';
  return 'not_suitable';
}

// ── Max Safe Leverage ────────────────────────────────────────

function calculateMaxSafeLeverage(score: number): number {
  if (score >= 80) return 5;
  if (score >= 70) return 4;
  if (score >= 60) return 3;
  if (score >= 45) return 2;
  return 1;
}

// ── Recommendation Text ──────────────────────────────────────

function buildRecommendation(
  tier: SuitabilityTier,
  score: number,
  maxCards: number,
  hardNoGos: HardNoGoTrigger[],
  softWarnings: SoftWarning[],
): string {
  if (tier === 'not_suitable' && hardNoGos.length > 0) {
    const reasons = hardNoGos.map((t) => t.label).join(', ');
    return `NOT SUITABLE: This client does not qualify for credit card stacking. Hard no-go triggers: ${reasons}. Consider alternative funding products listed below.`;
  }

  if (tier === 'not_suitable') {
    return `NOT SUITABLE (score: ${score}): Composite score is below the 45-point threshold. The client's profile does not support card stacking at this time. Consider alternative funding products.`;
  }

  if (tier === 'marginal') {
    const warningNote = softWarnings.length > 0
      ? ` Address the following before proceeding: ${softWarnings.map((w) => w.label).join(', ')}.`
      : '';
    return `MARGINAL (score: ${score}): Client may qualify for limited card stacking (up to ${maxCards} cards). Proceed with caution and enhanced monitoring.${warningNote}`;
  }

  // suitable
  const warningNote = softWarnings.length > 0
    ? ` Note: ${softWarnings.map((w) => w.label).join(', ')}.`
    : '';
  return `SUITABLE (score: ${score}): Client profile supports credit card stacking. Recommended maximum of ${maxCards} cards within safe leverage limits.${warningNote}`;
}

// ── Alternative Recommendations ──────────────────────────────

function recommendAlternatives(
  input: SuitabilityEngineInput,
  hardNoGos: HardNoGoTrigger[],
): Alternative[] {
  const alternatives: Alternative[] = [];
  const noGoCodes = new Set(hardNoGos.map((t) => t.code));

  // SBA Microloan — good for young or low-revenue businesses
  if (input.businessAgeMonths >= 6 && input.annualRevenue >= 25_000) {
    alternatives.push({
      product: 'SBA Microloan',
      description: 'Small Business Administration microloans up to $50,000 with favorable terms.',
      reason: 'Lower qualification requirements than card stacking. Good for building credit history.',
    });
  }

  // Business line of credit
  if (input.creditScore >= 600 && input.annualRevenue >= 50_000) {
    alternatives.push({
      product: 'Business Line of Credit',
      description: 'Revolving credit line with flexible draw-down and lower risk than stacking.',
      reason: noGoCodes.has('fico_below_620')
        ? 'Some lenders accept scores below 620 for secured lines.'
        : 'Lower complexity and personal liability exposure.',
    });
  }

  // Invoice factoring
  if (input.annualRevenue >= 100_000) {
    alternatives.push({
      product: 'Invoice Factoring',
      description: 'Advance funding against outstanding invoices. No personal credit score dependency.',
      reason: 'Revenue-based qualification. Does not add to personal debt burden.',
    });
  }

  // Secured business credit card
  if (input.creditScore < 700) {
    alternatives.push({
      product: 'Secured Business Credit Card',
      description: 'Build business credit with a secured card backed by a cash deposit.',
      reason: 'No hard credit pull required. Helps establish or rebuild business credit profile.',
    });
  }

  // Revenue-based financing
  if (input.annualRevenue >= 75_000 && input.businessAgeMonths >= 6) {
    alternatives.push({
      product: 'Revenue-Based Financing',
      description: 'Funding repaid as a percentage of daily/weekly revenue.',
      reason: 'Flexible repayment tied to business performance. No fixed monthly obligation.',
    });
  }

  return alternatives;
}

// ── Main Entry Point ─────────────────────────────────────────

/**
 * Calculate the full suitability assessment for a client.
 *
 * This is a pure function with no side effects — it does not persist
 * anything or emit events. Callers (routes, services) are responsible
 * for persistence and event publishing.
 */
export function calculateSuitability(input: SuitabilityEngineInput): SuitabilityResult {
  // 1. Detect hard no-go triggers
  const hardNoGoTriggers = detectHardNoGoTriggers(input);

  // 2. Calculate component scores
  const componentScores: ComponentScore[] = [
    scoreCreditScore(input.creditScore),
    scoreUtilization(input.utilizationRatio),
    scoreBusinessAge(input.businessAgeMonths),
    scoreRevenue(input.annualRevenue),
    scoreDebtService(input.debtServiceRatio),
    scoreInquiries(input.inquiries),
  ];

  // 3. Compute raw score
  const rawScore = componentScores.reduce((sum, c) => sum + c.points, 0);

  // 4. Apply hard no-go: any trigger forces score to 0 and tier to not_suitable
  const score = hardNoGoTriggers.length > 0 ? 0 : rawScore;
  const tier: SuitabilityTier = hardNoGoTriggers.length > 0 ? 'not_suitable' : classifyTier(rawScore);

  // 5. Max safe leverage
  const maxSafeLeverage = hardNoGoTriggers.length > 0 ? 0 : calculateMaxSafeLeverage(rawScore);

  // 6. Soft warnings
  const softWarnings = detectSoftWarnings(input);

  // 7. Recommendation text
  const recommendation = buildRecommendation(tier, score, maxSafeLeverage, hardNoGoTriggers, softWarnings);

  // 8. Alternatives (only populated for not_suitable / marginal)
  const alternatives = tier !== 'suitable'
    ? recommendAlternatives(input, hardNoGoTriggers)
    : [];

  return {
    score,
    tier,
    maxSafeLeverage,
    componentScores,
    hardNoGoTriggers,
    softWarnings,
    recommendation,
    alternatives,
  };
}
