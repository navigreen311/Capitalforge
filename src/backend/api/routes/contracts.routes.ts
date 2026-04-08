// ============================================================
// CapitalForge — Contract Intelligence & Disclosure CMS Routes
//
// All routes require authentication (tenantMiddleware).
//
// Contract Intelligence:
//   POST   /api/contracts/analyze           — analyze a contract document
//   GET    /api/contracts/analyses          — list analyses for tenant
//   GET    /api/contracts/:id/red-flags     — red flags for an analysis
//   POST   /api/contracts/compare          — side-by-side comparison lab
//   GET    /api/contracts/:id/detail        — mock contract detail with key terms
//   POST   /api/contracts/:id/renew         — create contract renewal
//   POST   /api/contracts/upload            — upload contract with metadata
//
// Disclosure Template CMS:
//   GET    /api/disclosures/templates                  — list templates
//   POST   /api/disclosures/templates                  — create template
//   PUT    /api/disclosures/templates/:id              — update template
//   POST   /api/disclosures/templates/:id/submit       — submit for approval
//   POST   /api/disclosures/templates/:id/approve      — approve template
//   GET    /api/disclosures/templates/:id/history      — version history
//   POST   /api/disclosures/render                     — render for client
//   POST   /api/disclosures/render-all                 — render all for state
//   POST   /api/disclosures/seed                       — seed default templates
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { AppError, badRequest, notFound, forbidden } from '../../middleware/error-handler.js';
import { ContractIntelligenceService } from '../../services/contract-intelligence.service.js';
import { DisclosureCmsService } from '../../services/disclosure-cms.service.js';
import type { RenderContext, DisclosureCategory } from '../../services/disclosure-cms.service.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import logger from '../../config/logger.js';

export const contractsRouter = Router();

// ── Lazy service initialisation ───────────────────────────────────

let prisma: PrismaClient | null = null;
let contractSvc: ContractIntelligenceService | null = null;
let disclosureSvc: DisclosureCmsService | null = null;

function getContractService(): ContractIntelligenceService {
  if (!contractSvc) {
    prisma = prisma ?? new PrismaClient();
    contractSvc = new ContractIntelligenceService(prisma);
  }
  return contractSvc;
}

function getDisclosureService(): DisclosureCmsService {
  if (!disclosureSvc) {
    prisma = prisma ?? new PrismaClient();
    disclosureSvc = new DisclosureCmsService(prisma);
  }
  return disclosureSvc;
}

// ── Permission guard ──────────────────────────────────────────────

function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const ctx = req.tenant;
    if (!ctx) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
      return;
    }
    if (!ctx.permissions.includes(permission)) {
      next(forbidden(`Permission "${permission}" is required for this action.`));
      return;
    }
    next();
  };
}

// ── Validation schemas ────────────────────────────────────────────

const AnalyzeContractSchema = z.object({
  contractType: z.string().min(1).max(100),
  documentText: z.string().min(50, 'Document text must be at least 50 characters'),
  documentId: z.string().uuid().optional(),
  partnerId: z.string().uuid().optional(),
});

const CompareContractsSchema = z.object({
  contracts: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1).max(100),
        documentText: z.string().min(50),
        contractType: z.string().min(1).max(100),
      }),
    )
    .min(2, 'At least two contracts are required for comparison')
    .max(5, 'Maximum 5 contracts can be compared at once'),
});

const CreateTemplateSchema = z.object({
  state: z.string().min(2).max(10).toUpperCase(),
  category: z.enum([
    'funding_agreement',
    'credit_stacking',
    'fee_schedule',
    'risk_acknowledgment',
    'personal_guarantee',
    'arbitration_notice',
    'state_specific',
    'federal',
  ]),
  name: z.string().min(1).max(200),
  content: z.string().min(100, 'Template content must be at least 100 characters'),
  effectiveDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  variables: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        required: z.boolean(),
        defaultValue: z.string().optional(),
      }),
    )
    .optional(),
});

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  content: z.string().min(100).optional(),
  effectiveDate: z.string().optional(),
  variables: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        required: z.boolean(),
        defaultValue: z.string().optional(),
      }),
    )
    .optional(),
});

const ApproveTemplateSchema = z.object({
  notes: z.string().max(500).optional(),
});

const RenderDisclosureSchema = z.object({
  templateId: z.string().uuid(),
  context: z.record(z.union([z.string(), z.number()])),
});

const RenderAllSchema = z.object({
  state: z.string().min(2).max(10),
  context: z.record(z.union([z.string(), z.number()])),
  categories: z
    .array(
      z.enum([
        'funding_agreement',
        'credit_stacking',
        'fee_schedule',
        'risk_acknowledgment',
        'personal_guarantee',
        'arbitration_notice',
        'state_specific',
        'federal',
      ]),
    )
    .optional(),
});

const ListAnalysesSchema = z.object({
  contractType: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const ListTemplatesSchema = z.object({
  state: z.string().optional(),
  category: z.string().optional(),
  activeOnly: z.string().transform(v => v === 'true').optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// ============================================================
// CONTRACT INTELLIGENCE ROUTES
// ============================================================

/**
 * POST /api/contracts/analyze
 * Analyze a contract document — extract clauses, detect red flags,
 * identify missing protections, compute risk score.
 */
contractsRouter.post(
  '/contracts/analyze',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE ?? 'COMPLIANCE_WRITE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = AnalyzeContractSchema.safeParse(req.body);
      if (!parsed.success) {
        next(badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body'));
        return;
      }

      const { contractType, documentText, documentId, partnerId } = parsed.data;
      const tenantId = req.tenant!.tenantId;

      const result = await getContractService().analyzeContract({
        tenantId,
        contractType,
        documentText,
        documentId,
        partnerId,
      });

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        meta: {
          riskScore: result.riskScore,
          riskLevel: result.riskLevel,
          clauseCount: result.extractedClauses.length,
          redFlagCount: result.redFlags.length,
          criticalFlags: result.redFlags.filter(f => f.severity === 'critical').length,
          missingProtectionCount: result.missingProtections.length,
        },
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/contracts/analyses
 * List contract analyses for the authenticated tenant.
 */
contractsRouter.get(
  '/contracts/analyses',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ ?? 'COMPLIANCE_READ'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ListAnalysesSchema.safeParse(req.query);
      if (!parsed.success) {
        next(badRequest('Invalid query parameters'));
        return;
      }

      const { contractType, limit, offset } = parsed.data;
      const tenantId = req.tenant!.tenantId;

      const results = await getContractService().listAnalyses(tenantId, {
        contractType,
        limit,
        offset,
      });

      const response: ApiResponse<typeof results> = {
        success: true,
        data: results,
        meta: { count: results.length, limit, offset },
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/contracts/:id/red-flags
 * Retrieve red flags for a specific contract analysis.
 */
contractsRouter.get(
  '/contracts/:id/red-flags',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ ?? 'COMPLIANCE_READ'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenant!.tenantId;

      const flags = await getContractService().getRedFlags(tenantId, id);

      const response: ApiResponse<typeof flags> = {
        success: true,
        data: flags,
        meta: {
          total: flags.length,
          critical: flags.filter(f => f.severity === 'critical').length,
          high: flags.filter(f => f.severity === 'high').length,
          medium: flags.filter(f => f.severity === 'medium').length,
          low: flags.filter(f => f.severity === 'low').length,
        },
      };

      res.json(response);
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        next(notFound('Contract analysis not found.'));
      } else {
        next(err);
      }
    }
  },
);

/**
 * POST /api/contracts/compare
 * Side-by-side contract comparison lab.
 * Accepts 2–5 contracts and returns a clause matrix with risk scoring.
 */
contractsRouter.post(
  '/contracts/compare',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE ?? 'COMPLIANCE_WRITE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CompareContractsSchema.safeParse(req.body);
      if (!parsed.success) {
        next(badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body'));
        return;
      }

      const tenantId = req.tenant!.tenantId;

      const result = await getContractService().compareContracts(
        tenantId,
        parsed.data.contracts,
      );

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        meta: { contractCount: parsed.data.contracts.length },
      };

      res.json(response);
    } catch (err: any) {
      if (err.message?.includes('At least two')) {
        next(badRequest(err.message));
      } else {
        next(err);
      }
    }
  },
);

/**
 * POST /api/contracts/upload
 * Upload a contract with metadata. Returns mock upload result.
 * Must be registered BEFORE :id routes to avoid "upload" matching as an ID.
 */
contractsRouter.post(
  '/contracts/upload',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE ?? 'COMPLIANCE_WRITE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        title: z.string().min(1).max(200),
        contractType: z.string().min(1).max(100),
        counterparty: z.string().min(1).max(200).optional(),
        effectiveDate: z.string().optional(),
        expirationDate: z.string().optional(),
        documentText: z.string().min(10).optional(),
        tags: z.array(z.string()).max(20).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        next(badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body'));
        return;
      }

      const tenantId = req.tenant!.tenantId;
      const data = parsed.data;

      const contractId = `con_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const responseData = {
        id: contractId,
        title: data.title,
        contractType: data.contractType,
        counterparty: data.counterparty ?? null,
        effectiveDate: data.effectiveDate ?? null,
        expirationDate: data.expirationDate ?? null,
        status: 'uploaded' as const,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.tenant!.userId ?? 'system',
        tags: data.tags ?? [],
      };

      logger.info('Contract uploaded', {
        tenantId,
        contractId,
        contractType: data.contractType,
      });

      const response: ApiResponse<typeof responseData> = {
        success: true,
        data: responseData,
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/contracts/:id/detail
 * Returns mock contract detail with key terms and risk flags.
 */
contractsRouter.get(
  '/contracts/:id/detail',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ ?? 'COMPLIANCE_READ'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenant!.tenantId;

      // Mock contract detail — in production this would fetch from DB
      const responseData = {
        id,
        title: `Contract ${id}`,
        contractType: 'vendor_agreement',
        counterparty: 'Acme Financial Services LLC',
        status: 'active',
        effectiveDate: '2025-01-15',
        expirationDate: '2026-01-15',
        autoRenew: true,
        totalValue: 150000,
        currency: 'USD',
        keyTerms: [
          { clause: 'Payment Terms', summary: 'Net 30 from invoice date', section: '4.1' },
          { clause: 'Termination', summary: '90-day written notice required', section: '8.2' },
          { clause: 'Liability Cap', summary: 'Limited to 12 months of fees paid', section: '9.1' },
          { clause: 'Data Protection', summary: 'SOC 2 Type II compliance required', section: '11.3' },
          { clause: 'Indemnification', summary: 'Mutual indemnification for IP claims', section: '10.1' },
        ],
        riskFlags: [
          { severity: 'high', flag: 'Auto-renewal clause with no cap on price increases', clause: '3.4' },
          { severity: 'medium', flag: 'Broad force majeure definition may limit recourse', clause: '12.1' },
          { severity: 'low', flag: 'Governing law is Delaware — verify jurisdictional preference', clause: '14.2' },
        ],
        renewalHistory: [
          { date: '2024-01-15', action: 'initial_execution', notes: 'Original contract signed' },
          { date: '2025-01-15', action: 'auto_renewed', notes: 'Auto-renewed for 12 months' },
        ],
      };

      logger.info('Contract detail retrieved', { tenantId, contractId: id });

      const response: ApiResponse<typeof responseData> = {
        success: true,
        data: responseData,
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/contracts/:id/renew
 * Create a contract renewal. Returns the renewed contract summary.
 */
contractsRouter.post(
  '/contracts/:id/renew',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE ?? 'COMPLIANCE_WRITE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenant!.tenantId;

      const schema = z.object({
        renewalTermMonths: z.number().int().min(1).max(120).default(12),
        notes: z.string().max(500).optional(),
        newTerms: z.record(z.string()).optional(),
      });

      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        next(badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body'));
        return;
      }

      const { renewalTermMonths, notes, newTerms } = parsed.data;
      const renewalId = `ren_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date();
      const newExpiration = new Date(now);
      newExpiration.setMonth(newExpiration.getMonth() + renewalTermMonths);

      const responseData = {
        renewalId,
        originalContractId: id,
        status: 'renewed' as const,
        renewalTermMonths,
        effectiveDate: now.toISOString().split('T')[0],
        newExpirationDate: newExpiration.toISOString().split('T')[0],
        notes: notes ?? null,
        newTerms: newTerms ?? {},
        renewedAt: now.toISOString(),
        renewedBy: req.tenant!.userId ?? 'system',
      };

      logger.info('Contract renewed', {
        tenantId,
        contractId: id,
        renewalId,
        renewalTermMonths,
      });

      const response: ApiResponse<typeof responseData> = {
        success: true,
        data: responseData,
        meta: { message: `Contract ${id} renewed for ${renewalTermMonths} months.` },
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// DISCLOSURE TEMPLATE CMS ROUTES
// ============================================================

/**
 * GET /api/disclosures/templates
 * List disclosure templates. Supports filters: state, category, activeOnly.
 */
contractsRouter.get(
  '/disclosures/templates',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ ?? 'COMPLIANCE_READ'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ListTemplatesSchema.safeParse(req.query);
      if (!parsed.success) {
        next(badRequest('Invalid query parameters'));
        return;
      }

      const { state, category, activeOnly, limit, offset } = parsed.data;
      const tenantId = req.tenant!.tenantId;

      const templates = await getDisclosureService().listTemplates(tenantId, {
        state,
        category: category as DisclosureCategory | undefined,
        activeOnly: activeOnly ?? false,
        limit,
        offset,
      });

      const response: ApiResponse<typeof templates> = {
        success: true,
        data: templates,
        meta: { count: templates.length, limit, offset },
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/disclosures/templates
 * Create a new disclosure template. Starts in draft/pending_review status.
 */
contractsRouter.post(
  '/disclosures/templates',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE ?? 'COMPLIANCE_WRITE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        next(badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body'));
        return;
      }

      const tenantId = req.tenant!.tenantId;
      const { state, category, name, content, effectiveDate, variables } = parsed.data;

      const template = await getDisclosureService().createTemplate({
        tenantId,
        state,
        category,
        name,
        content,
        effectiveDate: new Date(effectiveDate),
        variables,
      });

      const response: ApiResponse<typeof template> = {
        success: true,
        data: template,
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /api/disclosures/templates/:id
 * Update a template. Bumps version and requires re-approval.
 */
contractsRouter.put(
  '/disclosures/templates/:id',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE ?? 'COMPLIANCE_WRITE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = UpdateTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        next(badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body'));
        return;
      }

      const tenantId = req.tenant!.tenantId;
      const { id } = req.params;

      const updated = await getDisclosureService().updateTemplate(tenantId, id, {
        ...parsed.data,
        effectiveDate: parsed.data.effectiveDate ? new Date(parsed.data.effectiveDate) : undefined,
      });

      const response: ApiResponse<typeof updated> = {
        success: true,
        data: updated,
        meta: { message: 'Template updated. Re-approval required before activation.' },
      };

      res.json(response);
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        next(notFound('Disclosure template not found.'));
      } else {
        next(err);
      }
    }
  },
);

/**
 * POST /api/disclosures/templates/:id/submit
 * Submit a template for compliance team approval.
 */
contractsRouter.post(
  '/disclosures/templates/:id/submit',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE ?? 'COMPLIANCE_WRITE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenant!.tenantId;
      const { id } = req.params;

      const template = await getDisclosureService().submitForApproval(tenantId, id);

      const response: ApiResponse<typeof template> = {
        success: true,
        data: template,
        meta: { message: 'Template submitted for compliance review.' },
      };

      res.json(response);
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        next(notFound('Disclosure template not found.'));
      } else {
        next(err);
      }
    }
  },
);

/**
 * POST /api/disclosures/templates/:id/approve
 * Approve a template for activation. Compliance team only.
 * Automatically deactivates any previously active template for the same state/category.
 */
contractsRouter.post(
  '/disclosures/templates/:id/approve',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE ?? 'COMPLIANCE_WRITE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = ApproveTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        next(badRequest('Invalid request body'));
        return;
      }

      const tenantId = req.tenant!.tenantId;
      const { id } = req.params;
      const userId = req.tenant!.userId;

      if (!userId) {
        next(new AppError(401, 'UNAUTHORIZED', 'User identity required for template approval.'));
        return;
      }

      const approved = await getDisclosureService().approveTemplate(tenantId, id, {
        approverId: userId,
        notes: parsed.data.notes,
      });

      const response: ApiResponse<typeof approved> = {
        success: true,
        data: approved,
        meta: { message: 'Template approved and activated.' },
      };

      res.json(response);
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        next(notFound('Disclosure template not found.'));
      } else {
        next(err);
      }
    }
  },
);

/**
 * GET /api/disclosures/templates/:id/history
 * Get version history for a specific template's state/category.
 */
contractsRouter.get(
  '/disclosures/templates/:id/history',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ ?? 'COMPLIANCE_READ'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenant!.tenantId;
      const { id } = req.params;

      const template = await getDisclosureService().getTemplate(tenantId, id);
      if (!template) {
        next(notFound('Disclosure template not found.'));
        return;
      }

      const history = await getDisclosureService().getVersionHistory(
        tenantId,
        template.state,
        template.category,
      );

      const response: ApiResponse<typeof history> = {
        success: true,
        data: history,
        meta: { count: history.length, state: template.state, category: template.category },
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/disclosures/render
 * Render a disclosure template for a specific client.
 * Auto-populates from provided context (client profile + deal data).
 */
contractsRouter.post(
  '/disclosures/render',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE ?? 'COMPLIANCE_WRITE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = RenderDisclosureSchema.safeParse(req.body);
      if (!parsed.success) {
        next(badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body'));
        return;
      }

      const tenantId = req.tenant!.tenantId;
      const { templateId, context } = parsed.data;

      const rendered = await getDisclosureService().renderDisclosure(
        tenantId,
        templateId,
        context as RenderContext,
      );

      if (rendered.missingVariables.length > 0) {
        logger.warn(
          { templateId, missing: rendered.missingVariables },
          'Disclosure rendered with missing variables',
        );
      }

      const response: ApiResponse<typeof rendered> = {
        success: true,
        data: rendered,
        meta: {
          missingVariableCount: rendered.missingVariables.length,
          ...(rendered.missingVariables.length > 0
            ? { warning: `${rendered.missingVariables.length} variable(s) not populated: ${rendered.missingVariables.join(', ')}` }
            : {}),
        },
      };

      res.json(response);
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        next(notFound('Disclosure template not found.'));
      } else if (err.message?.includes('not active')) {
        next(badRequest(err.message));
      } else {
        next(err);
      }
    }
  },
);

/**
 * POST /api/disclosures/render-all
 * Render all required disclosures for a client's state.
 * Returns both federal and state-specific active templates.
 */
contractsRouter.post(
  '/disclosures/render-all',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE ?? 'COMPLIANCE_WRITE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = RenderAllSchema.safeParse(req.body);
      if (!parsed.success) {
        next(badRequest(parsed.error.issues[0]?.message ?? 'Invalid request body'));
        return;
      }

      const tenantId = req.tenant!.tenantId;
      const { state, context, categories } = parsed.data;

      const rendered = await getDisclosureService().renderAllForState(
        tenantId,
        state,
        context as RenderContext,
        categories,
      );

      const totalMissing = rendered.reduce((n, r) => n + r.missingVariables.length, 0);

      const response: ApiResponse<typeof rendered> = {
        success: true,
        data: rendered,
        meta: {
          count: rendered.length,
          state: state.toUpperCase(),
          totalMissingVariables: totalMissing,
        },
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/disclosures/seed
 * Seed default federal + common-state templates for the tenant.
 * Admin only. Pass { autoApprove: true, approverId: "<userId>" } to activate immediately.
 */
contractsRouter.post(
  '/disclosures/seed',
  tenantMiddleware,
  requirePermission(PERMISSIONS.ADMIN ?? 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { autoApprove, approverId } = req.body ?? {};
      const tenantId = req.tenant!.tenantId;

      const resolvedApproverId = autoApprove
        ? (approverId ?? req.tenant!.userId)
        : undefined;

      const count = await getDisclosureService().seedDefaultTemplates(
        tenantId,
        resolvedApproverId,
      );

      const response: ApiResponse<{ seeded: number }> = {
        success: true,
        data: { seeded: count },
        meta: { message: `${count} default templates seeded.` },
      };

      res.json(response);
    } catch (err) {
      next(err);
    }
  },
);
