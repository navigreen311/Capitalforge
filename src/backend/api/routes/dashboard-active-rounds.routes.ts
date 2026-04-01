// ============================================================
// CapitalForge — Dashboard Active Funding Rounds Routes
//
// GET /api/v1/dashboard/active-rounds  — active funding rounds summary
// ============================================================

import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '@shared/types/index.js';

// ── Lazy PrismaClient singleton ─────────────────────────────────────────────

let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

// ── Helper: extract tenantId from authenticated request ─────────────────────

function getTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new Error('Authentication context missing.');
  }
  return tenantId;
}

// ── Router ──────────────────────────────────────────────────────────────────

export const dashboardActiveRoundsRouter = Router();

// GET / — Active funding rounds for the current tenant
dashboardActiveRoundsRouter.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantId(req);
      const db = getPrisma();

      // ── Fetch rounds NOT completed or closed, with business + applications ──
      const rounds = await db.fundingRound.findMany({
        where: {
          business: { tenantId },
          status: { notIn: ['completed', 'closed'] },
        },
        include: {
          business: {
            select: { id: true, legalName: true },
          },
          applications: {
            select: {
              id: true,
              status: true,
              creditLimit: true,
              introAprExpiry: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // ── Build round summaries ─────────────────────────────────────────────
      let totalTarget = 0;
      let totalAchieved = 0;

      const roundSummaries = rounds.map((round) => {
        const approvedApps = round.applications.filter(
          (app) => app.status === 'approved',
        );

        const achieved = approvedApps.reduce(
          (sum, app) => sum + (app.creditLimit ? Number(app.creditLimit) : 0),
          0,
        );

        const target = round.targetCredit ? Number(round.targetCredit) : 0;
        const progressPct =
          target > 0 ? Math.round((achieved / target) * 100 * 10) / 10 : 0;

        // Soonest APR expiry among approved applications
        const aprExpiries = approvedApps
          .map((app) => app.introAprExpiry)
          .filter((d): d is Date => d !== null)
          .sort((a, b) => a.getTime() - b.getTime());

        const aprExpirySoonest = aprExpiries[0] ?? null;

        const aprDaysRemaining = aprExpirySoonest
          ? Math.ceil(
              (aprExpirySoonest.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            )
          : null;

        totalTarget += target;
        totalAchieved += achieved;

        return {
          id: round.id,
          client_name: round.business.legalName,
          client_id: round.business.id,
          round_number: round.roundNumber,
          target_credit: target,
          achieved_credit: achieved,
          progress_pct: progressPct,
          cards_approved: approvedApps.length,
          apr_expiry_soonest: aprExpirySoonest
            ? aprExpirySoonest.toISOString()
            : null,
          apr_days_remaining: aprDaysRemaining,
          status: round.status,
        };
      });

      // ── Response ──────────────────────────────────────────────────────────
      const body: ApiResponse = {
        success: true,
        data: {
          total_count: rounds.length,
          total_target: totalTarget,
          total_achieved: totalAchieved,
          rounds: roundSummaries,
          last_updated: new Date().toISOString(),
        },
      };

      res.json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'ACTIVE_ROUNDS_FETCH_FAILED',
          message,
        },
      };
      res.status(500).json(body);
    }
  },
);
