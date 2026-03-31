// ============================================================
// CapitalForge — Deal Committee & Decision Explainability Routes
//
// Endpoints:
//   POST /api/businesses/:id/deal-review
//     Create a deal committee review (auto-escalates when score < 50 or
//     compliance risk is high/critical).
//
//   GET  /api/deal-reviews
//     List pending / escalated / in-review deal reviews for the tenant.
//
//   GET  /api/deal-reviews/:id
//     Retrieve full detail for a single deal review.
//
//   PUT  /api/deal-reviews/:id
//     Update a review: committee notes, conditions, status.
//
//   POST /api/deal-reviews/:id/vote
//     Cast a committee member vote (approve / reject / abstain).
//
//   POST /api/deal-reviews/:id/signoff
//     Record counsel or accountant signoff.
//
//   GET  /api/businesses/:id/decisions/explain
//     Retrieve AI decision explanations for a business.
//
//   GET  /api/decisions/:id/audit-trail
//     Retrieve the full audit trail for a specific AI decision.
//
// All routes require a valid JWT. TenantContext is expected on req.tenant.
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import {
  createDealReview,
  listPendingReviews,
  getDealReview,
  updateDealReview,
  castVote,
  recordSignoff,
  determineRiskTier,
  evaluateRedFlagChecklist,
  type EscalationInput,
  type UpdateReviewRequest,
  type VoteRequest,
  type SignoffRequest,
  type RedFlagCode,
  REVIEW_STATUS,
} from '../../services/deal-committee.service.js';
import {
  getBusinessDecisionExplanations,
  getDecisionAuditTrail,
  captureHumanOverride,
  buildSuitabilityExplanation,
  buildRecommendationExplanation,
  buildExclusionExplanation,
  type HumanOverrideRequest,
} from '../../services/decision-explainability.service.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────

export const dealCommitteeRouter = Router({ mergeParams: true });

// ── Auth helpers ──────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    } satisfies ApiResponse);
    return;
  }
  next();
}

function requireRoles(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenant || !roles.includes(req.tenant.role)) {
      res.status(403).json({
        success: false,
        error: {
          code:    'FORBIDDEN',
          message: `This endpoint requires one of the following roles: ${roles.join(', ')}.`,
        },
      } satisfies ApiResponse);
      return;
    }
    next();
  };
}

// ── Error helpers ─────────────────────────────────────────────

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
  logger.error(`[DealCommitteeRoutes] Unexpected error in ${context}`, { err });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  } satisfies ApiResponse);
}

// ── Validation Schemas ────────────────────────────────────────

const CreateDealReviewSchema = z.object({
  suitabilityScore: z.number().int().min(0).max(100),
  complianceRisk:   z.enum(['low', 'medium', 'high', 'critical']),
  triggeredFlags:   z.array(z.string()).default([]),
  initiatorNote:    z.string().max(1000).optional(),
});

const UpdateDealReviewSchema = z.object({
  committeeNotes: z.string().max(5000).optional(),
  status:         z.enum([
    REVIEW_STATUS.PENDING,
    REVIEW_STATUS.IN_REVIEW,
    REVIEW_STATUS.APPROVED,
    REVIEW_STATUS.APPROVED_CONDITIONAL,
    REVIEW_STATUS.REJECTED,
    REVIEW_STATUS.ESCALATED,
  ]).optional(),
  conditions: z.array(
    z.object({
      id:           z.string().uuid().optional(),
      description:  z.string().min(5),
      assignedTo:   z.string().optional(),
      dueDate:      z.string().optional(),
      completedAt:  z.string().optional(),
      status:       z.enum(['open', 'completed', 'waived']).default('open'),
    }),
  ).optional(),
});

const VoteSchema = z.object({
  vote:    z.enum(['approve', 'reject', 'abstain']),
  comment: z.string().max(2000).optional(),
});

const SignoffSchema = z.object({
  signoffType: z.enum(['counsel', 'accountant']),
  notes:       z.string().max(2000).optional(),
});

const HumanOverrideSchema = z.object({
  decisionLogId: z.string().uuid(),
  justification: z.string().min(20, 'Justification must be at least 20 characters'),
  newOutput:     z.record(z.unknown()),
});

const SuitabilityExplainSchema = z.object({
  checkId:       z.string().uuid(),
  score:         z.number().int().min(0).max(100),
  band:          z.string(),
  recommendation: z.string(),
  noGoReasons:   z.array(z.string()).optional(),
  scoreBreakdown: z.object({
    revenueScore:     z.number(),
    cashFlowScore:    z.number(),
    debtRatioScore:   z.number(),
    creditScore:      z.number(),
    businessAgeScore: z.number(),
  }).optional(),
  overriddenBy:   z.string().optional(),
  overrideReason: z.string().optional(),
});

// ── POST /api/businesses/:id/deal-review ─────────────────────

dealCommitteeRouter.post(
  '/businesses/:id/deal-review',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'] as string;
    const tenant     = req.tenant!;

    const parsed = CreateDealReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    const input: EscalationInput = {
      businessId,
      tenantId:        tenant.tenantId,
      suitabilityScore: parsed.data.suitabilityScore,
      complianceRisk:  parsed.data.complianceRisk,
      triggeredFlags:  parsed.data.triggeredFlags as RedFlagCode[],
      initiatorNote:   parsed.data.initiatorNote,
    };

    try {
      const result = await createDealReview(input);

      // Include a preview of the risk tier and checklist in the response
      const checklist = evaluateRedFlagChecklist(input.triggeredFlags);
      const riskTier  = determineRiskTier(input.suitabilityScore, input.complianceRisk);

      res.status(201).json({
        success: true,
        data: {
          ...result,
          riskTierPreview: riskTier,
          redFlagCount:    checklist.filter((c) => c.flagged).length,
          checklist,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /businesses/:id/deal-review');
    }
  },
);

// ── GET /api/deal-reviews ─────────────────────────────────────

dealCommitteeRouter.get(
  '/deal-reviews',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const tenant = req.tenant!;

    // Optional status filter via query param: ?status=pending,escalated
    const rawStatuses = req.query['status'] as string | undefined;
    const statusFilter = rawStatuses
      ? rawStatuses.split(',').map((s) => s.trim()) as Parameters<typeof listPendingReviews>[1]
      : undefined;

    try {
      const reviews = await listPendingReviews(tenant.tenantId, statusFilter);

      res.status(200).json({
        success: true,
        data: reviews,
        meta: { total: reviews.length },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /deal-reviews');
    }
  },
);

// ── GET /api/deal-reviews/:id ─────────────────────────────────

dealCommitteeRouter.get(
  '/deal-reviews/:id',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const reviewId = req.params['id'] as string;
    const tenant   = req.tenant!;

    try {
      const review = await getDealReview(reviewId, tenant.tenantId);

      if (!review) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Deal review not found.' },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: review } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /deal-reviews/:id');
    }
  },
);

// ── PUT /api/deal-reviews/:id ─────────────────────────────────

dealCommitteeRouter.put(
  '/deal-reviews/:id',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const reviewId = req.params['id'] as string;
    const tenant   = req.tenant!;

    const parsed = UpdateDealReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    const updateReq: UpdateReviewRequest = {
      reviewId,
      tenantId:       tenant.tenantId,
      userId:         tenant.userId,
      committeeNotes: parsed.data.committeeNotes,
      status:         parsed.data.status,
      conditions:     parsed.data.conditions?.map((c) => ({
        id:          c.id ?? `ai-${Date.now()}`,
        description: c.description,
        assignedTo:  c.assignedTo,
        dueDate:     c.dueDate,
        completedAt: c.completedAt,
        status:      c.status,
      })),
    };

    try {
      const result = await updateDealReview(updateReq);

      if (!result.success) {
        res.status(result.message.includes('not found') ? 404 : 400).json({
          success: false,
          error: { code: 'UPDATE_FAILED', message: result.message },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'PUT /deal-reviews/:id');
    }
  },
);

// ── POST /api/deal-reviews/:id/vote ──────────────────────────

dealCommitteeRouter.post(
  '/deal-reviews/:id/vote',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const reviewId = req.params['id'] as string;
    const tenant   = req.tenant!;

    const parsed = VoteSchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    const voteReq: VoteRequest = {
      reviewId,
      tenantId:   tenant.tenantId,
      memberId:   tenant.userId,
      memberRole: tenant.role,
      vote:       parsed.data.vote,
      comment:    parsed.data.comment,
    };

    try {
      const result = await castVote(voteReq);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VOTE_FAILED', message: result.message },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /deal-reviews/:id/vote');
    }
  },
);

// ── POST /api/deal-reviews/:id/signoff ───────────────────────

dealCommitteeRouter.post(
  '/deal-reviews/:id/signoff',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const reviewId = req.params['id'] as string;
    const tenant   = req.tenant!;

    const parsed = SignoffSchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    const signoffReq: SignoffRequest = {
      reviewId,
      tenantId:    tenant.tenantId,
      userId:      tenant.userId,
      role:        tenant.role,
      signoffType: parsed.data.signoffType,
      notes:       parsed.data.notes,
    };

    try {
      const result = await recordSignoff(signoffReq);

      if (!result.success) {
        res.status(result.message.includes('not found') ? 404 : 400).json({
          success: false,
          error: { code: 'SIGNOFF_FAILED', message: result.message },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /deal-reviews/:id/signoff');
    }
  },
);

// ── GET /api/businesses/:id/decisions/explain ────────────────

dealCommitteeRouter.get(
  '/businesses/:id/decisions/explain',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'] as string;
    const tenant     = req.tenant!;
    const limit      = Math.min(parseInt(req.query['limit'] as string ?? '20', 10), 100);

    try {
      const decisions = await getBusinessDecisionExplanations(
        businessId,
        tenant.tenantId,
        limit,
      );

      res.status(200).json({
        success: true,
        data:    decisions,
        meta:    { total: decisions.length },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /businesses/:id/decisions/explain');
    }
  },
);

// ── GET /api/decisions/:id/audit-trail ───────────────────────

dealCommitteeRouter.get(
  '/decisions/:id/audit-trail',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const decisionId = req.params['id'] as string;
    const tenant     = req.tenant!;

    try {
      const trail = await getDecisionAuditTrail(decisionId, tenant.tenantId);

      if (!trail) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'AI decision log entry not found.' },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: trail } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /decisions/:id/audit-trail');
    }
  },
);

// ── POST /api/decisions/:id/override ─────────────────────────

dealCommitteeRouter.post(
  '/decisions/:id/override',
  requireAuth,
  requireRoles(['compliance_officer', 'tenant_admin', 'super_admin']),
  async (req: Request, res: Response): Promise<void> => {
    const decisionId = req.params['id'] as string;
    const tenant     = req.tenant!;

    const parsed = HumanOverrideSchema.safeParse({ ...req.body, decisionLogId: decisionId });
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    const overrideReq: HumanOverrideRequest = {
      tenantId:      tenant.tenantId,
      decisionLogId: decisionId,
      overriddenBy:  tenant.userId,
      overriderRole: tenant.role,
      justification: parsed.data.justification,
      newOutput:     parsed.data.newOutput as Record<string, unknown>,
    };

    try {
      const result = await captureHumanOverride(overrideReq);

      if (!result.success) {
        const status = result.message.includes('not found') ? 404
          : result.message.includes('20 characters') ? 422
          : 400;

        res.status(status).json({
          success: false,
          error: { code: 'OVERRIDE_FAILED', message: result.message, details: { auditId: result.auditId } },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /decisions/:id/override');
    }
  },
);

// ── POST /api/businesses/:id/decisions/explain/suitability ───

dealCommitteeRouter.post(
  '/businesses/:id/decisions/explain/suitability',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'] as string;

    const parsed = SuitabilityExplainSchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    const explanation = buildSuitabilityExplanation({
      businessId,
      ...parsed.data,
    });

    res.status(200).json({ success: true, data: explanation } satisfies ApiResponse);
  },
);

// ── POST /api/decisions/explain/card ─────────────────────────

dealCommitteeRouter.post(
  '/decisions/explain/card',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      type:        'recommendation' | 'exclusion';
      cardId?:     string;
      issuer:      string;
      cardProduct: string;
      reasons:     Array<{ code: string; detail: string; supportingValue?: string | number }>;
    };

    if (!body.type || !body.issuer || !body.cardProduct || !Array.isArray(body.reasons)) {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'type, issuer, cardProduct, and reasons are required.' },
      } satisfies ApiResponse);
      return;
    }

    try {
      const explanation =
        body.type === 'recommendation'
          ? buildRecommendationExplanation({
              cardId:      body.cardId ?? '',
              issuer:      body.issuer,
              cardProduct: body.cardProduct,
              reasons:     body.reasons as Parameters<typeof buildRecommendationExplanation>[0]['reasons'],
            })
          : buildExclusionExplanation({
              cardId:      body.cardId,
              issuer:      body.issuer,
              cardProduct: body.cardProduct,
              reasons:     body.reasons as Parameters<typeof buildExclusionExplanation>[0]['reasons'],
            });

      res.status(200).json({ success: true, data: explanation } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /decisions/explain/card');
    }
  },
);

export default dealCommitteeRouter;
