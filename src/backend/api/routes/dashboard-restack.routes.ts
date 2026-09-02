// ============================================================
// CapitalForge — Dashboard Re-Stack Opportunities Routes
//
// GET /api/v1/dashboard/restack  — tenant-scoped re-stack
//   opportunities for businesses eligible for another round.
//
// This asked the same question as GET /api/restack/eligible and answered it
// differently. It reimplemented eligibility inline: readiness `> 70` rather
// than `>= 70`, ninety days measured from the last completed ROUND rather than
// the last application, at least one completed round required, and no
// utilization or active-application check at all. A client scoring exactly 70
// was eligible on one surface and invisible on the other, and neither response
// said which rule set had answered.
//
// The rules live in services/restack-trigger.ts now and this presents them.
// The one thing the inline copy checked that the service did not — a round
// already in progress — moved into the service, because it is an eligibility
// rule rather than a presentation concern.
// ============================================================

import { Router, type Response } from 'express';
import type { Request } from '../../types/http.js';
import { scanAllForRestack } from '../../services/restack-trigger.js';
import type { ApiResponse } from '@shared/types/index.js';
import logger from '../../config/logger.js';

// ── Helper: extract tenantId from authenticated request ─────────────────────

function getTenantId(req: Request): string {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) {
    throw new Error('Authentication context missing.');
  }
  return tenantId;
}

// ── Helper: generate initials from business name ────────────────────────────

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

// ── Router ──────────────────────────────────────────────────────────────────

export const dashboardRestackRouter = Router();

// GET / — Re-stack opportunities for the current tenant
dashboardRestackRouter.get(
  '/',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantId(req);

      // No inner try/catch swallowing this.
      //
      // A failed query used to be caught here, logged to the console, and
      // answered as `success: true, opportunities: [], total_pipeline_value: 0`
      // with a fresh `last_updated` timestamp. An outage was indistinguishable
      // from a tenant with nobody ready to re-stack, and the answer carried a
      // timestamp saying it was current. The dashboard has an error state; it
      // was never reachable.
      const scan = await scanAllForRestack(tenantId);

      const opportunities = scan.results.map((r) => ({
        client_id: r.businessId,
        client_name: r.businessName,
        client_initials: getInitials(r.businessName),
        current_round: r.currentRoundNumber,
        next_round: r.recommendedRoundNumber,
        // Nullable, and null means not assessed rather than zero. The engine
        // draws that distinction and this used to flatten it with `?? 0`.
        readiness_score: r.readinessScore,
        last_funded_date: r.lastCompletedRoundAt,
      }));

      const body: ApiResponse = {
        success: true,
        data: {
          opportunities,
          // `total_pipeline_value` is gone, and there is nothing to replace it
          // with. It summed `estimated_additional_credit`, which was
          // `Math.round(Number(lastCompleted.targetCredit ?? 0) * 0.75)` — the
          // previous round's TARGET (the variable was named `achievedCredit`
          // and read `targetCredit`), times a 0.75 that appears nowhere else
          // and is derived from nothing. The comment above it claimed to "sum
          // credit from approved applications in the last completed round";
          // it read one field and summed nothing.
          //
          // Nothing here forecasts what a client will be approved for. A count
          // of clients is a fact; the money figure was not.
          eligible_count: opportunities.length,
          // What the count is out of. Only clients whose readiness has been
          // assessed are evaluated at all, and an empty list means something
          // different when nobody has been scored.
          active_count: scan.activeCount,
          not_assessed_count: scan.notAssessedCount,
          last_updated: new Date().toISOString(),
        },
      };

      res.json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[dashboard-restack] Failed to scan for re-stack opportunities', {
        error: message,
      });
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'RESTACK_FETCH_FAILED',
          message: 'Could not determine re-stack opportunities.',
        },
      };
      res.status(500).json(body);
    }
  },
);
