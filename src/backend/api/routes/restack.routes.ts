// ============================================================
// CapitalForge — Re-Stack Eligibility Routes
//
// Endpoints:
//   GET /api/restack/eligible           — list all restack-eligible businesses
//   GET /api/restack/check/:businessId  — check single business eligibility
//
// All routes require a valid tenant JWT.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import {
  scanAllForRestack,
  checkRestackEligibility,
  RestackBusinessNotFoundError,
} from '../../services/restack-trigger.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ──────────────────────────────────────────────────

export const restackRouter = Router();

restackRouter.use(tenantMiddleware);

// ── GET /api/restack/eligible ───────────────────────────────
// List all restack-eligible businesses for the current tenant.

restackRouter.get(
  '/eligible',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Tenant context is required.' },
      };
      res.status(400).json(body);
      return;
    }

    try {
      const scan = await scanAllForRestack(tenantId);

      const body: ApiResponse = {
        success: true,
        data: {
          eligible: scan.results,
          total: scan.results.length,
          // The denominator. `total: eligible.length` alone reads as "three
          // out of everybody"; the scan only evaluates clients whose readiness
          // has been assessed, and nothing said how many had not.
          activeCount: scan.activeCount,
          evaluatedCount: scan.candidateCount,
          notAssessedCount: scan.notAssessedCount,
          scannedAt: new Date().toISOString(),
        },
      };
      res.status(200).json(body);
    } catch (err) {
      logger.error('[RestackRoutes] Failed to scan for restack eligibility', {
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: { code: 'RESTACK_SCAN_FAILED', message: 'Failed to scan for restack eligibility.' },
      };
      res.status(500).json(body);
    }
  },
);

// ── GET /api/restack/check/:businessId ──────────────────────
// Check a single business for restack eligibility.

restackRouter.get(
  '/check/:businessId',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    const businessId = req.params['businessId'] as string;

    if (!tenantId || !businessId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Tenant context and business ID are required.' },
      };
      res.status(400).json(body);
      return;
    }

    try {
      const result = await checkRestackEligibility(businessId, tenantId);

      const body: ApiResponse = { success: true, data: result };
      res.status(200).json(body);
    } catch (err) {
      // 404, not a 200 carrying `eligible: false`.
      //
      // The service used to answer for a business it could not find —
      // businessName 'Unknown', reasons ['Business not found'],
      // recommendedRoundNumber 1 — and this route returned it as a successful
      // check. A caller could not tell "checked and not eligible" from "no
      // such business", and got a round recommendation for neither.
      if (err instanceof RestackBusinessNotFoundError) {
        const body: ApiResponse = {
          success: false,
          error: {
            code: 'BUSINESS_NOT_FOUND',
            message: 'No such business in this tenant, so no eligibility was determined.',
          },
        };
        res.status(404).json(body);
        return;
      }
      logger.error('[RestackRoutes] Failed to check restack eligibility', {
        businessId,
        error: err instanceof Error ? err.message : String(err),
      });
      const body: ApiResponse = {
        success: false,
        error: { code: 'RESTACK_CHECK_FAILED', message: 'Failed to check restack eligibility.' },
      };
      res.status(500).json(body);
    }
  },
);
