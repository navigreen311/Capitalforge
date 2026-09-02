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

import { Router, Response, NextFunction } from 'express';
import type { Request } from '../../types/http.js';
import { z } from 'zod';
import { prisma as sharedPrisma } from '../../config/database.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { AppError, badRequest, notFound, forbidden } from '../../middleware/error-handler.js';
import { CommComplianceService, UnknownAdvisorError } from '../../services/comm-compliance.service.js';
import type {
  CommComplianceScanResult,
  ApprovedScriptResult,
  QaScoreInput,
  QaScoreResult,
} from '../../services/comm-compliance.service.js';
import { TrainingService, TRACK_CATALOGUE, withoutEnforcementCases } from '../../services/training.service.js';
import type { CertificationResult, TrackName } from '../../services/training.service.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import logger from '../../config/logger.js';

export const commComplianceRouter = Router();

// ── Lazy-initialised service instances ───────────────────────────
let complianceSvc: CommComplianceService | null = null;
let trainingSvc: TrainingService | null = null;

function getComplianceService(): CommComplianceService {
  if (!complianceSvc) complianceSvc = new CommComplianceService(sharedPrisma);
  return complianceSvc;
}

function getTrainingService(): TrainingService {
  if (!trainingSvc) trainingSvc = new TrainingService(sharedPrisma);
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

// `video_script` is the text a video is generated FROM, scanned before render.
// It is a distinct channel value rather than being folded into `document`
// because the compliance record is read later to answer "what was checked, and
// what was it": a script recorded as a document would misdescribe both the
// artefact that was scanned and the audience it reaches.
//
// Naming it `video_script` rather than `video` is deliberate and is the honest
// name. Nothing here has inspected a video. See AnimaForge's
// marketingComplianceGate for what that scan does and does not cover.
const ScanBodySchema = z.object({
  advisorId: z.string().uuid('advisorId must be a valid UUID'),
  channel:   z.enum(['voice', 'email', 'sms', 'chat', 'document', 'video_script']),
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
      // Typed. `advisorId` was validated as a UUID and nothing else, so a scan
      // could be filed against an id belonging to nobody, or to another
      // tenant's user — and GET /advisors/:id/qa-scores then reports over it
      // faithfully. A 422 naming the advisor is the answer; defaulting to the
      // caller would be a different wrong attribution.
      if (err instanceof UnknownAdvisorError) {
        next(badRequest('advisorId does not name an advisor in this tenant.'));
        return;
      }
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
      const certId = req.params['id']!;

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
      const advisorId = req.params['id']!;

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
      const advisorId = req.params['id']!;

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

// ─────────────────────────────────────────────────────────────────
// GET /api/do-not-call
// The tenant's do-not-contact list.
//
// The table has been written to since SMS opt-out handling was added —
// sms-dispatch upserts a row on every STOP, and the campaign sender checks
// it before consent — but nothing could read it back. A number on this list
// is the record of somebody asking not to be contacted, and it was visible
// only to the code that consults it.
//
// Read-only on purpose. Rows are added by an opt-out, and removing one is
// removing a person's request; that needs its own decision, not a delete
// button reached from a compliance dashboard.
// ─────────────────────────────────────────────────────────────────
commComplianceRouter.get(
  '/do-not-call',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId } = req.tenant!;

      const entries = await sharedPrisma.doNotCallList.findMany({
        where: { tenantId },
        orderBy: { addedAt: 'desc' },
        take: 500,
      });

      // The business behind each number, where one matched at opt-out time.
      // Null businessId is normal: somebody can opt out from a number that
      // belongs to no client on file, and that is still a suppression.
      const businessIds = entries
        .map((e) => e.businessId)
        .filter((id): id is string => id !== null);

      const businesses = businessIds.length === 0
        ? []
        : await sharedPrisma.business.findMany({
            where: { tenantId, id: { in: businessIds } },
            select: { id: true, legalName: true, dba: true },
          });
      const nameOf = new Map(businesses.map((b) => [b.id, b.dba ?? b.legalName]));

      const data = entries.map((e) => ({
        id: e.id,
        phoneNumber: e.phoneNumber,
        businessId: e.businessId,
        businessName: e.businessId === null ? null : (nameOf.get(e.businessId) ?? null),
        source: e.source,
        reason: e.reason,
        addedAt: e.addedAt.toISOString(),
      }));

      const body: ApiResponse<typeof data> = {
        success: true,
        data,
        meta: { total: data.length },
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// GET /api/training/tracks
// The certification catalogue: what each track covers.
//
// The catalogue lived only inside the training service, so a certification
// record could name a track and nothing could say what completing it means.
// The page in front of this had its own copy — five made-up modules with
// their own titles and durations — because there was nothing to read.
//
// Enforcement cases are deliberately not returned.
//
// Each module in the catalogue carries a list of them, and they are not real:
// "FTC v. Pinnacle Business Capital (2021), $5,000,000 civil money penalty,
// FTC-X-2021-0041" names a company that appears elsewhere in this codebase
// as an explicitly stubbed vendor, and the docket-style sourceRef gives it
// the shape of something checkable. This is mandatory compliance training —
// an advisor is meant to learn from it and a certificate says they did — so
// invented precedent must not leave the server at all. The lesson from each
// case does go out: "never use guaranteed approval language" is sound advice
// whatever it is attributed to.
// ─────────────────────────────────────────────────────────────────
commComplianceRouter.get(
  '/training/tracks',
  tenantMiddleware,
  requirePermission(PERMISSIONS.COMPLIANCE_READ),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tracks = Object.values(TRACK_CATALOGUE).map((track) => ({
        // Shared with the certification payload, so there is one place that
        // decides what a track looks like on the way out.
        ...withoutEnforcementCases(track),
        totalMinutes: track.modules.reduce((sum, m) => sum + m.estimatedMinutes, 0),
      }));

      const body: ApiResponse<typeof tracks> = {
        success: true,
        data: tracks,
        meta: { total: tracks.length },
      };

      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);
