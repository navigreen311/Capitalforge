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
//   POST /api/compliance/run-checks          — run the sweep, persist results
//   GET  /api/compliance/score-breakdown     — breakdown from compliance_checks
//   POST /api/compliance/export-report       — report built from those rows
//   POST /api/compliance/disclosures/:id/file       — mark disclosure as filed
//   POST /api/compliance/disclosures/bulk-file      — file multiple disclosures
// ============================================================

import { Router, Response, NextFunction } from 'express';
import type { Request } from '../../types/http.js';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { prisma as sharedPrisma } from '../../config/database.js';
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

/**
 * One client for this router.
 *
 * Twelve handlers here read `prisma ?? sharedPrisma`, and `prisma` was
 * only ever assigned inside getSvc() — so any route that did not go through
 * the service constructed a client per request. Under the browser suite that
 * exhausted the connection pool and surfaced as intermittent 500s on
 * whichever compliance route happened to be running.
 */
function getPrisma(): PrismaClient {
  prisma = prisma ?? sharedPrisma;
  return prisma;
}
let svc: ComplianceService | null = null;

function getService(): ComplianceService {
  if (!svc) {
    svc = new ComplianceService(getPrisma());
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
      const businessId = req.params.id!;
      const { tenantId } = req.tenant!;

      const service = getService();

      await assertBusinessOwnership(businessId, tenantId, getPrisma());

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
      const businessId = req.params.id!;
      const { tenantId } = req.tenant!;

      // Validate body
      const parsed = ComplianceCheckBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const { checkType, stateCode, interactionText, vendorId, riskRegisterInput } = parsed.data;

      const service = getService();
      const prismaClient = getPrisma();

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
      const state = req.params.state!;
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
  // Was '/vendor-history/:vendorId'. This router mounts at '/', and every
  // other route in it carries the /compliance prefix, so the path the header
  // of this file documents — and the only one a caller would try — answered
  // 404. Nothing called it, which is how it went unnoticed.
  '/compliance/vendor-history/:vendorId',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vendorId = req.params.vendorId!;
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
      const prismaClient = getPrisma();

      const checks = await prismaClient.complianceCheck.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { business: { select: { id: true, legalName: true } } },
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
      //
      // Null when nothing has been checked. This returned 100 for a tenant
      // with no checks on record, which is the strongest claim the endpoint
      // can make — a clean bill of health — derived from the absence of any
      // evidence at all. A new tenant scored perfectly until the first check
      // ran and could only go down from there.
      const score = total === 0 ? null : Math.max(0, Math.round(
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
          businessName: c.business?.legalName ?? 'Unknown',
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
      const prismaClient = getPrisma();

      const businesses = await prismaClient.business.findMany({
        where: { tenantId },
        select: { id: true, legalName: true },
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
              businessName: biz.legalName ?? biz.id,
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
      const prismaClient = getPrisma();

      const docs = await prismaClient.document.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { business: { select: { id: true, legalName: true } } },
      });

      const data = docs.map((d) => ({
        id: d.id,
        businessId: d.businessId,
        businessName: d.business?.legalName ?? 'Unknown',
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
      const prismaClient = getPrisma();

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
// `PATCH /api/compliance/documents/:id/hold` lived here.
//
// Removed 2026-08-05. Legal hold had three endpoints across two routers, and
// this was the one every live caller used — which is exactly why it had to
// go rather than win. It wrote the boolean directly:
//
//     prismaClient.document.update({ where: { id }, data: { legalHold } })
//
// No record of who set the hold or when. The two unused endpoints in
// document.routes went through `vaultService.setLegalHold(id, tenantId, hold,
// userId)`, which records legalHoldSetAt/By and legalHoldRemovedAt/By.
//
// Consolidating on caller count would have deleted the audit trail and kept
// the bare boolean. "Who released this hold, and when" is the question asked
// after the fact, and this endpoint could not answer it.
//
// Callers now use PATCH /api/documents/:id/legal-hold, which takes the same
// { legalHold } body.
// ─────────────────────────────────────────────────────────────────


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
//
// The tenant's businesses and where each is formed. Nothing more, because
// nothing more is recorded.
//
// What this returned before: six invented filings — "Apex Ventures LLC, CA,
// SB 1235 Commercial Finance Disclosures, deadline 2026-04-15, Pending",
// with two marked Filed and carrying filing dates. Tenant-scoped and gated
// on COMPLIANCE_READ, and it logged the tenantId and a count, so it read as
// this tenant's regulatory filing position. It was the same six rows for
// everyone.
//
// Two things are missing from this system and neither is invented here:
//
//   1. An obligation register. Which disclosure law binds which business is
//      a legal determination — it turns on where the recipient is located,
//      the product, and the amount — and nothing in this schema encodes it.
//      A state-of-formation lookup is not that determination and is not
//      offered as one.
//   2. A filing record. No table holds a filing, its date, who made it or
//      its confirmation. So no status is reported: not Filed, not Pending,
//      not Overdue. "Pending" would be a claim about an obligation, and
//      "Filed" a claim about an act.
//
// What is returned is what can be shown: the businesses, their state of
// formation, and an explicit statement that the register and the filing
// record do not exist.
// ─────────────────────────────────────────────────────────────────
complianceRouter.get(
  '/compliance/disclosures',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const prismaClient = getPrisma();

      const businesses = await prismaClient.business.findMany({
        where: { tenantId },
        select: { id: true, legalName: true, stateOfFormation: true, status: true },
        orderBy: { legalName: 'asc' },
        take: 500,
      });

      const data = {
        businesses: businesses.map((b) => ({
          businessId: b.id,
          businessName: b.legalName,
          // Null where the record does not say. Absent is not "unknown state
          // therefore no obligation".
          stateOfFormation: b.stateOfFormation,
          status: b.status,
        })),
        /** Deliberately empty. See obligationRegister below. */
        obligations: [] as unknown[],
        obligationRegister: {
          exists: false,
          why:
            'Which disclosure law binds which business is a legal determination — it turns on ' +
            'where the recipient is located, the product and the amount. Nothing in this schema ' +
            'encodes it, and state of formation is not a substitute.',
        },
        filingRecord: {
          exists: false,
          why:
            'No table records a filing, its date, who made it, or a confirmation reference. No ' +
            'status is reported for that reason — a status here would be a claim about an act ' +
            'nothing witnessed.',
        },
      };

      logger.info('Disclosure inventory listed', {
        requestId: req.requestId,
        tenantId,
        businesses: data.businesses.length,
      });

      const body: ApiResponse<typeof data> = { success: true, data };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/compliance/disclosures/:id/file
//
// Answers 501. It used to answer 200 with { status: 'Filed', filedAt: now }
// while writing nothing anywhere — and the page that called it then minted a
// confirmation reference from Math.random() and a link to a PDF that was
// never generated.
//
// Filing a state disclosure is a submission to a regulator. Nothing in this
// system submits anything, and there is nowhere to record that someone did.
// ─────────────────────────────────────────────────────────────────
complianceRouter.post(
  '/compliance/disclosures/:id/file',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  (_req: Request, res: Response): void => {
    const body: ApiResponse = {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message:
          'Nothing here files a disclosure. There is no submission to a regulator and no table ' +
          'to record one in; this endpoint previously answered 200 with a filing date anyway.',
      },
    };
    res.status(501).json(body);
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
      const prismaClient = getPrisma();

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
// The status update lives on /api/complaints, not here.
//
// This file carried its own PATCH for the same table, going straight to
// prisma.complaint with no transition check and no event emission. It could
// move a complaint closed -> open, which VALID_TRANSITIONS forbids, and could
// mark one resolved without emitting complaint.resolved. Two write paths to
// one regulatory register, and the page used the unvalidated one.
// PUT /api/complaints/:id goes through ComplaintService and does both.
//
// The POST below stays. The intake form sends complaintType and channel, which
// are not the canonical category and source enums, and mapping them is a
// separate decision — see docs/backlog/complaint-status-vocabularies.md. What
// it no longer does is write `status: 'Received'`.
// ─────────────────────────────────────────────────────────────────
complianceRouter.post(
  '/compliance/complaints',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const prismaClient = getPrisma();

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
          // No status. The column defaults to 'open', which the state machine,
          // the open-count badge and the resolution events all read. This wrote
          // 'Received', so a complaint logged here entered the register in a
          // state nothing else in the system could see.
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
// POST /api/compliance/run-checks
// Run the compliance checks for every business under the tenant.
//
// This invented its own results: new_issues from Math.random() * 5, resolved
// from Math.random() * 3, total_checked from 25 plus up to 20 more, and a
// status of "completed" over a sweep that never ran. It named six check types
// it had not performed, wrote nothing, and carried COMPLIANCE_WRITE so it
// looked like the real thing.
//
// POST /api/compliance/run-all does the sweep properly through the service
// and persists what it finds. Nothing called this endpoint, but it stays —
// removing a path an unknown client may hold is a different risk from fixing
// what it does — and it now performs the same real sweep, reporting its own
// summary shape from actual rows.
//
// `resolved` is a real count now. A check coming back below the level that
// raised a finding closes it, and that happens in the service — so every path
// that runs a check resolves what it cleared, not only this endpoint.
// ─────────────────────────────────────────────────────────────────
complianceRouter.post(
  '/compliance/run-checks',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const prismaClient = getPrisma();

      const businesses = await prismaClient.business.findMany({
        where: { tenantId },
        select: { id: true },
      });

      const before = await prismaClient.complianceCheck.count({ where: { tenantId } });

      const service = getService();
      const checkTypes = ['udap', 'kyb', 'aml'] as const;
      const ranTypes = new Set<string>();
      let checksRun = 0;
      let resolved = 0;

      for (const biz of businesses) {
        for (const checkType of checkTypes) {
          try {
            const result = await service.runComplianceCheck({ businessId: biz.id, tenantId, checkType });
            ranTypes.add(checkType);
            checksRun++;
            // Real closures, counted as they happen: a check coming back clean
            // closes the findings its predecessors raised.
            resolved += result.resolvedFindings;
          } catch (error) {
            // One business failing a check does not invalidate the sweep, but
            // it must not be counted as one that ran either.
            logger.warn('Compliance check failed for business', {
              businessId: biz.id,
              checkType,
              error: String(error),
            });
          }
        }
      }

      const after = await prismaClient.complianceCheck.count({ where: { tenantId } });

      // Rows written by this sweep that landed at high or critical risk.
      const newIssues = await prismaClient.complianceCheck.count({
        where: {
          tenantId,
          riskLevel: { in: ['high', 'critical'] },
          createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
      });

      const responseData = {
        new_issues: newIssues,
        // Findings this sweep closed — earlier high or critical checks whose
        // re-run came back below the level that raised them. This was null
        // because nothing wrote `resolvedAt`: the column existed, was read in
        // three places, and no code path ever set it.
        resolved,
        total_checked: after - before,
        checks_run: checksRun,
        businesses_checked: businesses.length,
        run_at: new Date().toISOString(),
        // The types actually exercised, not a list of six the sweep never ran.
        check_types: [...ranTypes].sort(),
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
// Score per check type, averaged over the checks that carry one.
// ─────────────────────────────────────────────────────────────────
complianceRouter.get(
  '/compliance/score-breakdown',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const prismaClient = getPrisma();

      // This returned four fixed rows — UDAP 92, State Law 78, Vendor 85, KYB
      // 88 — with reasons like "All marketing materials reviewed" and "No
      // deceptive practices found", for every tenant. A compliance score is a
      // statement about a regulated firm's exposure; inventing one is worse
      // than showing nothing, in both directions. A fabricated pass hides a
      // real failure, and a fabricated failure sends somebody to file
      // something they do not owe.
      const checks = await prismaClient.complianceCheck.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          checkType: true,
          riskLevel: true,
          riskScore: true,
          findings: true,
          resolvedAt: true,
        },
      });

      const byType = new Map<string, typeof checks>();
      for (const check of checks) {
        byType.set(check.checkType, [...(byType.get(check.checkType) ?? []), check]);
      }

      const breakdown = [...byType.entries()].map(([checkType, rows]) => {
        const scored = rows.filter((r) => typeof r.riskScore === 'number');
        const failing = rows.filter(
          (r) => r.riskLevel === 'high' || r.riskLevel === 'critical',
        );

        return {
          checkType,
          // Null rather than 0 where no check of this type carries a score:
          // unscored is not scored badly.
          score: scored.length
            ? Math.round(scored.reduce((sum, r) => sum + (r.riskScore ?? 0), 0) / scored.length)
            : null,
          scoredChecks: scored.length,
          totalChecks: rows.length,
          openFindings: failing.filter((r) => r.resolvedAt === null).length,
          // The findings the checks actually recorded, deduplicated. Not
          // advice, and not written here.
          reasons: [
            ...new Set(
              failing
                .map((r) => (typeof r.findings === 'string' ? r.findings : null))
                .filter((f): f is string => f !== null && f.length > 0),
            ),
          ].slice(0, 5),
        };
      });

      const responseData = {
        breakdown,
        totalChecks: checks.length,
        // Says plainly that an empty breakdown means nothing has run, rather
        // than leaving a reader to infer a clean result from empty tables.
        checksHaveRun: checks.length > 0,
      };

      logger.info('Compliance score breakdown retrieved', {
        requestId: req.requestId,
        tenantId,
        types: breakdown.length,
      });

      const body: ApiResponse<typeof responseData> = { success: true, data: responseData };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/compliance/export-report
// Compliance report, built from the checks on record.
// ─────────────────────────────────────────────────────────────────
complianceRouter.post(
  '/compliance/export-report',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const prismaClient = getPrisma();

      // This produced a fixed report for every tenant: "Overall Compliance
      // Score: 89/100", "Total Checks Run: 42", a critical issue reading
      // "CA SB 1235 disclosure update overdue - Due: 2026-03-31", and a
      // recommendation to "Prioritize CA disclosure update to avoid
      // regulatory penalty". Nothing in the app called it, so it sat here as
      // a regulatory document waiting to be exported and acted on.
      const checks = await prismaClient.complianceCheck.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: { business: { select: { legalName: true } } },
      });

      const lines: string[] = [
        '=== COMPLIANCE REPORT ===',
        `Generated: ${new Date().toISOString()}`,
        '',
      ];

      if (checks.length === 0) {
        // The one honest thing to say when no check has been run. The report
        // used to fill this space with a score of 89 and four findings.
        lines.push(
          '--- Summary ---',
          'No compliance checks are on record for this tenant.',
          '',
          'No score is stated. A score requires checks to have run, and none have.',
        );
      } else {
        const failing = checks.filter(
          (c) => c.riskLevel === 'high' || c.riskLevel === 'critical',
        );
        const critical = checks.filter((c) => c.riskLevel === 'critical');
        const passed = checks.filter(
          (c) => c.riskLevel === 'low' || c.riskLevel === 'medium',
        );

        lines.push(
          '--- Summary ---',
          `Total Checks Run: ${checks.length}`,
          `Passed: ${passed.length}`,
          `Failed: ${checks.length - passed.length}`,
          `Critical: ${critical.length}`,
          '',
        );

        const section = (title: string, rows: typeof checks): void => {
          lines.push(`--- ${title} ---`);
          if (rows.length === 0) {
            lines.push('  none on record');
          } else {
            rows.forEach((c, i) => {
              const finding =
                typeof c.findings === 'string' && c.findings.length > 0
                  ? c.findings
                  : 'no finding recorded';
              lines.push(
                `  ${i + 1}. [${c.checkType.toUpperCase()}] ${
                  c.business?.legalName ?? 'unassigned'
                } — ${finding}` + (c.resolvedAt === null ? '' : ' (resolved)'),
              );
            });
          }
          lines.push('');
        };

        section('Critical', critical);
        section(
          'High',
          failing.filter((c) => c.riskLevel === 'high'),
        );
        // No recommendations section. What a firm ought to do about a finding
        // is advice, and nothing here computes it.
      }

      lines.push('=== END OF REPORT ===');

      const responseData = {
        reportText: lines.join('\n'),
        format: 'text',
        generatedAt: new Date().toISOString(),
        checkCount: checks.length,
      };

      logger.info('Compliance report exported', {
        requestId: req.requestId,
        tenantId,
        checkCount: checks.length,
      });

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
