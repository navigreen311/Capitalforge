# CapitalForge

```
  ██████╗ █████╗ ██████╗ ██╗████████╗ █████╗ ██╗     ███████╗ ██████╗ ██████╗  ██████╗ ███████╗
 ██╔════╝██╔══██╗██╔══██╗██║╚══██╔══╝██╔══██╗██║     ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝
 ██║     ███████║██████╔╝██║   ██║   ███████║██║     █████╗  ██║   ██║██████╔╝██║  ███╗█████╗
 ██║     ██╔══██║██╔═══╝ ██║   ██║   ██╔══██║██║     ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝
 ╚██████╗██║  ██║██║     ██║   ██║   ██║  ██║███████╗██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗
  ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
```

### **Built to fund. Built to last.**

> **61 modules · 4 pillars · 130,000+ lines · 1,800+ tests**

---

CapitalForge is the corporate funding and credit card stacking operating system for financial advisors, brokers, and their business clients. It orchestrates the full lifecycle of commercial credit acquisition — from business intake and KYB/KYC through multi-issuer card stacking, APR expiry management, compliance enforcement, and document vaulting — under a hardened multi-tenant architecture.

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Modules](#modules)
- [NPM Scripts](#npm-scripts)
- [Tech Stack](#tech-stack)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

CapitalForge replaces fragmented spreadsheets, siloed CRMs, and manual compliance workflows with a single operating system purpose-built for corporate funding programs. It delivers:

- **Automated credit intelligence** — multi-bureau pulls, FICO/Vantage/SBSS scoring, issuer-rule enforcement (Chase 5/24, Amex velocity, Citi 8/65)
- **Funding round orchestration** — multi-card stacking sequencing, APR expiry alerts (60/30/15-day windows), leverage scoring
- **Compliance-first design** — GLBA, TCPA, UDAP/UDAAP, California SB 1235, and Section 1071 enforced at the platform layer
- **Canonical audit ledger** — every state change is an immutable event; full chain of custody for any regulatory inquiry
- **VoiceForge** — TCPA-gated telephony with live call compliance scanning and automated outreach campaigns
- **VisionAudioForge** — OCR pipeline and AI document intelligence agents with maker-checker approval chains

---

## Quick Start

### Prerequisites

- **Node.js** >= 20.x
- **Docker** >= 24.x and Docker Compose >= 2.x
- **npm** >= 10.x
- **Git** >= 2.x

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/green-companies-llc/capitalforge.git
cd capitalforge

# 2. Start infrastructure (PostgreSQL 16 + Redis 7)
docker-compose up -d

# 3. Install dependencies
npm install

# 4. Configure environment
cp .env.example .env
# Edit .env with your secrets — see Environment Variables below

# 5. Generate Prisma client
npm run db:generate

# 6. Run database migrations
npm run db:migrate

# 7. Seed reference data
npm run db:seed

# 8. Start the development server
npm run dev
```

The backend API will be available at `http://localhost:4000/api`
The frontend dashboard will be available at `http://localhost:3000`

### One-command setup (after cloning)

```bash
bash scripts/setup.sh
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                       CapitalForge (61 Modules)                            │
│                                                                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │   Intelligence   │  │  Orchestration   │  │       Compliance         │ │
│  │                  │  │                  │  │                          │ │
│  │  Credit Intel    │  │  Funding Rounds  │  │  TCPA Consent Vault      │ │
│  │  Fraud Detection │  │  Card Apps       │  │  UDAP/UDAAP Monitor      │ │
│  │  Suitability     │  │  APR Alerts      │  │  SB 1235 Disclosures     │ │
│  │  Sanctions       │  │  Auto-Restack    │  │  Section 1071            │ │
│  │  Readiness Score │  │  VoiceForge      │  │  ACH Controls            │ │
│  │  VAF/OCR Agents  │  │  Deal Committee  │  │  Fair Lending Monitor    │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘ │
│                                                                            │
│  ┌───────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │            Platform               │  │          Financial           │  │
│  │                                   │  │                              │  │
│  │  Multi-Tenant  │  RBAC            │  │  Spend Governance            │  │
│  │  Event Bus     │  Document Vault  │  │  Statement Reconciliation    │  │
│  │  VoiceForge    │  VAF Agents      │  │  Repayment │ IRC 163(j)      │  │
│  │  API Portal    │  CRM             │  │  Revenue Ops │ Tax Docs      │  │
│  │  Audit Ledger  │  Integration     │  │  Funds Flow Classification   │  │
│  └───────────────────────────────────┘  └──────────────────────────────┘  │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │        Horizontal Foundation                                       │    │
│  │  Canonical Event Bus  ·  PostgreSQL 16 RLS  ·  Redis 7 BullMQ     │    │
│  │  Prisma Tenant Middleware  ·  JOSE JWT Auth  ·  Zod Validation     │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────────┘

  VoiceForge (Module 45)           VisionAudioForge (Module 46)
  ┌──────────────────────┐         ┌─────────────────────────────┐
  │  Twilio Telephony    │         │  OCR Pipeline               │
  │  TCPA Consent Gate   │         │  StatementAgent             │
  │  Live Compliance     │         │  KYBAgent / ContractAgent   │
  │  Outreach Campaigns  │         │  AcknowledgmentAgent        │
  │  QA Scoring          │         │  EvidenceBundleAgent        │
  │  Call Vault Auto-File│         │  Maker-Checker Approvals    │
  └──────────────────────┘         └─────────────────────────────┘
```

For deeper architecture documentation:

- [`docs/architecture.md`](docs/architecture.md) — event bus topology, tenant isolation model, data flow diagrams
- [`docs/voiceforge-integration.md`](docs/voiceforge-integration.md) — VoiceForge telephony and call-compliance architecture
- [`docs/visionaudioforge-integration.md`](docs/visionaudioforge-integration.md) — VisionAudioForge OCR pipeline and agent architecture
- [`docs/deploy.md`](docs/deploy.md) — Docker commands, migration procedures, rollback, monitoring

---

## Modules

### Intelligence Pillar

| # | Module |
|---|--------|
| 3 | Credit Intelligence Engine |
| 4 | Funding Readiness Scorer |
| 5 | Leverage Calculator |
| 16 | Fraud Detection |
| 17 | Sanctions Screening |
| 18 | AI Governance |
| 19 | Decision Explainability |
| 20 | Funding Simulator |
| 21 | Stress Test Engine |
| 22 | Credit Optimizer |
| 23 | Credit Builder |

### Orchestration Pillar

| # | Module |
|---|--------|
| 6 | Funding Round Orchestrator |
| 7 | Card Application Manager |
| 8 | APR Expiry Alert Engine |
| 24 | Card Benefits Service |
| 25 | Rewards Optimization |
| 26 | Auto-Restack Engine |
| 27 | Decline Recovery |
| 28 | Issuer Relationship Manager |
| 29 | Deal Committee |
| 30 | Workflow Engine |
| 31 | Policy Orchestration |

### Compliance Pillar

| # | Module |
|---|--------|
| 9 | Suitability & No-Go Engine |
| 10 | TCPA Consent Vault |
| 11 | Product Acknowledgment Engine |
| 12 | ACH Debit Control |
| 13 | UDAP/UDAAP Compliance Monitor |
| 32 | State Law Mapper |
| 33 | Disclosure CMS |
| 34 | Fair Lending Monitor |
| 35 | Complaint Management |
| 36 | Regulatory Intelligence |
| 37 | Regulator Response |
| 38 | Comm Compliance |
| 39 | Rules Versioning |

### Platform Pillar

| # | Module |
|---|--------|
| 1 | Auth & Multi-Tenant |
| 2 | Business Onboarding & KYB |
| 14 | Document Vault |
| 15 | Canonical Audit Ledger & Event Bus |
| 40 | API Portal |
| 41 | Integration Layer |
| 42 | CRM |
| 43 | Referral Engine |
| 44 | Partner Governance |
| 45 | VoiceForge |
| 46 | VisionAudioForge |
| 47 | SaaS Entitlements |
| 48 | Sandbox |
| 49 | Data Lineage |
| 50 | Business Continuity |
| 61 | Client Graduation |

### Financial Pillar

| # | Module |
|---|--------|
| 51 | Revenue Ops |
| 52 | Spend Governance |
| 53 | Statement Reconciliation |
| 54 | Repayment |
| 55 | Hardship |
| 56 | Tax Documents |
| 57 | Funds Flow Classification |
| 58 | IRC 163(j) Analysis |
| 59 | Statement Normalizer |
| 60 | Business Purpose Evidence |

See [`docs/all-modules.md`](docs/all-modules.md) for the complete module registry with descriptions, data models, and events.

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start backend + frontend concurrently (development) |
| `npm run dev:backend` | Start Express API server with hot reload |
| `npm run dev:frontend` | Start Next.js dev server on port 3000 |
| `npm run build` | Build backend + frontend for production |
| `npm run build:backend` | Compile TypeScript backend |
| `npm run build:frontend` | Build Next.js frontend |
| `npm test` | Run all tests (unit + integration + e2e) |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests (requires Docker infrastructure) |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Run Prettier formatter |
| `npm run db:generate` | Generate Prisma client from schema |
| `npm run db:migrate` | Run database migrations (development) |
| `npm run db:push` | Push schema changes to DB (no migration file) |
| `npm run db:seed` | Seed reference and test data |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run docker:up` | Start Docker infrastructure (PostgreSQL + Redis) |
| `npm run docker:down` | Stop Docker infrastructure |
| `npm run setup` | Full bootstrap: install + generate + migrate |

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript | 5.x |
| API Framework | Express | 5.x |
| Frontend | Next.js | 15.x |
| UI Library | React | 19.x |
| State (server) | TanStack React Query | 5.x |
| State (client) | Zustand | 5.x |
| Styling | Tailwind CSS | 4.x |
| ORM | Prisma | 6.x |
| Database | PostgreSQL | 16 |
| Cache / Queue Backend | Redis | 7 |
| Job Queue | BullMQ | 5.x |
| Auth | JOSE (JWT) | 6.x |
| Validation | Zod | 3.x |
| Logging | Winston | 3.x |
| Date Utilities | date-fns | 4.x |
| Testing | Vitest | 3.x |
| HTTP Client (tests) | built-in fetch | — |
| Containerization | Docker / Compose | 24.x / 2.x |
| Linting | ESLint + TypeScript ESLint | 9.x / 8.x |
| Formatting | Prettier | 3.x |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all required values before starting the application. **Never commit `.env` to version control.**

```bash
cp .env.example .env
```

Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens (min 32 chars) |
| `JWT_ACCESS_EXPIRY` | Access token TTL (default: `15m`) |
| `JWT_REFRESH_EXPIRY` | Refresh token TTL (default: `7d`) |
| `PORT` | Backend API port (default: `4000`) |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `ENCRYPTION_KEY` | AES-256 key for PII field encryption |
| `STORAGE_PROVIDER` | Document storage: `s3` \| `local` |
| `S3_BUCKET` | S3 bucket name for document vault |
| `S3_REGION` | AWS region |
| `SANCTIONLIST_API_KEY` | Sanctions screening provider API key |
| `BUREAU_API_KEY` | Credit bureau aggregator API key |

See [`.env.example`](.env.example) for the full reference with descriptions for all 26+ variables.

---

## Testing

```bash
# Run all tests
npm test

# Unit tests only (no infrastructure required)
npm run test:unit

# Integration tests (requires docker-compose up -d)
npm run test:integration

# End-to-end tests (no infrastructure required — mocked Prisma)
npm run test:e2e

# Specific E2E flows
npx vitest run tests/e2e/onboarding-flow.test.ts
npx vitest run tests/e2e/funding-flow.test.ts
npx vitest run tests/e2e/compliance-flow.test.ts

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Lint
npm run lint

# Type check
npx tsc --noEmit
```

### Test Suites

| Suite | Location | Count | Description |
|-------|----------|-------|-------------|
| Unit | `tests/unit/` | 1,700+ | Pure function tests — no I/O, no DB |
| Integration | `tests/integration/` | — | Service + DB tests (requires Postgres + Redis) |
| E2E — Onboarding Flow | `tests/e2e/onboarding-flow.test.ts` | 12 | Business creation → KYB/KYC → readiness score → track routing |
| E2E — Funding Flow | `tests/e2e/funding-flow.test.ts` | 12 | Suitability → acknowledgment → consent → optimizer → apply → approve |
| E2E — Compliance Flow | `tests/e2e/compliance-flow.test.ts` | 12 | UDAP → state law → consent gate → ack gate → vault → dossier |

E2E tests use mocked Prisma clients and require **no running infrastructure**.
Integration tests require `docker-compose up -d` and a configured `.env`.

See [`docs/testing.md`](docs/testing.md) for the full testing guide.

---

## Deployment

### Docker (Development)

```bash
docker-compose up -d          # Start PostgreSQL + Redis
docker-compose logs -f        # Tail logs
docker-compose down           # Stop all services
```

### Docker (Production)

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes

See [`infra/k8s/`](infra/k8s/) for Kubernetes manifests.

### Terraform

See [`infra/terraform/`](infra/terraform/) for infrastructure-as-code definitions.

### CI/CD

GitHub Actions workflows are in `.github/workflows/`:
- `ci.yml` — lint, type-check, unit, integration tests on push/PR
- `deploy.yml` — build + push to GHCR, deploy to staging (push to `main`), deploy to production (published release tag)

See [`docs/deploy.md`](docs/deploy.md) for the complete deployment guide including rollback procedures.

---

## API Documentation

Interactive OpenAPI documentation is available at:

```
http://localhost:4000/api/docs
```

For a quick one-page endpoint reference, see [`docs/api-quick-reference.md`](docs/api-quick-reference.md).

For the full annotated API reference with request/response examples, see [`docs/api.md`](docs/api.md).

**Base URL:** `http://localhost:4000/api`
**Auth:** `Authorization: Bearer <access_token>` on all authenticated routes
**Tenant:** `X-Tenant-ID: <tenant_uuid>` on all authenticated routes

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full contributing guide.

Quick reference:

1. Create a feature branch from `master`: `git checkout -b ai-feature/<slug>`
2. Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
3. Write or update tests for all changed code
4. Ensure `npm run lint`, `npx tsc --noEmit`, and `npm test` all pass before opening a PR
5. Open a pull request against `master` with a summary covering what, why, how, tests, and risks

---

## License

**Proprietary** — All rights reserved.

Copyright © 2026 Green Companies LLC. Unauthorized copying, distribution, or use of this software, in whole or in part, is strictly prohibited without prior written permission from Green Companies LLC.
