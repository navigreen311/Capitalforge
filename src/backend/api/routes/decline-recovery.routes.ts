// ============================================================
// CapitalForge — Decline Recovery Routes
//
// Endpoints:
//   GET  /api/businesses/:id/declines
//     List all decline recovery records for a business.
//
//   GET  /api/declines/:id
//     Retrieve a single decline recovery record (with categorized reasons).
//
//   POST /api/declines/:id/reconsideration
//     Generate an ECOA-compliant reconsideration letter for the decline.
//     Body: { businessName: string }
//
//   GET  /api/declines/:id/cooldown
//     Return the reapply cooldown calendar for this issuer decline.
//
// All routes require a valid tenant JWT. TenantContext attached via tenantMiddleware.
// ============================================================

import { Router, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import {
  listDeclinesByBusiness,
  getDeclineRecovery,
  generateAndStoreReconsiderationLetter,
  getDeclineCooldown,
} from '../../services/decline-recovery.service.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────

export const declineRecoveryRouter = Router();

// All routes require a valid tenant JWT
declineRecoveryRouter.use(tenantMiddleware);

// ── Validation Schemas ────────────────────────────────────────

const ReconsiderationBodySchema = z.object({
  businessName: z.string().min(1, 'businessName is required'),
});

// ── Helpers ───────────────────────────────────────────────────

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiResponse = {
    success: false,
    error: { code, message, details },
  };
  res.status(status).json(body);
}

function handleUnexpected(err: unknown, res: Response, context: string): void {
  if (err instanceof ZodError) {
    sendError(res, 422, 'VALIDATION_ERROR', 'Invalid request body.', err.flatten().fieldErrors);
    return;
  }
  logger.error(`[DeclineRecoveryRoutes] Unexpected error in ${context}`, {
    error: err instanceof Error ? err.message : String(err),
  });
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}

// ── GET /api/businesses/:id/declines ─────────────────────────
// List all decline recovery records for a business, most recent first.

declineRecoveryRouter.get(
  '/businesses/:id/declines',
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'] as string;
    const tenantId   = req.tenant?.tenantId;

    if (!businessId || !tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Business ID and tenant context are required.');
      return;
    }

    try {
      const records = await listDeclinesByBusiness(businessId, tenantId);

      const body: ApiResponse<typeof records> = {
        success: true,
        data:    records,
        meta:    { total: records.length },
      };
      res.status(200).json(body);
    } catch (err) {
      handleUnexpected(err, res, 'GET /businesses/:id/declines');
    }
  },
);

// ── GET /api/declines/:id ────────────────────────────────────
// Retrieve a single decline recovery record with full reason detail.

declineRecoveryRouter.get(
  '/declines/:id',
  async (req: Request, res: Response): Promise<void> => {
    const recoveryId = req.params['id'] as string;
    const tenantId   = req.tenant?.tenantId;

    if (!recoveryId || !tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Recovery ID and tenant context are required.');
      return;
    }

    try {
      const record = await getDeclineRecovery(recoveryId, tenantId);

      if (!record) {
        sendError(res, 404, 'NOT_FOUND', `Decline recovery record ${recoveryId} not found.`);
        return;
      }

      const body: ApiResponse<typeof record> = { success: true, data: record };
      res.status(200).json(body);
    } catch (err) {
      handleUnexpected(err, res, 'GET /declines/:id');
    }
  },
);

// ── POST /api/declines/:id/reconsideration ───────────────────
// Generate an ECOA-compliant reconsideration letter for a specific decline.
// Body: { businessName: string }

declineRecoveryRouter.post(
  '/declines/:id/reconsideration',
  async (req: Request, res: Response): Promise<void> => {
    const recoveryId = req.params['id'] as string;
    const tenantId   = req.tenant?.tenantId;

    if (!recoveryId || !tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Recovery ID and tenant context are required.');
      return;
    }

    const parsed = ReconsiderationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(
        res,
        422,
        'VALIDATION_ERROR',
        'Invalid request body.',
        parsed.error.flatten().fieldErrors,
      );
      return;
    }

    try {
      const result = await generateAndStoreReconsiderationLetter(
        recoveryId,
        tenantId,
        parsed.data.businessName,
      );

      logger.info('[DeclineRecoveryRoutes] Reconsideration letter generated', {
        recoveryId,
        letterId:   result.letter.letterId,
        tenantId,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        sendError(res, 404, 'NOT_FOUND', err.message);
        return;
      }
      handleUnexpected(err, res, 'POST /declines/:id/reconsideration');
    }
  },
);

// ── GET /api/declines/:id/cooldown ───────────────────────────
// Return the reapply cooldown calendar for this issuer decline.
// Includes daysRemaining, reapplyEligibleAt, isEligibleNow.

declineRecoveryRouter.get(
  '/declines/:id/cooldown',
  async (req: Request, res: Response): Promise<void> => {
    const recoveryId = req.params['id'] as string;
    const tenantId   = req.tenant?.tenantId;

    if (!recoveryId || !tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Recovery ID and tenant context are required.');
      return;
    }

    try {
      const calendar = await getDeclineCooldown(recoveryId, tenantId);

      if (!calendar) {
        sendError(res, 404, 'NOT_FOUND', `Decline recovery record ${recoveryId} not found.`);
        return;
      }

      const body: ApiResponse<typeof calendar> = { success: true, data: calendar };
      res.status(200).json(body);
    } catch (err) {
      handleUnexpected(err, res, 'GET /declines/:id/cooldown');
    }
  },
);

export default declineRecoveryRouter;
