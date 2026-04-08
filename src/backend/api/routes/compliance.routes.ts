// ============================================================
// CapitalForge — Compliance & Risk Routes
//
// All routes require authentication (tenantMiddleware).
// COMPLIANCE_READ permission required for GET endpoints.
// COMPLIANCE_WRITE permission required for POST endpoints.
//
// Endpoints:
//   GET  /api/businesses/:id/compliance/risk-score
//   POST /api/businesses/:id/compliance/check
//   GET  /api/compliance/state-laws/:state
//   GET  /api/compliance/vendor-history/:vendorId
//   POST /api/compliance/run-checks          — mock check run
//   GET  /api/compliance/score-breakdown     — mock score breakdown
//   POST /api/compliance/export-report       — mock compliance report
//   POST /api/compliance/disclosures/:id/file       — mark disclosure as filed
//   POST /api/compliance/disclosures/bulk-file      — file multiple disclosures
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { AppError, badRequest, notFound, forbidden } from '../../middleware/error-handler.js';
import { ComplianceService } from '../../services/compliance.service.js';
import type {
  ComplianceCheckInput,
  ComplianceCheckResult,
  RiskRegisterResult,
  VendorEnforcementRecord,
} from '../../services/compliance.service.js';
import type { StateLawProfile } from '../../services/state-law-mapper.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import logger from '../../config/logger.js';

export const complianceRouter = Router();

// ── Shared instances ──────────────────────────────────────────────
// Lazy-initialised to avoid Prisma client boot-up in tests.
let prisma: PrismaClient | null = null;
let svc: ComplianceService | null = null;

function getService(): ComplianceService {
  if (!svc) {
    prisma = prisma ?? new PrismaClient();
    svc = new ComplianceService(prisma);
  }
  return svc;
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

// ── Input validation schemas ──────────────────────────────────────

const ComplianceCheckBodySchema = z.object({
  checkType: z.enum(['udap', 'state_law', 'vendor', 'kyb', 'kyc', 'aml']),
  stateCode: z.string().length(2).optional(),
  interactionText: z.string().max(50000).optional(),
  vendorId: z.string().optional(),
  riskRegisterInput: z
    .object({
      monthlyRevenue:        z.number().nonnegative().optional(),
      existingDebt:          z.number().nonnegative().optional(),
      creditUtilization:     z.number().min(0).max(1).optional(),
      ficoScore:             z.number().int().min(300).max(850).optional(),
      businessAgeMonths:     z.number().int().nonnegative().optional(),
      proposedFundingAmount: z.number().nonnegative().optional(),
      mcc:                   z.string().max(4).optional(),
      kycCompleted:          z.boolean().optional(),
      amlCleared:            z.boolean().optional(),
      stateCode:             z.string().length(2).optional(),
      interactionText:       z.string().max(50000).optional(),
      vendorIds:             z.array(z.string()).max(20).optional(),
    })
    .optional(),
});

// ── Route helpers ─────────────────────────────────────────────────

/** Verify that the business belongs to the requesting tenant. */
async function assertBusinessOwnership(
  businessId: string,
  tenantId: string,
  prismaClient: PrismaClient,
): Promise<void> {
  const biz = await prismaClient.business.findFirst({
    where: { id: businessId, tenantId },
    select: { id: true },
  });
  if (!biz) {
    throw notFound(`Business ${businessId}`);
  }
}

// ── Routes ────────────────────────────────────────────────────────
// Note: tenantMiddleware is applied per-route (not globally) so that
// unmatched paths can fall through to the 404 handler.

// ─────────────────────────────────────────────────────────────────
// GET /api/businesses/:id/compliance/risk-score
// Returns the latest persisted risk score for a business.
// ─────────────────────────────────────────────────────────────────
complianceRouter.get(
  '/businesses/:id/compliance/risk-score',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: businessId } = req.params;
      const { tenantId } = req.tenant!;

      const service = getService();

      await assertBusinessOwnership(businessId, tenantId, prisma ?? new PrismaClient());

      const result = await service.getRiskScore(businessId, tenantId);

      const body: ApiResponse<typeof result> = {
        success: true,
        data: result,
      };

      logger.info('Risk score retrieved', {
        requestId: req.requestId,
        tenantId,
        businessId,
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
      });

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/businesses/:id/compliance/check
// Run a new compliance check for a business.
// ─────────────────────────────────────────────────────────────────
complianceRouter.post(
  '/businesses/:id/compliance/check',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: businessId } = req.params;
      const { tenantId } = req.tenant!;

      // Validate body
      const parsed = ComplianceCheckBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const { checkType, stateCode, interactionText, vendorId, riskRegisterInput } = parsed.data;

      const service = getService();
      const prismaClient = prisma ?? new PrismaClient();

      await assertBusinessOwnership(businessId, tenantId, prismaClient);

      const input: ComplianceCheckInput = {
        businessId,
        tenantId,
        checkType,
        stateCode,
        interactionText,
        vendorId,
        riskRegisterInput: riskRegisterInput
          ? { ...riskRegisterInput, businessId, tenantId }
          : undefined,
      };

      const result: ComplianceCheckResult = await service.runComplianceCheck(input);

      logger.info('Compliance check completed', {
        requestId: req.requestId,
        tenantId,
        businessId,
        checkType,
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        findingCount: result.findings.length,
      });

      const statusCode = result.riskLevel === 'critical' ? 200 : 201;
      const body: ApiResponse<ComplianceCheckResult> = {
        success: true,
        data: result,
      };

      res.status(statusCode).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/compliance/state-laws/:state
// Returns state-specific disclosure requirements.
// Two-letter state code required (e.g. "CA", "NY").
// ─────────────────────────────────────────────────────────────────
complianceRouter.get(
  '/state-laws/:state',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { state } = req.params;
      const code = state.trim().toUpperCase();

      if (!/^[A-Z]{2}$/.test(code)) {
        throw badRequest('State code must be a two-letter ISO 3166-2 code (e.g. "CA", "NY").');
      }

      const service = getService();
      const { profile, disclosures, steps } = service.getStateRequirements(code);

      if (!profile) {
        throw notFound(`State law profile for "${code}"`);
      }

      const responseData = {
        stateCode:            profile.stateCode,
        stateName:            profile.stateName,
        hasSpecificStateLaw:  profile.hasSpecificStateLaw,
        regulatoryBody:       profile.regulatoryBody,
        primaryCitation:      profile.primaryCitation,
        requiresBrokerLicense:profile.requiresBrokerLicense,
        pendingLegislation:   profile.pendingLegislation,
        notes:                profile.notes,
        requiredDisclosures:  disclosures,
        complianceSteps:      steps,
      };

      logger.info('State law profile retrieved', {
        requestId: req.requestId,
        tenantId: req.tenant!.tenantId,
        stateCode: code,
        hasSpecificStateLaw: profile.hasSpecificStateLaw,
      });

      const body: ApiResponse<typeof responseData> = {
        success: true,
        data: responseData,
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/compliance/vendor-history/:vendorId
// Returns enforcement history for a vendor.
// ─────────────────────────────────────────────────────────────────
complianceRouter.get(
  '/vendor-history/:vendorId',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { vendorId } = req.params;
      const { tenantId } = req.tenant!;

      if (!vendorId || vendorId.trim().length === 0) {
        throw badRequest('vendorId is required.');
      }

      const service = getService();
      const history: VendorEnforcementRecord = await service.getVendorHistory(vendorId.trim());

      logger.info('Vendor history retrieved', {
        requestId: req.requestId,
        tenantId,
        vendorId,
        riskLevel: history.riskLevel,
        actionCount: history.enforcementActions.length,
      });

      const body: ApiResponse<VendorEnforcementRecord> = {
        success: true,
        data: history,
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/compliance/overview
// Aggregate compliance stats across all businesses for a tenant.
// ─────────────────────────────────────────────────────────────────
complianceRouter.get(
  '/compliance/overview',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const prismaClient = prisma ?? new PrismaClient();

      const checks = await prismaClient.complianceCheck.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { business: { select: { id: true, businessName: true } } },
      });

      const total = checks.length;
      const passed = checks.filter((c) => c.riskLevel === 'low' || c.riskLevel === 'medium').length;
      const failed = total - passed;
      const critical = checks.filter((c) => c.riskLevel === 'critical').length;

      // Breakdown by checkType
      const breakdownMap: Record<string, { total: number; passed: number; failed: number; critical: number }> = {};
      for (const c of checks) {
        const t = c.checkType;
        if (!breakdownMap[t]) breakdownMap[t] = { total: 0, passed: 0, failed: 0, critical: 0 };
        breakdownMap[t].total++;
        if (c.riskLevel === 'low' || c.riskLevel === 'medium') breakdownMap[t].passed++;
        else breakdownMap[t].failed++;
        if (c.riskLevel === 'critical') breakdownMap[t].critical++;
      }

      // Risk distribution
      const riskDistribution = {
        critical: checks.filter((c) => c.riskLevel === 'critical').length,
        high: checks.filter((c) => c.riskLevel === 'high').length,
        medium: checks.filter((c) => c.riskLevel === 'medium').length,
        low: checks.filter((c) => c.riskLevel === 'low').length,
      };

      // Score
      const score = total === 0 ? 100 : Math.max(0, Math.round(
        ((passed / total) * 100)
        - (critical * 12)
        - (checks.filter((c) => c.riskLevel === 'high').length * 6)
      ));

      const responseData = {
        score,
        total,
        passed,
        failed,
        critical,
        breakdown: breakdownMap,
        riskDistribution,
        checks: checks.slice(0, 50).map((c) => ({
          id: c.id,
          checkType: c.checkType,
          businessName: c.business?.businessName ?? 'Unknown',
          riskLevel: c.riskLevel ?? 'low',
          passed: c.riskLevel === 'low' || c.riskLevel === 'medium',
          findings: typeof c.findings === 'string' ? c.findings : JSON.stringify(c.findings ?? ''),
          checkedAt: c.createdAt.toISOString(),
        })),
      };

      logger.info('Compliance overview retrieved', { requestId: req.requestId, tenantId, score, total });

      const body: ApiResponse<typeof responseData> = { success: true, data: responseData };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/compliance/run-all
// Run compliance checks for all businesses under the tenant.
// ─────────────────────────────────────────────────────────────────
complianceRouter.post(
  '/compliance/run-all',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const prismaClient = prisma ?? new PrismaClient();

      const businesses = await prismaClient.business.findMany({
        where: { tenantId },
        select: { id: true, businessName: true },
      });

      const service = getService();
      const results: Array<{ businessId: string; businessName: string; riskLevel: string }> = [];

      for (const biz of businesses) {
        try {
          const checkTypes = ['udap', 'kyb', 'aml'] as const;
          for (const checkType of checkTypes) {
            const result = await service.runComplianceCheck({
              businessId: biz.id,
              tenantId,
              checkType,
            });
            results.push({
              businessId: biz.id,
              businessName: biz.businessName ?? biz.id,
              riskLevel: result.riskLevel,
            });
          }
        } catch (err) {
          logger.warn('Compliance check failed for business', { businessId: biz.id, error: String(err) });
        }
      }

      const passed = results.filter((r) => r.riskLevel === 'low' || r.riskLevel === 'medium').length;
      const failed = results.length - passed;

      logger.info('Run-all compliance checks completed', {
        requestId: req.requestId,
        tenantId,
        businessCount: businesses.length,
        checkCount: results.length,
        passed,
        failed,
      });

      const body: ApiResponse<{ businessCount: number; checkCount: number; passed: number; failed: number; results: typeof results }> = {
        success: true,
        data: { businessCount: businesses.length, checkCount: results.length, passed, failed, results },
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/compliance/documents
// List all documents across businesses for a tenant.
// ─────────────────────────────────────────────────────────────────
complianceRouter.get(
  '/compliance/documents',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const prismaClient = prisma ?? new PrismaClient();

      const docs = await prismaClient.document.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { business: { select: { id: true, businessName: true } } },
      });

      const data = docs.map((d) => ({
        id: d.id,
        businessId: d.businessId,
        businessName: d.business?.businessName ?? 'Unknown',
        type: d.documentType,
        fileName: d.title,
        fileSizeBytes: d.sizeBytes ?? 0,
        uploadedAt: d.createdAt.toISOString(),
        uploadedBy: d.uploadedBy ?? 'System',
        legalHold: d.legalHold,
        aiParsed: false,
        pendingSignature: false,
        tags: [],
      }));

      const body: ApiResponse<typeof data> = { success: true, data };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/compliance/documents
// Upload document metadata.
// ─────────────────────────────────────────────────────────────────
complianceRouter.post(
  '/compliance/documents',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const prismaClient = prisma ?? new PrismaClient();

      const schema = z.object({
        businessId: z.string().optional(),
        documentType: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid document metadata.', parsed.error.flatten());
      }

      const doc = await prismaClient.document.create({
        data: {
          tenantId,
          businessId: parsed.data.businessId ?? null,
          documentType: parsed.data.documentType,
          title: parsed.data.title,
          storageKey: `pending/${Date.now()}_${parsed.data.title}`,
          metadata: parsed.data.description ? { description: parsed.data.description } : undefined,
          uploadedBy: req.tenant!.userId ?? 'system',
        },
      });

      logger.info('Document metadata created', { requestId: req.requestId, tenantId, docId: doc.id });

      const body: ApiResponse<typeof doc> = { success: true, data: doc };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// PATCH /api/compliance/documents/:id/hold
// Toggle legal hold on a document.
// ─────────────────────────────────────────────────────────────────
complianceRouter.patch(
  '/compliance/documents/:id/hold',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id } = req.params;
      const prismaClient = prisma ?? new PrismaClient();

      const doc = await prismaClient.document.findFirst({
        where: { id, tenantId },
      });
      if (!doc) {
        throw notFound(`Document ${id}`);
      }

      const { legalHold } = z.object({ legalHold: z.boolean() }).parse(req.body);

      const updated = await prismaClient.document.update({
        where: { id },
        data: { legalHold },
      });

      logger.info('Document legal hold toggled', { requestId: req.requestId, tenantId, docId: id, legalHold });

      const body: ApiResponse<{ id: string; legalHold: boolean }> = {
        success: true,
        data: { id: updated.id, legalHold: updated.legalHold },
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/compliance/disclosure-templates
// Returns all built-in disclosure templates, including the
// credit union membership disclosure for credit_union issuers.
// Optionally filter by ?issuerType=credit_union or ?category=cu_membership
// ─────────────────────────────────────────────────────────────────
complianceRouter.get(
  '/compliance/disclosure-templates',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const issuerType = (req.query.issuerType as string) || '';
      const category = (req.query.category as string) || '';

      // Static disclosure template registry — these are the built-in
      // compliance checklist items that must be acknowledged/completed
      // before an application can proceed.
      const templates = [
        {
          id: 'product_reality_disclosure',
          applicableTo: ['all'],
          title: 'Product Reality Disclosure',
          description: 'Client has acknowledged that they are receiving business credit cards, not a loan, and understands the nature of the product.',
          required: true,
          category: 'risk_acknowledgment',
        },
        {
          id: 'fee_schedule_disclosure',
          applicableTo: ['all'],
          title: 'Fee Schedule Disclosure',
          description: 'Client has received and acknowledged the complete fee schedule including program fees, annual card fees, and total estimated cost.',
          required: true,
          category: 'fee_schedule',
        },
        {
          id: 'credit_stacking_disclosure',
          applicableTo: ['all'],
          title: 'Credit Stacking Program Disclosure',
          description: 'Client has been informed of the risks and mechanics of the multi-card stacking program including credit impact, approval uncertainty, and interest rate risk.',
          required: true,
          category: 'credit_stacking',
        },
        {
          id: 'personal_guarantee_disclosure',
          applicableTo: ['all'],
          title: 'Personal Guarantee Disclosure',
          description: 'Client understands that business credit cards may require a personal guarantee and that they may be personally liable for balances.',
          required: true,
          category: 'personal_guarantee',
        },
        {
          id: 'cu_membership_disclosure',
          applicableTo: ['credit_union'],
          title: 'Credit Union Membership Disclosure',
          description: 'Client has been informed that membership in the credit union is required before applying for this card, and that the membership is a separate account/relationship from the business credit card.',
          required: true,
          category: 'cu_membership',
          templateText: `CREDIT UNION MEMBERSHIP DISCLOSURE

Date: [DISCLOSURE DATE]
Client Business: [CLIENT BUSINESS NAME]
Credit Union: [CREDIT UNION NAME]
Card Product: [CARD NAME]

MEMBERSHIP REQUIREMENT NOTICE

This disclosure is provided to inform you that the business credit card product you are applying for — [CARD NAME] — is issued by [CREDIT UNION NAME], a federally or state-chartered credit union.

MEMBERSHIP IS REQUIRED: Credit unions are member-owned financial cooperatives. Before your application for [CARD NAME] can be processed, you must establish membership with [CREDIT UNION NAME]. Membership is a SEPARATE account and relationship from the business credit card.

MEMBERSHIP ELIGIBILITY: [MEMBERSHIP REQUIREMENT]

MEMBERSHIP FEE: $[FEE AMOUNT]

IMPORTANT DISCLOSURES:
1. Membership in [CREDIT UNION NAME] is a prerequisite for any credit product.
2. The membership account is separate from and in addition to the business credit card account.
3. Membership fees and minimum balance requirements are set by [CREDIT UNION NAME] and are not controlled by or refundable through the advisory service.
4. Approval for membership does not guarantee approval for the credit card product.
5. If your credit card application is declined, your membership remains active and any fees/deposits are subject to the credit union's own policies.
6. Credit union deposits are insured by the NCUA up to $250,000 per depositor, per institution.`,
        },
        {
          id: 'state_specific_disclosure',
          applicableTo: ['all'],
          title: 'State-Specific Disclosure',
          description: 'Applicable state-mandated commercial financing disclosures have been provided to the client (e.g., CA SB 1235, NY S5470).',
          required: true,
          category: 'state_specific',
        },
      ];

      let filtered = templates;

      // Filter by issuer type — show only templates applicable to that type (or 'all')
      if (issuerType) {
        filtered = filtered.filter(
          (t) => t.applicableTo.includes(issuerType) || t.applicableTo.includes('all'),
        );
      }

      // Filter by category
      if (category) {
        filtered = filtered.filter((t) => t.category === category);
      }

      logger.info('Disclosure templates listed', {
        requestId: req.requestId,
        tenantId,
        issuerType: issuerType || 'all',
        category: category || 'all',
        count: filtered.length,
      });

      const body: ApiResponse<typeof filtered> = { success: true, data: filtered };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/compliance/disclosures
// List disclosure requirements with deadline tracking.
// ─────────────────────────────────────────────────────────────────
complianceRouter.get(
  '/compliance/disclosures',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      // Placeholder disclosure data — backed by a Disclosure model in a future iteration
      const disclosures = [
        { id: 'dis_001', businessName: 'Apex Ventures LLC',       state: 'CA', regulation: 'SB 1235 Commercial Finance Disclosures',  deadline: '2026-04-15', status: 'Pending',  filedAt: null },
        { id: 'dis_002', businessName: 'NovaTech Solutions Inc.',  state: 'NY', regulation: 'Commercial Finance Disclosure Law',        deadline: '2026-03-31', status: 'Overdue',  filedAt: null },
        { id: 'dis_003', businessName: 'Horizon Retail Partners',  state: 'IL', regulation: 'Consumer Installment Loan Act Disclosure', deadline: '2026-05-01', status: 'Filed',    filedAt: '2026-03-20T10:00:00Z' },
        { id: 'dis_004', businessName: 'Summit Capital Group',     state: 'TX', regulation: 'HB 1442 Business Lending Transparency',    deadline: '2026-09-01', status: 'Draft',    filedAt: null },
        { id: 'dis_005', businessName: 'Blue Ridge Consulting',    state: 'VA', regulation: 'Open-End Credit Disclosure Requirements',  deadline: '2026-04-10', status: 'Pending',  filedAt: null },
        { id: 'dis_006', businessName: 'Crestline Medical LLC',    state: 'UT', regulation: 'Consumer Credit Protection - Title 70C',   deadline: '2026-06-30', status: 'Filed',    filedAt: '2026-03-15T14:00:00Z' },
      ];

      logger.info('Disclosures listed', { requestId: req.requestId, tenantId, count: disclosures.length });

      const body: ApiResponse<typeof disclosures> = { success: true, data: disclosures };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/compliance/disclosures/:id/file
// Mark a disclosure as filed.
// ─────────────────────────────────────────────────────────────────
complianceRouter.post(
  '/compliance/disclosures/:id/file',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { tenantId } = req.tenant!;

      logger.info('Disclosure filed', { requestId: req.requestId, tenantId, disclosureId: id });

      const body: ApiResponse<{ id: string; status: string; filedAt: string }> = {
        success: true,
        data: { id, status: 'Filed', filedAt: new Date().toISOString() },
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/compliance/complaints
// List complaints for the tenant.
// ─────────────────────────────────────────────────────────────────
complianceRouter.get(
  '/compliance/complaints',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const prismaClient = prisma ?? new PrismaClient();

      const complaints = await prismaClient.complaint.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });

      const data = complaints.map((c) => ({
        id: c.id,
        businessName: c.businessId ?? 'Unknown',
        complaintType: c.category,
        channel: c.source,
        status: c.status,
        description: c.description,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        assignee: c.assignedTo ?? '',
        slaDeadline: new Date(c.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }));

      logger.info('Compliance complaints listed', { requestId: req.requestId, tenantId, count: data.length });

      const body: ApiResponse<typeof data> = { success: true, data };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/compliance/complaints
// Create a new complaint.
// ─────────────────────────────────────────────────────────────────
complianceRouter.post(
  '/compliance/complaints',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const prismaClient = prisma ?? new PrismaClient();

      const schema = z.object({
        businessId: z.string().optional(),
        complaintType: z.string().min(1),
        channel: z.string().min(1),
        description: z.string().min(1),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid complaint data.', parsed.error.flatten());
      }

      const complaint = await prismaClient.complaint.create({
        data: {
          tenantId,
          businessId: parsed.data.businessId ?? null,
          category: parsed.data.complaintType,
          source: parsed.data.channel,
          description: parsed.data.description,
          status: 'Received',
          severity: 'medium',
        },
      });

      logger.info('Compliance complaint created', { requestId: req.requestId, tenantId, complaintId: complaint.id });

      const body: ApiResponse<typeof complaint> = { success: true, data: complaint };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// PATCH /api/compliance/complaints/:id
// Update complaint status.
// ─────────────────────────────────────────────────────────────────
complianceRouter.patch(
  '/compliance/complaints/:id',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id } = req.params;
      const prismaClient = prisma ?? new PrismaClient();

      const complaint = await prismaClient.complaint.findFirst({
        where: { id, tenantId },
      });
      if (!complaint) {
        throw notFound(`Complaint ${id}`);
      }

      const schema = z.object({
        status: z.enum(['Received', 'Under Review', 'Responded', 'Resolved', 'Escalated']).optional(),
        assignedTo: z.string().optional(),
        resolution: z.string().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid update data.', parsed.error.flatten());
      }

      const updated = await prismaClient.complaint.update({
        where: { id },
        data: {
          ...(parsed.data.status && { status: parsed.data.status }),
          ...(parsed.data.assignedTo && { assignedTo: parsed.data.assignedTo }),
          ...(parsed.data.resolution && { resolution: parsed.data.resolution }),
        },
      });

      logger.info('Compliance complaint updated', { requestId: req.requestId, tenantId, complaintId: id, status: parsed.data.status });

      const body: ApiResponse<typeof updated> = { success: true, data: updated };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/compliance/run-checks
// Run a mock compliance check sweep. Returns summary of new issues,
// resolved issues, and total items checked.
// ─────────────────────────────────────────────────────────────────
complianceRouter.post(
  '/compliance/run-checks',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      // Mock check run — in production this would trigger real compliance engines
      const newIssues = Math.floor(Math.random() * 5);
      const resolved = Math.floor(Math.random() * 3);
      const totalChecked = 25 + Math.floor(Math.random() * 20);

      const responseData = {
        new_issues: newIssues,
        resolved,
        total_checked: totalChecked,
        run_at: new Date().toISOString(),
        check_types: ['udap', 'state_law', 'vendor', 'kyb', 'kyc', 'aml'],
        status: 'completed',
      };

      logger.info('Compliance checks run', { requestId: req.requestId, tenantId, ...responseData });

      const body: ApiResponse<typeof responseData> = { success: true, data: responseData };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/compliance/score-breakdown
// Returns mock score breakdown by check type with reasons.
// ─────────────────────────────────────────────────────────────────
complianceRouter.get(
  '/compliance/score-breakdown',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const breakdown = [
        {
          checkType: 'udap',
          label: 'UDAP / Deceptive Practices',
          score: 92,
          maxScore: 100,
          status: 'pass',
          reasons: ['All marketing materials reviewed', 'No deceptive practices found'],
        },
        {
          checkType: 'state_law',
          label: 'State Law Compliance',
          score: 78,
          maxScore: 100,
          status: 'warning',
          reasons: ['CA SB 1235 disclosure pending update', 'NY disclosure filed on time'],
        },
        {
          checkType: 'vendor',
          label: 'Vendor Due Diligence',
          score: 85,
          maxScore: 100,
          status: 'pass',
          reasons: ['All vendor contracts current', '2 vendors due for annual review'],
        },
        {
          checkType: 'kyb',
          label: 'KYB Verification',
          score: 100,
          maxScore: 100,
          status: 'pass',
          reasons: ['All businesses verified', 'No expired verifications'],
        },
        {
          checkType: 'kyc',
          label: 'KYC / Identity',
          score: 95,
          maxScore: 100,
          status: 'pass',
          reasons: ['1 pending re-verification', 'All others current'],
        },
        {
          checkType: 'aml',
          label: 'AML / Sanctions',
          score: 88,
          maxScore: 100,
          status: 'warning',
          reasons: ['Screening current', '1 pending enhanced due diligence review'],
        },
      ];

      const overallScore = Math.round(
        breakdown.reduce((sum, b) => sum + b.score, 0) / breakdown.length,
      );

      const responseData = {
        overallScore,
        breakdown,
        generatedAt: new Date().toISOString(),
      };

      logger.info('Score breakdown retrieved', { requestId: req.requestId, tenantId, overallScore });

      const body: ApiResponse<typeof responseData> = { success: true, data: responseData };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/compliance/export-report
// Returns a mock compliance report as text/JSON payload.
// ─────────────────────────────────────────────────────────────────
complianceRouter.post(
  '/compliance/export-report',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const reportText = [
        '=== COMPLIANCE REPORT ===',
        `Tenant: ${tenantId}`,
        `Generated: ${new Date().toISOString()}`,
        '',
        '--- Summary ---',
        'Overall Compliance Score: 89/100',
        'Total Checks Run: 42',
        'Passed: 38',
        'Failed: 4',
        'Critical Issues: 1',
        '',
        '--- Critical Issues ---',
        '1. [STATE_LAW] CA SB 1235 disclosure update overdue - Due: 2026-03-31',
        '',
        '--- Warnings ---',
        '1. [VENDOR] 2 vendor contracts approaching renewal deadline',
        '2. [AML] 1 enhanced due diligence review pending',
        '3. [STATE_LAW] NY commercial finance disclosure needs annual refresh',
        '',
        '--- Recommendations ---',
        '1. Prioritize CA disclosure update to avoid regulatory penalty',
        '2. Schedule vendor renewal meetings for next 30 days',
        '3. Complete pending EDD review within 2 weeks',
        '',
        '=== END OF REPORT ===',
      ].join('\n');

      const responseData = {
        reportText,
        format: 'text',
        generatedAt: new Date().toISOString(),
        tenantId,
      };

      logger.info('Compliance report exported', { requestId: req.requestId, tenantId });

      const body: ApiResponse<typeof responseData> = { success: true, data: responseData };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/compliance/disclosures/bulk-file
// File multiple disclosures at once. Accepts { ids: string[] }.
// Must be registered BEFORE the :id/file route to avoid conflicts.
// ─────────────────────────────────────────────────────────────────
complianceRouter.post(
  '/compliance/disclosures/bulk-file',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const schema = z.object({
        ids: z.array(z.string().min(1)).min(1, 'At least one disclosure ID is required').max(50),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const filedAt = new Date().toISOString();
      const results = parsed.data.ids.map((id) => ({
        id,
        status: 'Filed',
        filedAt,
      }));

      logger.info('Bulk disclosures filed', {
        requestId: req.requestId,
        tenantId,
        count: results.length,
        ids: parsed.data.ids,
      });

      const body: ApiResponse<typeof results> = { success: true, data: results };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);
