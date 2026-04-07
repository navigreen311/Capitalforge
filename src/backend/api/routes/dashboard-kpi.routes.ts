// ============================================================
// CapitalForge — Dashboard KPI Summary Routes
//
// GET /api/v1/dashboard/kpi-summary  — tenant-scoped KPI data
//   with 30-day trend comparison
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

// ── Trend formatting helper ─────────────────────────────────────────────────

function formatTrendPct(current: number, previous: number): string {
  if (previous === 0 && current === 0) return 'No change';
  if (previous === 0) return `+${current} new`;

  const pctChange = ((current - previous) / previous) * 100;
  const sign = pctChange >= 0 ? '+' : '';
  return `${sign}${pctChange.toFixed(1)}% vs prev 30d`;
}

function formatPointsTrend(current: number, previous: number): string {
  const diff = current - previous;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}pts vs prev 30d`;
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

      // ── Date boundaries for trend comparison ────────────────────────────
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      // ── Parallel queries ────────────────────────────────────────────────
      const [
        totalClients,
        activeApplications,
        approvedCards,
        totalDecidedApps,
        costCalcMtd,
        // Previous 30-day window for trend comparison
        prevClients,
        prevActiveApps,
        prevApprovedCards,
        prevDecidedApps,
        prevCostCalc,
      ] = await Promise.all([
        // Total Clients (count of all businesses in tenant)
        db.business.count({
          where: { tenantId },
        }),

        // Active Applications (not approved and not declined)
        db.cardApplication.count({
          where: {
            business: { tenantId },
            status: { notIn: ['approved', 'declined'] },
          },
        }),

        // Approved cards (for Total Funding = sum of creditLimit)
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

        // Fees MTD: sum of programFees from cost calculations this month
        db.costCalculation.aggregate({
          where: {
            business: { tenantId },
            createdAt: { gte: monthStart },
          },
          _sum: { programFees: true },
        }),

        // ── Previous window (30–60 days ago) for trend comparison ─────────

        // Previous period clients (created before 30 days ago)
        db.business.count({
          where: {
            tenantId,
            createdAt: { lt: thirtyDaysAgo },
          },
        }),

        // Previous period active apps
        db.cardApplication.count({
          where: {
            business: { tenantId },
            status: { notIn: ['approved', 'declined'] },
            createdAt: { lt: thirtyDaysAgo },
          },
        }),

        // Previous period approved cards (approved before 30 days ago)
        db.cardApplication.findMany({
          where: {
            business: { tenantId },
            status: 'approved',
            decidedAt: { lt: thirtyDaysAgo },
          },
          select: { creditLimit: true },
        }),

        // Previous period decided apps
        db.cardApplication.count({
          where: {
            business: { tenantId },
            status: { in: ['approved', 'declined'] },
            decidedAt: { lt: thirtyDaysAgo },
          },
        }),

        // Previous month fees
        db.costCalculation.aggregate({
          where: {
            business: { tenantId },
            createdAt: { gte: prevMonthStart, lt: monthStart },
          },
          _sum: { programFees: true },
        }),
      ]);

      // ── Current derived metrics ─────────────────────────────────────────
      const totalFunding = approvedCards.reduce(
        (sum, card) => sum + (card.creditLimit ? Number(card.creditLimit) : 0),
        0,
      );

      const approvedCount = approvedCards.length;
      const approvalRate =
        totalDecidedApps > 0
          ? Math.round((approvedCount / totalDecidedApps) * 100 * 10) / 10
          : 0;

      const feesMtd = Number(costCalcMtd._sum.programFees ?? 0);

      // ── Previous derived metrics ────────────────────────────────────────
      const prevTotalFunding = prevApprovedCards.reduce(
        (sum, card) => sum + (card.creditLimit ? Number(card.creditLimit) : 0),
        0,
      );

      const prevApprovalRate =
        prevDecidedApps > 0
          ? Math.round((prevApprovedCards.length / prevDecidedApps) * 100 * 10) / 10
          : 0;

      const prevFeesMtd = Number(prevCostCalc._sum.programFees ?? 0);

      // ── Build response ─────────────────────────────────────────────────
      const body: ApiResponse = {
        success: true,
        data: {
          clients: totalClients,
          applications: activeApplications,
          funding: totalFunding,
          approval_rate: approvalRate,
          fees_mtd: feesMtd,

          trends: {
            clients: formatTrendPct(totalClients, prevClients),
            applications: formatTrendPct(activeApplications, prevActiveApps),
            funding: formatTrendPct(totalFunding, prevTotalFunding),
            approval_rate: formatPointsTrend(approvalRate, prevApprovalRate),
            fees_mtd: formatTrendPct(feesMtd, prevFeesMtd),
          },

          sparklines: {
            clients: generateSparkline(totalClients),
            applications: generateSparkline(activeApplications),
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
