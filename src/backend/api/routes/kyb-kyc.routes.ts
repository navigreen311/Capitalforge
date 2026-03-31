// ============================================================
// CapitalForge — KYB / KYC API Routes
//
// Endpoints:
//   POST /api/businesses/:id/verify/kyb
//     — Trigger full KYB entity verification
//
//   POST /api/businesses/:id/verify/kyc/:ownerId
//     — Trigger KYC for a specific beneficial owner
//
//   GET  /api/businesses/:id/verification-status
//     — Retrieve current KYB + KYC statuses and application-readiness flag
//
// Auth & access: all routes require a valid JWT with
// BUSINESS_WRITE permission (for verify mutations) or
// BUSINESS_READ (for the status query).
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  KybVerificationRequestSchema,
  KycVerificationRequestSchema,
  VerificationStatusQuerySchema,
} from '../../../shared/validators/kyb-kyc.validators.js';
import {
  verifyKyb,
  verifyKyc,
  getVerificationStatus,
  KybKycError,
} from '../../services/kyb-kyc.service.js';
import type { ApiResponse } from '../../../shared/types/index.js';

export const kybKycRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolves the tenant ID from the authenticated request context.
 * In production this is injected by the auth middleware into res.locals.
 * We fall back to a header for development / testing convenience.
 */
function resolveTenantId(req: Request, res: Response): string | null {
  // Auth middleware should inject res.locals.tenantId
  if (res.locals.tenantId) return res.locals.tenantId as string;
  // Fallback: X-Tenant-Id header (development only)
  const header = req.headers['x-tenant-id'];
  return typeof header === 'string' ? header : null;
}

function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const body: ApiResponse<T> = { success: true, data };
  res.status(statusCode).json(body);
}

function sendError(res: Response, code: string, message: string, statusCode = 400, details?: unknown): void {
  const body: ApiResponse = { success: false, error: { code, message, details } };
  res.status(statusCode).json(body);
}

// ── Error handler (local to this router) ─────────────────────────────────────

function handleRouteError(err: unknown, res: Response): void {
  if (err instanceof KybKycError) {
    sendError(res, err.code, err.message, err.statusCode);
    return;
  }

  if (err instanceof ZodError) {
    sendError(res, 'VALIDATION_ERROR', 'Request validation failed', 400, err.flatten());
    return;
  }

  console.error('[KYB/KYC Routes] Unhandled error:', err);
  sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred', 500);
}

// ── POST /api/businesses/:id/verify/kyb ──────────────────────────────────────

/**
 * @route   POST /api/businesses/:id/verify/kyb
 * @desc    Run full KYB entity verification for the given business.
 *          Performs: SoS check → OFAC screen → status update → event publish.
 * @access  Requires BUSINESS_WRITE permission
 *
 * @body    KybVerificationRequest
 * @returns KybVerificationResult wrapped in ApiResponse
 *
 * Status codes:
 *   200 — KYB verified (or placed in_review / failed)
 *   400 — Validation error
 *   404 — Business not found
 *   422 — Business logic error (e.g. duplicate verification)
 *   500 — Internal error
 */
kybKycRouter.post(
  '/:id/verify/kyb',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const tenantId = resolveTenantId(req, res);
      if (!tenantId) {
        sendError(res, 'MISSING_TENANT', 'Tenant context is required', 401);
        return;
      }

      const businessId = req.params.id;
      if (!businessId) {
        sendError(res, 'MISSING_BUSINESS_ID', 'Business ID is required', 400);
        return;
      }

      // Validate & parse request body
      const parsed = KybVerificationRequestSchema.parse(req.body);

      const result = await verifyKyb(businessId, tenantId, parsed);

      // Map internal status to HTTP status code
      const httpStatus =
        result.status === 'verified' ? 200
          : result.status === 'in_review' ? 202
          : result.status === 'sanctions_hold' ? 451  // RFC 7725 — legal obligation
          : 422;

      sendSuccess(res, result, httpStatus);
    } catch (err) {
      handleRouteError(err, res);
    }
  },
);

// ── POST /api/businesses/:id/verify/kyc/:ownerId ─────────────────────────────

/**
 * @route   POST /api/businesses/:id/verify/kyc/:ownerId
 * @desc    Run KYC verification for a specific business owner.
 *          KYB must be verified first. Performs OFAC screen + fraud heuristics.
 *          After all beneficial owners (>= 25%) pass, fires KYC_VERIFIED event.
 * @access  Requires BUSINESS_WRITE permission
 *
 * @body    KycVerificationRequest
 * @returns KycVerificationResult wrapped in ApiResponse
 *
 * Status codes:
 *   200 — KYC verified (or placed in_review / fraud_review)
 *   400 — Validation error
 *   404 — Business or owner not found
 *   422 — KYB not yet verified, or other business logic error
 *   451 — OFAC hard match (no override possible)
 *   500 — Internal error
 */
kybKycRouter.post(
  '/:id/verify/kyc/:ownerId',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const tenantId = resolveTenantId(req, res);
      if (!tenantId) {
        sendError(res, 'MISSING_TENANT', 'Tenant context is required', 401);
        return;
      }

      const { id: businessId, ownerId } = req.params;
      if (!businessId || !ownerId) {
        sendError(res, 'MISSING_PARAMS', 'Business ID and Owner ID are required', 400);
        return;
      }

      // Validate & parse request body
      const parsed = KycVerificationRequestSchema.parse(req.body);

      const result = await verifyKyc(businessId, ownerId, tenantId, parsed);

      const httpStatus =
        result.status === 'verified' ? 200
          : result.status === 'in_review' ? 202
          : result.status === 'fraud_review' ? 202
          : result.status === 'sanctions_hold' ? 451
          : 422;

      sendSuccess(res, result, httpStatus);
    } catch (err) {
      handleRouteError(err, res);
    }
  },
);

// ── GET /api/businesses/:id/verification-status ──────────────────────────────

/**
 * @route   GET /api/businesses/:id/verification-status
 * @desc    Returns the current KYB and all-owner KYC verification status,
 *          plus the `readyForApplications` flag used by the application
 *          submission guard.
 * @access  Requires BUSINESS_READ permission
 *
 * @query   includeOwners (boolean, default true)
 * @returns VerificationStatusResult wrapped in ApiResponse
 *
 * Status codes:
 *   200 — Status retrieved
 *   404 — Business not found
 *   500 — Internal error
 */
kybKycRouter.get(
  '/:id/verification-status',
  async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const tenantId = resolveTenantId(req, res);
      if (!tenantId) {
        sendError(res, 'MISSING_TENANT', 'Tenant context is required', 401);
        return;
      }

      const businessId = req.params.id;
      if (!businessId) {
        sendError(res, 'MISSING_BUSINESS_ID', 'Business ID is required', 400);
        return;
      }

      // Parse & coerce query params
      const query = VerificationStatusQuerySchema.parse(req.query);

      const result = await getVerificationStatus(businessId, tenantId, query.includeOwners);

      sendSuccess(res, result, 200);
    } catch (err) {
      handleRouteError(err, res);
    }
  },
);
