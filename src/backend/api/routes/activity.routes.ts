// ============================================================
// CapitalForge — Activity Routes
//
//   GET /api/activity?limit= — what has actually been done, most recent first
//
// The dashboard's "Recent Activity" card was five literals: "APP-0091 moved
// to underwriting review — 12 min ago", "Credit pull completed — Brightline
// Corp (Equifax)", "Compliance flag: Illinois disclosure deadline in 3
// days", "Dossier exported for Apex Ventures Inc.", "Funding Round #FR-018
// created — $1.2M target". The times were strings, so the feed said "12 min
// ago" whenever it was opened, and a "Mark all read" button faded them and
// raised a toast saying "All activity marked as read" while setting a local
// Set that a refresh discarded.
//
// This reads audit_logs, which is the record of what was done: an action, a
// resource, who did it and when. Nothing is summarised into prose it does
// not support — the action and the resource are reported as recorded, with
// the resource id, so a line can be traced back to the row it came from.
// ============================================================

import { Router, Response } from 'express';
import type { Request } from '../../types/http.js';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import logger from '../../config/logger.js';

export const activityRouter = Router();

let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

export interface ActivityEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  /** The person's name, or null when the row records no user. */
  actor: string | null;
  occurredAt: string;
}

function ok<T>(res: Response, data: T) {
  const body: ApiResponse<T> = { success: true, data };
  return res.json(body);
}

function fail(res: Response, status: number, code: string, message: string) {
  const body: ApiResponse = { success: false, error: { code, message } };
  return res.status(status).json(body);
}

activityRouter.get(
  '/',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      fail(res, 400, 'INVALID_PARAMS', 'Tenant context is required.');
      return;
    }

    try {
      const limit = Math.min(Number(req.query['limit']) || 20, 100);

      const rows = await getPrisma().auditLog.findMany({
        where: { tenantId },
        orderBy: { timestamp: 'desc' },
        take: limit,
        select: {
          id: true, action: true, resource: true, resourceId: true,
          userId: true, timestamp: true,
        },
      });

      // Names for the ids that have one. An action recorded against no user
      // stays null rather than being attributed to "system", which is a
      // person-shaped answer to a question the record did not answer.
      const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => id !== null))];
      const users = userIds.length === 0
        ? []
        : await getPrisma().user.findMany({
            where: { id: { in: userIds }, tenantId },
            select: { id: true, firstName: true, lastName: true },
          });
      const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

      const entries: ActivityEntry[] = rows.map((r) => ({
        id: r.id,
        action: r.action,
        resource: r.resource,
        resourceId: r.resourceId,
        actor: r.userId === null ? null : nameById.get(r.userId) ?? null,
        occurredAt: r.timestamp.toISOString(),
      }));

      const total = await getPrisma().auditLog.count({ where: { tenantId } });

      ok(res, { entries, total });
    } catch (err) {
      logger.error('[activity] list failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      fail(res, 500, 'INTERNAL_ERROR', 'Could not read the activity log.');
    }
  },
);

export default activityRouter;
