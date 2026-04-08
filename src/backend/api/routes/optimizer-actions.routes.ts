// ============================================================
// CapitalForge — Optimizer Action Routes
//
// Endpoints:
//   POST /api/optimizer/save-strategy
//     Save an optimizer strategy to a client profile.
//     Body: { clientId, results }
//     Returns: { success: true }
//
//   POST /api/optimizer/create-round
//     Create a funding round from optimizer results.
//     Body: { clientId, roundNumber, targetCredit, cardsPlanned }
//     Returns: { roundId }
//
// All routes are mock implementations that return success.
// ============================================================

import { Router, type Request, type Response } from 'express';

export const optimizerActionsRouter = Router();

// ── POST /api/optimizer/save-strategy ─────────────────────────
optimizerActionsRouter.post(
  '/save-strategy',
  (req: Request, res: Response): void => {
    const { clientId, results } = req.body ?? {};

    if (!clientId || typeof clientId !== 'string') {
      res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'clientId is required and must be a string.',
        },
      });
      return;
    }

    if (!results || typeof results !== 'object') {
      res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'results object is required.',
        },
      });
      return;
    }

    // Mock: In production, persist to DB
    res.status(200).json({
      success: true,
      data: {
        savedAt: new Date().toISOString(),
        clientId,
      },
    });
  },
);

// ── POST /api/optimizer/create-round ──────────────────────────
optimizerActionsRouter.post(
  '/create-round',
  (req: Request, res: Response): void => {
    const { clientId, roundNumber, targetCredit, cardsPlanned } = req.body ?? {};

    if (!clientId || typeof clientId !== 'string') {
      res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'clientId is required and must be a string.',
        },
      });
      return;
    }

    if (typeof roundNumber !== 'number' || roundNumber < 1) {
      res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'roundNumber must be a positive integer.',
        },
      });
      return;
    }

    // Mock: generate a round ID
    const roundId = `round-${clientId.slice(0, 8)}-${roundNumber}-${Date.now()}`;

    res.status(201).json({
      success: true,
      data: {
        roundId,
        clientId,
        roundNumber,
        targetCredit: targetCredit ?? 0,
        cardsPlanned: cardsPlanned ?? 0,
        createdAt: new Date().toISOString(),
      },
    });
  },
);
