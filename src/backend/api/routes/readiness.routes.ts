// ============================================================
// CapitalForge — Readiness Score Routes
//
// Endpoints:
//   GET /api/readiness/:businessId
//     Calculate and return the readiness score for a business.
//
// All routes require a valid JWT.
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import { calculateReadinessScore, type ReadinessClient } from '../../services/readiness-score.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Router ────────────────────────────────────────────────────

export const readinessRouter = Router();

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

// ── GET /api/readiness/:businessId ──────────────────────────

readinessRouter.get(
  '/:businessId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { businessId } = req.params;

    try {
      // ASSUMPTION: In a full implementation this would fetch business data
      // from Prisma. For now we accept the client data via query params or
      // return a score based on whatever data is available.
      // This stub constructs a ReadinessClient from the business record.

      // For the MVP route, we accept a JSON body via GET (or query params).
      // In production, this would pull from the DB.
      const client: ReadinessClient = {
        ein:                       (req.query['ein'] as string) || null,
        entityType:                (req.query['entityType'] as string) || null,
        annualRevenue:             req.query['annualRevenue'] ? Number(req.query['annualRevenue']) : null,
        industry:                  (req.query['industry'] as string) || null,
        owners:                    req.query['hasOwners'] === 'true' ? [{}] : null,
        allConsentsGranted:        req.query['allConsentsGranted'] === 'true',
        allAcknowledgmentsSigned:  req.query['allAcknowledgmentsSigned'] === 'true',
        kybVerified:               req.query['kybVerified'] === 'true',
        compliancePassed:          req.query['compliancePassed'] === 'true',
        creditReport:              req.query['ficoScore'] ? {
          pulledAt:    req.query['creditPulledAt'] as string || null,
          ficoScore:   Number(req.query['ficoScore']),
          utilization: req.query['utilization'] ? Number(req.query['utilization']) : null,
        } : null,
        previousRounds:            req.query['previousRounds'] ? Number(req.query['previousRounds']) : null,
        approvalRate:              req.query['approvalRate'] ? Number(req.query['approvalRate']) : null,
        hasActiveDeclines:         req.query['hasActiveDeclines'] === 'true',
      };

      const result = calculateReadinessScore(client);

      logger.info('[ReadinessRoutes] Score calculated', {
        businessId,
        score: result.score,
        grade: result.grade,
      });

      res.status(200).json({
        success: true,
        data: {
          businessId,
          ...result,
        },
      } satisfies ApiResponse);
    } catch (err) {
      logger.error('[ReadinessRoutes] Unexpected error', { err, businessId });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      } satisfies ApiResponse);
    }
  },
);

export default readinessRouter;
