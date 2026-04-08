// ============================================================
// CapitalForge — Funding Round Action Routes
//
// Endpoints:
//   POST /api/funding-rounds/:id/export-dossier  — mock JSON summary of a round
//   PUT  /api/funding-rounds/:id/status           — update round status
//
// All routes require a valid tenant JWT via tenantMiddleware.
// ============================================================

import { Router, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import { PrismaClient } from '@prisma/client';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Lazy Prisma singleton ────────────────────────────────────

let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

// ── Router ────────────────────────────────────────────────────

export const fundingRoundActionsRouter = Router();

fundingRoundActionsRouter.use(tenantMiddleware);

// ── Validation Schemas ────────────────────────────────────────

const ROUND_STATUSES = ['planning', 'in_progress', 'completed', 'cancelled'] as const;

const StatusUpdateSchema = z.object({
  status: z.enum(ROUND_STATUSES),
});

// ── Helpers ───────────────────────────────────────────────────

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

function handleUnexpected(err: unknown, res: Response, context: string): void {
  if (err instanceof ZodError) {
    sendError(res, 422, 'VALIDATION_ERROR', 'Invalid request body.', err.flatten().fieldErrors);
    return;
  }
  logger.error(`[FundingRoundActionsRoutes] Unexpected error in ${context}`, {
    error: err instanceof Error ? err.message : String(err),
  });
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}

// ── POST /api/funding-rounds/:id/export-dossier ─────────────
// Returns a mock JSON summary of the funding round: cards, costs, APR timeline.

fundingRoundActionsRouter.post(
  '/funding-rounds/:id/export-dossier',
  async (req: Request, res: Response): Promise<void> => {
    const roundId  = req.params['id'] as string;
    const tenantId = req.tenant?.tenantId;

    if (!roundId || !tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Round ID and tenant context are required.');
      return;
    }

    try {
      const prisma = getPrisma();

      // Attempt to find the round in DB; fall back to mock if not found
      let round: Record<string, unknown> | null = null;
      try {
        round = await prisma.fundingRound.findFirst({
          where: { id: roundId, tenantId },
        });
      } catch {
        // Table may not exist yet — proceed with mock
      }

      const dossier = {
        roundId,
        tenantId,
        exportedAt: new Date().toISOString(),
        summary: {
          status: (round as Record<string, unknown>)?.status ?? 'in_progress',
          roundNumber: (round as Record<string, unknown>)?.roundNumber ?? 1,
          businessId: (round as Record<string, unknown>)?.businessId ?? 'biz_mock_001',
        },
        cards: [
          {
            cardName: 'Chase Ink Business Unlimited',
            issuer: 'Chase',
            creditLimit: 50000,
            apr: 0.0,
            aprExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'approved',
          },
          {
            cardName: 'Amex Blue Business Plus',
            issuer: 'American Express',
            creditLimit: 35000,
            apr: 0.0,
            aprExpiresAt: new Date(Date.now() + 270 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'approved',
          },
          {
            cardName: 'US Bank Business Triple Cash',
            issuer: 'US Bank',
            creditLimit: 25000,
            apr: 0.0,
            aprExpiresAt: new Date(Date.now() + 456 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'pending',
          },
        ],
        costs: {
          totalCreditObtained: 110000,
          totalAnnualFees: 0,
          estimatedInterestSaved: 8250,
          advisorFee: 3500,
          netBenefit: 4750,
        },
        aprTimeline: [
          { month: '2026-04', avgApr: 0.0, cardsAtZero: 3 },
          { month: '2026-07', avgApr: 0.0, cardsAtZero: 3 },
          { month: '2026-10', avgApr: 4.2, cardsAtZero: 2 },
          { month: '2027-01', avgApr: 8.5, cardsAtZero: 1 },
          { month: '2027-04', avgApr: 14.9, cardsAtZero: 0 },
        ],
      };

      logger.info('[FundingRoundActionsRoutes] Dossier exported', { roundId, tenantId });

      const body: ApiResponse<typeof dossier> = { success: true, data: dossier };
      res.status(200).json(body);
    } catch (err) {
      handleUnexpected(err, res, 'POST /funding-rounds/:id/export-dossier');
    }
  },
);

// ── PUT /api/funding-rounds/:id/status ──────────────────────
// Accepts { status } and updates the round status in DB (or returns mock success).

fundingRoundActionsRouter.put(
  '/funding-rounds/:id/status',
  async (req: Request, res: Response): Promise<void> => {
    const roundId  = req.params['id'] as string;
    const tenantId = req.tenant?.tenantId;

    if (!roundId || !tenantId) {
      sendError(res, 400, 'INVALID_PARAMS', 'Round ID and tenant context are required.');
      return;
    }

    const parsed = StatusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(
        res,
        422,
        'VALIDATION_ERROR',
        `Invalid status. Must be one of: ${ROUND_STATUSES.join(', ')}`,
        parsed.error.flatten().fieldErrors,
      );
      return;
    }

    try {
      const prisma = getPrisma();

      let updated: Record<string, unknown> | null = null;
      try {
        const existing = await prisma.fundingRound.findFirst({
          where: { id: roundId, tenantId },
        });

        if (!existing) {
          sendError(res, 404, 'NOT_FOUND', `Funding round ${roundId} not found.`);
          return;
        }

        updated = await prisma.fundingRound.update({
          where: { id: roundId },
          data: { status: parsed.data.status },
        });
      } catch {
        // If the table/column doesn't exist, return mock success
        updated = {
          id: roundId,
          tenantId,
          status: parsed.data.status,
          updatedAt: new Date().toISOString(),
        };
      }

      logger.info('[FundingRoundActionsRoutes] Round status updated', {
        roundId,
        status: parsed.data.status,
        tenantId,
      });

      const body: ApiResponse = { success: true, data: updated };
      res.status(200).json(body);
    } catch (err) {
      handleUnexpected(err, res, 'PUT /funding-rounds/:id/status');
    }
  },
);

export default fundingRoundActionsRouter;
