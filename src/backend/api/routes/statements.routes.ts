// ============================================================
// CapitalForge — Statement Reconciliation Routes
//
// POST   /api/businesses/:id/statements             — ingest statement
// GET    /api/businesses/:id/statements             — list statements
// GET    /api/statements/:statementId               — detail w/ normalized data
// GET    /api/businesses/:id/statements/anomalies   — anomaly report
// POST   /api/businesses/:id/statements/:statementId/reconcile — mark reconciled
// POST   /api/statements/parse-email               — email parser stub
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
