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

---

CapitalForge is a **61-module corporate funding and credit card stacking operating system** for financial advisors, brokers, and their business clients. It orchestrates the full lifecycle of commercial credit acquisition — from business intake and KYB/KYC through multi-issuer card stacking, APR expiry management, compliance enforcement, and document vaulting — under a hardened multi-tenant architecture. All 61 modules are implemented across five pillars: Intelligence, Orchestration, Compliance, Platform, and Financial.

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [MVP Modules](#mvp-modules)
- [Tech Stack](#tech-stack)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

CapitalForge replaces fragmented spreadsheets, siloed CRMs, and manual compliance workflows with a single operating system purpose-built for corporate funding programs. It delivers:

- **Automated credit intelligence** — multi-bureau pulls, FICO/Vantage/SBSS scoring, issuer-rule enforcement (Chase 5/24, Amex velocity, Citi 8/65)
- **Funding round orchestration** — multi-card stacking sequencing, APR expiry alerts (60/30/15-day windows), leverage scoring
- **Compliance-first design** — GLBA, TCPA, UDAP/UDAAP, California SB 1235, and Section 1071 enforced at the platform layer, not bolted on after
- **Canonical audit ledger** — every state change is an immutable event; full chain of custody for any regulatory inquiry

### Four System Pillars

| Pillar | Responsibility |
|--------|---------------|
| **Intelligence** | Credit profiling, fraud detection, suitability scoring, sanctions screening, funding readiness, VisionAudioForge OCR |
| **Orchestration** | Funding round lifecycle, card application sequencing, APR alert engine, restack triggers, VoiceForge outreach |
| **Compliance** | TCPA consent vault, UDAP/UDAAP guardrails, SB 1235 disclosures, Section 1071 data collection, ACH debit controls |
| **Platform** | Multi-tenant isolation, RBAC, canonical event bus, document vault, audit trail, VoiceForge telephony, VAF document intelligence |
| **Financial** | Spend governance, statement reconciliation, repayment, IRC § 163(j) analysis, tax documents, revenue ops |

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

# 5. Run database migrations
npm run db:migrate

# 6. Seed reference data
npm run db:seed

# 7. Start the development server
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

See [`docs/architecture.md`](docs/architecture.md) for the full system architecture document including event bus topology, tenant isolation model, and Mermaid data flow diagrams.

See [`docs/voiceforge-integration.md`](docs/voiceforge-integration.md) for the VoiceForge telephony and call-compliance architecture.

See [`docs/visionaudioforge-integration.md`](docs/visionaudioforge-integration.md) for the VisionAudioForge document intelligence and OCR pipeline architecture.

See [`docs/deploy.md`](docs/deploy.md) for the complete deployment guide including Docker commands, migration procedures, rollback, and monitoring.

### Five Pillars

```
┌──────────────────────────────────────────────────────────────────┐
│                          CapitalForge (61 Modules)               │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Intelligence │  │ Orchestration│  │      Compliance      │   │
│  │             │  │              │  │                      │   │
│  │ Credit Intel│  │ Funding      │  │ TCPA Consent Vault   │   │
│  │ Fraud Detect│  │ Rounds       │  │ UDAP/UDAAP Monitor   │   │
│  │ Suitability │  │ Card Apps    │  │ SB 1235 Disclosures  │   │
│  │ Sanctions   │  │ APR Alerts   │  │ Section 1071         │   │
│  │ Readiness   │  │ Restack      │  │ ACH Controls         │   │
│  │ VAF/OCR     │  │ VoiceForge   │  │ Fair Lending Monitor │   │
│  └─────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────┐  ┌──────────────────────────┐  │
│  │          Platform           │  │        Financial         │  │
│  │                             │  │                          │  │
│  │ Multi-Tenant │ RBAC         │  │ Spend Governance         │  │
│  │ Event Bus    │ Document Vault│  │ Statement Reconciliation │  │
│  │ VoiceForge   │ VAF Agents   │  │ Repayment │ IRC 163(j)   │  │
│  │ API Portal   │ CRM          │  │ Revenue Ops │ Tax Docs   │  │
│  └─────────────────────────────┘  └──────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Backend

- **Express 5** API server with tenant middleware, RBAC, and request-id tracing
- **Prisma 6** ORM over PostgreSQL 16
- **BullMQ** job queue backed by Redis 7
- **Canonical Event Bus** — all domain events written to `ledger_events` table and fanned out to in-process subscribers

### Frontend

- **Next.js 15** with App Router
- **React Query** for server state, **Zustand** for client state
- **Tailwind CSS 4** for styling

---

## Modules

See [`docs/mvp-modules.md`](docs/mvp-modules.md) for full MVP module descriptions.
See [`docs/all-modules.md`](docs/all-modules.md) for the complete 61-module registry.

### Core MVP Modules (Sprint 1 — Modules 1–15)

| # | Module | Pillar |
|---|--------|--------|
| 1 | Auth & Multi-Tenant | Platform |
| 2 | Business Onboarding & KYB | Platform |
| 3 | Credit Intelligence Engine | Intelligence |
| 4 | Funding Readiness Scorer | Intelligence |
| 5 | Leverage Calculator | Intelligence |
| 6 | Funding Round Orchestrator | Orchestration |
| 7 | Card Application Manager | Orchestration |
| 8 | APR Expiry Alert Engine | Orchestration |
| 9 | Suitability & No-Go Engine | Compliance |
| 10 | TCPA Consent Vault | Compliance |
| 11 | Product Acknowledgment Engine | Compliance |
| 12 | ACH Debit Control | Compliance |
| 13 | UDAP/UDAAP Compliance Monitor | Compliance |
| 14 | Document Vault | Platform |
| 15 | Canonical Audit Ledger & Event Bus | Platform |

### Extended Modules (Sprint 2 — Modules 16–61)

| # | Module | Pillar |
|---|--------|--------|
| 16 | Fraud Detection | Intelligence |
| 17 | Sanctions Screening | Intelligence |
| 18 | AI Governance | Intelligence |
| 19 | Decision Explainability | Intelligence |
| 20 | Funding Simulator | Intelligence |
| 21 | Stress Test Engine | Intelligence |
| 22 | Credit Optimizer | Intelligence |
| 23 | Credit Builder | Intelligence |
| 24 | Card Benefits Service | Orchestration |
| 25 | Rewards Optimization | Orchestration |
| 26 | Auto-Restack Engine | Orchestration |
| 27 | Decline Recovery | Orchestration |
| 28 | Issuer Relationship Manager | Orchestration |
| 29 | Deal Committee | Orchestration |
| 30 | Workflow Engine | Orchestration |
| 31 | Policy Orchestration | Orchestration |
| 32 | State Law Mapper | Compliance |
| 33 | Disclosure CMS | Compliance |
| 34 | Fair Lending Monitor | Compliance |
| 35 | Complaint Management | Compliance |
| 36 | Regulatory Intelligence | Compliance |
| 37 | Regulator Response | Compliance |
| 38 | Comm Compliance | Compliance |
| 39 | Rules Versioning | Compliance |
| 40 | API Portal | Platform |
| 41 | Integration Layer | Platform |
| 42 | CRM | Platform |
| 43 | Referral Engine | Platform |
| 44 | Partner Governance | Platform |
| 45 | VoiceForge | Platform |
| 46 | VisionAudioForge | Platform |
| 47 | SaaS Entitlements | Platform |
| 48 | Sandbox | Platform |
| 49 | Data Lineage | Platform |
| 50 | Business Continuity | Platform |
| 51 | Revenue Ops | Financial |
| 52 | Spend Governance | Financial |
| 53 | Statement Reconciliation | Financial |
| 54 | Repayment | Financial |
| 55 | Hardship | Financial |
| 56 | Tax Documents | Financial |
| 57 | Funds Flow Classification | Financial |
| 58 | IRC 163(j) Analysis | Financial |
| 59 | Statement Normalizer | Financial |
| 60 | Business Purpose Evidence | Financial |
| 61 | Client Graduation | Platform |

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript | 5.x |
| API Framework | Express | 5.x |
| Frontend | Next.js | 15.x |
| UI Library | React | 19.x |
| ORM | Prisma | 6.x |
| Database | PostgreSQL | 16 |
| Cache / Queue | Redis | 7 |
| Job Queue | BullMQ | 5.x |
| Auth | JOSE (JWT) | 6.x |
| Validation | Zod | 3.x |
| Server State | TanStack React Query | 5.x |
| Client State | Zustand | 5.x |
| Styling | Tailwind CSS | 4.x |
| Testing | Vitest | 3.x |
| Containerization | Docker / Compose | 24.x / 2.x |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all required values before starting the application. **Never commit `.env` to version control.**

```bash
cp .env.example .env
```

See [`.env.example`](.env.example) for the full reference with descriptions for every variable. Key variables include:

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

---

## Testing

```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# End-to-end tests only
npm run test:e2e

# Run a specific E2E test file
npx vitest run tests/e2e/onboarding-flow.test.ts
npx vitest run tests/e2e/funding-flow.test.ts
npx vitest run tests/e2e/compliance-flow.test.ts

# Watch mode (re-runs on file changes)
npm run test:watch

# Coverage report
npm run test:coverage

# Lint
npm run lint

# Type check
npx tsc --noEmit
```

### Test suites

| Suite | Location | Description |
|-------|----------|-------------|
| Unit | `tests/unit/` | Pure function tests — no I/O, no DB |
| Integration | `tests/integration/` | Service + DB tests (requires running Postgres + Redis) |
| E2E — Onboarding Flow | `tests/e2e/onboarding-flow.test.ts` | Business creation → KYB/KYC → readiness score → track routing (12 tests) |
| E2E — Funding Flow | `tests/e2e/funding-flow.test.ts` | Suitability → acknowledgment → consent → optimizer → apply → approve → complete (12 tests) |
| E2E — Compliance Flow | `tests/e2e/compliance-flow.test.ts` | UDAP → state law → consent gate → ack gate → vault → dossier (12 tests) |

E2E tests use mocked Prisma clients and require **no running infrastructure** — they can run in CI or locally without Docker.

Integration tests require running Docker infrastructure (`docker-compose up -d`) and a `.env` file with `DATABASE_URL` and `REDIS_URL`.

---

## Contributing

1. Create a feature branch from `master`: `git checkout -b ai-feature/<slug>`
2. Follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
3. Write or update tests for all changed code
4. Ensure `npm run lint`, `npx tsc --noEmit`, and `npm test` all pass
5. Open a pull request against `master` with a PR summary (what, why, how, tests, risks)

See [`CLAUDE.md`](CLAUDE.md) for the full AI-assisted development workflow used on this project.

---

## License

**Proprietary** — All rights reserved.

Copyright © 2026 Green Companies LLC. Unauthorized copying, distribution, or use of this software, in whole or in part, is strictly prohibited without prior written permission from Green Companies LLC.
