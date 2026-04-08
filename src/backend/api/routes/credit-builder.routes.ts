// ============================================================
// CapitalForge — Credit Builder Routes
//
// Endpoints:
//   GET  /api/credit-builder/:clientId/scores          — current bureau scores
//   GET  /api/credit-builder/:clientId/score-history    — 6-month score history
//   GET  /api/credit-builder/:clientId/tradelines       — tradeline list
//   POST /api/credit-builder/:clientId/tradelines       — add tradeline
//   POST /api/credit-builder/:clientId/tradeline-disputes — file dispute
// ============================================================

import { Router, type Request, type Response } from 'express';
import logger from '../../config/logger.js';

export const creditBuilderRouter = Router({ mergeParams: true });

/** Safely extract a single string param (Express 5 params may be string | string[]). */
function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0]! : (val ?? '');
}

// ── Mock data ────────────────────────────────────────────────

const MOCK_SCORES = {
  paydex:      { bureau: 'D&B',        scoreName: 'PAYDEX',      score: 72, range: '0-100',  rating: 'Good' },
  intelliscore: { bureau: 'Experian',   scoreName: 'Intelliscore', score: 54, range: '1-100',  rating: 'Medium' },
  sbss:        { bureau: 'FICO',        scoreName: 'SBSS',        score: 148, range: '0-300', rating: 'Fair' },
};

function generateScoreHistory(clientId: string) {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const month = new Date(now);
    month.setMonth(month.getMonth() - (5 - i));
    return {
      month: month.toISOString().slice(0, 7),
      paydex:      60 + i * 2 + Math.round(Math.random() * 2),
      intelliscore: 40 + i * 3 + Math.round(Math.random() * 2),
      sbss:        120 + i * 5 + Math.round(Math.random() * 3),
    };
  });
}

const MOCK_TRADELINES = [
  { id: 'tl-1', vendor: 'Uline',    creditLimit: 5000,  balance: 1200, status: 'open', reportsTo: ['D&B', 'Experian'], openedDate: '2025-06-15' },
  { id: 'tl-2', vendor: 'Quill',    creditLimit: 3000,  balance: 800,  status: 'open', reportsTo: ['D&B'],            openedDate: '2025-08-01' },
  { id: 'tl-3', vendor: 'Grainger', creditLimit: 10000, balance: 2500, status: 'open', reportsTo: ['D&B', 'Experian'], openedDate: '2025-10-20' },
];

// In-memory stores for demo
const addedTradelines: Record<string, typeof MOCK_TRADELINES> = {};
const disputes: Record<string, Array<{ id: string; tradelineId: string; reason: string; status: string; filedAt: string }>> = {};

// ── GET /scores ──────────────────────────────────────────────

creditBuilderRouter.get(
  '/:clientId/scores',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    logger.debug('GET credit-builder scores', { clientId });

    res.status(200).json({
      success: true,
      data: {
        clientId,
        asOf: new Date().toISOString(),
        scores: MOCK_SCORES,
      },
    });
  },
);

// ── GET /score-history ───────────────────────────────────────

creditBuilderRouter.get(
  '/:clientId/score-history',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    logger.debug('GET credit-builder score-history', { clientId });

    res.status(200).json({
      success: true,
      data: {
        clientId,
        months: generateScoreHistory(clientId),
      },
    });
  },
);

// ── GET /tradelines ──────────────────────────────────────────

creditBuilderRouter.get(
  '/:clientId/tradelines',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    logger.debug('GET credit-builder tradelines', { clientId });

    const extra = addedTradelines[clientId] ?? [];

    res.status(200).json({
      success: true,
      data: {
        clientId,
        tradelines: [...MOCK_TRADELINES, ...extra],
        total: MOCK_TRADELINES.length + extra.length,
      },
    });
  },
);

// ── POST /tradelines ─────────────────────────────────────────

creditBuilderRouter.post(
  '/:clientId/tradelines',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    const { vendor, creditLimit, reportsTo } = req.body as Record<string, unknown>;

    if (!vendor || typeof vendor !== 'string') {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'vendor (string) is required.' },
      });
      return;
    }

    const tradeline = {
      id: `tl-${Date.now()}`,
      vendor,
      creditLimit: typeof creditLimit === 'number' ? creditLimit : 0,
      balance: 0,
      status: 'open' as const,
      reportsTo: Array.isArray(reportsTo) ? reportsTo as string[] : ['D&B'],
      openedDate: new Date().toISOString().slice(0, 10),
    };

    if (!addedTradelines[clientId]) addedTradelines[clientId] = [];
    addedTradelines[clientId]!.push(tradeline);

    logger.info('Credit-builder tradeline added', { clientId, tradeline: tradeline.id });

    res.status(201).json({
      success: true,
      data: tradeline,
    });
  },
);

// ── POST /tradeline-disputes ─────────────────────────────────

creditBuilderRouter.post(
  '/:clientId/tradeline-disputes',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = param(req, 'clientId');
    const { tradelineId, reason } = req.body as Record<string, unknown>;

    if (!tradelineId || typeof tradelineId !== 'string') {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'tradelineId (string) is required.' },
      });
      return;
    }

    if (!reason || typeof reason !== 'string') {
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'reason (string) is required.' },
      });
      return;
    }

    const dispute = {
      id: `disp-${Date.now()}`,
      tradelineId,
      reason,
      status: 'pending',
      filedAt: new Date().toISOString(),
    };

    if (!disputes[clientId]) disputes[clientId] = [];
    disputes[clientId]!.push(dispute);

    logger.info('Tradeline dispute filed', { clientId, disputeId: dispute.id });

    res.status(201).json({
      success: true,
      data: dispute,
    });
  },
);
