// ============================================================
// CapitalForge — Decline Recovery Routes
//
// Endpoints:
//   GET    /api/businesses/:id/declines
//   GET    /api/declines              — list all declined applications with recovery stage
//   GET    /api/declines/:id
//   POST   /api/declines/:id/reconsideration
//   PATCH  /api/declines/:id/stage    — advance recovery stage
//   PATCH  /api/declines/:id/resolve  — mark Won (updates app to approved) or Lost
//   GET    /api/declines/stats        — win rate, avg recovery time, stage counts
//   GET    /api/declines/:id/cooldown
//
// All routes require a valid tenant JWT. TenantContext attached via tenantMiddleware.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { z, ZodError } from 'zod';
import { PrismaClient } from '@prisma/client';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import {
  listDeclinesByBusiness,
  getDeclineRecovery,
  generateAndStoreReconsiderationLetter,
  getDeclineCooldown,
} from '../../services/decline-recovery.service.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Lazy Prisma singleton ────────────────────────────────────

let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

// ── Router ────────────────────────────────────────────────────

export const declineRecoveryRouter = Router();

// All routes require a valid tenant JWT
declineRecoveryRouter.use(tenantMiddleware);

// ── Validation Schemas ────────────────────────────────────────

const ReconsiderationBodySchema = z.object({
  businessName: z.string().min(1, 'businessName is required'),
});

const RECOVERY_STAGES = [
  'new',
  'letter_sent',
  'recon_call_scheduled',
  'recon_call_completed',
  'reapplication_ready',
  'reapplied',
  'won',
  'lost',
] as const;

const StageAdvanceSchema = z.object({
  stage: z.enum(RECOVERY_STAGES),
});

const ResolveSchema = z.object({
  outcome: z.enum(['won', 'lost']),
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

// ── GET /api/declines ────────────────────────────────────────
// List all declined applications with their recovery stage for the tenant.

declineRecoveryRouter.get(
  '/declines',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Tenant context is required.');
      return;
    }

    try {
      const prisma = getPrisma();
      const records = await prisma.declineRecovery.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });

      // The board names the client on every row, and the recovery record
      // carries only a businessId. Resolved here in one query rather than
      // leaving the client to fetch a business per row — and left null when
      // the id resolves to nothing, so a missing client reads as missing
      // rather than as a blank name.
      const businesses = await prisma.business.findMany({
        where: { tenantId, id: { in: records.map((r) => r.businessId) } },
        select: { id: true, legalName: true, dba: true },
      });
      const nameOf = new Map(businesses.map((b) => [b.id, b.dba ?? b.legalName]));

      const data = records.map((r) => ({
        ...r,
        businessName: nameOf.get(r.businessId) ?? null,
      }));

      const body: ApiResponse = { success: true, data, meta: { total: data.length } };
      res.status(200).json(body);
    } catch (err) {
      handleUnexpected(err, res, 'GET /declines');
    }
  },
);

// ── GET /api/declines/stats ─────────────────────────────────
// Win rate, avg recovery time, count per stage.

declineRecoveryRouter.get(
  '/declines/stats',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Tenant context is required.');
      return;
    }

    try {
      const prisma = getPrisma();
      const all = await prisma.declineRecovery.findMany({ where: { tenantId } });

      // Stage counts
      const stageCounts: Record<string, number> = {};
      for (const stage of RECOVERY_STAGES) {
        stageCounts[stage] = 0;
      }
      for (const r of all) {
        const stage = (r as Record<string, unknown>).recoveryStage as string ?? 'new';
        stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
      }

      // Win rate: won / (won + lost), and null until something is resolved.
      // It used to be 0 in that case, which reads as losing every one.
      const resolved = all.filter(
        (r) => r.recoveryStage === 'won' || r.recoveryStage === 'lost',
      );
      const wonCount = resolved.filter((r) => r.recoveryStage === 'won').length;
      const winRate =
        resolved.length > 0 ? Math.round((wonCount / resolved.length) * 100) : null;

      // Average days to resolve, measured from the date of the decline.
      //
      // This used to measure from createdAt — when the row was written. A
      // decline logged after the fact, which the log-decline form exists to
      // do, then produced a recovery that finished before it started: the
      // seeded records reported an average of -157 days. The decline date is
      // carried on declineReasons.declined_at; createdAt is the fallback for
      // records written at the time of the decline.
      const spans = resolved
        .filter((r) => r.resolvedAt !== null)
        .map((r) => {
          const reasons = r.declineReasons as Record<string, unknown> | null;
          const declaredAt = typeof reasons?.['declined_at'] === 'string'
            ? new Date(reasons['declined_at'] as string)
            : null;
          const start =
            declaredAt !== null && !Number.isNaN(declaredAt.getTime())
              ? declaredAt
              : r.createdAt;
          return Math.ceil(
            (new Date(r.resolvedAt as Date).getTime() - start.getTime()) / 86_400_000,
          );
        })
        // A negative span means the dates disagree, not a recovery that took
        // less than no time. Excluded rather than averaged in.
        .filter((days) => days >= 0);

      const avgRecoveryDays =
        spans.length > 0
          ? Math.round(spans.reduce((sum, d) => sum + d, 0) / spans.length)
          : null;

      const body: ApiResponse = {
        success: true,
        data: {
          totalDeclines: all.length,
          stageCounts,
          winRate,
          wonCount,
          lostCount: resolved.length - wonCount,
          avgRecoveryDays,
          // How many resolved records the average is actually drawn from, so
          // a mean over one record is not read as a mean over the board.
          avgRecoveryBasedOn: spans.length,
        },
      };
      res.status(200).json(body);
    } catch (err) {
      handleUnexpected(err, res, 'GET /declines/stats');
    }
  },
);

// ── GET /api/declines/:id ────────────────────────────────────
// Registered after /declines and /declines/stats deliberately. Express
// matches in registration order, so while this sat above them a request for
// /api/declines/stats bound id="stats" and answered 404 with "Decline
// recovery record stats not found" — an endpoint that existed, was mounted,
// and could not be reached.
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


// ── PATCH /api/declines/:id/stage ───────────────────────────
// Advance the recovery stage for a decline record.

declineRecoveryRouter.patch(
  '/declines/:id/stage',
  async (req: Request, res: Response): Promise<void> => {
    const recoveryId = req.params['id'] as string;
    const tenantId = req.tenant?.tenantId;

    if (!recoveryId || !tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Recovery ID and tenant context are required.');
      return;
    }

    const parsed = StageAdvanceSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 422, 'VALIDATION_ERROR', 'Invalid stage value.', parsed.error.flatten().fieldErrors);
      return;
    }

    try {
      const prisma = getPrisma();
      const existing = await prisma.declineRecovery.findFirst({ where: { id: recoveryId, tenantId } });
      if (!existing) {
        sendError(res, 404, 'NOT_FOUND', `Decline recovery record ${recoveryId} not found.`);
        return;
      }

      const updated = await prisma.declineRecovery.update({
        where: { id: recoveryId },
        data: { recoveryStage: parsed.data.stage },
      });

      logger.info('[DeclineRecoveryRoutes] Stage advanced', {
        recoveryId,
        stage: parsed.data.stage,
        tenantId,
      });

      const body: ApiResponse = { success: true, data: updated };
      res.status(200).json(body);
    } catch (err) {
      handleUnexpected(err, res, 'PATCH /declines/:id/stage');
    }
  },
);

// ── PATCH /api/declines/:id/resolve ─────────────────────────
// Mark a decline recovery as Won (updates CardApplication to approved) or Lost.

declineRecoveryRouter.patch(
  '/declines/:id/resolve',
  async (req: Request, res: Response): Promise<void> => {
    const recoveryId = req.params['id'] as string;
    const tenantId = req.tenant?.tenantId;

    if (!recoveryId || !tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Recovery ID and tenant context are required.');
      return;
    }

    const parsed = ResolveSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 422, 'VALIDATION_ERROR', 'Invalid outcome. Must be "won" or "lost".', parsed.error.flatten().fieldErrors);
      return;
    }

    try {
      const prisma = getPrisma();
      const existing = await prisma.declineRecovery.findFirst({ where: { id: recoveryId, tenantId } });
      if (!existing) {
        sendError(res, 404, 'NOT_FOUND', `Decline recovery record ${recoveryId} not found.`);
        return;
      }

      const now = new Date();

      // Update the recovery record
      const updated = await prisma.declineRecovery.update({
        where: { id: recoveryId },
        data: {
          recoveryStage: parsed.data.outcome,
          reconsiderationStatus: parsed.data.outcome === 'won' ? 'approved' : 'denied',
          resolvedAt: now,
        },
      });

      // If Won, update the associated CardApplication status to approved
      if (parsed.data.outcome === 'won') {
        await prisma.cardApplication.updateMany({
          where: { id: existing.applicationId, businessId: existing.businessId },
          data: { status: 'approved', decidedAt: now },
        });

        logger.info('[DeclineRecoveryRoutes] Application status updated to approved via recon win', {
          recoveryId,
          applicationId: existing.applicationId,
        });
      }

      logger.info('[DeclineRecoveryRoutes] Decline resolved', {
        recoveryId,
        outcome: parsed.data.outcome,
        tenantId,
      });

      const body: ApiResponse = { success: true, data: updated };
      res.status(200).json(body);
    } catch (err) {
      handleUnexpected(err, res, 'PATCH /declines/:id/resolve');
    }
  },
);

export default declineRecoveryRouter;
