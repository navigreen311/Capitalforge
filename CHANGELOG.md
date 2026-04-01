# Changelog

All notable changes to CapitalForge are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned for v2.0.0-beta.1

- Sanctions screening live API integration (OFAC SDN via Dow Jones / ComplyAdvantage)
- Section 1071 data collection front-end workflows
- Frontend dashboard: funding round overview, credit profile view, compliance status board
- Webhook delivery system for partner integrations (retry queue, signature verification)
- Production Twilio wiring for VoiceForge outbound campaigns
- Production AWS Textract / Google Document AI wiring for VisionAudioForge OCR
- Stripe billing integration for SaaS entitlements
- Plaid bank data integration for Statement Normalizer
- DocuSign integration for Product Acknowledgment Engine

---

## [2.0.0-alpha.3] — 2026-03-31

### Added

**Sprint 3 — Infrastructure, Integrations & Documentation**

**E2E Test Coverage**

- **Onboarding Flow E2E tests** (`tests/e2e/onboarding-flow.test.ts`) — 12 tests covering the full intake pipeline: business creation with MCC derivation, beneficial owner addition, KYB verification (including OFAC hard stop), KYC verification (including synthetic identity routing), funding readiness score calculation across all five component dimensions, and track routing (stacking / credit_builder / alternative). Full end-to-end pipeline test validates all pipeline stages fire in order and emit the correct events.
- **Funding Flow E2E tests** (`tests/e2e/funding-flow.test.ts`) — 12 tests covering the full funding lifecycle: suitability assessment (approved and no-go paths), max safe leverage calculation, acknowledgment gate (blocking and passing), consent gate (allowed and revoked), stacking optimizer plan generation, application creation in draft status, application state machine transitions (draft → submitted → approved), maker-checker approval enforcement, and funding round completion.
- **Compliance Flow E2E tests** (`tests/e2e/compliance-flow.test.ts`) — 12 tests covering the full compliance pipeline: UDAP scoring (clean content, guaranteed-approval violation, hard-stop threshold, missing-disclosure violation), state law profiles (California SB 1235, New York 23 NYCRR, federal baseline for other states), consent gate (SMS block, grant with evidence), acknowledgment signing with vault linkage, document vault upload with crypto-timestamp, and compliance dossier assembly.

**CI/CD**

- **Deploy workflow** (`.github/workflows/deploy.yml`) — GitHub Actions deployment pipeline with three jobs: (1) Build & Push: multi-platform Docker Buildx with layer caching, metadata-action tagging (SHA, `latest`, semver), push to GHCR for both backend and frontend images. (2) Deploy Staging: triggered on push to `main`, runs migrations, pulls images, zero-downtime rolling restart, health check loop with 2-minute timeout. (3) Deploy Production: triggered on published release tag, creates pre-deployment database backup, runs migrations, rolling restart, health check with 3-minute timeout, automatic rollback on failure, GitHub deployment tagging.

**Scripts**

- **Database backup script** (`scripts/backup.sh`) — Full pg_dump pipeline: environment validation, UTC-timestamped filenames, gzip compression, S3 upload stub with production wiring instructions, backup integrity verification (gzip test + PostgreSQL dump header check), 90-day local retention with `find -mtime` cleanup, S3 retention stub with Lifecycle rule recommendation, structured logging with ISO 8601 timestamps. Handles both Linux and macOS `stat` variants.

**Documentation**

- **Deployment guide** (`docs/deploy.md`) — Comprehensive deployment reference: host requirements table, DNS/TLS prerequisites, external services checklist, step-by-step environment setup, full Docker command reference (development and production), database migration procedures and safety rules, automated CI/CD trigger table, manual deployment procedure (step-by-step SSH workflow), rollback procedure (automated and manual, including DB restore decision rules), monitoring checklist (immediate / functional / ongoing signals), secrets reference table with all 26+ required and optional variables.
- **VoiceForge architecture doc** (`docs/voiceforge-integration.md`) — TCPA consent gate flow diagram, call compliance pipeline with banned-claim categories and risk escalation table, three outreach campaign flows (APR expiry, repayment reminder, re-stack consultation), QA scoring rubric (disclosure, consent, banned-claims, product accuracy dimensions), event bus integration table, service dependency map, configuration reference, production Twilio wiring guide with code examples, compliance notes (TCPA, FCC Mini-Miranda, state DNC, call recording consent, abandonment rate).
- **VisionAudioForge architecture doc** (`docs/visionaudioforge-integration.md`) — OCR pipeline stages (pre-processing, extraction, structured data, confidence scoring, auto-filing, maker entry), confidence threshold table, agent orchestration lifecycle, five typed agent class descriptions (StatementAgent, KYBAgent, ContractAgent, AcknowledgmentAgent, EvidenceBundleAgent), maker-checker pattern with full entry schema and auto-approval criteria, four document processing flow diagrams (bank statement, adverse action, KYB verification, evidence bundle), event bus integration table, production wiring guides for AWS Textract, Google Document AI, and AWS Rekognition with code examples, stub replacement checklist.
- **Security architecture doc** (`docs/security.md`) — Full security architecture reference: authentication & session management, RBAC roles and permissions, encryption (TLS, AES-256-GCM field-level, document vault hashing), triple-layer tenant isolation, PII handling and classification, two-layer audit system, network security controls, secrets management principles and rotation procedure, incident response playbook with P0/P1 severity classification.
- **Testing guide** (`docs/testing.md`) — Three-tier test pyramid documentation: unit test patterns (Prisma mocks, event bus spy, factory helpers), integration test patterns (DB setup/teardown, BullMQ job assertions), E2E test patterns (full workflow coverage, mocked infrastructure), performance testing baselines, test data management (factories over fixtures, tenant isolation, synthetic PII rules), CI/CD integration (GitHub Actions service containers), coverage targets by scope.
- **API quick reference** (`docs/api-quick-reference.md`) — One-page endpoint index: all ~200 endpoints organized by pillar, one line per endpoint with HTTP method, path, and description. Includes error codes reference.
- **Contributing guide** (`CONTRIBUTING.md`) — Branch naming conventions, Conventional Commits reference, PR template, code review checklist (correctness, security, architecture, testing, documentation, performance), testing requirements by tier, documentation requirements matrix.

---

## [2.0.0-alpha.2] — 2026-03-31

### Added

**Sprint 2 — Extended Module Build-out**

**Intelligence Pillar**

- **Fraud Detection (Module 16)** — Behavioral anomaly scoring, velocity rules, synthetic identity detection, device fingerprint analysis, cross-tenant fraud signal aggregation.
- **Sanctions Screening (Module 17)** — OFAC SDN, PEP list, and adverse media screening with hard-stop enforcement on exact match. SOS entity verification stub (Middesk / LexisNexis integration point).
- **AI Governance (Module 18)** — Model card registry, fairness monitoring hooks, explainability audit trail for all AI-generated scores and recommendations.
- **Decision Explainability (Module 19)** — Human-readable rationale generation for suitability scores, funding readiness scores, and no-go decisions.
- **Funding Simulator (Module 20)** — Monte Carlo simulation for funding outcome scenarios (best/base/worst case) with configurable economic stress parameters.
- **Stress Test Engine (Module 21)** — Portfolio-level stress testing under adverse credit, revenue, and interest rate scenarios.
- **Credit Optimizer (Module 22)** — Actionable improvement roadmap for businesses that fall short of stacking eligibility thresholds.
- **Credit Builder (Module 23)** — Guided credit-building program for businesses on the `credit_builder` track.

**Orchestration Pillar**

- **Card Benefits Service (Module 24)** — Benefits catalogue, rewards value calculation, category spend optimization, network diversity tracking.
- **Rewards Optimization (Module 25)** — Cross-card rewards routing recommendations, category-spend allocation models, redemption strategy scoring.
- **Auto-Restack Engine (Module 26)** — Eligibility detection for follow-on funding rounds, restack trigger events, advisor notification pipeline.
- **Decline Recovery (Module 27)** — Structured decline analysis, reconsideration request workflow, alternative product routing.
- **Issuer Relationship Manager (Module 28)** — Issuer relationship tracking, velocity and velocity-rule enforcement per issuer, relationship health scoring.
- **Deal Committee (Module 29)** — Multi-advisor deal review workflow with quorum rules, dissent capture, and approval audit trail.
- **Workflow Engine (Module 30)** — General-purpose step-function workflow runner for multi-stage advisory processes.
- **Policy Orchestration (Module 31)** — Configurable policy rule chains, approval delegation trees, exception handling with escalation paths.

**Compliance Pillar**

- **State Law Mapper (Module 32)** — Full California SB 1235 and New York 23 NYCRR implementations; federal baseline for all 50 states + DC.
- **Disclosure CMS (Module 33)** — Content management for regulatory disclosure templates with versioning, approval workflow, and jurisdiction tagging.
- **Fair Lending Monitor (Module 34)** — ECOA / Regulation B adverse action tracking, disparate impact monitoring hooks, Section 1071 data capture fields.
- **Complaint Management (Module 35)** — Consumer complaint intake, triage, regulatory response tracking, CFPB complaint portal integration stub.
- **Regulatory Intelligence (Module 36)** — Regulatory change monitoring, rule-update notifications, impact assessment workflow.
- **Regulator Response (Module 37)** — Structured exam response packet assembly, document production workflow, privilege logging.
- **Comm Compliance (Module 38)** — Banned-claims registry, required-disclosures catalogue, marketing copy pre-approval workflow.
- **Rules Versioning (Module 39)** — Immutable compliance rule snapshots, effective-date management, rollback capability.

**Platform Pillar**

- **API Portal (Module 40)** — Developer portal with API key management, rate limit configuration, webhook registration, and usage analytics.
- **Integration Layer (Module 41)** — Normalized adapters for Plaid, Stripe, DocuSign, Twilio, and bureau API providers.
- **CRM (Module 42)** — Lightweight built-in CRM for advisor-client relationship tracking, pipeline stages, and activity logging.
- **Referral Engine (Module 43)** — Partner referral tracking, attribution logic, referral fee calculation and payout scheduling.
- **Partner Governance (Module 44)** — Partner onboarding, agreement management, performance monitoring, and compliance certification tracking.
- **VoiceForge (Module 45)** — Twilio telephony integration with TCPA consent gate enforcement, live call compliance scanning, automated outreach campaigns, advisor QA scoring, and Document Vault auto-filing.
- **VisionAudioForge (Module 46)** — Document intelligence hub: OCR pipeline (bank statements, adverse action letters, contracts, KYB documents, receipts), ID liveness detection, typed AI agent classes with maker-checker approval chains, evidence bundle assembly.
- **SaaS Entitlements (Module 47)** — Feature flag management, plan-tier enforcement, usage metering for per-module access control.
- **Sandbox (Module 48)** — Isolated sandbox tenant environment with synthetic data generation for integration testing.
- **Data Lineage (Module 49)** — Field-level data lineage tracking from source ingestion through transformations to output.
- **Business Continuity (Module 50)** — Disaster recovery runbooks, RTO/RPO tracking, failover configuration registry.

**Financial Pillar**

- **Revenue Ops (Module 51)** — Program fee calculation, cohort revenue analytics, advisor commission tracking.
- **Spend Governance (Module 52)** — Business card spend monitoring, category enforcement, policy violation detection and alerting.
- **Statement Reconciliation (Module 53)** — Bank statement vs. card statement reconciliation, discrepancy detection, auto-classification.
- **Repayment (Module 54)** — Repayment schedule management, ACH authorization linking, early repayment incentive calculation.
- **Hardship (Module 55)** — Financial hardship assessment, restructuring recommendation workflow, forbearance tracking.
- **Tax Documents (Module 56)** — 1099-INT / 1099-C / 1098 generation stubs, tax-year document bundling, IRS e-file integration stub.
- **Funds Flow Classification (Module 57)** — Bank transaction categorization, business-purpose evidence collection, GL code suggestion.
- **IRC 163(j) Analysis (Module 58)** — Business interest expense deductibility analysis, adjusted taxable income calculation, carryforward tracking.
- **Statement Normalizer (Module 59)** — Multi-format bank statement parser (PDF, CSV, OFX), normalized transaction schema output.
- **Business Purpose Evidence (Module 60)** — Business-use affirmation capture for IRS substantiation requirements on credit card expenses.

**Infrastructure**

- **Client Graduation Service (Module 61)** — Structured off-ramp for clients who complete their funding program: summary report generation, ongoing monitoring setup, referral prompt workflow.
- **Offboarding Service** — Tenant and business offboarding workflow with data export, legal-hold check, and deletion scheduling.
- **Training Service** — Advisor training module registry, completion tracking, certification management.
- **Contract Intelligence** — Contract clause extraction, obligation tracking, renewal alert engine.
- **Business Continuity Plans** — DR runbook templates, RTO/RPO SLA tracking.
- Multi-tenant event bus with wildcard routing extended to all 61 module event types.
- Prisma schema extended to support all new module models.
- Full suite of E2E test helpers: `createFullTestBusiness()`, `makePrismaMockFor()`, `createEventBusSpy()`, `buildCallerContext()`.
- GitHub Actions deploy workflow: build + push to GHCR, staging on push to main, production on release tag.
- Database backup script with 90-day retention, S3 upload stub, and integrity verification.

---

## [2.0.0-alpha.1] — 2026-03-31

### Added

**Sprint 1 — MVP Core Build (Modules 1–15)**

**Platform Pillar**

- **Auth & Multi-Tenant (Module 1)** — JWT-based authentication with access/refresh token rotation, bcrypt password hashing, RBAC middleware (super_admin / tenant_admin / advisor / compliance_officer / client / readonly), per-request tenant isolation via `X-Tenant-ID` header, full audit logging on every auth event.
- **Business Onboarding & KYB (Module 2)** — Structured business intake with entity type validation, EIN capture, beneficial owner (KYC) collection, MCC classification, and advisor assignment. Onboarding state machine (`intake → verifying → active → suspended`).
- **Document Vault (Module 14)** — Immutable document storage with SHA-256 content hash, crypto-timestamp anchoring, legal-hold flag, tenant-scoped access control, and support for local and S3 storage backends.
- **Canonical Audit Ledger & Event Bus (Module 15)** — PostgreSQL-backed append-only `ledger_events` table, in-process pub/sub with wildcard topic matching (e.g. `consent.*`), typed event envelopes, and idempotent event persistence.

**Intelligence Pillar**

- **Credit Intelligence Engine (Module 3)** — Multi-bureau credit profile ingestion (Equifax, TransUnion, Experian, D&B), FICO / VantageScore / SBSS / Paydex normalization, tradeline analysis, utilization and inquiry velocity calculation, bureau comparison views.
- **Funding Readiness Scorer (Module 4)** — Composite readiness score (0-100) derived from credit, entity age, revenue, documentation completeness, and existing debt load. Produces actionable improvement recommendations.
- **Leverage Calculator (Module 5)** — Computes total cost of capital including program fees, annual card fees, cash-advance fees, processor fees, effective APR, IRC § 163(j) interest deduction impact, and best/base/worst-case cash-flow projections.

**Orchestration Pillar**

- **Funding Round Orchestrator (Module 6)** — Multi-round funding lifecycle management, per-round target credit and card count planning, status tracking (`planning → active → completed → archived`), issuer sequencing rules (Chase 5/24, Amex 90-day velocity, Citi 8/65).
- **Card Application Manager (Module 7)** — Full application lifecycle (`draft → submitted → approved → declined → cancelled`), adverse action notice capture, intro APR and expiry date tracking, per-application consent linkage.
- **APR Expiry Alert Engine (Module 8)** — Automated alerts at 60-, 30-, and 15-day windows before intro APR expiry. BullMQ scheduled jobs, idempotent alert deduplication, event emission on each alert sent.

**Compliance Pillar**

- **Suitability & No-Go Engine (Module 9)** — Suitability scoring (0-100) with configurable no-go thresholds, multi-factor risk assessment (credit health, leverage ratio, business stability, industry risk), no-go trigger logging, alternative product recommendations, supervisor override workflow with audit trail.
- **TCPA Consent Vault (Module 10)** — Consent record lifecycle (captured → revoked → expired) for voice, SMS, email, partner, and document channels. Consent-type coverage: TCPA, data sharing, referral, application. Immutable grant/revoke timestamps with evidence references and IP capture.
- **Product Acknowledgment Engine (Module 11)** — Versioned acknowledgment templates for product reality, fee schedule, personal guarantee, and cash-advance risk disclosures. Digital signature capture, document vault linkage, per-version tamper-evident storage.
- **ACH Debit Control (Module 12)** — Authorized debit agreement capture with processor, amount, and frequency constraints. Real-time debit event monitoring with tolerance-band enforcement. Unauthorized debit detection, event bus alerts, and revocation workflow with notified-at timestamp.
- **UDAP/UDAAP Compliance Monitor (Module 13)** — Automated scan of marketing copy, disclosure language, and fee representations against UDAP/UDAAP guardrails. Risk scoring (low / medium / high / critical), state-jurisdiction-aware rule sets, findings persistence, and remediation tracking.

**Infrastructure**

- Prisma schema with 17 models across 6 domain areas: identity/multi-tenant, business/onboarding, credit/intelligence, funding/applications, consent/compliance, financial, ACH, document vault, canonical ledger.
- Docker Compose stack: PostgreSQL 16 Alpine + Redis 7 Alpine with health checks.
- Vitest test framework with unit, integration, and e2e test suites.
- ESLint + Prettier + TypeScript strict mode configured.
- `scripts/setup.sh` one-command environment bootstrap.
- GitHub Actions CI pipeline: lint, type-check, unit tests, integration tests on push/PR to master.

### Architecture

- Four system pillars: Intelligence, Orchestration, Compliance, Platform.
- Event-driven core: all domain transitions emit typed events to the canonical ledger and fan out to in-process subscribers.
- Tenant isolation at every database query via Prisma tenant-scoped middleware.
- RBAC enforced at route middleware layer with permission-level granularity.
