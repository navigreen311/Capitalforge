// ============================================================
// CapitalForge — Optimizer Action Routes
//
//   POST /api/optimizer/save-strategy   — append a plan to a client's history
//   POST /api/optimizer/create-round    — create a real FundingRound
//   GET  /api/optimizer/strategies/:businessId — the client's saved plans
//   GET  /api/optimizer/strategies/detail/:id  — one plan, whole
//
// Both write endpoints used to answer 200 and 201 with a fabricated payload
// while writing nothing. `save-strategy` returned `{ savedAt, clientId }` and
// the page reported "Strategy saved to <client> profile". `create-round`
// invented an id of the form `round-<client>-<n>-<timestamp>`, reported
// "Funding Round N created" and sent the user to /funding-rounds, where the
// round was not and never had been. Both then answered 501 honestly while
// there was nowhere to put the data.
//
// ── create-round calls the service the Funding Rounds page calls
//
// Not a second creation path. `FundingRoundService.createRound` already reads
// the current max round number, allocates the next one, and publishes
// ROUND_STARTED to the event ledger. A create written here would have had to
// re-implement all three, and the round-number allocation is the kind of rule
// that silently diverges — one path skipping a number, the other colliding on
// the `@@unique([businessId, roundNumber])` and surfacing as a 500.
// ============================================================

import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Request } from '../../types/http.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { PERMISSIONS } from '../../../shared/constants/index.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import { createSavedStrategyService } from '../../services/saved-strategy.service.js';
import { FundingRoundService } from '../../services/funding-round.service.js';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

export const optimizerActionsRouter = Router();

const strategies = createSavedStrategyService(sharedPrisma);
const fundingRounds = new FundingRoundService(sharedPrisma);

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } } satisfies ApiResponse);
}

/** The business, if it belongs to this tenant. */
async function ownedBusiness(businessId: string, tenantId: string) {
  return sharedPrisma.business.findFirst({ where: { id: businessId, tenantId } });
}

const SaveStrategySchema = z.object({
  clientId: z.string().min(1),
  /**
   * The plan as the optimizer returned it.
   *
   * Deliberately unvalidated beyond "is an object". Narrowing it here would
   * make the endpoint reject a plan whose shape moved on, and a plan is a
   * record of what was recommended — the schema that can read it is whatever
   * produced it, not whatever is current.
   */
  results: z.record(z.unknown()),
});

const CreateRoundSchema = z.object({
  clientId: z.string().min(1),
  targetCredit: z.number().nonnegative().nullable().optional(),
  targetCardCount: z.number().int().nonnegative().nullable().optional(),
  /** Set when the round is being created from a plan that was saved. */
  savedStrategyId: z.string().nullable().optional(),
});

// ── POST /api/optimizer/save-strategy ─────────────────────────

optimizerActionsRouter.post(
  '/save-strategy',
  tenantMiddleware,
  requirePermissions(PERMISSIONS.BUSINESS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId, userId } = req.tenant!;

    const parsed = SaveStrategySchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'VALIDATION_ERROR', 'A client and a plan are both required.');
      return;
    }

    if (!(await ownedBusiness(parsed.data.clientId, tenantId))) {
      fail(res, 404, 'NOT_FOUND', `Client ${parsed.data.clientId} was not found.`);
      return;
    }

    const saved = await strategies.save({
      tenantId,
      businessId: parsed.data.clientId,
      plan: parsed.data.results,
      createdBy: userId,
    });

    logger.info('[optimizer] Strategy saved', {
      strategyId: saved.id,
      businessId: parsed.data.clientId,
      hasAssumedDefaults: saved.hasAssumedDefaults,
    });

    res.status(201).json({
      success: true,
      data: {
        id: saved.id,
        savedAt: saved.createdAt,
        clientId: saved.businessId,
        // Returned so the page can say what it saved rather than only that it
        // saved. A plan resting on assumed constants is a different artefact
        // from one built on a credit pull, and the confirmation is the last
        // moment anyone is looking.
        hasAssumedDefaults: saved.hasAssumedDefaults,
        cardCount: saved.cardCount,
      },
    } satisfies ApiResponse);
  },
);

// ── GET /api/optimizer/strategies/:businessId ─────────────────

optimizerActionsRouter.get(
  '/strategies/:businessId',
  tenantMiddleware,
  requirePermissions(PERMISSIONS.BUSINESS_READ),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = req.tenant!;
    const businessId = req.params['businessId']!;

    if (!(await ownedBusiness(businessId, tenantId))) {
      fail(res, 404, 'NOT_FOUND', `Client ${businessId} was not found.`);
      return;
    }

    const rows = await strategies.listForBusiness(businessId, tenantId);
    res.json({ success: true, data: { strategies: rows } } satisfies ApiResponse);
  },
);

// ── GET /api/optimizer/strategies/detail/:id ──────────────────
//
// Under `/detail/` rather than `/strategies/:id` so it cannot collide with the
// list route above: both would match a single path segment, and which one won
// would depend on registration order rather than on intent.

optimizerActionsRouter.get(
  '/strategies/detail/:id',
  tenantMiddleware,
  requirePermissions(PERMISSIONS.BUSINESS_READ),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = req.tenant!;

    const strategy = await strategies.getById(req.params['id']!, tenantId);
    if (!strategy) {
      fail(res, 404, 'NOT_FOUND', 'That strategy is not on record for this tenant.');
      return;
    }

    res.json({ success: true, data: { strategy } } satisfies ApiResponse);
  },
);

// ── POST /api/optimizer/create-round ──────────────────────────

optimizerActionsRouter.post(
  '/create-round',
  tenantMiddleware,
  requirePermissions(PERMISSIONS.BUSINESS_WRITE),
  async (req: Request, res: Response): Promise<void> => {
    const { tenantId } = req.tenant!;

    const parsed = CreateRoundSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'VALIDATION_ERROR', 'A client is required to create a funding round.');
      return;
    }

    if (!(await ownedBusiness(parsed.data.clientId, tenantId))) {
      fail(res, 404, 'NOT_FOUND', `Client ${parsed.data.clientId} was not found.`);
      return;
    }

    // A strategy id that belongs to somebody else must not become a link. It
    // would read, on the round, as "planned from this" — pointing at a plan
    // this tenant cannot open.
    if (parsed.data.savedStrategyId) {
      const strategy = await strategies.getById(parsed.data.savedStrategyId, tenantId);
      if (!strategy || strategy.businessId !== parsed.data.clientId) {
        fail(
          res,
          400,
          'VALIDATION_ERROR',
          'That strategy does not belong to this client, so the round cannot be linked to it.',
        );
        return;
      }
    }

    const round = await fundingRounds.createRound({
      businessId: parsed.data.clientId,
      tenantId,
      // `?? undefined`, not `?? null`: the service's input treats absent as
      // "no target", and null is not the same word to it.
      targetCredit: parsed.data.targetCredit ?? undefined,
      targetCardCount: parsed.data.targetCardCount ?? undefined,
    });

    // Linked after creation rather than through the service signature, so the
    // one creation path stays the one creation path. Widening `createRound`
    // for an optimizer-only field would push optimizer concerns into every
    // caller of it.
    if (parsed.data.savedStrategyId) {
      await sharedPrisma.fundingRound.update({
        where: { id: round.id },
        data: { savedStrategyId: parsed.data.savedStrategyId },
      });
    }

    logger.info('[optimizer] Funding round created', {
      roundId: round.id,
      roundNumber: round.roundNumber,
      businessId: parsed.data.clientId,
      fromStrategy: parsed.data.savedStrategyId ?? null,
    });

    res.status(201).json({
      success: true,
      data: {
        // The real id, from the real row. The invented
        // `round-<client>-<n>-<timestamp>` is what made this endpoint's
        // success indistinguishable from its failure.
        id: round.id,
        roundNumber: round.roundNumber,
        businessId: round.businessId,
        status: round.status,
        savedStrategyId: parsed.data.savedStrategyId ?? null,
      },
    } satisfies ApiResponse);
  },
);
