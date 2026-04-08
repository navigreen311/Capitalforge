// ============================================================
// Route Aggregator
// Mounts all feature route modules under /api.
// Add new route modules here -- do NOT register them in server.ts.
// ============================================================

import { Router } from 'express';
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

// -- OpenAPI docs (public) --
apiRouter.use('/', openApiRouter);

// -- Health (public) --
apiRouter.use('/health', healthRouter);

// -- Auth (public) --
apiRouter.use('/auth', authRouter);

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
import { committeeRouter } from './committee.routes.js';
apiRouter.use('/dashboard/committee-queue', committeeRouter);

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

// -- Application Detail (per-application sub-routes) --
import { applicationDetailRouter } from './application-detail.routes.js';
apiRouter.use('/applications/:appId', applicationDetailRouter);

// -- Funding Rounds (list, create, complete, compare, eligibility) --
import { fundingRoundRouter } from './funding-round.routes.js';
apiRouter.use('/', fundingRoundRouter);

// -- Funding Round Detail (per-round sub-routes) --
import { fundingRoundDetailRouter } from './funding-round-detail.routes.js';
apiRouter.use('/funding-rounds/:roundId', fundingRoundDetailRouter);

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
import { complianceExtendedRouter } from './compliance-extended.routes.js';
apiRouter.use('/', complianceExtendedRouter);

// ── Platform (CRM, issuers, referrals, workflows, settings) ──
import { platformRouter } from './platform.routes.js';
apiRouter.use('/platform', platformRouter);

// ── Platform Extended (Reports, Portfolio, Tenants, Offboarding, Data Lineage) ──
import { platformExtendedRouter } from './platform-extended.routes.js';
apiRouter.use('/', platformExtendedRouter);

// ── Issuer Rules Engine ──────────────────────────────────────────
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

// ── Decline Recovery Workflow ────────────────────────────────────
import { declineRecoveryRouter } from './decline-recovery.routes.js';
apiRouter.use('/', declineRecoveryRouter);

// ── Decline Actions (create, analytics, reminders) ──────────────
import { declineActionsRouter } from './decline-actions.routes.js';
apiRouter.use('/', declineActionsRouter);

// ── Re-Stack Eligibility ─────────────────────────────────────────
import { restackRouter } from './restack.routes.js';
apiRouter.use('/restack', restackRouter);

// ── Notifications ──────────────────────────────────────────────
import { notificationsRouter } from './notifications.routes.js';
apiRouter.use('/notifications', notificationsRouter);

// ── AI Chat Assistant ──────────────────────────────────────────
// POST /api/chat — Streaming AI chat with portfolio context
import { chatRouter } from './chat.routes.js';
apiRouter.use('/chat', chatRouter);
