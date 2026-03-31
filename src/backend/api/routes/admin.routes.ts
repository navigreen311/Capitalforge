// ============================================================
// CapitalForge — Admin, Offboarding, Fair-Lending & AI
//                Governance Routes
//
// Endpoints:
//   POST   /api/admin/tenants              — create tenant
//   GET    /api/admin/tenants              — list tenants
//   PUT    /api/admin/tenants/:id          — update tenant
//   PUT    /api/admin/tenants/:id/flags    — update feature flags
//   GET    /api/admin/tenants/:id/usage    — usage metering
//
//   POST   /api/offboarding/initiate       — start offboarding
//   GET    /api/offboarding/:id            — get workflow status
//   POST   /api/offboarding/:id/exit-interview — capture exit interview
//   POST   /api/offboarding/:id/export     — export tenant data
//   POST   /api/offboarding/:id/delete-data — execute data deletion
//
//   GET    /api/fair-lending/dashboard     — 1071 monitoring dashboard
//   POST   /api/fair-lending/records       — create 1071 record
//   GET    /api/fair-lending/coverage      — coverage threshold check
//   GET    /api/fair-lending/adverse-action — adverse action report
//
//   GET    /api/ai-governance/decisions    — list AI decisions
//   POST   /api/ai-governance/decisions    — log AI decision
//   POST   /api/ai-governance/decisions/:id/override — override decision
//   GET    /api/ai-governance/metrics      — AI performance metrics
//   GET    /api/ai-governance/versions     — model/prompt version history
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { AppError, badRequest, notFound, forbidden } from '../../middleware/error-handler.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import logger from '../../config/logger.js';
import { MultiTenantService }   from '../../services/multi-tenant.service.js';
import { OffboardingService }   from '../../services/offboarding.service.js';
import { FairLendingService }   from '../../services/fair-lending.service.js';
import { AiGovernanceService }  from '../../services/ai-governance.service.js';

export const adminRouter = Router();

// ── Lazy service instances ────────────────────────────────────

let prisma: PrismaClient | null = null;
let multiTenantSvc:  MultiTenantService  | null = null;
let offboardingSvc:  OffboardingService  | null = null;
let fairLendingSvc:  FairLendingService  | null = null;
let aiGovernanceSvc: AiGovernanceService | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}
function getMultiTenantSvc():  MultiTenantService  { return multiTenantSvc  ??= new MultiTenantService(getPrisma()); }
function getOffboardingSvc():  OffboardingService  { return offboardingSvc  ??= new OffboardingService(getPrisma()); }
function getFairLendingSvc():  FairLendingService  { return fairLendingSvc  ??= new FairLendingService(getPrisma()); }
function getAiGovernanceSvc(): AiGovernanceService { return aiGovernanceSvc ??= new AiGovernanceService(getPrisma()); }

// ── Guards ────────────────────────────────────────────────────

function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ctx = req.tenant;
    if (!ctx) { next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.')); return; }
    if (!ctx.permissions.includes(permission)) {
      next(forbidden(`Permission "${permission}" required.`)); return;
    }
    next();
  };
}

// Helper to require super_admin or tenant_admin role for admin routes
function requireAdminRole(req: Request, _res: Response, next: NextFunction): void {
  const role = req.tenant?.role;
  if (role !== 'super_admin' && role !== 'tenant_admin') {
    next(forbidden('Admin role required.')); return;
  }
  next();
}

// ── Validation schemas ────────────────────────────────────────

const CreateTenantSchema = z.object({
  name:           z.string().min(2).max(100),
  slug:           z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  plan:           z.enum(['starter', 'growth', 'enterprise', 'white_label']).optional(),
  adminEmail:     z.string().email(),
  adminFirstName: z.string().min(1),
  adminLastName:  z.string().min(1),
  brandConfig:    z.object({
    primaryColor:   z.string().optional(),
    secondaryColor: z.string().optional(),
    logoUrl:        z.string().url().optional(),
    faviconUrl:     z.string().url().optional(),
    companyName:    z.string().optional(),
    supportEmail:   z.string().email().optional(),
    customDomain:   z.string().optional(),
  }).optional(),
});

const UpdateTenantSchema = z.object({
  name:        z.string().min(2).max(100).optional(),
  plan:        z.enum(['starter', 'growth', 'enterprise', 'white_label']).optional(),
  isActive:    z.boolean().optional(),
  brandConfig: z.record(z.unknown()).optional(),
});

const UpdateFlagsSchema = z.object({
  flags: z.record(z.boolean()),
});

const InitiateOffboardingSchema = z.object({
  tenantId:       z.string().uuid(),
  offboardingType: z.enum(['client', 'tenant']),
  businessId:     z.string().uuid().optional(),
  exitReason:     z.string().max(500).optional(),
  jurisdiction:   z.enum(['ccpa', 'gdpr', 'both', 'internal']).optional(),
});

const ExitInterviewSchema = z.object({
  notes:              z.string().min(1),
  satisfactionScore:  z.number().int().min(1).max(10).optional(),
  primaryExitReason:  z.string().min(1),
  wouldRecommend:     z.boolean().optional(),
});

const DeleteDataSchema = z.object({
  jurisdiction:       z.enum(['ccpa', 'gdpr', 'both', 'internal']),
  confirmationToken:  z.string().min(1),
});

const Create1071RecordSchema = z.object({
  businessId:     z.string().uuid(),
  applicationId:  z.string().uuid().optional(),
  creditPurpose:  z.enum(['term_loan', 'line_of_credit', 'business_credit_card', 'merchant_cash_advance', 'equipment_financing', 'other']),
  actionTaken:    z.enum(['approved_and_originated', 'approved_not_accepted', 'denied', 'withdrawn_by_applicant', 'incomplete']),
  actionDate:     z.string().datetime(),
  adverseReasons: z.array(z.string()).optional(),
  demographicData: z.object({
    ownerSex:       z.enum(['male', 'female', 'nonbinary', 'declined_to_provide']).optional(),
    ownerRace:      z.array(z.string()).optional(),
    ownerEthnicity: z.enum(['hispanic_or_latino', 'not_hispanic_or_latino', 'declined_to_provide']).optional(),
    numberOfOwners: z.number().int().min(1).optional(),
    lgbtqiOwned:    z.boolean().nullable().optional(),
  }).optional(),
  businessType:   z.string().optional(),
});

const LogAiDecisionSchema = z.object({
  moduleSource:  z.enum(['stacking_optimizer', 'suitability_engine', 'credit_intelligence', 'udap_scorer', 'decline_recovery', 'contract_analysis', 'comm_compliance', 'fraud_detection']),
  decisionType:  z.enum(['recommendation', 'risk_score', 'classification', 'extraction', 'generation']),
  inputPayload:  z.record(z.unknown()),
  output:        z.record(z.unknown()),
  confidence:    z.number().min(0).max(1).optional(),
  modelVersion:  z.string().optional(),
  promptVersion: z.string().optional(),
  latencyMs:     z.number().int().positive().optional(),
});

const OverrideDecisionSchema = z.object({
  overriddenBy:    z.string().min(1),
  overrideReason:  z.string().min(1),
  correctedOutput: z.record(z.unknown()).optional(),
});

// ── Utility ───────────────────────────────────────────────────

function ok<T>(res: Response, data: T, statusCode = 200): void {
  const body: ApiResponse<T> = { success: true, data };
  res.status(statusCode).json(body);
}

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.errors.map((e) => e.message).join('; '));
  }
  return result.data;
}

// ============================================================
// ADMIN / TENANT ROUTES
// ============================================================

// POST /api/admin/tenants
adminRouter.post(
  '/admin/tenants',
  tenantMiddleware,
  requireAdminRole,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(CreateTenantSchema, req.body);
      const tenant = await getMultiTenantSvc().createTenant(input);
      ok(res, tenant, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/admin/tenants
adminRouter.get(
  '/admin/tenants',
  tenantMiddleware,
  requireAdminRole,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page     = parseInt(String(req.query['page']     ?? '1'),  10);
      const pageSize = parseInt(String(req.query['pageSize'] ?? '50'), 10);
      const isActive = req.query['isActive'] !== undefined
        ? req.query['isActive'] === 'true'
        : undefined;
      const plan = req.query['plan'] as string | undefined;

      const result = await getMultiTenantSvc().listTenants({ isActive, plan }, page, pageSize);
      const body: ApiResponse<typeof result> = {
        success: true,
        data:    result,
        meta:    { page, pageSize, total: result.total },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/admin/tenants/:id
adminRouter.put(
  '/admin/tenants/:id',
  tenantMiddleware,
  requireAdminRole,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input  = parseOrThrow(UpdateTenantSchema, req.body);
      const tenant = await getMultiTenantSvc().updateTenant(req.params['id']!, input);
      ok(res, tenant);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/admin/tenants/:id/flags
adminRouter.put(
  '/admin/tenants/:id/flags',
  tenantMiddleware,
  requireAdminRole,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(UpdateFlagsSchema, req.body);
      const flags = await getMultiTenantSvc().updateFeatureFlags(req.params['id']!, input);
      ok(res, flags);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/admin/tenants/:id/usage
adminRouter.get(
  '/admin/tenants/:id/usage',
  tenantMiddleware,
  requireAdminRole,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const summary = await getMultiTenantSvc().getUsageSummary(req.params['id']!);
      ok(res, summary);
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// OFFBOARDING ROUTES
// ============================================================

// POST /api/offboarding/initiate
adminRouter.post(
  '/offboarding/initiate',
  tenantMiddleware,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(InitiateOffboardingSchema, req.body);
      const status = await getOffboardingSvc().initiateOffboarding({
        ...input,
        requestedBy: req.tenant!.userId,
      });
      ok(res, status, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/offboarding/:id
adminRouter.get(
  '/offboarding/:id',
  tenantMiddleware,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await getOffboardingSvc().getOffboardingStatus(req.params['id']!);
      // Tenant isolation: ensure caller is the owning tenant or super_admin
      if (status.tenantId !== req.tenant!.tenantId && req.tenant!.role !== 'super_admin') {
        next(forbidden('Access denied to offboarding workflow.')); return;
      }
      ok(res, status);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/offboarding/:id/exit-interview
adminRouter.post(
  '/offboarding/:id/exit-interview',
  tenantMiddleware,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(ExitInterviewSchema, req.body);
      const status = await getOffboardingSvc().captureExitInterview({
        workflowId: req.params['id']!,
        ...input,
      });
      ok(res, status);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/offboarding/:id/export
adminRouter.post(
  '/offboarding/:id/export',
  tenantMiddleware,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await getOffboardingSvc().exportTenantData(req.params['id']!);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/offboarding/:id/delete-data
adminRouter.post(
  '/offboarding/:id/delete-data',
  tenantMiddleware,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(DeleteDataSchema, req.body);
      const report = await getOffboardingSvc().deleteData({
        workflowId: req.params['id']!,
        ...input,
        requestedBy: req.tenant!.userId,
      });
      ok(res, report);
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// FAIR-LENDING / SECTION 1071 ROUTES
// ============================================================

// GET /api/fair-lending/dashboard
adminRouter.get(
  '/fair-lending/dashboard',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const year = req.query['year'] ? parseInt(String(req.query['year']), 10) : undefined;
      const dashboard = await getFairLendingSvc().getDashboard(req.tenant!.tenantId, year);
      ok(res, dashboard);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/fair-lending/records
adminRouter.post(
  '/fair-lending/records',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(Create1071RecordSchema, req.body);
      const result = await getFairLendingSvc().create1071Record({
        tenantId: req.tenant!.tenantId,
        ...input,
        actionDate: new Date(input.actionDate),
      });
      ok(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/fair-lending/coverage
adminRouter.get(
  '/fair-lending/coverage',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const year = req.query['year'] ? parseInt(String(req.query['year']), 10) : undefined;
      const result = await getFairLendingSvc().checkCoverageThreshold(req.tenant!.tenantId, year);
      ok(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/fair-lending/adverse-action
adminRouter.get(
  '/fair-lending/adverse-action',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const year = req.query['year'] ? parseInt(String(req.query['year']), 10) : undefined;
      const report = await getFairLendingSvc().getAdverseActionReport(req.tenant!.tenantId, { year });
      ok(res, report);
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// AI GOVERNANCE ROUTES
// ============================================================

// GET /api/ai-governance/decisions
adminRouter.get(
  '/ai-governance/decisions',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page     = parseInt(String(req.query['page']     ?? '1'),  10);
      const pageSize = parseInt(String(req.query['pageSize'] ?? '50'), 10);
      const result = await getAiGovernanceSvc().listDecisions(req.tenant!.tenantId, {
        moduleSource:       req.query['module'] as string | undefined,
        decisionType:       req.query['type']   as string | undefined,
        onlyOverridden:     req.query['overridden']       === 'true',
        onlyBelowThreshold: req.query['belowThreshold']   === 'true',
        page,
        pageSize,
      });
      const body: ApiResponse<typeof result> = {
        success: true,
        data:    result,
        meta:    { page, pageSize, total: result.total },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/ai-governance/decisions
adminRouter.post(
  '/ai-governance/decisions',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(LogAiDecisionSchema, req.body);
      const decision = await getAiGovernanceSvc().logDecision({
        tenantId: req.tenant!.tenantId,
        ...input,
      });
      ok(res, decision, 201);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/ai-governance/decisions/:id/override
adminRouter.post(
  '/ai-governance/decisions/:id/override',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(OverrideDecisionSchema, req.body);
      const decision = await getAiGovernanceSvc().overrideDecision({
        decisionId: req.params['id']!,
        tenantId:   req.tenant!.tenantId,
        ...input,
      });
      ok(res, decision);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/ai-governance/metrics
adminRouter.get(
  '/ai-governance/metrics',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const moduleSource = req.query['module'] as string | undefined;
      const periodDays   = req.query['days'] ? parseInt(String(req.query['days']), 10) : 30;
      const metrics = await getAiGovernanceSvc().getMetrics(
        req.tenant!.tenantId,
        moduleSource,
        periodDays,
      );
      ok(res, metrics);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/ai-governance/versions
adminRouter.get(
  '/ai-governance/versions',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const moduleSource = req.query['module'] as string | undefined;
      const versions = await getAiGovernanceSvc().getVersionHistory(
        req.tenant!.tenantId,
        moduleSource,
      );
      ok(res, versions);
    } catch (err) {
      next(err);
    }
  },
);
