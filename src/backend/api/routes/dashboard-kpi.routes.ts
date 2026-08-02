// ============================================================
// CapitalForge — Dashboard KPI Summary Routes
//
// GET /api/v1/dashboard/kpi-summary  — tenant-scoped KPI data
//   with 30-day trend comparison
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import type { ApiResponse } from '@shared/types/index.js';

// ── Lazy PrismaClient singleton ─────────────────────────────────────────────

// ── Helper: extract tenantId from authenticated request ─────────────────────

function getTenantId(req: Request): string {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    throw new Error('Authentication context missing.');
  }
  return tenantId;
}

// ── Sparkline series, from the rows that carry a date ───────────────────────
//
// These were a random walk. Each line started at 60% of the real current
// value and stepped toward it with `(Math.random() - 0.4) * step * 2` of
// noise per point — biased upward, because the offset is 0.4 rather than 0.5,
// so a card's history tended to climb whatever had actually happened. Thirty
// points of invented past under a real present, redrawn differently on every
// request.
//
// Four of the five are derivable from timestamps already on the rows. The
// fifth is not, and says so rather than being walked.

const SPARKLINE_POINTS = 30;

/** Midnight boundaries for the last N days, oldest first. */
function dayBoundaries(points: number, now: Date): Date[] {
  const days: Date[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    // End of that day: everything created up to and including it.
    days.push(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
  }
  return days;
}

/** Running total of events at or before each day boundary. */
function cumulativeByDay(
  dates: (Date | null)[],
  boundaries: Date[],
  weight: (index: number) => number = () => 1,
): number[] {
  return boundaries.map((edge) =>
    Math.round(
      dates.reduce(
        (sum, d, i) => (d !== null && d < edge ? sum + weight(i) : sum),
        0,
      ) * 100,
    ) / 100,
  );
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
      const db = sharedPrisma;

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
      // ── Rows behind the sparklines ──────────────────────────────────────
      //
      // One read each, bucketed in memory: thirty queries per card would be
      // thirty round trips for a line drawing.
      const boundaries = dayBoundaries(SPARKLINE_POINTS, now);

      const [clientRows, decidedRows, costRows] = await Promise.all([
        db.business.findMany({ where: { tenantId }, select: { createdAt: true } }),
        db.cardApplication.findMany({
          where: { business: { tenantId }, status: { in: ['approved', 'declined'] } },
          select: { decidedAt: true, status: true, creditLimit: true },
        }),
        db.costCalculation.findMany({
          where: { business: { tenantId }, createdAt: { gte: monthStart } },
          select: { createdAt: true, programFees: true },
        }),
      ]);

      const decidedDates = decidedRows.map((r) => r.decidedAt);
      const approvedDates = decidedRows.map((r) => (r.status === 'approved' ? r.decidedAt : null));

      // Cumulative approvals over cumulative decisions, per day. Null before
      // anything has been decided — a rate of 0% would say every application
      // was declined.
      const decidedSeries = cumulativeByDay(decidedDates, boundaries);
      const approvedSeries = cumulativeByDay(approvedDates, boundaries);
      const approvalRateSeries = decidedSeries.map((decided, i) =>
        decided === 0 ? 0 : Math.round(((approvedSeries[i] ?? 0) / decided) * 1000) / 10,
      );

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
            clients: cumulativeByDay(clientRows.map((r) => r.createdAt), boundaries),
            // Null, not a line. "Active" is a current status with no history
            // on the row — an application approved last week has never been
            // anything else as far as the database is concerned, so a past
            // count of active applications cannot be derived, only invented.
            applications: null,
            funding: cumulativeByDay(
              decidedRows.map((r) => (r.status === 'approved' ? r.decidedAt : null)),
              boundaries,
              (i) => Number(decidedRows[i]?.creditLimit ?? 0),
            ),
            approval_rate: approvalRateSeries,
            fees_mtd: cumulativeByDay(
              costRows.map((r) => r.createdAt),
              boundaries,
              (i) => Number(costRows[i]?.programFees ?? 0),
            ),
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
