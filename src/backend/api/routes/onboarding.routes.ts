// ============================================================
// CapitalForge Onboarding Routes
//
// POST   /api/businesses              — create business
// GET    /api/businesses/:id          — get business by ID
// PUT    /api/businesses/:id          — update business
// POST   /api/businesses/:id/owners   — add owner
// GET    /api/businesses/:id/readiness — get readiness score details
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  createBusiness,
  getBusinessById,
  updateBusiness,
  addOwner,
  refreshReadinessScore,
} from '../../../backend/services/onboarding.service.js';
import {
  createBusinessSchema,
  updateBusinessSchema,
  createOwnerSchema,
} from '../../../shared/validators/business.validators.js';
import type { ApiResponse } from '../../../shared/types/index.js';

// ── Helpers ───────────────────────────────────────────────────

/**
 * Extract tenantId from the authenticated request context.
 * In production this comes from JWT middleware (req.tenantContext).
 * We fall back to an X-Tenant-Id header for dev / test convenience.
 */
function resolveTenantId(req: Request): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (req as any).tenantContext;
  if (ctx?.tenantId) return ctx.tenantId;

  const header = req.headers['x-tenant-id'];
  if (typeof header === 'string' && header.length > 0) return header;

  throw new Error('Tenant context is missing — ensure authentication middleware is applied.');
}

function ok<T>(res: Response, data: T, statusCode = 200): void {
  const body: ApiResponse<T> = { success: true, data };
  res.status(statusCode).json(body);
}

function fail(res: Response, code: string, message: string, statusCode: number, details?: unknown): void {
  const body: ApiResponse = { success: false, error: { code, message, details } };
  res.status(statusCode).json(body);
}

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ── Router ────────────────────────────────────────────────────

export const onboardingRouter = Router();

// ── POST /api/businesses ──────────────────────────────────────

onboardingRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);

    const parsed = createBusinessSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'VALIDATION_ERROR', 'Invalid business data', 422, parsed.error.flatten());
      return;
    }

    const { business, readiness } = await createBusiness(tenantId, parsed.data);

    ok(
      res,
      {
        business,
        fundingReadiness: {
          score:       readiness.score,
          track:       readiness.track,
          trackLabel:  readiness.trackLabel,
          componentScores: readiness.componentScores,
          gaps:        readiness.gaps,
          summary:     readiness.summary,
        },
      },
      201,
    );
  }),
);

// ── GET /api/businesses/:id ────────────────────────────────────

onboardingRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const business = await getBusinessById(tenantId, id);

    if (!business) {
      fail(res, 'NOT_FOUND', `Business ${id} not found`, 404);
      return;
    }

    ok(res, { business });
  }),
);

// ── PUT /api/businesses/:id ────────────────────────────────────

onboardingRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const parsed = updateBusinessSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'VALIDATION_ERROR', 'Invalid update data', 422, parsed.error.flatten());
      return;
    }

    const business = await updateBusiness(tenantId, id, parsed.data);

    if (!business) {
      fail(res, 'NOT_FOUND', `Business ${id} not found`, 404);
      return;
    }

    ok(res, { business });
  }),
);

// ── POST /api/businesses/:id/owners ───────────────────────────

onboardingRouter.post(
  '/:id/owners',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    const parsed = createOwnerSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'VALIDATION_ERROR', 'Invalid owner data', 422, parsed.error.flatten());
      return;
    }

    // Optional: accept personal credit score from body to trigger readiness recalc
    const personalCreditScore: number | undefined =
      typeof req.body.personalCreditScore === 'number'
        ? req.body.personalCreditScore
        : undefined;

    let result;
    try {
      result = await addOwner(tenantId, id, parsed.data, personalCreditScore);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        fail(res, 'NOT_FOUND', `Business ${id} not found`, 404);
        return;
      }
      throw err;
    }

    ok(
      res,
      {
        owner: result.owner,
        ...(result.updatedReadiness && {
          updatedReadiness: {
            score:          result.updatedReadiness.score,
            track:          result.updatedReadiness.track,
            trackLabel:     result.updatedReadiness.trackLabel,
            componentScores: result.updatedReadiness.componentScores,
            gaps:           result.updatedReadiness.gaps,
            summary:        result.updatedReadiness.summary,
          },
        }),
      },
      201,
    );
  }),
);

// ── GET /api/businesses/:id/readiness ─────────────────────────

onboardingRouter.get(
  '/:id/readiness',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { id } = req.params;

    let readiness;
    try {
      readiness = await refreshReadinessScore(tenantId, id);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        fail(res, 'NOT_FOUND', `Business ${id} not found`, 404);
        return;
      }
      throw err;
    }

    ok(res, {
      score:          readiness.score,
      track:          readiness.track,
      trackLabel:     readiness.trackLabel,
      componentScores: readiness.componentScores,
      gaps:           readiness.gaps,
      summary:        readiness.summary,
    });
  }),
);

// ── 404 fallback (within this router) ─────────────────────────

onboardingRouter.use((_req: Request, res: Response) => {
  fail(res, 'NOT_FOUND', 'Endpoint not found', 404);
});

export default onboardingRouter;
