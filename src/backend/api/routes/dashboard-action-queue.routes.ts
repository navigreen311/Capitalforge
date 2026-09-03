// ============================================================
// CapitalForge — Dashboard Action Queue Routes
//
// Aggregates priority tasks across multiple compliance and
// application subsystems into a single actionable queue.
//
// Endpoints:
//   GET /api/dashboard/action-queue — aggregated priority tasks
//
// All routes require authentication. The tenantId is sourced from
// the verified JWT (req.tenant).
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { PrismaClient } from '@prisma/client';
import { prisma as sharedPrisma } from '../../config/database.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router setup ─────────────────────────────────────────────

export const dashboardActionQueueRouter = Router();

// ── Lazy Prisma ──────────────────────────────────────────────

let prisma: PrismaClient | null = null;
function db(): PrismaClient {
  prisma ??= sharedPrisma;
  return prisma;
}

// ── Types ────────────────────────────────────────────────────

type Priority = 'critical' | 'high' | 'medium';

interface ActionTask {
  id: string;
  priority: Priority;
  type: string;
  client_name: string;
  client_id: string;
  description: string;
  due_date: string | null;
  action_url: string;
  action_label: string;
}

interface ActionQueueResponse {
  total_count: number;
  tasks: ActionTask[];
  /** Categories this queue cannot compute. An empty list is not an all-clear. */
  not_measured: { category: string; reason: string }[];
  last_updated: string;
}

// ── Priority sort weight ─────────────────────────────────────

const PRIORITY_WEIGHT: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

// ── Route ────────────────────────────────────────────────────

dashboardActionQueueRouter.get('/', async (req: Request, res: Response) => {
  const tenant = req.tenant;
  if (!tenant) {
    const body: ApiResponse = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    };
    res.status(401).json(body);
    return;
  }

  const { tenantId } = tenant;

  try {
    const tasks: ActionTask[] = [];

    // ── 1. Pending-consent CardApplications ────────────────
    const pendingConsentApps = await db().cardApplication.findMany({
      where: {
        business: { tenantId },
        status: 'pending_consent',
      },
      include: { business: { select: { id: true, legalName: true } } },
    });

    for (const app of pendingConsentApps) {
      tasks.push({
        id: `ca-consent-${app.id}`,
        priority: 'high',
        type: 'pending_consent',
        client_name: app.business.legalName,
        client_id: app.business.id,
        description: `${app.cardProduct} application awaiting client consent`,
        due_date: app.createdAt.toISOString(),
        action_url: `/applications/${app.id}/consent`,
        action_label: 'Capture Consent',
      });
    }

    // ── 2. Missing ProductAcknowledgments ──────────────────
    // Businesses with active applications but no acknowledgments
    const businessesWithApps = await db().business.findMany({
      where: {
        tenantId,
        cardApplications: { some: { status: { in: ['submitted', 'pending_consent', 'draft'] } } },
      },
      select: {
        id: true,
        legalName: true,
        cardApplications: {
          where: { status: { in: ['submitted', 'pending_consent', 'draft'] } },
          select: { id: true },
        },
      },
    });

    const ackBusinessIds = await db().productAcknowledgment.findMany({
      where: {
        businessId: { in: businessesWithApps.map((b) => b.id) },
      },
      select: { businessId: true },
    });

    const ackSet = new Set(ackBusinessIds.map((a) => a.businessId));

    for (const biz of businessesWithApps) {
      if (!ackSet.has(biz.id)) {
        tasks.push({
          id: `ack-missing-${biz.id}`,
          priority: 'high',
          type: 'missing_acknowledgment',
          client_name: biz.legalName,
          client_id: biz.id,
          description: 'Product acknowledgment required before application can proceed',
          due_date: null,
          action_url: `/clients/${biz.id}/acknowledgments`,
          action_label: 'Send Acknowledgment',
        });
      }
    }

    // ── 3. Expired consent — not measurable, and not zero ──────
    //
    // This queried `consentRecord where status: 'expired'` and pushed a
    // 'critical' task per row. It returned nothing, every time, for every
    // tenant — because nothing writes that status, and nothing can:
    // ConsentRecord has `grantedAt` and `revokedAt` and NO expiry column at
    // all. `expired` appears in a comment on `status` and in this query, and
    // nowhere else.
    //
    // Consent expiry is not unimplemented; it is unmodelled. There is no date
    // to expire against.
    //
    // An empty action queue reads as "no consent has expired". The true
    // statement is "nothing here can tell you whether any has", and those are
    // different facts — the same distinction portfolio health and the advisor
    // QA summary now draw. So the query is gone and the surface says so
    // instead of contributing a silent zero.

    tasks.sort((a, b) => {
      const pw = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (pw !== 0) return pw;
      // Nulls sort last
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    const responseData: ActionQueueResponse = {
      total_count: tasks.length,
      tasks,
      /**
       * Categories this queue cannot compute, named so an empty list is not
       * read as an all-clear. `total_count` counts the tasks it CAN see.
       */
      not_measured: [
        {
          category: 'expired_consent',
          reason:
            'Consent expiry is not modelled — ConsentRecord carries no expiry date, so '
            + 'no consent can become expired and none can be counted. An empty queue is '
            + 'not evidence that no consent has lapsed.',
        },
      ],
      last_updated: new Date().toISOString(),
    };

    const body: ApiResponse<ActionQueueResponse> = {
      success: true,
      data: responseData,
    };

    res.json(body);
  } catch (err) {
    logger.error('Failed to build action queue', { err });
    const body: ApiResponse = {
      success: false,
      error: {
        code: 'ACTION_QUEUE_ERROR',
        message: 'Unable to load action queue. Please try again.',
      },
    };
    res.status(500).json(body);
  }
});
