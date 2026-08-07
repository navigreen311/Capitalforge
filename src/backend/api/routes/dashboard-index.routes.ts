// ============================================================
// CapitalForge — Dashboard Route Aggregator
//
// Mounts all dashboard sub-routes under /api/v1/dashboard/*
//
// Uses try-catch imports so the server starts gracefully even
// when individual sub-route files are not yet created.
// ============================================================

import { Router } from 'express';
import logger from '../../config/logger.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

export const dashboardV1Router = Router();

// All dashboard routes require authentication
dashboardV1Router.use(requireAuth);

// ── Helper: safely mount a sub-router ─────────────────────────────────────

interface SubRoute {
  path: string;
  modulePath: string;
  exportName: string;
}

const SUB_ROUTES: SubRoute[] = [
  { path: '/kpi-summary',            modulePath: './dashboard-kpi.routes.js',                  exportName: 'dashboardKpiRouter' },
  { path: '/recent-applications',    modulePath: './dashboard-recent-applications.routes.js',   exportName: 'dashboardRecentApplicationsRouter' },
  { path: '/consent-status',         modulePath: './dashboard-consent.routes.js',              exportName: 'dashboardConsentRouter' },
  { path: '/apr-expiry-alerts',      modulePath: './dashboard-apr-expiry.routes.js',           exportName: 'dashboardAprExpiryRouter' },
  { path: '/action-queue',           modulePath: './dashboard-action-queue.routes.js',         exportName: 'dashboardActionQueueRouter' },
  { path: '/active-rounds',          modulePath: './dashboard-active-rounds.routes.js',        exportName: 'dashboardActiveRoundsRouter' },
  { path: '/portfolio-risk-matrix',  modulePath: './dashboard-risk-matrix.routes.js',          exportName: 'dashboardRiskMatrixRouter' },
  { path: '/restack-opportunities',  modulePath: './dashboard-restack.routes.js',              exportName: 'dashboardRestackRouter' },
  { path: '/upcoming-payments',      modulePath: './dashboard-payments.routes.js',             exportName: 'dashboardPaymentsRouter' },
  { path: '/compliance-deadlines',   modulePath: './dashboard-compliance-deadlines.routes.js', exportName: 'dashboardComplianceDeadlinesRouter' },
  { path: '/committee-queue',        modulePath: './dashboard-committee.routes.js',             exportName: 'dashboardCommitteeRouter' },
  { path: '/voiceforge',             modulePath: './dashboard-voiceforge.routes.js',           exportName: 'dashboardVoiceforgeRouter' },
  { path: '/events',                 modulePath: './dashboard-events.routes.js',               exportName: 'dashboardEventsRouter' },
  { path: '/nav-counts',             modulePath: './dashboard-nav-counts.routes.js',           exportName: 'dashboardNavCountsRouter' },
  { path: '/payment-reminder-eligible', modulePath: './payment-reminders.routes.js',           exportName: 'paymentReminderEligibleRouter' },
];

// ── Mount each sub-route with graceful fallback ───────────────────────────

async function mountSubRoutes(): Promise<void> {
  for (const { path, modulePath, exportName } of SUB_ROUTES) {
    try {
      // Dynamic import so missing files don't crash the process
      const mod = await import(modulePath);
      const router = mod[exportName];

      if (router) {
        dashboardV1Router.use(path, router);
        logger.info(`Dashboard sub-route mounted: ${path}`);
      } else {
        logger.warn(`Dashboard sub-route export "${exportName}" not found in ${modulePath}`);
      }
    } catch (err) {
      logger.warn(`Dashboard sub-route ${path} not available yet (${modulePath})`, {
        error: (err as Error).message,
      });
    }
  }
}

/**
 * Resolves once every sub-route is mounted.
 *
 * This was `mountSubRoutes();` — fire-and-forget, with a comment asserting
 * "routes resolve before first request". Nothing enforced that. The mounting
 * is a sequence of dynamic imports, and `app.listen` runs as soon as the
 * synchronous module graph finishes, so a request arriving in the first ticks
 * after startup could reach this router before its children existed and get a
 * 404 on a route that is present in the source.
 *
 * A rare, startup-only race, and the worst kind to debug: it disappears the
 * moment anybody looks. Exported so the server awaits it before listening,
 * which turns the comment's claim into something the code actually does.
 */
const dashboardSubRoutesReady: Promise<void> = mountSubRoutes();

/**
 * Hold requests until mounting has finished.
 *
 * The guarantee lives on the router rather than in the server's startup
 * sequence, so it holds however the app is booted — including the tests, which
 * build an app without going through `server.ts` at all. After startup the
 * promise is already settled, so this costs one microtask per request.
 */
dashboardV1Router.use((_req, _res, next) => {
  dashboardSubRoutesReady.then(() => next(), next);
});
