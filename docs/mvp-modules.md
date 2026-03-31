# CapitalForge — MVP Modules Reference

This document describes each of the 15 MVP modules: their business purpose, key features, data models involved, and events emitted.

---

## Module 1 — Auth & Multi-Tenant

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

## Module 2 — Business Onboarding & KYB

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
`POST /api/businesses`, `GET /api/businesses/:id`, `PATCH /api/businesses/:id`, `POST /api/businesses/:id/owners`, `GET /api/businesses/:id/owners`

---

## Module 3 — Credit Intelligence Engine

**Pillar:** Intelligence

### Purpose
Ingests credit profile data from multiple bureaus, normalizes scores across scoring models, and produces a unified credit picture for each business and its principals. Provides the raw signal layer used by the Funding Readiness Scorer and Card Application Manager.

### Key Features
- Multi-bureau support: Equifax, TransUnion, Experian (personal), Dun & Bradstreet (business)
- Score normalization: FICO (300-850), VantageScore (300-850), SBSS (0-300), Paydex (0-100)
- Tradeline analysis: age, balance, limit, status, payment history
- Utilization calculation across all revolving accounts
- Inquiry velocity tracking (90-day window) with configurable alert thresholds
- Derogatory mark count and severity classification
- Bureau comparison view for cross-bureau discrepancy detection
- Historical profile snapshots — every pull is retained for audit and trend analysis

### Data Models
`CreditProfile`

### Events Emitted
None directly; consumed by other services.

### API Routes
`POST /api/businesses/:id/credit-profiles`, `GET /api/businesses/:id/credit-profiles`, `GET /api/businesses/:id/credit-profiles/latest`

---

## Module 4 — Funding Readiness Scorer

**Pillar:** Intelligence

### Purpose
Produces a composite funding readiness score (0-100) that quantifies how prepared a business is to successfully obtain commercial credit card funding. The score drives advisor workflows and gates funding round initiation.

### Key Features
- Composite scoring across five factor categories: credit health (30%), entity maturity (20%), revenue strength (20%), documentation completeness (15%), existing debt load (15%)
- Per-factor breakdown with numeric contribution and label (excellent / good / fair / poor)
- Actionable recommendations sorted by score impact
- Score trend tracking across multiple assessments
- No-go threshold integration (score < 30 blocks funding round initiation)
- Integration with Credit Intelligence Engine, Business model, and Document Vault

### Data Models
`Business` (writes `fundingReadinessScore`), `SuitabilityCheck`

### Events Emitted
`suitability.assessed`

### API Routes
`POST /api/businesses/:id/readiness-score`, `GET /api/businesses/:id/readiness-score/latest`

---

## Module 5 — Leverage Calculator

**Pillar:** Intelligence

### Purpose
Computes the true total cost of capital for a proposed credit card funding program, including all fee components, effective APR, and cash-flow projections under three scenarios. Enables advisors and clients to make fully informed decisions before proceeding.

### Key Features
- Fee component breakdown: program fees, % of funding fee, annual card fees, cash advance fees, processor fees
- Effective APR computation across the full funding term
- IRC § 163(j) business interest deduction impact analysis
- Three-scenario cash-flow projections: best case, base case, worst case
- Per-card and aggregate calculation views
- Comparison mode for evaluating multiple program configurations
- Results persisted for compliance disclosure requirements (SB 1235)

### Data Models
`CostCalculation`

### Events Emitted
None directly — results stored for disclosure audit trail.

### API Routes
`POST /api/businesses/:id/cost-calculations`, `GET /api/businesses/:id/cost-calculations`, `GET /api/businesses/:id/cost-calculations/:calcId`

---

## Module 6 — Funding Round Orchestrator

**Pillar:** Orchestration

### Purpose
Manages the complete lifecycle of a funding round — a planned or active batch of credit card applications targeting a specific credit volume. Enforces issuer sequencing rules and coordinates with the Card Application Manager for each individual application within the round.

### Key Features
- Multi-round support: businesses can have sequential rounds (Round 1, Round 2, etc.)
- Target planning: configurable target credit volume and card count per round
- Round state machine: `planning → active → completed → archived`
- Issuer sequencing rules: Chase 5/24 (24-month window, max 5 cards), Amex 90-day velocity cooldown, Citi 8/65 rule
- APR expiry date tracking per round with 60/30/15-day alert windows
- Round summary reports: total approved credit, average APR, card count, next expiry date

### Data Models
`FundingRound`, `CardApplication`

### Events Emitted
`round.started`, `round.completed`

### API Routes
`POST /api/businesses/:id/funding-rounds`, `GET /api/businesses/:id/funding-rounds`, `GET /api/businesses/:id/funding-rounds/:roundId`, `PATCH /api/businesses/:id/funding-rounds/:roundId`

---

## Module 7 — Card Application Manager

**Pillar:** Orchestration

### Purpose
Tracks the state of each individual credit card application from draft through decision, capturing all material terms and linking each application to the appropriate funding round and consent records.

### Key Features
- Application state machine: `draft → submitted → approved → declined → cancelled`
- Material terms capture: credit limit, intro APR, intro APR expiry, regular APR, annual fee, cash advance fee
- Adverse action notice (AAN) capture and storage for declined applications
- Consent linkage — application cannot be submitted without a valid TCPA consent record
- Application gate checks: pre-submission eligibility validation (credit, suitability, consent, KYB)
- Issuer and card product cataloging
- Batch submit mode for coordinated multi-card round submissions

### Data Models
`CardApplication`

### Events Emitted
`application.submitted`, `card.approved`, `card.declined`

### API Routes
`POST /api/businesses/:id/applications`, `GET /api/businesses/:id/applications`, `GET /api/businesses/:id/applications/:appId`, `PATCH /api/businesses/:id/applications/:appId`

---

## Module 8 — APR Expiry Alert Engine

**Pillar:** Orchestration

### Purpose
Proactively alerts advisors and clients when a funding round's intro APR period is approaching expiration, giving sufficient lead time to evaluate payoff, restack, or balance transfer strategies before rates reset.

### Key Features
- Automated alert delivery at 60, 30, and 15 days before intro APR expiry
- BullMQ scheduled jobs with idempotent alert deduplication (alert flags on `FundingRound`)
- Alert channels: email, in-app notification, webhook (partner systems)
- Per-round expiry tracking — each `FundingRound` tracks its own `aprExpiryDate`
- Alert suppression if the round has already been completed or archived
- Restack opportunity scoring triggered on 30-day alert

### Data Models
`FundingRound` (reads `aprExpiryDate`, writes `alertSent60/30/15`)

### Events Emitted
`apr.expiry.approaching` (with `daysRemaining` in payload: 60, 30, or 15)

### Background Jobs
`apr-expiry-check` — runs daily via BullMQ cron

---

## Module 9 — Suitability & No-Go Engine

**Pillar:** Compliance

### Purpose
Provides a structured, auditable process for determining whether a business is a suitable candidate for credit card stacking. Enforces no-go thresholds to prevent advisors from proceeding with clients who pose excessive risk to themselves or the platform.

### Key Features
- Suitability score (0-100) derived from credit health, leverage ratio, business stability, industry risk profile, and payment history
- Configurable no-go threshold (default: score < 30)
- High-risk warning threshold (score 30-50) with required advisor acknowledgment
- Multi-factor risk breakdown with per-factor contribution and narrative explanation
- Alternative product recommendations when no-go is triggered (SBA loans, MCA, revenue-based financing)
- Supervisor override workflow: override requires reason, is attributed to overriding user, and is permanently logged
- Decision explanation in plain language for client-facing disclosure

### Data Models
`SuitabilityCheck`

### Events Emitted
`suitability.assessed`, `nogo.triggered`

### API Routes
`POST /api/businesses/:id/suitability`, `GET /api/businesses/:id/suitability/latest`, `POST /api/businesses/:id/suitability/:checkId/override`

---

## Module 10 — TCPA Consent Vault

**Pillar:** Compliance

### Purpose
Captures, stores, and manages the full lifecycle of consent records required under the Telephone Consumer Protection Act (TCPA) and related marketing consent regulations. Provides a tamper-evident consent chain of custody for every communication channel.

### Key Features
- Channel coverage: voice, SMS, email, partner referral, document signature
- Consent types: TCPA (outbound marketing), data sharing, referral, application consent
- Immutable grant record: granted-at timestamp, IP address, evidence reference, metadata
- Revocation workflow: revocation timestamp, revocation reason, immediate status update
- Consent verification API for pre-call/pre-SMS compliance gate
- Bulk consent status report for compliance officer review
- Integration with Card Application Manager (consent gate on submit)

### Data Models
`ConsentRecord`

### Events Emitted
`consent.captured`, `consent.revoked`

### API Routes
`POST /api/consent`, `GET /api/businesses/:id/consent`, `DELETE /api/consent/:consentId` (revoke), `GET /api/consent/:consentId`

---

## Module 11 — Product Acknowledgment Engine

**Pillar:** Compliance

### Purpose
Ensures every client receives, reads, and digitally acknowledges all required product reality and risk disclosures before any credit application is submitted. Maintains versioned disclosure templates and a permanent, auditable receipt record for each acknowledgment.

### Key Features
- Disclosure type coverage: product reality, fee schedule, personal guarantee, cash advance risk
- Versioned templates — version bumps require fresh acknowledgment from existing clients
- Digital signature capture with timestamp and signature reference
- Document vault linkage — signed acknowledgment stored as immutable document
- Template management: create, version, activate/deprecate
- Pre-application gate: all required disclosure types must have active acknowledgment
- Bulk acknowledgment status view for compliance officer oversight

### Data Models
`ProductAcknowledgment`, `Document`

### Events Emitted
`product.reality.acknowledged`

### API Routes
`GET /api/acknowledgment-templates`, `GET /api/acknowledgment-templates/:type`, `POST /api/businesses/:id/acknowledgments`, `GET /api/businesses/:id/acknowledgments`

---

## Module 12 — ACH Debit Control

**Pillar:** Compliance

### Purpose
Manages authorized ACH debit agreements and monitors all debit events against the authorized terms. Detects unauthorized or out-of-tolerance debits and triggers immediate alerts and revocation workflows.

### Key Features
- Authorized debit agreement capture: processor, authorized amount, frequency, signed document reference
- Authorization lifecycle: `active → suspended → revoked`
- Real-time debit event recording with tolerance-band enforcement
- Unauthorized debit detection: flags debits outside authorized amount +/- tolerance
- Frequency violation detection: flags debits outside the authorized schedule
- Automatic event bus alert on unauthorized detection
- Revocation workflow with processor notification timestamp tracking
- Full debit history per authorization for reconciliation

### Data Models
`AchAuthorization`, `DebitEvent`

### Events Emitted
`debit.authorized`, `debit.revoked`, `debit.unauthorized.detected`

### API Routes
`POST /api/businesses/:id/ach-authorizations`, `GET /api/businesses/:id/ach-authorizations`, `DELETE /api/ach-authorizations/:authId` (revoke), `POST /api/ach-authorizations/:authId/debit-events`

---

## Module 13 — UDAP/UDAAP Compliance Monitor

**Pillar:** Compliance

### Purpose
Scans marketing copy, disclosure language, fee representations, and advisor-generated content against UDAP (Unfair or Deceptive Acts or Practices) and UDAAP (+ Abusive) guardrails as defined by the FTC Act and Dodd-Frank Act. Prevents consumer harm and regulatory exposure.

### Key Features
- Automated content scanning against a curated rule library of deceptive practices
- Risk scoring: low / medium / high / critical with per-finding explanations
- State-jurisdiction-aware rule sets (state UDAP laws vary significantly)
- Findings persistence with resolution workflow (acknowledge, remediate, escalate)
- Integration with template engine — scans acknowledgment and disclosure templates on creation/update
- Compliance officer review queue with SLA tracking
- Audit trail of all scans, findings, and resolutions

### Data Models
`ComplianceCheck`

### Events Emitted
`compliance.check.completed`, `risk.alert.raised`

### API Routes
`POST /api/compliance/udap-check`, `GET /api/businesses/:id/compliance-checks`, `PATCH /api/compliance-checks/:checkId/resolve`

---

## Module 14 — Document Vault

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
`POST /api/documents` (upload), `GET /api/documents/:id`, `GET /api/businesses/:id/documents`, `DELETE /api/documents/:id` (soft delete, legal hold check)

---

## Module 15 — Canonical Audit Ledger & Event Bus

**Pillar:** Platform

### Purpose
Provides the foundational event infrastructure that all other modules depend on. Every domain state change emits a typed event that is atomically persisted to the immutable `ledger_events` table and fanned out to in-process subscribers. This creates a complete, tamper-evident audit trail of the entire system history.

### Key Features
- Append-only `ledger_events` table — records are never updated or deleted
- Typed event envelopes with `tenantId`, `eventType`, `aggregateType`, `aggregateId`, `payload`, and optional `metadata`
- Wildcard pub/sub topic matching: `consent.*`, `application.*`, `*` (catch-all)
- Monotonic version counter per aggregate for optimistic concurrency detection
- In-process fan-out to registered handlers (synchronous, post-commit)
- Full event history queryable by tenant, event type, aggregate, or time window
- Audit log service: structured query API over `ledger_events` for compliance reporting
- Integration with all 14 other MVP modules as the shared state-change substrate

### Data Models
`LedgerEvent`

### API Routes
`GET /api/audit/events` (paginated, filterable), `GET /api/audit/events/:aggregateType/:aggregateId`
