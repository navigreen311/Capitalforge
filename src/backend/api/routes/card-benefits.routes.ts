// ============================================================
// CapitalForge — Card Benefits API Routes
//
// GET  /api/card-benefits/:clientId          — mock card benefits summary
// POST /api/card-benefits/:cardId/benefits/:benefitId/mark-used — mark benefit used
// POST /api/card-benefits/:clientId/export   — export mock report text
// ============================================================

import { Router, type Request, type Response } from 'express';
import type { ApiResponse } from '../../../shared/types/index.js';
import logger from '../../config/logger.js';

export const cardBenefitsApiRouter = Router({ mergeParams: true });

// ── In-memory state for mark-used tracking ───────────────────

const usedBenefits: Record<string, { usedAt: string; usedBy: string }> = {};

// ── Mock data factory ────────────────────────────────────────

function buildBenefitsData(clientId: string) {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    clientId,
    summary: {
      totalBenefits: 12,
      utilized: 7,
      expiringSoon: 3,
      estimatedUnusedValue: 2450.0,
    },
    expiring: [
      {
        benefitId: 'ben-001',
        cardId: 'card-amex-plat',
        name: 'Airline Fee Credit',
        value: 200.0,
        expiresAt: in30Days.toISOString(),
        daysRemaining: 30,
      },
      {
        benefitId: 'ben-002',
        cardId: 'card-chase-sapphire',
        name: 'DoorDash Credit',
        value: 50.0,
        expiresAt: in30Days.toISOString(),
        daysRemaining: 30,
      },
      {
        benefitId: 'ben-003',
        cardId: 'card-amex-gold',
        name: 'Dining Credit',
        value: 120.0,
        expiresAt: in30Days.toISOString(),
        daysRemaining: 30,
      },
    ],
    cards: [
      {
        cardId: 'card-amex-plat',
        cardName: 'Amex Business Platinum',
        annualFee: 695,
        benefits: [
          { benefitId: 'ben-001', name: 'Airline Fee Credit', value: 200.0, utilized: false },
          { benefitId: 'ben-004', name: 'Dell Technologies Credit', value: 200.0, utilized: true },
          { benefitId: 'ben-005', name: 'Clear Plus Credit', value: 199.0, utilized: true },
          { benefitId: 'ben-006', name: 'Centurion Lounge Access', value: 0, utilized: true },
        ],
      },
      {
        cardId: 'card-chase-sapphire',
        cardName: 'Chase Sapphire Reserve',
        annualFee: 550,
        benefits: [
          { benefitId: 'ben-002', name: 'DoorDash Credit', value: 50.0, utilized: false },
          { benefitId: 'ben-007', name: 'Travel Credit', value: 300.0, utilized: true },
          { benefitId: 'ben-008', name: 'Global Entry/TSA PreCheck', value: 100.0, utilized: true },
        ],
      },
      {
        cardId: 'card-amex-gold',
        cardName: 'Amex Business Gold',
        annualFee: 375,
        benefits: [
          { benefitId: 'ben-003', name: 'Dining Credit', value: 120.0, utilized: false },
          { benefitId: 'ben-009', name: 'Uber Cash Credit', value: 120.0, utilized: false },
          { benefitId: 'ben-010', name: 'Dunkin Credit', value: 84.0, utilized: true },
          { benefitId: 'ben-011', name: 'Grubhub Credit', value: 84.0, utilized: false },
          { benefitId: 'ben-012', name: 'The Cheesecake Factory Credit', value: 84.0, utilized: true },
        ],
      },
    ],
  };
}

// ── GET /api/card-benefits/:clientId ─────────────────────────
//
// Returns mock card benefits data including summary, expiring
// benefits, and per-card benefit details.

cardBenefitsApiRouter.get(
  '/:clientId',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = String(req.params['clientId'] ?? '');

    if (!clientId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PARAM', message: 'clientId is required.' },
      };
      res.status(400).json(body);
      return;
    }

    logger.debug('GET card-benefits', { clientId });

    const data = buildBenefitsData(clientId);

    // Overlay any mark-used state
    for (const card of data.cards) {
      for (const benefit of card.benefits) {
        const key = `${card.cardId}:${benefit.benefitId}`;
        if (usedBenefits[key]) {
          benefit.utilized = true;
        }
      }
    }

    res.status(200).json({
      success: true,
      data,
    } satisfies ApiResponse);
  },
);

// ── POST /api/card-benefits/:cardId/benefits/:benefitId/mark-used ─
//
// Mark a specific benefit as used.

cardBenefitsApiRouter.post(
  '/:cardId/benefits/:benefitId/mark-used',
  async (req: Request, res: Response): Promise<void> => {
    const cardId = String(req.params['cardId'] ?? '');
    const benefitId = String(req.params['benefitId'] ?? '');

    if (!cardId || !benefitId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PARAM', message: 'cardId and benefitId are required.' },
      };
      res.status(400).json(body);
      return;
    }

    const key = `${cardId}:${benefitId}`;
    const entry = {
      usedAt: new Date().toISOString(),
      usedBy: req.tenant?.userId ?? 'system',
    };
    usedBenefits[key] = entry;

    logger.info('Benefit marked as used', { cardId, benefitId });

    res.status(200).json({
      success: true,
      data: {
        cardId,
        benefitId,
        markedUsed: true,
        ...entry,
      },
    } satisfies ApiResponse);
  },
);

// ── POST /api/card-benefits/:clientId/export ─────────────────
//
// Return a mock text report of card benefits.

cardBenefitsApiRouter.post(
  '/:clientId/export',
  async (req: Request, res: Response): Promise<void> => {
    const clientId = String(req.params['clientId'] ?? '');

    if (!clientId) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PARAM', message: 'clientId is required.' },
      };
      res.status(400).json(body);
      return;
    }

    logger.info('Card benefits report exported', { clientId });

    const report = [
      'CARD BENEFITS REPORT',
      `Client: ${clientId}`,
      `Generated: ${new Date().toISOString()}`,
      '='.repeat(50),
      '',
      'Benefit Utilization Summary:',
      '  Total Benefits:      12',
      '  Utilized:             7 (58%)',
      '  Expiring Soon:        3',
      '  Estimated Unused:    $2,450.00',
      '',
      'Cards:',
      '  Amex Business Platinum ($695/yr)',
      '    - Airline Fee Credit:      $200  [PENDING]',
      '    - Dell Technologies:       $200  [USED]',
      '    - Clear Plus:              $199  [USED]',
      '    - Centurion Lounge:        N/A   [USED]',
      '',
      '  Chase Sapphire Reserve ($550/yr)',
      '    - DoorDash Credit:         $50   [PENDING]',
      '    - Travel Credit:           $300  [USED]',
      '    - Global Entry/TSA:        $100  [USED]',
      '',
      '  Amex Business Gold ($375/yr)',
      '    - Dining Credit:           $120  [PENDING]',
      '    - Uber Cash Credit:        $120  [PENDING]',
      '    - Dunkin Credit:           $84   [USED]',
      '    - Grubhub Credit:          $84   [PENDING]',
      '    - Cheesecake Factory:      $84   [USED]',
      '',
      'Action Items:',
      '  1. Use Airline Fee Credit before expiry (30 days)',
      '  2. Redeem DoorDash credits this month',
      '  3. Apply Dining Credit at eligible restaurants',
      '',
      'END OF REPORT',
    ].join('\n');

    res.status(200).json({
      success: true,
      data: {
        clientId,
        format: 'text',
        report,
        generatedAt: new Date().toISOString(),
      },
    } satisfies ApiResponse);
  },
);
