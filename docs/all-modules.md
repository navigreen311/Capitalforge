# CapitalForge — All 61 Modules Reference

This document describes all 61 modules across the four system pillars: their business purpose, key features, data models involved, events emitted, and API routes.

---

## Contents

- [Platform Pillar (Modules 1–15)](#platform-pillar)
- [Intelligence Pillar (Modules 16–28)](#intelligence-pillar)
- [Orchestration Pillar (Modules 29–44)](#orchestration-pillar)
- [Compliance Pillar (Modules 45–61)](#compliance-pillar)

---

## Platform Pillar

### Module 1 — Auth & Multi-Tenant

**Pillar:** Platform

### Purpose
Provides secure user authentication and enforces strict tenant isolation across all platform resources. Every API request is authenticated and bound to a single tenant context before any business logic executes.

### Key Features
- JWT-based stateless auth with short-lived access tokens (15 min) and rotating refresh tokens (7 days)
- bcrypt password hashing (cost factor 12) with minimum complexity requirements
- Six RBAC roles: `super_admin`, `tenant_admin`, `advisor`, `compliance_officer`, `client`, `readonly`
- Thirteen fine-grained permissions mapped to roles (e.g. `application:submit`, `compliance:write`)
- JTI-based token blocklist in Redis for immediate refresh token revocation on logout
- Multi-tenant middleware validates `X-Tenant-ID` header and injects tenant context into every request
- Full audit logging of login, register, refresh, and logout events

### Data Models
`Tenant`, `User`, `AuditLog`

### Events Emitted
None directly — auth events are written to `AuditLog`.

### API Routes
`POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/refresh`, `POST /api/auth/logout`

---

### Module 2 — Business Onboarding & KYB

**Pillar:** Platform

### Purpose
Captures all required information about a business and its beneficial owners to enable credit assessment, compliance checks, and funding round initiation. Implements a structured onboarding state machine that gates downstream workflows on verification status.

### Key Features
- Business intake form: legal name, DBA, EIN, entity type, state of formation, date of formation, MCC, industry, revenue
- Onboarding state machine: `intake → verifying → active → suspended → offboarded`
- Beneficial owner capture: name, ownership percentage, SSN (encrypted), DOB, address, KYC status
- KYB (Know Your Business) verification workflow with external provider integration hooks
- Advisor assignment for white-label partner workflows
- Business readiness gating — downstream modules require `status: active`

### Data Models
`Business`, `BusinessOwner`

### Events Emitted
`business.created`, `business.onboarded`, `kyb.verified`, `kyc.verified`

### API Routes
`POST /api/businesses`, `GET /api/businesses`, `GET /api/businesses/:id`, `PATCH /api/businesses/:id`, `POST /api/businesses/:id/owners`, `GET /api/businesses/:id/owners`

---

### Module 3 — Document Vault

**Pillar:** Platform

### Purpose
Provides immutable, tenant-isolated document storage for all platform-generated and client-uploaded documents. Supports legal hold, tamper-evident hashing, and crypto-timestamping for evidentiary use.

### Key Features
- Document type catalog: consent evidence, acknowledgment, adverse action notice, KYB/KYC, financial statement, bureau report, agreement
- SHA-256 content hash computed and stored on every upload
- Crypto-timestamp anchor (RFC 3161) for legally defensible timestamping
- Legal hold flag — documents under hold cannot be deleted
- Storage backend abstraction: local filesystem (development) and S3 (production)
- Tenant-scoped access — documents can only be retrieved by their owning tenant
- Business linkage — documents can be associated with a specific business
- Metadata and MIME type tracking for downstream rendering

### Data Models
`Document`

### Events Emitted
`document.uploaded`, `document.processed`

### API Routes
`POST /api/documents`, `GET /api/documents/:id`, `GET /api/businesses/:id/documents`, `DELETE /api/documents/:id`

---

### Module 4 — Canonical Audit Ledger & Event Bus

**Pillar:** Platform

### Purpose
Provides the foundational event infrastructure that all other modules depend on. Every domain state change emits a typed event that is atomically persisted to the immutable `ledger_events` table and fanned out to in-process subscribers.

### Key Features
- Append-only `ledger_events` table — records are never updated or deleted
- Typed event envelopes with `tenantId`, `eventType`, `aggregateType`, `aggregateId`, `payload`, and optional `metadata`
- Wildcard pub/sub topic matching: `consent.*`, `application.*`, `*` (catch-all)
- Monotonic version counter per aggregate for optimistic concurrency detection
- In-process fan-out to registered handlers (synchronous, post-commit)
- Full event history queryable by tenant, event type, aggregate, or time window
- Audit log service: structured query API over `ledger_events` for compliance reporting

### Data Models
`LedgerEvent`

### API Routes
`GET /api/audit/events`, `GET /api/audit/events/:aggregateType/:aggregateId`

---

### Module 5 — Admin Console & Tenant Management

**Pillar:** Platform

### Purpose
Provides super-admin controls for managing tenants, users, platform health, offboarding workflows, fair-lending monitoring, and AI governance. The central operations nerve center for the platform operator.

### Key Features
- Tenant lifecycle: create, update, suspend, feature-flag configuration
- Usage analytics per tenant: business count, funding volume, API call metrics
- User administration: role assignment, activation/deactivation
- Offboarding workflow: initiate, exit interview, data export, data deletion
- Fair-lending dashboard: adverse-action rates, demographic monitoring, ECOA coverage
- AI governance: decision log, override tracking, model version management, drift metrics
- System health aggregation across services

### Data Models
`Tenant`, `User`, `AuditLog`, `LedgerEvent`

### Events Emitted
`offboarding.initiated`, `offboarding.completed`

### API Routes
`POST /api/admin/tenants`, `GET /api/admin/tenants`, `PUT /api/admin/tenants/:id`, `PUT /api/admin/tenants/:id/flags`, `GET /api/admin/tenants/:id/usage`, `POST /api/offboarding/initiate`, `GET /api/offboarding/:id`, `POST /api/offboarding/:id/exit-interview`, `POST /api/offboarding/:id/export`, `POST /api/offboarding/:id/delete-data`, `GET /api/fair-lending/dashboard`, `POST /api/fair-lending/records`, `GET /api/fair-lending/coverage`, `GET /api/fair-lending/adverse-action`, `GET /api/ai-governance/decisions`, `POST /api/ai-governance/decisions`, `POST /api/ai-governance/decisions/:id/override`, `GET /api/ai-governance/metrics`, `GET /api/ai-governance/versions`

---

### Module 6 — Integration Layer, API Portal & Business Continuity

**Pillar:** Platform

### Purpose
Manages integrations with external financial data providers, exposes a self-serve API key portal for partner developers, and provides observability and backup/recovery capabilities for business continuity.

### Key Features
- Provider integrations: connect/disconnect financial data providers via OAuth-style webhooks
- Webhook ingestion: secure inbound webhook receiver per provider
- API key management: create, list, revoke API keys for tenant developer access
- Observability endpoints: real-time health and metrics aggregation
- Business continuity: manual backup trigger, backup status history

### Data Models
`IntegrationConfig`, `ApiKey`, `BackupRecord`

### Events Emitted
`integration.connected`, `integration.disconnected`

### API Routes
`POST /api/integrations/:provider/connect`, `DELETE /api/integrations/:provider/disconnect`, `POST /api/integrations/:provider/webhook`, `GET /api/api-keys`, `POST /api/api-keys`, `DELETE /api/api-keys/:id`, `GET /api/observability/health`, `GET /api/observability/metrics`, `POST /api/backups/trigger`, `GET /api/backups`

---

### Module 7 — Partner & Vendor Governance

**Pillar:** Platform

### Purpose
Manages the lifecycle of referral partners, white-label resellers, and third-party vendors. Provides vendor scorecards, contract renewal workflows, subprocessor registration, and referral attribution with fee tracking.

### Key Features
- Partner onboarding: legal entity capture, contract terms, compensation structure
- Vendor scorecard: automated performance scoring across quality, compliance, SLA dimensions
- Annual renewal workflow: renewal initiation, review, completion with audit trail
- Subprocessor registry: track and approve all data subprocessors per GLBA/GDPR
- Referral attribution: multi-touch attribution per business, fee status tracking
- Referral agreement generation and consent capture with revocation support
- Tenant-level referral analytics dashboard

### Data Models
`Partner`, `Subprocessor`, `ReferralAttribution`

### Events Emitted
`partner.onboarded`, `partner.renewed`, `referral.attributed`

### API Routes
`POST /api/partners`, `GET /api/partners`, `PUT /api/partners/:id`, `GET /api/partners/:id/scorecard`, `POST /api/partners/:id/review`, `POST /api/partners/:id/renewal`, `POST /api/partners/:id/renewal/complete`, `POST /api/partners/:id/subprocessors`, `GET /api/partners/:id/subprocessors`, `POST /api/businesses/:id/referrals`, `GET /api/businesses/:id/referrals`, `POST /api/referrals/:id/fee-status`, `POST /api/referrals/agreement`, `POST /api/referrals/consent`, `DELETE /api/referrals/consent/:consentId`, `GET /api/referrals/analytics`

---

### Module 8 — Billing & SaaS Entitlements

**Pillar:** Platform

### Purpose
Manages advisor/tenant billing, invoice generation, payment recording, and SaaS plan entitlement enforcement. Supports tiered plans (starter, professional, enterprise) with usage-based overage detection.

### Key Features
- Invoice generation by deal structure: card stacking, credit repair, consulting, white-label, enterprise
- Fee schedule per deal structure with percentage-of-funding and program fee components
- Invoice lifecycle: draft → due → paid with Stripe payment ID linkage
- SaaS plan management: plan assignment, entitlement checking per module, overage detection
- Usage recording: metric-level tracking with increment support
- Tenant plan retrieval with real-time overage status

### Data Models
`Invoice`, `TenantPlan`, `UsageRecord`

### Events Emitted
`invoice.generated`, `invoice.paid`, `entitlement.exceeded`

### API Routes
`POST /api/businesses/:id/invoices`, `GET /api/businesses/:id/invoices`, `GET /api/invoices/:id`, `POST /api/invoices/:id/pay`, `GET /api/tenants/:tenantId/plan`, `GET /api/tenants/:tenantId/usage`, `POST /api/tenants/:tenantId/usage/record`

---

### Module 9 — Communication Compliance & Training

**Pillar:** Platform

### Purpose
Enforces compliant advisor communications by scanning scripts and emails, managing approved script libraries, tracking advisor training certifications, and scoring call quality against compliance rubrics.

### Key Features
- Communication scan: UDAP/TCPA/FDCPA scan of advisor scripts and email templates
- Script library: versioned approved scripts with multi-jurisdictional compliance tagging
- Training certification tracking: module completion, certification expiry, re-certification alerts
- QA scoring: per-call quality scores with advisor performance dashboards
- Compliance rubric enforcement: mandatory disclosure checking, prohibited phrase detection

### Data Models
`CommComplianceScan`, `ApprovedScript`, `TrainingCertification`, `QaScore`

### Events Emitted
`script.approved`, `certification.completed`, `qa.violation.detected`

### API Routes
`POST /api/comm-compliance/scan`, `GET /api/scripts`, `POST /api/scripts`, `GET /api/training/certifications`, `POST /api/training/certifications/:id/complete`, `GET /api/advisors/:id/qa-scores`, `POST /api/advisors/:id/qa-scores`

---

### Module 10 — Complaint & Remediation Center

**Pillar:** Platform

### Purpose
Provides a structured workflow for capturing, tracking, and resolving client complaints. Includes a Regulator Response Workspace for managing formal regulatory inquiries and producing investigation dossiers.

### Key Features
- Complaint intake: channel, category, severity classification
- Evidence attachment: link documents, call recordings, and communications to complaints
- Resolution workflow: assignment, investigation notes, closure with remediation summary
- Analytics dashboard: complaint rates by advisor, channel, and category
- Regulator inquiry management: dossier generation, inquiry status tracking, export for submission
- SLA enforcement: escalation triggers based on complaint age and severity

### Data Models
`Complaint`, `ComplaintEvidence`, `RegulatorInquiry`

### Events Emitted
`complaint.opened`, `complaint.resolved`, `regulator.inquiry.received`

### API Routes
`POST /api/complaints`, `GET /api/complaints`, `GET /api/complaints/analytics`, `PUT /api/complaints/:id`, `POST /api/complaints/:id/evidence`, `POST /api/regulator/inquiries`, `GET /api/regulator/inquiries`, `PUT /api/regulator/inquiries/:id`, `POST /api/regulator/inquiries/:id/export-dossier`

---

### Module 11 — Contract Intelligence & Disclosure CMS

**Pillar:** Platform

### Purpose
Provides AI-assisted contract analysis for red-flag detection and clause comparison, combined with a versioned disclosure template CMS that manages the lifecycle of all client-facing regulatory disclosures.

### Key Features
- Contract red-flag analysis: personal guarantee terms, default provisions, rate change clauses
- Multi-contract comparison: side-by-side clause analysis for issuer agreement variations
- Disclosure CMS: create, version, approve, and activate disclosure templates
- Approval workflow: submit → approve flow with compliance officer sign-off
- Template history: full audit trail of all template versions and approvals
- Bulk disclosure rendering: render personalized disclosures from templates for any business

### Data Models
`ContractAnalysis`, `DisclosureTemplate`, `DisclosureApproval`

### Events Emitted
`contract.analyzed`, `disclosure.template.approved`, `disclosure.rendered`

### API Routes
`POST /api/contracts/analyze`, `GET /api/contracts/analyses`, `GET /api/contracts/:id/red-flags`, `POST /api/contracts/compare`, `GET /api/disclosures/templates`, `POST /api/disclosures/templates`, `PUT /api/disclosures/templates/:id`, `POST /api/disclosures/templates/:id/submit`, `POST /api/disclosures/templates/:id/approve`, `GET /api/disclosures/templates/:id/history`, `POST /api/disclosures/render`, `POST /api/disclosures/render-all`, `POST /api/disclosures/seed`

---

### Module 12 — Workflow Engine & Policy Orchestration

**Pillar:** Platform

### Purpose
Provides a configurable, tenant-specific rule engine that evaluates deal context against a library of workflow rules and policy rules to gate progression, trigger compliance checks, require approvals, and enforce state-law obligations.

### Key Features
- Workflow rule authoring: condition/action DSL with 11 action types and 11 comparison operators
- Deal context evaluation: real-time rule matching against business, credit, compliance, and document state
- Policy rule library: typed rules for eligibility, disclosure gates, document gates, compliance holds, state law, suitability
- Rules versioning: draft → test → staging → production deployment with rollback support
- Audit trail per rule deployment and rollback event

### Data Models
`WorkflowRule`, `PolicyRule`, `RuleVersion`

### Events Emitted
`workflow.rule.triggered`, `policy.rule.matched`, `rule.deployed`, `rule.rolled_back`

### API Routes
`POST /api/workflow/rules`, `GET /api/workflow/rules`, `POST /api/workflow/evaluate`, `GET /api/policy/rules`, `POST /api/policy/rules`, `GET /api/rules/versions`, `POST /api/rules/versions/:id/deploy`, `POST /api/rules/versions/:id/rollback`

---

### Module 13 — VoiceForge Integration Layer

**Pillar:** Platform

### Purpose
Bridges the CapitalForge compliance engine with the VoiceForge outbound calling platform. Enforces TCPA consent gates before every call, monitors call compliance in real-time, and posts call events to the canonical ledger.

### Key Features
- TCPA consent gate: mandatory consent check before any outbound call is initiated
- Call event ingestion: ingest completed call records with compliance outcome
- Violation detection: flag calls missing consent, prohibited language, or disclosure omissions
- Outreach campaign management: create and track multi-call outreach sequences
- QA scoring pipeline: post-call quality scoring with rubric enforcement
- Canonical ledger integration: all call events persisted as `call.completed` or `call.compliance.violation`

### Data Models
`CallRecord`, `OutreachCampaign`, `CallQaScore`

### Events Emitted
`call.completed`, `call.compliance.violation`, `campaign.started`, `campaign.completed`

### API Routes
See `docs/voiceforge-integration.md` for full VoiceForge route documentation.

---

### Module 14 — VisionAudioForge Integration Layer

**Pillar:** Platform

### Purpose
Bridges CapitalForge with the VisionAudioForge AI document processing platform. Orchestrates OCR pipelines, enforces maker-checker review for extracted data, and integrates processed documents into the compliance and funding workflows.

### Key Features
- OCR pipeline orchestration: trigger and monitor document processing jobs
- Agent orchestration: coordinate multi-agent extraction workflows for complex documents
- Maker-checker enforcement: every AI extraction requires human review before use
- Document processing flow: raw upload → OCR → extraction → review → ingestion
- Integration with Document Vault: processed documents stored as immutable vault records
- Audit trail: full lineage from raw document to extracted field values

### Data Models
`OcrJob`, `ExtractionResult`, `MakerCheckerReview`

### Events Emitted
`document.ocr.completed`, `extraction.review.required`, `extraction.approved`

### API Routes
See `docs/visionaudioforge-integration.md` for full VisionAudioForge route documentation.

---

### Module 15 — Regulatory Intelligence & State Law Mapper

**Pillar:** Platform

### Purpose
Provides a jurisdiction-aware regulatory intelligence layer that maps applicable state laws, disclosure requirements, and licensing obligations to every business based on its state of formation and the states where it operates.

### Key Features
- 50-state law database: SB 1235 analogs, commercial financing disclosure laws, broker licensing requirements
- Automatic jurisdiction detection from `business.stateOfFormation`
- Compliance requirement checklist per business: required disclosures, registration deadlines, renewal dates
- Regulatory update feed: track law changes and flag affected businesses
- State-specific UDAP rule application

### Data Models
`StateLawRequirement`, `BusinessComplianceRequirement`

### Events Emitted
`state.law.requirement.detected`, `regulatory.deadline.approaching`

### API Routes
`GET /api/regulatory/requirements`, `GET /api/businesses/:id/regulatory/checklist`, `POST /api/regulatory/scan`

---

## Intelligence Pillar

### Module 16 — Credit Intelligence Engine

**Pillar:** Intelligence

### Purpose
Ingests credit profile data from multiple bureaus, normalizes scores across scoring models, and produces a unified credit picture for each business and its principals.

### Key Features
- Multi-bureau support: Equifax, TransUnion, Experian (personal), Dun & Bradstreet (business)
- Score normalization: FICO (300-850), VantageScore (300-850), SBSS (0-300), Paydex (0-100)
- Tradeline analysis: age, balance, limit, status, payment history
- Utilization calculation across all revolving accounts
- Inquiry velocity tracking (90-day window)
- Bureau comparison view for cross-bureau discrepancy detection
- Historical profile snapshots for audit and trend analysis

### Data Models
`CreditProfile`

### API Routes
`GET /api/businesses/:id/credit`, `POST /api/businesses/:id/credit/pull`, `GET /api/businesses/:id/credit/roadmap`, `POST /api/businesses/:id/credit-profiles`, `GET /api/businesses/:id/credit-profiles`, `GET /api/businesses/:id/credit-profiles/latest`

---

### Module 17 — Funding Readiness Scorer

**Pillar:** Intelligence

### Purpose
Produces a composite funding readiness score (0-100) that quantifies how prepared a business is to successfully obtain commercial credit card funding.

### Key Features
- Composite scoring across five factor categories: credit health (30%), entity maturity (20%), revenue strength (20%), documentation completeness (15%), existing debt load (15%)
- Per-factor breakdown with numeric contribution and label
- Actionable recommendations sorted by score impact
- Score trend tracking across multiple assessments
- No-go threshold integration (score < 30 blocks funding round initiation)

### Data Models
`Business` (writes `fundingReadinessScore`), `SuitabilityCheck`

### Events Emitted
`suitability.assessed`

### API Routes
`POST /api/businesses/:id/readiness-score`, `GET /api/businesses/:id/readiness-score/latest`

---

### Module 18 — Leverage Calculator

**Pillar:** Intelligence

### Purpose
Computes the true total cost of capital for a proposed credit card funding program, including all fee components, effective APR, and cash-flow projections under three scenarios.

### Key Features
- Fee component breakdown: program fees, % of funding fee, annual card fees, cash advance fees, processor fees
- Effective APR computation across the full funding term
- IRC § 163(j) business interest deduction impact analysis
- Three-scenario cash-flow projections: best case, base case, worst case
- Per-card and aggregate calculation views
- Results persisted for compliance disclosure requirements (SB 1235)

### Data Models
`CostCalculation`

### API Routes
`POST /api/businesses/:id/cost-calculations`, `GET /api/businesses/:id/cost-calculations`, `GET /api/businesses/:id/cost-calculations/:calcId`

---

### Module 19 — Fraud Detection

**Pillar:** Intelligence

### Purpose
Detects behavioral anomalies, velocity violations, and identity inconsistencies across business intake, credit pulls, and application submissions to flag potentially fraudulent actors before funding is authorized.

### Key Features
- Behavioral anomaly scoring: rapid application velocity, unusual geographic patterns
- Identity inconsistency detection: cross-field consistency checks (EIN, address, owner SSN)
- Velocity rule engine: configurable thresholds for inquiry rates, application rates
- Risk scoring: fraud probability score (0-100) with per-signal breakdown
- Integration with KYB/KYC and sanctions screening for combined risk picture

### Data Models
`FraudSignal`, `FraudCheck`

### Events Emitted
`fraud.signal.detected`, `fraud.check.completed`

### API Routes
`POST /api/businesses/:id/fraud-check`, `GET /api/businesses/:id/fraud-signals`

---

### Module 20 — Sanctions Screening

**Pillar:** Intelligence

### Purpose
Screens all business entities and beneficial owners against OFAC SDN, PEP, and adverse media databases before any funding activity is authorized.

### Key Features
- OFAC SDN list screening with configurable match threshold
- PEP (Politically Exposed Persons) database matching
- Adverse media screening via third-party provider integration
- Match review workflow: potential matches queued for compliance officer review
- Continuous monitoring: re-screen on business or owner data changes
- Export for regulatory reporting

### Data Models
`SanctionsScreening`, `ScreeningMatch`

### Events Emitted
`sanctions.screening.completed`, `sanctions.match.found`

### API Routes
`POST /api/businesses/:id/sanctions-screen`, `GET /api/businesses/:id/sanctions-screenings`

---

### Module 21 — Card Stacking Optimizer

**Pillar:** Intelligence

### Purpose
Produces issuer-sequenced card stacking recommendations based on the business's credit profile, existing card portfolio, and issuer velocity rules. Generates the optimal application order to maximize approval probability and total approved credit.

### Key Features
- Issuer velocity rule enforcement: Chase 5/24, Amex 90-day, Citi 8/65, BoA 2/3/4
- Credit-profile-aware filtering: excludes issuers with low approval probability for the given profile
- Optimal sequencing: orders applications to minimize hard inquiry overlap
- What-if scenario simulation: model different profile states without persisting
- Cached results: latest recommendation available without re-running the optimizer

### Data Models
`OptimizerResult`

### Events Emitted
`optimizer.recommendation.generated`

### API Routes
`POST /api/businesses/:id/optimize`, `GET /api/businesses/:id/optimizer/results`, `POST /api/businesses/:id/optimizer/simulate`

---

### Module 22 — Funding Simulator & Sandbox

**Pillar:** Intelligence

### Purpose
Provides a safe simulation environment for advisors to model funding scenarios, test what-if parameter changes, and practice building funding plans against synthetic client archetypes. Includes a regression test suite for model validation.

### Key Features
- Full scenario simulation: FICO, utilization, derogatory count, revenue, existing debt as inputs
- What-if overrides: modify any input parameter and compare outcome delta
- Side-by-side scenario comparison with delta metrics
- 50+ synthetic client archetypes organized by FICO tier, industry, and revenue band
- Advisor practice mode: submit a funding plan against an archetype and receive scored feedback
- Regression test suite: validate optimizer model consistency across all archetypes
- Funding round simulation: model a multi-card application round for an archetype

### Data Models
`SimulatorResult`, `SandboxProfile`, `PracticeResult`

### API Routes
`POST /api/simulator/run`, `POST /api/simulator/compare`, `GET /api/sandbox/profiles`, `POST /api/sandbox/profiles`, `POST /api/sandbox/practice`, `POST /api/sandbox/regression`, `POST /api/sandbox/simulate-round`

---

### Module 23 — Decision Explainability Engine

**Pillar:** Intelligence

### Purpose
Provides plain-language explanations for all AI-driven decisions including suitability assessments, card recommendations, and optimizer exclusions. Supports human override capture with full audit trails.

### Key Features
- Suitability decision explanations: per-factor narrative with score breakdown
- Card recommendation explanations: why a card was included or excluded from the stack
- Human override capture: compliance officer override with justification and outcome logging
- Decision audit trail: full history of every AI decision and any overrides per business
- Integration with AI governance dashboard

### Data Models
`DecisionLog`, `HumanOverride`

### Events Emitted
`decision.explained`, `decision.overridden`

### API Routes
`GET /api/businesses/:id/decisions/explain`, `GET /api/decisions/:id/audit-trail`, `POST /api/decisions/:id/override`, `POST /api/businesses/:id/decisions/explain/suitability`, `POST /api/decisions/explain/card`

---

### Module 24 — Deal Committee & Escalation Engine

**Pillar:** Intelligence

### Purpose
Provides a structured escalation and review workflow for high-risk deals that require committee-level oversight. Enforces multi-member voting, conditional approval, and counsel/accountant sign-off before funding proceeds.

### Key Features
- Auto-escalation: deals with suitability score < 50 or high/critical compliance risk are automatically escalated
- Red-flag checklist: ECOA-compliant evaluation of triggered risk flags
- Risk tier classification: low/medium/high/critical tier assignment with metadata
- Committee voting: approve/reject/abstain per member with comment capture
- Conditional approval: attach conditions with assignee, due date, and completion tracking
- Counsel and accountant sign-off workflows
- Status machine: `pending → in_review → approved/approved_conditional/rejected/escalated`

### Data Models
`DealReview`, `CommitteeVote`, `ReviewCondition`, `ReviewSignoff`

### Events Emitted
`deal.review.created`, `deal.review.approved`, `deal.review.rejected`

### API Routes
`POST /api/businesses/:id/deal-review`, `GET /api/deal-reviews`, `GET /api/deal-reviews/:id`, `PUT /api/deal-reviews/:id`, `POST /api/deal-reviews/:id/vote`, `POST /api/deal-reviews/:id/signoff`

---

### Module 25 — Portfolio Benchmarking & Analytics

**Pillar:** Intelligence

### Purpose
Produces benchmarked approval rate analytics, portfolio risk heatmaps, promo APR survival analysis, complaint rate dashboards, and cohort profitability reports. Powers the advisor and compliance officer analytics dashboards.

### Key Features
- Approval rate benchmarks by issuer, industry, FICO band, and state
- Portfolio risk heatmap: issuer × FICO band matrix with approval and denial rates
- Promo APR survival analysis: percentage of funding rounds that pay off before rate reset
- Complaint rate analytics by vendor, advisor, and channel
- Cohort profitability: quarterly cohort revenue vs. cost analysis

### Data Models
`BenchmarkRecord`, `ComplaintRecord`

### Events Emitted
None directly — read-only analytics over existing data.

### API Routes
`GET /api/portfolio/benchmarks`, `GET /api/portfolio/heatmap`, `GET /api/portfolio/promo-survival`, `GET /api/portfolio/complaint-rates`, `GET /api/portfolio/cohort-profitability`

---

### Module 26 — Issuer Relationship Manager

**Pillar:** Intelligence

### Purpose
Manages relationships with card issuer contacts, tracks reconsideration hotline outcomes, and surfaces monthly approval trend data to help advisors build issuer intelligence over time.

### Key Features
- Issuer contact directory: contact name, role, phone, reconsideration line, email, relationship score
- Reconsideration outcome tracking: call result, reversal rate by issuer
- Monthly approval trend analysis by issuer with trend visualization data
- Relationship score tracking for advisor-level issuer rapport management

### Data Models
`IssuerContact`, `ReconsiderationOutcome`

### API Routes
`GET /api/issuers/contacts`, `POST /api/issuers/contacts`, `GET /api/issuers/contacts/:id`, `PATCH /api/issuers/contacts/:id`, `GET /api/issuers/reconsideration-outcomes`, `GET /api/issuers/:issuer/trends`

---

### Module 27 — CRM Pipeline & Client Timeline

**Pillar:** Intelligence

### Purpose
Provides a CRM pipeline view with stage management, revenue analytics, advisor performance dashboards, and chronological client timeline tracking. Gives advisors a single view of their full book of business.

### Key Features
- Pipeline stages: prospect → onboarding → active → graduated → churned
- Stage transition workflow with optional advisor reassignment and notes
- Revenue analytics by advisor, product, and period with date-range filtering
- Advisor performance dashboard: approval rates, revenue, client satisfaction, compliance metrics
- Client timeline: chronological event history for a specific business

### Data Models
`Business` (pipeline stage), `LedgerEvent`

### Events Emitted
`pipeline.stage.transitioned`

### API Routes
`GET /api/crm/pipeline`, `GET /api/crm/revenue`, `GET /api/crm/advisors/:id/performance`, `GET /api/crm/businesses/:id/timeline`, `POST /api/crm/businesses/:id/pipeline/stage`

---

### Module 28 — Regulatory Intelligence Monitoring

**Pillar:** Intelligence

### Purpose
Continuously monitors regulatory update sources and surfaces new rule changes, enforcement actions, and compliance deadlines relevant to the commercial funding and credit card stacking space.

### Key Features
- Regulatory change feed: CFPB, FTC, state DFPI updates
- Impact scoring: flag businesses affected by new regulations
- Deadline tracking: compliance deadlines per regulation with alert windows
- Enforcement action database: track relevant enforcement actions for adverse pattern detection

### Data Models
`RegulatoryUpdate`, `EnforcementAction`

### Events Emitted
`regulatory.update.published`, `compliance.deadline.approaching`

### API Routes
`GET /api/regulatory/updates`, `GET /api/regulatory/enforcement-actions`

---

## Orchestration Pillar

### Module 29 — Funding Round Orchestrator

**Pillar:** Orchestration

### Purpose
Manages the complete lifecycle of a funding round — a planned or active batch of credit card applications targeting a specific credit volume.

### Key Features
- Multi-round support: businesses can have sequential rounds
- Target planning: configurable target credit volume and card count per round
- Round state machine: `planning → active → completed → archived`
- Issuer sequencing rules: Chase 5/24, Amex 90-day, Citi 8/65
- APR expiry date tracking per round
- Round summary reports

### Data Models
`FundingRound`, `CardApplication`

### Events Emitted
`round.started`, `round.completed`

### API Routes
`POST /api/businesses/:id/funding-rounds`, `GET /api/businesses/:id/funding-rounds`, `GET /api/businesses/:id/funding-rounds/:roundId`, `PATCH /api/businesses/:id/funding-rounds/:roundId`

---

### Module 30 — Card Application Manager

**Pillar:** Orchestration

### Purpose
Tracks the state of each individual credit card application from draft through decision, capturing all material terms and linking each application to the appropriate funding round and consent records.

### Key Features
- Application state machine: `draft → submitted → approved → declined → cancelled`
- Material terms capture: credit limit, intro APR, intro APR expiry, regular APR, annual fee
- Adverse action notice (AAN) capture and storage
- Consent linkage — application cannot be submitted without a valid TCPA consent record
- Application gate checks: pre-submission eligibility validation

### Data Models
`CardApplication`

### Events Emitted
`application.submitted`, `card.approved`, `card.declined`

### API Routes
`POST /api/businesses/:id/applications`, `GET /api/businesses/:id/applications`, `GET /api/businesses/:id/applications/:appId`, `PATCH /api/businesses/:id/applications/:appId`

---

### Module 31 — APR Expiry Alert Engine

**Pillar:** Orchestration

### Purpose
Proactively alerts advisors and clients when a funding round's intro APR period is approaching expiration.

### Key Features
- Automated alert delivery at 60, 30, and 15 days before intro APR expiry
- BullMQ scheduled jobs with idempotent alert deduplication
- Alert channels: email, in-app notification, webhook
- Alert suppression if the round has already been completed or archived
- Restack opportunity scoring triggered on 30-day alert

### Data Models
`FundingRound` (reads `aprExpiryDate`, writes alert flags)

### Events Emitted
`apr.expiry.approaching` (with `daysRemaining` in payload: 60, 30, or 15)

### Background Jobs
`apr-expiry-check` — runs daily via BullMQ cron

---

### Module 32 — Repayment Command Center

**Pillar:** Orchestration

### Purpose
Provides avalanche and snowball repayment strategies, payment schedules, and interest-shock forecasting tools to help businesses manage their credit card debt portfolio after funding.

### Key Features
- Repayment strategies: avalanche (highest APR first) and snowball (lowest balance first)
- Monthly payment budget allocation across all cards in the portfolio
- Payment schedule generation with per-period entries
- Actual payment recording against scheduled entries (underpayment detection)
- Interest-shock forecast: projects cost when intro APR periods expire
- Refinancing plan builder: balance transfer analysis with fee and APR modeling
- Autopay status checking across all cards

### Data Models
`RepaymentPlan`, `PaymentSchedule`

### Events Emitted
`repayment.plan.created`, `payment.recorded`

### API Routes
`POST /api/businesses/:id/repayment/plan`, `GET /api/businesses/:id/repayment/plan`, `GET /api/businesses/:id/repayment/schedule`, `PUT /api/repayment/schedule/:id/paid`, `GET /api/businesses/:id/repayment/forecast`

---

### Module 33 — Hardship Management & Settlement

**Pillar:** Orchestration

### Purpose
Detects financial hardship triggers, opens structured hardship cases, and orchestrates payment plans, settlement offers, and credit counselor referrals to help distressed clients navigate their obligations.

### Key Features
- Hardship trigger detection: missed payment count, utilization spike, revenue decline thresholds
- Severity classification: minor / serious / critical
- Case lifecycle: `open → payment_plan / settlement / referred / closed`
- Payment plan builder: budget-based allocation across card portfolio
- Settlement offer calculator: negotiated reduction based on severity and total balance
- Card closure sequencing: prioritized closure order to minimize credit impact
- Credit counselor referral generation

### Data Models
`HardshipCase`, `PaymentPlan`, `SettlementOffer`

### Events Emitted
`hardship.case.opened`, `hardship.case.resolved`

### API Routes
`POST /api/businesses/:id/hardship`, `GET /api/businesses/:id/hardship`, `PUT /api/hardship/:id`, `POST /api/hardship/:id/payment-plan`, `POST /api/hardship/:id/settlement`

---

### Module 34 — Auto-Restack & Outreach Trigger

**Pillar:** Orchestration

### Purpose
Evaluates whether a business has recovered from hardship and is ready for a new funding round. Builds personalized outreach triggers for advisor follow-up when restack readiness is detected.

### Key Features
- Restack readiness scoring: 0-100 score with bands (not_ready, building, approaching, ready, optimal)
- Input factors: on-time payment months, utilization recovery, credit score recovery, hardship case status
- Outreach trigger builder: personalized trigger with messaging, urgency, and recommended actions
- Conversion attribution: track restack triggers that convert to new funding rounds with revenue attribution

### Data Models
`RestackTrigger`, `RestackConversion`

### Events Emitted
`restack.trigger.fired`, `restack.conversion.recorded`

### API Routes
`GET /api/businesses/:id/restack/readiness`, `POST /api/businesses/:id/restack/trigger`

---

### Module 35 — Decline Recovery & Reconsideration

**Pillar:** Orchestration

### Purpose
Manages the recovery workflow after a card application is declined. Categorizes decline reasons, generates ECOA-compliant reconsideration letters, and provides issuer-specific reapply cooldown calendars.

### Key Features
- Decline reason categorization: credit, income, identity, velocity, policy
- ECOA-compliant reconsideration letter generation with business-specific personalization
- Issuer reapply cooldown calendar: days remaining and reapply eligible date per issuer
- Decline recovery record storage with letter ID linkage

### Data Models
`DeclineRecovery`, `ReconsiderationLetter`

### Events Emitted
`decline.recovery.opened`, `reconsideration.letter.generated`

### API Routes
`GET /api/businesses/:id/declines`, `GET /api/declines/:id`, `POST /api/declines/:id/reconsideration`, `GET /api/declines/:id/cooldown`

---

### Module 36 — Client Graduation & Credit Builder

**Pillar:** Orchestration

### Purpose
Tracks client progression through funding tracks (starter through enterprise) and builds personalized DUNS registration, tradeline, and SBSS milestone roadmaps to help businesses build their business credit profile.

### Key Features
- Graduation tracks: starter (< $25K), growth ($25K–$75K), established ($75K–$150K), advanced ($150K–$300K), enterprise ($300K+)
- Assessment inputs: FICO, business age, revenue, SBSS score, tradeline count, utilization
- Milestone gates: per-track eligibility criteria with gap analysis
- Action roadmap: prioritized next steps to reach the next track
- Credit builder roadmap: DUNS registration steps, recommended vendors, SBSS milestone progress
- Stacking unlock evaluation: minimum criteria to be eligible for card stacking

### Data Models
`GraduationAssessment`, `CreditRoadmap`

### Events Emitted
`graduation.track.advanced`, `credit.milestone.achieved`

### API Routes
`GET /api/businesses/:id/graduation/status`, `POST /api/businesses/:id/graduation/assess`, `GET /api/businesses/:id/credit-builder/roadmap`, `POST /api/businesses/:id/credit-builder/milestones`

---

### Module 37 — Statement Reconciliation

**Pillar:** Orchestration

### Purpose
Ingests, normalizes, and reconciles credit card statements across issuers. Detects balance mismatches, fee anomalies, and billing irregularities, and provides an email statement parser for inbox-forwarded statements.

### Key Features
- Multi-issuer normalization: issuer-specific raw format → unified `NormalizedStatement` schema
- Balance mismatch detection: computed balance vs. stated closing balance
- Fee anomaly detection: unexpected fee types or amounts outside tolerance
- Anomaly severity classification: low / medium / high / critical
- Reconciliation workflow: advisor marks statements as reviewed with notes
- Email statement parser: extract fields from forwarded statement email bodies

### Data Models
`StatementRecord`, `StatementAnomaly`

### Events Emitted
`statement.ingested`, `statement.anomaly.detected`, `statement.reconciled`

### API Routes
`POST /api/businesses/:id/statements`, `GET /api/businesses/:id/statements`, `GET /api/statements/:statementId`, `GET /api/businesses/:id/statements/anomalies`, `POST /api/businesses/:id/statements/:statementId/reconcile`, `POST /api/statements/parse-email`

---

### Module 38 — Rewards Optimization & Card Benefits

**Pillar:** Orchestration

### Purpose
Optimizes spend routing across the card portfolio to maximize rewards earnings per MCC category, and manages card benefit utilization tracking and renewal decision recommendations.

### Key Features
- Spend profile optimization: map spending categories to highest-earning cards
- Annual reward vs. fee analysis: per-card net benefit with keep/worth assessment
- Category coverage: office supplies, gas, dining, travel, advertising, utilities, technology, and more
- Benefit registry: track per-card benefits (credits, lounge access, statement credits)
- Benefit utilization tracking: mark benefits as utilized with timestamp
- Renewal recommendations: keep / cancel / negotiate / product change per card
- Expiry alerts: flag approaching benefit expiration dates

### Data Models
`SpendProfile`, `CardBenefit`, `RenewalRecommendation`

### API Routes
`GET /api/businesses/:id/rewards/optimization`, `GET /api/businesses/:id/rewards/annual-summary`, `GET /api/businesses/:id/benefits`, `POST /api/businesses/:id/benefits/:benefitId/utilize`, `GET /api/businesses/:id/benefits/renewal-recommendations`

---

### Module 39 — Spend Governance & Business-Purpose Evidence

**Pillar:** Orchestration

### Purpose
Records and categorizes all business spend transactions, enforces network rule compliance (no personal use, no cash-like transactions), and generates tax substantiation exports for Schedule C deduction support.

### Key Features
- Transaction recording: amount, MCC, merchant, card linkage, business purpose, evidence doc
- Network rule enforcement: flag cash-like MCCs, personal-use categories, suspicious payment rails
- Risk summary: aggregated risk score across all transactions with flagged transaction breakdown
- Business purpose tagging: advisor-annotated purpose notes with document vault evidence
- Invoice matching: match transactions to vault-stored invoices within amount and date tolerance
- Tax substantiation export: Schedule C line mapping, deductibility flags, evidence reference links
- Network rule violation report: all flagged transactions for advisor review

### Data Models
`Transaction`, `TransactionEvidence`

### Events Emitted
`transaction.recorded`, `network.rule.violation.detected`

### API Routes
`POST /api/businesses/:id/transactions`, `GET /api/businesses/:id/transactions`, `GET /api/businesses/:id/transactions/risk-summary`, `GET /api/businesses/:id/business-purpose/export`, `POST /api/businesses/:id/transactions/:txId/tag`, `POST /api/businesses/:id/transactions/:txId/match-invoice`, `GET /api/businesses/:id/business-purpose/violations`

---

### Module 40 — Tax Document & IRC 163(j) Engine

**Pillar:** Orchestration

### Purpose
Generates IRC § 163(j) business interest deductibility reports, year-end fee summaries, and accountant-ready export packages. Provides data lineage tracking so every reported figure can be traced back to its source.

### Key Features
- IRC § 163(j) computation: 30% ATI limitation, carryforward calculation, floor plan exemption
- Year-end fee summary: aggregate annual fees, program fees, CA fees, processor fees by card
- Accountant export package: JSON and CSV export with full fee detail and §163(j) report
- Data lineage: column-level lineage for every computed field
- Lineage graph: full end-to-end DAG from raw input to reported output
- Change detection: compare a snapshot against current upstream values for drift alerts
- Lineage snapshot: capture current state for future comparison

### Data Models
`TaxReport`, `LineageNode`, `LineageEdge`

### Events Emitted
`tax.report.generated`, `lineage.snapshot.captured`

### API Routes
`GET /api/businesses/:id/tax/163j-report`, `GET /api/businesses/:id/tax/year-end-summary`, `GET /api/businesses/:id/tax/export`, `GET /api/businesses/:id/lineage/:fieldPath`, `GET /api/businesses/:id/lineage/graph`, `POST /api/businesses/:id/lineage/detect-changes`, `POST /api/businesses/:id/lineage/snapshot`

---

### Module 41 — ACH Debit Control

**Pillar:** Orchestration

### Purpose
Manages authorized ACH debit agreements and monitors all debit events against the authorized terms. Detects unauthorized or out-of-tolerance debits and triggers immediate alerts.

### Key Features
- Authorized debit agreement capture: processor, authorized amount, frequency, signed document
- Authorization lifecycle: `active → suspended → revoked`
- Real-time debit event recording with tolerance-band enforcement
- Unauthorized debit detection and event bus alert
- Revocation workflow with processor notification timestamp tracking
- Unauthorized alert report per business

### Data Models
`AchAuthorization`, `DebitEvent`

### Events Emitted
`debit.authorized`, `debit.revoked`, `debit.unauthorized.detected`

### API Routes
`POST /api/businesses/:id/ach/authorize`, `DELETE /api/businesses/:id/ach/:authId`, `GET /api/businesses/:id/ach`, `POST /api/ach/debit-event`, `GET /api/businesses/:id/ach/alerts`

---

### Module 42 — Funds-Flow Classification

**Pillar:** Orchestration

### Purpose
Classifies all inbound and outbound fund flows to enforce business-use restrictions, detect co-mingling of personal and business funds, and produce clean cash-flow documentation for lender verification.

### Key Features
- Fund flow labeling: business revenue, owner injection, loan proceeds, operating expense
- Co-mingling detection: flag transactions with personal account characteristics
- Cash-flow documentation: clean monthly cash-flow summaries for lender use
- Lender-ready export: structured cash-flow report matching common underwriting formats

### Data Models
`FundFlow`, `CashFlowReport`

### Events Emitted
`fund.flow.classified`, `commingling.detected`

### API Routes
`POST /api/businesses/:id/fund-flows`, `GET /api/businesses/:id/fund-flows`, `GET /api/businesses/:id/fund-flows/report`

---

### Module 43 — Issuer Rules Engine

**Pillar:** Orchestration

### Purpose
Enforces issuer-specific application rules (Chase 5/24, Amex 90-day velocity, Citi 8/65, BoA 2/3/4) as a standalone service consumed by the Card Application Manager and Stacking Optimizer.

### Key Features
- Rule library: all major issuer-specific application rules
- Profile evaluation: pass/fail per issuer given the current card inventory and inquiry history
- Rule explanation: plain-language explanation of why a rule was triggered
- Configurable cooldown windows per issuer

### Data Models
`IssuerRule`, `RuleEvaluation`

---

### Module 44 — Application Gates

**Pillar:** Orchestration

### Purpose
Enforces multi-factor pre-submission eligibility checks before any card application can be submitted. Acts as the final gate that validates credit, suitability, consent, KYB, and disclosure requirements are all satisfied.

### Key Features
- Gate types: credit minimum, suitability score, KYB status, TCPA consent, product acknowledgments, SB 1235 disclosure
- Gate result: pass/fail per gate with blocking vs. advisory classification
- Aggregate eligibility: overall pass/fail with list of blocking failures
- Override support: supervisor override with documented reason for advisory failures

---

## Compliance Pillar

### Module 45 — Suitability & No-Go Engine

**Pillar:** Compliance

### Purpose
Provides a structured, auditable process for determining whether a business is a suitable candidate for credit card stacking. Enforces no-go thresholds to prevent advisors from proceeding with clients who pose excessive risk.

### Key Features
- Suitability score (0-100) derived from credit health, leverage ratio, business stability, industry risk
- Configurable no-go threshold (default: score < 30)
- High-risk warning threshold (score 30-50) with required advisor acknowledgment
- Multi-factor risk breakdown with per-factor contribution and narrative explanation
- Alternative product recommendations when no-go is triggered
- Supervisor override workflow with audit trail

### Data Models
`SuitabilityCheck`

### Events Emitted
`suitability.assessed`, `nogo.triggered`

### API Routes
`POST /api/businesses/:id/suitability`, `GET /api/businesses/:id/suitability/latest`, `POST /api/businesses/:id/suitability/:checkId/override`

---

### Module 46 — TCPA Consent Vault

**Pillar:** Compliance

### Purpose
Captures, stores, and manages the full lifecycle of consent records required under TCPA and related marketing consent regulations.

### Key Features
- Channel coverage: voice, SMS, email, partner referral, document signature
- Consent types: TCPA, data sharing, referral, application consent
- Immutable grant record: granted-at timestamp, IP address, evidence reference
- Revocation workflow: immediate status update with reason
- Consent verification API for pre-call/pre-SMS compliance gate
- Bulk consent status report

### Data Models
`ConsentRecord`

### Events Emitted
`consent.captured`, `consent.revoked`

### API Routes
`POST /api/consent`, `GET /api/businesses/:id/consent`, `GET /api/consent/:consentId`, `DELETE /api/consent/:consentId`

---

### Module 47 — Product Acknowledgment Engine

**Pillar:** Compliance

### Purpose
Ensures every client receives, reads, and digitally acknowledges all required product reality and risk disclosures before any credit application is submitted.

### Key Features
- Disclosure type coverage: product reality, fee schedule, personal guarantee, cash advance risk
- Versioned templates — version bumps require fresh acknowledgment
- Digital signature capture with timestamp and signature reference
- Document vault linkage for signed acknowledgments
- Pre-application gate: all required disclosure types must have active acknowledgment

### Data Models
`ProductAcknowledgment`, `Document`

### Events Emitted
`product.reality.acknowledged`

### API Routes
`GET /api/acknowledgment-templates`, `GET /api/acknowledgment-templates/:type`, `POST /api/businesses/:id/acknowledgments`, `GET /api/businesses/:id/acknowledgments`

---

### Module 48 — UDAP/UDAAP Compliance Monitor

**Pillar:** Compliance

### Purpose
Scans marketing copy, disclosure language, fee representations, and advisor-generated content against UDAP and UDAAP guardrails.

### Key Features
- Automated content scanning against a curated rule library of deceptive practices
- Risk scoring: low / medium / high / critical with per-finding explanations
- State-jurisdiction-aware rule sets
- Findings persistence with resolution workflow
- Integration with template engine — scans acknowledgment and disclosure templates on creation/update
- Compliance officer review queue with SLA tracking

### Data Models
`ComplianceCheck`

### Events Emitted
`compliance.check.completed`, `risk.alert.raised`

### API Routes
`POST /api/compliance/udap-check`, `GET /api/businesses/:id/compliance-checks`, `PATCH /api/compliance-checks/:checkId/resolve`

---

### Module 49 — Section 1071 Data Collection

**Pillar:** Compliance

### Purpose
Implements the CFPB's Section 1071 small business lending data collection requirements, including demographic collection with firewall provisions and annual data export in CFPB-conforming format.

### Key Features
- Required data fields: application date, credit type, amount, action taken, census tract, gross revenue, NAICS
- Voluntary demographic fields: race, ethnicity, sex (with "prefer not to say" option)
- Firewall provisions: demographic data access restricted to Section 1071 role only
- Coverage determination: flag applications as covered/excluded based on business size
- Annual data export in CFPB CSV/JSON format

### Data Models
`CardApplication`, `BusinessOwner`

### Events Emitted
`section.1071.data.captured`

### API Routes
`GET /api/compliance/1071-export`

---

### Module 50 — California SB 1235 Disclosures

**Pillar:** Compliance

### Purpose
Enforces California SB 1235 commercial financing disclosure requirements for California-domiciled businesses, including pre-consummation disclosure delivery, broker registration checks, and receipt record maintenance.

### Key Features
- Automatic disclosure trigger: `business.stateOfFormation === 'CA'` gates the flow
- SB 1235 disclosure template: all seven required fields pre-populated from Leverage Calculator
- Pre-consummation gate: disclosure required before application submission
- Disclosure receipt record in Document Vault with signature and timestamp
- Broker/CFL registration check
- Cost calculation linkage: exact figures used in disclosure retained for audit

### Data Models
`ProductAcknowledgment`, `CostCalculation`

### Events Emitted
`sb1235.disclosure.delivered`, `sb1235.disclosure.acknowledged`

---

### Module 51 — GLBA Data Protection

**Pillar:** Compliance

### Purpose
Enforces the Gramm-Leach-Bliley Act's data protection requirements including NPI encryption, access logging, privacy notice delivery, and retention controls.

### Key Features
- Field-level AES-256-GCM encryption for SSN, DOB, EIN at rest
- TLS 1.2+ in transit with HSTS
- NPI read access logged to `audit_logs`
- Privacy notice delivery via Product Acknowledgment Engine
- Legal hold for retention schedule enforcement

### Data Models
`User`, `BusinessOwner`, `AuditLog`, `Document`

---

### Module 52 — Fair Lending Monitor

**Pillar:** Compliance

### Purpose
Tracks adverse action rates across demographic categories to enable fair lending analysis, ECOA compliance monitoring, and CRA reporting. Provides the compliance officer dashboard for disparity detection.

### Key Features
- Adverse action rate tracking by race, gender, and geography
- Denial rate disparity alerts when demographic gaps exceed configurable thresholds
- Coverage report: percentage of applications with complete demographic data
- Fair lending records export for regulatory submission
- Integration with Section 1071 data pipeline

### Data Models
`FairLendingRecord`, `AdverseActionRecord`

### Events Emitted
`fair.lending.alert.raised`

### API Routes
`GET /api/fair-lending/dashboard`, `POST /api/fair-lending/records`, `GET /api/fair-lending/coverage`, `GET /api/fair-lending/adverse-action`

---

### Module 53 — AI Governance

**Pillar:** Compliance

### Purpose
Provides governance controls for all AI-driven decisions in the platform. Maintains decision logs, tracks model versions, monitors for model drift, and supports human override with full audit trails.

### Key Features
- Decision log: every AI decision recorded with model version, inputs, and output
- Override tracking: supervisor overrides with justification
- Model version registry: track deployed model versions and deployment dates
- Drift metrics: monitor output distribution shifts over time
- Governance dashboard: override rate, decision volume, model performance metrics

### Data Models
`AiDecisionLog`, `ModelVersion`

### Events Emitted
`ai.decision.logged`, `model.drift.detected`

### API Routes
`GET /api/ai-governance/decisions`, `POST /api/ai-governance/decisions`, `POST /api/ai-governance/decisions/:id/override`, `GET /api/ai-governance/metrics`, `GET /api/ai-governance/versions`

---

### Module 54 — Offboarding & Data Governance

**Pillar:** Compliance

### Purpose
Manages the structured offboarding of clients from the platform, including exit interviews, data export, and compliant data deletion with retention-period enforcement.

### Key Features
- Offboarding initiation: reason capture, advisor notification, account freeze
- Exit interview workflow: structured closure feedback capture
- Data export: full client data package for portability
- Data deletion: compliant deletion with retention-period check (legal holds honored)
- Offboarding audit trail: full ledger event history for the offboarding process

### Data Models
`OffboardingRecord`

### Events Emitted
`offboarding.initiated`, `offboarding.completed`

### API Routes
`POST /api/offboarding/initiate`, `GET /api/offboarding/:id`, `POST /api/offboarding/:id/exit-interview`, `POST /api/offboarding/:id/export`, `POST /api/offboarding/:id/delete-data`

---

### Module 55 — Product-Reality Acknowledgment Gate

**Pillar:** Compliance

### Purpose
Specifically enforces the product-reality acknowledgment requirement — the foundational disclosure that no client may proceed without. Ensures every client understands the nature of credit card stacking before any application.

### Key Features
- Mandatory gate on funding round initiation
- Template versioning with re-acknowledgment on version bump
- Clear plain-language statements: personal credit impact, personal liability, business servicing obligation
- Signature capture with date and document vault linkage
- Audit-ready receipt record

### Data Models
`ProductAcknowledgment`

### Events Emitted
`product.reality.acknowledged`

---

### Module 56 — ACH Funds-Flow Acknowledgment

**Pillar:** Compliance

### Purpose
Enforces signed ACH authorization requirements before any automated debit is permitted against a business's accounts. Maintains a complete authorization chain of custody.

### Key Features
- Authorization capture: processor, amount, frequency, signed document reference
- Authorization revocation with immediate effect
- Debit event monitoring against authorized terms
- Tolerance enforcement: flag debits outside ±5% of authorized amount

### Data Models
`AchAuthorization`, `DebitEvent`

### Events Emitted
`debit.authorized`, `debit.unauthorized.detected`

---

### Module 57 — Adverse Action Notice Engine

**Pillar:** Compliance

### Purpose
Generates ECOA and FCRA-compliant adverse action notices for all declined credit applications. Ensures every denial includes the required notice within the regulatory timeframe.

### Key Features
- ECOA-compliant AAN generation with required disclosure language
- FCRA notice for credit bureau-based declines
- Principal reasons capture (up to 5 coded reasons per ECOA)
- Delivery tracking: notice sent, delivered, acknowledged
- Integration with Decline Recovery module for reconsideration workflow

### Data Models
`AdverseActionNotice`

### Events Emitted
`adverse.action.notice.sent`

---

### Module 58 — Complaint Management & CFPB Readiness

**Pillar:** Compliance

### Purpose
Provides CFPB-ready complaint management with structured intake, escalation, and resolution workflows. Ensures complaints are handled within regulatory timeframes and documented for examination readiness.

### Key Features
- Complaint intake: channel, category (billing, product, service, compliance), severity
- CFPB response timeframe tracking: 15-day acknowledgment, 60-day resolution
- Evidence attachment: link supporting documents from the vault
- Resolution documentation with remediation description
- Complaint analytics: rate by advisor, category, and channel
- Regulator inquiry response workspace

### Data Models
`Complaint`, `ComplaintEvidence`

### Events Emitted
`complaint.opened`, `complaint.resolved`, `cfpb.deadline.approaching`

---

### Module 59 — Funds-Flow Classification & Co-mingling Detection

**Pillar:** Compliance

### Purpose
Classifies all transaction types to ensure business credit card proceeds are used for legitimate business purposes. Detects co-mingling of personal and business funds that could trigger issuer fraud investigations.

### Key Features
- Transaction-level classification: operating expense, payroll, owner draw, personal use
- Personal-use flag: detect non-business spend on business cards
- Co-mingling report: identify patterns suggesting personal fund co-mingling
- Documentation workflow: require business-purpose evidence for flagged transactions

### Data Models
`Transaction`, `FundFlowClassification`

### Events Emitted
`commingling.detected`, `personal.use.detected`

---

### Module 60 — Regulatory Reporting & Export Center

**Pillar:** Compliance

### Purpose
Consolidates all regulatory reporting exports including Section 1071, SB 1235, GLBA privacy notices, and fair lending data into a unified compliance reporting center.

### Key Features
- Section 1071 CSV/JSON export in CFPB format
- Fair lending adverse-action report
- Consent audit export per business
- Acknowledgment audit export
- Full ledger event export for regulatory examinations

### API Routes
`GET /api/compliance/1071-export`, `GET /api/fair-lending/adverse-action`, `GET /api/businesses/:id/consent`, `GET /api/businesses/:id/acknowledgments`, `GET /api/audit/events`

---

### Module 61 — Policy Engine & State Law Compliance

**Pillar:** Compliance

### Purpose
Provides the final layer of state-specific policy enforcement, ensuring that business formation state, operating states, and client demographics trigger all applicable regulatory requirements automatically.

### Key Features
- State-law mapper: map business state to applicable commercial financing laws
- Disclosure requirement enforcement: SB 1235, NY disclosure law, Illinois analogues
- Broker licensing check: flag states requiring commercial financing broker registration
- State-specific UDAP rule application in compliance scans
- Multi-state compliance matrix: track obligations across all states a business operates in

### Data Models
`StateLawRequirement`, `BusinessComplianceMatrix`

### Events Emitted
`state.law.compliance.checked`

---

*For complete API documentation for all 61 modules, see [`docs/api.md`](api.md).*
*For the full system architecture, see [`docs/architecture.md`](architecture.md).*
