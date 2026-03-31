// ============================================================
// CapitalForge — Decision Explainability Engine
//
// Responsibilities:
//   1. "Why this card" recommendation reason codes
//   2. "Why not" explanations for excluded cards
//   3. Suitability decision explanation with supporting data
//   4. Human override reason capture with mandatory justification
//   5. Log all AI decisions to AiDecisionLog
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { AGGREGATE_TYPES, ROLES } from '@shared/constants/index.js';
import logger from '../config/logger.js';

// ── Prisma singleton ──────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

// ── Reason Codes ──────────────────────────────────────────────

export const RECOMMENDATION_REASON_CODE = {
  // Why this card — positive signals
  HIGH_REWARDS_RATE:          'HIGH_REWARDS_RATE',
  ZERO_ANNUAL_FEE:            'ZERO_ANNUAL_FEE',
  LONG_INTRO_APR:             'LONG_INTRO_APR',
  HIGH_CREDIT_LIMIT:          'HIGH_CREDIT_LIMIT',
  TRAVEL_BENEFITS_MATCH:      'TRAVEL_BENEFITS_MATCH',
  CASHBACK_CATEGORY_MATCH:    'CASHBACK_CATEGORY_MATCH',
  LOW_ONGOING_APR:            'LOW_ONGOING_APR',
  ISSUER_APPROVAL_LIKELY:     'ISSUER_APPROVAL_LIKELY',
  BUSINESS_SPEND_ALIGNMENT:   'BUSINESS_SPEND_ALIGNMENT',
  BONUS_EXCEEDS_ANNUAL_FEE:   'BONUS_EXCEEDS_ANNUAL_FEE',
} as const;

export const EXCLUSION_REASON_CODE = {
  // Why not — negative signals
  CREDIT_SCORE_TOO_LOW:       'CREDIT_SCORE_TOO_LOW',
  ISSUER_VELOCITY_RULE:       'ISSUER_VELOCITY_RULE',
  TOO_MANY_RECENT_INQUIRIES:  'TOO_MANY_RECENT_INQUIRIES',
  HIGH_ANNUAL_FEE_VS_BENEFIT: 'HIGH_ANNUAL_FEE_VS_BENEFIT',
  INSUFFICIENT_REVENUE:       'INSUFFICIENT_REVENUE',
  BUSINESS_TOO_YOUNG:         'BUSINESS_TOO_YOUNG',
  INDUSTRY_RESTRICTION:       'INDUSTRY_RESTRICTION',
  LEVERAGE_LIMIT_EXCEEDED:    'LEVERAGE_LIMIT_EXCEEDED',
  DUPLICATE_ISSUER_IN_ROUND:  'DUPLICATE_ISSUER_IN_ROUND',
  SUITABILITY_NOGO:           'SUITABILITY_NOGO',
} as const;

export type RecommendationReasonCode =
  (typeof RECOMMENDATION_REASON_CODE)[keyof typeof RECOMMENDATION_REASON_CODE];

export type ExclusionReasonCode =
  (typeof EXCLUSION_REASON_CODE)[keyof typeof EXCLUSION_REASON_CODE];

// ── Card explanation shapes ───────────────────────────────────

export interface CardRecommendationReason {
  code:        RecommendationReasonCode;
  label:       string;
  detail:      string;
  /** Quantitative value that backs the reason (e.g., rewards rate, intro APR months) */
  supportingValue?: string | number;
}

export interface CardExclusionReason {
  code:        ExclusionReasonCode;
  label:       string;
  detail:      string;
  supportingValue?: string | number;
}

export interface CardRecommendationExplanation {
  cardId:      string;
  issuer:      string;
  cardProduct: string;
  recommended: true;
  reasons:     CardRecommendationReason[];
  summary:     string;
}

export interface CardExclusionExplanation {
  cardId?:     string;
  issuer:      string;
  cardProduct: string;
  recommended: false;
  reasons:     CardExclusionReason[];
  summary:     string;
}

export type CardExplanation = CardRecommendationExplanation | CardExclusionExplanation;

// ── Suitability decision explanation ─────────────────────────

export interface SuitabilityDecisionExplanation {
  checkId:            string;
  businessId:         string;
  score:              number;
  band:               string;
  decision:           string;
  scoringFactors:     ScoringFactor[];
  noGoReasons:        string[];
  overriddenBy?:      string;
  overrideReason?:    string;
  generatedAt:        string;
}

export interface ScoringFactor {
  component:   string;
  score:       number;
  maxScore:    number;
  label:       string;
  detail:      string;
}

// ── AI Decision Log ───────────────────────────────────────────

export interface AiDecisionLogEntry {
  id:             string;
  tenantId:       string;
  moduleSource:   string;
  decisionType:   string;
  inputHash?:     string;
  output:         Record<string, unknown>;
  confidence?:    number;
  overriddenBy?:  string;
  overrideReason?: string;
  modelVersion?:  string;
  promptVersion?: string;
  latencyMs?:     number;
  createdAt:      Date;
}

// ── Override capture ──────────────────────────────────────────

export interface HumanOverrideRequest {
  tenantId:      string;
  decisionLogId: string;
  overriddenBy:  string;
  overriderRole: string;
  /** Mandatory — minimum 20 characters */
  justification: string;
  /** New output value after the override */
  newOutput:     Record<string, unknown>;
}

export interface HumanOverrideResult {
  success:    boolean;
  message:    string;
  auditId:    string;
}

// ── Reason label maps ─────────────────────────────────────────

const RECOMMENDATION_LABELS: Record<RecommendationReasonCode, string> = {
  HIGH_REWARDS_RATE:        'High rewards rate',
  ZERO_ANNUAL_FEE:          'No annual fee',
  LONG_INTRO_APR:           'Extended 0% intro APR',
  HIGH_CREDIT_LIMIT:        'High credit limit potential',
  TRAVEL_BENEFITS_MATCH:    'Travel benefits match spend profile',
  CASHBACK_CATEGORY_MATCH:  'Cash-back category matches top spend',
  LOW_ONGOING_APR:          'Below-average ongoing APR',
  ISSUER_APPROVAL_LIKELY:   'Approval likelihood high given credit profile',
  BUSINESS_SPEND_ALIGNMENT: 'Card rewards aligned to business spend categories',
  BONUS_EXCEEDS_ANNUAL_FEE: 'Welcome bonus exceeds annual fee in year 1',
};

const EXCLUSION_LABELS: Record<ExclusionReasonCode, string> = {
  CREDIT_SCORE_TOO_LOW:      'Credit score below issuer minimum',
  ISSUER_VELOCITY_RULE:      'Issuer velocity rule violation',
  TOO_MANY_RECENT_INQUIRIES: 'Too many recent credit inquiries',
  HIGH_ANNUAL_FEE_VS_BENEFIT:'Annual fee exceeds projected benefit',
  INSUFFICIENT_REVENUE:      'Revenue insufficient for estimated credit limit',
  BUSINESS_TOO_YOUNG:        'Business does not meet minimum age requirement',
  INDUSTRY_RESTRICTION:      'Industry restricted by issuer guidelines',
  LEVERAGE_LIMIT_EXCEEDED:   'Adding this card would exceed safe leverage limit',
  DUPLICATE_ISSUER_IN_ROUND: 'Same issuer already included in this funding round',
  SUITABILITY_NOGO:          'Business has a no-go suitability status',
};

// ── Core service functions ────────────────────────────────────

/**
 * Build a "why this card" explanation for a recommended card.
 */
export function buildRecommendationExplanation(params: {
  cardId:      string;
  issuer:      string;
  cardProduct: string;
  reasons:     Array<{
    code:            RecommendationReasonCode;
    detail:          string;
    supportingValue?: string | number;
  }>;
}): CardRecommendationExplanation {
  const reasons: CardRecommendationReason[] = params.reasons.map((r) => ({
    code:            r.code,
    label:           RECOMMENDATION_LABELS[r.code],
    detail:          r.detail,
    supportingValue: r.supportingValue,
  }));

  const summary = reasons.length > 0
    ? `${params.issuer} ${params.cardProduct} is recommended because: ${reasons.map((r) => r.label).join('; ')}.`
    : `${params.issuer} ${params.cardProduct} is recommended based on your business profile.`;

  return {
    cardId:      params.cardId,
    issuer:      params.issuer,
    cardProduct: params.cardProduct,
    recommended: true,
    reasons,
    summary,
  };
}

/**
 * Build a "why not this card" explanation for an excluded card.
 */
export function buildExclusionExplanation(params: {
  cardId?:     string;
  issuer:      string;
  cardProduct: string;
  reasons:     Array<{
    code:            ExclusionReasonCode;
    detail:          string;
    supportingValue?: string | number;
  }>;
}): CardExclusionExplanation {
  const reasons: CardExclusionReason[] = params.reasons.map((r) => ({
    code:            r.code,
    label:           EXCLUSION_LABELS[r.code],
    detail:          r.detail,
    supportingValue: r.supportingValue,
  }));

  const summary = `${params.issuer} ${params.cardProduct} was excluded because: ${reasons.map((r) => r.label).join('; ')}.`;

  return {
    cardId:      params.cardId,
    issuer:      params.issuer,
    cardProduct: params.cardProduct,
    recommended: false,
    reasons,
    summary,
  };
}

/**
 * Build a human-readable suitability decision explanation with supporting data.
 */
export function buildSuitabilityExplanation(params: {
  checkId:       string;
  businessId:    string;
  score:         number;
  band:          string;
  recommendation: string;
  noGoReasons?:  string[];
  scoreBreakdown?: {
    revenueScore:     number;
    cashFlowScore:    number;
    debtRatioScore:   number;
    creditScore:      number;
    businessAgeScore: number;
  };
  overriddenBy?:   string;
  overrideReason?: string;
}): SuitabilityDecisionExplanation {
  const scoringFactors: ScoringFactor[] = [];

  if (params.scoreBreakdown) {
    const bd = params.scoreBreakdown;
    scoringFactors.push(
      {
        component: 'revenue',
        score:     bd.revenueScore,
        maxScore:  25,
        label:     'Monthly Revenue',
        detail:    `Revenue component scored ${bd.revenueScore}/25. Higher monthly revenue improves this factor.`,
      },
      {
        component: 'cash_flow',
        score:     bd.cashFlowScore,
        maxScore:  20,
        label:     'Cash Flow Ratio',
        detail:    `Cash flow component scored ${bd.cashFlowScore}/20. A positive and growing cash-flow ratio strengthens this score.`,
      },
      {
        component: 'debt_ratio',
        score:     bd.debtRatioScore,
        maxScore:  20,
        label:     'Debt-to-Revenue Ratio',
        detail:    `Debt ratio component scored ${bd.debtRatioScore}/20. Lower existing debt relative to revenue is favorable.`,
      },
      {
        component: 'credit_health',
        score:     bd.creditScore,
        maxScore:  20,
        label:     'Credit Health (Personal + Business)',
        detail:    `Credit health scored ${bd.creditScore}/20. Personal FICO (80% weight) and business credit score (20% weight) contribute.`,
      },
      {
        component: 'business_age',
        score:     bd.businessAgeScore,
        maxScore:  15,
        label:     'Business Age',
        detail:    `Business age scored ${bd.businessAgeScore}/15. More established businesses score higher.`,
      },
    );
  }

  return {
    checkId:         params.checkId,
    businessId:      params.businessId,
    score:           params.score,
    band:            params.band,
    decision:        params.recommendation,
    scoringFactors,
    noGoReasons:     params.noGoReasons ?? [],
    overriddenBy:    params.overriddenBy,
    overrideReason:  params.overrideReason,
    generatedAt:     new Date().toISOString(),
  };
}

/**
 * Retrieve AI decision explanations for a business.
 * Returns the most recent decisions from AiDecisionLog for the given businessId.
 * The businessId is matched against AiDecisionLog entries whose output contains businessId.
 */
export async function getBusinessDecisionExplanations(
  businessId: string,
  tenantId:   string,
  limit = 20,
): Promise<AiDecisionLogEntry[]> {
  const prisma = getPrisma();

  // Find log entries for this tenant that reference this businessId in their output
  const logs = await prisma.aiDecisionLog.findMany({
    where: {
      tenantId,
      output: {
        path:   ['businessId'],
        equals: businessId,
      },
    },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  });

  return logs.map((l: typeof logs[number]) => ({
    id:             l.id,
    tenantId:       l.tenantId,
    moduleSource:   l.moduleSource,
    decisionType:   l.decisionType,
    inputHash:      l.inputHash ?? undefined,
    output:         l.output as Record<string, unknown>,
    confidence:     l.confidence ? Number(l.confidence) : undefined,
    overriddenBy:   l.overriddenBy ?? undefined,
    overrideReason: l.overrideReason ?? undefined,
    modelVersion:   l.modelVersion ?? undefined,
    promptVersion:  l.promptVersion ?? undefined,
    latencyMs:      l.latencyMs ?? undefined,
    createdAt:      l.createdAt,
  }));
}

/**
 * Retrieve the full audit trail for a specific AI decision log entry.
 */
export async function getDecisionAuditTrail(
  decisionId: string,
  tenantId:   string,
): Promise<{
  decision:    AiDecisionLogEntry;
  auditEvents: Array<{
    eventType:   string;
    aggregateId: string;
    payload:     Record<string, unknown>;
    publishedAt: Date;
  }>;
} | null> {
  const prisma = getPrisma();

  const log = await prisma.aiDecisionLog.findUnique({
    where: { id: decisionId },
  });

  if (!log || log.tenantId !== tenantId) return null;

  // Retrieve related ledger events for this decision
  const auditEvents = await prisma.ledgerEvent.findMany({
    where: {
      tenantId,
      aggregateId: decisionId,
    },
    orderBy: { publishedAt: 'asc' },
  });

  return {
    decision: {
      id:             log.id,
      tenantId:       log.tenantId,
      moduleSource:   log.moduleSource,
      decisionType:   log.decisionType,
      inputHash:      log.inputHash ?? undefined,
      output:         log.output as Record<string, unknown>,
      confidence:     log.confidence ? Number(log.confidence) : undefined,
      overriddenBy:   log.overriddenBy ?? undefined,
      overrideReason: log.overrideReason ?? undefined,
      modelVersion:   log.modelVersion ?? undefined,
      promptVersion:  log.promptVersion ?? undefined,
      latencyMs:      log.latencyMs ?? undefined,
      createdAt:      log.createdAt,
    },
    auditEvents: auditEvents.map((e: typeof auditEvents[number]) => ({
      eventType:   e.eventType,
      aggregateId: e.aggregateId,
      payload:     e.payload as Record<string, unknown>,
      publishedAt: e.publishedAt,
    })),
  };
}

/**
 * Log an AI decision to the AiDecisionLog table.
 * Call this from any service that makes an AI-driven recommendation or assessment.
 */
export async function logAiDecision(params: {
  tenantId:      string;
  moduleSource:  string;
  decisionType:  string;
  output:        Record<string, unknown>;
  inputHash?:    string;
  confidence?:   number;
  modelVersion?: string;
  promptVersion?: string;
  latencyMs?:    number;
}): Promise<string> {
  const prisma = getPrisma();

  const entry = await prisma.aiDecisionLog.create({
    data: {
      tenantId:      params.tenantId,
      moduleSource:  params.moduleSource,
      decisionType:  params.decisionType,
      output:        params.output,
      inputHash:     params.inputHash ?? null,
      confidence:    params.confidence ?? null,
      modelVersion:  params.modelVersion ?? null,
      promptVersion: params.promptVersion ?? null,
      latencyMs:     params.latencyMs ?? null,
    },
  });

  logger.info('[DecisionExplainability] AI decision logged', {
    id:           entry.id,
    moduleSource: params.moduleSource,
    decisionType: params.decisionType,
  });

  return entry.id;
}

/**
 * Capture a human override of an AI decision.
 * Justification is mandatory (minimum 20 characters).
 * Emits an audit event and updates the AiDecisionLog record.
 */
export async function captureHumanOverride(
  req: HumanOverrideRequest,
): Promise<HumanOverrideResult> {
  const auditId = uuidv4();

  // ---- Justification gate -------------------------------------
  if (!req.justification || req.justification.trim().length < 20) {
    return {
      success: false,
      message: 'Override justification must be at least 20 characters.',
      auditId,
    };
  }

  const prisma = getPrisma();

  const existing = await prisma.aiDecisionLog.findUnique({
    where: { id: req.decisionLogId },
  });

  if (!existing) {
    return {
      success: false,
      message: `AI decision log entry ${req.decisionLogId} not found.`,
      auditId,
    };
  }

  if (existing.tenantId !== req.tenantId) {
    return {
      success: false,
      message: 'Tenant mismatch — access denied.',
      auditId,
    };
  }

  // ---- Apply override -----------------------------------------
  await prisma.aiDecisionLog.update({
    where: { id: req.decisionLogId },
    data: {
      overriddenBy:  req.overriddenBy,
      overrideReason: req.justification.trim(),
      output:        req.newOutput,
    },
  });

  await eventBus.publishAndPersist(req.tenantId, {
    eventType:     'ai_decision.override.applied',
    aggregateType: AGGREGATE_TYPES.COMPLIANCE,
    aggregateId:   req.decisionLogId,
    payload: {
      decisionLogId: req.decisionLogId,
      overriddenBy:  req.overriddenBy,
      overriderRole: req.overriderRole,
      justification: req.justification.trim(),
      auditId,
      moduleSource:  existing.moduleSource,
      decisionType:  existing.decisionType,
    },
    metadata: { auditId },
  });

  logger.info('[DecisionExplainability] Human override applied', {
    decisionLogId: req.decisionLogId,
    overriddenBy:  req.overriddenBy,
    auditId,
  });

  return {
    success: true,
    message: 'Override applied and recorded in the audit log.',
    auditId,
  };
}
