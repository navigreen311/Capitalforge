// ============================================================
// CapitalForge — Partner & Vendor Governance Service
//
// Core responsibilities:
//   1. Partner onboarding with due-diligence checklist
//   2. Vendor scorecard: compliance posture, complaint history
//   3. Subprocessor registry with DPA tracking
//   4. Annual renewal and re-certification workflow
//   5. Partner types: referral | broker | processor | attorney | accountant
//
// Scorecard dimensions (100-point scale):
//   - Compliance posture     (0-35)
//   - Complaint history      (0-25)
//   - Due-diligence status   (0-20)
//   - Contract & DPA         (0-20)
//
// Status lifecycle:
//   pending → under_review → active | rejected | suspended | terminated
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import logger from '../config/logger.js';

// ── Partner types ─────────────────────────────────────────────────

export type PartnerType = 'referral' | 'broker' | 'processor' | 'attorney' | 'accountant';

export type PartnerStatus =
  | 'pending'
  | 'under_review'
  | 'active'
  | 'rejected'
  | 'suspended'
  | 'terminated';

export type DueDiligenceStatus = 'pending' | 'in_progress' | 'passed' | 'failed' | 'waived';

// ── Due-diligence checklist ───────────────────────────────────────

export interface DueDiligenceChecklist {
  /** Entity verification (Secretary of State, EIN confirmation) */
  entityVerified: boolean;
  /** Background check on principals */
  backgroundCheckCompleted: boolean;
  /** E&O / professional liability insurance on file */
  insuranceVerified: boolean;
  /** Signed referral/broker/vendor agreement */
  agreementSigned: boolean;
  /** Data Processing Agreement (DPA) executed */
  dpaExecuted: boolean;
  /** Regulatory license/registration check (state broker license, etc.) */
  licenseVerified: boolean;
  /** OFAC / sanctions screen on entity and principals */
  sanctionsScreened: boolean;
  /** Reference checks (min 2 professional references) */
  referencesChecked: boolean;
  /** Conflicts-of-interest disclosure reviewed */
  conflictsReviewed: boolean;
  /** SOC 2 / security assessment for processors */
  securityAssessmentCompleted: boolean;
  /** Complaint-history review (BBB, CFPB portal, state AG) */
  complaintHistoryReviewed: boolean;
  /** Fee/compensation structure documented and approved */
  compensationApproved: boolean;
}

// ── Subprocessor registry ─────────────────────────────────────────

export interface SubprocessorRecord {
  id: string;
  partnerId: string;
  processorName: string;
  serviceDescription: string;
  dataCategories: string[];       // e.g. ['PII', 'financial', 'credit']
  dpaDocumentId: string | null;
  dpaExecutedAt: Date | null;
  dpaExpiresAt: Date | null;
  isActive: boolean;
  addedAt: Date;
  lastReviewedAt: Date | null;
}

// ── Vendor scorecard ──────────────────────────────────────────────

export interface VendorScorecardDimension {
  name: string;
  score: number;
  maxScore: number;
  notes: string[];
}

export interface VendorScorecard {
  partnerId: string;
  partnerName: string;
  partnerType: PartnerType;
  totalScore: number;         // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: VendorScorecardDimension[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendation: 'approve' | 'conditional_approval' | 'review_required' | 'reject';
  evaluatedAt: Date;
}

// ── Renewal workflow ──────────────────────────────────────────────

export interface RenewalWorkflow {
  id: string;
  partnerId: string;
  renewalYear: number;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  checklistSnapshot: DueDiligenceChecklist;
  scorecardSnapshot: VendorScorecard | null;
  reviewedBy: string | null;
  completedAt: Date | null;
  nextRenewalDate: Date;
  createdAt: Date;
}

// ── Partner onboarding input ──────────────────────────────────────

export interface OnboardPartnerInput {
  tenantId: string;
  name: string;
  type: PartnerType;
  contactEmail: string;
  contactName?: string;
  licenseNumber?: string;
  stateOfOperation?: string;
  checklist?: Partial<DueDiligenceChecklist>;
  metadata?: Record<string, unknown>;
}

export interface OnboardPartnerResult {
  partnerId: string;
  tenantId: string;
  name: string;
  type: PartnerType;
  status: PartnerStatus;
  dueDiligenceStatus: DueDiligenceStatus;
  checklist: DueDiligenceChecklist;
  nextReviewDate: Date;
  createdAt: Date;
}

// ── Partner review input ──────────────────────────────────────────

export interface PartnerReviewInput {
  tenantId: string;
  partnerId: string;
  reviewedBy: string;
  decision: 'approve' | 'reject' | 'suspend' | 'request_info';
  notes?: string;
  checklistUpdates?: Partial<DueDiligenceChecklist>;
  newStatus?: PartnerStatus;
}

// ── Helpers ───────────────────────────────────────────────────────

/** Returns a fully-blank due-diligence checklist. */
export function blankChecklist(): DueDiligenceChecklist {
  return {
    entityVerified:               false,
    backgroundCheckCompleted:     false,
    insuranceVerified:            false,
    agreementSigned:              false,
    dpaExecuted:                  false,
    licenseVerified:              false,
    sanctionsScreened:            false,
    referencesChecked:            false,
    conflictsReviewed:            false,
    securityAssessmentCompleted:  false,
    complaintHistoryReviewed:     false,
    compensationApproved:         false,
  };
}

/**
 * Merge a partial checklist override onto a base checklist.
 * Fields already true are never set back to false.
 */
export function mergeChecklist(
  base: DueDiligenceChecklist,
  overrides: Partial<DueDiligenceChecklist>,
): DueDiligenceChecklist {
  const result = { ...base };
  for (const key of Object.keys(overrides) as (keyof DueDiligenceChecklist)[]) {
    if (overrides[key] === true) result[key] = true;
  }
  return result;
}

/** Derive DueDiligenceStatus from a completed checklist. */
export function deriveDDStatus(checklist: DueDiligenceChecklist): DueDiligenceStatus {
  const keys = Object.keys(checklist) as (keyof DueDiligenceChecklist)[];
  const completedCount = keys.filter((k) => checklist[k]).length;

  if (completedCount === 0) return 'pending';
  if (completedCount < keys.length) return 'in_progress';
  return 'passed';
}

/**
 * Compute a vendor scorecard from partner metadata.
 *
 * Scoring dimensions:
 *   - Compliance posture  (35 pts): license, entity, sanctions, DPA, security
 *   - Complaint history   (25 pts): assumed clean unless complaint data in metadata
 *   - Due-diligence       (20 pts): proportion of checklist items completed
 *   - Contract & DPA      (20 pts): agreement + DPA executed
 */
export function computeScorecard(params: {
  partnerId: string;
  partnerName: string;
  partnerType: PartnerType;
  checklist: DueDiligenceChecklist;
  metadata: Record<string, unknown>;
}): VendorScorecard {
  const { partnerId, partnerName, partnerType, checklist, metadata } = params;
  const dimensions: VendorScorecardDimension[] = [];

  // ── 1. Compliance posture (35 pts) ───────────────────────────
  {
    let score = 0;
    const notes: string[] = [];

    if (checklist.licenseVerified)     { score += 8;  notes.push('License/registration verified'); }
    else                               { notes.push('License verification outstanding'); }

    if (checklist.entityVerified)      { score += 8;  notes.push('Entity verified (SoS / EIN)'); }
    else                               { notes.push('Entity verification outstanding'); }

    if (checklist.sanctionsScreened)   { score += 8;  notes.push('OFAC/sanctions screen passed'); }
    else                               { notes.push('Sanctions screen not completed'); }

    if (checklist.backgroundCheckCompleted) { score += 6; notes.push('Background check completed'); }
    else                               { notes.push('Background check pending'); }

    if (checklist.securityAssessmentCompleted || partnerType !== 'processor') {
      score += 5;
      notes.push(
        partnerType === 'processor'
          ? 'Security assessment (SOC 2) completed'
          : 'Security assessment N/A for partner type',
      );
    } else {
      notes.push('Security assessment required for processors');
    }

    dimensions.push({ name: 'Compliance Posture', score, maxScore: 35, notes });
  }

  // ── 2. Complaint history (25 pts) ─────────────────────────────
  {
    let score = 25; // start clean; deduct for known complaints
    const notes: string[] = [];
    const complaintCount = Number(metadata.complaintCount ?? 0);
    const regulatoryActions = Number(metadata.regulatoryActions ?? 0);

    if (!checklist.complaintHistoryReviewed) {
      score -= 10;
      notes.push('Complaint history review not completed (-10)');
    } else {
      notes.push('Complaint history reviewed');
    }

    if (complaintCount > 10) {
      score -= 10;
      notes.push(`${complaintCount} complaint(s) on record — elevated (-10)`);
    } else if (complaintCount > 3) {
      score -= 5;
      notes.push(`${complaintCount} complaint(s) on record (-5)`);
    } else if (complaintCount > 0) {
      score -= 2;
      notes.push(`${complaintCount} complaint(s) on record (-2)`);
    }

    if (regulatoryActions > 0) {
      score -= Math.min(10, regulatoryActions * 5);
      notes.push(`${regulatoryActions} regulatory action(s) on record`);
    }

    dimensions.push({ name: 'Complaint History', score: Math.max(0, score), maxScore: 25, notes });
  }

  // ── 3. Due-diligence completion (20 pts) ──────────────────────
  {
    const keys = Object.keys(checklist) as (keyof DueDiligenceChecklist)[];
    const completedCount = keys.filter((k) => checklist[k]).length;
    const pct = completedCount / keys.length;
    const score = Math.round(pct * 20);
    const notes = [
      `${completedCount}/${keys.length} checklist items completed (${Math.round(pct * 100)}%)`,
    ];
    dimensions.push({ name: 'Due Diligence', score, maxScore: 20, notes });
  }

  // ── 4. Contract & DPA (20 pts) ────────────────────────────────
  {
    let score = 0;
    const notes: string[] = [];

    if (checklist.agreementSigned)  { score += 10; notes.push('Partner agreement signed'); }
    else                            { notes.push('Partner agreement not signed'); }

    if (checklist.dpaExecuted)      { score += 10; notes.push('Data Processing Agreement executed'); }
    else                            { notes.push('DPA not executed'); }

    dimensions.push({ name: 'Contract & DPA', score, maxScore: 20, notes });
  }

  // ── Totals ─────────────────────────────────────────────────────
  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
  const grade = totalScore >= 90 ? 'A'
              : totalScore >= 75 ? 'B'
              : totalScore >= 60 ? 'C'
              : totalScore >= 45 ? 'D'
              : 'F';

  const riskLevel = totalScore >= 80 ? 'low'
                  : totalScore >= 60 ? 'medium'
                  : totalScore >= 40 ? 'high'
                  : 'critical';

  const recommendation = totalScore >= 75 ? 'approve'
                       : totalScore >= 60 ? 'conditional_approval'
                       : totalScore >= 40 ? 'review_required'
                       : 'reject';

  return {
    partnerId,
    partnerName,
    partnerType,
    totalScore,
    grade,
    dimensions,
    riskLevel,
    recommendation,
    evaluatedAt: new Date(),
  };
}

/** Calculate the next annual review date (1 year from now). */
function nextAnnualReviewDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

// ── PartnerGovernanceService ──────────────────────────────────────

export class PartnerGovernanceService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Onboarding ────────────────────────────────────────────────

  /**
   * Onboard a new partner.
   * Creates a Partner record in pending/under_review status and initialises
   * the due-diligence checklist.
   */
  async onboardPartner(input: OnboardPartnerInput): Promise<OnboardPartnerResult> {
    const partnerId = uuidv4();
    const now = new Date();

    const checklist = mergeChecklist(
      blankChecklist(),
      input.checklist ?? {},
    );

    const ddStatus = deriveDDStatus(checklist);
    const initialStatus: PartnerStatus = ddStatus === 'passed' ? 'under_review' : 'pending';
    const nextReviewDate = nextAnnualReviewDate();

    const metadata: Record<string, unknown> = {
      ...(input.metadata ?? {}),
      contactEmail: input.contactEmail,
      contactName: input.contactName ?? null,
      licenseNumber: input.licenseNumber ?? null,
      stateOfOperation: input.stateOfOperation ?? null,
      checklist,
      complaintCount: 0,
      regulatoryActions: 0,
    };

    await this.prisma.partner.create({
      data: {
        id:                 partnerId,
        tenantId:           input.tenantId,
        name:               input.name,
        type:               input.type,
        status:             initialStatus,
        dueDiligenceStatus: ddStatus,
        onboardedAt:        now,
        nextReviewDate,
        metadata:           metadata as object,
      },
    });

    await eventBus.publish(input.tenantId, {
      eventType:     'partner.onboarded',
      aggregateType: 'partner',
      aggregateId:   partnerId,
      payload: {
        partnerId,
        name:    input.name,
        type:    input.type,
        status:  initialStatus,
        ddStatus,
      },
    });

    logger.info('Partner onboarded', { partnerId, tenantId: input.tenantId, type: input.type });

    return {
      partnerId,
      tenantId:           input.tenantId,
      name:               input.name,
      type:               input.type,
      status:             initialStatus,
      dueDiligenceStatus: ddStatus,
      checklist,
      nextReviewDate,
      createdAt:          now,
    };
  }

  // ── List partners ─────────────────────────────────────────────

  async listPartners(
    tenantId: string,
    filters?: { type?: PartnerType; status?: PartnerStatus },
  ) {
    return this.prisma.partner.findMany({
      where: {
        tenantId,
        ...(filters?.type   ? { type: filters.type }     : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Get single partner ────────────────────────────────────────

  async getPartner(partnerId: string, tenantId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, tenantId },
    });
    return partner;
  }

  // ── Update partner ────────────────────────────────────────────

  async updatePartner(
    partnerId: string,
    tenantId: string,
    updates: {
      name?: string;
      status?: PartnerStatus;
      metadata?: Record<string, unknown>;
    },
  ) {
    const existing = await this.prisma.partner.findFirst({
      where: { id: partnerId, tenantId },
    });
    if (!existing) return null;

    const merged: Record<string, unknown> = {
      ...((existing.metadata as Record<string, unknown>) ?? {}),
      ...(updates.metadata ?? {}),
    };

    return this.prisma.partner.update({
      where: { id: partnerId },
      data: {
        ...(updates.name   ? { name: updates.name }     : {}),
        ...(updates.status ? { status: updates.status } : {}),
        metadata:  merged as object,
        updatedAt: new Date(),
      },
    });
  }

  // ── Scorecard ─────────────────────────────────────────────────

  /**
   * Compute and return the current vendor scorecard for a partner.
   * Persists the score back to the partner record.
   */
  async getScorecard(partnerId: string, tenantId: string): Promise<VendorScorecard | null> {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, tenantId },
    });
    if (!partner) return null;

    const meta = (partner.metadata as Record<string, unknown>) ?? {};
    const checklist: DueDiligenceChecklist = (meta.checklist as DueDiligenceChecklist) ?? blankChecklist();

    const scorecard = computeScorecard({
      partnerId,
      partnerName:  partner.name,
      partnerType:  partner.type as PartnerType,
      checklist,
      metadata:     meta,
    });

    // Persist score
    await this.prisma.partner.update({
      where: { id: partnerId },
      data: { complianceScore: scorecard.totalScore, updatedAt: new Date() },
    });

    return scorecard;
  }

  // ── Review & decision ─────────────────────────────────────────

  /**
   * Submit a review decision on a partner.
   * Updates status and checklist; emits a ledger event.
   */
  async reviewPartner(input: PartnerReviewInput): Promise<{
    partnerId: string;
    newStatus: PartnerStatus;
    scorecard: VendorScorecard | null;
  }> {
    const partner = await this.prisma.partner.findFirst({
      where: { id: input.partnerId, tenantId: input.tenantId },
    });
    if (!partner) throw new Error(`Partner ${input.partnerId} not found`);

    const meta = (partner.metadata as Record<string, unknown>) ?? {};
    const existingChecklist: DueDiligenceChecklist =
      (meta.checklist as DueDiligenceChecklist) ?? blankChecklist();

    const updatedChecklist = input.checklistUpdates
      ? mergeChecklist(existingChecklist, input.checklistUpdates)
      : existingChecklist;

    const ddStatus = deriveDDStatus(updatedChecklist);

    let newStatus: PartnerStatus = partner.status as PartnerStatus;
    if (input.newStatus) {
      newStatus = input.newStatus;
    } else {
      if (input.decision === 'approve') newStatus = 'active';
      else if (input.decision === 'reject') newStatus = 'rejected';
      else if (input.decision === 'suspend') newStatus = 'suspended';
    }

    const updatedMeta: Record<string, unknown> = {
      ...meta,
      checklist: updatedChecklist,
      lastReviewedBy: input.reviewedBy,
      lastReviewNotes: input.notes ?? null,
      lastReviewDecision: input.decision,
      lastReviewedAt: new Date().toISOString(),
    };

    await this.prisma.partner.update({
      where: { id: input.partnerId },
      data: {
        status:             newStatus,
        dueDiligenceStatus: ddStatus,
        metadata:           updatedMeta as object,
        updatedAt:          new Date(),
      },
    });

    await eventBus.publish(input.tenantId, {
      eventType:     'partner.reviewed',
      aggregateType: 'partner',
      aggregateId:   input.partnerId,
      payload: {
        partnerId:  input.partnerId,
        decision:   input.decision,
        newStatus,
        reviewedBy: input.reviewedBy,
      },
    });

    const scorecard = await this.getScorecard(input.partnerId, input.tenantId);

    logger.info('Partner reviewed', {
      partnerId:  input.partnerId,
      tenantId:   input.tenantId,
      decision:   input.decision,
      newStatus,
      reviewedBy: input.reviewedBy,
    });

    return { partnerId: input.partnerId, newStatus, scorecard };
  }

  // ── Annual renewal workflow ───────────────────────────────────

  /**
   * Initiate an annual renewal for a partner.
   * Creates a renewal record and resets the review cycle.
   */
  async initiateRenewal(
    partnerId: string,
    tenantId: string,
  ): Promise<RenewalWorkflow> {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, tenantId },
    });
    if (!partner) throw new Error(`Partner ${partnerId} not found`);

    const meta = (partner.metadata as Record<string, unknown>) ?? {};
    const existingChecklist = (meta.checklist as DueDiligenceChecklist) ?? blankChecklist();
    const renewalYear = new Date().getFullYear();
    const nextRenewalDate = nextAnnualReviewDate();
    const renewalId = uuidv4();

    const scorecard = computeScorecard({
      partnerId,
      partnerName:  partner.name,
      partnerType:  partner.type as PartnerType,
      checklist:    existingChecklist,
      metadata:     meta,
    });

    const renewalRecord: RenewalWorkflow = {
      id:                renewalId,
      partnerId,
      renewalYear,
      status:            'pending',
      checklistSnapshot: existingChecklist,
      scorecardSnapshot: scorecard,
      reviewedBy:        null,
      completedAt:       null,
      nextRenewalDate,
      createdAt:         new Date(),
    };

    const renewalHistory: RenewalWorkflow[] = [
      ...((meta.renewalHistory as RenewalWorkflow[]) ?? []),
      renewalRecord,
    ];

    await this.prisma.partner.update({
      where: { id: partnerId },
      data: {
        nextReviewDate: nextRenewalDate,
        status:         'under_review',
        metadata: {
          ...meta,
          renewalHistory,
          currentRenewalId: renewalId,
        } as object,
        updatedAt: new Date(),
      },
    });

    await eventBus.publish(tenantId, {
      eventType:     'partner.renewal.initiated',
      aggregateType: 'partner',
      aggregateId:   partnerId,
      payload: { partnerId, renewalYear, renewalId },
    });

    logger.info('Partner renewal initiated', { partnerId, tenantId, renewalYear });

    return renewalRecord;
  }

  /**
   * Complete an annual renewal.
   * Restores active status and logs completion.
   */
  async completeRenewal(
    partnerId: string,
    tenantId: string,
    reviewedBy: string,
    approved: boolean,
  ): Promise<RenewalWorkflow | null> {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, tenantId },
    });
    if (!partner) return null;

    const meta = (partner.metadata as Record<string, unknown>) ?? {};
    const renewalHistory: RenewalWorkflow[] = (meta.renewalHistory as RenewalWorkflow[]) ?? [];
    const currentId = meta.currentRenewalId as string | undefined;
    const renewalIdx = renewalHistory.findIndex((r) => r.id === currentId);

    if (renewalIdx === -1) return null;

    renewalHistory[renewalIdx] = {
      ...renewalHistory[renewalIdx],
      status:      approved ? 'completed' : 'overdue',
      reviewedBy,
      completedAt: new Date(),
    };

    const newStatus: PartnerStatus = approved ? 'active' : 'suspended';

    await this.prisma.partner.update({
      where: { id: partnerId },
      data: {
        status: newStatus,
        metadata: { ...meta, renewalHistory } as object,
        updatedAt: new Date(),
      },
    });

    await eventBus.publish(tenantId, {
      eventType:     'partner.renewal.completed',
      aggregateType: 'partner',
      aggregateId:   partnerId,
      payload: { partnerId, renewalId: currentId, approved, reviewedBy },
    });

    return renewalHistory[renewalIdx];
  }

  // ── Subprocessor registry ─────────────────────────────────────

  /**
   * Register a subprocessor under a partner.
   */
  async registerSubprocessor(
    partnerId: string,
    tenantId: string,
    record: Omit<SubprocessorRecord, 'id' | 'partnerId' | 'addedAt' | 'lastReviewedAt'>,
  ): Promise<SubprocessorRecord> {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, tenantId },
    });
    if (!partner) throw new Error(`Partner ${partnerId} not found`);

    const meta = (partner.metadata as Record<string, unknown>) ?? {};
    const subprocessors: SubprocessorRecord[] = (meta.subprocessors as SubprocessorRecord[]) ?? [];

    const newRecord: SubprocessorRecord = {
      id:           uuidv4(),
      partnerId,
      addedAt:      new Date(),
      lastReviewedAt: null,
      ...record,
    };

    subprocessors.push(newRecord);

    await this.prisma.partner.update({
      where: { id: partnerId },
      data: { metadata: { ...meta, subprocessors } as object, updatedAt: new Date() },
    });

    logger.info('Subprocessor registered', { partnerId, tenantId, processorName: record.processorName });

    return newRecord;
  }

  /**
   * List all subprocessors for a partner.
   */
  async listSubprocessors(partnerId: string, tenantId: string): Promise<SubprocessorRecord[]> {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, tenantId },
    });
    if (!partner) return [];

    const meta = (partner.metadata as Record<string, unknown>) ?? {};
    return (meta.subprocessors as SubprocessorRecord[]) ?? [];
  }
}
