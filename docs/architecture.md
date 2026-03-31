# CapitalForge — System Architecture

## Contents

1. [Overview](#overview)
2. [Four System Pillars](#four-system-pillars)
3. [Tenant Isolation Model](#tenant-isolation-model)
4. [Event Bus Topology](#event-bus-topology)
5. [Request Lifecycle](#request-lifecycle)
6. [Data Flow Diagram](#data-flow-diagram)
7. [Infrastructure Topology](#infrastructure-topology)
8. [Security Architecture](#security-architecture)
9. [Deployment Model](#deployment-model)

---

## Overview

CapitalForge is structured around four vertical pillars (Intelligence, Orchestration, Compliance, Platform) that share a horizontal foundation of multi-tenant isolation, a canonical event bus, and a unified audit ledger. All state mutations are event-sourced into the `ledger_events` table before side effects are applied.

The backend is an Express 5 API server using Prisma 6 for database access, BullMQ (Redis 7) for background job processing, and a JOSE-based JWT auth system. The frontend is a Next.js 15 App Router application consuming the backend via TanStack React Query.

---

## Four System Pillars

### 1. Intelligence Pillar

Responsible for understanding the financial health of a business and its owners.

| Module | Function |
|--------|----------|
| Credit Intelligence Engine | Multi-bureau ingestion, score normalization, tradeline analysis |
| Funding Readiness Scorer | Composite readiness score with improvement recommendations |
| Leverage Calculator | Total cost of capital, effective APR, IRC § 163(j) analysis |
| Fraud Detection | Behavioral anomaly scoring, velocity rules, identity inconsistency detection |
| Sanctions Screening | OFAC SDN, PEP, and adverse media screening |

### 2. Orchestration Pillar

Responsible for managing the lifecycle of funding rounds and card applications.

| Module | Function |
|--------|----------|
| Funding Round Orchestrator | Multi-round lifecycle, issuer sequencing, target planning |
| Card Application Manager | Application state machine, adverse action notice, APR tracking |
| APR Expiry Alert Engine | Scheduled BullMQ jobs for 60/30/15-day expiry warnings |
| Restack Trigger Engine | Detects restacking opportunities and fires trigger events |
| Application Gates | Pre-submission eligibility checks across multiple rule sets |

### 3. Compliance Pillar

Responsible for enforcing regulatory requirements at the platform layer.

| Module | Function |
|--------|----------|
| Suitability & No-Go Engine | Risk scoring, no-go threshold enforcement, override audit |
| TCPA Consent Vault | Multi-channel consent lifecycle with immutable evidence |
| Product Acknowledgment Engine | Versioned disclosure delivery and signature capture |
| ACH Debit Control | Authorized debit monitoring, tolerance enforcement, unauthorized detection |
| UDAP/UDAAP Compliance Monitor | Marketing and disclosure language scanning |
| Section 1071 Data Collection | Small business lending data collection and reporting |
| California SB 1235 Disclosures | Broker disclosure template delivery and receipt tracking |

### 4. Platform Pillar

Responsible for the infrastructure all other pillars depend on.

| Module | Function |
|--------|----------|
| Auth & Multi-Tenant | JWT auth, RBAC, tenant isolation |
| Business Onboarding & KYB | Intake form, entity verification, beneficial owner KYC |
| Document Vault | Immutable storage, SHA-256 hashing, legal hold |
| Canonical Audit Ledger & Event Bus | Append-only event log, pub/sub fan-out |
| Webhook Delivery | Outbound event delivery to partner systems |
| Admin Console | Tenant management, user administration, system health |

---

## Tenant Isolation Model

Every resource in CapitalForge is scoped to a `tenantId`. Isolation is enforced at three layers:

```
Layer 1: HTTP Middleware
  ├── X-Tenant-ID header validated on every authenticated request
  ├── Tenant record loaded and cached (Redis TTL: 60s)
  └── req.tenant injected into request context

Layer 2: Prisma Middleware
  ├── All read queries automatically append WHERE tenantId = :tenantId
  ├── All write mutations validate tenantId matches authenticated context
  └── Cross-tenant queries rejected with 403 before hitting the DB

Layer 3: Row-Level Security (PostgreSQL)
  ├── RLS policies enabled on all tenant-scoped tables
  ├── app.current_tenant_id session variable set per connection
  └── Provides defense-in-depth against middleware bypass
```

**Tenant data never leaks across boundaries.** Shared infrastructure (PostgreSQL, Redis) is partitioned by `tenantId` at the application layer; physical multi-tenancy is a deployment-time option.

---

## Event Bus Topology

CapitalForge uses an in-process event bus backed by the PostgreSQL `ledger_events` table as the durable store.

### Write Path

```
Domain Service
    │
    ▼
eventBus.publish(envelope)
    │
    ├── 1. INSERT INTO ledger_events (atomically with the triggering transaction)
    │
    └── 2. Fan-out to in-process subscribers (synchronous, post-commit)
             │
             ├── subscriber: compliance.check (pattern: "application.*")
             ├── subscriber: apr.alert.scheduler (pattern: "round.*")
             ├── subscriber: document.archiver (pattern: "consent.*")
             └── subscriber: audit.logger (pattern: "*")
```

### Subscribe API

```typescript
eventBus.subscribe('consent.*', async (event) => { /* ... */ });
eventBus.subscribe('application.submitted', async (event) => { /* ... */ });
eventBus.subscribe('*', async (event) => { /* catch-all audit */ });
```

### Event Envelope Schema

```typescript
interface LedgerEnvelope {
  tenantId:      string;          // UUID — tenant scope
  eventType:     string;          // e.g. "consent.captured"
  aggregateType: string;          // e.g. "consent"
  aggregateId:   string;          // UUID of the root aggregate
  payload:       Record<string, unknown>;
  metadata?:     Record<string, unknown>;
  version?:      number;          // monotonic per aggregate
}
```

### Event Type Registry

| Domain | Events |
|--------|--------|
| Consent | `consent.captured`, `consent.revoked` |
| Application | `application.submitted`, `card.approved`, `card.declined` |
| Funding | `round.started`, `round.completed`, `apr.expiry.approaching` |
| Compliance | `compliance.check.completed`, `risk.alert.raised`, `suitability.assessed`, `nogo.triggered` |
| ACH | `debit.authorized`, `debit.revoked`, `debit.unauthorized.detected` |
| Document | `document.uploaded`, `document.processed` |
| Acknowledgment | `product.reality.acknowledged` |
| Onboarding | `business.created`, `business.onboarded`, `kyb.verified`, `kyc.verified` |
| Offboarding | `offboarding.initiated`, `offboarding.completed` |
| Restack | `restack.trigger.fired` |
| VoiceForge | `call.completed`, `call.compliance.violation` |

---

## Request Lifecycle

```
Client Request
    │
    ▼
Express Server
    │
    ├── helmet()           — Security headers
    ├── cors()             — CORS policy
    ├── requestId()        — Inject X-Request-ID
    ├── express.json()     — Body parsing
    │
    ├── /api/health        — Public health check (no auth)
    │
    └── /api/*
         │
         ├── requireAuth()       — Validate JWT, inject req.user
         ├── tenantMiddleware()   — Resolve tenant, inject req.tenant
         ├── rbacMiddleware()     — Check permission for route
         │
         └── Route Handler
                │
                ├── Zod validation
                ├── Service layer (business logic)
                │     └── Prisma queries (tenant-scoped)
                │           └── eventBus.publish() (on state change)
                └── JSON response
```

---

## Data Flow Diagram

```mermaid
flowchart TD
    subgraph Client["Client Layer"]
        FE["Next.js 15 Frontend\n(React Query)"]
        BP["Business / Partner\n(REST API consumer)"]
    end

    subgraph API["API Layer (Express 5)"]
        AUTH["Auth Middleware\n(JWT + Tenant)"]
        RBAC["RBAC Middleware"]
        ROUTES["Route Handlers\n(Zod validated)"]
    end

    subgraph Services["Service Layer"]
        AUTH_SVC["Auth Service"]
        CREDIT_SVC["Credit Intelligence\nService"]
        CONSENT_SVC["Consent Service"]
        FUND_SVC["Funding Readiness\nService"]
        LEV_SVC["Leverage Calculator"]
        FRAUD_SVC["Fraud Detection"]
        SANCTION_SVC["Sanctions Screening"]
        ACK_SVC["Acknowledgment\nTemplates"]
    end

    subgraph Events["Event Bus"]
        BUS["In-Process Event Bus\n(wildcard pub/sub)"]
        LEDGER["ledger_events table\n(append-only)"]
    end

    subgraph Jobs["Background Jobs (BullMQ)"]
        APR_JOB["APR Expiry\nScheduler"]
        KYB_JOB["KYB Verification\nPoller"]
        BUREAU_JOB["Bureau Refresh\nScheduler"]
    end

    subgraph Data["Data Layer (Prisma + PostgreSQL 16)"]
        TENANTS["tenants"]
        USERS["users + audit_logs"]
        BUSINESSES["businesses + owners"]
        CREDIT["credit_profiles"]
        FUNDING["funding_rounds\n+ card_applications"]
        COMPLIANCE["consent_records\ncompliance_checks\nsuitability_checks"]
        DOCS["documents"]
        ACH["ach_authorizations\ndebit_events"]
        COSTS["cost_calculations"]
    end

    subgraph Cache["Redis 7"]
        TOKEN_BLOCKLIST["Token Blocklist\n(JTI → TTL)"]
        TENANT_CACHE["Tenant Cache\n(60s TTL)"]
        QUEUE["BullMQ Queues"]
    end

    FE -->|HTTPS + Bearer JWT| AUTH
    BP -->|HTTPS + Bearer JWT| AUTH
    AUTH --> RBAC --> ROUTES
    ROUTES --> Services
    Services -->|Prisma queries\n(tenant-scoped)| Data
    Services -->|publish event| BUS
    BUS -->|persist| LEDGER
    BUS -->|fan-out| Jobs
    Jobs -->|scheduled work| Data
    Jobs -->|Redis queues| QUEUE
    AUTH_SVC -->|JTI blocklist| TOKEN_BLOCKLIST
    AUTH_SVC -.->|tenant lookup| TENANT_CACHE
```

---

## Infrastructure Topology

### Development

```
localhost:3000  →  Next.js dev server (npm run dev:frontend)
localhost:4000  →  Express API server (npm run dev:backend)
localhost:5432  →  PostgreSQL 16 (Docker)
localhost:6379  →  Redis 7 (Docker)
```

### Production (Target)

```
                    ┌──────────────┐
                    │   CDN / WAF  │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
    ┌─────────▼──────┐       ┌──────────▼──────┐
    │  Next.js App   │       │   Express API   │
    │  (Vercel /     │       │   (ECS / K8s)   │
    │   App Runner)  │       │   Horizontal    │
    └────────────────┘       └──────┬──────────┘
                                    │
                     ┌──────────────┼──────────────┐
                     │              │               │
            ┌────────▼───┐  ┌───────▼───┐  ┌──────▼──────┐
            │ PostgreSQL │  │  Redis    │  │  S3 Bucket  │
            │  RDS / AU  │  │ ElastiC.  │  │ (Doc Vault) │
            └────────────┘  └───────────┘  └─────────────┘
```

---

## Security Architecture

| Control | Implementation |
|---------|---------------|
| Authentication | JWT (JOSE) — access token 15m TTL, refresh token 7d TTL |
| Token Rotation | Refresh token rotation on every `/auth/refresh` call |
| Token Revocation | JTI blocklist in Redis with matching TTL |
| Password Security | bcrypt (cost factor 12) |
| Transport | TLS 1.2+ enforced; HSTS via helmet |
| Input Validation | Zod schemas on every route — no raw `req.body` access in handlers |
| Tenant Isolation | Triple-layer: middleware + Prisma extension + PostgreSQL RLS |
| RBAC | Permission-level granularity (13 permissions across 6 roles) |
| PII Encryption | AES-256-GCM for SSN, DOB, EIN at rest (field-level) |
| Audit Trail | Immutable `audit_logs` + `ledger_events` — every write is recorded |
| Secret Management | Environment variables; never committed; `.env.example` with placeholders |
| Security Headers | helmet() — CSP, X-Frame-Options, HSTS, etc. |
| Rate Limiting | Express rate-limit middleware (planned for v2.0.0-alpha.2) |
