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

import { PrismaClient, type Complaint } from '@prisma/client';
import { prisma as sharedPrisma } from '../config/database.js';
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
  | 'escalated'
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
  /**
   * When this bundle was assembled, and that it is a snapshot.
   *
   * It is built when the complaint is filed and never rebuilt, so debits after
   * that do not appear. Defensible for evidence — it is what was known at the
   * time — but it read as a current view, and a reader comparing it against
   * today's account would find it wrong rather than old.
   *
   * Null on a complaint filed before 2 September 2026: the bundle is not
   * stored on the row, so there is no date to recover.
   */
  builtAt?: string | null;
  isSnapshot?: boolean;
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
  /**
   * Who filed it. Set by the route from the verified token, never from the
   * request body — shared rule 7: if the module records it, the module
   * derives it.
   */
  filedBy: string;
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
  /**
   * Who attached it. Set by the route from the verified token, NOT from the
   * request body — shared rule 7: never supply a value the module was going
   * to record about a third party. This was
   * `parsed.data.addedBy ?? req.tenant.userId`, so a caller could attribute
   * an evidence attachment to somebody else.
   */
  addedBy: string;
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
  evidenceItems?: EvidenceItemRecord[];
  /** `no_evidence_on_record` where both arrays are empty. Shared rule 2. */
  evidenceBasis?: 'no_evidence_on_record' | 'evidence_attached';
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

/** A listed complaint carries the client's name; the single-record read does not. */
export type ComplaintListItem = ComplaintRecord & { businessName: string | null };

export interface ComplaintListResult {
  complaints: ComplaintListItem[];
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

// Escalation is a state, not only an assignment. `escalatedTo` records to
// whom; this records whether and — through the event trail — when. "What was
// escalated, and when" is a question a regulator asks of the register, and it
// cannot be answered from an assignee column alone.
//
// Anything unresolved can escalate: severity or delay can force it before an
// investigation has started, so `open` reaches it directly.
//
// `escalated` cannot go to `closed`. A complaint that closes without passing
// through `resolved` carries no recorded outcome, and an outcome is exactly
// what an escalated complaint is asked for. Where a regulator closes one, that
// is still an outcome — record it as `resolved` with the resolution naming who
// closed it and why, then `closed`. One extra step, complete record.
//
// It cannot return to `open` either: going back to untriaged after escalating
// is not a real state.
const VALID_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  open:          ['investigating', 'escalated', 'closed'],
  investigating: ['resolved', 'escalated', 'open'],
  escalated:     ['investigating', 'resolved'],
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

/** No such complaint under this tenant. */
/**
 * One piece of evidence, as attached.
 *
 * `type` used to be validated by the route and then used once, to pick which
 * of two id arrays the reference went into — `call_record` to one, everything
 * else to the other. A debit event and a screenshot were stored identically,
 * and the title and notes a caller sent were discarded. A complaint file could
 * not answer what it held.
 */
export interface EvidenceItemRecord {
  type: 'document' | 'call_record' | 'debit_event' | 'screenshot' | 'other' | 'unknown';
  referenceId: string;
  title: string | null;
  notes: string | null;
  /** The verified user who attached it. Null on rows backfilled from ids. */
  addedBy: string | null;
  addedAt: string | null;
  /** True where the item was reconstructed from a bare id by the migration. */
  backfilled?: boolean;
}

export class ComplaintNotFoundError extends Error {
  constructor(public readonly complaintId: string) {
    super(`Complaint ${complaintId} was not found.`);
    this.name = 'ComplaintNotFoundError';
  }
}

/**
 * The businessId a complaint names is not a business in this tenant.
 *
 * Typed, and checked BEFORE anything reads on it. `businessId` arrived in the
 * request body, was written straight to the row, and for an
 * unauthorized_debit complaint was then used to read an ACH authorisation and
 * fifty debit events — with no tenant filter on that query either. Bank debit
 * history for any business, to any authenticated caller who could guess an id.
 *
 * Neither guard saw it: the mount-table check covers a business id in a PATH,
 * and `npm run check:route-tenancy` reads route files, while the unscoped
 * `where` was inside this service.
 */
export class UnknownComplaintBusinessError extends Error {
  constructor(public readonly businessId: string) {
    super(`No business ${businessId} in this tenant.`);
    this.name = 'UnknownComplaintBusinessError';
  }
}

/** A status transition the workflow does not allow. */
export class InvalidComplaintTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly allowed: readonly string[],
  ) {
    super(
      `Invalid status transition: ${from} -> ${to}. Allowed: [${allowed.join(', ')}].`,
    );
    this.name = 'InvalidComplaintTransitionError';
  }
}

export class ComplaintService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? sharedPrisma;
  }

  // ── Create complaint ────────────────────────────────────────────

  /**
   * Intake a new complaint. Auto-attaches call records and, for
   * unauthorized_debit complaints, builds a full ACH evidence bundle.
   */
  async createComplaint(input: CreateComplaintInput): Promise<ComplaintRecord> {
    const id = uuidv4();
    const now = new Date();

    // The business a complaint names is verified BEFORE anything reads on it.
    //
    // `businessId` arrived in the request body and was written straight to the
    // row. For an unauthorized_debit complaint it was then used to read an ACH
    // authorisation and fifty debit events, on a query with no tenant filter —
    // bank debit history for any business, to any authenticated caller who
    // could produce an id.
    if (input.businessId) {
      const business = await this.prisma.business.findFirst({
        where:  { id: input.businessId, tenantId: input.tenantId },
        select: { id: true },
      });
      if (!business) throw new UnknownComplaintBusinessError(input.businessId);
    }

    const category = this._classifyCategory(input.category, input.description);
    const severity = input.severity ?? this._inferSeverity(category, input.description);

    // NOTHING IS AUTO-ATTACHED ANY MORE, and its absence is not a regression.
    //
    // This called `_autoAttachCallRecords(businessId, tenantId, supplied)`,
    // which returned early without a businessId and then never used it:
    //
    //     advisorQaScore.findMany({ where: { tenantId, callRecordId: { not: null } },
    //                               orderBy: { scoredAt: 'desc' }, take: 10 })
    //
    // The ten most recently QA-scored calls IN THE WHOLE TENANT, from any
    // advisor, about any client — attached as evidence to this complaint. A
    // complaint about one client carried recordings of conversations with ten
    // others, in a file that may be handed to a regulator.
    //
    // It was not fixed by adding a filter. `AdvisorQaScore` has tenantId,
    // advisorId and callRecordId and NO businessId, because a QA score is
    // about an advisor's work rather than a client's file — the same shape as
    // CommComplianceRecord. Inventing that relationship would be worse than
    // not having it: a link nobody recorded, asserted so a convenience feature
    // could keep working.
    //
    // So evidence is attached deliberately, by somebody who decided this call
    // is evidence in this complaint. `initialCallRecordIds` still works and is
    // the supported way to do it at intake.
    const callRecordIds = input.initialCallRecordIds ?? [];
    const evidenceDocIds = input.initialEvidenceDocIds ?? [];

    // The items, with their types kept. `type` used to be validated and then
    // collapsed into one of two id arrays.
    const evidenceItems: EvidenceItemRecord[] = [
      ...callRecordIds.map((referenceId) => ({
        type: 'call_record' as const,
        referenceId,
        title: null,
        notes: null,
        addedBy: input.filedBy,
        addedAt: now.toISOString(),
      })),
      ...evidenceDocIds.map((referenceId) => ({
        type: 'document' as const,
        referenceId,
        title: null,
        notes: null,
        addedBy: input.filedBy,
        addedAt: now.toISOString(),
      })),
    ];

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
        evidenceItems:  evidenceItems  as unknown as object,
        assignedTo:   input.assignedTo ?? null,
      },
    });

    // Build unauthorized debit bundle immediately if applicable.
    //
    // A SNAPSHOT, and it stays one. The bundle is built when the complaint is
    // filed and never rebuilt, so debits after that do not appear. That is
    // defensible for evidence — it is what was known at the time — but it was
    // indistinguishable from a current view, so it now carries the date it was
    // built and is readable as of-then rather than as now.
    let unauthorizedDebitBundle: UnauthorizedDebitBundle | undefined;
    let debitBundleBuiltAt: Date | null = null;
    if (category === 'unauthorized_debit' && input.businessId) {
      unauthorizedDebitBundle = await this._buildUnauthorizedDebitBundle(
        input.businessId,
        input.tenantId,
      );
      if (unauthorizedDebitBundle) {
        debitBundleBuiltAt = now;
        unauthorizedDebitBundle.builtAt = now.toISOString();
        unauthorizedDebitBundle.isSnapshot = true;
        await this.prisma.complaint.update({
          where: { id },
          data:  { debitBundleBuiltAt: now },
        });
      }
    }

    await eventBus.publishAndPersist(input.tenantId, {
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

    // The complaints table shows and filters by client, but Complaint has no
    // relation to Business — only a nullable businessId — so the names are
    // resolved in one extra query rather than by adding a relation and a
    // migration. A complaint whose business has since been deleted keeps a
    // null name rather than borrowing another client's.
    const businessIds = [...new Set(rows.map((r) => r.businessId).filter((id): id is string => !!id))];
    const names = new Map<string, string>();
    if (businessIds.length > 0) {
      const businesses = await this.prisma.business.findMany({
        where: { id: { in: businessIds }, tenantId: filters.tenantId },
        select: { id: true, legalName: true },
      });
      for (const b of businesses) names.set(b.id, b.legalName);
    }

    return {
      complaints: rows.map((r) => ({
        ...this._toRecord(r),
        businessName: r.businessId ? (names.get(r.businessId) ?? null) : null,
      })),
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
      debitBundle = await this._buildUnauthorizedDebitBundle(row.businessId, tenantId);
      if (debitBundle) {
        // Read back, not rebuilt-and-restamped: the date is the one recorded
        // when the complaint was filed, and null means it predates the column.
        debitBundle.builtAt = row.debitBundleBuiltAt
          ? row.debitBundleBuiltAt.toISOString()
          : null;
        debitBundle.isSnapshot = true;
      }
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
      throw new ComplaintNotFoundError(id);
    }

    // Validate status transition
    if (update.status && update.status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status as ComplaintStatus];
      if (!allowed.includes(update.status)) {
        throw new InvalidComplaintTransitionError(
          existing.status,
          update.status,
          allowed,
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

      await eventBus.publishAndPersist(tenantId, {
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
      await eventBus.publishAndPersist(tenantId, {
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
      throw new ComplaintNotFoundError(input.complaintId);
    }

    const currentDocIds    = (existing.evidenceDocIds as string[]) ?? [];
    const currentCallIds   = (existing.callRecordIds  as string[]) ?? [];
    const currentItems     = (existing.evidenceItems as unknown as EvidenceItemRecord[]) ?? [];

    // Already attached, by reference. Re-sending the same evidence is not a
    // second attachment, and the count below has to agree with that.
    const known = new Set(currentItems.map((i) => i.referenceId));
    for (const id of [...currentDocIds, ...currentCallIds]) known.add(id);

    const now = new Date().toISOString();
    const added: EvidenceItemRecord[] = [];
    const newDocIds:  string[] = [];
    const newCallIds: string[] = [];

    for (const item of input.evidenceItems) {
      if (known.has(item.referenceId)) continue;
      known.add(item.referenceId);

      // The type is KEPT. It used to be read once, to choose which of two id
      // arrays the reference went into — `call_record` to one, everything else
      // to the other — so a debit event and a screenshot were stored
      // identically and the title and notes were discarded.
      added.push({
        type:        item.type,
        referenceId: item.referenceId,
        title:       item.title ?? null,
        notes:       item.notes ?? null,
        addedBy:     input.addedBy,
        addedAt:     now,
      });

      if (item.type === 'call_record') {
        newCallIds.push(item.referenceId);
      } else {
        // The id arrays stay as a derived index, so everything reading them
        // keeps working. `evidenceItems` is the record.
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
        evidenceItems:  [...currentItems, ...added] as unknown as object,
      },
    });

    // publishAndPersist, not publish. Evidence being attached to a complaint
    // is exactly the event a regulator asks for, and it was broadcast
    // in-process and written to no ledger row.
    await eventBus.publishAndPersist(input.tenantId, {
      eventType:     COMPLAINT_EVENTS.EVIDENCE_ATTACHED,
      aggregateType: 'complaint',
      aggregateId:   input.complaintId,
      payload: {
        // Items ADDED, not items sent. This reported
        // `input.evidenceItems.length`, so re-sending the same fifty
        // references — which the set-union merge correctly ignored — recorded
        // fifty new attachments in the ledger that never happened.
        newItems:      added.length,
        itemsSubmitted: input.evidenceItems.length,
        addedBy:       input.addedBy,
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
    const recentTrend = this._buildMonthlyTrend(allComplaints.map((c) => c.createdAt), 6);

    const openCritical = allComplaints.filter(
      (c) => c.severity === 'critical' && c.status !== 'closed',
    ).length;

    const unauthorizedDebitOpenCount = allComplaints.filter(
      (c) => c.category === 'unauthorized_debit' && c.status !== 'closed',
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
  // `_autoAttachCallRecords` was removed on 2026-09-02. See createComplaint
  // for what it did and why nothing replaces it.


  /**
   * Build a full unauthorized-debit evidence bundle from ACH records.
   */
  private async _buildUnauthorizedDebitBundle(
    businessId: string,
    tenantId: string,
  ): Promise<UnauthorizedDebitBundle | undefined> {
    // Scoped through the business. This filtered on businessId alone and
    // returned an ACH authorisation and fifty debit events for any business
    // in any tenant. The caller-supplied businessId is verified before this
    // runs; the filter here is the second half, so neither is load-bearing
    // alone.
    const auth = await this.prisma.achAuthorization.findFirst({
      where:   { businessId, business: { tenantId } },
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
      debitEvents: auth.debitEvents.map((ev) => ({
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
      if (key in buckets) buckets[key]!++;
    }

    return Object.entries(buckets).map(([month, count]) => ({ month, count }));
  }

  /** Map a Prisma row to the public ComplaintRecord shape. */
  private _toRecord(
    row: Complaint,
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
      evidenceItems:  (row.evidenceItems as unknown as EvidenceItemRecord[]) ?? [],
      /**
       * Why the evidence arrays are empty, where they are.
       *
       * `[]` alone reads as "nothing was ever attached", and it cannot be
       * distinguished from anything else — including removal, which is not
       * tracked at all: nothing in this service deletes an evidence
       * reference, and if a row is edited outside it there is no record that
       * something was there. See docs/gaps.md.
       */
      evidenceBasis:
        ((row.evidenceDocIds as string[]) ?? []).length === 0
        && ((row.callRecordIds as string[]) ?? []).length === 0
          ? 'no_evidence_on_record'
          : 'evidence_attached',
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
