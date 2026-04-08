// ============================================================
// CapitalForge — Spend Governance & Business-Purpose Routes
//
// POST   /api/businesses/:id/transactions                    — record transaction
// GET    /api/businesses/:id/transactions                    — list with filters
// GET    /api/businesses/:id/transactions/risk-summary       — risk summary
// GET    /api/businesses/:id/business-purpose/export         — tax export
//
// Optional extended endpoints:
// POST   /api/businesses/:id/transactions/:txId/tag          — tag business purpose
// POST   /api/businesses/:id/transactions/:txId/match-invoice — invoice match
// GET    /api/businesses/:id/business-purpose/violations      — network-rule violations
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { SpendGovernanceService } from '../../services/spend-governance.service.js';
import { BusinessPurposeEvidenceService } from '../../services/business-purpose-evidence.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

export const spendGovernanceRouter = Router({ mergeParams: true });

// ── Lazy singletons ───────────────────────────────────────────

let spendService: SpendGovernanceService | null = null;
let evidenceService: BusinessPurposeEvidenceService | null = null;

function getSpendService(): SpendGovernanceService {
  if (!spendService) spendService = new SpendGovernanceService();
  return spendService;
}

function getEvidenceService(): BusinessPurposeEvidenceService {
  if (!evidenceService) evidenceService = new BusinessPurposeEvidenceService();
  return evidenceService;
}

/** Inject dependencies (used in tests and app bootstrap). */
export function configureSpendGovernanceRouter(
  spend: SpendGovernanceService,
  evidence: BusinessPurposeEvidenceService,
): void {
  spendService = spend;
  evidenceService = evidence;
}

// ── Helpers ───────────────────────────────────────────────────

function tenantId(req: Request): string {
  return req.tenantContext?.tenantId ?? 'unknown';
}

function handleError(res: Response, err: unknown, context: string): void {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Spend governance route error [${context}]`, { error: message });

  if (message.includes('not found')) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message },
    } satisfies ApiResponse);
    return;
  }

  if (
    message.includes('required') ||
    message.includes('cannot be empty') ||
    message.includes('must be') ||
    message.includes('before endDate') ||
    message.includes('valid ISO')
  ) {
    res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message },
    } satisfies ApiResponse);
    return;
  }

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  } satisfies ApiResponse);
}

// ── POST /api/businesses/:id/transactions ─────────────────────
//
// Record a new spend transaction.
//
// Required body fields:
//   amount          — transaction amount in dollars (positive number)
//   transactionDate — ISO date string
//
// Optional body fields:
//   cardApplicationId — links to a specific card
//   merchantName      — merchant display name
//   mcc               — 4-digit Merchant Category Code
//   businessPurpose   — free-text business-purpose note
//   evidenceDocId     — document vault reference for receipt/invoice
// ─────────────────────────────────────────────────────────────
spendGovernanceRouter.post(
  '/businesses/:id/transactions',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = req.params.id;
    const tid = tenantId(req);

    try {
      const {
        amount,
        transactionDate,
        cardApplicationId,
        merchantName,
        mcc,
        businessPurpose,
        evidenceDocId,
      } = req.body as Record<string, unknown>;

      if (typeof amount !== 'number' || amount <= 0) {
        res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'amount must be a positive number.' },
        } satisfies ApiResponse);
        return;
      }

      if (!transactionDate || typeof transactionDate !== 'string') {
        res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'transactionDate (ISO date string) is required.',
          },
        } satisfies ApiResponse);
        return;
      }

      const transaction = await getSpendService().recordTransaction({
        tenantId: tid,
        businessId,
        amount,
        transactionDate,
        cardApplicationId: typeof cardApplicationId === 'string' ? cardApplicationId : undefined,
        merchantName: typeof merchantName === 'string' ? merchantName : undefined,
        mcc: typeof mcc === 'string' ? mcc : undefined,
        businessPurpose: typeof businessPurpose === 'string' ? businessPurpose : undefined,
        evidenceDocId: typeof evidenceDocId === 'string' ? evidenceDocId : undefined,
      });

      res.status(201).json({
        success: true,
        data: transaction,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'POST /transactions');
    }
  },
);

// ── GET /api/businesses/:id/transactions ──────────────────────
//
// List transactions with optional filters.
//
// Query params (all optional):
//   mcc               — filter by MCC code
//   flagged           — "true" | "false"
//   isCashLike        — "true" | "false"
//   startDate         — ISO date
//   endDate           — ISO date
//   minAmount         — minimum amount
//   maxAmount         — maximum amount
//   cardApplicationId — filter by card
//   page              — page number (default: 1)
//   pageSize          — items per page (default: 50, max: 200)
// ─────────────────────────────────────────────────────────────
spendGovernanceRouter.get(
  '/businesses/:id/transactions',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = req.params.id;
    const tid = tenantId(req);

    try {
      const q = req.query as Record<string, string | undefined>;

      const result = await getSpendService().listTransactions(tid, businessId, {
        mcc: q['mcc'],
        flagged: q['flagged'] != null ? q['flagged'] === 'true' : undefined,
        isCashLike: q['isCashLike'] != null ? q['isCashLike'] === 'true' : undefined,
        startDate: q['startDate'],
        endDate: q['endDate'],
        minAmount: q['minAmount'] != null ? parseFloat(q['minAmount']!) : undefined,
        maxAmount: q['maxAmount'] != null ? parseFloat(q['maxAmount']!) : undefined,
        cardApplicationId: q['cardApplicationId'],
        page: q['page'] != null ? parseInt(q['page']!, 10) : undefined,
        pageSize: q['pageSize'] != null ? parseInt(q['pageSize']!, 10) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result.transactions,
        meta: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'GET /transactions');
    }
  },
);

// ── GET /api/businesses/:id/transactions/risk-summary ─────────
//
// Aggregate risk summary for a business.
// Includes:
//   • Total / flagged / cash-like counts and amounts
//   • Average MCC risk score
//   • Chargeback ratio
//   • Top high-risk, cash-like, and suspicious-rail transactions
//   • Overall risk level: low | moderate | high | critical
// ─────────────────────────────────────────────────────────────
spendGovernanceRouter.get(
  '/businesses/:id/transactions/risk-summary',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = req.params.id;
    const tid = tenantId(req);

    try {
      const summary = await getSpendService().getRiskSummary(tid, businessId);

      res.status(200).json({
        success: true,
        data: summary,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'GET /transactions/risk-summary');
    }
  },
);

// ── GET /api/businesses/:id/business-purpose/export ───────────
//
// Export tax substantiation data for a business over a date range.
//
// Required query params:
//   startDate — ISO date (e.g. 2025-01-01)
//   endDate   — ISO date (e.g. 2025-12-31)
//
// Returns:
//   • Per-transaction lines with tax category, Schedule C line,
//     deductibility, and evidence reference
//   • Category-level and overall summary
// ─────────────────────────────────────────────────────────────
spendGovernanceRouter.get(
  '/businesses/:id/business-purpose/export',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = req.params.id;
    const tid = tenantId(req);

    try {
      const { startDate, endDate } = req.query as Record<string, string | undefined>;

      if (!startDate || !endDate) {
        res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'startDate and endDate query parameters are required.',
          },
        } satisfies ApiResponse);
        return;
      }

      const exportData = await getEvidenceService().exportTaxSubstantiation(
        tid,
        businessId,
        startDate,
        endDate,
      );

      res.status(200).json({
        success: true,
        data: exportData,
        meta: { total: exportData.lines.length },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'GET /business-purpose/export');
    }
  },
);

// ── POST /api/businesses/:id/transactions/:txId/tag ───────────
//
// Tag a transaction with a business purpose and optional evidence doc.
//
// Required body fields:
//   businessPurpose — free-text description of business purpose
//
// Optional body fields:
//   evidenceDocId   — document vault reference for receipt/invoice
// ─────────────────────────────────────────────────────────────
spendGovernanceRouter.post(
  '/businesses/:id/transactions/:txId/tag',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = req.params.id;
    const transactionId = req.params.txId;
    const tid = tenantId(req);

    try {
      const { businessPurpose, evidenceDocId } = req.body as Record<string, unknown>;

      if (!businessPurpose || typeof businessPurpose !== 'string') {
        res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'businessPurpose is required.',
          },
        } satisfies ApiResponse);
        return;
      }

      const tagged = await getEvidenceService().tagTransaction({
        transactionId,
        tenantId: tid,
        businessId,
        businessPurpose,
        evidenceDocId: typeof evidenceDocId === 'string' ? evidenceDocId : undefined,
      });

      res.status(200).json({
        success: true,
        data: tagged,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'POST /transactions/:txId/tag');
    }
  },
);

// ── POST /api/businesses/:id/transactions/:txId/match-invoice ──
//
// Attempt to match a transaction to an invoice document in the vault.
//
// Required body fields:
//   invoiceRef — document vault ID or storage key for the invoice
//
// Optional body fields:
//   amountTolerance — dollar tolerance for amount matching (default: 1.00)
//   dateTolerance   — day tolerance for date matching (default: 5)
// ─────────────────────────────────────────────────────────────
spendGovernanceRouter.post(
  '/businesses/:id/transactions/:txId/match-invoice',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = req.params.id;
    const transactionId = req.params.txId;
    const tid = tenantId(req);

    try {
      const { invoiceRef, amountTolerance, dateTolerance } = req.body as Record<string, unknown>;

      if (!invoiceRef || typeof invoiceRef !== 'string') {
        res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'invoiceRef is required.' },
        } satisfies ApiResponse);
        return;
      }

      const result = await getEvidenceService().matchTransactionToInvoice({
        tenantId: tid,
        businessId,
        transactionId,
        invoiceRef,
        amountTolerance: typeof amountTolerance === 'number' ? amountTolerance : undefined,
        dateTolerance: typeof dateTolerance === 'number' ? dateTolerance : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'POST /transactions/:txId/match-invoice');
    }
  },
);

// ── GET /api/businesses/:id/business-purpose/violations ───────
//
// List all transactions with network-rule violations (personal-use
// spend, cash-like MCCs, suspicious payment rails).
//
// Optional query params:
//   startDate — ISO date
//   endDate   — ISO date
// ─────────────────────────────────────────────────────────────
spendGovernanceRouter.get(
  '/businesses/:id/business-purpose/violations',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = req.params.id;
    const tid = tenantId(req);

    try {
      const { startDate, endDate } = req.query as Record<string, string | undefined>;

      const violations = await getEvidenceService().getNetworkRuleViolations(
        tid,
        businessId,
        startDate,
        endDate,
      );

      res.status(200).json({
        success: true,
        data: violations,
        meta: { total: violations.length },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'GET /business-purpose/violations');
    }
  },
);

// ── In-memory stores for mock violation ack & business purpose ──

const acknowledgedViolations: Record<string, { acknowledgedAt: string; acknowledgedBy: string }> = {};
const businessPurposeUpdates: Record<string, { businessPurpose: string; updatedAt: string }> = {};

// ── POST /api/spend-governance/violations/:id/acknowledge ────
//
// Acknowledge a violation by ID.
// Body: { acknowledgedBy?: string }

spendGovernanceRouter.post(
  '/violations/:id/acknowledge',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const violationId = req.params.id;
    const { acknowledgedBy } = req.body as Record<string, unknown>;

    const ack = {
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: typeof acknowledgedBy === 'string' ? acknowledgedBy : 'system',
    };

    acknowledgedViolations[violationId] = ack;

    logger.info('Violation acknowledged', { violationId, ...ack });

    res.status(200).json({
      success: true,
      data: {
        violationId,
        ...ack,
        status: 'acknowledged',
      },
    } satisfies ApiResponse);
  },
);

// ── PATCH /api/spend-governance/transactions/:id/business-purpose ──
//
// Update the business purpose for a transaction.
// Body: { businessPurpose: string }

spendGovernanceRouter.patch(
  '/transactions/:id/business-purpose',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const transactionId = req.params.id;
    const { businessPurpose } = req.body as Record<string, unknown>;

    if (!businessPurpose || typeof businessPurpose !== 'string') {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'businessPurpose (string) is required.' },
      } satisfies ApiResponse);
      return;
    }

    const update = {
      businessPurpose,
      updatedAt: new Date().toISOString(),
    };

    businessPurposeUpdates[transactionId] = update;

    logger.info('Business purpose updated', { transactionId, businessPurpose });

    res.status(200).json({
      success: true,
      data: {
        transactionId,
        ...update,
      },
    } satisfies ApiResponse);
  },
);

// ── POST /api/spend-governance/export-evidence ───────────────
//
// Export a mock text evidence report for spend governance compliance.

spendGovernanceRouter.post(
  '/export-evidence',
  async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const report = [
      'SPEND GOVERNANCE EVIDENCE REPORT',
      `Generated: ${new Date().toISOString()}`,
      '='.repeat(50),
      '',
      'Summary:',
      '  Total transactions reviewed: 142',
      '  Violations found: 3',
      '  Violations acknowledged: 2',
      '  Unresolved: 1',
      '',
      'Violation Details:',
      '  1. [ACK] Personal purchase at Best Buy — $249.99 — acknowledged 2026-03-15',
      '  2. [ACK] Cash-like MCC at Western Union — $500.00 — acknowledged 2026-03-18',
      '  3. [OPEN] Suspicious merchant "CryptoEx" — $1,200.00 — pending review',
      '',
      'Business Purpose Coverage:',
      '  Transactions with purpose tagged: 138 / 142 (97.2%)',
      '  Evidence documents attached: 130 / 142 (91.5%)',
      '',
      'END OF REPORT',
    ].join('\n');

    logger.info('Spend governance evidence report exported');

    res.status(200).json({
      success: true,
      data: {
        format: 'text',
        report,
        generatedAt: new Date().toISOString(),
      },
    } satisfies ApiResponse);
  },
);
