# CapitalForge — Monitoring, Observability & Alerting

## Contents

1. [Overview](#overview)
2. [Observability Stack](#observability-stack)
3. [What to Watch](#what-to-watch)
4. [Metric Reference](#metric-reference)
5. [Alert Runbooks](#alert-runbooks)
6. [Escalation Procedures](#escalation-procedures)
7. [Deploying Monitoring Config](#deploying-monitoring-config)
8. [Local Development](#local-development)

---

## Overview

CapitalForge uses a three-layer observability model:

| Layer | Tool | Purpose |
|---|---|---|
| **Metrics** | Prometheus + Grafana + Datadog | Golden signals, SLA tracking, infrastructure health |
| **Errors** | Sentry | Exception capture, error grouping, session replay |
| **Alerting** | Datadog Monitors + PagerDuty | On-call paging, escalation, compliance notifications |

All signals share the `X-Request-ID` correlation header so a single request can be traced across logs, metrics, APM traces, and Sentry events.

---

## Observability Stack

### Datadog Agent (Kubernetes)

**Config:** `infra/monitoring/datadog/datadog-values.yaml`

Deployed as a DaemonSet on every EKS node. Collects:

- **APM traces** — auto-instrumented via `@sentry/node` + Datadog tracer. Traces distributed across `capitalforge-backend` and worker pods.
- **Logs** — all container stdout/stderr, enriched with pod/service/version tags. Winston JSON format is parsed automatically.
- **Custom metrics** — scraped from `GET /metrics` (Prometheus exposition format) emitted by `src/backend/middleware/metrics.ts`.
- **PostgreSQL metrics** — via Datadog PostgreSQL integration (`pg_stat_statements`, pool counters).
- **Redis metrics** — via Datadog Redis integration (memory, keyspace, latency).

Install / upgrade:

```bash
helm repo add datadog https://helm.datadoghq.com
helm repo update
helm upgrade --install datadog datadog/datadog \
  --namespace monitoring \
  --create-namespace \
  -f infra/monitoring/datadog/datadog-values.yaml \
  --set datadog.apiKey=$DD_API_KEY \
  --set datadog.appKey=$DD_APP_KEY
```

### Datadog Dashboard

**Config:** `infra/monitoring/datadog/dashboards/capitalforge-overview.json`

Import via Datadog UI → Dashboards → New Dashboard → Import JSON, or use the API:

```bash
curl -X POST "https://api.datadoghq.com/api/v1/dashboard" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  -H "Content-Type: application/json" \
  -d @infra/monitoring/datadog/dashboards/capitalforge-overview.json
```

Panels: Request Rate, HTTP 5xx Error Rate, p95 Latency, Active Users, Pending Applications, Compliance Score, APR Alerts Pending, DB Connections, Redis Memory, BullMQ Queue Depth.

### Datadog Monitors (Alerts)

**Config:** `infra/monitoring/datadog/monitors/critical-alerts.json`

Upload via the [Datadog Monitor API](https://docs.datadoghq.com/api/latest/monitors/) or Terraform `datadog_monitor` resource. Each monitor maps to a PagerDuty routing key via `@pagerduty-capitalforge-p1` / `@pagerduty-capitalforge-compliance` notification tokens.

### Prometheus + Grafana (Cluster-level)

**Config:** `infra/monitoring/grafana/prometheus-rules.yaml`

Alert rules for the Prometheus Operator (kube-prometheus-stack). Deploy:

```bash
kubectl apply -f infra/monitoring/grafana/prometheus-rules.yaml -n monitoring
```

Rules mirror the Datadog monitors but operate on in-cluster Prometheus scraped metrics, providing alerting redundancy and lower-latency detection (15–30 s scrape interval vs. Datadog's 60 s).

### Sentry — Backend

**Config:** `infra/monitoring/sentry/sentry-config.ts`

Initialize before any other imports in `src/backend/server.ts`:

```typescript
import { initSentry } from '../../infra/monitoring/sentry/sentry-config.js';
initSentry(); // Must be first
```

Required environment variables:

| Variable | Description |
|---|---|
| `SENTRY_DSN` | Sentry project DSN for the backend project |
| `APP_VERSION` | Deployed version (set by CI, e.g., `git rev-parse --short HEAD`) |
| `NODE_ENV` | `production` / `staging` / `development` |

**PII scrubbing** is applied in `beforeSend`. The following are stripped before any event leaves the process: SSN, EIN, card numbers, bank account numbers, routing numbers, email addresses, and any field matching a sensitive key name (password, token, api_key, dob, etc.).

### Sentry — Frontend

**Config:** `infra/monitoring/sentry/sentry-frontend.ts`

Initialize in `src/frontend/app/layout.tsx`:

```typescript
import { initSentryFrontend } from '../../../infra/monitoring/sentry/sentry-frontend.js';
initSentryFrontend();
```

Required env vars:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry project DSN for the frontend project |
| `NEXT_PUBLIC_APP_ENV` | `production` / `staging` / `development` |
| `NEXT_PUBLIC_APP_VERSION` | Deployed version |

Session Replay is enabled at 20% sampling rate (100% for error sessions). All `input[type="password"]`, SSN/EIN/card fields, and elements with `data-sentry-mask` are masked in recordings.

### PagerDuty

**Config:** `infra/monitoring/pagerduty/escalation-policy.json`

Two services and two escalation policies:

- `capitalforge-platform` — platform engineering (P1–P4 tiers)
- `capitalforge-compliance` — compliance + legal (always P1, no delay)

Replace `YOUR_*_ID` placeholders with real PagerDuty user IDs before importing. Import via [PagerDuty Terraform provider](https://registry.terraform.io/providers/PagerDuty/pagerduty/latest) or REST API.

---

## What to Watch

### Golden Signals Dashboard

Open the CapitalForge Overview dashboard in Datadog daily during business hours. Focus on:

| Signal | Healthy | Warning | Critical |
|---|---|---|---|
| 5xx Error Rate | < 0.1% | 0.5–1% | > 1% |
| p95 Latency | < 800 ms | 800 ms – 2 s | > 2 s |
| DB Pool Utilization | < 50% | 50–75% | > 75% |
| Redis Memory | < 50% | 50–70% | > 70% |
| Compliance Score | 100% | 99% | < 99% |

### Business Signals

Monitor these daily — anomalies often precede technical problems:

- **Pending Applications** — unexpected spikes may indicate a processing bug.
- **APR Alerts Pending** — growing backlogs mean the APR alert job is stalled.
- **Consent Gate Failures** — any non-zero value warrants investigation.
- **Suitability No-Go Override Rate** — should stay < 5% of no-go decisions.

### Compliance Signals (Zero Tolerance)

These should always be zero:

- **Unauthorized ACH Detections** — any value triggers a P1 compliance incident.
- **Compliance Check Failures** — system errors in the compliance pipeline.

---

## Metric Reference

All custom metrics are emitted by `src/backend/middleware/metrics.ts` and exposed at `GET /metrics` (cluster-internal only).

### HTTP Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `capitalforge_http_requests_total` | counter | `method`, `route`, `status_class` | Total requests |
| `capitalforge_http_request_duration_seconds` | histogram | `method`, `route` | Request latency |
| `capitalforge_http_errors_total` | counter | `method`, `route`, `status_class` | 4xx + 5xx errors |
| `capitalforge_active_connections` | gauge | — | Live connections |

### Infrastructure Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `capitalforge_db_pool_connections` | gauge | `state` (active/idle/waiting) | DB pool by state |
| `capitalforge_db_pool_size_max` | gauge | — | Configured pool max |
| `capitalforge_queue_depth` | gauge | `queue_name` | BullMQ queue waiting count |

### Business Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `capitalforge_active_users` | gauge | — | Active sessions (1 h) |
| `capitalforge_applications_pending` | gauge | — | Applications in review |
| `capitalforge_apr_alerts_pending` | gauge | `window` (60d/30d/15d) | Open APR alerts |
| `capitalforge_compliance_score` | gauge | — | Platform compliance % |

### Compliance Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `capitalforge_consent_gate_failure_total` | counter | `channel` | TCPA gate failures |
| `capitalforge_ach_unauthorized_total` | counter | `tenant_id` | Unauthorized ACH events |
| `capitalforge_compliance_check_failure_total` | counter | `check_type` | Internal compliance errors |
| `capitalforge_suitability_nogo_total` | counter | — | No-go decisions enforced |
| `capitalforge_suitability_override_total` | counter | — | No-go overrides approved |

### Updating Metrics from Service Layer

Use the exported helpers from `metrics.ts`:

```typescript
import { updateGauge, incrementCounter, trackActiveUser } from '../middleware/metrics.js';

// After fetching pending application count:
updateGauge('capitalforge_applications_pending', {}, count);

// On consent gate failure:
incrementCounter('capitalforge_consent_gate_failure_total', { channel: 'email' });

// On unauthorized ACH detection:
incrementCounter('capitalforge_ach_unauthorized_total', { tenant_id: tenantId });

// On session creation:
trackActiveUser(1);

// On session expiry:
trackActiveUser(-1);
```

---

## Alert Runbooks

### P1 — HTTP 5xx Rate > 1%

**Trigger:** 5xx error rate exceeds 1% for 2+ minutes.

1. **Triage:** Check Datadog APM → Errors tab filtered to `status:5xx`. Identify the most common error type and route.
2. **Logs:** `kubectl logs -l app=capitalforge-backend -n production --since=5m | grep '"level":"error"'`
3. **Sentry:** Check for new error groups at the time the alert fired.
4. **Deployment check:** `kubectl rollout history deployment/capitalforge-backend -n production` — correlate spike with a recent rollout.
5. **Rollback if deployment-related:** `kubectl rollout undo deployment/capitalforge-backend -n production`
6. **Database:** If errors are DB-related, check `pg_stat_activity` for locks or long-running queries.

**Resolution:** Alert resolves automatically when error rate drops below 0.5% for 5 minutes.

---

### P1 — p95 Latency > 2 s

**Trigger:** p95 request latency exceeds 2000 ms for 5+ minutes.

1. **APM trace:** Datadog APM → Service Map → capitalforge-backend → sort by p95. Identify the slow span.
2. **Database slow queries:** `SELECT query, calls, mean_exec_time, total_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;`
3. **Redis latency:** `redis-cli --latency -h $REDIS_HOST -p 6379`
4. **Pod resources:** `kubectl top pods -l app=capitalforge-backend -n production`
5. **Scale out if CPU-bound:** `kubectl scale deployment/capitalforge-backend --replicas=6 -n production`
6. **BullMQ backpressure:** Check if background job workers are consuming shared resources.

---

### P1 — Database Connection Pool Exhausted

**Trigger:** DB pool utilization > 90% for 2+ minutes.

1. **Current connections:** `SELECT count(*), state FROM pg_stat_activity WHERE datname = 'capitalforge' GROUP BY state;`
2. **Long-running idle connections:** `SELECT pid, application_name, state, query_start FROM pg_stat_activity WHERE state = 'idle' AND query_start < NOW() - INTERVAL '5 minutes';`
3. **Kill idle connections (verify safe first):** `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < NOW() - INTERVAL '10 minutes' AND datname = 'capitalforge';`
4. **Leak investigation:** Check for unclosed Prisma clients — ensure every code path calls `prisma.$disconnect()` or is scoped to request lifecycle.
5. **Emergency bump:** Increase `DATABASE_POOL_MAX` env var and redeploy (requires restart).

---

### P1 — Redis Out of Memory

**Trigger:** Redis memory utilization > 85% for 2+ minutes.

1. **Memory breakdown:** `redis-cli -h $REDIS_HOST info memory`
2. **Largest keys:** `redis-cli -h $REDIS_HOST --bigkeys`
3. **BullMQ retention:** If `bull:*:completed` keys are large, reduce job log retention in worker config.
4. **Flush stale completed jobs:** `redis-cli -h $REDIS_HOST SCAN 0 MATCH "bull:*:completed" COUNT 100` → review before deleting.
5. **Increase maxmemory via Terraform:** Modify `aws_elasticache_replication_group` and apply.
6. **Eviction policy:** Confirm `maxmemory-policy` is set to `allkeys-lru` (not `noeviction`) to prevent write failures.

---

### P1 — Unauthorized ACH Debit Detected

**Trigger:** Any unauthorized ACH debit event in production.

**This is a Regulation E compliance event. Timeline is mandatory.**

| Time | Action |
|---|---|
| T+0 | Incident declared. On-call engineer pages Compliance Officer via PagerDuty. |
| T+60 min | Compliance Officer reviews affected transactions in audit ledger. |
| T+2 h | Initiate ACH return (NACHA return code R10 — Customer Advises Not Authorized). |
| T+24 h | Written incident report to Compliance Officer + Legal Counsel. |
| T+10 days | Provisional credit issued to affected customer per Reg E timeline (if applicable). |

1. **Identify transactions:** Query `ledger_events` where `event_type = 'ACH_DEBIT_UNAUTHORIZED'` and `created_at > NOW() - INTERVAL '1 hour'`.
2. **Preserve records:** Do NOT delete or modify any `ledger_events` records. Apply legal hold if needed.
3. **Notify Compliance Officer** (PagerDuty auto-pages, but confirm receipt).
4. **Coordinate with ACH processor** for return initiation.
5. **Document in incident log** with timestamps for regulatory audit trail.

---

### P2 — Consent Gate Failure Rate Elevated

**Trigger:** > 10 consent gate failures in 15 minutes.

1. **Identify pattern:** `kubectl logs -l app=capitalforge-backend -n production --since=15m | grep "consent_gate"`
2. **Check consent template versions:** `GET /api/businesses/:id/consents` — confirm templates are active and not expired.
3. **Verify consent service:** Check `consent.service.ts` and `consent-gate.ts` for runtime errors in Sentry.
4. **Check for schema change:** Recent migrations might have invalidated active consent records.
5. **Manual review:** If widespread, temporarily route to fallback consent flow and page the on-call compliance engineer.

---

### P3 — BullMQ Stalled Jobs

**Trigger:** > 5 stalled jobs in any queue.

1. **Worker health:** `kubectl get pods -l app=capitalforge-worker -n production`
2. **Stalled job recovery:** BullMQ automatically moves stalled jobs back to waiting after `stalledInterval`. Verify worker is configured with a reasonable `stalledInterval` (default 30s).
3. **Manual retry:** Use BullMQ dashboard or `redis-cli` to inspect and retry specific job IDs.
4. **Root cause:** Check for unhandled promise rejections in worker code that prevent the `complete()` callback from firing.

---

## Escalation Procedures

Escalation policies are defined in `infra/monitoring/pagerduty/escalation-policy.json`.

### Severity Matrix

| Severity | Definition | Response SLA | Escalation |
|---|---|---|---|
| **P1** | Service down, SLA breach, or compliance/regulatory event | Immediate page, ACK within 5 min | Secondary + Eng Manager at 10 min |
| **P2** | Degraded performance or compliance anomaly | Page, ACK within 15 min | Manager at 30 min |
| **P3** | Non-urgent issue, business hours only | Slack notification | Team lead at next standup |
| **P4** | Informational, no immediate action | Ticket created | Sprint planning |

### Compliance-specific Escalation

All compliance alerts (`capitalforge-compliance` PagerDuty service) are treated as P1 regardless of business hours:

1. **Primary page:** Compliance Officer on-call
2. **10-minute escalation:** CEO + Legal Counsel on-call
3. **No auto-resolve timeout** — must be manually resolved with documented disposition

### Incident Communication

For P1 incidents lasting > 15 minutes:

1. Post initial status in `#capitalforge-incidents` Slack channel.
2. Update every 30 minutes with current status, impact, and ETA.
3. Page stakeholders if customer-facing impact is confirmed.
4. After resolution, write a brief post-mortem within 48 hours.

---

## Deploying Monitoring Config

### First-time setup

```bash
# 1. Create Datadog secrets in Kubernetes
kubectl create secret generic datadog-secret \
  --from-literal=api-key=$DD_API_KEY \
  --from-literal=app-key=$DD_APP_KEY \
  -n monitoring

# 2. Deploy Datadog agent
helm upgrade --install datadog datadog/datadog \
  --namespace monitoring --create-namespace \
  -f infra/monitoring/datadog/datadog-values.yaml

# 3. Apply Prometheus alerting rules
kubectl apply -f infra/monitoring/grafana/prometheus-rules.yaml -n monitoring

# 4. Import Datadog dashboard (requires DD_API_KEY and DD_APP_KEY env vars)
curl -X POST "https://api.datadoghq.com/api/v1/dashboard" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  -H "Content-Type: application/json" \
  -d @infra/monitoring/datadog/dashboards/capitalforge-overview.json

# 5. Upload Datadog monitors
for monitor in $(jq -r '.monitors[] | @json' infra/monitoring/datadog/monitors/critical-alerts.json); do
  curl -X POST "https://api.datadoghq.com/api/v1/monitor" \
    -H "DD-API-KEY: $DD_API_KEY" \
    -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
    -H "Content-Type: application/json" \
    -d "$monitor"
done
```

### Updating alert thresholds

Thresholds are declared in the `options.thresholds` block of each monitor in `critical-alerts.json`. After editing:

```bash
# Re-upload modified monitor (use monitor ID from previous import)
curl -X PUT "https://api.datadoghq.com/api/v1/monitor/$MONITOR_ID" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/updated-monitor.json
```

### Sentry releases

Tag each deploy with a Sentry release to enable source maps and release-based issue tracking:

```bash
# In CI/CD pipeline after image build
export RELEASE=$(git rev-parse --short HEAD)
export SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN

# Backend
sentry-cli releases new --org capitalforge --project capitalforge-backend $RELEASE
sentry-cli releases set-commits --auto $RELEASE
sentry-cli releases finalize $RELEASE

# Frontend (Next.js builds source maps automatically with SENTRY_AUTH_TOKEN set)
NEXT_PUBLIC_APP_VERSION=$RELEASE npm run build:frontend
```

---

## Local Development

Metrics endpoint is available locally at `http://localhost:4000/metrics` when the backend dev server is running.

To run a local Prometheus + Grafana stack:

```bash
# Start monitoring stack (add to docker-compose.yml or use override)
docker run -d --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/infra/monitoring/grafana/prometheus-rules.yaml:/etc/prometheus/rules/capitalforge.yaml \
  prom/prometheus

docker run -d --name grafana \
  -p 3001:3000 \
  grafana/grafana
```

Sentry is disabled in `test` and `development` environments when `SENTRY_DSN` is not set — no configuration required for local development.
