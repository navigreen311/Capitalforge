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
