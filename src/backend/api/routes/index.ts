// ============================================================
// Route Aggregator
// Mounts all feature route modules under /api.
// Add new route modules here -- do NOT register them in server.ts.
// ============================================================

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { healthRouter } from './health.routes.js';
import authRouter from './auth.routes.js';
import { openApiRouter } from './openapi.routes.js';
import { createAcknowledgmentRouter } from './acknowledgment.routes.js';
import { onboardingRouter } from './onboarding.routes.js';
import { optimizerRouter } from './optimizer.routes.js';
import { kybKycRouter } from './kyb-kyc.routes.js';
import applicationRouter from './application.routes.js';
import { suitabilityRouter } from './suitability.routes.js';
import { costCalculatorRouter } from './cost-calculator.routes.js';

export const apiRouter = Router();

// ── Authentication gate (default deny) ────────────────────────
//
// Every /api route requires a valid access token unless its path is listed
// below. This is deliberately a single choke point rather than per-router
// middleware: 46 of the 91 route modules previously applied no authentication
// at all, so `GET /api/clients` and `GET /api/businesses/:id` (among many
// others) returned real tenant data to an unauthenticated caller.
//
// Adding a route is therefore secure by default — you have to opt a path OUT
// of authentication here, in one reviewable place, rather than remembering to
// opt it in.
//
// Paths are matched against req.path, which is relative to the /api mount.
const PUBLIC_API_PATHS: readonly RegExp[] = [
  // Liveness/readiness probes
  /^\/health(?:\/|$)/,

  // Credential exchange — these mint tokens, so they cannot require one
  /^\/auth\/(?:login|register|refresh|logout)$/,

  // Tenant lookup by slug: the login page resolves the tenant before it has
  // any credentials to present
  /^\/tenants(?:\/|$)/,

  // OpenAPI document and its viewer
  /^\/docs(?:\/|$)/,
  /^\/openapi(?:\.json|\.yaml)?$/,

  // Inbound provider webhooks. These are authenticated by request signature
  // (HMAC) inside their handlers — a bearer token is neither sent nor
  // meaningful for a third-party callback.
  /^\/stripe\/webhook$/,
  /^\/docusign\/webhook$/,
  /^\/integrations\/[^/]+\/webhook$/,

  // Twilio delivery receipts and inbound messages. Twilio cannot present a
  // bearer token; these verify an HMAC signature in the handler instead.
  // The inbound one carries STOP replies, so it must stay reachable — an
  // opt-out that 401s is an opt-out that is not honoured.
  /^\/voiceforge\/webhooks\/sms-(?:inbound|status)$/,
];

apiRouter.use((req, res, next) => {
  if (PUBLIC_API_PATHS.some((pattern) => pattern.test(req.path))) {
    next();
    return;
  }
  void requireAuth(req, res, next);
});

// -- OpenAPI docs (public) --
apiRouter.use('/', openApiRouter);

// -- Health (public) --
apiRouter.use('/health', healthRouter);

// -- Auth (public) --
apiRouter.use('/auth', authRouter);

// -- Two-Factor Authentication (requires auth) --
import { twoFactorRouter } from './two-factor.routes.js';
apiRouter.use('/auth/2fa', twoFactorRouter);

// -- Tenant lookup (public — needed for login flow) --
import { tenantLookupRouter } from './tenant-lookup.routes.js';
apiRouter.use('/tenants', tenantLookupRouter);

// -- Dashboard v1 (aggregates all dashboard sub-routes) --
import { dashboardV1Router } from './dashboard-index.routes.js';
apiRouter.use('/v1/dashboard', dashboardV1Router);

// -- Dashboard (non-versioned alias for /api/dashboard/*) --
import { dashboardRouter } from './dashboard.routes.js';
apiRouter.use('/dashboard', dashboardRouter);

// -- Dashboard Committee Queue (mock endpoint) --
// committee.routes.ts is gone.
//
// It mounted a second handler at /api/dashboard/committee-queue serving two
// invented deals — "Apex Ventures, $250,000, High risk, 8.5 of 12 SLA hours
// remaining, reviewers Sarah Chen, Mike Ross and Dana Liu" — and was
// shadowed by dashboard-committee.routes.ts, which reads
// deal_committee_reviews, joins the business and its latest application,
// parses the reviewers actually recorded and computes the SLA from the
// review's own createdAt. The real one had been answering all along; the
// mock was dead code with fabricated names in it.

// -- Clients list & create --
import { clientsRouter } from './clients.routes.js';
apiRouter.use('/clients', clientsRouter);
apiRouter.use('/v1/clients', clientsRouter);

// -- Client Detail (per-client sub-routes) --
import { clientDetailRouter } from './client-detail.routes.js';
apiRouter.use('/clients/:clientId', clientDetailRouter);
apiRouter.use('/v1/clients/:clientId', clientDetailRouter);

// -- Onboarding --
apiRouter.use('/businesses', onboardingRouter);

// -- Acknowledgments --
apiRouter.use('/businesses/:id/acknowledgments', createAcknowledgmentRouter());

// -- KYB / KYC --
apiRouter.use('/businesses', kybKycRouter);

// -- Application Pipeline --
apiRouter.use('/', applicationRouter);

// -- Applications Wizard API (new endpoints for wizard flow) --
import applicationsWizardRouter from './applications.routes.js';
apiRouter.use('/', applicationsWizardRouter);

// -- Inbound SMS webhooks (Twilio HMAC-authenticated, no bearer token) --
import { smsWebhookRouter } from './sms-webhooks.routes.js';
apiRouter.use('/voiceforge/webhooks', smsWebhookRouter);

// -- Application Detail (per-application sub-routes) --
import { applicationDetailRouter } from './application-detail.routes.js';
apiRouter.use('/applications/:appId', applicationDetailRouter);

// -- Funding Rounds (list, create, complete, compare, eligibility) --
import { fundingRoundRouter } from './funding-round.routes.js';
apiRouter.use('/', fundingRoundRouter);

// -- Funding Round Detail (per-round sub-routes) --
import { fundingRoundDetailRouter } from './funding-round-detail.routes.js';
apiRouter.use('/funding-rounds/:roundId', fundingRoundDetailRouter);
// Versioned alias, matching /v1/clients. The frontend calls the /v1 form, and
// without this it 404s.
apiRouter.use('/v1/funding-rounds/:roundId', fundingRoundDetailRouter);

// -- Funding Round Actions (export-dossier, status update) --
import { fundingRoundActionsRouter } from './funding-round-actions.routes.js';
apiRouter.use('/', fundingRoundActionsRouter);

// -- Consent (per-business consent management) --
import consentRouter from './consent.routes.js';
apiRouter.use('/businesses/:id/consent', consentRouter);

// -- Suitability (per-business checks, overrides) --
apiRouter.use('/businesses/:id/suitability', suitabilityRouter);

// -- Suitability Engine (Phase 3 — standalone calculate & business lookup) --
import { suitabilityEngineRouter } from './suitability-engine.routes.js';
apiRouter.use('/suitability', suitabilityEngineRouter);

// -- Cost Calculator --
apiRouter.use('/businesses/:id/cost', costCalculatorRouter);

// -- Card Stacking Optimizer --
apiRouter.use('/businesses/:id/optimize', optimizerRouter);
apiRouter.use('/businesses/:id/optimizer', optimizerRouter);

// -- Stacking Optimizer V2 (Prisma-backed, DB card products) --
import { optimizerV2Router } from './optimizer-v2.routes.js';
apiRouter.use('/optimizer', optimizerV2Router);

// -- Optimizer Actions (save strategy, create round from results) --
import { optimizerActionsRouter } from './optimizer-actions.routes.js';
apiRouter.use('/optimizer', optimizerActionsRouter);

// -- Document Vault --
import { documentRouter } from './document.routes.js';
apiRouter.use('/', documentRouter);

// -- Document Generation (letters, statements, cover letters) --
import { documentGenRouter } from './document-gen.routes.js';
apiRouter.use('/', documentGenRouter);

// -- Compliance & Risk Center --
import { complianceRouter } from './compliance.routes.js';
apiRouter.use('/', complianceRouter);

// -- Contract Intelligence & Disclosure CMS --
// POST   /api/contracts/analyze
// GET    /api/contracts/analyses
// GET    /api/contracts/:id/red-flags
// POST   /api/contracts/compare
// GET    /api/disclosures/templates
// POST   /api/disclosures/templates
// PUT    /api/disclosures/templates/:id
// POST   /api/disclosures/templates/:id/submit
// POST   /api/disclosures/templates/:id/approve
// GET    /api/disclosures/templates/:id/history
// POST   /api/disclosures/render
// POST   /api/disclosures/render-all
// POST   /api/disclosures/seed
import { contractsRouter } from './contracts.routes.js';
apiRouter.use('/', contractsRouter);

// -- Partner & Vendor Governance + Referral Attribution -------
// POST   /api/partners                        -- onboard partner
// GET    /api/partners                        -- list partners
// PUT    /api/partners/:id                    -- update partner
// GET    /api/partners/:id/scorecard          -- vendor scorecard
// POST   /api/partners/:id/review             -- review decision
// POST   /api/partners/:id/renewal            -- initiate renewal
// POST   /api/partners/:id/renewal/complete   -- complete renewal
// POST   /api/partners/:id/subprocessors      -- register subprocessor
// GET    /api/partners/:id/subprocessors      -- list subprocessors
// POST   /api/businesses/:id/referrals        -- create attribution
// GET    /api/businesses/:id/referrals        -- list attributions
// POST   /api/referrals/:id/fee-status        -- update fee status
// POST   /api/referrals/agreement             -- generate agreement
// POST   /api/referrals/consent               -- capture consent
// DELETE /api/referrals/consent/:consentId    -- revoke consent
// GET    /api/referrals/analytics             -- tenant analytics
import { partnersRouter } from './partners.routes.js';
apiRouter.use('/', partnersRouter);

// -- Integration Layer, API Portal & Business Continuity ------
// POST   /api/integrations/:provider/connect
// DELETE /api/integrations/:provider/disconnect
// POST   /api/integrations/:provider/webhook
// GET/POST/DELETE /api/api-keys
// GET    /api/observability/health
// GET    /api/observability/metrics
// POST   /api/backups/trigger  |  GET /api/backups
import { integrationsRouter } from './integrations.routes.js';
apiRouter.use('/', integrationsRouter);

// ── Communication Compliance & Training ──────────────────────
// POST /api/comm-compliance/scan
// GET  /api/scripts
// POST /api/scripts
// GET  /api/training/certifications
// POST /api/training/certifications/:id/complete
// GET  /api/advisors/:id/qa-scores
// POST /api/advisors/:id/qa-scores
import { commComplianceRouter } from './comm-compliance.routes.js';
apiRouter.use('/', commComplianceRouter);

// ── Admin, Offboarding, Fair-Lending & AI Governance ─────────
// POST   /api/admin/tenants
// GET    /api/admin/tenants
// PUT    /api/admin/tenants/:id
// PUT    /api/admin/tenants/:id/flags
// GET    /api/admin/tenants/:id/usage
// POST   /api/offboarding/initiate
// GET    /api/offboarding/:id
// POST   /api/offboarding/:id/exit-interview
// POST   /api/offboarding/:id/export
// POST   /api/offboarding/:id/delete-data
// GET    /api/fair-lending/dashboard
// POST   /api/fair-lending/records
// GET    /api/fair-lending/coverage
// GET    /api/fair-lending/adverse-action
// GET    /api/ai-governance/decisions
// POST   /api/ai-governance/decisions
// POST   /api/ai-governance/decisions/:id/override
// GET    /api/ai-governance/metrics
// GET    /api/ai-governance/versions
import { adminRouter } from './admin.routes.js';
apiRouter.use('/', adminRouter);

// -- Complaint & Remediation Center / Regulator Response Workspace --
// POST   /api/complaints
// GET    /api/complaints
// GET    /api/complaints/analytics
// PUT    /api/complaints/:id
// POST   /api/complaints/:id/evidence
// POST   /api/regulator/inquiries
// GET    /api/regulator/inquiries
// PUT    /api/regulator/inquiries/:id
// POST   /api/regulator/inquiries/:id/export-dossier
import { complaintsRouter } from './complaints.routes.js';
apiRouter.use('/', complaintsRouter);

// ── VoiceForge — Telephony, Outreach & Call Compliance ───────────
// POST /api/voiceforge/calls
// GET  /api/voiceforge/calls
// GET  /api/voiceforge/calls/:id
// POST /api/voiceforge/calls/:id/end
// POST /api/voiceforge/outreach/apr-expiry
// POST /api/voiceforge/outreach/restack
// POST /api/voiceforge/compliance/scan-transcript
// GET  /api/voiceforge/compliance/qa/:advisorId
import { voiceForgeRouter } from './voiceforge.routes.js';
apiRouter.use('/', voiceForgeRouter);

// ── Payment Reminder SMS Campaign (TCPA-gated) ─────────────────
import { smsCampaignRouter } from './payment-reminders.routes.js';
apiRouter.use('/v1/voiceforge/sms-campaign', smsCampaignRouter);

// ── VisionAudioForge — Document Intelligence & Agent Orchestration
// POST /api/vaf/process
// GET  /api/vaf/results/:id
// POST /api/vaf/agents/:agentType/run
// GET  /api/vaf/agents/status
// POST /api/vaf/ocr/statement
// POST /api/vaf/ocr/adverse-action
// POST /api/vaf/verify/id-liveness
import { visionAudioForgeRouter } from './visionaudioforge.routes.js';
apiRouter.use('/', visionAudioForgeRouter);

// ── Webhooks — Subscriptions, Delivery Log & Test ────────────────
// POST   /api/webhooks/subscriptions        — register subscription
// GET    /api/webhooks/subscriptions        — list subscriptions
// DELETE /api/webhooks/subscriptions/:id    — remove subscription
// GET    /api/webhooks/deliveries           — delivery log
// POST   /api/webhooks/test                 — test delivery
import { webhooksRouter } from './webhooks.routes.js';
apiRouter.use('/webhooks', webhooksRouter);

// ── Operating Model Governance Layer ─────────────────────────
// GET  /api/governance/reference-data              — list entities per domain
// POST /api/governance/reference-data              — create/submit/approve/activate ref data version
// GET  /api/governance/releases                    — list staged deployments
// POST /api/governance/releases                    — create, advance, rollback, set feature flag, preview
// GET  /api/governance/releases/:id                — get single release
// GET  /api/governance/support/incidents           — list incidents (filter by severity/status)
// POST /api/governance/support/incidents           — create incident
// GET  /api/governance/support/incidents/:id       — get incident
// PATCH /api/governance/support/incidents/:id      — update incident
// GET  /api/governance/support/status/:tenantId    — tenant health / status page
// GET  /api/governance/support/sla-policies        — SLA policy table
// GET  /api/governance/cadence/upcoming            — upcoming governance reviews
// GET  /api/governance/cadence/overdue             — overdue items
// POST /api/governance/cadence/schedule            — schedule review (7 sub-actions)
// PATCH /api/governance/cadence/:id/complete       — mark review complete
// POST /api/governance/cadence/reminders/process   — dispatch pending reminders (cron)
import { governanceRouter } from './governance.routes.js';
apiRouter.use('/governance', governanceRouter);

// ── Financial Control ───────────────────────────────────────────
import { financialRouter } from './financial.routes.js';
apiRouter.use('/financial', financialRouter);

// ── Compliance Extended (Regulatory, Comm Compliance, Training, Decisions) ──
// compliance-extended.routes.ts is gone.
//
// It served six datasets of invented records under /api/compliance/* — a
// communication log flagging invented advisor calls for banned claims and
// missing consent, a consent audit granting and revoking permission for
// businesses that do not exist, advisor certifications, regulatory items,
// decisions and training modules. Every one was a literal, none was
// tenant-scoped, and no page called any of them: each subject already has a
// real endpoint, which is what the pages were rewired to.
//   regulatory     /api/regulatory/alerts
//   comm log + QA  /api/comm-compliance/*
//   consent        /api/consent/audit and /api/do-not-call
//   training       /api/training/tracks, /api/training/certifications
//   decisions      /api/ai-decisions

// ── Platform (CRM, issuers, referrals, workflows, settings) ──
import { platformRouter } from './platform.routes.js';
apiRouter.use('/platform', platformRouter);

// ── Platform Extended (Reports, Portfolio, Tenants, Offboarding, Data Lineage) ──
import { platformExtendedRouter } from './platform-extended.routes.js';
apiRouter.use('/', platformExtendedRouter);

// ── Platform Reports (generate, export, schedules) ──
import { platformReportsRouter } from './platform-reports.routes.js';
apiRouter.use('/platform/reports', platformReportsRouter);

// ── Platform Portfolio (benchmarks) ──
import { platformPortfolioRouter } from './platform-portfolio.routes.js';
apiRouter.use('/platform/portfolio', platformPortfolioRouter);

// ── Platform Offboarding (advance stage, audit-log) ──
import { platformOffboardingRouter } from './platform-offboarding.routes.js';
apiRouter.use('/platform/offboarding', platformOffboardingRouter);

// ── Platform Data Lineage (events, export) ──
import { platformDataLineageRouter } from './platform-data-lineage.routes.js';
apiRouter.use('/platform/data-lineage', platformDataLineageRouter);

// ── Issuer Rules Engine ──────────────────────────────────────────
// ── CRM, portfolio analytics and issuer contacts ────────────
// GET  /api/crm/pipeline, /api/crm/revenue, /api/crm/advisors/:id/performance
// GET  /api/portfolio/benchmarks, /heatmap, /promo-survival, /complaint-rates
// GET  /api/issuers/contacts, /api/issuers/:issuer/trends
//
// Mounted BEFORE issuerRulesRouter, which registers /issuers/:id. Express
// matches in registration order, so with this router last a request for
// /api/issuers/contacts bound id="contacts" and answered 404 from the issuer
// lookup — reachable route, unreachable endpoint, exactly as /declines/stats
// was.
import { crmRouter } from './crm.routes.js';
apiRouter.use('/', crmRouter);

import { issuerRulesRouter } from './issuer-rules.routes.js';
apiRouter.use('/', issuerRulesRouter);

// ── Credit Union (slug-based routes, eligibility, membership) ───
import { creditUnionRouter } from './credit-union.routes.js';
apiRouter.use('/credit-unions', creditUnionRouter);

// ── DocuSign E-Signature ─────────────────────────────────────────
import { docuSignRouter } from './docusign.routes.js';
apiRouter.use('/docusign', docuSignRouter);

// ── Stripe Payments ──────────────────────────────────────────────
import { stripeRouter, stripeWebhookRouter } from './stripe.routes.js';
apiRouter.use('/stripe', stripeRouter);
apiRouter.use('/stripe/webhook', stripeWebhookRouter);

// ── Portfolio Health Score ───────────────────────────────────────
import { portfolioHealthRouter } from './portfolio-health.routes.js';
apiRouter.use('/portfolio/health', portfolioHealthRouter);

// ── Readiness Score ──────────────────────────────────────────────
import { readinessRouter } from './readiness.routes.js';
apiRouter.use('/readiness', readinessRouter);

// ── Decline Actions (create, analytics) ─────────────────────────
// Mounted BEFORE declineRecoveryRouter, which registers /declines/:id.
// Express matches in registration order, so with the old order that
// parameterised route answered /declines/analytics with a 404 reading
// "Decline recovery record analytics not found" — the endpoint existed and
// was unreachable.
import { declineActionsRouter } from './decline-actions.routes.js';
apiRouter.use('/', declineActionsRouter);

// ── Decline Recovery Workflow ────────────────────────────────────
import { declineRecoveryRouter } from './decline-recovery.routes.js';
apiRouter.use('/', declineRecoveryRouter);

// ── Re-Stack Eligibility ─────────────────────────────────────────
import { restackRouter } from './restack.routes.js';
apiRouter.use('/restack', restackRouter);

// ── Notifications ──────────────────────────────────────────────
import { notificationsRouter } from './notifications.routes.js';
apiRouter.use('/notifications', notificationsRouter);

// ── Activity ───────────────────────────────────────────────────
// GET /api/activity — the audit log, most recent first. The dashboard's
// "Recent Activity" card had no endpoint to read, which is why it held five
// literals.
import { activityRouter } from './activity.routes.js';
apiRouter.use('/activity', activityRouter);

// ── AI Chat Assistant ──────────────────────────────────────────
// POST /api/chat — Streaming AI chat with portfolio context
import { chatRouter } from './chat.routes.js';
apiRouter.use('/chat', chatRouter);

// ── Credit Builder ──────────────────────────────────────────────
// GET  /api/credit-builder/:clientId/scores
// GET  /api/credit-builder/:clientId/score-history
// GET  /api/credit-builder/:clientId/tradelines
// POST /api/credit-builder/:clientId/tradelines
// POST /api/credit-builder/:clientId/tradeline-disputes
import { creditBuilderRouter } from './credit-builder.routes.js';
apiRouter.use('/credit-builder', creditBuilderRouter);

// ── Spend Governance ────────────────────────────────────────────
// POST  /api/spend-governance/violations/:id/acknowledge
// PATCH /api/spend-governance/transactions/:id/business-purpose
// POST  /api/spend-governance/export-evidence
// (also mounts existing /api/businesses/:id/transactions/* routes)
import { spendGovernanceRouter } from './spend-governance.routes.js';
apiRouter.use('/spend-governance', spendGovernanceRouter);
apiRouter.use('/', spendGovernanceRouter);

// ── Rewards Points & Card Management ────────────────────────────
// GET  /api/rewards/:clientId/points-balances
// POST /api/rewards/:clientId/export
// POST /api/cards/:id/cancel
// (also mounts existing /api/businesses/:id/rewards/* & benefits/* routes)
import { rewardsRouter } from './rewards.routes.js';
apiRouter.use('/rewards', rewardsRouter);
apiRouter.use('/', rewardsRouter);

// ── Card Benefits (client-level benefits summary, mark-used, export) ──
// GET  /api/card-benefits/:clientId
// POST /api/card-benefits/:cardId/benefits/:benefitId/mark-used
// POST /api/card-benefits/:clientId/export
import { cardBenefitsApiRouter } from './card-benefits.routes.js';
apiRouter.use('/card-benefits', cardBenefitsApiRouter);

// ── Statements (reconciliation + client-level statement management) ──
// GET    /api/statements?client_id=X
// GET    /api/statements/:id/line-items
// POST   /api/statements/anomalies/:id/dismiss
// POST   /api/statements/anomalies/:id/steps/:step
// POST   /api/statements/disputes
// (also mounts /api/businesses/:id/statements/* reconciliation routes)
import { statementsRouter } from './statements.routes.js';
apiRouter.use('/statements', statementsRouter);
apiRouter.use('/', statementsRouter);

// ── Billing & Entitlements (invoices, plans, usage, extended billing mgmt) ──
// GET  /api/billing/invoices/:id/pdf
// POST /api/billing/invoices/:id/void
// POST /api/billing/invoices/:id/unpay
// POST /api/billing/commissions/:id/resolve
// GET  /api/billing/revenue-trend
// (also mounts /api/businesses/:id/invoices, /api/invoices/:id, /api/tenants/:tenantId/plan|usage)
import { billingRouter } from './billing.routes.js';
apiRouter.use('/', billingRouter);

// ── Tax Documents (mock document list, download, summary, generate) ──
// GET  /api/tax/documents?clientId=X&year=Y
// GET  /api/tax/documents/:id/download
// GET  /api/tax/documents/:id/summary
// POST /api/tax/documents/generate
import { taxRouter } from './tax.routes.js';
apiRouter.use('/tax', taxRouter);

// ── Simulator (run, compare, export-comparison, save-scenario) ──
// POST /api/simulator/run
// POST /api/simulator/compare
// POST /api/simulator/export-comparison
// POST /api/simulator/save-scenario
import { simulatorRouter } from './simulator.routes.js';
apiRouter.use('/simulator', simulatorRouter);

// ── Sandbox (profiles, practice, regression, simulate-round) ──
import { sandboxRouter } from './simulator.routes.js';
apiRouter.use('/sandbox', sandboxRouter);

// ── Hardship (case management, stage advancement, resolution, stats) ──
// POST  /api/hardship                   — create new case
// PATCH /api/hardship/:id/stage         — advance stage
// PATCH /api/hardship/:id/resolve       — mark resolved or written off
// GET   /api/hardship/stats             — case counts by status and flag
// PUT   /api/hardship/:id               — update case
// POST  /api/hardship/:id/payment-plan  — attach payment plan
// POST  /api/hardship/:id/settlement    — attach settlement offer
// POST  /api/businesses/:id/hardship    — open hardship case (business-level)
// GET   /api/businesses/:id/hardship    — list cases (business-level)
// GET   /api/businesses/:id/restack/*   — re-stack readiness & triggers
import { hardshipRouter } from './hardship.routes.js';
apiRouter.use('/hardship', hardshipRouter);
apiRouter.use('/', hardshipRouter);

// ── Client Portal (public-facing client view) ───────────────
// GET /api/portal/:clientId/summary — funding status, APR countdowns, payments, docs
import { portalRouter } from './portal.routes.js';
apiRouter.use('/portal', portalRouter);

// ============================================================
// Routers that were written, tested and never mounted
//
// Each of the files below exports a working router that index.ts did not
// import, so every one of its endpoints answered 404 — implemented backend
// that no request could reach, behind pages that had given up and hardcoded
// their data instead.
//
// Auth is not a concern here: requireAuth runs above on apiRouter for every
// path outside the public allowlist and populates req.tenant from the JWT,
// which is what these handlers read.
//
// Mount paths are taken from each file's own header, and the parameterised
// mounts sit after the literal ones for the reason /declines/stats used to
// 404: Express matches in registration order.
// ============================================================

// ── Regulatory intelligence and funds-flow classification ───
// GET  /api/regulatory/alerts, /api/regulatory/impact/:ruleId
// GET  /api/funds-flow/classifications, /api/funds-flow/licensing-status
import { regulatoryRouter } from './regulatory.routes.js';
apiRouter.use('/', regulatoryRouter);

// ── Deal committee reviews and decision explainability ──────
// GET  /api/deal-reviews, POST /api/deal-reviews/:id/vote
// GET  /api/decisions/:id/audit-trail
import { dealCommitteeRouter } from './deal-committee.routes.js';
apiRouter.use('/', dealCommitteeRouter);

// ── Workflow, policy rules and rule versioning ──────────────
// GET/POST /api/workflow/rules, /api/policy/rules
// POST /api/rules/versions/:id/deploy, /rollback
import { workflowRouter } from './workflow.routes.js';
apiRouter.use('/', workflowRouter);

// ── ACH authorizations and debit tolerance ──────────────────
// POST /api/businesses/:id/ach/authorize, GET /api/businesses/:id/ach
// POST /api/ach/debit-event
import { achRouter } from './ach.routes.js';
apiRouter.use('/', achRouter);

// ── Client graduation and credit-builder milestones ─────────
// GET  /api/businesses/:id/graduation/status
// GET  /api/businesses/:id/credit-builder/roadmap
import { graduationRouter } from './graduation.routes.js';
apiRouter.use('/businesses/:id', graduationRouter);

// ── Tax reporting and column-level lineage ──────────────────
// GET  /api/businesses/:id/tax/163j-report, /year-end-summary, /export
// GET  /api/businesses/:id/tax/lineage/graph, /tax/lineage/:fieldPath
import { taxReportsRouter } from './tax-reports.routes.js';
apiRouter.use('/businesses/:id/tax', taxReportsRouter);

// ── Credit profiles, pulls and optimization roadmap ─────────
// GET  /api/businesses/:id/credit, POST /api/businesses/:id/credit/pull
import { createCreditRouter } from './credit.routes.js';
apiRouter.use('/businesses/:id/credit', createCreditRouter());

// ── repayment.routes.ts is deliberately NOT mounted ─────────
//
// Its five endpoints are backed by repayment.service.ts, which makes no
// database call of any kind: two module-level Maps and an incrementing
// counter hold every plan and schedule it is given. Mounting it would publish
// POST /plan and PUT /schedule/:id/paid — a client recording a payment made
// against a repayment plan — and lose all of it on the next restart, silently
// and per process.
//
// The repayment page reads /api/v1/clients/:id/repayment, which is backed by
// Prisma, and is unaffected by this.
