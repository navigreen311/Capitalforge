// ============================================================
// CapitalForge — VoiceForge API Routes
//
// Telephony, outreach campaign, and call compliance endpoints.
// All routes are tenant-scoped via tenantMiddleware per-route.
//
// Endpoints:
//   POST /api/voiceforge/calls                        — initiate outbound call
//   GET  /api/voiceforge/calls                        — list call records
//   GET  /api/voiceforge/calls/:id                    — get single call record
//   POST /api/voiceforge/calls/:id/end                — end an in-progress call
//   POST /api/voiceforge/outreach/apr-expiry          — trigger APR expiry campaign
//   POST /api/voiceforge/outreach/restack             — trigger re-stack campaign
//   POST /api/voiceforge/compliance/scan-transcript   — scan transcript for violations
//   GET  /api/voiceforge/compliance/qa/:advisorId     — get advisor QA summary
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { AppError, badRequest, notFound } from '../../middleware/error-handler.js';
import { VoiceForgeService } from '../../services/voiceforge.service.js';
import type {
  CallRecord,
  OutreachCampaignResult,
  ListCallsFilter,
} from '../../services/voiceforge.service.js';
import { VoiceForgeComplianceService } from '../../services/voiceforge-compliance.js';
import type {
  CallComplianceScanResult,
  AdvisorQaSummary,
} from '../../services/voiceforge-compliance.js';
import { TcpaConsentError } from '../../services/consent-gate.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import logger from '../../config/logger.js';

export const voiceForgeRouter = Router();

// ── Lazy-initialised service instances ───────────────────────────

let _prisma: PrismaClient | null = null;
let _voiceForgeSvc: VoiceForgeService | null = null;
let _complianceSvc: VoiceForgeComplianceService | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

function getVoiceForgeService(): VoiceForgeService {
  if (!_voiceForgeSvc) _voiceForgeSvc = new VoiceForgeService(getPrisma());
  return _voiceForgeSvc;
}

function getComplianceService(): VoiceForgeComplianceService {
  if (!_complianceSvc) _complianceSvc = new VoiceForgeComplianceService(getPrisma());
  return _complianceSvc;
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
      next(new AppError(403, 'FORBIDDEN', `Permission "${permission}" is required.`));
      return;
    }
    next();
  };
}

// ── Validation schemas ────────────────────────────────────────────

const InitiateCallBodySchema = z.object({
  businessId:      z.string().uuid('businessId must be a valid UUID'),
  toPhoneNumber:   z.string().min(7).max(20),
  fromPhoneNumber: z.string().min(7).max(20),
  advisorId:       z.string().uuid().optional(),
  purpose:         z.string().min(1).max(500),
  campaignType:    z.enum(['apr_expiry', 'repayment_reminder', 'restack_consultation']).optional(),
  campaignId:      z.string().uuid().optional(),
});

const OutreachCampaignBodySchema = z.object({
  fromPhoneNumber: z.string().min(7).max(20),
  advisorId:       z.string().uuid().optional(),
});

const ScanTranscriptBodySchema = z.object({
  callId:         z.string().uuid('callId must be a valid UUID'),
  advisorId:      z.string().uuid('advisorId must be a valid UUID'),
  businessId:     z.string().uuid('businessId must be a valid UUID'),
  transcriptText: z.string().min(1).max(500_000),
  isLive:         z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────────
// POST /api/voiceforge/calls
// Initiate an outbound call with TCPA consent gate enforcement.
// ─────────────────────────────────────────────────────────────────
voiceForgeRouter.post(
  '/voiceforge/calls',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = InitiateCallBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const call: CallRecord = await getVoiceForgeService().initiateCall({
        tenantId,
        ...parsed.data,
      });

      logger.info('VoiceForge call initiated', {
        requestId: req.requestId,
        tenantId,
        callId:       call.id,
        businessId:   call.businessId,
        campaignType: call.campaignType,
      });

      const body: ApiResponse<CallRecord> = { success: true, data: call };
      res.status(201).json(body);
    } catch (err) {
      if (err instanceof TcpaConsentError) {
        res.status(403).json({
          success: false,
          error: {
            code:    'TCPA_CONSENT_BLOCKED',
            message: err.message,
            reason:  err.reason,
          },
        } satisfies ApiResponse<never>);
        return;
      }
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/voiceforge/calls
// List call records for the tenant.
// Optional query params: businessId, advisorId, campaignType,
//   status, since, page, pageSize
// ─────────────────────────────────────────────────────────────────
voiceForgeRouter.get(
  '/voiceforge/calls',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const q = req.query as Record<string, string | undefined>;

      const filter: ListCallsFilter = {
        tenantId,
        businessId:   q['businessId'],
        advisorId:    q['advisorId'],
        campaignType: q['campaignType'] as ListCallsFilter['campaignType'],
        status:       q['status'] as ListCallsFilter['status'],
        since:        q['since'],
        page:         q['page']     ? parseInt(q['page'], 10)     : undefined,
        pageSize:     q['pageSize'] ? parseInt(q['pageSize'], 10) : undefined,
      };

      const result = await getVoiceForgeService().listCallRecords(filter);

      logger.info('VoiceForge calls listed', {
        requestId: req.requestId,
        tenantId,
        total:     result.total,
        page:      result.page,
      });

      const body: ApiResponse<typeof result> = {
        success: true,
        data:    result,
        meta: {
          page:     result.page,
          pageSize: result.pageSize,
          total:    result.total,
        },
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/voiceforge/calls/:id
// Retrieve a single call record by ID (tenant-scoped).
// ─────────────────────────────────────────────────────────────────
voiceForgeRouter.get(
  '/voiceforge/calls/:id',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const callId = req.params['id'];

      if (!callId) {
        throw badRequest('Call ID is required.');
      }

      const call: CallRecord = await getVoiceForgeService().getCallRecord(callId, tenantId);

      logger.info('VoiceForge call retrieved', {
        requestId: req.requestId,
        tenantId,
        callId,
      });

      const body: ApiResponse<CallRecord> = { success: true, data: call };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/voiceforge/calls/:id/end
// End an in-progress call and persist duration.
// ─────────────────────────────────────────────────────────────────
voiceForgeRouter.post(
  '/voiceforge/calls/:id/end',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const callId = req.params['id'];

      if (!callId) {
        throw badRequest('Call ID is required.');
      }

      const call: CallRecord = await getVoiceForgeService().endCall(callId, tenantId);

      logger.info('VoiceForge call ended', {
        requestId:       req.requestId,
        tenantId,
        callId,
        durationSeconds: call.durationSeconds,
      });

      const body: ApiResponse<CallRecord> = { success: true, data: call };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/voiceforge/outreach/apr-expiry
// Trigger the APR expiry outreach campaign for the tenant.
// Body: { fromPhoneNumber, advisorId? }
// ─────────────────────────────────────────────────────────────────
voiceForgeRouter.post(
  '/voiceforge/outreach/apr-expiry',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = OutreachCampaignBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const result: OutreachCampaignResult = await getVoiceForgeService().triggerAprExpiryOutreach(
        tenantId,
        parsed.data.fromPhoneNumber,
        parsed.data.advisorId,
      );

      logger.info('VoiceForge APR expiry outreach triggered', {
        requestId:      req.requestId,
        tenantId,
        campaignId:     result.campaignId,
        callsInitiated: result.callsInitiated,
        consentBlocked: result.consentBlocked,
      });

      const body: ApiResponse<OutreachCampaignResult> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/voiceforge/outreach/restack
// Trigger the re-stack consultation scheduling campaign.
// Body: { fromPhoneNumber, advisorId? }
// ─────────────────────────────────────────────────────────────────
voiceForgeRouter.post(
  '/voiceforge/outreach/restack',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = OutreachCampaignBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const result: OutreachCampaignResult =
        await getVoiceForgeService().triggerRestackConsultationOutreach(
          tenantId,
          parsed.data.fromPhoneNumber,
          parsed.data.advisorId,
        );

      logger.info('VoiceForge re-stack outreach triggered', {
        requestId:      req.requestId,
        tenantId,
        campaignId:     result.campaignId,
        callsInitiated: result.callsInitiated,
        consentBlocked: result.consentBlocked,
      });

      const body: ApiResponse<OutreachCampaignResult> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/voiceforge/compliance/scan-transcript
// Scan a call transcript for compliance violations.
// Body: { callId, advisorId, businessId, transcriptText, isLive? }
// ─────────────────────────────────────────────────────────────────
voiceForgeRouter.post(
  '/voiceforge/compliance/scan-transcript',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = ScanTranscriptBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const result: CallComplianceScanResult = await getComplianceService().scanTranscript({
        tenantId,
        ...parsed.data,
      });

      logger.info('VoiceForge transcript scanned', {
        requestId:       req.requestId,
        tenantId,
        scanId:          result.scanId,
        callId:          result.callId,
        riskScore:       result.riskScore,
        riskLevel:       result.riskLevel,
        violationCount:  result.violationCount,
        complianceStatus: result.complianceStatus,
      });

      const body: ApiResponse<CallComplianceScanResult> = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/voiceforge/compliance/qa/:advisorId
// Get QA score summary for an advisor.
// Optional query param: ?limit=<n>
// ─────────────────────────────────────────────────────────────────
voiceForgeRouter.get(
  '/voiceforge/compliance/qa/:advisorId',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const advisorId = req.params['advisorId'];

      if (!advisorId) {
        throw badRequest('advisorId is required.');
      }

      const rawLimit = req.query['limit'];
      const limit =
        rawLimit && !isNaN(Number(rawLimit))
          ? Math.min(100, Math.max(1, Number(rawLimit)))
          : 20;

      const summary: AdvisorQaSummary = await getComplianceService().getAdvisorQaSummary(
        advisorId,
        tenantId,
        limit,
      );

      logger.info('VoiceForge advisor QA summary retrieved', {
        requestId:         req.requestId,
        tenantId,
        advisorId,
        totalCallsScored:  summary.totalCallsScored,
      });

      const body: ApiResponse<AdvisorQaSummary> = { success: true, data: summary };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);
