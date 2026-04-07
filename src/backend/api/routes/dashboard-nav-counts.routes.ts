// ============================================================
// CapitalForge — Dashboard Nav Counts Routes
//
// GET /api/v1/dashboard/nav-counts  — sidebar badge indicators
//
// Returns counts for navigation items:
//   - action_queue: total pending action items
//   - applications: pending/submitted apps count
//   - funding_rounds: active (in_progress) rounds
//   - compliance: unresolved high/critical checks
//   - complaints: open complaints
// ============================================================

import { Router, type Request, type Response } from 'express';
import { PrismaClient } from '@prisma/client';
import type { ApiResponse } from '@shared/types/index.js';

// ── Lazy PrismaClient singleton ─────────────────────────────────────────────

let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

// ── Router ──────────────────────────────────────────────────────────────────

export const dashboardNavCountsRouter = Router();

// GET / — nav badge counts for the current tenant
dashboardNavCountsRouter.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        const body: ApiResponse = {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
        };
        res.status(401).json(body);
        return;
      }

      const db = getPrisma();

      // ── Parallel count queries ──────────────────────────────────────────
      const [
        actionQueueCount,
        pendingApplications,
        activeRounds,
        unresolvedCompliance,
        openComplaints,
        pendingConsentApps,
        expiredConsents,
      ] = await Promise.all([
        // Pending consent + unresolved compliance + expired consents
        // (same sources as action-queue route)
        db.cardApplication.count({
          where: {
            business: { tenantId },
            status: 'pending_consent',
          },
        }),

        // Pending/submitted card applications
        db.cardApplication.count({
          where: {
            business: { tenantId },
            status: { in: ['pending', 'submitted', 'draft', 'pending_consent'] },
          },
        }),

        // Active funding rounds
        db.fundingRound.count({
          where: {
            business: { tenantId },
            status: 'in_progress',
          },
        }),

        // Unresolved high/critical compliance checks
        db.complianceCheck.count({
          where: {
            tenantId,
            resolvedAt: null,
            riskLevel: { in: ['high', 'critical'] },
          },
        }),

        // Open complaints
        db.complaint.count({
          where: {
            tenantId,
            status: 'open',
          },
        }),

        // Pending consent card apps (for action queue aggregate)
        db.cardApplication.count({
          where: {
            business: { tenantId },
            status: 'pending_consent',
          },
        }),

        // Expired consent records
        db.consentRecord.count({
          where: {
            tenantId,
            status: 'expired',
          },
        }),
      ]);

      // Action queue total = pending consent + unresolved compliance + expired consents
      const totalActionQueue = actionQueueCount + unresolvedCompliance + expiredConsents;

      const body: ApiResponse = {
        success: true,
        data: {
          action_queue: totalActionQueue,
          applications: pendingApplications,
          funding_rounds: activeRounds,
          compliance: unresolvedCompliance,
          complaints: openComplaints,
          consent_issues: pendingConsentApps + expiredConsents,
          last_updated: new Date().toISOString(),
        },
      };

      res.json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'NAV_COUNTS_FETCH_FAILED',
          message,
        },
      };
      res.status(500).json(body);
    }
  },
);
