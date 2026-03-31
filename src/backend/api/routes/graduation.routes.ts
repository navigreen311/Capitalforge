// ============================================================
// CapitalForge — Graduation & Credit Builder Routes
//
// Endpoints:
//   GET  /api/businesses/:id/graduation/status
//     Retrieve the current graduation track status (auto-assessed).
//
//   POST /api/businesses/:id/graduation/assess
//     Run a fresh graduation assessment from submitted profile data.
//
//   GET  /api/businesses/:id/credit-builder/roadmap
//     Return the full credit builder roadmap (DUNS, vendors, milestones).
//
//   POST /api/businesses/:id/credit-builder/milestones
//     Evaluate SBSS milestone progress for a submitted score.
//
// All routes require a valid JWT. req.tenant is set by auth middleware.
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import {
  assessGraduation,
  getGraduationStatus,
  GRADUATION_TRACKS,
  TRACK_METADATA,
  type GraduationInput,
} from '../../services/client-graduation.service.js';
import {
  buildCreditRoadmapForBusiness,
  evaluateMilestoneProgress,
  evaluateStackingUnlock,
  buildCreditRoadmap,
} from '../../services/credit-builder.service.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────

export const graduationRouter = Router({ mergeParams: true });

// ── Validation Schemas ────────────────────────────────────────

const GraduationAssessSchema = z.object({
  ficoScore:            z.number().int().min(300).max(850),
  businessAgeMonths:    z.number().int().nonnegative(),
  monthlyRevenue:       z.number().nonnegative(),
  businessCreditScore:  z.number().int().min(0).max(300).default(0),
  tradelineCount:       z.number().int().nonnegative().default(0),
  currentUtilization:   z.number().min(0).max(2).default(0),
});

const MilestoneQuerySchema = z.object({
  sbssScore: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(0).max(300)),
  industry:  z.string().optional().default('general'),
});

const MilestoneBodySchema = z.object({
  sbssScore:           z.number().int().min(0).max(300),
  industry:            z.string().optional().default('general'),
  ficoScore:           z.number().int().min(300).max(850).optional().default(680),
  businessAgeMonths:   z.number().int().nonnegative().optional().default(0),
  monthlyRevenue:      z.number().nonnegative().optional().default(0),
  tradelineCount:      z.number().int().nonnegative().optional().default(0),
  currentUtilization:  z.number().min(0).max(2).optional().default(0),
});

// ── Helpers ───────────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    const body: ApiResponse = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    };
    res.status(401).json(body);
    return;
  }
  next();
}

function handleZodError(err: ZodError, res: Response): void {
  res.status(422).json({
    success: false,
    error: {
      code:    'VALIDATION_ERROR',
      message: 'Invalid request body.',
      details: err.flatten().fieldErrors,
    },
  } satisfies ApiResponse);
}

function handleUnexpectedError(err: unknown, res: Response, context: string): void {
  logger.error(`[GraduationRoutes] Unexpected error in ${context}`, { err });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  } satisfies ApiResponse);
}

function handleNotFound(res: Response, message: string): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message },
  } satisfies ApiResponse);
}

// ── GET /api/businesses/:id/graduation/status ─────────────────

graduationRouter.get(
  '/graduation/status',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenant     = req.tenant!;

    try {
      const assessment = await getGraduationStatus(businessId, tenant.tenantId);

      const currentMeta = TRACK_METADATA[assessment.currentTrack];
      const nextMeta    = assessment.nextTrack ? TRACK_METADATA[assessment.nextTrack] : null;

      res.status(200).json({
        success: true,
        data: {
          businessId:               assessment.businessId,
          currentTrack:             assessment.currentTrack,
          currentTrackLabel:        currentMeta.label,
          currentTrackDescription:  currentMeta.description,
          currentTrackCreditRange:  currentMeta.targetCreditRange,
          nextTrack:                assessment.nextTrack,
          nextTrackLabel:           nextMeta?.label ?? null,
          nextTrackEligible:        assessment.nextTrackEligible,
          milestoneGates:           assessment.milestoneGates,
          estimatedMonthsToNextTrack: assessment.estimatedMonthsToNextTrack,
          actionRoadmap:            assessment.actionRoadmap,
          assessedAt:               assessment.assessedAt,
          trackProgression:         Object.values(GRADUATION_TRACKS).map((t) => ({
            track:  t,
            label:  TRACK_METADATA[t].label,
            range:  TRACK_METADATA[t].targetCreditRange,
            active: t === assessment.currentTrack,
          })),
        },
      } satisfies ApiResponse);
    } catch (err) {
      const isNotFound = err instanceof Error && err.message.includes('not found');
      if (isNotFound) {
        handleNotFound(res, `Business ${businessId} not found.`);
        return;
      }
      handleUnexpectedError(err, res, 'GET /graduation/status');
    }
  },
);

// ── POST /api/businesses/:id/graduation/assess ────────────────

graduationRouter.post(
  '/graduation/assess',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];

    const parsed = GraduationAssessSchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    const input: GraduationInput = parsed.data;

    try {
      const assessment = assessGraduation(businessId, input);

      const currentMeta = TRACK_METADATA[assessment.currentTrack];
      const nextMeta    = assessment.nextTrack ? TRACK_METADATA[assessment.nextTrack] : null;

      res.status(200).json({
        success: true,
        data: {
          businessId:               assessment.businessId,
          currentTrack:             assessment.currentTrack,
          currentTrackLabel:        currentMeta.label,
          currentTrackDescription:  currentMeta.description,
          nextTrack:                assessment.nextTrack,
          nextTrackLabel:           nextMeta?.label ?? null,
          nextTrackDescription:     nextMeta?.description ?? null,
          nextTrackEligible:        assessment.nextTrackEligible,
          milestoneGates:           assessment.milestoneGates,
          estimatedMonthsToNextTrack: assessment.estimatedMonthsToNextTrack,
          actionRoadmap:            assessment.actionRoadmap,
          assessedAt:               assessment.assessedAt,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /graduation/assess');
    }
  },
);

// ── GET /api/businesses/:id/credit-builder/roadmap ────────────

graduationRouter.get(
  '/credit-builder/roadmap',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];

    try {
      const roadmap = await buildCreditRoadmapForBusiness(businessId);

      res.status(200).json({
        success: true,
        data: {
          businessId:                roadmap.businessId,
          estimatedCompletionMonths: roadmap.estimatedCompletionMonths,
          stackingUnlocked:          roadmap.stackingUnlockStatus.unlocked,
          stackingUnlockStatus:      roadmap.stackingUnlockStatus,
          currentSbssTarget:         roadmap.currentSbssTarget,
          sbssMilestones:            roadmap.sbssMilestones,
          dunsRegistrationSteps:     roadmap.dunsSteps,
          recommendedVendors:        roadmap.recommendedVendors,
          generatedAt:               roadmap.generatedAt,
        },
      } satisfies ApiResponse);
    } catch (err) {
      const isNotFound = err instanceof Error && err.message.includes('not found');
      if (isNotFound) {
        handleNotFound(res, `Business ${businessId} not found.`);
        return;
      }
      handleUnexpectedError(err, res, 'GET /credit-builder/roadmap');
    }
  },
);

// ── POST /api/businesses/:id/credit-builder/milestones ────────

graduationRouter.post(
  '/credit-builder/milestones',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];

    const parsed = MilestoneBodySchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    const {
      sbssScore,
      industry,
      ficoScore,
      businessAgeMonths,
      monthlyRevenue,
      tradelineCount,
      currentUtilization,
    } = parsed.data;

    try {
      const milestoneProgress = evaluateMilestoneProgress(sbssScore);

      const graduationInput: GraduationInput = {
        ficoScore:           ficoScore ?? 680,
        businessAgeMonths:   businessAgeMonths ?? 0,
        monthlyRevenue:      monthlyRevenue ?? 0,
        businessCreditScore: sbssScore,
        tradelineCount:      tradelineCount ?? 0,
        currentUtilization:  currentUtilization ?? 0,
      };

      const unlockStatus = evaluateStackingUnlock(graduationInput);

      const roadmap = buildCreditRoadmap(businessId, industry ?? 'general', graduationInput);

      const nextMilestone = milestoneProgress.find((m) => !m.achieved) ?? null;

      res.status(200).json({
        success: true,
        data: {
          businessId,
          currentSbssScore:   sbssScore,
          milestoneProgress,
          nextMilestone,
          stackingUnlockStatus: unlockStatus,
          currentSbssTarget:  roadmap.currentSbssTarget,
          evaluatedAt:        new Date(),
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /credit-builder/milestones');
    }
  },
);

export default graduationRouter;
