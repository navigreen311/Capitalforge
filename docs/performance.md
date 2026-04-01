# CapitalForge Performance Testing Guide

## Overview

This guide covers the k6 load testing infrastructure for CapitalForge. Tests are organised into four scenario files that each target a distinct system surface area. All scenarios share a common configuration module (`tests/performance/k6-config.ts`) that centralises thresholds, authentication, and helper functions.

---

## Prerequisites

### Install k6

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Windows (Chocolatey)
choco install k6

# Docker (no local install needed)
docker run --rm -i grafana/k6 run - <scenario.js
```

Minimum required version: **k6 >= 0.45**. Verify with `k6 version`.

### Optional: xk6-dashboard

Install the [xk6-dashboard](https://github.com/grafana/xk6-dashboard) extension to stream a live HTML report during a run:

```bash
xk6 build --with github.com/grafana/xk6-dashboard
```

The `run-load-tests.sh` script auto-detects the extension and activates HTML output when available.

---

## Project Structure

```
tests/performance/
├── k6-config.ts                   Shared config: base URL, auth, thresholds, helpers
└── scenarios/
    ├── onboarding-load.js         50 VU onboarding flow (business → owner → KYB/KYC)
    ├── funding-flow-load.js       30 VU funding pipeline (suitability → optimize → apply → approve)
    ├── api-stress.js              100 VU stress test on core endpoints
    └── compliance-load.js         30 VU compliance subsystem (UDAP, consent, document vault)

scripts/
└── run-load-tests.sh              Orchestration script with HTML report output
```

---

## Running Tests

### All scenarios (recommended for CI gate)

```bash
./scripts/run-load-tests.sh
```

### Single scenario

```bash
./scripts/run-load-tests.sh --scenario onboarding
./scripts/run-load-tests.sh --scenario funding-flow
./scripts/run-load-tests.sh --scenario api-stress
./scripts/run-load-tests.sh --scenario compliance
```

### Against a non-local target

```bash
./scripts/run-load-tests.sh \
  --base-url https://api.staging.capitalforge.io \
  --token "$LOAD_TEST_JWT" \
  --tenant-id "tenant-staging-load" \
  --output-dir reports/$(date +%Y%m%d_%H%M%S)
```

### Directly with k6 (no shell script)

```bash
k6 run \
  -e K6_BASE_URL=http://localhost:4000 \
  -e K6_AUTH_TOKEN="$TOKEN" \
  -e K6_TENANT_ID="test-tenant" \
  --summary-export=reports/onboarding-summary.json \
  tests/performance/scenarios/onboarding-load.js
```

---

## Environment Variables

| Variable        | Default                  | Description                                      |
|-----------------|--------------------------|--------------------------------------------------|
| `K6_BASE_URL`   | `http://localhost:4000`  | API server base URL                              |
| `K6_AUTH_TOKEN` | *(empty)*                | Pre-minted JWT bearer token for auth routes      |
| `K6_TENANT_ID`  | `test-tenant-load`       | Tenant UUID injected via `X-Tenant-Id` header    |
| `K6_USER_ID`    | `test-user-load`         | User UUID for audit trail attribution            |

**Never commit tokens to source control.** Use CI/CD secret injection (GitHub Actions secrets, AWS Parameter Store, etc.).

---

## Baseline Performance Targets

These are the SLA thresholds enforced by every scenario. A scenario **fails** if any threshold is violated.

### Global thresholds

| Metric                 | Target          | Description                          |
|------------------------|-----------------|--------------------------------------|
| `http_req_duration p95`| < 500 ms        | 95th-percentile response time        |
| `http_req_failed rate` | < 1%            | Fraction of failed (non-2xx) requests|

### Per-endpoint thresholds

| Endpoint family         | p95 Target   | Notes                                         |
|-------------------------|-------------|-----------------------------------------------|
| `GET /api/health`       | < 100 ms    | Liveness probe — must always be fast          |
| `GET /api/businesses`   | < 300 ms    | List query, paginated                         |
| `POST /api/businesses`  | < 500 ms    | Write + readiness score computation           |
| `POST owner add`        | < 500 ms    | Owner create + optional readiness recalc      |
| `POST KYB verify`       | < 800 ms    | SoS check + OFAC screen I/O                   |
| `POST KYC verify`       | < 800 ms    | OFAC screen + fraud heuristics                |
| `POST suitability/check`| < 600 ms    | Score computation + recommendation            |
| `POST optimize`         | < 700 ms    | Card stack optimizer (compute-heavy)          |
| `POST application`      | < 600 ms    | Pipeline create + gate checks                 |
| `GET risk-score`        | < 500 ms    | Cached read from compliance service           |
| `POST compliance/check` | < 600 ms    | UDAP scoring + risk register update           |
| `POST/GET consent`      | < 300 ms    | Consent gate operations                       |
| `POST documents`        | < 1200 ms   | Document upload (base64 payload + S3 write)   |

### Stress test relaxed thresholds

The `api-stress.js` scenario uses wider thresholds to allow observation under 100 VUs without immediately aborting:

| Metric                 | Stress Target |
|------------------------|---------------|
| `http_req_duration p95`| < 2000 ms     |
| `http_req_failed rate` | < 5%          |

---

## Scenario Descriptions

### 1. `onboarding-load.js` — Business Onboarding (50 VUs)

Simulates the full business onboarding journey for 50 concurrent users.

**Ramp:** 10 VUs for 1 min → 50 VUs for 5 min → 0 VUs (30 s cool-down)

**Flow per VU:**
1. `POST /api/businesses` — create business entity
2. `POST /api/businesses/:id/owners` — add 51% beneficial owner
3. `POST /api/businesses/:id/verify/kyb` — trigger KYB (SoS + OFAC)
4. `POST /api/businesses/:id/verify/kyc/:ownerId` — trigger KYC
5. `GET  /api/businesses/:id/verification-status` — assert readiness

**Key custom metrics:** `kyb_latency_ms`, `kyc_latency_ms`, `onboarding_full_flow_ms`

---

### 2. `funding-flow-load.js` — Funding Pipeline (30 VUs)

Exercises the full funding decision chain: suitability gate → card stack optimizer → application submit → approval.

**Ramp:** 10 VUs for 1 min → 30 VUs for 5 min → 0 VUs (30 s cool-down)

**Flow per VU:**
1. `POST /api/businesses/:id/suitability/check` — risk gate
2. `POST /api/businesses/:id/optimize` — card stack recommendation
3. `POST /api/businesses/:id/applications` — submit application
4. `PUT  /api/applications/:id/status` — approve (status transition)
5. `GET  /api/businesses/:id/optimizer/results` — retrieve cached stack

**Key custom metrics:** `optimizer_latency_ms`, `gate_check_latency_ms`, `full_funding_flow_ms`

**Note:** The scenario uses a `setup()` phase to pre-seed 30 businesses. VU iteration picks from this pool by index to avoid redundant entity creation during the sustained load phase.

---

### 3. `api-stress.js` — Core API Stress (100 VUs)

Intentionally pushes the API to its limits to identify degradation curves and breaking points. Read-only and liveness endpoints are hit in a tight loop.

**Ramp:** 0 → 25 VUs (30 s) → 50 VUs (90 s) → 100 VUs (2 min) → 50 VUs recovery (90 s) → 0 (30 s)

**Endpoints tested:**
- `GET /api/health` — liveness
- `GET /api/health/ready` — readiness (DB ping)
- `GET /api/businesses` — list (paginated)
- `GET /api/businesses/:id` — single business fetch
- `GET /api/businesses/:id/credit` — credit profiles
- `GET /api/businesses/:id/compliance/risk-score` — risk score

**Observation:** Review the p95/p99 latency curves across the ramp stages in the summary JSON to identify the VU count at which latency starts to inflate — this is your practical concurrency limit.

---

### 4. `compliance-load.js` — Compliance Subsystems (30 VUs)

Targets the compliance and data governance layer: UDAP scoring, consent gates, and document vault writes.

**Ramp:** 10 VUs for 1 min → 30 VUs for 5 min → 0 VUs (30 s cool-down)

**Flow per VU:**
1. `POST /api/businesses/:id/compliance/check` — UDAP text analysis + risk register
2. `POST /api/businesses/:id/consent` — grant consent channel
3. `GET  /api/businesses/:id/consent` — read current gate status
4. `POST /api/businesses/:id/documents` — upload document to vault
5. `GET  /api/businesses/:id/compliance/risk-score` — poll updated risk score

**Key custom metrics:** `udap_scoring_ms`, `consent_grant_ms`, `doc_upload_ms`

---

## Report Outputs

After each run, the following files are written to `reports/` (or `--output-dir`):

| File                                | Content                                        |
|-------------------------------------|------------------------------------------------|
| `onboarding-load-summary.json`      | Full k6 metrics snapshot for onboarding        |
| `funding-flow-load-summary.json`    | Full k6 metrics snapshot for funding flow      |
| `api-stress-summary.json`           | Full k6 metrics snapshot for stress test       |
| `compliance-load-summary.json`      | Full k6 metrics snapshot for compliance load   |
| `<scenario>-run.log`                | Raw stdout/stderr from the k6 process          |

With xk6-dashboard installed, `<scenario>-report.html` is also generated.

---

## CI/CD Integration

### GitHub Actions example

```yaml
name: Performance Gate

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  load-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install k6
        run: |
          sudo gpg --no-default-keyring \
            --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
            --keyserver hkp://keyserver.ubuntu.com:80 \
            --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] \
            https://dl.k6.io/deb stable main" \
            | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update && sudo apt-get install k6

      - name: Start application (staging)
        run: echo "Deployment handled by prior job in pipeline"

      - name: Run load tests
        env:
          K6_BASE_URL:   ${{ vars.STAGING_API_URL }}
          K6_AUTH_TOKEN: ${{ secrets.LOAD_TEST_JWT }}
          K6_TENANT_ID:  ${{ vars.LOAD_TEST_TENANT_ID }}
        run: ./scripts/run-load-tests.sh --output-dir reports

      - name: Upload reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: load-test-reports
          path: reports/
          retention-days: 30
```

---

## Optimization Recommendations

### Response time inflation

| Symptom | Likely cause | Recommended fix |
|---------|-------------|-----------------|
| KYB/KYC p95 > 800 ms | External OFAC/SoS API latency | Cache OFAC responses; add circuit breaker |
| Optimizer p95 > 700 ms | In-memory scoring loop | Move to Redis-backed result cache; add worker pool |
| Document upload p95 > 1200 ms | S3 PUT latency | Enable S3 Transfer Acceleration; increase multipart threshold |
| Risk score p95 > 500 ms | Prisma query without index | Add composite index on `(businessId, tenantId, createdAt)` |
| Health `/ready` p95 > 100 ms | Slow DB ping under load | Add read replica; ensure `SELECT 1` uses pooler |

### Connection pool tuning

Under 100 VU stress, the default Prisma connection pool (10 connections) will queue requests. Tune via `DATABASE_URL`:

```
DATABASE_URL=postgresql://...?connection_limit=25&pool_timeout=30
```

For BullMQ/Redis, increase `maxRetriesPerRequest` and `enableReadyCheck: false` under load to reduce connection latency.

### Rate-limiting false positives

If the stress test hits 429 responses, the error rate threshold will fail. Review `src/backend/middleware/` rate limiter configuration and whitelist the load test IP range in staging environments.

---

## Capacity Planning

Use the following model to estimate required infrastructure for a given target throughput.

### Baseline measurements (single-node, 4 vCPU / 8 GB)

| Scenario                | Max sustainable VUs | Throughput (req/s) | p95 latency |
|-------------------------|---------------------|--------------------|-------------|
| Onboarding flow         | ~60 VUs             | ~12 req/s          | ~480 ms     |
| Funding flow            | ~40 VUs             | ~8 req/s           | ~490 ms     |
| Core API (read-heavy)   | ~120 VUs            | ~80 req/s          | ~420 ms     |
| Compliance flow         | ~35 VUs             | ~7 req/s           | ~550 ms     |

> These are estimated baselines derived from threshold targets. Run the scenarios against your actual infrastructure and update this table with measured values.

### Horizontal scaling rule of thumb

- Each additional API server node adds approximately **0.8×** the single-node throughput (accounting for connection pool contention and Redis bottlenecks).
- At 200 concurrent users across all flows, target **3 API nodes** behind the nginx load balancer with at least a **25-connection** Prisma pool per node.
- Database read scaling: add a **Postgres read replica** when `GET` request volume exceeds 50 req/s sustained.

### Load test schedule recommendation

| Environment | Frequency  | Scenarios          | Purpose                              |
|-------------|------------|--------------------|--------------------------------------|
| Staging     | Every PR   | onboarding + api-stress | Regression gate pre-merge     |
| Staging     | Weekly     | All four scenarios | Full baseline refresh               |
| Production  | Monthly    | api-stress (off-peak) | Capacity validation without customer impact |
