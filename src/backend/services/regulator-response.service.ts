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

import { Prisma, PrismaClient, type RegulatoryAlert } from '@prisma/client';
import { prisma as sharedPrisma } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import logger from '../config/logger.js';
import { documentTimestampIntegrity } from './crypto-timestamp.js';

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

/**
 * RENAMED FROM `ComplianceManifest` on 2026-09-02.
 *
 * There were TWO exported types with that name — this one and the one in
 * `compliance-dossier.ts` — with completely different shapes, distinguished
 * only by which file a route imported from. Both were described to their
 * callers as the artefact handed to counsel. That is the same collision as
 * `fundingReadinessScore` being read by four surfaces with no shared
 * definition, one commit later.
 *
 * They are also two different things and are now two module ids:
 *
 *   ComplianceManifest (compliance-dossier.ts)  keyed on a BUSINESS, writes
 *                                               nothing but its own audit trace
 *   RegulatorDossier   (this file)              keyed on an INQUIRY, mints an
 *                                               exportId, writes a
 *                                               regulatoryDossierExport row and
 *                                               emits a ledger event
 *
 * See docs/callable-modules.md.
 */
export interface RegulatorDossier {
  exportId: string;
  inquiryId: string;
  tenantId: string;
  businessId?: string | null;
  matterType: RegulatoryMatterType;
  generatedAt: Date;
  /**
   * Who exported this. REQUIRED.
   *
   * It was optional, so an evidence export handed to a regulator could be
   * attributed to nobody, and `generatedBy: requestedBy ?? null` persisted that
   * null to the stored row. The sibling manifest refuses with
   * `UnknownRequesterError` for exactly this; two artefacts going to the same
   * reader with two policies on who assembled the evidence is one policy too
   * many.
   */
  generatedBy: string;
  /**
   * References, not bytes.
   *
   * `sections.documents` carries `storageKey`, `sha256Hash` and
   * `cryptoTimestamp`. Nothing here fetches a document or builds an archive.
   * Stated in the payload because `exportFormat: 'json'` was the only
   * self-description and it says nothing about what is inside.
   */
  contents: 'references';
  /**
   * Record types this dossier does NOT contain, each with a reason.
   *
   * Without it a reader cannot tell a record type that was omitted from one
   * that is empty for this business — and this dossier omits a great deal that
   * its sibling carries.
   */
  excludedRecordTypes: readonly DossierExclusion[];
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
  /** Hash and timestamp checked and intact. */
  documentsVerified: number;
  /** Never checkable: no hash, or no timestamp token. Not a clean bill of health. */
  documentsUnverifiable: number;
  /** Checked and FAILED. A document whose stored hash does not match its token. */
  documentsTampered: number;
  exportFormat: 'json';
}

export interface DossierExclusion {
  recordType: string;
  reason: string;
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
  /**
   * Whether the hash and timestamp were checked, and what happened.
   *
   * The hashes were passed through unverified with no statement either way, on
   * the artefact that actually goes to a regulator. Its sibling manifest has
   * verified them since 2026-09-02.
   */
  timestampIntegrity: 'verified' | 'unverifiable' | 'tampered';
}

/**
 * What a RegulatorDossier leaves out. Mirrors EXCLUDED_RECORD_TYPES in
 * compliance-dossier.ts, which is where the same argument is made at length.
 */
export const DOSSIER_EXCLUDED_RECORD_TYPES: readonly DossierExclusion[] = [
  {
    recordType: 'product_acknowledgments',
    reason:
      'Signed product acknowledgments — product reality, fee schedules, personal '
      + 'guarantees. Not assembled here. They are in the per-business compliance '
      + 'manifest (GET /api/documents/export/:businessId), which is a different '
      + 'module with a different key. Their absence from this dossier is a fact '
      + 'about this dossier, not about what the client signed.',
  },
  {
    recordType: 'card_applications',
    reason:
      'Card applications and the adverse-action notices attached to declines. '
      + 'Not assembled here, and the same applies: the per-business compliance '
      + 'manifest carries them.',
  },
  {
    recordType: 'cost_calculations',
    reason:
      'Fee schedule snapshots. Not assembled here; carried by the per-business '
      + 'compliance manifest.',
  },
  {
    recordType: 'suitability_checks',
    reason:
      'Suitability checks, including whether a no-go was triggered. Not assembled '
      + 'here; carried by the per-business compliance manifest.',
  },
  {
    recordType: 'canonical_ledger_events',
    reason:
      'The event ledger. Not assembled here. The per-business manifest carries '
      + 'the events attributable to a business, with a note on what that '
      + 'attribution misses.',
  },
  {
    recordType: 'business_owners',
    reason:
      'Beneficial owners, including encrypted SSNs. Deliberately excluded and not '
      + 'a gap: these are retrieved through a separately permissioned endpoint.',
  },
] as const;

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

// ── Errors ──────────────────────────────────────────────────────
//
// Typed, because the route mapped failures with
// `err.message.includes('not found')`. Any future error whose message happened
// to contain those two words became a 404 — a bug waiting for somebody to write
// an unlucky message.

/** No such inquiry, or not this tenant. Deliberately the same answer. */
export class RegulatorInquiryNotFoundError extends Error {
  constructor(inquiryId: string) {
    super(`Regulator inquiry ${inquiryId} not found.`);
    this.name = 'RegulatorInquiryNotFoundError';
  }
}

/** The inquiry is not linked to a business, so there is nothing to assemble. */
/**
 * The id that would be recorded in `generatedBy` names nobody in this tenant.
 *
 * Deliberately NOT called `UnknownRequesterError`: compliance-dossier.ts
 * already exports that name, and this file has just finished paying for two
 * exported types sharing one.
 */
export class UnknownDossierRequesterError extends Error {
  constructor(public readonly requestedBy: string) {
    super(
      `No user ${requestedBy} in this tenant. A regulator dossier records who `
      + 'exported it, in a row kept as the artefact of record, so it cannot be '
      + 'attributed to an id that resolves to nobody.',
    );
    this.name = 'UnknownDossierRequesterError';
  }
}

export class InquiryHasNoBusinessError extends Error {
  constructor(inquiryId: string) {
    super(
      `Regulator inquiry ${inquiryId} is not linked to a business, so no dossier can `
      + 'be assembled. Attach the inquiry to a client first.',
    );
    this.name = 'InquiryHasNoBusinessError';
  }
}


export class RegulatorResponseService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? sharedPrisma;
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
      inquiries: rows.map((r) => this._toRecord(r)),
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
    if (!inquiry) throw new RegulatorInquiryNotFoundError(inquiryId);

    const meta = (inquiry.metadata as Record<string, unknown>) ?? {};

    // From the column first, falling back to the JSON key — the same
    // resolution `exportDossier` uses.
    //
    // This read `metadata['businessId']` alone. For an inquiry whose business
    // link had been backfilled onto the column but not written back into the
    // metadata blob, the hold flagged NO documents at all while the export
    // reported every one of them as preserved. Two halves of one feature
    // disagreeing about where the business id lives, in a legal hold.
    const businessId = inquiry.businessId ?? ((meta['businessId'] as string | null) ?? null);

    const activatedAt = new Date();

    // Preserve all related documents
    let preservedDocumentIds: string[] = [];
    if (businessId) {
      const docs = await this.prisma.document.findMany({
        where: { tenantId, businessId },
        select: { id: true },
      });
      preservedDocumentIds = docs.map((d) => d.id as string);

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
    requestedBy: string,
  ): Promise<RegulatorDossier> {
    // Before anything is assembled or written. This mints an exportId and
    // persists a row that is kept as the artefact of record; its provenance
    // line cannot name nobody.
    const requester = await this.prisma.user.findFirst({
      where: { id: requestedBy, tenantId },
      select: { id: true },
    });
    if (!requester) throw new UnknownDossierRequesterError(requestedBy);

    const inquiry = await this.prisma.regulatoryAlert.findFirst({
      where: { id: inquiryId, tenantId },
    });
    if (!inquiry) throw new RegulatorInquiryNotFoundError(inquiryId);

    const meta = (inquiry.metadata as Record<string, unknown>) ?? {};

    // From the column, not from `metadata['businessId']`. The JSON key is still
    // written and is still read as a fallback for rows the backfill could not
    // resolve, but the column is the link the database can enforce.
    const businessId = inquiry.businessId ?? ((meta['businessId'] as string | null) ?? null);

    // Refuse rather than assemble nothing. Every fetch below was
    // `businessId ? query : Promise.resolve([])`, so an unattached inquiry
    // produced a complete-looking dossier of five empty arrays — which reads as
    // 'this business has no records' rather than 'no business was attached'.
    if (!businessId) throw new InquiryHasNoBusinessError(inquiryId);
    const inquiryRecord = this._toRecord(inquiry);

    // ── Pull all related artefacts in parallel ───────────────────
    //
    // Every fetch was `businessId ? query : Promise.resolve([])`, and every one
    // of those false branches became unreachable when the refusal above was
    // added — the comment explaining that the guards WERE the defect sat
    // directly on top of the guards. Inert code that reads as a live policy is
    // the thing that stops the next reader checking whether it still runs.
    const [documents, complaints, consentRecords, complianceChecks, achAuths] =
      await Promise.all([
        this.prisma.document.findMany({
          where: { tenantId, businessId },
          orderBy: { createdAt: 'asc' },
        }),

        this.prisma.complaint.findMany({
          where: { tenantId, businessId },
          orderBy: { createdAt: 'asc' },
        }),

        this.prisma.consentRecord.findMany({
          where: { tenantId, businessId },
          orderBy: { grantedAt: 'asc' },
        }),

        this.prisma.complianceCheck.findMany({
          where: { tenantId, businessId },
          orderBy: { createdAt: 'asc' },
        }),

        // Scoped through the relation. This was `where: { businessId }` alone
        // while the four above named the tenant — AchAuthorization has no
        // tenantId column of its own. The id is tenant-derived from the inquiry
        // today, so it was probably not reachable; it is the identical shape to
        // the complaint-service read that returned a bank authorisation and
        // fifty debit events cross-tenant, and it is one refactor from live.
        this.prisma.achAuthorization.findMany({
          where: { businessId, business: { tenantId } },
          orderBy: { authorizedAt: 'asc' },
        }),
      ]);

    // ── Legal hold summary if active ─────────────────────────────
    //
    // `preservedDocumentIds` WAS `documents.map(d => d.id)` — every document
    // for this business, now — under a hold timestamped earlier, with no filter
    // on `d.legalHold` and none on the activation date. So a document whose own
    // legalHold flag is false, and a document created after the hold was
    // activated, both appeared in a list called PRESERVED. `documentCount` was
    // the same number.
    //
    // That is a fabricated provenance claim inside a legal-hold record going to
    // a regulator: it asserts that documents were preserved by a hold that
    // never touched them, and it cannot be told apart from a real preservation
    // list by anyone reading the dossier.
    //
    // Two filters, both required. `legalHold` is set by activateLegalHold on
    // the documents that existed at that moment, so it identifies documents
    // under SOME hold; `createdAt <= activatedAt` narrows that to this one.
    let legalHoldSummary: LegalHoldSummary | undefined;
    if (meta['legalHoldActivatedAt']) {
      const activatedAt = new Date(meta['legalHoldActivatedAt'] as string);
      const preserved = Number.isNaN(activatedAt.getTime())
        ? []
        : documents.filter((d) => d.legalHold && d.createdAt <= activatedAt);

      legalHoldSummary = {
        activatedAt,
        activatedBy:          (meta['legalHoldActivatedBy'] as string) ?? undefined,
        documentCount:        preserved.length,
        preservedDocumentIds: preserved.map((d) => d.id),
        businessId,
      };
    }

    // Hashes and timestamp tokens are CHECKED, not passed through.
    //
    // This is the artefact that actually goes to a regulator and it reported
    // `sha256Hash` and `cryptoTimestamp` with no statement about whether either
    // had been verified. Its sibling manifest has verified them since
    // 2026-09-02; a document with no hash was never checkable, which is a gap
    // in what was recorded rather than evidence of tampering — and it is also
    // not a clean bill of health.
    const documentIntegrity = documents.map((d) => ({
      id: d.id,
      integrity: documentTimestampIntegrity(d, tenantId),
    }));
    const integrityOf = new Map(documentIntegrity.map((d) => [d.id, d.integrity]));

    const documentsTampered = documentIntegrity.filter((d) => d.integrity === 'tampered').length;
    if (documentsTampered > 0) {
      logger.error('[exportDossier] ALERT: tampered document timestamps in a regulator dossier', {
        tenantId, inquiryId, businessId, documentsTampered,
      });
    }

    const exportId = uuidv4();

    // publishAndPersist, not publish. `publish` only dispatches to subscribers,
    // and there are none at runtime — so exporting a regulator dossier left no
    // record anywhere that it had happened. No ledger row, no AuditLog, a
    // logger.info and nothing else. "Who pulled this, and when" is the first
    // question asked about an evidence export.
    await eventBus.publishAndPersist(tenantId, {
      eventType:     REGULATOR_EVENTS.DOSSIER_EXPORTED,
      aggregateType: 'regulatory_inquiry',
      aggregateId:   inquiryId,
      payload: {
        exportId,
        generatedBy:   requestedBy,
        documentCount: documents.length,
      },
    });

    const dossier: RegulatorDossier = {
      exportId,
      inquiryId,
      tenantId,
      businessId,
      matterType:  inquiry.ruleType as RegulatoryMatterType,
      generatedAt: new Date(),
      generatedBy: requestedBy,
      contents:    'references',
      excludedRecordTypes: DOSSIER_EXCLUDED_RECORD_TYPES,
      sections: {
        inquiryDetails: inquiryRecord,
        documents: documents.map((d) => ({
          id:              d.id,
          documentType:    d.documentType,
          title:           d.title,
          storageKey:      d.storageKey,
          createdAt:       d.createdAt,
          legalHold:       d.legalHold,
          sha256Hash:      d.sha256Hash ?? null,
          cryptoTimestamp: d.cryptoTimestamp ?? null,
          timestampIntegrity: integrityOf.get(d.id) ?? 'unverifiable',
        })),
        complaints: complaints.map((c) => ({
          id:          c.id,
          category:    c.category,
          status:      c.status,
          severity:    c.severity,
          description: c.description,
          createdAt:   c.createdAt,
          resolvedAt:  c.resolvedAt ?? null,
        })),
        consentRecords: consentRecords.map((cr) => ({
          id:          cr.id,
          channel:     cr.channel,
          consentType: cr.consentType,
          status:      cr.status,
          grantedAt:   cr.grantedAt,
          revokedAt:   cr.revokedAt ?? null,
          evidenceRef: cr.evidenceRef ?? null,
        })),
        complianceChecks: complianceChecks.map((cc) => ({
          id:         cc.id,
          checkType:  cc.checkType,
          riskScore:  cc.riskScore ?? null,
          riskLevel:  cc.riskLevel ?? null,
          createdAt:  cc.createdAt,
        })),
        achAuthorizations: achAuths.map((a) => ({
          id:            a.id,
          processorName: a.processorName,
          status:        a.status,
          authorizedAt:  a.authorizedAt,
          revokedAt:     a.revokedAt ?? null,
        })),
        legalHoldSummary,
      },
      totalDocuments: documents.length,
      documentsVerified:     documentIntegrity.filter((d) => d.integrity === 'verified').length,
      documentsUnverifiable: documentIntegrity.filter((d) => d.integrity === 'unverifiable').length,
      documentsTampered,
      exportFormat:   'json',
    };
    // Stored, so "the dossier we sent on the 14th" can be produced rather than
    // regenerated. A regeneration differs from the original the moment any
    // underlying row changes, which for a regulator artefact is the difference
    // between evidence and a printout. `sections` is duplicated deliberately:
    // the point is what was sent, not what the source rows say now.
    await this.prisma.regulatoryDossierExport.create({
      data: {
        id:               exportId,
        tenantId,
        inquiryId,
        businessId,
        matterType:       dossier.matterType,
        generatedAt:      dossier.generatedAt,
        generatedBy:      requestedBy,
        sections:         dossier.sections as unknown as Prisma.InputJsonValue,
        documentCount:    documents.length,
        legalHoldSummary: (legalHoldSummary ?? null) as unknown as Prisma.InputJsonValue,
      },
    });

    return dossier;
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

  /**
   * Every caller passes a `regulatoryAlert` row, so it is typed as one.
   *
   * This took `any`, which meant the regulator pack assembled below was
   * built from fields nothing checked. Renaming a column would have left
   * `undefined` in a production going to a regulator, and compiled.
   */
  private _toRecord(row: RegulatoryAlert): RegulatorInquiryRecord {
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
      // No `?? row.createdAt`. That fallback is what made the missing column
      // invisible: it always won, so every record reported an updatedAt equal
      // to its creation date and read as untouched. The column exists now, and
      // a fallback here would only hide its removal the same way.
      updatedAt: row.updatedAt,
      deadlineStatus: this._computeDeadlineStatus(responseDueDate),
    };
  }
}
