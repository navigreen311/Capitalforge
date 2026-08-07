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

const REPORT_TEMPLATES: Record<string, Record<string, unknown>> = {
  'monthly-summary': {
    title: 'Monthly Summary Report',
    period: new Date().toISOString().slice(0, 7),
    metrics: {
      totalClients: 291,
      newClients: 18,
      totalApplications: 142,
      approvalRate: 68.5,
      totalFundingDeployed: '$2,450,000',
      avgReadinessScore: 72,
    },
  },
  'client-funding': {
    title: 'Client Funding Report',
    totalFunded: 148,
    totalPending: 42,
    fundingByIssuer: [
      { issuer: 'Chase', count: 42, amount: '$1,190,000' },
      { issuer: 'Amex', count: 38, amount: '$1,330,000' },
      { issuer: 'Capital One', count: 28, amount: '$616,000' },
    ],
  },
  'compliance-audit': {
    title: 'Compliance Audit Report',
    checksCompleted: 342,
    findingsByRisk: { low: 180, medium: 102, high: 48, critical: 12 },
    resolutionRate: 94.2,
    openItems: 20,
  },
  revenue: {
    title: 'Revenue Report',
    totalRevenue: 142_500,
    programFees: 89_200,
    fundingFees: 38_100,
    platformFees: 15_200,
    growthVsPrior: 12.4,
  },
  'portfolio-performance': {
    title: 'Portfolio Performance Report',
    avgCreditScore: 712,
    avgUtilization: 28.4,
    avgCreditLimit: 45_000,
    delinquencyRate: 2.1,
    graduationRate: 18.6,
  },
};

platformReportsRouter.post('/generate', (req: Request, res: Response) => {
  logger.info('[platform-reports] POST /generate');
  const parsed = GenerateReportSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const { type, dateRange } = parsed.data;
  const data = {
    ...REPORT_TEMPLATES[type],
    type,
    dateRange: dateRange ?? { from: '2026-03-01', to: '2026-03-31' },
    generatedAt: new Date().toISOString(),
  };

  return ok(res, data);
});

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
  const title = REPORT_TEMPLATES[type]?.title ?? type;
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
