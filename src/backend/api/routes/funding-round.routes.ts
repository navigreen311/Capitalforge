// ============================================================
// CapitalForge — Funding Round Routes
//
// POST   /api/businesses/:id/rounds          — create round
// GET    /api/businesses/:id/rounds          — list rounds for a business
// GET    /api/rounds/:id                     — round detail with applications
// PUT    /api/rounds/:id                     — update round
// POST   /api/rounds/:id/complete            — complete a round
// GET    /api/businesses/:id/rounds/compare  — cross-round comparison
// GET    /api/businesses/:id/rounds/round2-eligibility
//                                            — Round 2 eligibility check
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { PERMISSIONS } from '@shared/constants/index.js';
import type { ApiResponse } from '@shared/types/index.js';
import { FundingRoundService } from '../../services/funding-round.service.js';
import {
  AppError,
  notFound,
  badRequest,
  conflict,
} from '../../middleware/error-handler.js';

// ── Singleton service (PrismaClient shared per process) ───────────────────────
const fundingRoundService = new FundingRoundService();

// ── Validation schemas ─────────────────────────────────────────────────────────

const CreateRoundSchema = z.object({
  targetCredit: z.number().positive().optional(),
  targetCardCount: z.number().int().positive().optional(),
  issuerMixStrategy: z.array(z.string()).optional(),
  notes: z.string().max(1000).optional(),
});

const UpdateRoundSchema = z.object({
  targetCredit: z.number().positive().nullable().optional(),
  targetCardCount: z.number().int().positive().nullable().optional(),
  issuerMixStrategy: z.array(z.string()).optional(),
  notes: z.string().max(1000).optional(),
  status: z.enum(['planning', 'in_progress', 'completed', 'cancelled']).optional(),
  aprExpiryDate: z.string().datetime().nullable().optional(),
});

// ── Helper: extract tenantId from authenticated request ───────────────────────

function getTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Authentication context missing.');
  }
  return tenantId;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const fundingRoundRouter: Router = Router({ mergeParams: true });

// ── GET /api/funding-rounds ──────────────────────────────────────────────────
// Cross-business listing (all rounds visible to the tenant)

fundingRoundRouter.get(
  '/api/funding-rounds',
  requireAuth,
  requirePermissions(PERMISSIONS.BUSINESS_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = getTenantId(req);
      const statusFilter = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;

      const rounds = await fundingRoundService.listAllRoundsForTenant(tenantId, statusFilter);

      const body: ApiResponse<typeof rounds> = {
        success: true,
        data: rounds,
        meta: { total: rounds.length },
      };

      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/funding-rounds ─────────────────────────────────────────────────
// Alternative endpoint for creating a round without business ID in URL

fundingRoundRouter.post(
  '/api/funding-rounds',
  requireAuth,
  requirePermissions(PERMISSIONS.BUSINESS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = getTenantId(req);
      const bodySchema = CreateRoundSchema.extend({
        businessId: z.string().min(1, 'Business ID is required'),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return next(badRequest('Invalid request body.', parsed.error.flatten()));
      }

      const round = await fundingRoundService.createRound({
        businessId: parsed.data.businessId,
        tenantId,
        ...parsed.data,
      });

      const body: ApiResponse<typeof round> = {
        success: true,
        data: round,
      };

      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/businesses/:id/rounds ───────────────────────────────────────────

fundingRoundRouter.post(
  '/api/businesses/:id/rounds',
  requireAuth,
  requirePermissions(PERMISSIONS.BUSINESS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = getTenantId(req);
      const businessId = req.params['id'];
      if (!businessId) {
        return next(badRequest('Business ID is required.'));
      }

      const parsed = CreateRoundSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(badRequest('Invalid request body.', parsed.error.flatten()));
      }

      const round = await fundingRoundService.createRound({
        businessId,
        tenantId,
        ...parsed.data,
      });

      const body: ApiResponse<typeof round> = {
        success: true,
        data: round,
      };

      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/businesses/:id/rounds/round2-eligibility ─────────────────────────
// Must be registered BEFORE /api/businesses/:id/rounds to avoid param collision

fundingRoundRouter.get(
  '/api/businesses/:id/rounds/round2-eligibility',
  requireAuth,
  requirePermissions(PERMISSIONS.BUSINESS_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = req.params['id'];
      if (!businessId) {
        return next(badRequest('Business ID is required.'));
      }

      const eligibility = await fundingRoundService.assessRound2Eligibility(businessId);

      const body: ApiResponse<typeof eligibility> = {
        success: true,
        data: eligibility,
      };

      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/businesses/:id/rounds/compare ────────────────────────────────────

fundingRoundRouter.get(
  '/api/businesses/:id/rounds/compare',
  requireAuth,
  requirePermissions(PERMISSIONS.BUSINESS_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = req.params['id'];
      if (!businessId) {
        return next(badRequest('Business ID is required.'));
      }

      const comparison = await fundingRoundService.compareRounds(businessId);

      const body: ApiResponse<typeof comparison> = {
        success: true,
        data: comparison,
        meta: { total: comparison.length },
      };

      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/businesses/:id/rounds ────────────────────────────────────────────

fundingRoundRouter.get(
  '/api/businesses/:id/rounds',
  requireAuth,
  requirePermissions(PERMISSIONS.BUSINESS_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = req.params['id'];
      if (!businessId) {
        return next(badRequest('Business ID is required.'));
      }

      const rounds = await fundingRoundService.listRounds(businessId);

      const body: ApiResponse<typeof rounds> = {
        success: true,
        data: rounds,
        meta: { total: rounds.length },
      };

      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/rounds/:id ───────────────────────────────────────────────────────

fundingRoundRouter.get(
  '/api/rounds/:id',
  requireAuth,
  requirePermissions(PERMISSIONS.BUSINESS_READ),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roundId = req.params['id'];
      if (!roundId) {
        return next(badRequest('Round ID is required.'));
      }

      const round = await fundingRoundService.getRoundById(roundId);

      if (!round) {
        return next(notFound('Funding round'));
      }

      const body: ApiResponse<typeof round> = {
        success: true,
        data: round,
      };

      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ── PUT /api/rounds/:id ───────────────────────────────────────────────────────

fundingRoundRouter.put(
  '/api/rounds/:id',
  requireAuth,
  requirePermissions(PERMISSIONS.BUSINESS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roundId = req.params['id'];
      if (!roundId) {
        return next(badRequest('Round ID is required.'));
      }

      const parsed = UpdateRoundSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(badRequest('Invalid request body.', parsed.error.flatten()));
      }

      const { aprExpiryDate, ...rest } = parsed.data;

      const round = await fundingRoundService.updateRound(roundId, {
        ...rest,
        aprExpiryDate:
          aprExpiryDate !== undefined
            ? aprExpiryDate !== null
              ? new Date(aprExpiryDate)
              : null
            : undefined,
      });

      const body: ApiResponse<typeof round> = {
        success: true,
        data: round,
      };

      res.json(body);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Cannot update')) {
        return next(conflict(err.message));
      }
      next(err);
    }
  },
);

// ── POST /api/rounds/:id/complete ─────────────────────────────────────────────

fundingRoundRouter.post(
  '/api/rounds/:id/complete',
  requireAuth,
  requirePermissions(PERMISSIONS.BUSINESS_WRITE),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = getTenantId(req);
      const roundId = req.params['id'];
      if (!roundId) {
        return next(badRequest('Round ID is required.'));
      }

      const { round, metrics } = await fundingRoundService.completeRound(
        roundId,
        tenantId,
      );

      const body: ApiResponse<{ round: typeof round; metrics: typeof metrics }> = {
        success: true,
        data: { round, metrics },
      };

      res.json(body);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('already completed') || err.message.includes('cancelled')) {
          return next(conflict(err.message));
        }
        if (err.message.includes('not found')) {
          return next(notFound('Funding round'));
        }
      }
      next(err);
    }
  },
);

export default fundingRoundRouter;
