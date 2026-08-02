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




// ── POST /schedules ──────────────────────────────────────────
//
// Answers 501. It used to push onto an array held in the process and answer
// 201 with a nextRunAt of tomorrow — a scheduled report that nothing would
// ever run, shared by every tenant, gone on restart. Recipients were
// validated as email addresses, which made it read as though something was
// going to send them a report.
//
// Scheduling needs a table and a runner. There is neither.
platformReportsRouter.post('/schedules', (_req: Request, res: Response) => {
  logger.info('[platform-reports] POST /schedules — refused, no scheduler');
  return res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message:
        'Report scheduling is not implemented. Nothing stores a schedule and nothing runs one; ' +
        'this endpoint previously answered 201 with a next run date.',
    },
  } as ApiResponse);
});

platformReportsRouter.get('/schedules', (_req: Request, res: Response) => {
  logger.info('[platform-reports] GET /schedules');
  // Always empty, and says why rather than looking like a tenant with no
  // schedules configured yet.
  return ok(res, {
    schedules: [],
    total: 0,
    scheduling: {
      available: false,
      why: 'No schedule is stored and no runner exists. Reports are generated on request only.',
    },
  });
});
