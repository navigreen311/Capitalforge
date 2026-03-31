// ============================================================
// CapitalForge — Regulatory Intelligence Monitor
//
// Core responsibilities:
//   1. Monitor FTC / CFPB / State AG enforcement actions (stub)
//   2. Track state commercial-financing disclosure law changes
//   3. Scan Visa / Mastercard operating-rule updates
//   4. Impact scoring: which platform modules are affected
//   5. Alert generation & persistence (RegulatoryAlert table)
//
// Design notes:
//   - All external data feeds are stubs; replace feed methods
//     with live API/RSS integrations in production.
//   - Impact scoring maps rule categories to affected modules
//     using a static matrix (IMPACT_MATRIX), producing an
//     impactScore 1–100 and an affectedModules array.
//   - Alert statuses: new → under_review → resolved | dismissed
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import logger from '../config/logger.js';

// ── Enumerations ──────────────────────────────────────────────────

export type RegulatorySource =
  | 'FTC'
  | 'CFPB'
  | 'State_AG'
  | 'Visa'
  | 'Mastercard'
  | 'OCC'
  | 'FDIC'
  | 'FRB'
  | 'FinCEN'
  | 'State_DFS';

export type RuleType =
  | 'enforcement_action'
  | 'commercial_financing_disclosure'
  | 'network_operating_rule'
  | 'aml_bsa'
  | 'fair_lending'
  | 'money_transmission'
  | 'udap_guidance'
  | 'interest_rate_cap'
  | 'licensing_requirement';

export type AlertStatus = 'new' | 'under_review' | 'resolved' | 'dismissed';

export type PlatformModule =
  | 'onboarding'
  | 'kyb_kyc'
  | 'compliance_check'
  | 'card_application'
  | 'funds_flow'
  | 'disclosure_templates'
  | 'consent_management'
  | 'ach_controls'
  | 'stacking_optimizer'
  | 'cost_calculator'
  | 'deal_committee'
  | 'partner_governance';

// ── Data types ────────────────────────────────────────────────────

export interface RegulatoryAlertRecord {
  id: string;
  tenantId: string;
  source: RegulatorySource;
  ruleType: RuleType;
  title: string;
  summary: string;
  impactScore: number;
  affectedModules: PlatformModule[];
  status: AlertStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  effectiveDate?: Date;
  createdAt: Date;
}

export interface ImpactAssessment {
  ruleId: string;
  impactScore: number;
  affectedModules: PlatformModule[];
  rationale: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  recommendedActions: string[];
}

export interface AlertReviewInput {
  alertId: string;
  tenantId: string;
  reviewedBy: string;
  newStatus: AlertStatus;
  notes?: string;
}

export interface CreateAlertInput {
  tenantId: string;
  source: RegulatorySource;
  ruleType: RuleType;
  title: string;
  summary: string;
  effectiveDate?: Date;
  /** Optional override; if omitted, scoring is auto-computed */
  impactScore?: number;
  affectedModules?: PlatformModule[];
}

// ── Impact matrix ──────────────────────────────────────────────────
// Maps each rule type to the modules it typically affects and a
// base impact weight (1–10).  Final score = weight * source_multiplier.

const IMPACT_MATRIX: Record<
  RuleType,
  { modules: PlatformModule[]; baseWeight: number }
> = {
  enforcement_action: {
    modules: ['compliance_check', 'deal_committee', 'partner_governance', 'kyb_kyc'],
    baseWeight: 8,
  },
  commercial_financing_disclosure: {
    modules: ['disclosure_templates', 'consent_management', 'cost_calculator', 'onboarding'],
    baseWeight: 9,
  },
  network_operating_rule: {
    modules: ['card_application', 'stacking_optimizer', 'funds_flow', 'ach_controls'],
    baseWeight: 7,
  },
  aml_bsa: {
    modules: ['kyb_kyc', 'compliance_check', 'ach_controls', 'funds_flow'],
    baseWeight: 9,
  },
  fair_lending: {
    modules: ['card_application', 'compliance_check', 'deal_committee', 'onboarding'],
    baseWeight: 7,
  },
  money_transmission: {
    modules: ['funds_flow', 'ach_controls', 'partner_governance', 'compliance_check'],
    baseWeight: 10,
  },
  udap_guidance: {
    modules: ['compliance_check', 'consent_management', 'disclosure_templates', 'onboarding'],
    baseWeight: 8,
  },
  interest_rate_cap: {
    modules: ['cost_calculator', 'card_application', 'stacking_optimizer', 'disclosure_templates'],
    baseWeight: 6,
  },
  licensing_requirement: {
    modules: ['onboarding', 'partner_governance', 'compliance_check', 'deal_committee'],
    baseWeight: 8,
  },
};

// Source multipliers reflect relative regulatory authority / urgency
const SOURCE_MULTIPLIER: Record<RegulatorySource, number> = {
  CFPB:        1.0,
  FTC:         1.0,
  State_AG:    0.9,
  FinCEN:      1.0,
  OCC:         0.95,
  FDIC:        0.95,
  FRB:         0.95,
  Visa:        0.85,
  Mastercard:  0.85,
  State_DFS:   0.9,
};

// ── Stub feed data ────────────────────────────────────────────────
// In production, replace with live RSS / API polling from:
//   - CFPB enforcement actions feed
//   - FTC cases-and-proceedings feed
//   - State AG press-release scrapers
//   - Visa / Mastercard rule-update portals

export const STUB_REGULATORY_FEED: Omit<RegulatoryAlertRecord, 'id' | 'tenantId' | 'status' | 'createdAt'>[] = [
  {
    source: 'CFPB',
    ruleType: 'commercial_financing_disclosure',
    title: 'CFPB Finalises Commercial Financing Disclosure Rule — Small-Business APR Equivalent',
    summary:
      'CFPB finalised amendments to Regulation B requiring APR-equivalent cost-of-capital ' +
      'disclosures for commercial financing transactions under $2.5 million. Effective date ' +
      'creates urgency to update CostCalculator and DisclosureTemplate modules.',
    impactScore: 92,
    affectedModules: ['disclosure_templates', 'cost_calculator', 'consent_management', 'onboarding'],
    effectiveDate: new Date('2026-06-01'),
  },
  {
    source: 'FTC',
    ruleType: 'udap_guidance',
    title: 'FTC Issues Updated Guidance on "No Upfront Fee" Claims in Commercial Lending',
    summary:
      'FTC enforcement sweep targets commercial-funding companies making "no upfront fee" ' +
      'representations when program or arrangement fees effectively constitute upfront costs. ' +
      'UDAP scorer patterns must be reviewed and updated.',
    impactScore: 78,
    affectedModules: ['compliance_check', 'consent_management', 'disclosure_templates'],
    effectiveDate: new Date('2026-04-15'),
  },
  {
    source: 'Visa',
    ruleType: 'network_operating_rule',
    title: 'Visa Updates Account Funding Transaction (AFT) Rules — Merchant Category Restrictions',
    summary:
      'Visa Operating Regulations April 2026 update restricts Account Funding Transactions ' +
      'at certain MCC codes and raises risk-scoring thresholds for card-stacking workflows. ' +
      'Funds-flow classifier and stacking optimizer must be updated.',
    impactScore: 71,
    affectedModules: ['funds_flow', 'card_application', 'stacking_optimizer'],
    effectiveDate: new Date('2026-07-01'),
  },
  {
    source: 'State_AG',
    ruleType: 'commercial_financing_disclosure',
    title: 'New York DFSP Proposed Rulemaking — Commercial Financing Registration Amendments',
    summary:
      'New York DFS proposes to require out-of-state commercial financing providers to register ' +
      'by filing Form CF-1 and maintaining a $250,000 surety bond. Comment period open.',
    impactScore: 65,
    affectedModules: ['disclosure_templates', 'onboarding', 'partner_governance', 'compliance_check'],
    effectiveDate: new Date('2026-09-01'),
  },
  {
    source: 'FinCEN',
    ruleType: 'aml_bsa',
    title: 'FinCEN Beneficial Ownership Reporting Rule — Small-Business Entity Expansion',
    summary:
      'FinCEN expands Corporate Transparency Act reporting scope; KYB workflows must collect ' +
      'updated beneficial-ownership data and rescreen at change-of-control events. ' +
      'Penalties of up to $591/day per violation.',
    impactScore: 88,
    affectedModules: ['kyb_kyc', 'compliance_check', 'onboarding', 'deal_committee'],
    effectiveDate: new Date('2026-05-01'),
  },
  {
    source: 'Mastercard',
    ruleType: 'network_operating_rule',
    title: 'Mastercard Updates Money-Transfer Transaction Rules — New Risk Tiering',
    summary:
      'Mastercard Transaction Processing Rules amendment introduces a third risk tier for ' +
      'money-transfer transactions, adding additional due-diligence requirements for ' +
      'merchant-of-record workflows.',
    impactScore: 67,
    affectedModules: ['funds_flow', 'stacking_optimizer', 'ach_controls'],
    effectiveDate: new Date('2026-08-15'),
  },
];

// ── Helper: compute impact score ───────────────────────────────────

export function computeImpactScore(
  source: RegulatorySource,
  ruleType: RuleType,
): { impactScore: number; affectedModules: PlatformModule[] } {
  const matrix = IMPACT_MATRIX[ruleType];
  const multiplier = SOURCE_MULTIPLIER[source] ?? 0.8;
  const rawScore = matrix.baseWeight * multiplier * 10;
  const impactScore = Math.min(100, Math.round(rawScore));
  return { impactScore, affectedModules: [...matrix.modules] };
}

// ── Helper: urgency from score ─────────────────────────────────────

export function scoreToUrgency(
  score: number,
): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

// ── Helper: recommended actions by rule type ───────────────────────

function recommendedActionsFor(ruleType: RuleType, affectedModules: PlatformModule[]): string[] {
  const actions: string[] = [
    `Review impact on: ${affectedModules.join(', ')}.`,
  ];
  switch (ruleType) {
    case 'commercial_financing_disclosure':
      actions.push(
        'Update DisclosureTemplate records for affected states.',
        'Re-validate CostCalculator APR-equivalent output against new format.',
        'Schedule legal counsel review of disclosure language.',
      );
      break;
    case 'enforcement_action':
      actions.push(
        'Cross-reference vendor and partner list against named respondents.',
        'Escalate to Deal Committee for any active deals with implicated parties.',
        'Update vendor enforcement database with new action record.',
      );
      break;
    case 'network_operating_rule':
      actions.push(
        'Audit current card-stacking workflows against updated network rules.',
        'Update funds-flow classifier rule table.',
        'Notify processor partners of classification changes.',
      );
      break;
    case 'aml_bsa':
      actions.push(
        'Update KYB/KYC screening questionnaire.',
        'Rescreen existing beneficial owners against new criteria.',
        'Update AML/BSA program documentation.',
      );
      break;
    case 'money_transmission':
      actions.push(
        'Conduct state-by-state money-transmission licensing gap analysis.',
        'Engage licensing counsel for escalation review.',
        'Pause affected payment workflows pending legal clearance.',
      );
      break;
    case 'udap_guidance':
      actions.push(
        'Re-run UDAP scorer against all active script templates.',
        'Update approved-script library to remove flagged language.',
        'Deliver updated training module to advisor team.',
      );
      break;
    case 'licensing_requirement':
      actions.push(
        'Audit active state registrations vs new requirements.',
        'File or update registrations in affected states.',
        'Update onboarding geo-restriction rules.',
      );
      break;
    default:
      actions.push('Consult compliance counsel and update affected module configurations.');
  }
  return actions;
}

// ── RegulatoryIntelligenceService ─────────────────────────────────

export class RegulatoryIntelligenceService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Ingest a new regulatory alert, compute impact scoring, and
   * persist to the regulatory_alerts table.
   */
  async createAlert(input: CreateAlertInput): Promise<RegulatoryAlertRecord> {
    const id = uuidv4();
    const createdAt = new Date();

    const { impactScore, affectedModules } =
      input.impactScore !== undefined && input.affectedModules !== undefined
        ? { impactScore: input.impactScore, affectedModules: input.affectedModules }
        : computeImpactScore(input.source, input.ruleType);

    await this.prisma.regulatoryAlert.create({
      data: {
        id,
        tenantId:        input.tenantId,
        source:          input.source,
        ruleType:        input.ruleType,
        title:           input.title,
        summary:         input.summary,
        impactScore,
        affectedModules: affectedModules as unknown as object,
        status:          'new',
        effectiveDate:   input.effectiveDate ?? null,
      },
    });

    const urgency = scoreToUrgency(impactScore);

    if (urgency === 'critical' || urgency === 'high') {
      await eventBus.publish(input.tenantId, {
        eventType:     EVENT_TYPES.RISK_ALERT_RAISED,
        aggregateType: AGGREGATE_TYPES.COMPLIANCE,
        aggregateId:   id,
        payload: {
          alertId: id,
          source: input.source,
          ruleType: input.ruleType,
          impactScore,
          urgency,
          affectedModules,
        },
      });
    }

    logger.info('Regulatory alert created', {
      alertId: id,
      tenantId: input.tenantId,
      source: input.source,
      ruleType: input.ruleType,
      impactScore,
      urgency,
    });

    return {
      id,
      tenantId:        input.tenantId,
      source:          input.source,
      ruleType:        input.ruleType,
      title:           input.title,
      summary:         input.summary,
      impactScore,
      affectedModules,
      status:          'new',
      effectiveDate:   input.effectiveDate,
      createdAt,
    };
  }

  /**
   * List regulatory alerts for a tenant, optionally filtered by
   * status or source.
   */
  async listAlerts(
    tenantId: string,
    opts: { status?: AlertStatus; source?: RegulatorySource; limit?: number } = {},
  ): Promise<RegulatoryAlertRecord[]> {
    const rows = await this.prisma.regulatoryAlert.findMany({
      where: {
        tenantId,
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.source ? { source: opts.source } : {}),
      },
      orderBy: [{ impactScore: 'desc' }, { createdAt: 'desc' }],
      take: opts.limit ?? 100,
    });

    type RawRow = {
      id: string; tenantId: string; source: string; ruleType: string;
      title: string; summary: string; impactScore: number | null;
      affectedModules: unknown; status: string;
      reviewedBy: string | null; reviewedAt: Date | null;
      effectiveDate: Date | null; createdAt: Date;
    };

    return (rows as RawRow[]).map((r) => ({
      id:              r.id,
      tenantId:        r.tenantId,
      source:          r.source as RegulatorySource,
      ruleType:        r.ruleType as RuleType,
      title:           r.title,
      summary:         r.summary,
      impactScore:     r.impactScore ?? 0,
      affectedModules: (r.affectedModules as PlatformModule[]) ?? [],
      status:          r.status as AlertStatus,
      reviewedBy:      r.reviewedBy ?? undefined,
      reviewedAt:      r.reviewedAt ?? undefined,
      effectiveDate:   r.effectiveDate ?? undefined,
      createdAt:       r.createdAt,
    }));
  }

  /**
   * Mark an alert as reviewed (under_review | resolved | dismissed).
   */
  async reviewAlert(input: AlertReviewInput): Promise<RegulatoryAlertRecord> {
    const existing = await this.prisma.regulatoryAlert.findFirst({
      where: { id: input.alertId, tenantId: input.tenantId },
    });

    if (!existing) {
      throw new Error(`Regulatory alert ${input.alertId} not found for tenant ${input.tenantId}.`);
    }

    const now = new Date();

    const updated = await this.prisma.regulatoryAlert.update({
      where: { id: input.alertId },
      data: {
        status:     input.newStatus,
        reviewedBy: input.reviewedBy,
        reviewedAt: now,
      },
    });

    logger.info('Regulatory alert reviewed', {
      alertId: input.alertId,
      tenantId: input.tenantId,
      newStatus: input.newStatus,
      reviewedBy: input.reviewedBy,
    });

    return {
      id:              updated.id,
      tenantId:        updated.tenantId,
      source:          updated.source as RegulatorySource,
      ruleType:        updated.ruleType as RuleType,
      title:           updated.title,
      summary:         updated.summary,
      impactScore:     updated.impactScore ?? 0,
      affectedModules: (updated.affectedModules as unknown as PlatformModule[]) ?? [],
      status:          updated.status as AlertStatus,
      reviewedBy:      updated.reviewedBy ?? undefined,
      reviewedAt:      updated.reviewedAt ?? undefined,
      effectiveDate:   updated.effectiveDate ?? undefined,
      createdAt:       updated.createdAt,
    };
  }

  /**
   * Produce a detailed impact assessment for a given alert ID.
   */
  async getImpactAssessment(
    alertId: string,
    tenantId: string,
  ): Promise<ImpactAssessment> {
    const row = await this.prisma.regulatoryAlert.findFirst({
      where: { id: alertId, tenantId },
    });

    if (!row) {
      throw new Error(`Regulatory alert ${alertId} not found.`);
    }

    const affectedModules = (row.affectedModules as unknown as PlatformModule[]) ?? [];
    const impactScore = row.impactScore ?? 0;
    const urgency = scoreToUrgency(impactScore);
    const ruleType = row.ruleType as RuleType;

    const recommendedActions = recommendedActionsFor(ruleType, affectedModules);

    const rationale =
      `Source: ${row.source}. Rule type: ${ruleType.replace(/_/g, ' ')}. ` +
      `Impact score ${impactScore}/100 (${urgency}). ` +
      `${affectedModules.length} platform module(s) require review.`;

    return {
      ruleId:  alertId,
      impactScore,
      affectedModules,
      rationale,
      urgency,
      recommendedActions,
    };
  }

  /**
   * Ingest all stub feed entries for a tenant (used for initial
   * population / testing).  Skips items that would produce a
   * duplicate title for the same tenant.
   */
  async ingestStubFeed(tenantId: string): Promise<RegulatoryAlertRecord[]> {
    const created: RegulatoryAlertRecord[] = [];

    for (const item of STUB_REGULATORY_FEED) {
      // Check for existing alert with same title to avoid duplicates
      const existing = await this.prisma.regulatoryAlert.findFirst({
        where: { tenantId, title: item.title },
        select: { id: true },
      });
      if (existing) continue;

      const alert = await this.createAlert({
        tenantId,
        source:          item.source,
        ruleType:        item.ruleType,
        title:           item.title,
        summary:         item.summary,
        effectiveDate:   item.effectiveDate,
        impactScore:     item.impactScore,
        affectedModules: item.affectedModules,
      });
      created.push(alert);
    }

    logger.info('Stub regulatory feed ingested', {
      tenantId,
      ingested: created.length,
    });

    return created;
  }
}
