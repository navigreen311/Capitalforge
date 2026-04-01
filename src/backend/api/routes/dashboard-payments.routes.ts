// ============================================================
// CapitalForge — Dashboard Upcoming Payments Routes
//
// Mounted under: /api/v1/dashboard/upcoming-payments
//
// Routes:
//   GET /  — 7-day payment calendar with day grouping & totals
//
// Queries PaymentSchedule + RepaymentPlan for the next N days,
// groups by day, and returns a week summary with per-day detail.
// ============================================================

import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '@shared/types/index.js';

// ── Lazy PrismaClient singleton ─────────────────────────────────────────────

let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  _prisma ??= new PrismaClient();
  return _prisma;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface PaymentItem {
  client_name: string;
  client_id: string;
  issuer: string;
  amount: number;
  payment_type: 'autopay' | 'manual';
  status: 'upcoming' | 'paid' | 'missed';
}

type DayStatus = 'all_autopay' | 'some_manual' | 'has_missed';

interface DayBucket {
  date: string;
  day_label: string;
  payment_count: number;
  total_amount: number;
  status: DayStatus;
  payments: PaymentItem[];
}

interface WeekSummary {
  total_due: number;
  autopay_pct: number;
  manual_reminders_needed: number;
}

interface UpcomingPaymentsResponse {
  week_summary: WeekSummary;
  days: DayBucket[];
  last_updated: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function toDayLabel(date: Date, today: Date): string {
  const todayStr = today.toISOString().slice(0, 10);
  const dateStr = date.toISOString().slice(0, 10);
  if (dateStr === todayStr) return 'Today';

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === tomorrow.toISOString().slice(0, 10)) return 'Tomorrow';

  return DAY_LABELS[date.getDay()];
}

function deriveDayStatus(payments: PaymentItem[]): DayStatus {
  if (payments.some((p) => p.status === 'missed')) return 'has_missed';
  if (payments.some((p) => p.payment_type === 'manual')) return 'some_manual';
  return 'all_autopay';
}

// ── Router ───────────────────────────────────────────────────────────────────

export const dashboardPaymentsRouter = Router();

// GET / — upcoming payments for the next N days (default 7)
dashboardPaymentsRouter.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
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

      const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
      const prisma = getPrisma();
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endDate = new Date(startOfToday);
      endDate.setDate(endDate.getDate() + days);

      // Fetch payment schedules within the window, scoped to tenant via RepaymentPlan
      const schedules = await prisma.paymentSchedule.findMany({
        where: {
          dueDate: {
            gte: startOfToday,
            lt: endDate,
          },
          repaymentPlan: {
            tenantId,
            status: 'active',
          },
        },
        include: {
          repaymentPlan: {
            select: {
              businessId: true,
            },
          },
        },
        orderBy: {
          dueDate: 'asc',
        },
      });

      // Collect unique business IDs for name lookups
      const businessIds = [...new Set(schedules.map((s) => s.repaymentPlan.businessId))];

      const businesses =
        businessIds.length > 0
          ? await prisma.business.findMany({
              where: { id: { in: businessIds }, tenantId },
              select: { id: true, legalName: true },
            })
          : [];

      const businessMap = new Map(businesses.map((b) => [b.id, b.legalName]));

      // ── Build day buckets ────────────────────────────────────────────────
      const dayMap = new Map<string, PaymentItem[]>();

      // Pre-populate all days in the range so we always return a full strip
      for (let d = 0; d < days; d++) {
        const date = new Date(startOfToday);
        date.setDate(date.getDate() + d);
        dayMap.set(date.toISOString().slice(0, 10), []);
      }

      // Distribute schedules into buckets
      let totalDue = 0;
      let autopayCount = 0;
      let manualCount = 0;

      for (const schedule of schedules) {
        const dateKey = schedule.dueDate.toISOString().slice(0, 10);
        const amount = Number(schedule.minimumPayment);
        const isAutopay = schedule.autopayEnabled && schedule.autopayVerified;
        const paymentType = isAutopay ? 'autopay' : 'manual';

        // Determine status
        let status: PaymentItem['status'] = 'upcoming';
        if (schedule.status === 'paid' || schedule.paidAt) {
          status = 'paid';
        } else if (schedule.status === 'missed') {
          status = 'missed';
        } else if (schedule.dueDate < now && schedule.status !== 'paid') {
          status = 'missed';
        }

        const item: PaymentItem = {
          client_name: businessMap.get(schedule.repaymentPlan.businessId) ?? 'Unknown',
          client_id: schedule.repaymentPlan.businessId,
          issuer: schedule.issuer,
          amount,
          payment_type: paymentType,
          status,
        };

        const bucket = dayMap.get(dateKey);
        if (bucket) {
          bucket.push(item);
        }

        totalDue += amount;
        if (isAutopay) {
          autopayCount++;
        } else {
          manualCount++;
        }
      }

      // ── Assemble response ────────────────────────────────────────────────
      const dayBuckets: DayBucket[] = [];
      for (const [dateKey, payments] of dayMap) {
        const date = new Date(dateKey + 'T00:00:00Z');
        dayBuckets.push({
          date: dateKey,
          day_label: toDayLabel(date, startOfToday),
          payment_count: payments.length,
          total_amount: payments.reduce((sum, p) => sum + p.amount, 0),
          status: payments.length === 0 ? 'all_autopay' : deriveDayStatus(payments),
          payments,
        });
      }

      const totalPayments = autopayCount + manualCount;
      const autopayPct =
        totalPayments > 0 ? Math.round((autopayCount / totalPayments) * 100) : 100;

      const data: UpcomingPaymentsResponse = {
        week_summary: {
          total_due: totalDue,
          autopay_pct: autopayPct,
          manual_reminders_needed: manualCount,
        },
        days: dayBuckets,
        last_updated: new Date().toISOString(),
      };

      const body: ApiResponse<UpcomingPaymentsResponse> = { success: true, data };
      res.json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const body: ApiResponse = {
        success: false,
        error: { code: 'PAYMENTS_FETCH_FAILED', message },
      };
      res.status(500).json(body);
    }
  },
);
