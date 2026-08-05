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
import { CLOSED_APPLICATION_STATUSES } from '@shared/types/index.js';

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

/** An application, as the active-count series needs to see it. */
export interface ApplicationLifespan {
  createdAt: Date;
  decidedAt: Date | null;
  cancelledAt: Date | null;
  status: string;
}

/**
 * The statuses that take an application out of the active set.
 *
 * Read from the shared list rather than a literal here. Both count queries
 * above carried their own copy, and `cancelled` was missing from every one of
 * them — a status the ApplicationStatus union did not declare either, so
 * nothing enumerating it had any way to know it existed.
 */
const TERMINAL_STATUSES = new Set<string>(CLOSED_APPLICATION_STATUSES);

/**
 * How many applications were open at the end of each day.
 *
 * This was null, on the reasoning that "active" is a current status with
 * nothing on the row recording what it was before — so a past count could only
 * be invented. That was half right. The *status* has no history, but the two
 * dates that bound an application's active life are on the row already:
 * `createdAt` opens it and `decidedAt` closes it.
 *
 * So the series is derived rather than invented, and it reproduces the live
 * figure exactly: the headline counts `status NOT IN (approved, declined)`,
 * and an application is counted here for every day between being created and
 * being decided.
 *
 * Two edges, both stated because they are judgments:
 *
 * A terminal application with no `decidedAt` cannot be placed in time — we
 * know it left the active set, not when. It is excluded from the series
 * entirely, which keeps the last point equal to the live count, since the
 * headline excludes it too. No such row exists today.
 *
 * An application decided and later reopened counts as active across the whole
 * window, including the days it was actually closed. Its current status is not
 * terminal, so the headline counts it, and a series that disagreed with the
 * number printed above it would be worse than one that is imprecise about a
 * fortnight in its past.
 */
export function activeApplicationsByDay(
  applications: ApplicationLifespan[],
  boundaries: Date[],
): number[] {
  return boundaries.map(
    (edge) =>
      applications.filter((a) => {
        if (a.createdAt >= edge) return false;

        const terminal = TERMINAL_STATUSES.has(a.status);
        if (!terminal) return true;

        // A decision closes an application; a cancellation closes it too, and
        // is not a decision — hence two columns rather than one overloaded.
        const closedAt = a.decidedAt ?? a.cancelledAt;
        if (closedAt === null) return false;

        return closedAt >= edge;
      }).length,
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
            status: { notIn: [...CLOSED_APPLICATION_STATUSES] },
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
            status: { notIn: [...CLOSED_APPLICATION_STATUSES] },
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

      const [clientRows, decidedRows, costRows, applicationRows] = await Promise.all([
        db.business.findMany({ where: { tenantId }, select: { createdAt: true } }),
        db.cardApplication.findMany({
          where: { business: { tenantId }, status: { in: ['approved', 'declined'] } },
          select: { decidedAt: true, status: true, creditLimit: true },
        }),
        db.costCalculation.findMany({
          where: { business: { tenantId }, createdAt: { gte: monthStart } },
          select: { createdAt: true, programFees: true },
        }),
        // Every application, open or closed: the active count on a past day
        // needs the ones that have since been decided.
        db.cardApplication.findMany({
          where: { business: { tenantId } },
          select: { createdAt: true, decidedAt: true, cancelledAt: true, status: true },
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
            // Derived from the dates that bound an application's active life,
            // which were on the row all along. This was null on the reasoning
            // that "active" is a status with no history — true of the status,
            // and beside the point: `createdAt` opens an application and
            // `decidedAt` closes it.
            applications: activeApplicationsByDay(applicationRows, boundaries),
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
