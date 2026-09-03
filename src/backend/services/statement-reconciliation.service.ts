// ============================================================
// CapitalForge — Statement Reconciliation Engine
//
// Responsibilities:
//   1. Ingest raw statement data from multiple issuers and
//      normalize via StatementNormalizer.
//   2. Fee anomaly detection, all of it WITHIN ONE STATEMENT:
//        • Unexpected fee types (overlimit, returned payment, foreign
//          transaction, cash advance)
//        • Duplicate charge candidates — rows the statement carried twice,
//          plus the same description and amount on different dates
//        • Fee amount spikes, measured against the OTHER FEES ON THIS
//          STATEMENT. This said "> 2× prior-period average"; there is no
//          prior period. `detectFeeAnomalies` receives a single normalized
//          statement and has never read another one, so a statement carrying
//          one fee cannot spike.
//   3. Balance mismatch detection:
//        • Expected closing balance vs. reported closing balance
//        • Previous balance + charges - payments ≠ closing balance
//   4. Route normalized data to the Canonical Ledger via EventBus.
//   5. Email-forward statement parser stub (extracts raw fields
//      from plain-text email bodies forwarded by cardholders).
//   6. Mark statements as reconciled after advisor review.
//
// Issuer coverage (via StatementNormalizer):
//   Chase, Amex, Capital One, Citi, Bank of America, US Bank,
//   Discover, Wells Fargo, Barclays, Synchrony
// ============================================================

import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as sharedPrisma } from '../config/database.js';
import { EventBus } from '../events/event-bus.js';
import { AGGREGATE_TYPES } from '../events/event-types.js';
import logger from '../config/logger.js';
import {
  StatementNormalizer,
  type RawStatementData,
  type NormalizedStatement,
} from './statement-normalizer.js';

// ── Constants ────────────────────────────────────────────────

/** Maximum allowed deviation from expected balance before flagging. */
const BALANCE_MISMATCH_TOLERANCE = 0.50; // $0.50 rounding tolerance

/** Fee spike threshold: flag when a fee is N× the prior-period average. */
const FEE_SPIKE_MULTIPLIER = 2.0;

// ── Custom event types for statement lifecycle ────────────────
const STATEMENT_EVENT_TYPES = {
  STATEMENT_INGESTED: 'statement.ingested',
  STATEMENT_ANOMALY_DETECTED: 'statement.anomaly.detected',
  STATEMENT_RECONCILED: 'statement.reconciled',
} as const;

const STATEMENT_AGGREGATE = 'statement_record';

// ── Anomaly Types ─────────────────────────────────────────────

export type AnomalyType =
  | 'unexpected_fee'
  | 'duplicate_charge'
  | 'fee_spike'
  | 'balance_mismatch'
  | 'interest_rate_change'
  | 'overlimit_fee'
  | 'missing_payment_credit'
  /**
   * Not a defect in the statement — a check that could not be performed.
   * Kept in the same list so a reader sees it beside the findings rather than
   * mistaking an absent check for a clean one.
   */
  | 'reconciliation_not_possible';

export interface StatementAnomaly {
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  /** Dollar amount involved, when applicable */
  amount?: number | null;
  /** Transaction description that triggered the anomaly */
  transactionRef?: string | null;
}

// ── Input / Output Types ──────────────────────────────────────

export interface IngestStatementInput {
  tenantId: string;
  businessId: string;
  cardApplicationId?: string | null;
  /** Raw statement data — may come from PDF extract, API, or email parser */
  rawData: RawStatementData;
  /** If set, links to an existing Document vault record */
  sourceDocumentId?: string | null;
}

export interface IngestStatementResult {
  statementRecordId: string;
  normalized: NormalizedStatement;
  anomalies: StatementAnomaly[];
  balanceMismatchDetected: boolean;
  feeAnomalyDetected: boolean;
  /**
   * The record this ingest replaced, if the same period had been imported
   * before. Null on a first import.
   *
   * There was no uniqueness of any kind here: ingesting a statement twice made
   * two records, two ledger events, and doubled every anomaly on the business
   * report, so an agent retrying a timeout doubled a client's month.
   */
  supersededStatementRecordId: string | null;
  /**
   * True when the record replaced had already been reconciled.
   *
   * Worth its own field rather than a line of prose: somebody attested that
   * they reviewed the earlier version, and that attestation does not carry
   * over to figures they have not seen.
   */
  supersededReconciledStatement: boolean;
}

export interface ReconcileStatementInput {
  tenantId: string;
  statementId: string;
  reconciledBy: string;
  notes?: string;
}

export interface StatementSummary {
  id: string;
  issuer: string;
  statementDate: Date | null;
  closingBalance: number | null;
  minimumPayment: number | null;
  dueDate: Date | null;
  feesCharged: number | null;
  interestCharged: number | null;
  anomalyCount: number;
  reconciled: boolean;
  /**
   * Who signed off, and when. `reconciled: true` with a null actor is a
   * statement reconciled before the actor was recorded, or one whose only
   * record of the actor was a ledger event the backfill could not find. It is
   * not the same as nobody having reconciled it, and it is not the same as
   * 'system' — which was the route's default and never an actor.
   */
  reconciledByUserId: string | null;
  reconciledAt: Date | null;
  createdAt: Date;
}

// ── Email Parser Stub ─────────────────────────────────────────

export interface EmailStatementParseResult {
  /** Whether the email was recognized as a statement notification */
  recognized: boolean;
  issuer: string | null;
  /** Extracted raw fields — may be sparse */
  extractedFields: Partial<RawStatementData>;
  /** Any text patterns that were matched */
  matchedPatterns: string[];
  /** Human-readable notes about what was / wasn't extracted */
  notes: string[];
}

// Email regexes keyed by field name
const EMAIL_PATTERNS: Record<string, RegExp> = {
  closingBalance: /(?:new balance|closing balance|balance due)[:\s]+\$?([\d,]+\.?\d*)/i,
  minimumPayment: /(?:minimum payment|min.*?due|minimum.*?due)[:\s]+\$?([\d,]+\.?\d*)/i,
  dueDate: /(?:payment due date|due date)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  statementDate: /(?:statement date|statement closing date|closing date)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  creditLimit: /(?:credit limit|total credit line)[:\s]+\$?([\d,]+\.?\d*)/i,
  availableCredit: /(?:available credit)[:\s]+\$?([\d,]+\.?\d*)/i,
};

const ISSUER_SENDER_MAP: Record<string, string> = {
  'chase.com': 'Chase',
  'americanexpress.com': 'American Express',
  'capitalone.com': 'Capital One',
  'citi.com': 'Citi',
  'bankofamerica.com': 'Bank of America',
  'usbank.com': 'US Bank',
  'discover.com': 'Discover',
  'wellsfargo.com': 'Wells Fargo',
  'barclays.com': 'Barclays',
};

// ── Service ───────────────────────────────────────────────────

/**
 * The statement carried no date.
 *
 * Its own class rather than a bare Error so the route can answer 422 with a
 * reason a caller can act on, instead of the 500 a generic throw would produce.
 */
export class UndatedStatementError extends Error {
  constructor() {
    super(
      'This statement has no statement date. A statement is filed to the period it '
      + 'belongs to, and nothing here can tell which period that is.',
    );
    this.name = 'UndatedStatementError';
  }
}

/**
 * No such business under this tenant.
 *
 * Typed, because the route mapped every failure by message substring —
 * `includes('not found')`, `includes('does not belong')`, `includes('required')`,
 * `includes('must be')`. A Prisma failure reading "Argument x is required"
 * came back to the caller as a 422 about their own payload, which is an
 * instruction to fix something that was never wrong.
 *
 * The message deliberately does not name the tenant. It used to read
 * `Business <id> not found for tenant <tenantId>` and the route returned it
 * verbatim in the 404 body, handing a caller an id belonging to the account
 * boundary itself. A caller who cannot see the business does not need to be
 * told which tenant could.
 */
export class BusinessNotFoundError extends Error {
  constructor(public readonly businessId: string) {
    super(`Business ${businessId} was not found.`);
    this.name = 'BusinessNotFoundError';
  }
}

/** No such statement under this tenant. Same reasoning, same omission. */
export class StatementNotFoundError extends Error {
  constructor(public readonly statementId: string) {
    super(`Statement ${statementId} was not found.`);
    this.name = 'StatementNotFoundError';
  }
}

/** The statement has already been reconciled; reconciling is not idempotent. */
export class StatementAlreadyReconciledError extends Error {
  constructor(public readonly statementId: string) {
    super(`Statement ${statementId} is already reconciled.`);
    this.name = 'StatementAlreadyReconciledError';
  }
}

/**
 * Nobody was named as the reconciling actor.
 *
 * The route defaulted this to `'system'`, so a call arriving without a user id
 * recorded a sign-off attributed to nothing — the same shape as the consent
 * revoke that recorded the wrong actor. Reconciliation is a human attesting
 * that they looked at a statement, and 'system' looked at nothing.
 */
export class UnattributedReconciliationError extends Error {
  constructor() {
    super(
      'Reconciling a statement requires the user doing it. This is an advisor '
      + 'attesting that they reviewed the statement, so it cannot be recorded '
      + 'against no one.',
    );
    this.name = 'UnattributedReconciliationError';
  }
}

export class StatementReconciliationService {
  private readonly prisma: PrismaClient;
  private readonly eventBus: EventBus;
  private readonly normalizer: StatementNormalizer;

  constructor(
    prisma?: PrismaClient,
    eventBus?: EventBus,
    normalizer?: StatementNormalizer,
  ) {
    this.prisma = prisma ?? sharedPrisma;
    this.eventBus = eventBus ?? EventBus.getInstance();
    this.normalizer = normalizer ?? new StatementNormalizer();
  }

  // ── Ingestion ─────────────────────────────────────────────

  /**
   * Ingest, normalize, and analyze a single statement.
   *
   * Steps:
   *   1. Verify business belongs to tenant.
   *   2. Normalize raw data via StatementNormalizer.
   *   3. Run fee anomaly detection.
   *   4. Run balance mismatch detection.
   *   5. Persist StatementRecord with normalized data and anomalies.
   *   6. Publish STATEMENT_INGESTED (and STATEMENT_ANOMALY_DETECTED if needed)
   *      to the Canonical Ledger.
   */
  async ingestStatement(input: IngestStatementInput): Promise<IngestStatementResult> {
    const svc = logger.child({
      service: 'StatementReconciliationService',
      tenantId: input.tenantId,
      businessId: input.businessId,
    });

    // ── Verify business ────────────────────────────────────────
    const business = await this.prisma.business.findFirst({
      where: { id: input.businessId, tenantId: input.tenantId },
      select: { id: true, legalName: true },
    });
    if (!business) {
      throw new BusinessNotFoundError(input.businessId);
    }

    // ── Normalize ──────────────────────────────────────────────
    const normalized = this.normalizer.normalize(input.rawData);

    // ── Anomaly Detection ──────────────────────────────────────
    const anomalies: StatementAnomaly[] = [
      ...this.detectFeeAnomalies(normalized),
      ...this.detectBalanceMismatch(normalized),
    ];

    const balanceMismatchDetected = anomalies.some(
      (a) => a.type === 'balance_mismatch',
    );
    const feeAnomalyDetected = anomalies.some(
      (a) => a.type === 'unexpected_fee' ||
             a.type === 'duplicate_charge' ||
             a.type === 'fee_spike',
    );

    // ── Persist ────────────────────────────────────────────────
    // A statement with no date is not this month's.
    //
    // This defaulted to `new Date()`, so an undated statement was filed to
    // whenever it happened to be ingested — and statementDate is what every
    // period query orders and filters by. StatementRecord.statementDate is NOT
    // NULL, so there is nowhere to put "unknown"; the honest answer is to
    // refuse the ingest rather than invent the one field that decides where the
    // record belongs.
    if (!normalized.statementDate) {
      throw new UndatedStatementError();
    }
    const statementDate = new Date(normalized.statementDate);
    const dueDate = normalized.dueDate ? new Date(normalized.dueDate) : null;

    // ── Supersede a previous import of the same period ─────────
    //
    // (businessId, issuer, statementDate) identifies a statement: the account
    // it belongs to, who issued it, and the period it closes. A second import
    // of the same key is a correction or a retry, not a second statement.
    //
    // Superseded rather than overwritten or deleted. Overwriting would keep
    // `reconciled: true` over figures nobody has reviewed; deleting would
    // destroy the record an advisor already signed off against. So the old row
    // stays, marked and pointing at its replacement, and the new row starts
    // unreconciled.
    const previous = await this.prisma.statementRecord.findFirst({
      where: {
        tenantId: input.tenantId,
        businessId: input.businessId,
        issuer: normalized.issuer,
        statementDate,
        supersededAt: null,
      },
      select: { id: true, reconciled: true },
    });

    const record = await this.prisma.statementRecord.create({
      data: {
        tenantId: input.tenantId,
        businessId: input.businessId,
        cardApplicationId: input.cardApplicationId ?? null,
        issuer: normalized.issuer,
        statementDate,
        closingBalance: normalized.closingBalance ?? null,
        minimumPayment: normalized.minimumPayment ?? null,
        dueDate,
        interestCharged: normalized.interestCharged ?? null,
        feesCharged: normalized.feesCharged ?? null,
        sourceDocumentId: input.sourceDocumentId ?? null,
        normalizedData: normalized as unknown as Prisma.InputJsonValue,
        anomalies: anomalies as unknown as Prisma.InputJsonValue,
        reconciled: false,
      },
    });

    if (previous) {
      await this.prisma.statementRecord.update({
        where: { id: previous.id },
        data: { supersededAt: new Date(), supersededById: record.id },
      });
    }

    svc.info('Statement ingested', {
      statementRecordId: record.id,
      supersededStatementRecordId: previous?.id ?? null,
      issuer: normalized.issuer,
      anomalyCount: anomalies.length,
      balanceMismatch: balanceMismatchDetected,
      feeAnomaly: feeAnomalyDetected,
    });

    // ── Publish to Canonical Ledger ────────────────────────────
    await this.eventBus.publishAndPersist(input.tenantId, {
      eventType: STATEMENT_EVENT_TYPES.STATEMENT_INGESTED,
      aggregateType: STATEMENT_AGGREGATE,
      aggregateId: record.id,
      payload: {
        statementRecordId: record.id,
        businessId: input.businessId,
        issuer: normalized.issuer,
        statementDate: normalized.statementDate,
        closingBalance: normalized.closingBalance,
        minimumPayment: normalized.minimumPayment,
        dueDate: normalized.dueDate,
        feesCharged: normalized.feesCharged,
        interestCharged: normalized.interestCharged,
        transactionCount: normalized.transactions.length,
        anomalyCount: anomalies.length,
        supersededStatementRecordId: previous?.id ?? null,
        supersededReconciledStatement: previous?.reconciled ?? false,
        warnings: normalized.warnings,
      },
      metadata: { source: 'statement-reconciliation-service' },
    });

    if (anomalies.length > 0) {
      await this.eventBus.publishAndPersist(input.tenantId, {
        eventType: STATEMENT_EVENT_TYPES.STATEMENT_ANOMALY_DETECTED,
        aggregateType: STATEMENT_AGGREGATE,
        aggregateId: record.id,
        payload: {
          statementRecordId: record.id,
          businessId: input.businessId,
          issuer: normalized.issuer,
          anomalies,
          balanceMismatchDetected,
          feeAnomalyDetected,
        },
        metadata: {
          source: 'statement-reconciliation-service',
          severity: anomalies.some((a) => a.severity === 'critical') ? 'critical' : 'high',
          requiresReview: true,
        },
      });
    }

    return {
      statementRecordId: record.id,
      normalized,
      anomalies,
      balanceMismatchDetected,
      feeAnomalyDetected,
      supersededStatementRecordId: previous?.id ?? null,
      supersededReconciledStatement: previous?.reconciled ?? false,
    };
  }

  // ── List Statements ───────────────────────────────────────

  async listStatements(
    tenantId: string,
    businessId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ statements: StatementSummary[]; total: number }> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId },
      select: { id: true },
    });
    if (!business) {
      throw new BusinessNotFoundError(businessId);
    }

    const [records, total] = await this.prisma.$transaction([
      this.prisma.statementRecord.findMany({
        // Superseded rows are excluded: a corrected import replaces the one
        // before it, and listing both would show a client two statements for
        // one period, which is the duplication the constraint exists to stop.
        // They remain addressable by id.
        where: { tenantId, businessId, supersededAt: null },
        orderBy: { statementDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.statementRecord.count({
        where: { tenantId, businessId, supersededAt: null },
      }),
    ]);

    const statements: StatementSummary[] = records.map((r: (typeof records)[number]) => {
      const anomalies = Array.isArray(r.anomalies) ? r.anomalies : [];
      return {
        id: r.id,
        issuer: r.issuer,
        statementDate: r.statementDate,
        closingBalance: r.closingBalance === null ? null : Number(r.closingBalance),
        minimumPayment: r.minimumPayment === null ? null : Number(r.minimumPayment),
        dueDate: r.dueDate,
        feesCharged: r.feesCharged === null ? null : Number(r.feesCharged),
        interestCharged: r.interestCharged === null ? null : Number(r.interestCharged),
        anomalyCount: anomalies.length,
        reconciled: r.reconciled,
        reconciledByUserId: r.reconciledByUserId,
        reconciledAt: r.reconciledAt,
        createdAt: r.createdAt,
      };
    });

    return { statements, total };
  }

  // ── Statement Detail ──────────────────────────────────────

  async getStatementDetail(
    tenantId: string,
    statementId: string,
  ): Promise<{
    record: Record<string, unknown>;
    normalized: NormalizedStatement | null;
    anomalies: StatementAnomaly[];
  }> {
    const record = await this.prisma.statementRecord.findFirst({
      where: { id: statementId, tenantId },
    });
    if (!record) {
      throw new StatementNotFoundError(statementId);
    }

    const normalized = record.normalizedData as unknown as NormalizedStatement | null;
    const anomalies = (
      Array.isArray(record.anomalies) ? record.anomalies : []
    ) as unknown as StatementAnomaly[];

    return { record, normalized, anomalies };
  }

  // ── Anomalies for Business ────────────────────────────────

  async getAnomaliesForBusiness(
    tenantId: string,
    businessId: string,
    severityFilter?: 'low' | 'medium' | 'high' | 'critical',
  ): Promise<
    Array<{
      statementId: string;
      issuer: string;
      statementDate: Date | null;
      anomalies: StatementAnomaly[];
    }>
  > {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, tenantId },
      select: { id: true },
    });
    if (!business) {
      throw new BusinessNotFoundError(businessId);
    }

    const records = await this.prisma.statementRecord.findMany({
      where: {
        tenantId,
        businessId,
        // Superseded imports are excluded. Counting their anomalies alongside
        // the live record's is how a retried ingest doubled a client's
        // anomaly count.
        supersededAt: null,
        // Only fetch records that have anomalies (non-empty JSON array)
        NOT: { anomalies: { equals: Prisma.DbNull } },
      },
      orderBy: { statementDate: 'desc' },
      select: { id: true, issuer: true, statementDate: true, anomalies: true },
    });

    return records
      .map((r: (typeof records)[number]) => {
        let anomalies = (
          Array.isArray(r.anomalies) ? r.anomalies : []
        ) as unknown as StatementAnomaly[];

        if (severityFilter) {
          anomalies = anomalies.filter((a) => a.severity === severityFilter);
        }

        return {
          statementId: r.id,
          issuer: r.issuer,
          statementDate: r.statementDate,
          anomalies,
        };
      })
      .filter((r: { anomalies: StatementAnomaly[] }) => r.anomalies.length > 0);
  }

  // ── Reconciliation ────────────────────────────────────────

  /**
   * Mark a statement as reconciled after advisor review.
   * Publishes STATEMENT_RECONCILED to the Canonical Ledger.
   */
  async reconcileStatement(
    input: ReconcileStatementInput,
  ): Promise<{ statementId: string; reconciled: boolean; reconciledAt: Date }> {
    const svc = logger.child({
      service: 'StatementReconciliationService',
      tenantId: input.tenantId,
    });

    // No actor, no sign-off. The route defaulted this to 'system'.
    if (!input.reconciledBy || input.reconciledBy === 'system') {
      throw new UnattributedReconciliationError();
    }

    const existing = await this.prisma.statementRecord.findFirst({
      where: { id: input.statementId, tenantId: input.tenantId },
    });
    if (!existing) {
      throw new StatementNotFoundError(input.statementId);
    }
    if (existing.reconciled) {
      throw new StatementAlreadyReconciledError(input.statementId);
    }

    const reconciledAt = new Date();

    await this.prisma.statementRecord.update({
      where: { id: input.statementId },
      data: {
        reconciled: true,
        // These used to exist only in the ledger event published below —
        // after, and outside, this update. A failed publish left a statement
        // reconciled by nobody, and no read could say otherwise.
        reconciledByUserId: input.reconciledBy,
        reconciledAt,
        reconciliationNotes: input.notes ?? null,
      },
    });

    svc.info('Statement reconciled', {
      statementId: input.statementId,
      reconciledBy: input.reconciledBy,
    });

    await this.eventBus.publishAndPersist(input.tenantId, {
      eventType: STATEMENT_EVENT_TYPES.STATEMENT_RECONCILED,
      aggregateType: STATEMENT_AGGREGATE,
      aggregateId: input.statementId,
      payload: {
        statementId: input.statementId,
        reconciledBy: input.reconciledBy,
        notes: input.notes ?? null,
        reconciledAt: reconciledAt.toISOString(),
        issuer: existing.issuer,
        businessId: existing.businessId,
      },
      metadata: { source: 'statement-reconciliation-service' },
    });

    return { statementId: input.statementId, reconciled: true, reconciledAt };
  }

  // ── Email Parser Stub ─────────────────────────────────────

  /**
   * Parse a forwarded statement email body to extract raw statement fields.
   *
   * This is a stub implementation that:
   *   - Detects issuer from sender email domain or body patterns
   *   - Uses regex patterns to extract key numeric fields
   *   - Returns a partial RawStatementData for downstream normalization
   *
   * Production enhancement path:
   *   - Replace regex with ML-based extraction (e.g. fine-tuned NER model)
   *   - Add per-issuer HTML email templates with structured selectors
   *   - Integrate with email ingestion service (e.g. Postmark inbound)
   */
  parseEmailStatement(
    emailBody: string,
    senderEmail?: string,
  ): EmailStatementParseResult {
    const matchedPatterns: string[] = [];
    const notes: string[] = [];
    const extractedFields: Partial<RawStatementData> = {};

    // ── Detect issuer from sender domain ───────────────────────
    let issuer: string | null = null;
    if (senderEmail) {
      const domain = senderEmail.split('@')[1]?.toLowerCase() ?? '';
      for (const [d, name] of Object.entries(ISSUER_SENDER_MAP)) {
        if (domain.includes(d)) {
          issuer = name;
          extractedFields.issuer = name;
          matchedPatterns.push(`sender_domain:${d}`);
          break;
        }
      }
    }

    // ── Fallback: detect issuer from email body ────────────────
    if (!issuer) {
      for (const [, name] of Object.entries(ISSUER_SENDER_MAP)) {
        if (emailBody.toLowerCase().includes(name.toLowerCase())) {
          issuer = name;
          extractedFields.issuer = name;
          matchedPatterns.push(`body_mention:${name}`);
          break;
        }
      }
    }

    // ── Extract numeric fields via regex ───────────────────────
    for (const [fieldName, pattern] of Object.entries(EMAIL_PATTERNS)) {
      const match = emailBody.match(pattern);
      if (match?.[1]) {
        (extractedFields as Record<string, unknown>)[fieldName] = match[1].trim();
        matchedPatterns.push(`field:${fieldName}`);
      }
    }

    const recognized =
      issuer !== null ||
      Object.keys(extractedFields).length > 1;

    if (!recognized) {
      notes.push(
        'Email body did not match any known issuer or statement pattern. ' +
        'Manual parsing may be required.',
      );
    }

    const missingFields = [
      'closingBalance', 'minimumPayment', 'dueDate', 'statementDate',
    ].filter((f) => !(f in extractedFields));

    if (missingFields.length > 0) {
      notes.push(
        `The following fields could not be extracted: ${missingFields.join(', ')}. ` +
        'Statement may need manual entry.',
      );
    }

    return { recognized, issuer, extractedFields, matchedPatterns, notes };
  }

  // ── Fee Anomaly Detection ─────────────────────────────────

  /**
   * Detect anomalous fees within a normalized statement. One statement — this
   * has never read another one.
   *
   * Checks:
   *   1. Unexpected fee types — overlimit, returned payment, foreign
   *      transaction, cash advance.
   *   2. Duplicate charge candidates, from two places:
   *      (a) rows the statement carried more than once, collapsed by the
   *          normalizer and handed over on `removedDuplicates`;
   *      (b) the same description and amount on different dates, within
   *          `transactions`.
   *      (a) used to be deleted before this ran, which is how the module came
   *          to delete what it exists to find. (b) is the weaker signal —
   *          two identical subscription renewals look exactly like it — so
   *          the two are reported at different severities and say which they
   *          are.
   *   3. Fee spike — a fee more than 2× the average of the OTHER FEES ON THIS
   *      STATEMENT. Not a prior-period average; there is no prior period.
   */
  detectFeeAnomalies(normalized: NormalizedStatement): StatementAnomaly[] {
    const anomalies: StatementAnomaly[] = [];
    const feeTransactions = normalized.transactions.filter((t) => t.isFee);

    // ── Check 1: Unexpected fee types ─────────────────────────
    const HIGH_RISK_FEE_PATTERNS = [
      { pattern: /overlimit/i, label: 'overlimit fee', type: 'overlimit_fee' as AnomalyType },
      { pattern: /returned payment/i, label: 'returned payment fee', type: 'unexpected_fee' as AnomalyType },
      { pattern: /foreign transaction/i, label: 'foreign transaction fee', type: 'unexpected_fee' as AnomalyType },
      { pattern: /cash advance fee/i, label: 'cash advance fee', type: 'unexpected_fee' as AnomalyType },
    ];

    for (const txn of feeTransactions) {
      for (const { pattern, label, type } of HIGH_RISK_FEE_PATTERNS) {
        if (pattern.test(txn.description)) {
          anomalies.push({
            type,
            severity: type === 'overlimit_fee' ? 'high' : 'medium',
            description: `${label} detected: "${txn.description}" on ${txn.transactionDate}.`,
            amount: txn.amount,
            transactionRef: txn.description,
          });
        }
      }
    }

    // ── Check 2a: rows the statement carried more than once ───
    //
    // Same date, same amount, same merchant. The strongest duplicate signal
    // there is, and until 2026-09-01 it was the one thrown away: the
    // normalizer collapsed these rows and reported a count, so the charge a
    // cardholder would dispute never reached this function.
    const repeated = new Map<string, { count: number; amount: number; desc: string; date: string }>();
    for (const txn of normalized.removedDuplicates ?? []) {
      const key = `${txn.transactionDate}|${txn.description.slice(0, 30).toLowerCase()}|${txn.amount.toFixed(2)}`;
      const existing = repeated.get(key);
      if (existing) {
        existing.count++;
      } else {
        repeated.set(key, {
          // The collapsed row plus the one kept in `transactions`.
          count: 2,
          amount: txn.amount,
          desc: txn.description,
          date: txn.transactionDate,
        });
      }
    }
    for (const [, entry] of repeated) {
      anomalies.push({
        type: 'duplicate_charge',
        severity: 'high',
        description:
          `Duplicate charge candidate: "${entry.desc}" appears ${entry.count} times on `
          + `${entry.date} at $${entry.amount.toFixed(2)} each. Same date, same amount, `
          + 'same merchant — either the issuer charged twice or the import repeated a '
          + `row, and nothing here can tell which. $${(entry.amount * (entry.count - 1)).toFixed(2)} `
          + 'is excluded from the balance check for this reason.',
        // What is in dispute is the excess, not the whole charge.
        amount: entry.amount * (entry.count - 1),
        transactionRef: entry.desc,
      });
    }

    // ── Check 2b: same description and amount, different dates ─
    //
    // The weaker signal, and the one this used to report on its own. Two
    // identical subscription renewals in a period look exactly like this, so
    // it is `medium` and says what it is rather than asserting a duplicate.
    const chargeSeen = new Map<string, { count: number; amount: number; desc: string }>();
    for (const txn of normalized.transactions) {
      if (!txn.isFee && !txn.isInterest && txn.amount > 0) {
        const key = `${txn.description.slice(0, 30).toLowerCase()}|${txn.amount.toFixed(2)}`;
        const existing = chargeSeen.get(key);
        if (existing) {
          existing.count++;
        } else {
          chargeSeen.set(key, { count: 1, amount: txn.amount, desc: txn.description });
        }
      }
    }
    for (const [, entry] of chargeSeen) {
      if (entry.count > 1) {
        anomalies.push({
          type: 'duplicate_charge',
          severity: 'medium',
          description:
            `Repeated charge: "${entry.desc}" appears ${entry.count} times at `
            + `$${entry.amount.toFixed(2)} each, on different dates. A recurring charge `
            + 'looks the same as a duplicated one from a single statement.',
          amount: entry.amount * entry.count,
          transactionRef: entry.desc,
        });
      }
    }

    // ── Check 3: Fee spike ────────────────────────────────────
    if (feeTransactions.length > 1) {
      const feeAmounts = feeTransactions.map((t) => Math.abs(t.amount));
      for (let i = 0; i < feeTransactions.length; i++) {
        const txn = feeTransactions[i]!;
        // Leave out THIS fee, by position — not every fee that happens to have
        // the same value. `filter(a => a !== amount)` dropped both of two
        // identical $39 fees, so each was compared against an average neither
        // of them was in.
        const otherAmounts = feeAmounts.filter((_, j) => j !== i);
        if (otherAmounts.length === 0) continue;
        const avgFee = otherAmounts.reduce((a, b) => a + b, 0) / otherAmounts.length;
        if (Math.abs(txn.amount) > avgFee * FEE_SPIKE_MULTIPLIER) {
          anomalies.push({
            type: 'fee_spike',
            severity: 'medium',
            description:
              `Fee spike: "${txn.description}" at $${Math.abs(txn.amount).toFixed(2)} `
              + `is more than ${FEE_SPIKE_MULTIPLIER}× the average of the other fees on `
              + `this statement ($${avgFee.toFixed(2)}). Not a prior-period average — `
              + 'nothing here reads a previous statement.',
            amount: txn.amount,
            transactionRef: txn.description,
          });
        }
      }
    }

    return anomalies;
  }

  // ── Balance Mismatch Detection ────────────────────────────

  /**
   * Detect balance discrepancies in a normalized statement.
   *
   * Expected closing balance formula:
   *   previousBalance + totalCharges - totalPayments + interestCharged + feesCharged
   *     ≈ closingBalance (within $0.50 tolerance)
   *
   * When previousBalance or closingBalance is unavailable the check is skipped
   * (partial statement — already flagged by normalizer).
   *
   * `transactions` has repeated rows collapsed out of it while the issuer's
   * reported closing balance still contains them, so any mismatch names the
   * amount those rows would have contributed.
   */
  detectBalanceMismatch(normalized: NormalizedStatement): StatementAnomaly[] {
    const anomalies: StatementAnomaly[] = [];

    const { closingBalance, previousBalance, interestCharged, feesCharged } = normalized;

    // Need previous and closing balance for the check
    if (previousBalance === null || closingBalance === null) return anomalies;

    // And interest and fees. They used to be folded in as `?? 0`, which makes
    // the expected balance too low, the delta large, and the anomaly
    // 'critical' at delta > 50 — so a statement that simply did not carry an
    // interest field manufactured a critical mismatch about money that
    // reconciles fine.
    //
    // It persists, too: anomalies are computed once at ingest and stored, and
    // the report endpoint reads them back rather than recomputing. A phantom
    // critical from a missing field stayed on the record forever.
    //
    // So the check does not run, and says why instead of guessing.
    if (interestCharged === null || feesCharged === null) {
      const missing = [
        interestCharged === null ? 'interest charged' : null,
        feesCharged === null ? 'fees charged' : null,
      ].filter(Boolean).join(' and ');
      anomalies.push({
        type: 'reconciliation_not_possible',
        severity: 'low',
        description:
          `Balance reconciliation was not performed: ${missing} is not present on this `
          + 'statement. This is not a mismatch — it is a check that could not run.',
        amount: null,
      });
      return anomalies;
    }

    // Sum charges (positive transactions) and payments (negative transactions)
    const totalCharges = normalized.transactions
      .filter((t) => t.amount > 0 && !t.isInterest && !t.isFee)
      .reduce((sum, t) => sum + t.amount, 0);

    const totalPayments = normalized.transactions
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const expectedBalance =
      previousBalance +
      totalCharges -
      totalPayments +
      interestCharged +
      feesCharged;

    const delta = Math.abs(expectedBalance - closingBalance);

    // What the collapsed rows would have contributed, had they been kept.
    //
    // The issuer's reported closing balance contains every row it charged. The
    // expected balance above is computed from `transactions`, which has the
    // repeated rows collapsed out. So a genuine double charge made the delta
    // exactly its own amount, and the report called it a balance mismatch —
    // critical over $50 — rather than the duplicate it is.
    //
    // Neither reading can be settled here, so the check names the amount it
    // may be off by instead of picking one, the same way
    // `reconciliation_not_possible` names the field it could not read.
    const removedSum = (normalized.removedDuplicates ?? []).reduce(
      (sum, t) => sum + t.amount,
      0,
    );
    const removedNote =
      removedSum !== 0
        ? ` This may be off by $${Math.abs(removedSum).toFixed(2)}: rows the statement `
          + 'carried more than once were collapsed before this arithmetic, and they are '
          + 'reported separately as duplicate-charge candidates. If the issuer really '
          + 'charged twice, that is the whole of this delta.'
        : '';

    if (delta > BALANCE_MISMATCH_TOLERANCE) {
      // A delta explained entirely by the collapsed rows is not evidence of a
      // second, separate discrepancy — so it does not also escalate on size.
      const explainedByDuplicates =
        removedSum !== 0
        && Math.abs(delta - Math.abs(removedSum)) <= BALANCE_MISMATCH_TOLERANCE;

      anomalies.push({
        type: 'balance_mismatch',
        severity: explainedByDuplicates
          ? 'medium'
          : delta > 50 ? 'critical' : delta > 10 ? 'high' : 'medium',
        description:
          `Balance mismatch detected: expected closing balance $${expectedBalance.toFixed(2)}, `
          + `reported $${closingBalance.toFixed(2)} (delta: $${delta.toFixed(2)}).`
          + removedNote,
        amount: delta,
        transactionRef: null,
      });
    }

    return anomalies;
  }
}

// EmailStatementParseResult is already exported above via its interface declaration.
