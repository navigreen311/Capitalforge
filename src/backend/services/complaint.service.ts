// ============================================================
// CapitalForge — Complaint & Remediation Service
//
// Responsibilities:
//   1. Complaint intake with five-category classification
//      (billing | service | unauthorized_debit | compliance | other)
//   2. Unauthorized-debit case workflow with evidence bundle
//      auto-attached from AchAuthorization + DebitEvent records
//   3. Call-record auto-attachment on intake
//   4. Root-cause analysis dashboard data aggregation
//   5. Full lifecycle management:
//      open → investigating → resolved → closed
//
// All state transitions are validated and emit ledger events.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';

// ── Category & lifecycle types ─────────────────────────────────────

export type ComplaintCategory =
  | 'billing'
  | 'service'
  | 'unauthorized_debit'
  | 'compliance'
  | 'other';

export type ComplaintStatus =
  | 'open'
  | 'investigating'
  | 'resolved'
  | 'closed';

export type ComplaintSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ComplaintSource =
  | 'portal'
  | 'email'
  | 'phone'
  | 'regulator_referral'
  | 'legal'
  | 'other';

// ── Evidence bundle ────────────────────────────────────────────────

export interface EvidenceItem {
  id: string;
  type: 'document' | 'call_record' | 'debit_event' | 'screenshot' | 'other';
  referenceId: string;
  title: string;
  addedAt: Date;
  addedBy?: string;
  notes?: string;
}

export interface UnauthorizedDebitBundle {
  achAuthorizationId: string;
  processorName: string;
  authorizedAmount?: number;
  authorizedFrequency?: string;
  debitEvents: Array<{
    id: string;
    amount: number;
    processedAt: Date;
    flagged: boolean;
    flagReason?: string | null;
    isWithinTolerance: boolean;
  }>;
  authorizationStatus: string;
  signedDocumentRef?: string | null;
}

// ── Input / output types ───────────────────────────────────────────

export interface CreateComplaintInput {
  tenantId: string;
  businessId?: string;
  category: ComplaintCategory;
  subcategory?: string;
  source: ComplaintSource;
  severity?: ComplaintSeverity;
  description: string;
  assignedTo?: string;
  /** Caller-supplied evidence doc / call record IDs to attach immediately */
  initialEvidenceDocIds?: string[];
  initialCallRecordIds?: string[];
}

export interface UpdateComplaintInput {
  status?: ComplaintStatus;
  severity?: ComplaintSeverity;
  assignedTo?: string;
  escalatedTo?: string;
  rootCause?: string;
  resolution?: string;
  subcategory?: string;
}

export interface AttachEvidenceInput {
  complaintId: string;
  tenantId: string;
  evidenceItems: Array<{
    type: EvidenceItem['type'];
    referenceId: string;
    title: string;
    notes?: string;
  }>;
  addedBy?: string;
}

export interface ComplaintRecord {
  id: string;
  tenantId: string;
  businessId?: string | null;
  category: ComplaintCategory;
  subcategory?: string | null;
  source: ComplaintSource;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  description: string;
  evidenceDocIds: string[];
  callRecordIds: string[];
  evidenceBundle?: EvidenceItem[];
  unauthorizedDebitBundle?: UnauthorizedDebitBundle;
  rootCause?: string | null;
  resolution?: string | null;
  assignedTo?: string | null;
  escalatedTo?: string | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplaintListResult {
  complaints: ComplaintRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ComplaintListFilters {
  tenantId: string;
  businessId?: string;
  category?: ComplaintCategory;
  status?: ComplaintStatus;
  severity?: ComplaintSeverity;
  page?: number;
  pageSize?: number;
}

// ── Root-cause analytics ───────────────────────────────────────────

export interface RootCauseAnalytics {
  tenantId: string;
  generatedAt: Date;
  totalComplaints: number;
  byCategory: Record<ComplaintCategory, number>;
  byStatus: Record<ComplaintStatus, number>;
  bySeverity: Record<ComplaintSeverity, number>;
  topRootCauses: Array<{ rootCause: string; count: number }>;
  averageResolutionDays: number | null;
  openCritical: number;
  unauthorizedDebitOpenCount: number;
  recentTrend: Array<{ month: string; count: number }>;
}

// ── Valid lifecycle transitions ────────────────────────────────────

const VALID_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  open:          ['investigating', 'closed'],
  investigating: ['resolved', 'open'],
  resolved:      ['closed', 'investigating'],
  closed:        [],
};

// ── Event types ────────────────────────────────────────────────────

const COMPLAINT_EVENTS = {
  CREATED:           'complaint.created',
  STATUS_CHANGED:    'complaint.status_changed',
  EVIDENCE_ATTACHED: 'complaint.evidence_attached',
  ESCALATED:         'complaint.escalated',
  RESOLVED:          'complaint.resolved',
  CLOSED:            'complaint.closed',
} as const;

// ── ComplaintService ───────────────────────────────────────────────

export class ComplaintService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Create complaint ────────────────────────────────────────────

  /**
   * Intake a new complaint. Auto-attaches call records and, for
   * unauthorized_debit complaints, builds a full ACH evidence bundle.
   */
  async createComplaint(input: CreateComplaintInput): Promise<ComplaintRecord> {
    const id = uuidv4();
    const now = new Date();

    const category = this._classifyCategory(input.category, input.description);
    const severity = input.severity ?? this._inferSeverity(category, input.description);

    // Auto-collect call record IDs linked to the business
    const callRecordIds = await this._autoAttachCallRecords(
      input.businessId,
      input.tenantId,
      input.initialCallRecordIds ?? [],
    );

    const evidenceDocIds = input.initialEvidenceDocIds ?? [];

    const record = await this.prisma.complaint.create({
      data: {
        id,
        tenantId:     input.tenantId,
        businessId:   input.businessId ?? null,
        category,
        subcategory:  input.subcategory ?? null,
        source:       input.source,
        severity,
        status:       'open',
        description:  input.description,
        evidenceDocIds: evidenceDocIds as unknown as object,
        callRecordIds:  callRecordIds  as unknown as object,
        assignedTo:   input.assignedTo ?? null,
      },
    });

    // Build unauthorized debit bundle immediately if applicable
    let unauthorizedDebitBundle: UnauthorizedDebitBundle | undefined;
    if (category === 'unauthorized_debit' && input.businessId) {
      unauthorizedDebitBundle = await this._buildUnauthorizedDebitBundle(
        input.businessId,
      );
    }

    await eventBus.publish(input.tenantId, {
      eventType:     COMPLAINT_EVENTS.CREATED,
      aggregateType: 'complaint',
      aggregateId:   id,
      payload: {
        businessId: input.businessId,
        category,
        severity,
        source: input.source,
      },
    });

    return this._toRecord(record, unauthorizedDebitBundle);
  }

  // ── List complaints ─────────────────────────────────────────────

  async listComplaints(filters: ComplaintListFilters): Promise<ComplaintListResult> {
    const page     = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const skip     = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenantId: filters.tenantId };
    if (filters.businessId) where['businessId'] = filters.businessId;
    if (filters.category)   where['category']   = filters.category;
    if (filters.status)     where['status']      = filters.status;
    if (filters.severity)   where['severity']    = filters.severity;

    const [rows, total] = await Promise.all([
      this.prisma.complaint.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.complaint.count({ where }),
    ]);

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      complaints: rows.map((r: any) => this._toRecord(r)),
      total,
      page,
      pageSize,
    };
  }

  // ── Get single complaint ────────────────────────────────────────

  async getComplaint(id: string, tenantId: string): Promise<ComplaintRecord | null> {
    const row = await this.prisma.complaint.findFirst({
      where: { id, tenantId },
    });
    if (!row) return null;

    let debitBundle: UnauthorizedDebitBundle | undefined;
    if (row.category === 'unauthorized_debit' && row.businessId) {
      debitBundle = await this._buildUnauthorizedDebitBundle(row.businessId);
    }

    return this._toRecord(row, debitBundle);
  }

  // ── Update complaint (lifecycle + fields) ───────────────────────

  async updateComplaint(
    id: string,
    tenantId: string,
    update: UpdateComplaintInput,
  ): Promise<ComplaintRecord> {
    const existing = await this.prisma.complaint.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new Error(`Complaint ${id} not found.`);
    }

    // Validate status transition
    if (update.status && update.status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status as ComplaintStatus];
      if (!allowed.includes(update.status)) {
        throw new Error(
          `Invalid status transition: ${existing.status} → ${update.status}. ` +
          `Allowed: [${allowed.join(', ')}].`,
        );
      }
    }

    const resolvedAt =
      update.status === 'resolved' && existing.status !== 'resolved'
        ? new Date()
        : (existing.resolvedAt ?? null);

    const updated = await this.prisma.complaint.update({
      where: { id },
      data: {
        ...(update.status    !== undefined && { status:     update.status }),
        ...(update.severity  !== undefined && { severity:   update.severity }),
        ...(update.assignedTo  !== undefined && { assignedTo: update.assignedTo }),
        ...(update.escalatedTo !== undefined && { escalatedTo: update.escalatedTo }),
        ...(update.rootCause   !== undefined && { rootCause:  update.rootCause }),
        ...(update.resolution  !== undefined && { resolution: update.resolution }),
        ...(update.subcategory !== undefined && { subcategory: update.subcategory }),
        resolvedAt,
      },
    });

    if (update.status && update.status !== existing.status) {
      const eventType =
        update.status === 'resolved' ? COMPLAINT_EVENTS.RESOLVED :
        update.status === 'closed'   ? COMPLAINT_EVENTS.CLOSED :
        COMPLAINT_EVENTS.STATUS_CHANGED;

      await eventBus.publish(tenantId, {
        eventType,
        aggregateType: 'complaint',
        aggregateId:   id,
        payload: {
          previousStatus: existing.status,
          newStatus:      update.status,
          businessId:     existing.businessId,
        },
      });
    }

    if (update.escalatedTo && !existing.escalatedTo) {
      await eventBus.publish(tenantId, {
        eventType:     COMPLAINT_EVENTS.ESCALATED,
        aggregateType: 'complaint',
        aggregateId:   id,
        payload: {
          escalatedTo: update.escalatedTo,
          category:    existing.category,
          severity:    update.severity ?? existing.severity,
        },
      });
    }

    return this._toRecord(updated);
  }

  // ── Attach evidence ─────────────────────────────────────────────

  async attachEvidence(input: AttachEvidenceInput): Promise<ComplaintRecord> {
    const existing = await this.prisma.complaint.findFirst({
      where: { id: input.complaintId, tenantId: input.tenantId },
    });
    if (!existing) {
      throw new Error(`Complaint ${input.complaintId} not found.`);
    }

    const currentDocIds    = (existing.evidenceDocIds as string[]) ?? [];
    const currentCallIds   = (existing.callRecordIds  as string[]) ?? [];

    const newDocIds:  string[] = [];
    const newCallIds: string[] = [];

    for (const item of input.evidenceItems) {
      if (item.type === 'call_record') {
        newCallIds.push(item.referenceId);
      } else {
        newDocIds.push(item.referenceId);
      }
    }

    const mergedDocIds  = [...new Set([...currentDocIds,  ...newDocIds])];
    const mergedCallIds = [...new Set([...currentCallIds, ...newCallIds])];

    const updated = await this.prisma.complaint.update({
      where: { id: input.complaintId },
      data: {
        evidenceDocIds: mergedDocIds  as unknown as object,
        callRecordIds:  mergedCallIds as unknown as object,
      },
    });

    await eventBus.publish(input.tenantId, {
      eventType:     COMPLAINT_EVENTS.EVIDENCE_ATTACHED,
      aggregateType: 'complaint',
      aggregateId:   input.complaintId,
      payload: {
        newItems: input.evidenceItems.length,
        addedBy:  input.addedBy,
      },
    });

    return this._toRecord(updated);
  }

  // ── Root-cause analytics ────────────────────────────────────────

  async getRootCauseAnalytics(tenantId: string): Promise<RootCauseAnalytics> {
    const allComplaints = await this.prisma.complaint.findMany({
      where: { tenantId },
      select: {
        category:   true,
        status:     true,
        severity:   true,
        rootCause:  true,
        resolvedAt: true,
        createdAt:  true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const byCategory: Record<string, number> = {};
    const byStatus:   Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const rootCauseMap: Record<string, number> = {};

    let totalResolutionMs = 0;
    let resolvedCount = 0;

    for (const c of allComplaints) {
      byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
      byStatus[c.status]     = (byStatus[c.status]     ?? 0) + 1;
      bySeverity[c.severity] = (bySeverity[c.severity] ?? 0) + 1;

      if (c.rootCause) {
        rootCauseMap[c.rootCause] = (rootCauseMap[c.rootCause] ?? 0) + 1;
      }

      if (c.resolvedAt && c.createdAt) {
        totalResolutionMs += c.resolvedAt.getTime() - c.createdAt.getTime();
        resolvedCount++;
      }
    }

    const topRootCauses = Object.entries(rootCauseMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([rootCause, count]) => ({ rootCause, count }));

    const avgResolutionMs = resolvedCount > 0 ? totalResolutionMs / resolvedCount : null;
    const averageResolutionDays =
      avgResolutionMs !== null ? avgResolutionMs / (1000 * 60 * 60 * 24) : null;

    // Monthly trend — last 6 months
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentTrend = this._buildMonthlyTrend(allComplaints.map((c: any) => c.createdAt), 6);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const openCritical = allComplaints.filter(
      (c: any) => c.severity === 'critical' && c.status !== 'closed',
    ).length;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unauthorizedDebitOpenCount = allComplaints.filter(
      (c: any) => c.category === 'unauthorized_debit' && c.status !== 'closed',
    ).length;

    return {
      tenantId,
      generatedAt: new Date(),
      totalComplaints: allComplaints.length,
      byCategory: byCategory as Record<ComplaintCategory, number>,
      byStatus:   byStatus   as Record<ComplaintStatus,   number>,
      bySeverity: bySeverity as Record<ComplaintSeverity, number>,
      topRootCauses,
      averageResolutionDays,
      openCritical,
      unauthorizedDebitOpenCount,
      recentTrend,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────

  /** Rule-based category classification — validates or overrides caller-supplied category. */
  private _classifyCategory(
    supplied: ComplaintCategory,
    description: string,
  ): ComplaintCategory {
    const lower = description.toLowerCase();

    // Hard signals that override supplied category
    if (
      lower.includes('unauthorized debit') ||
      lower.includes('unauthorized charge') ||
      lower.includes('ach pull') ||
      lower.includes('auto-debit') ||
      lower.includes('revok')
    ) {
      return 'unauthorized_debit';
    }

    if (
      lower.includes('cfpb') ||
      lower.includes('ftc') ||
      lower.includes('attorney general') ||
      lower.includes('regulatory') ||
      lower.includes('violation')
    ) {
      return 'compliance';
    }

    if (
      lower.includes('invoice') ||
      lower.includes('overcharge') ||
      lower.includes('fee dispute') ||
      lower.includes('billing error')
    ) {
      return 'billing';
    }

    // Trust caller-supplied category when no hard signal
    return supplied;
  }

  /** Infer severity from category and keywords. */
  private _inferSeverity(
    category: ComplaintCategory,
    description: string,
  ): ComplaintSeverity {
    const lower = description.toLowerCase();

    if (category === 'unauthorized_debit') return 'high';
    if (category === 'compliance')         return 'critical';

    if (
      lower.includes('fraud') ||
      lower.includes('stolen') ||
      lower.includes('lawsuit')
    ) {
      return 'critical';
    }

    if (lower.includes('urgent') || lower.includes('escalat')) return 'high';

    return 'medium';
  }

  /**
   * Retrieve call record IDs linked to a business from the AdvisorQaScore
   * table (callRecordId field) and merge with caller-supplied IDs.
   * In production, replace with a dedicated CallRecord model query.
   */
  private async _autoAttachCallRecords(
    businessId: string | undefined,
    _tenantId: string,
    supplied: string[],
  ): Promise<string[]> {
    if (!businessId) return supplied;

    // Pull up to 10 most recent QA scores with call records
    const qaScores = await this.prisma.advisorQaScore.findMany({
      where: {
        tenantId: _tenantId,
        callRecordId: { not: null },
      },
      orderBy: { scoredAt: 'desc' },
      take: 10,
      select: { callRecordId: true },
    });

    const autoIds = qaScores
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((q: any) => q.callRecordId as string | null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((id: any): id is string => id !== null);

    return [...new Set([...supplied, ...autoIds])];
  }

  /**
   * Build a full unauthorized-debit evidence bundle from ACH records.
   */
  private async _buildUnauthorizedDebitBundle(
    businessId: string,
  ): Promise<UnauthorizedDebitBundle | undefined> {
    const auth = await this.prisma.achAuthorization.findFirst({
      where:   { businessId },
      orderBy: { authorizedAt: 'desc' },
      include: { debitEvents: { orderBy: { processedAt: 'desc' }, take: 50 } },
    });

    if (!auth) return undefined;

    return {
      achAuthorizationId:  auth.id,
      processorName:       auth.processorName,
      authorizedAmount:    auth.authorizedAmount ? Number(auth.authorizedAmount) : undefined,
      authorizedFrequency: auth.authorizedFrequency ?? undefined,
      authorizationStatus: auth.status,
      signedDocumentRef:   auth.signedDocumentRef ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      debitEvents: auth.debitEvents.map((ev: any) => ({
        id:               ev.id,
        amount:           Number(ev.amount),
        processedAt:      ev.processedAt,
        flagged:          ev.flagged,
        flagReason:       ev.flagReason ?? null,
        isWithinTolerance: ev.isWithinTolerance,
      })),
    };
  }

  /** Build month-label → count trend array for the past N months. */
  private _buildMonthlyTrend(
    dates: Date[],
    monthsBack: number,
  ): Array<{ month: string; count: number }> {
    const now     = new Date();
    const buckets: Record<string, number> = {};

    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[key] = 0;
    }

    for (const d of dates) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key in buckets) buckets[key]++;
    }

    return Object.entries(buckets).map(([month, count]) => ({ month, count }));
  }

  /** Map a Prisma row to the public ComplaintRecord shape. */
  private _toRecord(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    row: any,
    unauthorizedDebitBundle?: UnauthorizedDebitBundle,
  ): ComplaintRecord {
    return {
      id:          row.id,
      tenantId:    row.tenantId,
      businessId:  row.businessId ?? null,
      category:    row.category as ComplaintCategory,
      subcategory: row.subcategory ?? null,
      source:      row.source as ComplaintSource,
      severity:    row.severity as ComplaintSeverity,
      status:      row.status as ComplaintStatus,
      description: row.description,
      evidenceDocIds: (row.evidenceDocIds as string[]) ?? [],
      callRecordIds:  (row.callRecordIds  as string[]) ?? [],
      rootCause:   row.rootCause   ?? null,
      resolution:  row.resolution  ?? null,
      assignedTo:  row.assignedTo  ?? null,
      escalatedTo: row.escalatedTo ?? null,
      resolvedAt:  row.resolvedAt  ?? null,
      createdAt:   row.createdAt,
      updatedAt:   row.updatedAt,
      ...(unauthorizedDebitBundle && { unauthorizedDebitBundle }),
    };
  }
}
