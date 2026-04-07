// ============================================================
// CapitalForge — Dashboard Routes (Unified Entry Point)
//
// Re-exports the v1 dashboard aggregator for convenience.
// Individual sub-routes are managed by dashboard-index.routes.ts
// which dynamically imports all dashboard-*.routes.ts files.
//
// Available endpoints:
//   GET /api/dashboard/kpi-summary          — KPI cards with 30-day trends
//   GET /api/dashboard/apr-expiry-alerts    — cards with intro APR expiring within 60 days
//   GET /api/dashboard/action-queue         — compliance + consent + APR action items
//   GET /api/dashboard/active-rounds        — in-progress funding rounds
//   GET /api/dashboard/restack-opportunities — businesses ready for next round
//   GET /api/dashboard/upcoming-payments    — payments due within 7 days
//   GET /api/dashboard/consent-status       — consent & acknowledgment summary
//   GET /api/dashboard/nav-counts           — sidebar badge indicator counts
// ============================================================

export { dashboardV1Router as dashboardRouter } from './dashboard-index.routes.js';
