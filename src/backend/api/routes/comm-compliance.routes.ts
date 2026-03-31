// ============================================================
// CapitalForge — Communication Compliance & Training Routes
//
// All routes require authentication (tenantMiddleware).
//
// Endpoints:
//   POST /api/comm-compliance/scan
//     Scan advisor text for banned claims and insert disclosures.
//
//   GET  /api/scripts
//     List approved scripts for the tenant (optional ?category= filter).
//
//   POST /api/scripts
//     Create a new approved script or script version.
//
//   GET  /api/training/certifications
//     List certifications for the authenticated user.
//
//   POST /api/training/certifications/:id/complete
//     Mark a certification as completed with a score.
//
//   GET  /api/advisors/:id/qa-scores
//     List QA scores for an advisor.
//
//   POST /api/advisors/:id/qa-scores
//     Record a new QA score for an advisor.
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { AppError, badRequest, notFound, forbidden } from '../../middleware/error-handler.js';
import { CommComplianceService } from '../../services/comm-compliance.service.js';
import type {
  CommComplianceScanResult,
  ApprovedScriptResult,
  QaScoreInput,
  QaScoreResult,
} from '../../services/comm-compliance.service.js';
import { TrainingService } from '../../services/training.service.js';
import type { CertificationResult, TrackName } from '../../services/training.service.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import logger from '../../config/logger.js';

export const commComplianceRouter = Router();

// ── Lazy-initialised service instances ───────────────────────────
let prisma: PrismaClient | null = null;
let complianceSvc: CommComplianceService | null = null;
let trainingSvc: TrainingService | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

function getComplianceService(): CommComplianceService {
  if (!complianceSvc) complianceSvc = new CommComplianceService(getPrisma());
  return complianceSvc;
}

function getTrainingService(): TrainingService {
  if (!trainingSvc) trainingSvc = new TrainingService(getPrisma());
  return trainingSvc;
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

const ScanBodySchema = z.object({
  advisorId: z.string().uuid('advisorId must be a valid UUID'),
  channel:   z.enum(['voice', 'email', 'sms', 'chat', 'document']),
  content:   z.string().min(1, 'content is required').max(100_000, 'content exceeds 100 000 character limit'),
});

const CreateScriptBodySchema = z.object({
  name:        z.string().min(1).max(200),
  category:    z.string().min(1).max(100),
  content:     z.string().min(1).max(100_000),
  version:     z.string().min(1).max(20).default('1.0.0'),
  approvedBy:  z.string().optional(),
  changeNotes: z.string().max(1000).optional(),
});

const CompleteCertificationBodySchema = z.object({
  score: z.number().int().min(0).max(100),
});

const QaScoreBodySchema = z.object({
  callRecordId:       z.string().optional(),
  overallScore:       z.number().int().min(0).max(100),
  complianceScore:    z.number().int().min(0).max(100).optional(),
  scriptAdherence:    z.number().int().min(0).max(100).optional(),
  consentCapture:     z.number().int().min(0).max(100).optional(),
  riskClaimAvoidance: z.number().int().min(0).max(100).optional(),
  feedback:           z.string().max(5000).optional(),
});

// ─────────────────────────────────────────────────────────────────
// POST /api/comm-compliance/scan
// Scan advisor text for banned claims, insert required disclosures,
// and return a full compliance risk assessment.
// ─────────────────────────────────────────────────────────────────
commComplianceRouter.post(
  '/comm-compliance/scan',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = ScanBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const { advisorId, channel, content } = parsed.data;

      const result: CommComplianceScanResult = await getComplianceService().scanCommunication({
        tenantId,
        advisorId,
        channel,
        content,
      });

      logger.info('Comm compliance scan completed', {
        requestId:      req.requestId,
        tenantId,
        advisorId,
        channel,
        riskScore:      result.riskScore,
        riskLevel:      result.riskLevel,
        violationCount: result.violations.length,
      });

      const body: ApiResponse<CommComplianceScanResult> = {
        success: true,
        data:    result,
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/scripts
// List approved scripts for the tenant.
// Optional query param: ?category=<string>
// ─────────────────────────────────────────────────────────────────
commComplianceRouter.get(
  '/scripts',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const category = typeof req.query['category'] === 'string' ? req.query['category'] : undefined;

      const scripts: ApprovedScriptResult[] = await getComplianceService().listScripts(tenantId, category);

      logger.info('Approved scripts listed', {
        requestId: req.requestId,
        tenantId,
        category,
        count: scripts.length,
      });

      const body: ApiResponse<ApprovedScriptResult[]> = {
        success: true,
        data:    scripts,
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/scripts
// Create a new approved script or version.
// ─────────────────────────────────────────────────────────────────
commComplianceRouter.post(
  '/scripts',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const parsed = CreateScriptBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const script: ApprovedScriptResult = await getComplianceService().createScript({
        tenantId,
        ...parsed.data,
      });

      logger.info('Approved script created', {
        requestId: req.requestId,
        tenantId,
        scriptId:  script.id,
        name:      script.name,
        category:  script.category,
        version:   script.currentVersion.version,
      });

      const body: ApiResponse<ApprovedScriptResult> = {
        success: true,
        data:    script,
      };

      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/training/certifications
// List certifications for the authenticated user (or a specific
// userId passed as query param for admins).
// ─────────────────────────────────────────────────────────────────
commComplianceRouter.get(
  '/training/certifications',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId, userId, role, permissions } = req.tenant!;

      // Admins may pass ?userId= to view another user's certifications
      let targetUserId = userId;
      if (req.query['userId'] && typeof req.query['userId'] === 'string') {
        const isAdmin = permissions.includes(PERMISSIONS.ADMIN_USERS) || role === 'tenant_admin' || role === 'super_admin';
        if (!isAdmin) {
          throw forbidden('Only administrators may view certifications for other users.');
        }
        targetUserId = req.query['userId'] as string;
      }

      const certifications: CertificationResult[] = await getTrainingService().listCertifications(
        tenantId,
        targetUserId,
      );

      logger.info('Training certifications listed', {
        requestId:    req.requestId,
        tenantId,
        userId:       targetUserId,
        count:        certifications.length,
      });

      const body: ApiResponse<CertificationResult[]> = {
        success: true,
        data:    certifications,
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/training/certifications/:id/complete
// Mark a certification as completed with a final score.
// ─────────────────────────────────────────────────────────────────
commComplianceRouter.post(
  '/training/certifications/:id/complete',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const certId = req.params['id'];

      if (!certId) {
        throw badRequest('Certification ID is required.');
      }

      const parsed = CompleteCertificationBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      let result: CertificationResult;
      try {
        result = await getTrainingService().completeCertification(certId, tenantId, parsed.data.score);
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          throw notFound(`Certification ${certId}`);
        }
        throw err;
      }

      logger.info('Training certification completed', {
        requestId: req.requestId,
        tenantId,
        certId,
        trackName: result.trackName,
        score:     result.score,
        status:    result.status,
      });

      const body: ApiResponse<CertificationResult> = {
        success: true,
        data:    result,
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/advisors/:id/qa-scores
// List QA scores for an advisor.
// Optional query: ?limit=<n>
// ─────────────────────────────────────────────────────────────────
commComplianceRouter.get(
  '/advisors/:id/qa-scores',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const advisorId = req.params['id'];

      if (!advisorId) {
        throw badRequest('advisorId is required.');
      }

      const rawLimit = req.query['limit'];
      const limit = rawLimit && !isNaN(Number(rawLimit)) ? Math.min(100, Math.max(1, Number(rawLimit))) : 20;

      const scores: QaScoreResult[] = await getComplianceService().listQaScores(advisorId, tenantId, limit);

      logger.info('Advisor QA scores listed', {
        requestId: req.requestId,
        tenantId,
        advisorId,
        count:     scores.length,
      });

      const body: ApiResponse<QaScoreResult[]> = {
        success: true,
        data:    scores,
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// POST /api/advisors/:id/qa-scores
// Record a new QA score for an advisor call review.
// ─────────────────────────────────────────────────────────────────
commComplianceRouter.post(
  '/advisors/:id/qa-scores',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;
      const advisorId = req.params['id'];

      if (!advisorId) {
        throw badRequest('advisorId is required.');
      }

      const parsed = QaScoreBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw badRequest('Invalid request body.', parsed.error.flatten());
      }

      const input: QaScoreInput = {
        tenantId,
        advisorId,
        ...parsed.data,
      };

      const score: QaScoreResult = await getComplianceService().recordQaScore(input);

      logger.info('Advisor QA score recorded', {
        requestId:    req.requestId,
        tenantId,
        advisorId,
        scoreId:      score.id,
        overallScore: score.overallScore,
      });

      const body: ApiResponse<QaScoreResult> = {
        success: true,
        data:    score,
      };

      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);
