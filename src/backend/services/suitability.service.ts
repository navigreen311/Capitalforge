// ============================================================
// CapitalForge — Suitability & No-Go Engine
//
// Responsibilities:
//   1. Compute Funding Suitability Score (0–100 composite)
//   2. Enforce no-go rules (hard locks, no override below 30)
//   3. Apply Maximum Safe Leverage model
//   4. Recommend alternative products when stacking is unsuitable
//   5. Handle compliance-officer overrides with audit trail
//   6. Emit SUITABILITY_ASSESSED / NOGO_TRIGGERED events
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES, RISK_THRESHOLDS, ROLES } from '@shared/constants/index.js';
import type { SuitabilityResult } from '@shared/types/index.js';
import {
  calculateMaxSafeLeverage,
  type LeverageInput,
  type LeverageResult,
} from './leverage-calculator.js';
import logger from '../config/logger.js';

// ── Prisma singleton (injected or default) ───────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

/** Allow tests or bootstrap to inject a client (e.g. mock) */
export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

// ── Score Bands ───────────────────────────────────────────────

export const SCORE_BANDS = {
  HARD_NOGO:    RISK_THRESHOLDS.SUITABILITY_NOGO,       // < 30
  HIGH_RISK:    RISK_THRESHOLDS.SUITABILITY_HIGH_RISK,  // 30–50
  MODERATE:     RISK_THRESHOLDS.SUITABILITY_MODERATE,   // 50–70
  // >= 70 = APPROVED
} as const;

// ── No-Go Reason Codes ────────────────────────────────────────

export const NOGO_REASON = {
  REVENUE_TOO_LOW:          'revenue_too_low',
  EXCESSIVE_DEBT:           'excessive_debt',
  ACTIVE_BANKRUPTCY:        'active_bankruptcy',
  SANCTIONS_MATCH:          'sanctions_match',
  FRAUD_SUSPICION:          'fraud_suspicion',
  NEGATIVE_CASH_FLOW:       'negative_cash_flow',
  CREDIT_SCORE_TOO_LOW:     'credit_score_too_low',
  BUSINESS_TOO_YOUNG:       'business_too_young',
} as const;

export type NoGoReason = (typeof NOGO_REASON)[keyof typeof NOGO_REASON];

// ── Alternative Product Codes ─────────────────────────────────

export const ALTERNATIVE_PRODUCTS = {
  SBA_LOAN:          'sba_loan',
  LINE_OF_CREDIT:    'line_of_credit',
  INVOICE_FINANCING: 'invoice_financing',
  MCA:               'merchant_cash_advance',   // always accompanied by risk warning
} as const;

// ── Input type ────────────────────────────────────────────────

export interface SuitabilityInput {
  /** Monthly revenue in USD */
  monthlyRevenue: number;

  /** Total existing debt in USD */
  existingDebt: number;

  /**
   * Cash-flow ratio: net monthly cash flow / monthly revenue.
   * Negative = burning cash.
   */
  cashFlowRatio: number;

  /** Primary industry classification */
  industry: string;

  /** Months the business has been operating */
  businessAgeMonths: number;

  /** Best available personal FICO score (highest guarantor) */
  personalCreditScore: number;

  /** Business credit score (SBSS/Paydex/etc.) — 0 if unavailable */
  businessCreditScore: number;

  /** True if any owner has an active bankruptcy filing */
  activeBankruptcy: boolean;

  /** True if any owner/entity appears on a sanctions list */
  sanctionsMatch: boolean;

  /** True if compliance has flagged a fraud suspicion */
  fraudSuspicion: boolean;
}

// ── Extended result (internal, includes leverage detail) ─────

export interface SuitabilityAssessment extends SuitabilityResult {
  /** Detailed score breakdown by component */
  scoreBreakdown: ScoreBreakdown;

  /** Full leverage model output */
  leverageDetail: LeverageResult;

  /** Suitability band label */
  band: 'APPROVED' | 'MODERATE' | 'HIGH_RISK' | 'HARD_NOGO';
}

export interface ScoreBreakdown {
  revenueScore:       number;  // 0–25
  cashFlowScore:      number;  // 0–20
  debtRatioScore:     number;  // 0–20
  creditScore:        number;  // 0–20
  businessAgeScore:   number;  // 0–15
  total:              number;  // 0–100 (before hard-no-go floor)
}

// ── Override request ─────────────────────────────────────────

export interface OverrideRequest {
  checkId:          string;
  officerUserId:    string;
  officerRole:      string;
  justification:    string;
  tenantId:         string;
}

export interface OverrideResult {
  success:    boolean;
  message:    string;
  auditId:    string;
}

// ── Core service functions ────────────────────────────────────

/**
 * Compute a suitability assessment for the given input profile.
 * Does NOT persist — use `runAndPersist` for end-to-end execution.
 */
export function computeSuitability(input: SuitabilityInput): SuitabilityAssessment {
  // ---- 1. Collect hard no-go signals --------------------------
  const noGoReasons: string[] = [];

  if (input.activeBankruptcy)  noGoReasons.push(NOGO_REASON.ACTIVE_BANKRUPTCY);
  if (input.sanctionsMatch)    noGoReasons.push(NOGO_REASON.SANCTIONS_MATCH);
  if (input.fraudSuspicion)    noGoReasons.push(NOGO_REASON.FRAUD_SUSPICION);

  // Revenue floor: $2 000/month minimum to consider stacking
  if (input.monthlyRevenue < 2_000) {
    noGoReasons.push(NOGO_REASON.REVENUE_TOO_LOW);
  }

  // Negative / critically low cash flow
  if (input.cashFlowRatio < 0) {
    noGoReasons.push(NOGO_REASON.NEGATIVE_CASH_FLOW);
  }

  // Excessive debt: existing debt > 12× monthly revenue
  const debtToMonthlyRevenue =
    input.monthlyRevenue > 0 ? input.existingDebt / input.monthlyRevenue : Infinity;
  if (debtToMonthlyRevenue > 12) {
    noGoReasons.push(NOGO_REASON.EXCESSIVE_DEBT);
  }

  // ---- 2. Compute component scores ----------------------------
  const breakdown = computeScoreBreakdown(input);

  // ---- 3. Apply hard no-go if critical reasons present --------
  // Even if component scores are decent, certain flags are absolute zeros.
  const criticalNoGos = new Set<string>([
    NOGO_REASON.ACTIVE_BANKRUPTCY,
    NOGO_REASON.SANCTIONS_MATCH,
    NOGO_REASON.FRAUD_SUSPICION,
  ]);

  const hasCriticalNoGo = noGoReasons.some((r) => criticalNoGos.has(r));

  // Force score to 0 when critical flags are present
  const effectiveScore = hasCriticalNoGo ? 0 : breakdown.total;
  const noGoTriggered = effectiveScore < SCORE_BANDS.HARD_NOGO || noGoReasons.length > 0;

  // ---- 4. Compute leverage ------------------------------------
  const leverageInput: LeverageInput = {
    monthlyRevenue: input.monthlyRevenue,
    existingDebt:   input.existingDebt,
    cashFlowRatio:  input.cashFlowRatio,
    industry:       input.industry,
  };
  const leverageDetail = calculateMaxSafeLeverage(leverageInput);

  // Override leverage to 0 when no-go is triggered
  const maxSafeLeverage = noGoTriggered ? 0 : leverageDetail.maxTotalCredit;

  // ---- 5. Determine band and recommendation -------------------
  const band = determineBand(effectiveScore, noGoTriggered);
  const recommendation = buildRecommendation(band, noGoReasons, effectiveScore);

  // ---- 6. Alternative products when stacking unsuitable -------
  const alternativeProducts =
    noGoTriggered || effectiveScore < SCORE_BANDS.MODERATE
      ? recommendAlternatives(input)
      : [];

  return {
    score:               effectiveScore,
    maxSafeLeverage,
    noGoTriggered,
    noGoReasons,
    recommendation,
    alternativeProducts,
    scoreBreakdown:      { ...breakdown, total: effectiveScore },
    leverageDetail,
    band,
  };
}

/**
 * Run a full suitability check for a business, persist the result,
 * and publish the appropriate event.
 *
 * @returns The persisted SuitabilityCheck record id and assessment
 */
export async function runSuitabilityCheck(
  businessId: string,
  tenantId:   string,
  input:      SuitabilityInput,
): Promise<{ checkId: string; assessment: SuitabilityAssessment }> {
  const assessment = computeSuitability(input);
  const prisma = getPrisma();

  const check = await prisma.suitabilityCheck.create({
    data: {
      businessId,
      score:               assessment.score,
      maxSafeLeverage:     assessment.maxSafeLeverage,
      recommendation:      assessment.recommendation,
      noGoTriggered:       assessment.noGoTriggered,
      noGoReasons:         assessment.noGoReasons,
      alternativeProducts: assessment.alternativeProducts,
      decisionExplanation: assessment.scoreBreakdown
        ? JSON.stringify(assessment.scoreBreakdown)
        : null,
    },
  });

  const eventType = assessment.noGoTriggered
    ? EVENT_TYPES.NOGO_TRIGGERED
    : EVENT_TYPES.SUITABILITY_ASSESSED;

  await eventBus.publishAndPersist(tenantId, {
    eventType,
    aggregateType: AGGREGATE_TYPES.COMPLIANCE,
    aggregateId:   check.id,
    payload: {
      businessId,
      checkId:         check.id,
      score:           assessment.score,
      band:            assessment.band,
      noGoTriggered:   assessment.noGoTriggered,
      noGoReasons:     assessment.noGoReasons,
      maxSafeLeverage: assessment.maxSafeLeverage,
    },
  });

  logger.info('[SuitabilityService] Check completed', {
    businessId,
    checkId: check.id,
    score:   assessment.score,
    band:    assessment.band,
    noGo:    assessment.noGoTriggered,
  });

  return { checkId: check.id, assessment };
}

/**
 * Retrieve the most recent suitability check for a business.
 * Returns null if no check exists yet.
 */
export async function getLatestSuitabilityCheck(
  businessId: string,
): Promise<{
  id: string;
  score: number;
  noGoTriggered: boolean;
  noGoReasons: string[];
  recommendation: string;
  alternativeProducts: string[];
  maxSafeLeverage: number | null;
  overriddenBy: string | null;
  overrideReason: string | null;
  createdAt: Date;
} | null> {
  const prisma = getPrisma();

  const check = await prisma.suitabilityCheck.findFirst({
    where:   { businessId },
    orderBy: { createdAt: 'desc' },
  });

  if (!check) return null;

  return {
    id:                  check.id,
    score:               check.score,
    noGoTriggered:       check.noGoTriggered,
    noGoReasons:         (check.noGoReasons as string[] | null) ?? [],
    recommendation:      check.recommendation,
    alternativeProducts: (check.alternativeProducts as string[] | null) ?? [],
    maxSafeLeverage:     check.maxSafeLeverage ? Number(check.maxSafeLeverage) : null,
    overriddenBy:        check.overriddenBy,
    overrideReason:      check.overrideReason,
    createdAt:           check.createdAt,
  };
}

/**
 * Apply a compliance-officer override to a suitability check.
 *
 * Rules:
 *   - Requires `compliance_officer` role
 *   - NOT permitted when score < HARD_NOGO threshold (absolute lock)
 *   - Justification must be non-empty
 *   - Result is stored in audit log via event bus
 */
export async function applyOverride(req: OverrideRequest): Promise<OverrideResult> {
  const auditId = uuidv4();

  // ---- Role gate -----------------------------------------------
  if (req.officerRole !== ROLES.COMPLIANCE_OFFICER) {
    logger.warn('[SuitabilityService] Override attempted by non-compliance officer', {
      userId: req.officerUserId,
      role:   req.officerRole,
      checkId: req.checkId,
    });
    return {
      success:  false,
      message:  'Override requires compliance_officer role.',
      auditId,
    };
  }

  // ---- Justification gate -------------------------------------
  if (!req.justification || req.justification.trim().length < 10) {
    return {
      success: false,
      message: 'Override requires a written justification of at least 10 characters.',
      auditId,
    };
  }

  const prisma = getPrisma();

  // ---- Fetch the check ----------------------------------------
  const check = await prisma.suitabilityCheck.findUnique({
    where: { id: req.checkId },
  });

  if (!check) {
    return {
      success: false,
      message: `Suitability check ${req.checkId} not found.`,
      auditId,
    };
  }

  // ---- Hard no-go lock — no override possible below threshold -
  if (check.score < SCORE_BANDS.HARD_NOGO) {
    logger.warn('[SuitabilityService] Override blocked — score below HARD_NOGO threshold', {
      checkId: req.checkId,
      score:   check.score,
    });
    return {
      success: false,
      message: `Score ${check.score} is below the HARD NO-GO threshold (${SCORE_BANDS.HARD_NOGO}). Override is not permitted for any reason.`,
      auditId,
    };
  }

  // ---- Apply override ----------------------------------------
  await prisma.suitabilityCheck.update({
    where: { id: req.checkId },
    data:  {
      overriddenBy:  req.officerUserId,
      overrideReason: req.justification.trim(),
    },
  });

  // ---- Persist override to audit log via event bus -----------
  await eventBus.publishAndPersist(req.tenantId, {
    eventType:     EVENT_TYPES.COMPLIANCE_CHECK_COMPLETED,
    aggregateType: AGGREGATE_TYPES.COMPLIANCE,
    aggregateId:   req.checkId,
    payload: {
      action:        'suitability_override',
      checkId:       req.checkId,
      officerUserId: req.officerUserId,
      justification: req.justification.trim(),
      auditId,
    },
    metadata: {
      overrideAuditId: auditId,
      officerRole:     req.officerRole,
    },
  });

  logger.info('[SuitabilityService] Override applied', {
    checkId:       req.checkId,
    officerUserId: req.officerUserId,
    auditId,
  });

  return {
    success: true,
    message: 'Override applied and recorded in the audit log.',
    auditId,
  };
}

// ── Score computation ─────────────────────────────────────────

function computeScoreBreakdown(input: SuitabilityInput): ScoreBreakdown {
  // --- Revenue score (0–25) ------------------------------------
  // $10k+/mo = full 25; scales down linearly; $2k = 5 pts minimum eligible
  const revenueScore = scoreRevenue(input.monthlyRevenue);

  // --- Cash-flow score (0–20) ----------------------------------
  const cashFlowScore = scoreCashFlow(input.cashFlowRatio);

  // --- Debt ratio score (0–20) ---------------------------------
  const debtRatioScore = scoreDebtRatio(input.existingDebt, input.monthlyRevenue);

  // --- Credit score component (0–20) ---------------------------
  // Blends personal FICO and business credit score
  const creditScore = scoreCreditHealth(input.personalCreditScore, input.businessCreditScore);

  // --- Business age score (0–15) --------------------------------
  const businessAgeScore = scoreBusinessAge(input.businessAgeMonths);

  const total = Math.min(
    revenueScore + cashFlowScore + debtRatioScore + creditScore + businessAgeScore,
    100,
  );

  return { revenueScore, cashFlowScore, debtRatioScore, creditScore, businessAgeScore, total };
}

function scoreRevenue(monthlyRevenue: number): number {
  if (monthlyRevenue < 2_000)   return 0;
  if (monthlyRevenue >= 10_000) return 25;
  // Linear interpolation: $2k → 5 pts, $10k → 25 pts
  return 5 + Math.round(((monthlyRevenue - 2_000) / 8_000) * 20);
}

function scoreCashFlow(cashFlowRatio: number): number {
  if (cashFlowRatio < 0)     return 0;
  if (cashFlowRatio < 0.05)  return 3;
  if (cashFlowRatio < 0.10)  return 8;
  if (cashFlowRatio < 0.15)  return 12;
  if (cashFlowRatio < 0.20)  return 16;
  return 20; // >= 20% CFR
}

function scoreDebtRatio(existingDebt: number, monthlyRevenue: number): number {
  if (monthlyRevenue <= 0) return 0;
  const ratio = existingDebt / monthlyRevenue; // months of revenue covered by debt
  if (ratio > 12)  return 0;
  if (ratio > 9)   return 4;
  if (ratio > 6)   return 8;
  if (ratio > 3)   return 13;
  if (ratio > 1)   return 17;
  return 20; // debt < 1× monthly revenue
}

function scoreCreditHealth(personalFico: number, businessScore: number): number {
  // Personal FICO dominant (80% weight); business score secondary (20%)
  const ficoPoints = scoreFico(personalFico);
  const bizPoints  = businessScore > 0 ? Math.min(Math.round(businessScore / 100), 4) : 0;
  return Math.min(ficoPoints + bizPoints, 20);
}

function scoreFico(fico: number): number {
  if (fico >= 750) return 16;
  if (fico >= 700) return 12;
  if (fico >= 660) return 8;
  if (fico >= 620) return 4;
  return 0;
}

function scoreBusinessAge(months: number): number {
  if (months < 6)   return 0;
  if (months < 12)  return 3;
  if (months < 24)  return 7;
  if (months < 36)  return 11;
  return 15; // 3+ years
}

// ── Band & recommendation helpers ────────────────────────────

function determineBand(
  score: number,
  noGoTriggered: boolean,
): SuitabilityAssessment['band'] {
  if (noGoTriggered || score < SCORE_BANDS.HARD_NOGO) return 'HARD_NOGO';
  if (score < SCORE_BANDS.HIGH_RISK)                  return 'HIGH_RISK';
  if (score < SCORE_BANDS.MODERATE)                   return 'MODERATE';
  return 'APPROVED';
}

function buildRecommendation(
  band: SuitabilityAssessment['band'],
  noGoReasons: string[],
  score: number,
): string {
  switch (band) {
    case 'HARD_NOGO':
      return noGoReasons.length > 0
        ? `HARD NO-GO: Business does not qualify for credit card stacking. Reasons: ${noGoReasons.join(', ')}. This decision cannot be overridden.`
        : `HARD NO-GO: Composite score ${score} is below the minimum threshold. Deal is locked.`;

    case 'HIGH_RISK':
      return `HIGH RISK (score: ${score}): Requires deal committee review before proceeding. Significant risk factors present.`;

    case 'MODERATE':
      return `MODERATE (score: ${score}): May proceed with conditions. Recommend conservative leverage limits and close monitoring.`;

    case 'APPROVED':
      return `APPROVED (score: ${score}): Business profile supports credit card stacking within recommended leverage limits.`;
  }
}

function recommendAlternatives(input: SuitabilityInput): string[] {
  const alternatives: string[] = [];

  // SBA loans — good fit when revenue exists but debt/credit issues prevent stacking
  if (input.monthlyRevenue >= 5_000 && input.businessAgeMonths >= 12) {
    alternatives.push(ALTERNATIVE_PRODUCTS.SBA_LOAN);
  }

  // Line of credit — flexible, lower risk than stacking for moderate cases
  if (input.monthlyRevenue >= 3_000) {
    alternatives.push(ALTERNATIVE_PRODUCTS.LINE_OF_CREDIT);
  }

  // Invoice financing — relevant for B2B businesses with receivables
  if (input.monthlyRevenue >= 5_000 && input.cashFlowRatio < 0.15) {
    alternatives.push(ALTERNATIVE_PRODUCTS.INVOICE_FINANCING);
  }

  // MCA — last resort, always flagged with risk warning
  // Only suggest when other options are limited and revenue exists
  if (
    alternatives.length === 0 ||
    (input.monthlyRevenue >= 2_000 && input.cashFlowRatio >= 0)
  ) {
    alternatives.push(`${ALTERNATIVE_PRODUCTS.MCA}:WARNING_HIGH_COST_PRODUCT`);
  }

  return alternatives;
}
