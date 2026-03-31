// ============================================================
// CapitalForge — Regulator Response Service
//
// Responsibilities:
//   1. Regulator inquiry intake with four-type classification
//      (FTC | CFPB | state_AG | audit)
//   2. Legal-hold mode: document preservation across all related
//      Document vault records for the business
//   3. One-click compliance dossier export (structured JSON bundle
//      containing all relevant docs, complaints, consents, etc.)
//   4. Response deadline tracking with automated escalation events
//      at T-14, T-7, and T-1 day thresholds
//
// All state transitions emit ledger events.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';

// ── Regulator inquiry types ────────────────────────────────────────

export type RegulatoryMatterType = 'FTC' | 'CFPB' | 'state_AG' | 'audit';

export type InquiryStatus =
  | 'open'
  | 'legal_hold'
  | 'response_drafted'
  | 'response_submitted'
  | 'closed';

export type InquirySeverity = 'routine' | 'elevated' | 'critical';

// ── Legal-hold record ──────────────────────────────────────────────

export interface LegalHoldSummary {
  activatedAt: Date;
  activatedBy?: string;
  documentCount: number;
  preservedDocumentIds: string[];
  businessId?: string | null;
}

// ── Dossier export ─────────────────────────────────────────────────

export interface ComplianceDossier {
  exportId: string;
  inquiryId: string;
  tenantId: string;
  businessId?: string | null;
  matterType: RegulatoryMatterType;
  generatedAt: Date;
  generatedBy?: string;
  sections: {
    inquiryDetails: RegulatorInquiryRecord;
    documents: DossierDocument[];
    complaints: DossierComplaint[];
    consentRecords: DossierConsent[];
    complianceChecks: DossierComplianceCheck[];
    achAuthorizations: DossierAchAuth[];
    legalHoldSummary?: LegalHoldSummary;
  };
  totalDocuments: number;
  exportFormat: 'json';
}

interface DossierDocument {
  id: string;
  documentType: string;
  title: string;
  storageKey: string;
  createdAt: Date;
  legalHold: boolean;
  sha256Hash?: string | null;
  cryptoTimestamp?: string | null;
}

interface DossierComplaint {
  id: string;
  category: string;
  status: string;
  severity: string;
  description: string;
  createdAt: Date;
  resolvedAt?: Date | null;
}

interface DossierConsent {
  id: string;
  channel: string;
  consentType: string;
  status: string;
  grantedAt: Date;
  revokedAt?: Date | null;
  evidenceRef?: string | null;
}

interface DossierComplianceCheck {
  id: string;
  checkType: string;
  riskScore?: number | null;
  riskLevel?: string | null;
  createdAt: Date;
}

interface DossierAchAuth {
  id: string;
  processorName: string;
  status: string;
  authorizedAt: Date;
  revokedAt?: Date | null;
}

// ── Deadline tracking ──────────────────────────────────────────────

export interface DeadlineStatus {
  daysUntilDeadline: number;
  isOverdue: boolean;
  escalationLevel: 'none' | 'warning' | 'urgent' | 'critical';
  nextEscalationAt?: Date;
}

// ── Input / output types ───────────────────────────────────────────

export interface CreateInquiryInput {
  tenantId: string;
  businessId?: string;
  matterType: RegulatoryMatterType;
  referenceNumber?: string;
  agencyName: string;
  description: string;
  severity?: InquirySeverity;
  responseDueDate?: Date;
  assignedCounsel?: string;
  assignedTo?: string;
}

export interface UpdateInquiryInput {
  status?: InquiryStatus;
  severity?: InquirySeverity;
  responseDueDate?: Date;
  assignedCounsel?: string;
  assignedTo?: string;
  responseNotes?: string;
  resolution?: string;
}

export interface RegulatorInquiryRecord {
  id: string;
  tenantId: string;
  businessId?: string | null;
  matterType: RegulatoryMatterType;
  referenceNumber?: string | null;
  agencyName: string;
  description: string;
  severity: InquirySeverity;
  status: InquiryStatus;
  responseDueDate?: Date | null;
  assignedCounsel?: string | null;
  assignedTo?: string | null;
  responseNotes?: string | null;
  resolution?: string | null;
  legalHoldActivatedAt?: Date | null;
  legalHoldActivatedBy?: string | null;
  closedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deadlineStatus?: DeadlineStatus;
}

export interface InquiryListResult {
  inquiries: RegulatorInquiryRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InquiryListFilters {
  tenantId: string;
  matterType?: RegulatoryMatterType;
  status?: InquiryStatus;
  page?: number;
  pageSize?: number;
}

// ── Event types ────────────────────────────────────────────────────

const REGULATOR_EVENTS = {
  INQUIRY_CREATED:      'regulator.inquiry.created',
  LEGAL_HOLD_ACTIVATED: 'regulator.legal_hold.activated',
  STATUS_CHANGED:       'regulator.inquiry.status_changed',
  DEADLINE_WARNING:     'regulator.deadline.warning',
  DOSSIER_EXPORTED:     'regulator.dossier.exported',
  INQUIRY_CLOSED:       'regulator.inquiry.closed',
} as const;

// ── RegulatorResponseService ───────────────────────────────────────

export class RegulatorResponseService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Create inquiry ──────────────────────────────────────────────

  async createInquiry(input: CreateInquiryInput): Promise<RegulatorInquiryRecord> {
    const id = uuidv4();

    // Validate classification
    const matterType = this._classifyMatter(input.matterType, input.agencyName);
    const severity   = input.severity ?? this._inferSeverity(matterType);

    // Persist to RegulatoryAlert model (re-use existing schema table)
    const row = await this.prisma.regulatoryAlert.create({
      data: {
        id,
        tenantId:    input.tenantId,
        source:      input.agencyName,
        ruleType:    matterType,
        title:       `${matterType} Inquiry — ${input.referenceNumber ?? id.slice(0, 8)}`,
        summary:     input.description,
        impactScore: this._severityToScore(severity),
        status:      'open',
        metadata: {
          businessId:       input.businessId ?? null,
          matterType,
          referenceNumber:  input.referenceNumber ?? null,
          severity,
          responseDueDate:  input.responseDueDate?.toISOString() ?? null,
          assignedCounsel:  input.assignedCounsel ?? null,
          assignedTo:       input.assignedTo      ?? null,
          responseNotes:    null,
          resolution:       null,
          legalHoldActivatedAt:  null,
          legalHoldActivatedBy:  null,
          closedAt:              null,
        } as object,
      },
    });

    await eventBus.publish(input.tenantId, {
      eventType:     REGULATOR_EVENTS.INQUIRY_CREATED,
      aggregateType: 'regulatory_inquiry',
      aggregateId:   id,
      payload: {
        matterType,
        agencyName: input.agencyName,
        severity,
        businessId: input.businessId,
      },
    });

    return this._toRecord(row);
  }

  // ── List inquiries ──────────────────────────────────────────────

  async listInquiries(filters: InquiryListFilters): Promise<InquiryListResult> {
    const page     = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const skip     = (page - 1) * pageSize;

    // Build where clause — filter on base fields and JSON metadata
    const where: Record<string, unknown> = { tenantId: filters.tenantId };
    if (filters.matterType) where['ruleType'] = filters.matterType;
    if (filters.status)     where['status']   = filters.status;

    const [rows, total] = await Promise.all([
      this.prisma.regulatoryAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.regulatoryAlert.count({ where }),
    ]);

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inquiries: rows.map((r: any) => this._toRecord(r)),
      total,
      page,
      pageSize,
    };
  }

  // ── Get single inquiry ──────────────────────────────────────────

  async getInquiry(id: string, tenantId: string): Promise<RegulatorInquiryRecord | null> {
    const row = await this.prisma.regulatoryAlert.findFirst({
      where: { id, tenantId },
    });
    return row ? this._toRecord(row) : null;
  }

  // ── Update inquiry ──────────────────────────────────────────────

  async updateInquiry(
    id: string,
    tenantId: string,
    update: UpdateInquiryInput,
  ): Promise<RegulatorInquiryRecord> {
    const existing = await this.prisma.regulatoryAlert.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new Error(`Regulator inquiry ${id} not found.`);

    const meta = (existing.metadata as Record<string, unknown>) ?? {};

    const newStatus = update.status ?? (existing.status as InquiryStatus);
    const closedAt =
      newStatus === 'closed' && meta['closedAt'] === null
        ? new Date().toISOString()
        : (meta['closedAt'] ?? null);

    const updatedMeta: Record<string, unknown> = {
      ...meta,
      ...(update.severity        !== undefined && { severity:        update.severity }),
      ...(update.responseDueDate !== undefined && { responseDueDate: update.responseDueDate.toISOString() }),
      ...(update.assignedCounsel !== undefined && { assignedCounsel: update.assignedCounsel }),
      ...(update.assignedTo      !== undefined && { assignedTo:      update.assignedTo }),
      ...(update.responseNotes   !== undefined && { responseNotes:   update.responseNotes }),
      ...(update.resolution      !== undefined && { resolution:      update.resolution }),
      closedAt,
    };

    const updated = await this.prisma.regulatoryAlert.update({
      where: { id },
      data: {
        ...(update.status !== undefined && { status: update.status }),
        metadata: updatedMeta as object,
      },
    });

    if (update.status && update.status !== existing.status) {
      const eventType =
        update.status === 'closed'
          ? REGULATOR_EVENTS.INQUIRY_CLOSED
          : REGULATOR_EVENTS.STATUS_CHANGED;

      await eventBus.publish(tenantId, {
        eventType,
        aggregateType: 'regulatory_inquiry',
        aggregateId:   id,
        payload: {
          previousStatus: existing.status,
          newStatus:      update.status,
          matterType:     existing.ruleType,
        },
      });
    }

    return this._toRecord(updated);
  }

  // ── Legal hold activation ───────────────────────────────────────

  /**
   * Activate legal hold: marks all Document vault records for the
   * associated business as legalHold=true, preventing deletion.
   * Returns a summary of preserved documents.
   */
  async activateLegalHold(
    inquiryId: string,
    tenantId: string,
    activatedBy?: string,
  ): Promise<LegalHoldSummary> {
    const inquiry = await this.prisma.regulatoryAlert.findFirst({
      where: { id: inquiryId, tenantId },
    });
    if (!inquiry) throw new Error(`Regulator inquiry ${inquiryId} not found.`);

    const meta       = (inquiry.metadata as Record<string, unknown>) ?? {};
    const businessId = (meta['businessId'] as string | null) ?? null;

    const activatedAt = new Date();

    // Preserve all related documents
    let preservedDocumentIds: string[] = [];
    if (businessId) {
      const docs = await this.prisma.document.findMany({
        where: { tenantId, businessId },
        select: { id: true },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      preservedDocumentIds = docs.map((d: any) => d.id as string);

      if (preservedDocumentIds.length > 0) {
        await this.prisma.document.updateMany({
          where: { id: { in: preservedDocumentIds } },
          data:  { legalHold: true },
        });
      }
    }

    // Persist hold metadata on the inquiry
    await this.prisma.regulatoryAlert.update({
      where: { id: inquiryId },
      data: {
        status:   'legal_hold',
        metadata: {
          ...meta,
          legalHoldActivatedAt: activatedAt.toISOString(),
          legalHoldActivatedBy: activatedBy ?? null,
        } as object,
      },
    });

    await eventBus.publish(tenantId, {
      eventType:     REGULATOR_EVENTS.LEGAL_HOLD_ACTIVATED,
      aggregateType: 'regulatory_inquiry',
      aggregateId:   inquiryId,
      payload: {
        businessId,
        documentCount:        preservedDocumentIds.length,
        activatedBy,
      },
    });

    return {
      activatedAt,
      activatedBy,
      documentCount:        preservedDocumentIds.length,
      preservedDocumentIds,
      businessId,
    };
  }

  // ── Compliance dossier export ───────────────────────────────────

  /**
   * Build a one-click compliance dossier containing all artefacts
   * relevant to the regulator inquiry.
   */
  async exportDossier(
    inquiryId: string,
    tenantId: string,
    requestedBy?: string,
  ): Promise<ComplianceDossier> {
    const inquiry = await this.prisma.regulatoryAlert.findFirst({
      where: { id: inquiryId, tenantId },
    });
    if (!inquiry) throw new Error(`Regulator inquiry ${inquiryId} not found.`);

    const meta       = (inquiry.metadata as Record<string, unknown>) ?? {};
    const businessId = (meta['businessId'] as string | null) ?? null;
    const inquiryRecord = this._toRecord(inquiry);

    // ── Pull all related artefacts in parallel ───────────────────
    const [documents, complaints, consentRecords, complianceChecks, achAuths] =
      await Promise.all([
        businessId
          ? this.prisma.document.findMany({
              where: { tenantId, businessId },
              orderBy: { createdAt: 'asc' },
            })
          : Promise.resolve([]),

        businessId
          ? this.prisma.complaint.findMany({
              where: { tenantId, businessId },
              orderBy: { createdAt: 'asc' },
            })
          : Promise.resolve([]),

        businessId
          ? this.prisma.consentRecord.findMany({
              where: { tenantId, businessId },
              orderBy: { grantedAt: 'asc' },
            })
          : Promise.resolve([]),

        businessId
          ? this.prisma.complianceCheck.findMany({
              where: { tenantId, businessId },
              orderBy: { createdAt: 'asc' },
            })
          : Promise.resolve([]),

        businessId
          ? this.prisma.achAuthorization.findMany({
              where: { businessId },
              orderBy: { authorizedAt: 'asc' },
            })
          : Promise.resolve([]),
      ]);

    // ── Legal hold summary if active ─────────────────────────────
    let legalHoldSummary: LegalHoldSummary | undefined;
    if (meta['legalHoldActivatedAt']) {
      legalHoldSummary = {
        activatedAt:          new Date(meta['legalHoldActivatedAt'] as string),
        activatedBy:          (meta['legalHoldActivatedBy'] as string) ?? undefined,
        documentCount:        documents.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        preservedDocumentIds: documents.map((d: any) => d.id as string),
        businessId,
      };
    }

    const exportId = uuidv4();

    await eventBus.publish(tenantId, {
      eventType:     REGULATOR_EVENTS.DOSSIER_EXPORTED,
      aggregateType: 'regulatory_inquiry',
      aggregateId:   inquiryId,
      payload: {
        exportId,
        generatedBy:   requestedBy,
        documentCount: documents.length,
      },
    });

    return {
      exportId,
      inquiryId,
      tenantId,
      businessId,
      matterType:  inquiry.ruleType as RegulatoryMatterType,
      generatedAt: new Date(),
      generatedBy: requestedBy,
      sections: {
        inquiryDetails: inquiryRecord,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        documents: documents.map((d: any) => ({
          id:              d.id,
          documentType:    d.documentType,
          title:           d.title,
          storageKey:      d.storageKey,
          createdAt:       d.createdAt,
          legalHold:       d.legalHold,
          sha256Hash:      d.sha256Hash ?? null,
          cryptoTimestamp: d.cryptoTimestamp ?? null,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        complaints: complaints.map((c: any) => ({
          id:          c.id,
          category:    c.category,
          status:      c.status,
          severity:    c.severity,
          description: c.description,
          createdAt:   c.createdAt,
          resolvedAt:  c.resolvedAt ?? null,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        consentRecords: consentRecords.map((cr: any) => ({
          id:          cr.id,
          channel:     cr.channel,
          consentType: cr.consentType,
          status:      cr.status,
          grantedAt:   cr.grantedAt,
          revokedAt:   cr.revokedAt ?? null,
          evidenceRef: cr.evidenceRef ?? null,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        complianceChecks: complianceChecks.map((cc: any) => ({
          id:         cc.id,
          checkType:  cc.checkType,
          riskScore:  cc.riskScore ?? null,
          riskLevel:  cc.riskLevel ?? null,
          createdAt:  cc.createdAt,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        achAuthorizations: achAuths.map((a: any) => ({
          id:            a.id,
          processorName: a.processorName,
          status:        a.status,
          authorizedAt:  a.authorizedAt,
          revokedAt:     a.revokedAt ?? null,
        })),
        legalHoldSummary,
      },
      totalDocuments: documents.length,
      exportFormat:   'json',
    };
  }

  // ── Deadline tracking ───────────────────────────────────────────

  /**
   * Check deadline status and emit escalation events for inquiries
   * approaching their response deadline. Call this from a scheduled job.
   */
  async checkDeadlines(tenantId: string): Promise<{
    checked: number;
    escalated: RegulatorInquiryRecord[];
  }> {
    const openInquiries = await this.prisma.regulatoryAlert.findMany({
      where: {
        tenantId,
        status: { notIn: ['closed'] },
      },
    });

    const escalated: RegulatorInquiryRecord[] = [];

    for (const row of openInquiries) {
      const meta = (row.metadata as Record<string, unknown>) ?? {};
      const dueDateStr = meta['responseDueDate'] as string | undefined;
      if (!dueDateStr) continue;

      const dueDate = new Date(dueDateStr);
      const now     = new Date();
      const msUntil = dueDate.getTime() - now.getTime();
      const daysUntil = msUntil / (1000 * 60 * 60 * 24);

      // Escalation thresholds: 14, 7, 1 days
      const threshold =
        daysUntil <= 1  ? 'critical' :
        daysUntil <= 7  ? 'urgent'   :
        daysUntil <= 14 ? 'warning'  : 'none';

      if (threshold !== 'none') {
        await eventBus.publish(tenantId, {
          eventType:     REGULATOR_EVENTS.DEADLINE_WARNING,
          aggregateType: 'regulatory_inquiry',
          aggregateId:   row.id,
          payload: {
            daysUntilDeadline: Math.ceil(daysUntil),
            escalationLevel:   threshold,
            matterType:        row.ruleType,
            agencyName:        row.source,
            assignedTo:        meta['assignedTo'],
            assignedCounsel:   meta['assignedCounsel'],
          },
        });

        escalated.push(this._toRecord(row));
      }
    }

    return { checked: openInquiries.length, escalated };
  }

  // ── Private helpers ─────────────────────────────────────────────

  private _classifyMatter(
    supplied: RegulatoryMatterType,
    agencyName: string,
  ): RegulatoryMatterType {
    const lower = agencyName.toLowerCase();
    if (lower.includes('ftc') || lower.includes('federal trade'))    return 'FTC';
    if (lower.includes('cfpb') || lower.includes('consumer finance')) return 'CFPB';
    if (lower.includes('attorney general') || lower.includes(' ag ')) return 'state_AG';
    if (lower.includes('audit'))                                      return 'audit';
    return supplied;
  }

  private _inferSeverity(matterType: RegulatoryMatterType): InquirySeverity {
    if (matterType === 'FTC' || matterType === 'CFPB') return 'critical';
    if (matterType === 'state_AG')                      return 'elevated';
    return 'routine';
  }

  private _severityToScore(severity: InquirySeverity): number {
    return severity === 'critical' ? 90 : severity === 'elevated' ? 60 : 30;
  }

  private _computeDeadlineStatus(responseDueDate: Date | null): DeadlineStatus {
    if (!responseDueDate) {
      return { daysUntilDeadline: Infinity, isOverdue: false, escalationLevel: 'none' };
    }

    const now       = new Date();
    const msUntil   = responseDueDate.getTime() - now.getTime();
    const daysUntil = msUntil / (1000 * 60 * 60 * 24);
    const isOverdue = daysUntil < 0;

    const escalationLevel =
      isOverdue        ? 'critical' :
      daysUntil <= 1   ? 'critical' :
      daysUntil <= 7   ? 'urgent'   :
      daysUntil <= 14  ? 'warning'  : 'none';

    const nextEscalationAt =
      escalationLevel === 'none'
        ? new Date(responseDueDate.getTime() - 14 * 24 * 60 * 60 * 1000)
        : undefined;

    return {
      daysUntilDeadline: Math.ceil(daysUntil),
      isOverdue,
      escalationLevel,
      nextEscalationAt,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _toRecord(row: any): RegulatorInquiryRecord {
    const meta = (row.metadata as Record<string, unknown>) ?? {};

    const responseDueDate = meta['responseDueDate']
      ? new Date(meta['responseDueDate'] as string)
      : null;

    return {
      id:              row.id,
      tenantId:        row.tenantId,
      businessId:      (meta['businessId'] as string | null) ?? null,
      matterType:      (meta['matterType'] ?? row.ruleType) as RegulatoryMatterType,
      referenceNumber: (meta['referenceNumber'] as string | null) ?? null,
      agencyName:      row.source,
      description:     row.summary,
      severity:        (meta['severity'] as InquirySeverity) ?? 'routine',
      status:          row.status as InquiryStatus,
      responseDueDate,
      assignedCounsel: (meta['assignedCounsel'] as string | null) ?? null,
      assignedTo:      (meta['assignedTo']      as string | null) ?? null,
      responseNotes:   (meta['responseNotes']   as string | null) ?? null,
      resolution:      (meta['resolution']      as string | null) ?? null,
      legalHoldActivatedAt: meta['legalHoldActivatedAt']
        ? new Date(meta['legalHoldActivatedAt'] as string)
        : null,
      legalHoldActivatedBy: (meta['legalHoldActivatedBy'] as string | null) ?? null,
      closedAt: meta['closedAt']
        ? new Date(meta['closedAt'] as string)
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt ?? row.createdAt,
      deadlineStatus: this._computeDeadlineStatus(responseDueDate),
    };
  }
}
