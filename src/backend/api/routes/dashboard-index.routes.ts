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

export const dashboardV1Router = Router();

// ── Helper: safely mount a sub-router ─────────────────────────────────────

interface SubRoute {
  path: string;
  modulePath: string;
  exportName: string;
}

const SUB_ROUTES: SubRoute[] = [
  { path: '/kpi-summary',            modulePath: './dashboard-kpi.routes.js',                  exportName: 'dashboardKpiRouter' },
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

// Kick off mounting (fire-and-forget; routes resolve before first request)
mountSubRoutes();
