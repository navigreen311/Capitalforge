// ============================================================
// CapitalForge — Portfolio Health Score Routes
//
// GET /api/portfolio/health  — compute and return the portfolio
//   health score for the authenticated tenant.
// ============================================================

import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '@shared/types/index.js';
import { calculatePortfolioHealth } from '../../services/portfolio-health.js';
import type { PortfolioHealthResult } from '../../services/portfolio-health.js';

// ── Lazy PrismaClient singleton ─────────────────────────────────────────────

let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

// ── Helper: extract tenantId from authenticated request ─────────────────────

function getTenantId(req: Request): string {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    throw new Error('Authentication context missing.');
  }
  return tenantId;
}

// ── Router ──────────────────────────────────────────────────────────────────

export const portfolioHealthRouter = Router();

// GET / — Portfolio health score
portfolioHealthRouter.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantId(req);
      const db = getPrisma();

      const result: PortfolioHealthResult = await calculatePortfolioHealth(db, tenantId);

      const response: ApiResponse<PortfolioHealthResult> = {
        success: true,
        data: result,
      };

      res.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      if (message === 'Authentication context missing.') {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message },
        });
        return;
      }

      console.error('[portfolio-health] Error computing health score:', err);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to compute portfolio health score.' },
      });
    }
  },
);
