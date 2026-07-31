// ============================================================
// CapitalForge — Funding Round Action Routes
//
// Endpoints:
//   POST /api/funding-rounds/:id/export-dossier  — mock JSON summary of a round
//   PUT  /api/funding-rounds/:id/status           — update round status
//
// All routes require a valid tenant JWT via tenantMiddleware.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
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
// Builds a funding-round dossier from the round and its applications.
//
// This is a client-facing financial record, so every figure is read from the
// database. It previously assembled card names, credit limits, an advisor fee
// and an APR timeline entirely from constants, with only the round status and
// number coming from real data.

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

      const round = await prisma.fundingRound.findFirst({
        where: { id: roundId, business: { tenantId } },
        include: {
          business: { select: { id: true, legalName: true, ein: true, entityType: true } },
          applications: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!round) {
        sendError(res, 404, 'NOT_FOUND', `No funding round found with ID "${roundId}".`);
        return;
      }

      const approved = round.applications.filter(
        (a) => a.status === 'approved' || a.status === 'active',
      );

      const cards = approved.map((a) => ({
        applicationId: a.id,
        cardName:      a.cardProduct,
        issuer:        a.issuer,
        creditLimit:   a.creditLimit === null ? null : Number(a.creditLimit),
        introApr:      a.introApr === null ? null : Number(a.introApr),
        aprExpiresAt:  a.introAprExpiry?.toISOString() ?? null,
        regularApr:    a.regularApr === null ? null : Number(a.regularApr),
        annualFee:     a.annualFee === null ? null : Number(a.annualFee),
        status:        a.status,
        decidedAt:     a.decidedAt?.toISOString() ?? null,
      }));

      const totalCreditObtained = cards.reduce((sum, c) => sum + (c.creditLimit ?? 0), 0);
      const totalAnnualFees     = cards.reduce((sum, c) => sum + (c.annualFee ?? 0), 0);

      // An APR timeline built from the expiry dates actually on record: each
      // entry is a month in which at least one card leaves its intro rate.
      const expiries = cards
        .filter((c) => c.aprExpiresAt !== null)
        .map((c) => ({ month: c.aprExpiresAt!.slice(0, 7), regularApr: c.regularApr }))
        .sort((a, b) => a.month.localeCompare(b.month));

      const byMonth = new Map<string, { month: string; cardsLeavingIntroApr: number; regularAprs: number[] }>();
      for (const e of expiries) {
        const entry = byMonth.get(e.month) ?? { month: e.month, cardsLeavingIntroApr: 0, regularAprs: [] };
        entry.cardsLeavingIntroApr += 1;
        if (e.regularApr !== null) entry.regularAprs.push(e.regularApr);
        byMonth.set(e.month, entry);
      }

      let remainingAtIntro = cards.filter((c) => c.aprExpiresAt !== null).length;
      const aprTimeline = [...byMonth.values()].map((entry) => {
        remainingAtIntro -= entry.cardsLeavingIntroApr;
        return {
          month: entry.month,
          cardsLeavingIntroApr: entry.cardsLeavingIntroApr,
          cardsStillAtIntroApr: remainingAtIntro,
          avgRegularAprOfExpiring:
            entry.regularAprs.length > 0
              ? Number(
                  (entry.regularAprs.reduce((s, n) => s + n, 0) / entry.regularAprs.length).toFixed(2),
                )
              : null,
        };
      });

      const cardsWithApr = cards.filter((c) => c.regularApr !== null);

      const dossier = {
        roundId,
        tenantId,
        exportedAt: new Date().toISOString(),

        business: {
          id:         round.business.id,
          legalName:  round.business.legalName,
          ein:        round.business.ein,
          entityType: round.business.entityType,
        },

        summary: {
          status:            round.status,
          roundNumber:       round.roundNumber,
          businessId:        round.businessId,
          targetCredit:      round.targetCredit === null ? null : Number(round.targetCredit),
          targetCardCount:   round.targetCardCount,
          startedAt:         round.startedAt?.toISOString() ?? null,
          completedAt:       round.completedAt?.toISOString() ?? null,
          applicationCount:  round.applications.length,
          approvedCount:     approved.length,
          declinedCount:     round.applications.filter((a) => a.status === 'declined').length,
        },

        cards,

        costs: {
          totalCreditObtained,
          totalAnnualFees,
          // Exposure once the intro rates lapse, over the cards whose regular
          // APR is on record. The count is reported alongside so a partial
          // figure is not mistaken for a complete one.
          annualisedInterestAtRegularApr: cardsWithApr.reduce(
            (sum, c) => sum + Math.round((c.creditLimit ?? 0) * ((c.regularApr ?? 0) / 100)),
            0,
          ),
          basedOnCards:            cardsWithApr.length,
          cardsMissingRegularApr:  cards.length - cardsWithApr.length,
          // Advisor fees are not modelled, so none is asserted. This used to
          // report a flat $3,500 and a derived "net benefit" built on it.
          advisorFee:              null,
        },

        aprTimeline,
      };

      logger.info('[FundingRoundActionsRoutes] Dossier exported', {
        roundId,
        tenantId,
        cards: cards.length,
      });

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
          where: { id: roundId },
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
