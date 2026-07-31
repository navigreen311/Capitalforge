// ============================================================
// CapitalForge — Decline Actions Routes
//
// Endpoints:
//   POST /api/declines                — create a new decline record
//   GET  /api/declines/analytics      — decline reason breakdown with counts and win rates
//   POST /api/declines/:id/reminder   — create a reminder task for reapply date
//
// All routes require a valid tenant JWT via tenantMiddleware.
// These complement the existing decline-recovery.routes.ts.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { z, ZodError } from 'zod';
import { PrismaClient } from '@prisma/client';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Lazy Prisma singleton ────────────────────────────────────

let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

// ── Router ────────────────────────────────────────────────────

export const declineActionsRouter = Router();

declineActionsRouter.use(tenantMiddleware);

// ── Validation Schemas ────────────────────────────────────────

const CreateDeclineSchema = z.object({
  client_id: z.string().min(1, 'client_id is required'),
  issuer: z.string().min(1, 'issuer is required'),
  card_name: z.string().min(1, 'card_name is required'),
  declined_at: z.string().datetime().optional(),
  decline_reason: z.string().min(1, 'decline_reason is required'),
  requested_limit: z.number().positive().optional(),
  notes: z.string().max(2000).optional(),
  // Optional, and empty when absent. It used to be filled with
  // `app_decline_${Date.now()}`, which looked like a link to an application
  // and resolved to nothing.
  application_id: z.string().min(1).max(255).optional(),
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
  logger.error(`[DeclineActionsRoutes] Unexpected error in ${context}`, {
    error: err instanceof Error ? err.message : String(err),
  });
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}

// ── POST /api/declines ──────────────────────────────────────
// Create a new decline record.

declineActionsRouter.post(
  '/declines',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Tenant context is required.');
      return;
    }

    const parsed = CreateDeclineSchema.safeParse(req.body);
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
      const prisma = getPrisma();
      const data = parsed.data;

      // The client must exist and belong to this tenant. Without the check a
      // typo produced a decline record attached to a business id that names
      // nothing, which then appears on the recovery board as a client nobody
      // can open.
      const business = await prisma.business.findFirst({
        where: { id: data.client_id, tenantId },
        select: { id: true },
      });
      if (!business) {
        sendError(res, 404, 'NOT_FOUND', 'No client with that id in this tenant.');
        return;
      }

      // A failure here used to be caught and answered with a fabricated
      // record and 201 Created: an id that was never written, which the
      // caller then held as a real decline. Nothing is invented now — a write
      // that fails is reported as a failure.
      const record = await prisma.declineRecovery.create({
        data: {
          tenantId,
          businessId: data.client_id,
          applicationId: data.application_id ?? '',
          issuer: data.issuer,
          declineReasons: {
            primary: data.decline_reason,
            card_name: data.card_name,
            requested_limit: data.requested_limit ?? null,
            declined_at: data.declined_at ?? new Date().toISOString(),
          },
          reconsiderationNotes: data.notes ?? null,
          recoveryStage: 'new',
        },
      });

      logger.info('[DeclineActionsRoutes] Decline record created', {
        declineId: (record as Record<string, unknown>).id,
        tenantId,
      });

      const body: ApiResponse = { success: true, data: record };
      res.status(201).json(body);
    } catch (err) {
      handleUnexpected(err, res, 'POST /declines');
    }
  },
);

// ── GET /api/declines/analytics ─────────────────────────────
// Returns decline reason breakdown with counts and win rates.

declineActionsRouter.get(
  '/declines/analytics',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Tenant context is required.');
      return;
    }

    try {
      const prisma = getPrisma();

      const all = await prisma.declineRecovery.findMany({ where: { tenantId } });

      // Group by decline reason (declineReasons is a JSON field)
      const reasonMap = new Map<string, { total: number; won: number; lost: number }>();
      for (const r of all) {
        const reasons = r.declineReasons as Record<string, unknown> | null;
        const reason = (reasons?.primary as string) ?? 'unknown';
        const stage = r.recoveryStage;
        if (!reasonMap.has(reason)) {
          reasonMap.set(reason, { total: 0, won: 0, lost: 0 });
        }
        const entry = reasonMap.get(reason)!;
        entry.total += 1;
        if (stage === 'won') entry.won += 1;
        if (stage === 'lost') entry.lost += 1;
      }

      // Win rate is won over *resolved*, and null when nothing is resolved
      // yet. Counting recoveries still in progress as losses would report a
      // failure rate for work that has not finished.
      const winRateOf = (won: number, lost: number): number | null =>
        won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;

      const breakdown = Array.from(reasonMap.entries()).map(([reason, counts]) => ({
        reason,
        total: counts.total,
        won: counts.won,
        lost: counts.lost,
        winRate: winRateOf(counts.won, counts.lost),
      }));

      // Issuer breakdown
      const issuerMap = new Map<string, { total: number; won: number; lost: number }>();
      for (const r of all) {
        const issuer = r.issuer ?? 'unknown';
        const stage = r.recoveryStage;
        if (!issuerMap.has(issuer)) {
          issuerMap.set(issuer, { total: 0, won: 0, lost: 0 });
        }
        const entry = issuerMap.get(issuer)!;
        entry.total += 1;
        if (stage === 'won') entry.won += 1;
        if (stage === 'lost') entry.lost += 1;
      }

      // This used to divide by total rather than by resolved, and fall back to
      // 0 — so one response carried two different figures both labelled
      // "winRate", and an issuer with three recoveries in progress and none
      // resolved reported 0%.
      const issuerBreakdown = Array.from(issuerMap.entries()).map(([issuer, counts]) => ({
        issuer,
        total: counts.total,
        won: counts.won,
        lost: counts.lost,
        winRate: winRateOf(counts.won, counts.lost),
      }));

      // A read failure used to be caught here and answered with an invented
      // breakdown — 47 declines, per-issuer win rates — returned as this
      // tenant's own figures with a 200, so a tenant with no declines saw a
      // busy chart. The query now stands on its own; a failure is a failure.
      const analytics = {
        totalDeclines: all.length,
        reasonBreakdown: breakdown,
        issuerBreakdown,
      };

      const body: ApiResponse = { success: true, data: analytics };
      res.status(200).json(body);
    } catch (err) {
      handleUnexpected(err, res, 'GET /declines/analytics');
    }
  },
);

// ── POST /api/declines/:id/reminder ─────────────────────────
//
// Answers 501. This endpoint used to return 201 Created with
// `{ id: "reminder_<timestamp>", status: "scheduled" }` and write nothing —
// there is no reminder table, no scheduler and no delivery path, so the
// reapply date it claimed to be watching would pass unnoticed. A caller that
// believed it lost the reapply window.
//
// Kept, rather than deleted, so the route reports its own absence instead of
// answering 404 as though the address were wrong.

declineActionsRouter.post(
  '/declines/:id/reminder',
  async (req: Request, res: Response): Promise<void> => {
    const declineId = req.params['id'] as string;
    const tenantId  = req.tenant?.tenantId;

    if (!declineId || !tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Decline ID and tenant context are required.');
      return;
    }

    sendError(
      res,
      501,
      'NOT_IMPLEMENTED',
      'Reapply reminders are not available. Nothing schedules or delivers them yet, ' +
        'so the reapply date is shown on the decline instead.',
    );
  },
);

export default declineActionsRouter;
