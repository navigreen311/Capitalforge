// ============================================================
// CapitalForge — Platform Reports Routes
//
// Endpoints:
//   POST /api/platform/reports/generate    — generate mock report by type
//   POST /api/platform/reports/export      — export mock PDF text
//   POST /api/platform/reports/schedules   — create report schedule
//   GET  /api/platform/reports/schedules   — list report schedules
// ============================================================

import { Router, Response } from 'express';
import type { Request } from '../../types/http.js';
import { z, ZodError } from 'zod';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import {
  UNMEASURABLE,
  summariseRepaymentMissedPayments,
} from '../../services/portfolio-figures.js';

export const platformReportsRouter = Router();

// ── Helpers ──────────────────────────────────────────────────

function ok<T>(res: Response, data: T) {
  const body: ApiResponse<T> = { success: true, data };
  return res.json(body);
}

function validationError(res: Response, err: ZodError) {
  const details: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    details[key] = details[key] || [];
    details[key].push(issue.message);
  }
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details },
    statusCode: 400,
  });
}

// ============================================================
// POST /api/platform/reports/generate
// ============================================================

const GenerateReportSchema = z.object({
  type: z.enum(['monthly-summary', 'client-funding', 'compliance-audit', 'revenue', 'portfolio-performance']),
  dateRange: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  }).optional(),
});

// ── Reports are computed, or they say what is missing ────────
//
// This was five blocks of literals. `monthly-summary` reported 291 clients,
// 142 applications and $2,450,000 deployed for every tenant that asked;
// `portfolio-performance` reported a delinquency rate of 2.1 — while
// `/api/platform/portfolio` published null for the same figure with a
// paragraph explaining why it cannot be derived. Two surfaces, one portfolio,
// two different answers, and the one an advisor exports and sends was the
// invented one.
//
// Everything below is either counted from this tenant's rows or absent with a
// reason. `services/portfolio-figures.ts` holds the reasons so the dashboard
// and the report cannot drift apart again.

/** Titles, so a report still names itself when its figures are unavailable. */
const REPORT_TITLES: Record<string, string> = {
  'monthly-summary': 'Monthly Summary Report',
  'client-funding': 'Client Funding Report',
  'compliance-audit': 'Compliance Audit Report',
  revenue: 'Revenue Report',
  'portfolio-performance': 'Portfolio Performance Report',
};

async function buildReport(
  type: string,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const title = REPORT_TITLES[type] ?? type;

  if (type === 'monthly-summary') {
    const [totalClients, applications] = await Promise.all([
      sharedPrisma.business.count({ where: { tenantId } }),
      sharedPrisma.cardApplication.findMany({
        where: { business: { tenantId } },
        select: { status: true },
      }),
    ]);
    const decided = applications.filter((a) => a.status === 'approved' || a.status === 'denied');
    const approved = decided.filter((a) => a.status === 'approved');

    return {
      title,
      period: new Date().toISOString().slice(0, 7),
      metrics: {
        totalClients,
        totalApplications: applications.length,
        // Null rather than 0 when nothing has been decided: a 0% approval rate
        // is a statement about a portfolio, and "none decided yet" is not.
        approvalRate:
          decided.length === 0
            ? null
            : Number(((approved.length / decided.length) * 100).toFixed(1)),
        decidedApplications: decided.length,
      },
      unavailable: {
        totalFundingDeployed: UNMEASURABLE.revenue,
      },
    };
  }

  if (type === 'client-funding') {
    const applications = await sharedPrisma.cardApplication.findMany({
      where: { business: { tenantId } },
      select: { status: true, issuer: true, creditLimit: true },
    });

    const byIssuer = new Map<string, { count: number; approvedLimit: number }>();
    for (const app of applications) {
      if (app.status !== 'approved') continue;
      const entry = byIssuer.get(app.issuer) ?? { count: 0, approvedLimit: 0 };
      entry.count += 1;
      entry.approvedLimit += app.creditLimit ? Number(app.creditLimit) : 0;
      byIssuer.set(app.issuer, entry);
    }

    return {
      title,
      totalFunded: applications.filter((a) => a.status === 'approved').length,
      totalPending: applications.filter((a) => a.status === 'submitted').length,
      // Approved credit limits, named as such. The literal version called this
      // "amount", which reads as money deployed rather than credit extended.
      approvedCreditByIssuer: [...byIssuer.entries()]
        .map(([issuer, v]) => ({ issuer, count: v.count, approvedCreditLimit: v.approvedLimit }))
        .sort((a, b) => b.approvedCreditLimit - a.approvedCreditLimit),
    };
  }

  if (type === 'portfolio-performance') {
    const applications = await sharedPrisma.cardApplication.findMany({
      where: { business: { tenantId }, status: 'approved' },
      select: { creditLimit: true },
    });
    const limits = applications
      .map((a) => (a.creditLimit ? Number(a.creditLimit) : null))
      .filter((v): v is number => v !== null);

    // The true, narrower figure — reported under a name that says what it
    // counts, and never as a delinquency rate. See portfolio-figures.ts.
    const schedules = await sharedPrisma.paymentSchedule.findMany({
      where: { repaymentPlan: { business: { tenantId } } },
      select: { status: true },
    });

    return {
      title,
      avgCreditLimit:
        limits.length === 0
          ? null
          : Number((limits.reduce((a, b) => a + b, 0) / limits.length).toFixed(0)),
      approvedCards: applications.length,
      repaymentPlanMissedPayments: summariseRepaymentMissedPayments(schedules),
      unavailable: {
        delinquencyRate: UNMEASURABLE.delinquencyRate,
        avgCreditScore: UNMEASURABLE.avgCreditScore,
      },
    };
  }

  if (type === 'revenue') {
    // Nothing records a fee. A revenue report that cannot be computed should
    // not be a revenue report with figures in it.
    return { title, unavailable: { revenue: UNMEASURABLE.revenue } };
  }

  return { title, unavailable: { complianceFindings: UNMEASURABLE.complianceFindings } };
}

platformReportsRouter.post(
  '/generate',
  tenantMiddleware,
  async (req: Request, res: Response) => {
    const parsed = GenerateReportSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const { tenantId } = req.tenant!;
    const { type, dateRange } = parsed.data;

    const report = await buildReport(type, tenantId);
    logger.info('[platform-reports] Report generated', { type, tenantId });

    return ok(res, {
      ...report,
      type,
      // Echoed, not defaulted to a fixed March window. The old handler filled
      // in 2026-03-01 to 2026-03-31 when none was given, so a report generated
      // in August was stamped March.
      dateRange: dateRange ?? null,
      generatedAt: new Date().toISOString(),
    });
  },
);

// ============================================================
// POST /api/platform/reports/export
// ============================================================

const ExportReportSchema = z.object({
  type: z.enum(['monthly-summary', 'client-funding', 'compliance-audit', 'revenue', 'portfolio-performance']),
  format: z.enum(['pdf', 'csv', 'xlsx']).default('pdf'),
});

platformReportsRouter.post('/export', (req: Request, res: Response) => {
  logger.info('[platform-reports] POST /export');
  const parsed = ExportReportSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const { type, format } = parsed.data;
  const title = REPORT_TITLES[type] ?? type;
  const placeholder =
    `[No ${format.toUpperCase()} generator is implemented for "${title}". ` +
    `This is a placeholder, not a report — generated ${new Date().toISOString()}]`;

  return ok(res, {
    fileName: `${type}-${new Date().toISOString().slice(0, 10)}.${format}`,
    format,
    mimeType: format === 'pdf' ? 'application/pdf' : format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // The content is a placeholder string and says so. The size is the size
    // of that string: it used to be a random number between 5KB and 55KB,
    // which described a file that does not exist.
    content: placeholder,
    sizeBytes: Buffer.byteLength(placeholder, 'utf8'),
    generatedAt: new Date().toISOString(),
  });
});

// ============================================================
// Report Schedules (in-memory store)
// ============================================================




// ── Schedules ────────────────────────────────────────────────
//
// A schedule is **stored intent**, and this endpoint is careful to be only
// that. It used to push onto an array held in the process and answer 201 with
// a `nextRunAt` of tomorrow — a scheduled report nothing would ever run,
// shared by every tenant, gone on restart. Recipients were validated as email
// addresses, which made it read as though something was going to send them a
// report.
//
// **Nothing runs these yet, and every response says so.** `lastRunAt` stays
// null, and `delivery.active` is false. The half that is missing is not the
// table — it is the decision the reminder endpoints are also waiting on: who
// gets sent what, how often, and what happens when a send fails. This system
// can send real email, so a schedule that quietly began delivering would be a
// worse outcome than one that refuses.
//
// `nextRunAt` is computed and stored so a list can show when a schedule
// *would* fire. It is not a promise that it will.

const ScheduleSchema = z.object({
  name: z.string().min(1).max(200),
  reportType: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  dayOfPeriod: z.number().int().min(0).max(28).nullable().optional(),
  recipients: z.array(z.string().email()).min(1).max(50),
  enabled: z.boolean().default(true),
});

/**
 * When this schedule would next fire, from `from`.
 *
 * Pure and exported so it can be tested without a clock: the previous version
 * answered "tomorrow" for every frequency, which is the kind of thing that
 * looks right on a weekly schedule until somebody checks on a Tuesday.
 */
export function computeNextRunAt(
  frequency: 'daily' | 'weekly' | 'monthly',
  dayOfPeriod: number | null,
  from: Date,
): Date {
  const next = new Date(from);
  next.setUTCHours(0, 0, 0, 0);

  if (frequency === 'daily') {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  if (frequency === 'weekly') {
    const target = dayOfPeriod ?? 1;
    // At least one day out: a schedule created on its own weekday should fire
    // next week, not in the past few hours.
    let delta = (target - next.getUTCDay() + 7) % 7;
    if (delta === 0) delta = 7;
    next.setUTCDate(next.getUTCDate() + delta);
    return next;
  }

  const target = dayOfPeriod ?? 1;
  next.setUTCDate(target);
  if (next <= from) next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

/** Said the same way in every response, so no caller has to infer it. */
const DELIVERY_NOTE = {
  active: false,
  why:
    'Schedules are stored but nothing runs them yet. No report has been or will be delivered '
    + 'from this schedule until a runner exists, which is why lastRunAt stays null.',
} as const;

platformReportsRouter.post(
  '/schedules',
  tenantMiddleware,
  async (req: Request, res: Response) => {
    const { tenantId, userId } = req.tenant!;

    const parsed = ScheduleSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const schedule = await sharedPrisma.reportSchedule.create({
      data: {
        tenantId,
        name: parsed.data.name,
        reportType: parsed.data.reportType,
        frequency: parsed.data.frequency,
        dayOfPeriod: parsed.data.dayOfPeriod ?? null,
        recipients: parsed.data.recipients,
        enabled: parsed.data.enabled,
        nextRunAt: computeNextRunAt(
          parsed.data.frequency,
          parsed.data.dayOfPeriod ?? null,
          new Date(),
        ),
        createdBy: userId,
      },
    });

    logger.info('[platform-reports] Schedule stored', { scheduleId: schedule.id, tenantId });
    return res.status(201).json({
      success: true,
      data: { schedule, delivery: DELIVERY_NOTE },
    } as ApiResponse);
  },
);

platformReportsRouter.get(
  '/schedules',
  tenantMiddleware,
  async (req: Request, res: Response) => {
    const { tenantId } = req.tenant!;
    const schedules = await sharedPrisma.reportSchedule.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return ok(res, { schedules, total: schedules.length, delivery: DELIVERY_NOTE });
  },
);

platformReportsRouter.delete(
  '/schedules/:id',
  tenantMiddleware,
  async (req: Request, res: Response) => {
    const { tenantId } = req.tenant!;
    // Deleted rather than disabled: an advisor who removes a schedule means it
    // gone, and leaving a disabled row behind is how a list grows a graveyard
    // that still looks like configuration.
    const { count } = await sharedPrisma.reportSchedule.deleteMany({
      where: { id: req.params['id']!, tenantId },
    });

    if (count === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No schedule with that id is on record.' },
      } as ApiResponse);
    }
    return ok(res, { removed: true });
  },
);
