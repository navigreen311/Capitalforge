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

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { prisma as sharedPrisma } from '../../config/database.js';
import type { ApiResponse } from '@shared/types/index.js';

// ── Lazy PrismaClient singleton ─────────────────────────────────────────────

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

      const db = sharedPrisma;

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

        // No expired-consent count. Nothing writes `status: 'expired'` and
        // nothing can — ConsentRecord has no expiry column — so this counted
        // zero for every tenant, forever, and added it to two badges as though
        // it were a measurement.
        Promise.resolve(null),
      ]);

      // The total counts what can be counted. Expired consent is excluded
      // rather than added as a zero: adding an unmeasurable category as 0 makes
      // the badge look complete, and the sidebar already renders a null badge as
      // its own state — "unknown", not "none" — which is the honest rendering
      // for a category nothing can measure.
      const totalActionQueue = actionQueueCount + unresolvedCompliance;

      const body: ApiResponse = {
        success: true,
        data: {
          action_queue: totalActionQueue,
          applications: pendingApplications,
          funding_rounds: activeRounds,
          compliance: unresolvedCompliance,
          complaints: openComplaints,
          consent_issues: pendingConsentApps,
          /**
           * Null, not zero. Consent expiry is not modelled — no expiry column
           * exists on ConsentRecord — so no consent can become expired and none
           * can be counted. Zero here would read as "none have expired".
           */
          expired_consents: expiredConsents,
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
