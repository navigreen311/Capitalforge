// ============================================================
// CapitalForge — Committee Queue Routes (mock)
//
// GET /api/dashboard/committee-queue — returns mock deal data
// for the Deal Committee Queue dashboard panel.
// ============================================================

import { Router, type Request, type Response } from 'express';
import type { ApiResponse } from '@shared/types/index.js';

// ── Router ──────────────────────────────────────────────────────────────────

export const committeeRouter = Router();

// GET / — Mock deal committee queue data
committeeRouter.get(
  '/',
  (_req: Request, res: Response): void => {
    const now = Date.now();

    const deals = [
      {
        id: 'dc-001',
        client_name: 'Apex Ventures',
        deal_amount: 250_000,
        risk_tier: 'High',
        sla_hours_remaining: 8.5,
        sla_hours_max: 12,
        reviewers: [
          { name: 'Sarah Chen' },
          { name: 'Mike Ross' },
          { name: 'Dana Liu' },
        ],
        submitted_at: new Date(now - 3.5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'dc-002',
        client_name: 'Meridian Holdings',
        deal_amount: 350_000,
        risk_tier: 'Critical',
        sla_hours_remaining: 2.3,
        sla_hours_max: 6,
        reviewers: [
          { name: 'James Park' },
          { name: 'Elena Voss' },
        ],
        submitted_at: new Date(now - 3.7 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const body: ApiResponse = {
      success: true,
      data: {
        queue_count: deals.length,
        deals,
        last_updated: new Date().toISOString(),
      },
    };

    res.json(body);
  },
);
