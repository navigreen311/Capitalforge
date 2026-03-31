// ============================================================
// CapitalForge — Card Stacking Optimizer Routes
//
// Endpoints:
//   POST /api/businesses/:id/optimize
//     Generate a new stack recommendation for a business.
//     Accepts a full credit + business profile in the body.
//
//   GET  /api/businesses/:id/optimizer/results
//     Return the latest cached optimizer result for a business.
//
//   POST /api/businesses/:id/optimizer/simulate
//     Run a what-if scenario without persisting the result.
//     Body includes a base profile plus scenarioOverrides.
//
// All routes require a valid JWT. The TenantContext is expected on
// req.tenant (set by the upstream tenantMiddleware).
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z, type ZodError } from 'zod';
import {
  StackingOptimizerService,
  type OptimizerInput,
  type PersonalCreditProfile,
} from '../../services/stacking-optimizer.service.js';
import type { ExistingCard } from '../../services/issuer-rules.service.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

// ============================================================
// In-process result cache
//
// Production deployments should replace this with a Redis-backed
// store using businessId + tenantId as the cache key.
// ============================================================

const resultCache = new Map<string, ReturnType<StackingOptimizerService['optimize']>>();

function cacheKey(tenantId: string, businessId: string): string {
  return `${tenantId}::${businessId}`;
}

// ============================================================
// Validation schemas
// ============================================================

const ExistingCardSchema = z.object({
  id:        z.string().min(1),
  issuer:    z.enum([
    'chase', 'amex', 'capital_one', 'citi', 'bank_of_america',
    'us_bank', 'wells_fargo', 'discover', 'td_bank', 'pnc',
  ]),
  openedAt:  z.string().datetime({ message: 'openedAt must be an ISO datetime string' }),
  isOpen:    z.boolean(),
});

const PersonalCreditSchema = z.object({
  ficoScore:          z.number().int().min(300).max(850),
  utilizationRatio:   z.number().min(0).max(1),
  derogatoryCount:    z.number().int().min(0),
  inquiries12m:       z.number().int().min(0),
  creditAgeMonths:    z.number().int().min(0),
});

const BusinessProfileSchema = z.object({
  yearsInOperation:   z.number().min(0),
  annualRevenue:      z.number().nonnegative(),
  targetCreditLimit:  z.number().positive('targetCreditLimit must be > 0'),
});

/** Full optimizer request body. */
const OptimizeBodySchema = z.object({
  personalCredit:          PersonalCreditSchema,
  businessProfile:         BusinessProfileSchema,
  existingCards:           z.array(ExistingCardSchema).default([]),
  recentApplicationDates:  z.array(z.string().datetime()).default([]),
  excludeCardIds:          z.array(z.string()).default([]),
});

/** Simulate request — same as optimize but scenarioOverrides is required. */
const SimulateBodySchema = OptimizeBodySchema.extend({
  scenarioOverrides: PersonalCreditSchema.partial().refine(
    (v) => Object.keys(v).length > 0,
    { message: 'scenarioOverrides must contain at least one field to override.' },
  ),
});

// ============================================================
// Router
// ============================================================

export const optimizerRouter = Router({ mergeParams: true });

// ── Shared service instance ────────────────────────────────
const optimizer = new StackingOptimizerService();

// ── Guard helpers ─────────────────────────────────────────

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
  logger.error(`[OptimizerRoutes] Unexpected error in ${context}`, { err });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  } satisfies ApiResponse);
}

// ── POST /api/businesses/:id/optimize ─────────────────────
//
// Generate (or regenerate) a stack recommendation.
// Persists the result in the in-process cache.
//
// Body: OptimizeBodySchema
// Returns: OptimizerResult wrapped in ApiResponse

optimizerRouter.post(
  '/',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenant     = req.tenant!;

    if (!businessId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'businessId path parameter is required.' },
      } satisfies ApiResponse);
      return;
    }

    const parsed = OptimizeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    const { personalCredit, businessProfile, existingCards, recentApplicationDates, excludeCardIds } = parsed.data;

    const input: OptimizerInput = {
      personalCredit: personalCredit as PersonalCreditProfile,
      businessProfile: {
        ...businessProfile,
        businessId,
      },
      existingCards: existingCards as ExistingCard[],
      recentApplicationDates,
      excludeCardIds,
    };

    try {
      const result = optimizer.optimize(input);

      // Cache for GET /results
      resultCache.set(cacheKey(tenant.tenantId, businessId), result);

      res.status(200).json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /optimize');
    }
  },
);

// ── GET /api/businesses/:id/optimizer/results ─────────────
//
// Return the most recent cached stack result.
// Returns 404 if no result has been generated yet.

optimizerRouter.get(
  '/results',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenant     = req.tenant!;

    if (!businessId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'businessId path parameter is required.' },
      } satisfies ApiResponse);
      return;
    }

    try {
      const cached = resultCache.get(cacheKey(tenant.tenantId, businessId));

      if (!cached) {
        res.status(404).json({
          success: false,
          error: {
            code:    'NOT_FOUND',
            message: 'No optimizer result found for this business. Run POST /optimize first.',
          },
        } satisfies ApiResponse);
        return;
      }

      // Warn if the result is stale (past expiresAt)
      const isStale = new Date() > new Date(cached.expiresAt);

      res.status(200).json({
        success: true,
        data: {
          ...cached,
          stale: isStale,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'GET /results');
    }
  },
);

// ── POST /api/businesses/:id/optimizer/simulate ───────────
//
// Run a what-if scenario. Result is NOT cached — it is returned
// directly for comparison against the live plan.
//
// Body: SimulateBodySchema (includes scenarioOverrides)

optimizerRouter.post(
  '/simulate',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];

    if (!businessId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'businessId path parameter is required.' },
      } satisfies ApiResponse);
      return;
    }

    const parsed = SimulateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      handleZodError(parsed.error, res);
      return;
    }

    const {
      personalCredit,
      businessProfile,
      existingCards,
      recentApplicationDates,
      excludeCardIds,
      scenarioOverrides,
    } = parsed.data;

    const input: OptimizerInput = {
      personalCredit: personalCredit as PersonalCreditProfile,
      businessProfile: {
        ...businessProfile,
        businessId,
      },
      existingCards: existingCards as ExistingCard[],
      recentApplicationDates,
      excludeCardIds,
    };

    try {
      const result = optimizer.simulate(input, scenarioOverrides as Partial<PersonalCreditProfile>);

      res.status(200).json({
        success: true,
        data: {
          ...result,
          simulated: true,
          scenarioOverrides,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleUnexpectedError(err, res, 'POST /simulate');
    }
  },
);

export default optimizerRouter;
