// ============================================================
// CapitalForge — Suitability Routes
//
// Endpoints:
//   POST /api/businesses/:id/suitability/check
//     Run a new suitability assessment for a business.
//
//   GET  /api/businesses/:id/suitability/latest
//     Retrieve the most recent suitability check result.
//
//   POST /api/businesses/:id/suitability/override
//     Apply a compliance-officer override (requires compliance_officer role).
//
// All routes require a valid JWT. The TenantContext is expected on
// req.tenant (set by upstream auth middleware).
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import {
  runSuitabilityCheck,
  getLatestSuitabilityCheck,
  applyOverride,
  type SuitabilityInput,
} from '../../services/suitability.service.js';
import { ROLES } from '@shared/constants/index.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Augment Express Request with TenantContext ───────────────
// The auth middleware upstream should attach this.

declare global {
  namespace Express {
    interface Request {
      tenant?: {
        tenantId:    string;
        userId:      string;
        role:        string;
        permissions: string[];
      };
    }
  }
}

// ── Validation Schemas ────────────────────────────────────────

const SuitabilityCheckBodySchema = z.object({
  monthlyRevenue:      z.number().nonnegative('monthlyRevenue must be >= 0'),
  existingDebt:        z.number().nonnegative('existingDebt must be >= 0'),
  cashFlowRatio:       z.number().min(-1).max(1, 'cashFlowRatio must be between -1 and 1'),
  industry:            z.string().min(1),
  businessAgeMonths:   z.number().int().nonnegative(),
  personalCreditScore: z.number().int().min(300).max(850),
  businessCreditScore: z.number().int().min(0).max(300).default(0),
  activeBankruptcy:    z.boolean().default(false),
  sanctionsMatch:      z.boolean().default(false),
  fraudSuspicion:      z.boolean().default(false),
});

const OverrideBodySchema = z.object({
  justification: z.string().min(10, 'Justification must be at least 10 characters'),
});

// ── Router ────────────────────────────────────────────────────

export const suitabilityRouter = Router({ mergeParams: true });

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

function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenant || req.tenant.role !== role) {
      const body: ApiResponse = {
        success: false,
        error: {
          code:    'FORBIDDEN',
          message: `This endpoint requires the ${role} role.`,
        },
      };
      res.status(403).json(body);
      return;
    }
    next();
  };
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
  logger.error(`[SuitabilityRoutes] Unexpected error in ${context}`, { err });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  } satisfies ApiResponse);
}

// ── POST /api/businesses/:id/suitability/check ───────────────

suitabilityRouter.post(
  '/check',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenant     = req.tenant!;

    const parsed = SuitabilityCheckBodySchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    const input: SuitabilityInput = parsed.data;

    try {
      const { checkId, assessment } = await runSuitabilityCheck(
        businessId,
        tenant.tenantId,
        input,
      );

      const body: ApiResponse = {
        success: true,
        data: {
          checkId,
          score:               assessment.score,
          band:                assessment.band,
          maxSafeLeverage:     assessment.maxSafeLeverage,
          noGoTriggered:       assessment.noGoTriggered,
          noGoReasons:         assessment.noGoReasons,
          recommendation:      assessment.recommendation,
          alternativeProducts: assessment.alternativeProducts,
          scoreBreakdown:      assessment.scoreBreakdown,
          leverageDetail:      assessment.leverageDetail,
        },
      };

      const status = assessment.noGoTriggered ? 200 : 200; // always 200; band communicates outcome
      res.status(status).json(body);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /check');
    }
  },
);

// ── GET /api/businesses/:id/suitability/latest ───────────────

suitabilityRouter.get(
  '/latest',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];

    try {
      const check = await getLatestSuitabilityCheck(businessId);

      if (!check) {
        res.status(404).json({
          success: false,
          error: {
            code:    'NOT_FOUND',
            message: 'No suitability check found for this business.',
          },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({ success: true, data: check } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /latest');
    }
  },
);

// ── POST /api/businesses/:id/suitability/override ────────────

suitabilityRouter.post(
  '/override',
  requireAuth,
  requireRole(ROLES.COMPLIANCE_OFFICER),
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenant     = req.tenant!;

    // checkId can come from query param or body
    const checkId = (req.query['checkId'] as string | undefined) ?? (req.body as Record<string, unknown>)['checkId'];

    if (!checkId || typeof checkId !== 'string') {
      res.status(422).json({
        success: false,
        error: {
          code:    'VALIDATION_ERROR',
          message: 'checkId is required (query param or body field).',
        },
      } satisfies ApiResponse);
      return;
    }

    const parsed = OverrideBodySchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    try {
      const result = await applyOverride({
        checkId,
        officerUserId: tenant.userId,
        officerRole:   tenant.role,
        justification: parsed.data.justification,
        tenantId:      tenant.tenantId,
      });

      if (!result.success) {
        // Distinguish between auth/policy failures (403) and not-found (404)
        const isNotFound = result.message.includes('not found');
        const isLocked   = result.message.includes('HARD NO-GO') || result.message.includes('Override is not permitted');
        const isAuthz    = result.message.includes('compliance_officer role');

        const status = isNotFound ? 404 : isLocked ? 422 : isAuthz ? 403 : 400;

        res.status(status).json({
          success: false,
          error: {
            code:    isLocked ? 'HARD_NOGO_LOCKED' : 'OVERRIDE_FAILED',
            message: result.message,
            details: { auditId: result.auditId, businessId },
          },
        } satisfies ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          auditId:     result.auditId,
          message:     result.message,
          businessId,
          checkId,
          overriddenBy: tenant.userId,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /override');
    }
  },
);

export default suitabilityRouter;
