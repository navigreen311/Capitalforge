// ============================================================
// CapitalForge — Tax Document & Data Lineage Routes
//
// GET  /api/businesses/:id/tax/163j-report
//   Generate an IRC §163(j) business interest deductibility
//   report. Requires ATI and interest income in the query string
//   (or body for POST usage). Returns the full computation with
//   planning notes, disclaimer, and alert flags.
//
// GET  /api/businesses/:id/tax/year-end-summary?year=2026
//   Produce the year-end fee summary by card for the given
//   tax year. Aggregates annual fees, CA fees, program fees,
//   and processor fees from CostCalculation + CardApplications.
//
// GET  /api/businesses/:id/tax/export?year=2026
//   Download the full accountant-ready export package (JSON).
//   Append &format=csv for CSV output.
//
// GET  /api/businesses/:id/lineage/:fieldPath
//   Resolve column-level lineage for a specific field path
//   (e.g. "irc163j.deductibleInterest"). Returns the upstream
//   chain plus a regulator-export block.
//
// GET  /api/businesses/:id/lineage/graph
//   Return the full end-to-end lineage DAG for the business.
//
// POST /api/businesses/:id/lineage/detect-changes
//   Compare a snapshot (request body) against current upstream
//   values and return change-detection alerts.
//
// POST /api/businesses/:id/lineage/snapshot
//   Capture the current upstream values as a JSON snapshot for
//   future change-detection comparisons.
// ============================================================

import { Router } from 'express';
import type { Request, Response } from 'express';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { taxDocumentService } from '../../services/tax-document.service.js';
import { dataLineageService } from '../../services/data-lineage.service.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────────────────────

export const taxReportsRouter = Router({ mergeParams: true });

taxReportsRouter.use(tenantMiddleware);

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireBusinessAndTenant(req: Request, res: Response): { businessId: string; tenantId: string } | null {
  const businessId = req.params['id'];
  const tenantId = req.tenant?.tenantId;

  if (!businessId || !tenantId) {
    const body: ApiResponse = {
      success: false,
      error: { code: 'INVALID_PARAMS', message: 'Business ID and tenant context are required.' },
    };
    res.status(400).json(body);
    return null;
  }

  return { businessId, tenantId };
}

function parseTaxYear(raw: unknown, defaultYear = new Date().getFullYear()): number | null {
  const parsed = Number(raw);
  if (isNaN(parsed) || parsed < 2000 || parsed > 2100) return null;
  return parsed;
}

// ── GET /api/businesses/:id/tax/163j-report ───────────────────────────────────

taxReportsRouter.get(
  '/163j-report',
  async (req: Request, res: Response): Promise<void> => {
    const ctx = requireBusinessAndTenant(req, res);
    if (!ctx) return;
    const { businessId, tenantId } = ctx;

    // Required inputs from query string
    const {
      year,
      adjustedTaxableIncome,
      businessInterestIncome,
      floorPlanFinancingInterest,
      priorYearCarryforward,
      averageAnnualGrossReceipts,
      effectiveTaxRate,
    } = req.query as Record<string, string | undefined>;

    const taxYear = parseTaxYear(year ?? new Date().getFullYear());
    if (taxYear === null) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '"year" must be a valid tax year (2000–2100).',
        },
      };
      res.status(422).json(body);
      return;
    }

    const ati = Number(adjustedTaxableIncome);
    const bii = Number(businessInterestIncome ?? 0);
    if (isNaN(ati) || ati < 0) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '"adjustedTaxableIncome" is required and must be a non-negative number.',
        },
      };
      res.status(422).json(body);
      return;
    }

    try {
      const report = await taxDocumentService.generateIRC163jReport({
        businessId,
        tenantId,
        taxYear,
        adjustedTaxableIncome: ati,
        businessInterestIncome: bii,
        floorPlanFinancingInterest: floorPlanFinancingInterest ? Number(floorPlanFinancingInterest) : undefined,
        priorYearCarryforward: priorYearCarryforward ? Number(priorYearCarryforward) : undefined,
        averageAnnualGrossReceipts: averageAnnualGrossReceipts ? Number(averageAnnualGrossReceipts) : undefined,
        effectiveTaxRate: effectiveTaxRate ? Number(effectiveTaxRate) : undefined,
      });

      logger.info('IRC §163(j) report generated', {
        businessId,
        tenantId,
        taxYear,
        limitationFlag: report.computation.limitationFlag,
        requiresAlert: report.requiresAlert,
      });

      const body: ApiResponse<typeof report> = { success: true, data: report };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Failed to generate §163(j) report', {
        businessId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: {
          code: err instanceof Error && err.message.includes('not found') ? 'NOT_FOUND' : 'REPORT_ERROR',
          message: err instanceof Error ? err.message : 'Failed to generate §163(j) report.',
        },
      };
      res.status(err instanceof Error && err.message.includes('not found') ? 404 : 500).json(body);
    }
  },
);

// ── GET /api/businesses/:id/tax/year-end-summary ─────────────────────────────

taxReportsRouter.get(
  '/year-end-summary',
  async (req: Request, res: Response): Promise<void> => {
    const ctx = requireBusinessAndTenant(req, res);
    if (!ctx) return;
    const { businessId, tenantId } = ctx;

    const { year } = req.query as { year?: string };
    const taxYear = parseTaxYear(year ?? new Date().getFullYear());
    if (taxYear === null) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '"year" must be a valid tax year between 2000 and 2100.',
        },
      };
      res.status(422).json(body);
      return;
    }

    try {
      const summary = await taxDocumentService.generateYearEndFeeSummary(
        businessId,
        tenantId,
        taxYear,
      );

      logger.info('Year-end fee summary generated', {
        businessId,
        tenantId,
        taxYear,
        cardCount: summary.cardSummaries.length,
        grandTotalCost: summary.grandTotalCost,
      });

      const body: ApiResponse<typeof summary> = { success: true, data: summary };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Failed to generate year-end fee summary', {
        businessId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: {
          code: err instanceof Error && err.message.includes('not found') ? 'NOT_FOUND' : 'REPORT_ERROR',
          message: err instanceof Error ? err.message : 'Failed to generate year-end summary.',
        },
      };
      res.status(err instanceof Error && err.message.includes('not found') ? 404 : 500).json(body);
    }
  },
);

// ── GET /api/businesses/:id/tax/export ───────────────────────────────────────

taxReportsRouter.get(
  '/export',
  async (req: Request, res: Response): Promise<void> => {
    const ctx = requireBusinessAndTenant(req, res);
    if (!ctx) return;
    const { businessId, tenantId } = ctx;

    const {
      year,
      format,
      adjustedTaxableIncome,
      businessInterestIncome,
    } = req.query as Record<string, string | undefined>;

    const taxYear = parseTaxYear(year ?? new Date().getFullYear());
    if (taxYear === null) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '"year" must be a valid tax year between 2000 and 2100.',
        },
      };
      res.status(422).json(body);
      return;
    }

    const requestedFormat = format === 'csv' ? 'csv' : 'json';

    // Build optional §163(j) input if ATI is provided
    const irc163jInput =
      adjustedTaxableIncome !== undefined
        ? {
            adjustedTaxableIncome: Number(adjustedTaxableIncome),
            businessInterestIncome: Number(businessInterestIncome ?? 0),
          }
        : undefined;

    try {
      const pkg = await taxDocumentService.generateExportPackage(
        businessId,
        tenantId,
        taxYear,
        irc163jInput,
      );

      logger.info('Tax export package generated', {
        businessId,
        tenantId,
        taxYear,
        format: requestedFormat,
        has163jReport: pkg.irc163jReport !== null,
      });

      if (requestedFormat === 'csv') {
        const csvContent = taxDocumentService.serializeToCSV(pkg);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="capitalforge-tax-${businessId}-${taxYear}.csv"`,
        );
        res.status(200).send(csvContent);
      } else {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="capitalforge-tax-${businessId}-${taxYear}.json"`,
        );
        const body: ApiResponse<typeof pkg> = { success: true, data: pkg };
        res.status(200).json(body);
      }
    } catch (err) {
      logger.error('Failed to generate tax export package', {
        businessId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: {
          code: err instanceof Error && err.message.includes('not found') ? 'NOT_FOUND' : 'EXPORT_ERROR',
          message: err instanceof Error ? err.message : 'Failed to generate tax export package.',
        },
      };
      res.status(err instanceof Error && err.message.includes('not found') ? 404 : 500).json(body);
    }
  },
);

// ── GET /api/businesses/:id/lineage/graph ─────────────────────────────────────
// Note: must be registered BEFORE ":fieldPath" to avoid "graph" being swallowed.

taxReportsRouter.get(
  '/lineage/graph',
  async (req: Request, res: Response): Promise<void> => {
    const ctx = requireBusinessAndTenant(req, res);
    if (!ctx) return;
    const { businessId, tenantId } = ctx;

    try {
      const graph = await dataLineageService.buildLineageGraph(businessId, tenantId);

      logger.info('Lineage graph built', {
        businessId,
        tenantId,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      });

      const body: ApiResponse<typeof graph> = { success: true, data: graph };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Failed to build lineage graph', {
        businessId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: {
          code: err instanceof Error && err.message.includes('not found') ? 'NOT_FOUND' : 'LINEAGE_ERROR',
          message: err instanceof Error ? err.message : 'Failed to build lineage graph.',
        },
      };
      res.status(err instanceof Error && err.message.includes('not found') ? 404 : 500).json(body);
    }
  },
);

// ── GET /api/businesses/:id/lineage/:fieldPath ────────────────────────────────

taxReportsRouter.get(
  '/lineage/:fieldPath',
  async (req: Request, res: Response): Promise<void> => {
    const ctx = requireBusinessAndTenant(req, res);
    if (!ctx) return;
    const { businessId, tenantId } = ctx;

    // fieldPath may be dot-separated and URL-encoded (e.g. "irc163j.deductibleInterest")
    const fieldPath = decodeURIComponent(req.params['fieldPath'] ?? '');
    if (!fieldPath) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Field path is required.' },
      };
      res.status(400).json(body);
      return;
    }

    try {
      const lineage = await dataLineageService.getFieldLineage(businessId, tenantId, fieldPath);

      logger.info('Field lineage resolved', {
        businessId,
        tenantId,
        fieldPath,
        upstreamNodeCount: lineage.upstreamChain.length,
      });

      const body: ApiResponse<typeof lineage> = { success: true, data: lineage };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Failed to resolve field lineage', {
        businessId,
        tenantId,
        fieldPath,
        error: err instanceof Error ? err.message : String(err),
      });

      const isNotFound = err instanceof Error && (
        err.message.includes('not found') || err.message.includes('not found in lineage')
      );

      const body: ApiResponse = {
        success: false,
        error: {
          code: isNotFound ? 'NOT_FOUND' : 'LINEAGE_ERROR',
          message: err instanceof Error ? err.message : 'Failed to resolve field lineage.',
        },
      };
      res.status(isNotFound ? 404 : 500).json(body);
    }
  },
);

// ── POST /api/businesses/:id/lineage/detect-changes ──────────────────────────

taxReportsRouter.post(
  '/lineage/detect-changes',
  async (req: Request, res: Response): Promise<void> => {
    const ctx = requireBusinessAndTenant(req, res);
    if (!ctx) return;
    const { businessId, tenantId } = ctx;

    const snapshot = req.body as Record<string, unknown>;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body must be a JSON object (snapshot of field values).',
        },
      };
      res.status(422).json(body);
      return;
    }

    try {
      const result = await dataLineageService.detectChanges(businessId, tenantId, snapshot);

      logger.info('Change detection completed', {
        businessId,
        tenantId,
        alertCount: result.alerts.length,
        hasChanges: result.hasChanges,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Change detection failed', {
        businessId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: {
          code: err instanceof Error && err.message.includes('not found') ? 'NOT_FOUND' : 'CHANGE_DETECTION_ERROR',
          message: err instanceof Error ? err.message : 'Failed to run change detection.',
        },
      };
      res.status(err instanceof Error && err.message.includes('not found') ? 404 : 500).json(body);
    }
  },
);

// ── POST /api/businesses/:id/lineage/snapshot ────────────────────────────────

taxReportsRouter.post(
  '/lineage/snapshot',
  async (req: Request, res: Response): Promise<void> => {
    const ctx = requireBusinessAndTenant(req, res);
    if (!ctx) return;
    const { businessId, tenantId } = ctx;

    try {
      const snapshot = await dataLineageService.captureSnapshot(businessId, tenantId);

      logger.info('Lineage snapshot captured', {
        businessId,
        tenantId,
        fieldCount: Object.keys(snapshot).filter((k) => !k.startsWith('_')).length,
      });

      const body: ApiResponse<typeof snapshot> = { success: true, data: snapshot };
      res.status(200).json(body);
    } catch (err) {
      logger.error('Lineage snapshot failed', {
        businessId,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: {
          code: err instanceof Error && err.message.includes('not found') ? 'NOT_FOUND' : 'SNAPSHOT_ERROR',
          message: err instanceof Error ? err.message : 'Failed to capture lineage snapshot.',
        },
      };
      res.status(err instanceof Error && err.message.includes('not found') ? 404 : 500).json(body);
    }
  },
);
