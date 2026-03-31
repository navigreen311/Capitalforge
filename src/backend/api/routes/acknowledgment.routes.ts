// ============================================================
// CapitalForge — Acknowledgment Routes
//
// POST /api/businesses/:id/acknowledgments
//   Create and sign an acknowledgment. product_reality is required
//   before any card application can be submitted.
//
// GET  /api/businesses/:id/acknowledgments
//   List all signed acknowledgments for the business.
//
// GET  /api/businesses/:id/acknowledgments/:type/latest
//   Return the sign-status for a specific acknowledgment type,
//   including whether the current version is signed.
// ============================================================

import { Router, type Request, type Response } from 'express';
import { ZodError } from 'zod';

import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { ProductAcknowledgmentService } from '../../services/product-acknowledgment.service.js';
import {
  CreateAcknowledgmentSchema,
  AcknowledgmentTypeParamSchema,
  ListAcknowledgmentsQuerySchema,
} from '@shared/validators/acknowledgment.validators.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ---- Router factory ----------------------------------------

/**
 * Pass a service instance so tests can inject a mock without
 * touching the module-level singleton.
 */
export function createAcknowledgmentRouter(
  service?: ProductAcknowledgmentService,
): Router {
  const router = Router({ mergeParams: true });
  const svc = service ?? new ProductAcknowledgmentService();

  // All acknowledgment routes require an authenticated tenant context.
  router.use(tenantMiddleware);

  // ── POST /api/businesses/:id/acknowledgments ──────────────
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenant = req.tenant;

    if (!businessId || !tenant) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Business ID and auth context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    // Validate request body
    let input;
    try {
      input = CreateAcknowledgmentSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        const body: ApiResponse = {
          success: false,
          error: {
            code:    'VALIDATION_ERROR',
            message: 'Invalid acknowledgment request.',
            details: err.flatten(),
          },
        };
        res.status(422).json(body);
        return;
      }
      throw err;
    }

    try {
      const record = await svc.sign({
        businessId,
        tenantId:        tenant.tenantId,
        signedByUserId:  tenant.userId,
        input,
        signerIp:        req.ip,
      });

      const body: ApiResponse<typeof record> = { success: true, data: record };
      res.status(201).json(body);
    } catch (err) {
      logger.error('[AcknowledgmentRoutes] Error signing acknowledgment', {
        businessId,
        tenantId: tenant.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });

      const body: ApiResponse = {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to record acknowledgment.' },
      };
      res.status(500).json(body);
    }
  });

  // ── GET /api/businesses/:id/acknowledgments ───────────────
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenant = req.tenant;

    if (!businessId || !tenant) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Business ID and auth context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    let query;
    try {
      query = ListAcknowledgmentsQuerySchema.parse(req.query);
    } catch (err) {
      if (err instanceof ZodError) {
        const body: ApiResponse = {
          success: false,
          error: {
            code:    'VALIDATION_ERROR',
            message: 'Invalid query parameters.',
            details: (err as ZodError).flatten(),
          },
        };
        res.status(422).json(body);
        return;
      }
      throw err;
    }

    try {
      const records = await svc.listForBusiness(businessId, {
        type:   query.type,
        limit:  query.limit,
        offset: query.offset,
      });

      const body: ApiResponse<typeof records> = {
        success: true,
        data: records,
        meta: {
          total:    records.length,
          page:     Math.floor((query.offset ?? 0) / (query.limit ?? 100)) + 1,
          pageSize: query.limit ?? 100,
        },
      };
      res.status(200).json(body);
    } catch (err) {
      logger.error('[AcknowledgmentRoutes] Error listing acknowledgments', {
        businessId,
        tenantId: tenant.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });

      const body: ApiResponse = {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch acknowledgments.' },
      };
      res.status(500).json(body);
    }
  });

  // ── GET /api/businesses/:id/acknowledgments/:type/latest ──
  router.get('/:type/latest', async (req: Request, res: Response): Promise<void> => {
    const businessId = req.params['id'];
    const tenant = req.tenant;

    if (!businessId || !tenant) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Business ID and auth context are required.' },
      };
      res.status(400).json(body);
      return;
    }

    let params;
    try {
      params = AcknowledgmentTypeParamSchema.parse({ type: req.params['type'] });
    } catch (err) {
      if (err instanceof ZodError) {
        const body: ApiResponse = {
          success: false,
          error: {
            code:    'VALIDATION_ERROR',
            message: `Invalid acknowledgment type. Must be one of: product_reality, fee_schedule, personal_guarantee, cash_advance_risk.`,
            details: (err as ZodError).flatten(),
          },
        };
        res.status(422).json(body);
        return;
      }
      throw err;
    }

    try {
      const status = await svc.getStatus(businessId, params.type);

      const body: ApiResponse<typeof status> = { success: true, data: status };
      res.status(200).json(body);
    } catch (err) {
      logger.error('[AcknowledgmentRoutes] Error fetching acknowledgment status', {
        businessId,
        type:     req.params['type'],
        tenantId: tenant.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });

      const body: ApiResponse = {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch acknowledgment status.' },
      };
      res.status(500).json(body);
    }
  });

  return router;
}

// Default export — pre-wired with real service
export default createAcknowledgmentRouter();
