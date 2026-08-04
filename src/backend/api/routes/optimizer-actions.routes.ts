// ============================================================
// CapitalForge — Optimizer Action Routes
//
// Endpoints:
//   POST /api/optimizer/save-strategy   — 501, nothing stores a strategy
//   POST /api/optimizer/create-round    — 501, nothing creates the round
//
// Both of these used to answer 200 and 201 with a fabricated payload while
// writing nothing. `save-strategy` returned `{ savedAt, clientId }` and the
// page reported "Strategy saved to <client> profile". `create-round` invented
// an id of the form `round-<client>-<n>-<timestamp>`, reported "Funding Round
// N created" and sent the user to /funding-rounds, where the round was not
// and never had been.
//
// A funding round is a real record with money attached. Claiming one exists is
// worse than declining to make it, so both now refuse and say why. The work to
// make them real is in
// docs/backlog/saved-strategy-and-funding-round-persistence.md.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
export const optimizerActionsRouter = Router();

/** 501 with a reason the caller can render, matching the other refusals. */
function notImplemented(res: Response, message: string): void {
  res.status(501).json({
    success: false,
    error: { code: 'NOT_IMPLEMENTED', message },
  });
}

// ── POST /api/optimizer/save-strategy ─────────────────────────
optimizerActionsRouter.post(
  '/save-strategy',
  (_req: Request, res: Response): void => {
    notImplemented(
      res,
      'Saving an optimizer strategy is not built yet. No table stores a strategy, '
        + 'so nothing would be attached to this client and nothing could be read '
        + 'back later. The plan on screen is unaffected.',
    );
  },
);

// ── POST /api/optimizer/create-round ──────────────────────────
optimizerActionsRouter.post(
  '/create-round',
  (_req: Request, res: Response): void => {
    notImplemented(
      res,
      'Creating a funding round from the optimizer is not built yet. This endpoint '
        + 'never wrote a FundingRound record — it returned an invented id. Create '
        + 'the round from the Funding Rounds page instead.',
    );
  },
);
