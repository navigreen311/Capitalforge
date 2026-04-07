// ============================================================
// CapitalForge — Dashboard Re-Stack Opportunities Routes
//
// GET /api/v1/dashboard/restack  — tenant-scoped re-stack
//   opportunities for businesses eligible for another round.
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
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    throw new Error('Authentication context missing.');
  }
  return tenantId;
}

// ── Helper: generate initials from business name ────────────────────────────

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// ── Router ──────────────────────────────────────────────────────────────────

export const dashboardRestackRouter = Router();

// GET / — Re-stack opportunities for the current tenant
dashboardRestackRouter.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantId(req);
      const db = getPrisma();

      let opportunities: Array<{
        client_id: string;
        client_name: string;
        client_initials: string;
        current_round: number;
        next_round: number;
        estimated_additional_credit: number;
        readiness_score: number;
        last_funded_date: string | null;
      }> = [];

      try {
        // Find businesses with fundingReadinessScore > 70 that have at
        // least one completed FundingRound and no in_progress round.
        const businesses = await db.business.findMany({
          where: {
            tenantId,
            status: 'active',
            fundingReadinessScore: { gt: 70 },
            fundingRounds: {
              some: { status: 'completed' },
            },
          },
          include: {
            fundingRounds: {
              orderBy: { roundNumber: 'desc' },
            },
          },
        });

        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        // Filter: no in_progress round, last completed round > 90 days ago
        opportunities = businesses
          .filter((biz) => {
            return !biz.fundingRounds.some((fr) => fr.status === 'in_progress');
          })
          .map((biz) => {
            // Latest completed round
            const completedRounds = biz.fundingRounds
              .filter((fr) => fr.status === 'completed')
              .sort((a, b) => b.roundNumber - a.roundNumber);

            const lastCompleted = completedRounds[0];

            // Skip businesses with missing data
            if (!lastCompleted) return null;

            // Only include if last completed round was > 90 days ago
            if (lastCompleted.completedAt && lastCompleted.completedAt > ninetyDaysAgo) {
              return null;
            }

            // Sum credit from approved applications in the last completed round
            const achievedCredit = Number(lastCompleted.targetCredit ?? 0);
            const estimatedAdditionalCredit = Math.round(achievedCredit * 0.75);

            return {
              client_id: biz.id,
              client_name: biz.legalName,
              client_initials: getInitials(biz.legalName),
              current_round: lastCompleted.roundNumber,
              next_round: lastCompleted.roundNumber + 1,
              estimated_additional_credit: estimatedAdditionalCredit,
              readiness_score: biz.fundingReadinessScore ?? 0,
              last_funded_date: lastCompleted.completedAt?.toISOString() ?? null,
            };
          })
          // Remove null entries from businesses with missing data
          .filter((opp): opp is NonNullable<typeof opp> => opp !== null)
          // Sort by readiness descending
          .sort((a, b) => b.readiness_score - a.readiness_score);
      } catch (dbErr) {
        console.error('[restack] Database query failed, returning empty list:', dbErr);
        // Fall through with empty opportunities array
      }

      const totalPipelineValue = opportunities.reduce(
        (sum, opp) => sum + opp.estimated_additional_credit,
        0,
      );

      const body: ApiResponse = {
        success: true,
        data: {
          total_pipeline_value: totalPipelineValue,
          opportunities,
          last_updated: new Date().toISOString(),
        },
      };

      res.json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[restack] Route handler error:', err);
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'RESTACK_FETCH_FAILED',
          message,
        },
      };
      res.status(500).json(body);
    }
  },
);
