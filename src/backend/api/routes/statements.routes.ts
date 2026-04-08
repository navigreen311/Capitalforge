// ============================================================
// CapitalForge — Statement Reconciliation Routes
//
// POST   /api/businesses/:id/statements             — ingest statement
// GET    /api/businesses/:id/statements             — list statements
// GET    /api/statements/:statementId               — detail w/ normalized data
// GET    /api/businesses/:id/statements/anomalies   — anomaly report
// POST   /api/businesses/:id/statements/:statementId/reconcile — mark reconciled
// POST   /api/statements/parse-email               — email parser stub
//
// Client-level statement & anomaly management:
// GET    /api/statements?client_id=X                — mock statement list
// GET    /api/statements/:id/line-items             — mock transactions, payments, fees, recon diff
// POST   /api/statements/anomalies/:id/dismiss      — dismiss anomaly
// POST   /api/statements/anomalies/:id/steps/:step  — complete investigation step
// POST   /api/statements/disputes                   — log dispute
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import {
  StatementReconciliationService,
} from '../../services/statement-reconciliation.service.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

export const statementsRouter = Router({ mergeParams: true });

// ── Lazy singleton ────────────────────────────────────────────

let reconciliationService: StatementReconciliationService | null = null;

function getService(): StatementReconciliationService {
  if (!reconciliationService) {
    reconciliationService = new StatementReconciliationService();
  }
  return reconciliationService;
}

/** Inject a pre-configured service instance (used in tests). */
export function configureStatementsRouter(
  service: StatementReconciliationService,
): void {
  reconciliationService = service;
}

// ── Helpers ───────────────────────────────────────────────────

function tenantId(req: Request): string {
  return req.tenant?.tenantId ?? 'unknown';
}

function handleError(res: Response, err: unknown, context: string): void {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Statements route error [${context}]`, { error: message });

  if (
    message.includes('not found') ||
    message.includes('does not belong')
  ) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message },
    } satisfies ApiResponse);
    return;
  }

  if (
    message.includes('already reconciled') ||
    message.includes('required') ||
    message.includes('must be')
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

// ── POST /api/businesses/:id/statements ───────────────────────
//
// Ingest a statement for a business.
//
// Body fields:
//   rawData        — raw statement object (issuer-specific shape)
//   cardApplicationId? — links to a CardApplication record
//   sourceDocumentId?  — links to a Document vault record
// ─────────────────────────────────────────────────────────────
statementsRouter.post(
  '/businesses/:id/statements',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = String(req.params.id);
    const tid = tenantId(req);

    try {
      const { rawData, cardApplicationId, sourceDocumentId } =
        req.body as Record<string, unknown>;

      if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
        res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'rawData is required and must be an object.',
          },
        } satisfies ApiResponse);
        return;
      }

      const result = await getService().ingestStatement({
        tenantId: tid,
        businessId,
        rawData: rawData as Record<string, unknown>,
        cardApplicationId:
          typeof cardApplicationId === 'string' ? cardApplicationId : null,
        sourceDocumentId:
          typeof sourceDocumentId === 'string' ? sourceDocumentId : null,
      });

      res.status(201).json({
        success: true,
        data: {
          statementRecordId: result.statementRecordId,
          issuer: result.normalized.issuer,
          statementDate: result.normalized.statementDate,
          closingBalance: result.normalized.closingBalance,
          minimumPayment: result.normalized.minimumPayment,
          dueDate: result.normalized.dueDate,
          anomalyCount: result.anomalies.length,
          balanceMismatchDetected: result.balanceMismatchDetected,
          feeAnomalyDetected: result.feeAnomalyDetected,
          warnings: result.normalized.warnings,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'POST /businesses/:id/statements');
    }
  },
);

// ── GET /api/businesses/:id/statements ────────────────────────
//
// List statements for a business (paginated).
//
// Query params:
//   limit  — default 50, max 200
//   offset — default 0
// ─────────────────────────────────────────────────────────────
statementsRouter.get(
  '/businesses/:id/statements',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = String(req.params.id);
    const tid = tenantId(req);

    try {
      const rawLimit = parseInt(String(req.query['limit'] ?? '50'), 10);
      const limit = isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, 200);
      const rawOffset = parseInt(String(req.query['offset'] ?? '0'), 10);
      const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

      const { statements, total } = await getService().listStatements(
        tid,
        businessId,
        limit,
        offset,
      );

      res.status(200).json({
        success: true,
        data: { statements, limit, offset },
        meta: { total },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'GET /businesses/:id/statements');
    }
  },
);

// ── GET /api/statements/:statementId ──────────────────────────
//
// Retrieve a single statement with full normalized data and anomalies.
// ─────────────────────────────────────────────────────────────
statementsRouter.get(
  '/statements/:statementId',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const statementId = String(req.params.statementId);
    const tid = tenantId(req);

    try {
      const { record, normalized, anomalies } =
        await getService().getStatementDetail(tid, statementId);

      res.status(200).json({
        success: true,
        data: {
          record,
          normalized,
          anomalies,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'GET /statements/:statementId');
    }
  },
);

// ── GET /api/businesses/:id/statements/anomalies ──────────────
//
// Return all anomaly reports for a business across all statements.
//
// Query params:
//   severity — filter by: low | medium | high | critical
// ─────────────────────────────────────────────────────────────
statementsRouter.get(
  '/businesses/:id/statements/anomalies',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = String(req.params.id);
    const tid = tenantId(req);

    try {
      const rawSeverity = String(req.query['severity'] ?? '');
      const validSeverities = ['low', 'medium', 'high', 'critical'] as const;
      type Severity = (typeof validSeverities)[number];
      const severity = validSeverities.includes(rawSeverity as Severity)
        ? (rawSeverity as Severity)
        : undefined;

      const anomalyReports = await getService().getAnomaliesForBusiness(
        tid,
        businessId,
        severity,
      );

      const totalAnomalies = anomalyReports.reduce(
        (sum, r) => sum + r.anomalies.length, 0,
      );

      res.status(200).json({
        success: true,
        data: {
          reports: anomalyReports,
          statementCount: anomalyReports.length,
          totalAnomalies,
          severityFilter: severity ?? null,
        },
        meta: { total: totalAnomalies },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'GET /businesses/:id/statements/anomalies');
    }
  },
);

// ── POST /api/businesses/:id/statements/:statementId/reconcile ─
//
// Mark a statement as reconciled after advisor review.
//
// Body fields:
//   notes? — optional reconciliation notes
// ─────────────────────────────────────────────────────────────
statementsRouter.post(
  '/businesses/:id/statements/:statementId/reconcile',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const statementId = String(req.params.statementId);
    const tid = tenantId(req);
    const reconciledBy = req.tenant?.userId ?? 'system';

    try {
      const { notes } = req.body as Record<string, unknown>;

      const result = await getService().reconcileStatement({
        tenantId: tid,
        statementId,
        reconciledBy,
        notes: typeof notes === 'string' ? notes : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'POST /businesses/:id/statements/:statementId/reconcile');
    }
  },
);

// ── POST /api/statements/parse-email ──────────────────────────
//
// Parse a forwarded statement email body to extract raw fields.
// The caller should then submit extractedFields to the ingest endpoint.
//
// Body fields:
//   emailBody   — plain-text or HTML email body
//   senderEmail? — sender address for issuer detection
// ─────────────────────────────────────────────────────────────
statementsRouter.post(
  '/statements/parse-email',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const { emailBody, senderEmail } = req.body as Record<string, unknown>;

      if (!emailBody || typeof emailBody !== 'string' || emailBody.trim().length === 0) {
        res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'emailBody is required and must be a non-empty string.',
          },
        } satisfies ApiResponse);
        return;
      }

      const parsed = getService().parseEmailStatement(
        emailBody,
        typeof senderEmail === 'string' ? senderEmail : undefined,
      );

      res.status(200).json({
        success: true,
        data: parsed,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'POST /statements/parse-email');
    }
  },
);

// ============================================================
// Client-Level Statement & Anomaly Management (Mock Endpoints)
// ============================================================

// In-memory state for anomaly dismissals, investigation steps, and disputes
const dismissedAnomalies: Record<string, { dismissedAt: string; reason: string }> = {};
const completedSteps: Record<string, { completedAt: string; notes: string }> = {};
const disputes: Array<{
  id: string;
  statementId: string;
  clientId: string;
  reason: string;
  amount: number;
  createdAt: string;
}> = [];

// ── GET /api/statements?client_id=X ─────────────────────────
//
// Returns a mock list of statements for a client.

statementsRouter.get(
  '/',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const clientId = typeof req.query['client_id'] === 'string' ? req.query['client_id'] : '';

    if (!clientId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'client_id query parameter is required.' },
      } satisfies ApiResponse);
      return;
    }

    logger.debug('GET statements list', { clientId });

    const statements = [
      {
        id: 'stmt-001',
        cardId: 'card-amex-plat',
        cardName: 'Amex Business Platinum',
        issuer: 'American Express',
        statementDate: '2026-03-15',
        closingBalance: 12450.32,
        minimumPayment: 622.52,
        dueDate: '2026-04-10',
        status: 'reviewed',
        anomalyCount: 1,
      },
      {
        id: 'stmt-002',
        cardId: 'card-chase-sapphire',
        cardName: 'Chase Sapphire Reserve',
        issuer: 'Chase',
        statementDate: '2026-03-18',
        closingBalance: 8320.15,
        minimumPayment: 416.01,
        dueDate: '2026-04-13',
        status: 'pending_review',
        anomalyCount: 2,
      },
      {
        id: 'stmt-003',
        cardId: 'card-amex-gold',
        cardName: 'Amex Business Gold',
        issuer: 'American Express',
        statementDate: '2026-03-20',
        closingBalance: 5670.88,
        minimumPayment: 283.54,
        dueDate: '2026-04-15',
        status: 'reconciled',
        anomalyCount: 0,
      },
    ];

    res.status(200).json({
      success: true,
      data: { clientId, statements },
      meta: { total: statements.length },
    } satisfies ApiResponse);
  },
);

// ── GET /api/statements/:id/line-items ───────────────────────
//
// Returns mock transactions, payments, fees, and reconciliation
// differences for a specific statement.

statementsRouter.get(
  '/:id/line-items',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const statementId = String(req.params['id']);

    logger.debug('GET statement line-items', { statementId });

    const data = {
      statementId,
      transactions: [
        { id: 'txn-001', date: '2026-03-02', description: 'Office Depot - Supplies', amount: 347.89, category: 'office_supplies', mcc: '5943' },
        { id: 'txn-002', date: '2026-03-05', description: 'Delta Air Lines', amount: 1245.00, category: 'travel', mcc: '3058' },
        { id: 'txn-003', date: '2026-03-08', description: 'AWS Cloud Services', amount: 2890.42, category: 'technology', mcc: '7372' },
        { id: 'txn-004', date: '2026-03-12', description: 'Uber for Business', amount: 156.30, category: 'transportation', mcc: '4121' },
        { id: 'txn-005', date: '2026-03-15', description: 'WeWork Membership', amount: 800.00, category: 'office_rent', mcc: '6513' },
      ],
      payments: [
        { id: 'pmt-001', date: '2026-03-01', amount: -5000.00, method: 'ACH', reference: 'ACH-20260301-001' },
      ],
      fees: [
        { id: 'fee-001', type: 'annual_fee', description: 'Annual Card Fee', amount: 695.00, date: '2026-03-01' },
        { id: 'fee-002', type: 'interest', description: 'Interest Charge', amount: 89.12, date: '2026-03-15', apr: 21.49 },
      ],
      reconDiff: {
        expectedBalance: 12450.32,
        calculatedBalance: 12438.73,
        difference: 11.59,
        status: 'mismatch' as const,
        possibleCauses: [
          'Pending transaction not yet posted',
          'Rounding differences across multi-currency transactions',
        ],
      },
    };

    res.status(200).json({
      success: true,
      data,
    } satisfies ApiResponse);
  },
);

// ── POST /api/statements/anomalies/:id/dismiss ──────────────
//
// Dismiss a statement anomaly.

statementsRouter.post(
  '/anomalies/:id/dismiss',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const anomalyId = String(req.params['id']);
    const { reason } = req.body as Record<string, unknown>;

    if (!reason || typeof reason !== 'string') {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'reason is required and must be a string.' },
      } satisfies ApiResponse);
      return;
    }

    const entry = {
      dismissedAt: new Date().toISOString(),
      reason,
    };
    dismissedAnomalies[anomalyId] = entry;

    logger.info('Anomaly dismissed', { anomalyId, reason });

    res.status(200).json({
      success: true,
      data: {
        anomalyId,
        status: 'dismissed',
        ...entry,
      },
    } satisfies ApiResponse);
  },
);

// ── POST /api/statements/anomalies/:id/steps/:step ─────────
//
// Complete an investigation step for an anomaly.

statementsRouter.post(
  '/anomalies/:id/steps/:step',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const anomalyId = String(req.params['id']);
    const step = String(req.params['step']);
    const { notes } = req.body as Record<string, unknown>;

    const key = `${anomalyId}:${step}`;
    const entry = {
      completedAt: new Date().toISOString(),
      notes: typeof notes === 'string' ? notes : '',
    };
    completedSteps[key] = entry;

    logger.info('Investigation step completed', { anomalyId, step });

    res.status(200).json({
      success: true,
      data: {
        anomalyId,
        step,
        status: 'completed',
        ...entry,
      },
    } satisfies ApiResponse);
  },
);

// ── POST /api/statements/disputes ───────────────────────────
//
// Log a new dispute against a statement line item.

statementsRouter.post(
  '/disputes',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const { statementId, clientId, reason, amount } = req.body as Record<string, unknown>;

    if (!statementId || typeof statementId !== 'string') {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'statementId is required.' },
      } satisfies ApiResponse);
      return;
    }

    if (!reason || typeof reason !== 'string') {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'reason is required.' },
      } satisfies ApiResponse);
      return;
    }

    if (amount === undefined || typeof amount !== 'number' || amount <= 0) {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'amount must be a positive number.' },
      } satisfies ApiResponse);
      return;
    }

    const dispute = {
      id: `disp-${Date.now()}`,
      statementId,
      clientId: typeof clientId === 'string' ? clientId : 'unknown',
      reason,
      amount,
      createdAt: new Date().toISOString(),
    };
    disputes.push(dispute);

    logger.info('Statement dispute logged', { disputeId: dispute.id, statementId, amount });

    res.status(201).json({
      success: true,
      data: {
        ...dispute,
        status: 'open',
        estimatedResolution: '5-10 business days',
      },
    } satisfies ApiResponse);
  },
);
