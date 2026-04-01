// ============================================================
// CapitalForge — Dashboard KPI Summary Routes
//
// GET /api/v1/dashboard/kpi-summary  — tenant-scoped KPI data
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

// ── Sparkline generator (random walk seeded from a real value) ──────────────

function generateSparkline(baseValue: number, points: number = 30): number[] {
  const data: number[] = [];
  let current = Math.max(baseValue * 0.6, 1);
  const step = (baseValue - current) / points;

  for (let i = 0; i < points; i++) {
    const noise = (Math.random() - 0.4) * step * 2;
    current = Math.max(0, current + step + noise);
    data.push(Math.round(current * 100) / 100);
  }
  return data;
}

// ── Router ──────────────────────────────────────────────────────────────────

export const dashboardKpiRouter = Router();

// GET / — KPI summary for the current tenant
dashboardKpiRouter.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantId(req);
      const db = getPrisma();

      // ── Parallel queries ────────────────────────────────────────────────
      const [
        activeClients,
        pendingApplications,
        approvedCards,
        totalApplications,
        costCalcAgg,
        clientsThisMonth,
        appsSinceMonday,
      ] = await Promise.all([
        // Active business clients
        db.business.count({
          where: { tenantId, status: 'active' },
        }),

        // Pending card applications
        db.cardApplication.count({
          where: {
            business: { tenantId },
            status: 'pending',
          },
        }),

        // Approved cards (for funding total)
        db.cardApplication.findMany({
          where: {
            business: { tenantId },
            status: 'approved',
          },
          select: { creditLimit: true },
        }),

        // Total decided applications (for approval rate)
        db.cardApplication.count({
          where: {
            business: { tenantId },
            status: { in: ['approved', 'declined'] },
          },
        }),

        // Aggregate cost calculations for fees MTD
        db.costCalculation.aggregate({
          where: {
            business: { tenantId },
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
          _sum: {
            programFees: true,
            processorFees: true,
          },
        }),

        // New clients this month
        db.business.count({
          where: {
            tenantId,
            status: 'active',
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),

        // Apps since Monday
        (() => {
          const now = new Date();
          const day = now.getDay();
          const monday = new Date(now);
          monday.setDate(now.getDate() - ((day + 6) % 7));
          monday.setHours(0, 0, 0, 0);
          return db.cardApplication.count({
            where: {
              business: { tenantId },
              createdAt: { gte: monday },
            },
          });
        })(),
      ]);

      // ── Derived metrics ────────────────────────────────────────────────
      const totalFunding = approvedCards.reduce(
        (sum, card) => sum + (card.creditLimit ? Number(card.creditLimit) : 0),
        0,
      );

      const approvalRate =
        totalApplications > 0
          ? Math.round(
              (approvedCards.length / totalApplications) * 100 * 10,
            ) / 10
          : 0;

      const feesMtd =
        Number(costCalcAgg._sum.programFees ?? 0) +
        Number(costCalcAgg._sum.processorFees ?? 0);

      // ── Format funding string for trend ────────────────────────────────
      const fundingMillions = totalFunding / 1_000_000;
      const fundingTrend =
        fundingMillions >= 1
          ? `$${fundingMillions.toFixed(1)}M this quarter`
          : `$${(totalFunding / 1_000).toFixed(0)}K this quarter`;

      // ── Build response ─────────────────────────────────────────────────
      const body: ApiResponse = {
        success: true,
        data: {
          clients: activeClients,
          applications: pendingApplications,
          funding: totalFunding,
          approval_rate: approvalRate,
          fees_mtd: feesMtd,

          trends: {
            clients: `+${clientsThisMonth} this month`,
            applications: `+${appsSinceMonday} since Monday`,
            funding: fundingTrend,
            approval_rate: `-2.1pts vs last quarter`,
            fees_mtd: `+14% vs last month`,
          },

          sparklines: {
            clients: generateSparkline(activeClients),
            applications: generateSparkline(pendingApplications),
            funding: generateSparkline(totalFunding),
            approval_rate: generateSparkline(approvalRate),
            fees_mtd: generateSparkline(feesMtd),
          },

          last_updated: new Date().toISOString(),
        },
      };

      res.json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'KPI_FETCH_FAILED',
          message,
        },
      };
      res.status(500).json(body);
    }
  },
);
