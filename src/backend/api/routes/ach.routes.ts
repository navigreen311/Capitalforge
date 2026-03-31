// ============================================================
// CapitalForge — ACH / Debit Authorization Routes
//
// POST   /api/businesses/:id/ach/authorize        — create authorization
// DELETE /api/businesses/:id/ach/:authId          — revoke authorization
// GET    /api/businesses/:id/ach                  — list authorizations
// POST   /api/ach/debit-event                     — record debit + tolerance check
// GET    /api/businesses/:id/ach/alerts           — unauthorized debit alerts
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { AchControlsService } from '../../services/ach-controls.service.js';
import { DebitMonitor } from '../../services/debit-monitor.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

export const achRouter = Router({ mergeParams: true });

// Lazy singletons — avoid instantiating Prisma/EventBus during import
let achService: AchControlsService | null = null;
let debitMonitor: DebitMonitor | null = null;

function getAchService(): AchControlsService {
  if (!achService) achService = new AchControlsService();
  return achService;
}

function getDebitMonitor(): DebitMonitor {
  if (!debitMonitor) debitMonitor = new DebitMonitor();
  return debitMonitor;
}

/** Inject dependencies (used in tests and app bootstrap). */
export function configureAchRouter(
  service: AchControlsService,
  monitor: DebitMonitor,
): void {
  achService = service;
  debitMonitor = monitor;
}

// ── Helpers ──────────────────────────────────────────────────

function tenantId(req: Request): string {
  return req.tenantContext?.tenantId ?? 'unknown';
}

function handleError(res: Response, err: unknown, context: string): void {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`ACH route error [${context}]`, { error: message });

  // Surface validation / not-found messages as 4xx
  if (
    message.includes('not found') ||
    message.includes('does not belong') ||
    message.includes('already revoked')
  ) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message },
    } satisfies ApiResponse);
    return;
  }

  if (
    message.includes('rejected') ||
    message.includes('required') ||
    message.includes('must be a positive')
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

// ── POST /api/businesses/:id/ach/authorize ────────────────────
//
// Create a new signed ACH authorization.
//
// Required body fields:
//   processorName       — name of the ACH processor / MCA funder
//   authorizedAmount    — maximum single-debit amount (dollars)
//   authorizedFrequency — e.g. "weekly", "bi-weekly", "monthly"
//   signedDocumentRef   — document vault reference for the signed auth
//   authorizedAt        — ISO timestamp of physical signing
// ─────────────────────────────────────────────────────────────
achRouter.post(
  '/businesses/:id/ach/authorize',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = req.params.id;
    const tid = tenantId(req);

    try {
      const {
        processorName,
        authorizedAmount,
        authorizedFrequency,
        signedDocumentRef,
        authorizedAt,
      } = req.body as Record<string, unknown>;

      // Basic presence validation
      if (!processorName || typeof processorName !== 'string') {
        res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'processorName is required.' },
        } satisfies ApiResponse);
        return;
      }
      if (typeof authorizedAmount !== 'number' || authorizedAmount <= 0) {
        res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'authorizedAmount must be a positive number.',
          },
        } satisfies ApiResponse);
        return;
      }
      if (!authorizedFrequency || typeof authorizedFrequency !== 'string') {
        res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'authorizedFrequency is required.' },
        } satisfies ApiResponse);
        return;
      }
      if (!signedDocumentRef || typeof signedDocumentRef !== 'string') {
        res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'signedDocumentRef is required — must reference the signed authorization document.',
          },
        } satisfies ApiResponse);
        return;
      }
      if (!authorizedAt || typeof authorizedAt !== 'string') {
        res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'authorizedAt (ISO timestamp) is required.' },
        } satisfies ApiResponse);
        return;
      }

      const authorization = await getAchService().createAuthorization({
        tenantId: tid,
        businessId,
        processorName,
        authorizedAmount,
        authorizedFrequency,
        signedDocumentRef,
        authorizedAt,
      });

      res.status(201).json({
        success: true,
        data: authorization,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'POST /ach/authorize');
    }
  },
);

// ── DELETE /api/businesses/:id/ach/:authId ────────────────────
//
// Revoke an ACH authorization.
// Immediately notifies all processors via the event bus.
//
// Required body fields:
//   revocationReason — why the authorization is being revoked
// ─────────────────────────────────────────────────────────────
achRouter.delete(
  '/businesses/:id/ach/:authId',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = req.params.id;
    const authorizationId = req.params.authId;
    const tid = tenantId(req);
    const revokedBy = req.tenantContext?.userId ?? 'system';

    try {
      const { revocationReason } = req.body as Record<string, unknown>;

      if (!revocationReason || typeof revocationReason !== 'string') {
        res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'revocationReason is required.' },
        } satisfies ApiResponse);
        return;
      }

      const revoked = await getAchService().revokeAuthorization({
        tenantId: tid,
        businessId,
        authorizationId,
        revokedBy,
        revocationReason,
      });

      res.status(200).json({
        success: true,
        data: revoked,
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'DELETE /ach/:authId');
    }
  },
);

// ── GET /api/businesses/:id/ach ───────────────────────────────
//
// List all ACH authorizations for a business, including debit
// event history for audit purposes.
// ─────────────────────────────────────────────────────────────
achRouter.get(
  '/businesses/:id/ach',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = req.params.id;
    const tid = tenantId(req);

    try {
      const authorizations =
        await getAchService().getAuthorizationsForBusiness(tid, businessId);

      res.status(200).json({
        success: true,
        data: authorizations,
        meta: { total: authorizations.length },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'GET /ach');
    }
  },
);

// ── POST /api/ach/debit-event ─────────────────────────────────
//
// Record an incoming debit event and immediately run the tolerance
// check.  Intended to be called by the processor webhook handler.
//
// Required body fields:
//   tenantId         — tenant scoping (processor webhooks must supply this)
//   authorizationId  — links the debit to a specific authorization
//   amount           — actual debit amount (dollars)
//   processedAt      — ISO timestamp of when the debit was processed
//
// Optional:
//   frequency        — frequency descriptor for this debit
// ─────────────────────────────────────────────────────────────
achRouter.post(
  '/ach/debit-event',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const {
        tenantId: bodyTenantId,
        authorizationId,
        amount,
        frequency,
        processedAt,
      } = req.body as Record<string, unknown>;

      // Tenant can come from auth middleware or body (webhook scenario)
      const tid =
        req.tenantContext?.tenantId ??
        (typeof bodyTenantId === 'string' ? bodyTenantId : undefined);

      if (!tid) {
        res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'tenantId is required.' },
        } satisfies ApiResponse);
        return;
      }
      if (!authorizationId || typeof authorizationId !== 'string') {
        res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'authorizationId is required.' },
        } satisfies ApiResponse);
        return;
      }
      if (typeof amount !== 'number' || amount <= 0) {
        res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'amount must be a positive number.' },
        } satisfies ApiResponse);
        return;
      }
      if (!processedAt || typeof processedAt !== 'string') {
        res.status(422).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'processedAt (ISO timestamp) is required.',
          },
        } satisfies ApiResponse);
        return;
      }

      const result = await getAchService().recordDebitEvent({
        tenantId: tid,
        authorizationId,
        amount,
        frequency: typeof frequency === 'string' ? frequency : undefined,
        processedAt,
      });

      const statusCode = result.flagged ? 200 : 201;

      res.status(statusCode).json({
        success: true,
        data: {
          debitEventId: result.debitEvent.id,
          flagged: result.flagged,
          isWithinTolerance: result.isWithinTolerance,
          flagReasons: result.flagReasons,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'POST /ach/debit-event');
    }
  },
);

// ── GET /api/businesses/:id/ach/alerts ────────────────────────
//
// Return all unauthorized debit alerts for a business.
// Ordered newest-first.
// ─────────────────────────────────────────────────────────────
achRouter.get(
  '/businesses/:id/ach/alerts',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const businessId = req.params.id;
    const tid = tenantId(req);

    try {
      const alerts = await getAchService().getUnauthorizedAlerts(tid, businessId);

      res.status(200).json({
        success: true,
        data: alerts,
        meta: { total: alerts.length },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(res, err, 'GET /ach/alerts');
    }
  },
);
