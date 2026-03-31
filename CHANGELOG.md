# Changelog

All notable changes to CapitalForge are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0-alpha.1] — 2026-03-31

### Added

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

---

## [Unreleased]

### Planned for v2.0.0-alpha.2

- VoiceForge integration (call compliance, TCPA call consent capture)
- Sanctions screening live API integration (OFAC, PEP)
- Section 1071 data collection workflows
- California SB 1235 disclosure templates
- Restack trigger engine
- Business offboarding workflow
- Frontend dashboard: funding round overview, credit profile view, compliance status
- Webhook delivery system for partner integrations
- Full 61-module build-out
