// ============================================================
// CapitalForge Application Timeline
//
// Mounted under: /api/applications/:appId
//
// GET /timeline — application history, projected from the canonical ledger
//
// This module used to also define GET /, PATCH / and POST /submit. All three
// were unreachable: application.routes.ts (mounted at '/' earlier) already
// serves GET /applications/:id and PUT /applications/:id/status, and
// applications.routes.ts serves PATCH /applications/:id and
// POST /applications/:id/submit — both against real records. Express matched
// those first, so the sample data here was never actually served.
//
// They are not reimplemented here. Two handlers for one path is how the
// behaviour of a route ends up depending on mount order.
// ============================================================

import { Router, type Response, type NextFunction } from 'express';
import type { Request } from '../../types/http.js';
import { PrismaClient } from '@prisma/client';
import logger from '../../config/logger.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import { AGGREGATE_TYPES } from '../../events/event-types.js';

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────

function getTenantId(req: Request): string {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    throw new Error('Tenant context is missing — authentication middleware did not run.');
  }
  return tenantId;
}

function ok(res: Response, data: unknown, meta?: Record<string, unknown>): void {
  const body: ApiResponse = { success: true, data, ...(meta ? { meta } : {}) };
  res.status(200).json(body);
}

function err(res: Response, status: number, code: string, message: string): void {
  const body: ApiResponse = { success: false, error: { code, message } };
  res.status(status).json(body);
}

// ── Router ────────────────────────────────────────────────────

export const applicationDetailRouter = Router({ mergeParams: true });

// GET /timeline — projected from the canonical ledger
applicationDetailRouter.get('/timeline', async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { appId } = req.params;
  const tenantId = getTenantId(req);

  try {
    // Confirm the application belongs to this tenant before returning its
    // history: the ledger is queried by aggregate id, which on its own would
    // not scope the result.
    const application = await prisma.cardApplication.findFirst({
      where: { id: appId, business: { tenantId } },
      select: { id: true },
    });

    if (!application) {
      err(res, 404, 'APPLICATION_NOT_FOUND', `No application found with ID "${appId}".`);
      return;
    }

    const events = await prisma.ledgerEvent.findMany({
      where: { tenantId, aggregateType: AGGREGATE_TYPES.APPLICATION, aggregateId: appId },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });

    const timeline = events.map((event) => {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      return {
        id: event.id,
        type: event.eventType,
        timestamp: event.publishedAt.toISOString(),
        actor:
          typeof payload['createdBy'] === 'string' ? (payload['createdBy'] as string) : 'System',
        detail: payload,
      };
    });

    // An application created before the ledger writer was attached has no
    // events. That is an empty timeline, not sample history.
    ok(res, timeline, { total: timeline.length });
  } catch (error) {
    logger.error('Failed to load application timeline', { appId, tenantId, error });
    err(res, 500, 'APPLICATION_TIMELINE_FAILED', 'Unable to load the application timeline.');
  }
});
