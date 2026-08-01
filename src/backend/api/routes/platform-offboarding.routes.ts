// ============================================================
// CapitalForge — Platform Offboarding Routes
//
// Endpoints:
//   GET   /api/platform/offboarding/:id/audit-log — the real audit trail
//   PATCH /api/platform/offboarding/:id/advance   — answers 501, see below
//
// Both of these used to be manufactured.
//
// The audit log built its entries at request time: it read a stage out of a
// module-level object that lived only in the running process, walked the
// stage list up to it, and stamped each entry with Date.now() minus an hour
// per step, attributed to "system". A deletion audit trail is the evidence
// that somebody's data was erased and when — the thing produced for a
// regulator, or for the person asking. It now reads the audit_logs the
// offboarding service actually writes: offboarding.initiated when a workflow
// opens, and data.deleted when a deletion runs, the latter carrying the
// record count and the signed proof hash.
//
// The advance endpoint moved that same in-memory stage forward and answered
// 200. Nothing was written, so the next process to serve a request knew
// nothing about it. Status on an offboarding workflow moves when something
// real happens — the export runs, the deletion runs — through the offboarding
// service. It answers 501 rather than pretending.
// ============================================================

import { Router, Response } from 'express';
import type { Request } from '../../types/http.js';
import { PrismaClient } from '@prisma/client';
import { prisma as sharedPrisma } from '../../config/database.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import logger from '../../config/logger.js';

export const platformOffboardingRouter = Router();

let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prisma) prisma = sharedPrisma;
  return prisma;
}

function ok<T>(res: Response, data: T) {
  const body: ApiResponse<T> = { success: true, data };
  return res.json(body);
}

function fail(res: Response, status: number, code: string, message: string) {
  const body: ApiResponse = { success: false, error: { code, message } };
  return res.status(status).json(body);
}

// ============================================================
// GET /api/platform/offboarding/:id/audit-log
// ============================================================

platformOffboardingRouter.get(
  '/:id/audit-log',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const workflowId = req.params['id'] as string;
    const tenantId = req.tenant?.tenantId;

    if (!tenantId) {
      fail(res, 400, 'INVALID_PARAMS', 'Tenant context is required.');
      return;
    }

    try {
      const workflow = await getPrisma().offboardingWorkflow.findFirst({
        where: { id: workflowId, tenantId },
        select: { id: true },
      });

      if (!workflow) {
        fail(res, 404, 'NOT_FOUND', 'Offboarding workflow not found.');
        return;
      }

      const entries = await getPrisma().auditLog.findMany({
        where: { tenantId, resource: 'offboarding_workflow', resourceId: workflowId },
        orderBy: { timestamp: 'asc' },
        take: 500,
      });

      ok(res, {
        offboardingId: workflowId,
        entries: entries.map((e) => ({
          id: e.id,
          action: e.action,
          // Who did it, as recorded. The manufactured version attributed
          // everything to "system".
          performedBy: e.userId,
          timestamp: e.timestamp.toISOString(),
          metadata: e.metadata ?? null,
        })),
        totalEntries: entries.length,
      });
    } catch (err) {
      logger.error('[platform-offboarding] audit-log failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      fail(res, 500, 'INTERNAL_ERROR', 'Could not read the audit trail.');
    }
  },
);

// ============================================================
// PATCH /api/platform/offboarding/:id/advance
// ============================================================

platformOffboardingRouter.patch(
  '/:id/advance',
  tenantMiddleware,
  (_req: Request, res: Response): void => {
    fail(
      res,
      501,
      'NOT_IMPLEMENTED',
      'An offboarding stage cannot be advanced directly. Status moves when the export or the ' +
        'deletion runs; this endpoint previously moved a counter held in memory and answered 200, ' +
        'which no other process could see.',
    );
  },
);

export default platformOffboardingRouter;
