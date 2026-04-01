// ============================================================
// CapitalForge Dashboard APR Expiry Routes
//
// Mounted under: /api/v1/dashboard/apr-expiry
//
// GET  /  — CardApplications with intro APR expiring within 60 days
// ============================================================

import { Router, type Request, type Response, type NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import logger from '../../config/logger.js';
import type { ApiResponse } from '@shared/types/index.js';

// ── Lazy PrismaClient ────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

// ── Tier classification ──────────────────────────────────────

type AlertTier = 'critical' | 'warning' | 'upcoming';

function classifyTier(daysRemaining: number): AlertTier {
  if (daysRemaining <= 15) return 'critical';
  if (daysRemaining <= 30) return 'warning';
  return 'upcoming';
}

// ── Alert shape ──────────────────────────────────────────────

interface AprExpiryAlert {
  client_id: string;
  client_name: string;
  issuer: string;
  card_last_four: string;
  credit_limit: number | null;
  expiry_date: string;
  days_remaining: number;
  tier: AlertTier;
  card_id: string;
  funding_round_id: string | null;
}

interface AprExpiryResponse {
  all_clear: boolean;
  counts: {
    critical: number;
    warning: number;
    upcoming: number;
  };
  alerts: AprExpiryAlert[];
  last_updated: string;
}

// ── Router ───────────────────────────────────────────────────

export const dashboardAprExpiryRouter: Router = Router();

// GET / — APR expiry alerts grouped by urgency tier
dashboardAprExpiryRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = (req as any).tenant?.tenantId;

      if (!tenantId) {
        const body: ApiResponse = {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' },
        };
        res.status(401).json(body);
        return;
      }

      const prisma = getPrisma();
      const now = new Date();
      const sixtyDaysFromNow = new Date(now);
      sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

      logger.debug('GET apr-expiry alerts', { tenantId });

      // Fetch approved CardApplications with introAprExpiry within 60 days,
      // joined with Business for client name and tenant scoping.
      const applications = await prisma.cardApplication.findMany({
        where: {
          status: 'approved',
          introAprExpiry: {
            gte: now,
            lte: sixtyDaysFromNow,
          },
          business: {
            tenantId,
          },
        },
        include: {
          business: {
            select: {
              id: true,
              legalName: true,
            },
          },
        },
        orderBy: {
          introAprExpiry: 'asc',
        },
      });

      // Build alert objects
      const alerts: AprExpiryAlert[] = applications.map((app) => {
        const expiryDate = app.introAprExpiry as Date;
        const diffMs = expiryDate.getTime() - now.getTime();
        const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

        // Derive last four from cardProduct or id fallback
        const cardLastFour = app.cardProduct?.slice(-4) ?? app.id.slice(-4);

        return {
          client_id: app.business.id,
          client_name: app.business.legalName,
          issuer: app.issuer,
          card_last_four: cardLastFour,
          credit_limit: app.creditLimit ? Number(app.creditLimit) : null,
          expiry_date: expiryDate.toISOString(),
          days_remaining: daysRemaining,
          tier: classifyTier(daysRemaining),
          card_id: app.id,
          funding_round_id: app.fundingRoundId,
        };
      });

      // Sort by days_remaining ascending (already ordered by expiry, but ensure)
      alerts.sort((a, b) => a.days_remaining - b.days_remaining);

      // Count by tier
      const counts = {
        critical: alerts.filter((a) => a.tier === 'critical').length,
        warning: alerts.filter((a) => a.tier === 'warning').length,
        upcoming: alerts.filter((a) => a.tier === 'upcoming').length,
      };

      const data: AprExpiryResponse = {
        all_clear: alerts.length === 0,
        counts,
        alerts,
        last_updated: now.toISOString(),
      };

      const body: ApiResponse<AprExpiryResponse> = {
        success: true,
        data,
      };

      res.status(200).json(body);
    } catch (err) {
      logger.error('APR expiry route error', { error: (err as Error).message });
      next(err);
    }
  },
);
