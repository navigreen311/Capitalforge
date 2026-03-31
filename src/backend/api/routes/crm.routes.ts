// ============================================================
// CapitalForge — CRM, Portfolio & Issuer Relationship Routes
//
// All endpoints require authentication via tenantMiddleware.
// REPORTS_VIEW permission guards analytics reads.
// BUSINESS_WRITE permission guards state mutations.
//
// Endpoints:
//   GET  /api/crm/pipeline                         — pipeline stages
//   GET  /api/crm/revenue                          — revenue analytics
//   GET  /api/crm/advisors/:id/performance         — advisor dashboard
//   GET  /api/crm/businesses/:id/timeline          — client timeline
//   POST /api/crm/businesses/:id/pipeline/stage    — transition stage
//   GET  /api/portfolio/benchmarks                 — approval benchmarks
//   GET  /api/portfolio/heatmap                    — risk heatmap
//   GET  /api/portfolio/promo-survival             — promo survival rates
//   GET  /api/portfolio/complaint-rates            — complaint rates
//   GET  /api/portfolio/cohort-profitability       — cohort profitability
//   GET  /api/issuers/contacts                     — list contacts
//   POST /api/issuers/contacts                     — create contact
//   GET  /api/issuers/contacts/:id                 — get contact
//   PATCH /api/issuers/contacts/:id                — update contact
//   GET  /api/issuers/reconsideration-outcomes     — recon outcomes
//   GET  /api/issuers/:issuer/trends               — approval trends
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { AppError, badRequest, notFound, forbidden } from '../../middleware/error-handler.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import { CrmService, PIPELINE_STAGES } from '../../services/crm.service.js';
import { PortfolioBenchmarkingService } from '../../services/portfolio-benchmarking.service.js';
import { IssuerRelationshipService } from '../../services/issuer-relationship.service.js';
import logger from '../../config/logger.js';

// ── Service instances (lazy) ──────────────────────────────────

let crmSvc: CrmService | null = null;
let benchSvc: PortfolioBenchmarkingService | null = null;
let issuerSvc: IssuerRelationshipService | null = null;

function getCrmService(): CrmService {
  if (!crmSvc) crmSvc = new CrmService();
  return crmSvc;
}

function getBenchmarkService(): PortfolioBenchmarkingService {
  if (!benchSvc) benchSvc = new PortfolioBenchmarkingService();
  return benchSvc;
}

function getIssuerService(): IssuerRelationshipService {
  if (!issuerSvc) issuerSvc = new IssuerRelationshipService();
  return issuerSvc;
}

// ── Permission guard ──────────────────────────────────────────

function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ctx = req.tenant;
    if (!ctx) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
      return;
    }
    if (!ctx.permissions.includes(permission)) {
      next(forbidden(`Permission "${permission}" is required.`));
      return;
    }
    next();
  };
}

// ── Validation schemas ────────────────────────────────────────

const PipelineTransitionSchema = z.object({
  toStage:   z.enum(['prospect', 'onboarding', 'active', 'graduated', 'churned']),
  advisorId: z.string().uuid().optional(),
  notes:     z.string().max(2000).optional(),
});

const CreateContactSchema = z.object({
  issuer:              z.string().min(1).max(100),
  contactName:         z.string().max(200).optional(),
  contactRole:         z.string().max(100).optional(),
  phone:               z.string().max(30).optional(),
  email:               z.string().email().optional(),
  reconsiderationLine: z.string().max(30).optional(),
  notes:               z.string().max(5000).optional(),
  relationshipScore:   z.number().int().min(0).max(100).optional(),
});

const UpdateContactSchema = CreateContactSchema.omit({ issuer: true }).partial();

const DateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to:   z.string().datetime().optional(),
});

// ── Router ────────────────────────────────────────────────────

export const crmRouter = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/crm/pipeline
// Returns all pipeline stages with client counts and details.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/crm/pipeline',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const result = await getCrmService().getPipelineSummary(tenantId);

      logger.info('Pipeline summary fetched', { requestId: req.requestId, tenantId });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/crm/revenue
// Revenue analytics. Optional ?from=&to= query params.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/crm/revenue',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = DateRangeSchema.safeParse(req.query);
      if (!parsed.success) {
        throw badRequest('Invalid date range parameters.', parsed.error.flatten());
      }

      const fromDate = parsed.data.from ? new Date(parsed.data.from) : undefined;
      const toDate   = parsed.data.to   ? new Date(parsed.data.to)   : undefined;

      const result = await getCrmService().getRevenueAnalytics(tenantId, fromDate, toDate);

      logger.info('Revenue analytics fetched', { requestId: req.requestId, tenantId });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/crm/advisors/:id/performance
// Full performance dashboard for a single advisor.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/crm/advisors/:id/performance',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const advisorId    = req.params.id as string;

      const result = await getCrmService().getAdvisorPerformance(advisorId, tenantId);

      logger.info('Advisor performance fetched', {
        requestId: req.requestId,
        tenantId,
        advisorId,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        next(notFound(`Advisor ${req.params.id}`));
      } else {
        next(err);
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/crm/businesses/:id/timeline
// Chronological event timeline for a single client.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/crm/businesses/:id/timeline',
  tenantMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const businessId   = req.params.id as string;

      const result = await getCrmService().getClientTimeline(businessId, tenantId);

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        next(notFound(`Business ${req.params.id}`));
      } else {
        next(err);
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/crm/businesses/:id/pipeline/stage
// Transition a client to a new pipeline stage.
// ─────────────────────────────────────────────────────────────
crmRouter.post(
  '/crm/businesses/:id/pipeline/stage',
  tenantMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const businessId   = req.params.id as string;

      const parsed = PipelineTransitionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid pipeline stage transition.', parsed.error.flatten());
      }

      const result = await getCrmService().transitionStage({
        tenantId,
        businessId,
        toStage:   parsed.data.toStage,
        advisorId: parsed.data.advisorId,
        notes:     parsed.data.notes,
      });

      logger.info('Pipeline stage transitioned via API', {
        requestId: req.requestId,
        tenantId,
        businessId,
        toStage: parsed.data.toStage,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(201).json(body);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        next(notFound(`Business ${req.params.id}`));
      } else {
        next(err);
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/portfolio/benchmarks
// Approval rate benchmarks by issuer/industry/FICO/state.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/portfolio/benchmarks',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const result = await getBenchmarkService().getApprovalBenchmarks(tenantId);

      logger.info('Approval benchmarks fetched', { requestId: req.requestId, tenantId });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/portfolio/heatmap
// Portfolio risk heatmap: issuer × FICO band.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/portfolio/heatmap',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const result = await getBenchmarkService().getPortfolioRiskHeatmap(tenantId);

      logger.info('Portfolio heatmap fetched', { requestId: req.requestId, tenantId });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/portfolio/promo-survival
// Promo APR survival rates by issuer.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/portfolio/promo-survival',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const result = await getBenchmarkService().getPromoSurvivalRates(tenantId);

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/portfolio/complaint-rates
// Complaint rates by vendor, advisor, and channel.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/portfolio/complaint-rates',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const result = await getBenchmarkService().getComplaintRates(tenantId);

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/portfolio/cohort-profitability
// Per-cohort (quarterly) profitability analysis.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/portfolio/cohort-profitability',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const result = await getBenchmarkService().getCohortProfitability(tenantId);

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/issuers/contacts
// List all issuer contacts. Optional ?issuer= filter.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/issuers/contacts',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const issuerFilter = typeof req.query.issuer === 'string' ? req.query.issuer : undefined;

      const result = await getIssuerService().listContacts(tenantId, issuerFilter);

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /api/issuers/contacts
// Create a new issuer contact entry.
// ─────────────────────────────────────────────────────────────
crmRouter.post(
  '/issuers/contacts',
  tenantMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = CreateContactSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid issuer contact data.', parsed.error.flatten());
      }

      const result = await getIssuerService().createContact({
        tenantId,
        ...parsed.data,
      });

      logger.info('Issuer contact created via API', {
        requestId: req.requestId,
        tenantId,
        issuer: parsed.data.issuer,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/issuers/contacts/:id
// Get a single issuer contact by ID.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/issuers/contacts/:id',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const result = await getIssuerService().getContact(req.params.id as string, tenantId);

      if (!result) {
        throw notFound(`Issuer contact ${req.params.id}`);
      }

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/issuers/contacts/:id
// Update an existing issuer contact.
// ─────────────────────────────────────────────────────────────
crmRouter.patch(
  '/issuers/contacts/:id',
  tenantMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = UpdateContactSchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid update data.', parsed.error.flatten());
      }

      const result = await getIssuerService().updateContact(
        req.params.id as string,
        tenantId,
        parsed.data,
      );

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        next(notFound(`Issuer contact ${req.params.id}`));
      } else {
        next(err);
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/issuers/reconsideration-outcomes
// Reconsideration outcome analytics. Optional ?issuer= filter.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/issuers/reconsideration-outcomes',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId }   = req.tenant!;
      const issuerFilter   = typeof req.query.issuer === 'string' ? req.query.issuer : undefined;

      const result = await getIssuerService().getReconsiderationOutcomes(
        tenantId,
        issuerFilter,
      );

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /api/issuers/:issuer/trends
// Monthly approval trends for a specific issuer.
// ─────────────────────────────────────────────────────────────
crmRouter.get(
  '/issuers/:issuer/trends',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const issuerParam  = (req.params.issuer as string).trim();

      if (!issuerParam) {
        throw badRequest('Issuer parameter is required.');
      }

      const allTrends = await getIssuerService().getIssuerApprovalTrends(tenantId);
      const trend = allTrends.find(
        (t) => t.issuer.toLowerCase() === issuerParam.toLowerCase(),
      );

      if (!trend) {
        throw notFound(`Issuer "${issuerParam}"`);
      }

      logger.info('Issuer trend fetched', {
        requestId: req.requestId,
        tenantId,
        issuer: issuerParam,
      });

      const body: ApiResponse<typeof trend> = { success: true, data: trend };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);
