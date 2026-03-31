// ============================================================
// CapitalForge — Application Routes
//
// Endpoints:
//   POST   /api/businesses/:id/applications       — create
//   GET    /api/businesses/:id/applications       — list (filters)
//   GET    /api/applications/:id                  — get single
//   PUT    /api/applications/:id/status           — transition status
//
// Auth: every route requires a valid tenant JWT (tenantMiddleware).
// Permissions:
//   - CREATE:    application:submit permission
//   - TRANSITION to submitted: application:approve (checker role)
//   - APPROVE/DECLINE: application:approve
//   - READ: any authenticated user (scoped by advisor assignment)
// ============================================================

import { Router, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { PrismaClient } from '@prisma/client';

import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import {
  CreateApplicationSchema,
  TransitionStatusSchema,
  ListApplicationsSchema,
} from '@shared/validators/application.validators.js';
import {
  ApplicationPipelineService,
  ApplicationWorkflowError,
} from '../../services/application-pipeline.service.js';
import { PERMISSIONS, ROLES } from '@shared/constants/index.js';
import type { ApiResponse, TenantContext } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router setup ──────────────────────────────────────────────

const router = Router();

// Shared Prisma client (one per process — connections are pooled)
const prisma = new PrismaClient();
const pipelineService = new ApplicationPipelineService(prisma);

// ── Helpers ───────────────────────────────────────────────────

function getTenantContext(req: Request): TenantContext {
  if (!req.tenant) {
    throw new Error('Tenant context not attached — ensure tenantMiddleware runs first.');
  }
  return req.tenant;
}

function hasPermission(ctx: TenantContext, permission: string): boolean {
  return (
    ctx.role === ROLES.SUPER_ADMIN ||
    ctx.role === ROLES.TENANT_ADMIN ||
    ctx.permissions.includes(permission)
  );
}

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiResponse = {
    success: false,
    error: { code, message, details },
  };
  res.status(status).json(body);
}

function handleServiceError(res: Response, err: unknown, log: ReturnType<typeof logger.child>): void {
  if (err instanceof ApplicationWorkflowError) {
    const httpStatus =
      err.code === 'APPLICATION_NOT_FOUND' || err.code === 'BUSINESS_NOT_FOUND'
        ? 404
        : err.code === 'ACCESS_DENIED'
          ? 403
          : err.code === 'INVALID_TRANSITION' || err.code === 'GATE_CHECK_FAILED'
            ? 422
            : 400;
    sendError(res, httpStatus, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', err.errors);
    return;
  }

  log.error('Unexpected error in application route', {
    error: err instanceof Error ? err.message : String(err),
  });
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}

// ── POST /api/businesses/:id/applications ─────────────────────

router.post(
  '/businesses/:id/applications',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const log = logger.child({
      route: 'POST /businesses/:id/applications',
      requestId: req.requestId,
    });

    try {
      const ctx = getTenantContext(req);

      if (!hasPermission(ctx, PERMISSIONS.APPLICATION_SUBMIT)) {
        sendError(res, 403, 'FORBIDDEN', 'You do not have permission to create applications.');
        return;
      }

      const body = CreateApplicationSchema.parse(req.body);
      const application = await pipelineService.createApplication(
        req.params['id'] as string,
        body,
        ctx,
      );

      const response: ApiResponse<typeof application> = {
        success: true,
        data: application,
      };
      res.status(201).json(response);
    } catch (err) {
      handleServiceError(res, err, log);
    }
  },
);

// ── GET /api/businesses/:id/applications ──────────────────────

router.get(
  '/businesses/:id/applications',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const log = logger.child({
      route: 'GET /businesses/:id/applications',
      requestId: req.requestId,
    });

    try {
      const ctx = getTenantContext(req);

      const params = ListApplicationsSchema.parse(req.query);
      const result = await pipelineService.listApplications(
        req.params['id'] as string,
        params,
        ctx,
      );

      const response: ApiResponse<(typeof result)['items']> = {
        success: true,
        data: result.items,
        meta: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
        },
      };
      res.status(200).json(response);
    } catch (err) {
      handleServiceError(res, err, log);
    }
  },
);

// ── GET /api/applications/:id ─────────────────────────────────

router.get(
  '/applications/:id',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const log = logger.child({
      route: 'GET /applications/:id',
      requestId: req.requestId,
    });

    try {
      const ctx = getTenantContext(req);

      const application = await pipelineService.getApplication(
        req.params['id'] as string,
        ctx,
      );

      const response: ApiResponse<typeof application> = {
        success: true,
        data: application,
      };
      res.status(200).json(response);
    } catch (err) {
      handleServiceError(res, err, log);
    }
  },
);

// ── PUT /api/applications/:id/status ──────────────────────────

router.put(
  '/applications/:id/status',
  tenantMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const log = logger.child({
      route: 'PUT /applications/:id/status',
      requestId: req.requestId,
    });

    try {
      const ctx = getTenantContext(req);

      const body = TransitionStatusSchema.parse(req.body);

      // Approve / decline requires elevated permission
      const requiresApprovePermission =
        body.status === 'submitted' ||
        body.status === 'approved' ||
        body.status === 'declined';

      if (requiresApprovePermission && !hasPermission(ctx, PERMISSIONS.APPLICATION_APPROVE)) {
        sendError(
          res,
          403,
          'FORBIDDEN',
          'You do not have permission to approve, submit, or decline applications.',
        );
        return;
      }

      const application = await pipelineService.transitionStatus(
        req.params['id'] as string,
        body,
        ctx,
      );

      const response: ApiResponse<typeof application> = {
        success: true,
        data: application,
      };
      res.status(200).json(response);
    } catch (err) {
      handleServiceError(res, err, log);
    }
  },
);

export default router;
