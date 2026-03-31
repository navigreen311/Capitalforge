// ============================================================
// CapitalForge Credit Routes
//
// Mounted under: /api/businesses/:id/credit
//
// GET  /api/businesses/:id/credit           — all profiles
// POST /api/businesses/:id/credit/pull      — trigger pull
// GET  /api/businesses/:id/credit/roadmap   — optimization roadmap
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import logger from '../../config/logger.js';
import { CreditIntelligenceService } from '../../services/credit-intelligence.service.js';
import { CreditPullRequestSchema } from '../../../shared/validators/credit.validators.js';
import type { ApiResponse, TenantContext } from '../../../shared/types/index.js';

// ── Dependency setup ──────────────────────────────────────────

const prisma = new PrismaClient();
const creditService = new CreditIntelligenceService(prisma);

// ── Helper: extract TenantContext from request ────────────────
// In production this is populated by the auth middleware which
// validates the JWT and attaches the decoded context.

function getTenantContext(req: Request): TenantContext {
  const ctx = (req as Request & { tenantContext?: TenantContext }).tenantContext;
  if (!ctx) {
    throw Object.assign(new Error('Unauthorized: missing tenant context'), { statusCode: 401 });
  }
  return ctx;
}

// ── Error response helper ─────────────────────────────────────

function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiResponse = {
    success: false,
    error: { code, message, details },
  };
  res.status(statusCode).json(body);
}

// ── Router factory (accepts optional prisma for testing) ──────

export function createCreditRouter(customPrisma?: PrismaClient): Router {
  const router = Router({ mergeParams: true });
  const service = customPrisma
    ? new CreditIntelligenceService(customPrisma)
    : creditService;

  // ── GET /api/businesses/:id/credit ───────────────────────────
  // Returns all CreditProfile records for a business, latest first.

  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { id: businessId } = req.params;

    try {
      const ctx = getTenantContext(req);

      logger.debug('GET credit profiles', { businessId, tenantId: ctx.tenantId });

      const profiles = await service.getCreditProfiles(businessId, ctx);

      const body: ApiResponse = {
        success: true,
        data: profiles,
        meta: { total: profiles.length },
      };
      res.status(200).json(body);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 401) {
        sendError(res, 401, 'UNAUTHORIZED', (err as Error).message);
        return;
      }
      if (err instanceof Error && err.message.includes('not found')) {
        sendError(res, 404, 'NOT_FOUND', err.message);
        return;
      }
      next(err);
    }
  });

  // ── POST /api/businesses/:id/credit/pull ─────────────────────
  // Trigger a fresh bureau pull.
  //
  // Body: CreditPullRequest
  //   { bureaus: Bureau[], profileType: 'personal'|'business', useCache?: boolean }

  router.post('/pull', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { id: businessId } = req.params;

    try {
      const ctx = getTenantContext(req);

      // Validate request body
      const parseResult = CreditPullRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        sendError(
          res,
          422,
          'VALIDATION_ERROR',
          'Invalid credit pull request',
          parseResult.error.flatten(),
        );
        return;
      }

      logger.info('Credit pull triggered via API', {
        businessId,
        bureaus: parseResult.data.bureaus,
        tenantId: ctx.tenantId,
      });

      const profiles = await service.pullCreditProfiles(businessId, parseResult.data, ctx);

      const body: ApiResponse = {
        success: true,
        data: profiles,
        meta: { total: profiles.length },
      };
      res.status(201).json(body);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 401) {
        sendError(res, 401, 'UNAUTHORIZED', (err as Error).message);
        return;
      }
      if (err instanceof ZodError) {
        sendError(res, 422, 'VALIDATION_ERROR', 'Request validation failed', err.flatten());
        return;
      }
      if (err instanceof Error && err.message.includes('not found')) {
        sendError(res, 404, 'NOT_FOUND', err.message);
        return;
      }
      next(err);
    }
  });

  // ── GET /api/businesses/:id/credit/roadmap ───────────────────
  // Returns a prioritized credit optimization roadmap.

  router.get('/roadmap', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { id: businessId } = req.params;

    try {
      const ctx = getTenantContext(req);

      logger.debug('GET credit roadmap', { businessId, tenantId: ctx.tenantId });

      const roadmap = await service.generateOptimizationRoadmap(businessId, ctx);

      const body: ApiResponse = {
        success: true,
        data: roadmap,
      };
      res.status(200).json(body);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 401) {
        sendError(res, 401, 'UNAUTHORIZED', (err as Error).message);
        return;
      }
      if (err instanceof Error && err.message.includes('not found')) {
        sendError(res, 404, 'NOT_FOUND', err.message);
        return;
      }
      next(err);
    }
  });

  return router;
}

// Default export — pre-wired with the shared Prisma instance.
// For testing, use createCreditRouter(mockPrisma).
export default createCreditRouter();
