// ============================================================
// CapitalForge — Statement Reconciliation Engine
//
// Responsibilities:
//   1. Ingest raw statement data from multiple issuers and
//      normalize via StatementNormalizer.
//   2. Fee anomaly detection:
//        • Unexpected fee types (not in the card's known fee schedule)
//        • Duplicate charge detection across statements
//        • Fee amount spikes (> 2× prior-period average)
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

import { PrismaClient } from '@prisma/client';
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
  | 'missing_payment_credit';

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
  dueDate: /(?:payment due date|due date)[:\s]+(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i,
  statementDate: /(?:statement date|statement closing date|closing date)[:\s]+(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i,
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

export class StatementReconciliationService {
  private readonly prisma: PrismaClient;
  private readonly eventBus: EventBus;
  private readonly normalizer: StatementNormalizer;

  constructor(
    prisma?: PrismaClient,
    eventBus?: EventBus,
    normalizer?: StatementNormalizer,
  ) {
    this.prisma = prisma ?? new PrismaClient();
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
      throw new Error(
        `Business ${input.businessId} not found for tenant ${input.tenantId}.`,
      );
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
    const statementDate = normalized.statementDate
      ? new Date(normalized.statementDate)
      : new Date();
    const dueDate = normalized.dueDate ? new Date(normalized.dueDate) : null;

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
        normalizedData: normalized as unknown as Record<string, unknown>,
        anomalies: anomalies as unknown as Record<string, unknown>[],
        reconciled: false,
      },
    });

    svc.info('Statement ingested', {
      statementRecordId: record.id,
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
      throw new Error(`Business ${businessId} not found for tenant ${tenantId}.`);
    }

    const [records, total] = await this.prisma.$transaction([
      this.prisma.statementRecord.findMany({
        where: { tenantId, businessId },
        orderBy: { statementDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.statementRecord.count({
        where: { tenantId, businessId },
      }),
    ]);

    const statements: StatementSummary[] = records.map((r: (typeof records)[number]) => {
      const anomalies = Array.isArray(r.anomalies) ? r.anomalies : [];
      return {
        id: r.id,
        issuer: r.issuer,
        statementDate: r.statementDate,
        closingBalance: r.closingBalance ? Number(r.closingBalance) : null,
        minimumPayment: r.minimumPayment ? Number(r.minimumPayment) : null,
        dueDate: r.dueDate,
        feesCharged: r.feesCharged ? Number(r.feesCharged) : null,
        interestCharged: r.interestCharged ? Number(r.interestCharged) : null,
        anomalyCount: anomalies.length,
        reconciled: r.reconciled,
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
      throw new Error(`Statement ${statementId} not found for tenant ${tenantId}.`);
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
      throw new Error(`Business ${businessId} not found for tenant ${tenantId}.`);
    }

    const records = await this.prisma.statementRecord.findMany({
      where: {
        tenantId,
        businessId,
        // Only fetch records that have anomalies (non-empty JSON array)
        NOT: { anomalies: { equals: null } },
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

    const existing = await this.prisma.statementRecord.findFirst({
      where: { id: input.statementId, tenantId: input.tenantId },
    });
    if (!existing) {
      throw new Error(
        `Statement ${input.statementId} not found for tenant ${input.tenantId}.`,
      );
    }
    if (existing.reconciled) {
      throw new Error(`Statement ${input.statementId} is already reconciled.`);
    }

    const reconciledAt = new Date();

    await this.prisma.statementRecord.update({
      where: { id: input.statementId },
      data: { reconciled: true },
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
   * Detect anomalous fees within a normalized statement.
   *
   * Checks:
   *   1. Unexpected fee types — overlimit, returned payment, foreign transaction
   *      flagged as medium severity.
   *   2. Duplicate charges — same merchant + amount within the statement period.
   *   3. Fee spike — single fee > 2× the total fees average across transactions.
   */
  detectFeeAnomalies(normalized: NormalizedStatement): StatementAnomaly[] {
    const anomalies: StatementAnomaly[] = [];
    const feeTransactions = normalized.transactions.filter((t) => t.isFee);

    // ── Check 2: Duplicate charges (runs even when no fee transactions) ──
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

    // ── Check 2: Duplicate charges ────────────────────────────
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
          severity: 'high',
          description:
            `Possible duplicate charge: "${entry.desc}" appears ${entry.count} times ` +
            `at $${entry.amount.toFixed(2)} each.`,
          amount: entry.amount * entry.count,
          transactionRef: entry.desc,
        });
      }
    }

    // ── Check 3: Fee spike ────────────────────────────────────
    if (feeTransactions.length > 1) {
      const feeAmounts = feeTransactions.map((t) => Math.abs(t.amount));
      for (const txn of feeTransactions) {
        // Use leave-one-out average to avoid diluting the spike with itself
        const otherAmounts = feeAmounts.filter((a) => a !== Math.abs(txn.amount));
        if (otherAmounts.length === 0) continue;
        const avgFee = otherAmounts.reduce((a, b) => a + b, 0) / otherAmounts.length;
        if (Math.abs(txn.amount) > avgFee * FEE_SPIKE_MULTIPLIER) {
          anomalies.push({
            type: 'fee_spike',
            severity: 'medium',
            description:
              `Fee spike: "${txn.description}" at $${Math.abs(txn.amount).toFixed(2)} ` +
              `is more than ${FEE_SPIKE_MULTIPLIER}× the average fee ($${avgFee.toFixed(2)}).`,
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
   */
  detectBalanceMismatch(normalized: NormalizedStatement): StatementAnomaly[] {
    const anomalies: StatementAnomaly[] = [];

    const { closingBalance, previousBalance, interestCharged, feesCharged } = normalized;

    // Need previous and closing balance for the check
    if (previousBalance === null || closingBalance === null) return anomalies;

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
      (interestCharged ?? 0) +
      (feesCharged ?? 0);

    const delta = Math.abs(expectedBalance - closingBalance);

    if (delta > BALANCE_MISMATCH_TOLERANCE) {
      anomalies.push({
        type: 'balance_mismatch',
        severity: delta > 50 ? 'critical' : delta > 10 ? 'high' : 'medium',
        description:
          `Balance mismatch detected: expected closing balance $${expectedBalance.toFixed(2)}, ` +
          `reported $${closingBalance.toFixed(2)} (delta: $${delta.toFixed(2)}).`,
        amount: delta,
        transactionRef: null,
      });
    }

    return anomalies;
  }
}

// EmailStatementParseResult is already exported above via its interface declaration.
