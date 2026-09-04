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
import { prisma as sharedPrisma } from '../config/database.js';
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
    _prisma = sharedPrisma;
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

  // The gates that record a human having confirmed something, rather than a
  // fact about the client's finances. They moved here from suitability-engine.ts
  // on 2 September: that engine asked for them and never persisted, this one
  // persists and never asked, so the finding a compliance manifest reports as
  // `noGoTriggered` was computed by a rule set that never looked at whether the
  // client had acknowledged the personal guarantee or the APR risk.
  //
  // The codes are the engine's own, unchanged. One vocabulary for one concept.
  NO_PG_ACKNOWLEDGMENT:     'no_pg_acknowledgment',
  NO_APR_RISK_ACKNOWLEDGMENT: 'no_apr_risk_acknowledgment',
  NO_DEBT_SERVICE_CONFIRMATION: 'no_debt_service_confirmation',
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

  /**
   * A signed `personal_guarantee` acknowledgment exists for this business.
   *
   * Read from `ProductAcknowledgment`, never supplied by a caller — see
   * `SuitabilityProfile` and `readAcknowledgmentGates`. An unsigned
   * acknowledgment is an absence in the records, and the placement gate it
   * guards is the one thing an absence may block: nothing signed means nothing
   * signed.
   */
  clientAcknowledgedPersonalGuarantee: boolean;

  /**
   * A signed `product_reality` acknowledgment exists. That is the template
   * carrying the APR-expiry disclosure — "THESE RATES EXPIRE ... standard
   * purchase APRs, which may exceed 25%" — so it is the record of the client
   * having been told about APR risk.
   */
  clientAcknowledgedAprRisk: boolean;

  /**
   * Whether an advisor confirmed the client can service the debt.
   *
   * **`null` means unassessed, and is the only value this can currently take.**
   * CapitalForge has no record of an advisor confirming debt-service capacity —
   * no model, no column, no endpoint — so the honest answer is neither true nor
   * false. `true` would be the fabrication this gate was moved here to stop;
   * `false` would convert a missing feature into a finding about a client's
   * file, and would no-go every check in the system.
   *
   * It is reported in `unassessedGates` instead, with its basis. See
   * `docs/gaps.md`.
   */
  advisorConfirmedDebtServicing: boolean | null;
}

/**
 * What a caller may supply. The three gates are absent by construction.
 *
 * A route cannot assert that a client acknowledged the personal guarantee,
 * because the type does not let it. `runSuitabilityCheck` reads them from the
 * record and composes the full input itself — the engine that answers is the
 * engine that asks.
 */
export type SuitabilityProfile = Omit<
  SuitabilityInput,
  | 'clientAcknowledgedPersonalGuarantee'
  | 'clientAcknowledgedAprRisk'
  | 'advisorConfirmedDebtServicing'
>;

/** A gate that could not be evaluated, and why. Never a pass. */
export interface UnassessedGate {
  code: string;
  basis: string;
}

// ── Extended result (internal, includes leverage detail) ─────

export interface SuitabilityAssessment extends SuitabilityResult {
  /** Detailed score breakdown by component */
  scoreBreakdown: ScoreBreakdown;

  /** Full leverage model output */
  leverageDetail: LeverageResult;

  /** Suitability band label */
  band: 'APPROVED' | 'MODERATE' | 'HIGH_RISK' | 'HARD_NOGO';

  /**
   * Gates that could not be evaluated, each with its basis.
   *
   * The third state, and the reason this field exists rather than a boolean:
   * a no-go that did not fire and a no-go that could not be checked read
   * identically in `noGoReasons`, and only one of them is a statement about the
   * client. Never report an empty `noGoReasons` as a clean assessment without
   * reading this.
   */
  unassessedGates: UnassessedGate[];
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
  /** The business in the request path. The check must belong to it. */
  businessId:       string;
  officerUserId:    string;
  officerRole:      string;
  justification:    string;
  tenantId:         string;
}

// ── Override refusals ─────────────────────────────────────────
//
// Typed, because the route chose a status by substring-matching the message:
// `includes('not found')`, `includes('HARD NO-GO')`,
// `includes('compliance_officer role')`. Rewording a sentence in this file
// silently turned a 403 into a 400 - a caller told to fix their request when the
// truth was that they lacked a role. Same treatment as
// statement-reconciliation and compliance-dossier.

/**
 * No such check for this business under this tenant.
 *
 * One type for three situations: no such id, an id belonging to another
 * business, and an id belonging to another tenant. They are one answer on
 * purpose. A caller who cannot see a check does not need to be told that it
 * exists and is somebody else's - that confirms the id, which is the whole
 * value of guessing one.
 */
export class SuitabilityCheckNotFoundError extends Error {
  constructor(public readonly checkId: string) {
    super(`Suitability check ${checkId} was not found.`);
    this.name = 'SuitabilityCheckNotFoundError';
  }
}

/** The caller does not hold `compliance_officer`. */
export class OverrideRequiresComplianceOfficerError extends Error {
  constructor() {
    super('Override requires the compliance_officer role.');
    this.name = 'OverrideRequiresComplianceOfficerError';
  }
}

/** An override is a recorded judgement, so it has to say something. */
export class OverrideJustificationTooShortError extends Error {
  constructor() {
    super('Override requires a written justification of at least 10 characters.');
    this.name = 'OverrideJustificationTooShortError';
  }
}

/**
 * Below the hard no-go threshold nothing may be overridden, by anyone.
 *
 * Its own type rather than folding into the role refusal, because a caller has
 * to be able to tell "you may not override this" from "you may not override".
 */
export class HardNoGoLockedError extends Error {
  constructor(public readonly score: number, public readonly threshold: number) {
    super(
      `Score ${score} is below the HARD NO-GO threshold (${threshold}). `
      + 'Override is not permitted for any reason.',
    );
    this.name = 'HardNoGoLockedError';
  }
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

  // Critically low credit score: < 580 FICO is a hard no-go for card stacking
  if (input.personalCreditScore < 580) {
    noGoReasons.push(NOGO_REASON.CREDIT_SCORE_TOO_LOW);
  }

  // ---- 1b. The gates that record a human confirming something ---
  //
  // These block placement and do NOT zero the score, unlike bankruptcy,
  // sanctions and fraud. The distinction is the point of them: an unsigned
  // personal-guarantee acknowledgment is a procedural gap, and forcing the
  // composite to 0 would state that the client is uncreditworthy when the fact
  // is that a form has not been signed. Blocking a placement on a missing
  // signature is right; recording a finding about the client's finances because
  // of one is the absence-as-fact error this codebase keeps closing.
  if (!input.clientAcknowledgedPersonalGuarantee) {
    noGoReasons.push(NOGO_REASON.NO_PG_ACKNOWLEDGMENT);
  }
  if (!input.clientAcknowledgedAprRisk) {
    noGoReasons.push(NOGO_REASON.NO_APR_RISK_ACKNOWLEDGMENT);
  }

  const unassessedGates: UnassessedGate[] = [];
  if (input.advisorConfirmedDebtServicing === null) {
    // Not "the advisor did not confirm". Nothing in CapitalForge records an
    // advisor confirming debt-service capacity, so this gate has never been
    // askable. Reported, not assumed in either direction.
    unassessedGates.push({
      code:  'no_debt_service_confirmation',
      basis: 'advisor_debt_service_confirmation_not_recorded',
    });
  } else if (!input.advisorConfirmedDebtServicing) {
    // Reachable the day a confirmation is recordable: an advisor who looked and
    // did not confirm is a finding, and a different one from never having been
    // asked.
    noGoReasons.push(NOGO_REASON.NO_DEBT_SERVICE_CONFIRMATION);
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
  const hasCreditNoGo = noGoReasons.includes(NOGO_REASON.CREDIT_SCORE_TOO_LOW);

  // Force score to 0 when critical flags are present; cap at 20 for critical credit issues
  const effectiveScore = hasCriticalNoGo ? 0
    : hasCreditNoGo ? Math.min(breakdown.total, 20)
    : breakdown.total;
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
    unassessedGates,
  };
}

/**
 * The three human-confirmation gates, read from the records.
 *
 * `personal_guarantee` and `product_reality` are `ProductAcknowledgment` rows —
 * a signature exists or it does not, and no signature means the gate is not
 * satisfied. There is no template for an advisor's debt-service confirmation
 * and no column that would hold one, so that gate returns `null`: unassessed,
 * which `computeSuitability` reports rather than assumes.
 *
 * Exported so the class wrapper uses the same reader. Two ways of deciding
 * whether a client signed something is how the two engines diverged in the
 * first place.
 */
export async function readAcknowledgmentGates(businessId: string): Promise<{
  clientAcknowledgedPersonalGuarantee: boolean;
  clientAcknowledgedAprRisk: boolean;
  advisorConfirmedDebtServicing: boolean | null;
}> {
  const prisma = getPrisma();

  const signed = await prisma.productAcknowledgment.findMany({
    where: {
      businessId,
      acknowledgmentType: { in: ['personal_guarantee', 'product_reality'] },
    },
    select: { acknowledgmentType: true },
  });

  const types = new Set(signed.map((a) => a.acknowledgmentType));

  return {
    clientAcknowledgedPersonalGuarantee: types.has('personal_guarantee'),
    clientAcknowledgedAprRisk:           types.has('product_reality'),
    advisorConfirmedDebtServicing:       null,
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
  profile:    SuitabilityProfile,
): Promise<{ checkId: string; assessment: SuitabilityAssessment }> {
  const prisma = getPrisma();

  // The three human-confirmation gates are read here and nowhere else. A caller
  // supplies a `SuitabilityProfile`, which does not carry them, so no route can
  // assert that a client acknowledged anything.
  const gates = await readAcknowledgmentGates(businessId);
  const assessment = computeSuitability({ ...profile, ...gates });

  const check = await prisma.suitabilityCheck.create({
    data: {
      businessId,
      score:               assessment.score,
      maxSafeLeverage:     assessment.maxSafeLeverage,
      recommendation:      assessment.recommendation,
      noGoTriggered:       assessment.noGoTriggered,
      noGoReasons:         assessment.noGoReasons,
      alternativeProducts: assessment.alternativeProducts,
      // The breakdown, and what could not be assessed. Both, because a reader
      // of a stored check has no other way to tell a gate that passed from a
      // gate that was never askable.
      decisionExplanation: JSON.stringify({
        scoreBreakdown:  assessment.scoreBreakdown,
        unassessedGates: assessment.unassessedGates,
      }),
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
  /**
   * Gates that could not be evaluated. See `UnassessedGate`.
   *
   * Returned here because a third state that exists only on the write path is
   * not a third state. `POST /check` reported it and this read dropped it, so
   * every later reader - the console, an advisor, a compliance officer opening
   * the file a week afterwards - saw an empty `noGoReasons` and could not tell a
   * gate that passed from a gate nobody could ask.
   */
  unassessedGates: UnassessedGate[];
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
    unassessedGates:     readUnassessedGates(check.decisionExplanation),
    createdAt:           check.createdAt,
  };
}

/**
 * The unassessed gates a stored check recorded, or none.
 *
 * `decisionExplanation` is where the write path put them. A row written before
 * the field existed, or one whose explanation will not parse, returns `[]` -
 * honest for a check that predates it, and not the same as asserting the gates
 * were assessed. There is no way to tell those two apart from a stored row, and
 * inventing a distinction would be worse than not having one.
 */
function readUnassessedGates(explanation: string | null): UnassessedGate[] {
  if (!explanation) return [];
  try {
    const parsed = JSON.parse(explanation) as { unassessedGates?: unknown };
    return Array.isArray(parsed.unassessedGates)
      ? (parsed.unassessedGates as UnassessedGate[])
      : [];
  } catch {
    return [];
  }
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
    throw new OverrideRequiresComplianceOfficerError();
  }

  // ---- Justification gate -------------------------------------
  if (!req.justification || req.justification.trim().length < 10) {
    throw new OverrideJustificationTooShortError();
  }

  const prisma = getPrisma();

  // ---- Fetch the check, through the business and the tenant ----
  //
  // `findUnique({ where: { id } })` resolved any check in any tenant.
  // SuitabilityCheck carries no tenantId - it is scoped only through its
  // business - and nothing compared the check's business to the `:id` in the
  // path, which the mount guard had already validated as the caller's own. So a
  // compliance officer could pass their own business and any checkId and write
  // `overriddenBy` onto another tenant's row.
  //
  // That is not a disclosure, it is a decision: application-gates.ts treats
  // `overriddenBy` as clearing the no-go, so the write cleared another tenant's
  // placement gate, and the event was published under the caller's tenantId and
  // landed in the wrong ledger.
  const check = await prisma.suitabilityCheck.findFirst({
    where: {
      id:         req.checkId,
      businessId: req.businessId,
      business:   { tenantId: req.tenantId },
    },
  });

  if (!check) {
    throw new SuitabilityCheckNotFoundError(req.checkId);
  }

  // ---- Hard no-go lock — no override possible below threshold -
  if (check.score < SCORE_BANDS.HARD_NOGO) {
    logger.warn('[SuitabilityService] Override blocked — score below HARD_NOGO threshold', {
      checkId: req.checkId,
      score:   check.score,
    });
    throw new HardNoGoLockedError(check.score, SCORE_BANDS.HARD_NOGO);
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

// ── Class-based wrapper (test-friendly API) ───────────────────

/**
 * Class wrapper around the standalone suitability functions.
 * Accepts an injected PrismaClient so tests can pass a mock.
 */
export class SuitabilityService {
  constructor(prismaClient?: PrismaClient) {
    if (prismaClient) {
      setPrismaClient(prismaClient);
    }
  }

  async assess(input: {
    businessId: string;
    tenantId: string;
    monthlyRevenue: number;
    existingDebt: number;
    creditScore: number;
    businessAgeMonths: number;
    industry: string;
    mcc?: string;
  }): Promise<SuitabilityAssessment & { businessId: string; tenantId: string }> {
    const suitabilityInput: SuitabilityInput = {
      monthlyRevenue:       input.monthlyRevenue,
      existingDebt:         input.existingDebt,
      cashFlowRatio:        0.15, // default positive cash flow for tests
      industry:             input.industry,
      businessAgeMonths:    input.businessAgeMonths,
      personalCreditScore:  input.creditScore,
      businessCreditScore:  0,
      activeBankruptcy:     false,
      sanctionsMatch:       false,
      fraudSuspicion:       false,
      // Read, not defaulted. The three defaults this wrapper does still carry
      // are the ones it was written for; these three are not test scaffolding,
      // they are the record of a person having confirmed something.
      ...(await readAcknowledgmentGates(input.businessId)),
    };
    const assessment = computeSuitability(suitabilityInput);

    // Emit suitability.assessed event
    await eventBus.publishAndPersist(input.tenantId, {
      eventType:     EVENT_TYPES.SUITABILITY_ASSESSED,
      aggregateType: AGGREGATE_TYPES.BUSINESS,
      aggregateId:   input.businessId,
      payload: {
        businessId: input.businessId,
        score:      assessment.score,
        noGoTriggered: assessment.noGoTriggered,
        noGoReasons: assessment.noGoReasons,
        recommendation: assessment.recommendation,
      },
    });

    // Emit nogo.triggered event if applicable
    if (assessment.noGoTriggered) {
      await eventBus.publishAndPersist(input.tenantId, {
        eventType:     EVENT_TYPES.NOGO_TRIGGERED,
        aggregateType: AGGREGATE_TYPES.BUSINESS,
        aggregateId:   input.businessId,
        payload: {
          businessId:  input.businessId,
          score:       assessment.score,
          noGoReasons: assessment.noGoReasons,
        },
      });
    }

    return {
      ...assessment,
      businessId: input.businessId,
      tenantId:   input.tenantId,
    };
  }
}
