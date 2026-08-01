// ============================================================
// CapitalForge — Dashboard Compliance Deadlines Routes
//
// Mounted under: /api/v1/dashboard/compliance-deadlines
//
// GET  /  — State disclosure deadlines for next 30 days
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '@shared/types/index.js';

// ── Lazy PrismaClient singleton ──────────────────────────────

let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  _prisma ??= new PrismaClient();
  return _prisma;
}

// ── Types ────────────────────────────────────────────────────

type DeadlineStatus = 'filed' | 'pending' | 'overdue';

interface DeadlineItem {
  id: string;
  state: string;
  regulation_name: string;
  client_name: string;
  client_id: string;
  deadline_date: string;
  days_remaining: number;
  status: DeadlineStatus;
}

/**
 * No all_clear, and no due_within_7_days.
 *
 * Both were computed from deadlines this endpoint invented — all_clear was
 * true whenever every manufactured item happened to be marked filed, which
 * is a green light derived from a hash. With nothing tracked there is no
 * honest boolean to return, so the field is gone rather than defaulted.
 */
interface ComplianceDeadlinesResponse {
  tracked: boolean;
  why: string;
  /** Active clients. Real; the only number here that is. */
  clients: number;
  deadlines: DeadlineItem[];
  last_updated: string;
}

// ── Router ───────────────────────────────────────────────────

export const dashboardComplianceDeadlinesRouter = Router();

// GET / — state disclosure deadlines for next 30 days
dashboardComplianceDeadlinesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenant?.tenantId;
    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' },
      };
      res.status(401).json(body);
      return;
    }

    const prisma = getPrisma();

    // The one thing here that is real: how many clients there are. Whether
    // any of them owes a filing, and whether it has been made, is not
    // recorded anywhere in this system.
    const businesses = await prisma.business.count({
      where: { tenantId, status: { notIn: ['closed', 'offboarding'] } },
    });

    const data: ComplianceDeadlinesResponse = {
      tracked: false,
      why:
        'Filing deadlines are not tracked. This endpoint used to manufacture them: a deadline ' +
        'derived from a hash of the client id, and a status of "filed" whenever that hash was ' +
        'divisible by four — against real client names. Nothing records a disclosure obligation ' +
        'or a filing, so no deadline and no status can be produced.',
      clients: businesses,
      deadlines: [],
      last_updated: new Date().toISOString(),
    };

    const body: ApiResponse<ComplianceDeadlinesResponse> = { success: true, data };
    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const body: ApiResponse = {
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    };
    res.status(500).json(body);
  }
});
