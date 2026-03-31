// ============================================================
// CapitalForge — Partner & Referral Routes
//
// All routes require authentication (tenantMiddleware).
//
// Partner Governance:
//   POST   /api/partners                          — onboard partner
//   GET    /api/partners                          — list partners
//   PUT    /api/partners/:id                      — update partner
//   GET    /api/partners/:id/scorecard            — get vendor scorecard
//   POST   /api/partners/:id/review               — submit review decision
//   POST   /api/partners/:id/renewal              — initiate annual renewal
//   POST   /api/partners/:id/renewal/complete     — complete annual renewal
//   POST   /api/partners/:id/subprocessors        — register subprocessor
//   GET    /api/partners/:id/subprocessors        — list subprocessors
//
// Referral Attribution:
//   POST   /api/businesses/:id/referrals          — create attribution
//   GET    /api/businesses/:id/referrals          — list attributions
//   POST   /api/referrals/:id/fee-status          — update fee status
//   POST   /api/referrals/agreement               — generate referral agreement
//   POST   /api/referrals/consent                 — capture data-sharing consent
//   DELETE /api/referrals/consent/:consentId      — revoke consent
//   GET    /api/referrals/analytics               — tenant-level analytics
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { AppError, badRequest, notFound, forbidden } from '../../middleware/error-handler.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import logger from '../../config/logger.js';

import {
  PartnerGovernanceService,
  blankChecklist,
} from '../../services/partner-governance.service.js';
import type {
  PartnerType,
  PartnerStatus,
  DueDiligenceChecklist,
} from '../../services/partner-governance.service.js';

import { ReferralService } from '../../services/referral.service.js';
import type {
  ReferralSourceType,
  ReferralFeeStatus,
  FeeStructure,
} from '../../services/referral.service.js';

// ── Lazy service instances ────────────────────────────────────────

let prisma: PrismaClient | null = null;
let partnerSvc: PartnerGovernanceService | null = null;
let referralSvc: ReferralService | null = null;

function getPartnerService(): PartnerGovernanceService {
  if (!partnerSvc) {
    prisma = prisma ?? new PrismaClient();
    partnerSvc = new PartnerGovernanceService(prisma);
  }
  return partnerSvc;
}

function getReferralService(): ReferralService {
  if (!referralSvc) {
    prisma = prisma ?? new PrismaClient();
    referralSvc = new ReferralService(prisma);
  }
  return referralSvc;
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

const PARTNER_TYPES = ['referral', 'broker', 'processor', 'attorney', 'accountant'] as const;
const PARTNER_STATUSES = ['pending', 'under_review', 'active', 'rejected', 'suspended', 'terminated'] as const;
const REFERRAL_SOURCE_TYPES = ['advisor', 'partner', 'client', 'organic', 'paid_search', 'social', 'event', 'webinar', 'direct'] as const;
const FEE_STATUSES = ['pending', 'approved', 'paid', 'declined', 'clawback'] as const;

const ChecklistSchema = z.object({
  entityVerified:               z.boolean().optional(),
  backgroundCheckCompleted:     z.boolean().optional(),
  insuranceVerified:            z.boolean().optional(),
  agreementSigned:              z.boolean().optional(),
  dpaExecuted:                  z.boolean().optional(),
  licenseVerified:              z.boolean().optional(),
  sanctionsScreened:            z.boolean().optional(),
  referencesChecked:            z.boolean().optional(),
  conflictsReviewed:            z.boolean().optional(),
  securityAssessmentCompleted:  z.boolean().optional(),
  complaintHistoryReviewed:     z.boolean().optional(),
  compensationApproved:         z.boolean().optional(),
});

const OnboardPartnerSchema = z.object({
  name:               z.string().min(1).max(200),
  type:               z.enum(PARTNER_TYPES),
  contactEmail:       z.string().email(),
  contactName:        z.string().max(100).optional(),
  licenseNumber:      z.string().max(50).optional(),
  stateOfOperation:   z.string().length(2).optional(),
  checklist:          ChecklistSchema.optional(),
  metadata:           z.record(z.unknown()).optional(),
});

const UpdatePartnerSchema = z.object({
  name:     z.string().min(1).max(200).optional(),
  status:   z.enum(PARTNER_STATUSES).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ReviewPartnerSchema = z.object({
  reviewedBy:       z.string().min(1),
  decision:         z.enum(['approve', 'reject', 'suspend', 'request_info']),
  notes:            z.string().max(5000).optional(),
  checklistUpdates: ChecklistSchema.optional(),
  newStatus:        z.enum(PARTNER_STATUSES).optional(),
});

const CompleteRenewalSchema = z.object({
  reviewedBy: z.string().min(1),
  approved:   z.boolean(),
});

const SubprocessorSchema = z.object({
  processorName:    z.string().min(1).max(200),
  serviceDescription: z.string().max(1000),
  dataCategories:   z.array(z.string()).min(1),
  dpaDocumentId:    z.string().nullable().optional(),
  dpaExecutedAt:    z.string().datetime().nullable().optional(),
  dpaExpiresAt:     z.string().datetime().nullable().optional(),
  isActive:         z.boolean().default(true),
});

const FlatFeeSchema = z.object({ type: z.literal('flat'), amountCents: z.number().int().nonnegative() });
const PctFeeSchema  = z.object({ type: z.literal('percentage'), percentage: z.number().positive().max(100), basis: z.enum(['program_fee', 'funded_amount', 'first_year_revenue']) });
const TieredFeeSchema = z.object({
  type: z.literal('tiered'),
  tiers: z.array(z.object({
    minReferrals: z.number().int().nonnegative(),
    maxReferrals: z.number().int().positive().nullable(),
    amountCents:  z.number().int().nonnegative(),
  })).min(1),
});
const FeeStructureSchema = z.discriminatedUnion('type', [FlatFeeSchema, PctFeeSchema, TieredFeeSchema]);

const CreateAttributionSchema = z.object({
  sourceType:              z.enum(REFERRAL_SOURCE_TYPES),
  sourceId:                z.string().optional(),
  partnerId:               z.string().uuid().optional(),
  channel:                 z.string().max(100).optional(),
  feeStructure:            FeeStructureSchema.optional(),
  programFeeDollars:       z.number().nonnegative().optional(),
  fundedAmountDollars:     z.number().nonnegative().optional(),
  referralCountThisPeriod: z.number().int().positive().optional(),
  consentDocId:            z.string().optional(),
});

const UpdateFeeStatusSchema = z.object({
  status: z.enum(FEE_STATUSES),
});

const GenerateAgreementSchema = z.object({
  partnerId:        z.string().uuid().optional(),
  partnerName:      z.string().min(1).max(200),
  sourceType:       z.enum(REFERRAL_SOURCE_TYPES),
  feeStructure:     FeeStructureSchema,
  stateOfOperation: z.string().length(2).optional(),
});

const CaptureConsentSchema = z.object({
  businessId:     z.string().uuid(),
  partnerId:      z.string().uuid(),
  dataCategories: z.array(z.string()).min(1),
  evidenceRef:    z.string().min(1),
  ipAddress:      z.string().optional(),
  metadata:       z.record(z.unknown()).optional(),
});

const RevokeConsentSchema = z.object({
  reason: z.string().min(1).max(500),
});

const AnalyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to:   z.string().datetime().optional(),
});

// ── Router ────────────────────────────────────────────────────────

export const partnersRouter = Router();

// ─────────────────────────────────────────────────────────────────
// POST /api/partners — onboard a new partner
// ─────────────────────────────────────────────────────────────────
partnersRouter.post(
  '/partners',
  tenantMiddleware,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const parsed = OnboardPartnerSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid request body.', parsed.error.flatten());

      const result = await getPartnerService().onboardPartner({
        tenantId,
        ...parsed.data,
      });

      logger.info('Partner onboarded via API', {
        requestId: req.requestId,
        tenantId,
        partnerId: result.partnerId,
        type: result.type,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/partners — list partners
// ─────────────────────────────────────────────────────────────────
partnersRouter.get(
  '/partners',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const type   = req.query.type   as PartnerType   | undefined;
      const status = req.query.status as PartnerStatus | undefined;

      const partners = await getPartnerService().listPartners(tenantId, { type, status });

      const body: ApiResponse<typeof partners> = { success: true, data: partners };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// PUT /api/partners/:id — update partner
// ─────────────────────────────────────────────────────────────────
partnersRouter.put(
  '/partners/:id',
  tenantMiddleware,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id: partnerId } = req.params;

      const parsed = UpdatePartnerSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid request body.', parsed.error.flatten());

      const updated = await getPartnerService().updatePartner(partnerId, tenantId, parsed.data);
      if (!updated) throw notFound(`Partner ${partnerId}`);

      const body: ApiResponse<typeof updated> = { success: true, data: updated };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/partners/:id/scorecard — compute vendor scorecard
// ─────────────────────────────────────────────────────────────────
partnersRouter.get(
  '/partners/:id/scorecard',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id: partnerId } = req.params;

      const scorecard = await getPartnerService().getScorecard(partnerId, tenantId);
      if (!scorecard) throw notFound(`Partner ${partnerId}`);

      logger.info('Scorecard retrieved', { requestId: req.requestId, tenantId, partnerId, score: scorecard.totalScore });

      const body: ApiResponse<typeof scorecard> = { success: true, data: scorecard };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/partners/:id/review — submit review decision
// ─────────────────────────────────────────────────────────────────
partnersRouter.post(
  '/partners/:id/review',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id: partnerId } = req.params;

      const parsed = ReviewPartnerSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid request body.', parsed.error.flatten());

      const result = await getPartnerService().reviewPartner({
        tenantId,
        partnerId,
        ...parsed.data,
      });

      logger.info('Partner review submitted', {
        requestId: req.requestId,
        tenantId,
        partnerId,
        decision: parsed.data.decision,
        newStatus: result.newStatus,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/partners/:id/renewal — initiate annual renewal
// ─────────────────────────────────────────────────────────────────
partnersRouter.post(
  '/partners/:id/renewal',
  tenantMiddleware,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id: partnerId } = req.params;

      const workflow = await getPartnerService().initiateRenewal(partnerId, tenantId);

      const body: ApiResponse<typeof workflow> = { success: true, data: workflow };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/partners/:id/renewal/complete — complete annual renewal
// ─────────────────────────────────────────────────────────────────
partnersRouter.post(
  '/partners/:id/renewal/complete',
  tenantMiddleware,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id: partnerId } = req.params;

      const parsed = CompleteRenewalSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid request body.', parsed.error.flatten());

      const result = await getPartnerService().completeRenewal(
        partnerId,
        tenantId,
        parsed.data.reviewedBy,
        parsed.data.approved,
      );
      if (!result) throw notFound(`Active renewal for partner ${partnerId}`);

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/partners/:id/subprocessors — register subprocessor
// ─────────────────────────────────────────────────────────────────
partnersRouter.post(
  '/partners/:id/subprocessors',
  tenantMiddleware,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id: partnerId } = req.params;

      const parsed = SubprocessorSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid request body.', parsed.error.flatten());

      const record = await getPartnerService().registerSubprocessor(
        partnerId,
        tenantId,
        {
          ...parsed.data,
          dpaDocumentId: parsed.data.dpaDocumentId ?? null,
          dpaExecutedAt: parsed.data.dpaExecutedAt ? new Date(parsed.data.dpaExecutedAt) : null,
          dpaExpiresAt:  parsed.data.dpaExpiresAt  ? new Date(parsed.data.dpaExpiresAt)  : null,
        },
      );

      const body: ApiResponse<typeof record> = { success: true, data: record };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/partners/:id/subprocessors — list subprocessors
// ─────────────────────────────────────────────────────────────────
partnersRouter.get(
  '/partners/:id/subprocessors',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id: partnerId } = req.params;

      const records = await getPartnerService().listSubprocessors(partnerId, tenantId);

      const body: ApiResponse<typeof records> = { success: true, data: records };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/businesses/:id/referrals — create referral attribution
// ─────────────────────────────────────────────────────────────────
partnersRouter.post(
  '/businesses/:id/referrals',
  tenantMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id: businessId } = req.params;

      const parsed = CreateAttributionSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid request body.', parsed.error.flatten());

      const result = await getReferralService().createAttribution({
        tenantId,
        businessId,
        ...parsed.data,
      });

      logger.info('Referral attribution created via API', {
        requestId:     req.requestId,
        tenantId,
        businessId,
        attributionId: result.attributionId,
        sourceType:    result.sourceType,
      });

      const body: ApiResponse<typeof result> = { success: true, data: result };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/businesses/:id/referrals — list attributions for business
// ─────────────────────────────────────────────────────────────────
partnersRouter.get(
  '/businesses/:id/referrals',
  tenantMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id: businessId } = req.params;

      const attributions = await getReferralService().listAttributions(businessId, tenantId);

      const body: ApiResponse<typeof attributions> = { success: true, data: attributions };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/referrals/:id/fee-status — update referral fee status
// ─────────────────────────────────────────────────────────────────
partnersRouter.post(
  '/referrals/:id/fee-status',
  tenantMiddleware,
  requirePermission(PERMISSIONS.ADMIN_TENANT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { id: attributionId } = req.params;

      const parsed = UpdateFeeStatusSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid request body.', parsed.error.flatten());

      const updated = await getReferralService().updateFeeStatus(
        attributionId,
        tenantId,
        parsed.data.status as ReferralFeeStatus,
      );
      if (!updated) throw notFound(`Referral attribution ${attributionId}`);

      const body: ApiResponse<{ attributionId: string; status: string }> = {
        success: true,
        data: { attributionId, status: parsed.data.status },
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/referrals/agreement — generate referral agreement
// ─────────────────────────────────────────────────────────────────
partnersRouter.post(
  '/referrals/agreement',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const parsed = GenerateAgreementSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid request body.', parsed.error.flatten());

      const agreement = getReferralService().generateAgreement({
        tenantId,
        ...parsed.data,
      });

      logger.info('Referral agreement generated', {
        requestId:   req.requestId,
        tenantId,
        agreementId: agreement.agreementId,
        sourceType:  agreement.sourceType,
      });

      const body: ApiResponse<typeof agreement> = { success: true, data: agreement };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/referrals/consent — capture data-sharing consent
// ─────────────────────────────────────────────────────────────────
partnersRouter.post(
  '/referrals/consent',
  tenantMiddleware,
  requirePermission(PERMISSIONS.CONSENT_MANAGE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const parsed = CaptureConsentSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid request body.', parsed.error.flatten());

      const record = await getReferralService().captureConsent({ tenantId, ...parsed.data });

      const body: ApiResponse<typeof record> = { success: true, data: record };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// DELETE /api/referrals/consent/:consentId — revoke consent
// ─────────────────────────────────────────────────────────────────
partnersRouter.delete(
  '/referrals/consent/:consentId',
  tenantMiddleware,
  requirePermission(PERMISSIONS.CONSENT_MANAGE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const { consentId } = req.params;

      const parsed = RevokeConsentSchema.safeParse(req.body);
      if (!parsed.success) throw badRequest('Invalid request body.', parsed.error.flatten());

      const revoked = await getReferralService().revokeConsent(consentId, tenantId, parsed.data.reason);
      if (!revoked) throw notFound(`Consent record ${consentId}`);

      const body: ApiResponse<{ consentId: string; status: string }> = {
        success: true,
        data: { consentId, status: 'revoked' },
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/referrals/analytics — tenant-level referral analytics
// ─────────────────────────────────────────────────────────────────
partnersRouter.get(
  '/referrals/analytics',
  tenantMiddleware,
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const qParsed = AnalyticsQuerySchema.safeParse(req.query);
      if (!qParsed.success) throw badRequest('Invalid query parameters.', qParsed.error.flatten());

      const to   = qParsed.data.to   ? new Date(qParsed.data.to)   : new Date();
      const from = qParsed.data.from
        ? new Date(qParsed.data.from)
        : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000); // default 90 days

      const analytics = await getReferralService().getAnalytics(tenantId, from, to);

      const body: ApiResponse<typeof analytics> = { success: true, data: analytics };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);
