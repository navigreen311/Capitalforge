// ============================================================
// CapitalForge — Prometheus Metrics Middleware
//
// Instruments every Express request with:
//   - http_requests_total        (counter, by method/route/status_class)
//   - http_request_duration_seconds (histogram, by method/route)
//   - http_errors_total          (counter, by method/route/status_class)
//   - active_connections         (gauge)
//
// Also exposes business/compliance gauges that are updated from
// service layer via the exported updateMetric() helper.
//
// Prometheus scrape endpoint: GET /metrics  (plain text, no auth needed
// from within the cluster — protect via NetworkPolicy in production).
// ============================================================

import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger.js';

// ── Tiny in-process Prometheus registry ──────────────────────
// We implement a lightweight registry directly to avoid adding
// the prom-client package (not yet in package.json) while still
// producing spec-compliant Prometheus exposition format output.
//
// If you add prom-client later, replace the registry below with
// prom-client's Registry and Counter/Histogram/Gauge classes.

type LabelSet = Record<string, string | number>;
type MetricType = 'counter' | 'gauge' | 'histogram';

interface CounterEntry {
  type: 'counter' | 'gauge';
  help: string;
  values: Map<string, { labels: LabelSet; value: number }>;
}

interface HistogramEntry {
  type: 'histogram';
  help: string;
  buckets: number[];
  data: Map<string, { labels: LabelSet; counts: number[]; sum: number; count: number }>;
}

type RegistryEntry = CounterEntry | HistogramEntry;

// ── Histogram buckets (seconds) optimised for web API latency ─
const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];

// ── Internal registry ─────────────────────────────────────────
const registry = new Map<string, RegistryEntry>();

function ensureCounter(name: string, help: string): void {
  if (!registry.has(name)) {
    registry.set(name, { type: 'counter', help, values: new Map() });
  }
}

function ensureGauge(name: string, help: string): void {
  if (!registry.has(name)) {
    registry.set(name, { type: 'gauge', help, values: new Map() });
  }
}

function ensureHistogram(name: string, help: string, buckets: number[]): void {
  if (!registry.has(name)) {
    registry.set(name, { type: 'histogram', help, buckets, data: new Map() });
  }
}

function labelKey(labels: LabelSet): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
}

function incCounter(name: string, labels: LabelSet, amount = 1): void {
  const entry = registry.get(name) as CounterEntry | undefined;
  if (!entry) return;
  const key = labelKey(labels);
  const existing = entry.values.get(key);
  if (existing) {
    existing.value += amount;
  } else {
    entry.values.set(key, { labels, value: amount });
  }
}

function setGauge(name: string, labels: LabelSet, value: number): void {
  const entry = registry.get(name) as CounterEntry | undefined;
  if (!entry) return;
  const key = labelKey(labels);
  entry.values.set(key, { labels, value });
}

function incGauge(name: string, labels: LabelSet, amount = 1): void {
  const entry = registry.get(name) as CounterEntry | undefined;
  if (!entry) return;
  const key = labelKey(labels);
  const existing = entry.values.get(key);
  if (existing) {
    existing.value += amount;
  } else {
    entry.values.set(key, { labels, value: amount });
  }
}

function observeHistogram(name: string, labels: LabelSet, value: number): void {
  const entry = registry.get(name) as HistogramEntry | undefined;
  if (!entry) return;
  const key = labelKey(labels);
  let slot = entry.data.get(key);
  if (!slot) {
    slot = { labels, counts: new Array(entry.buckets.length).fill(0), sum: 0, count: 0 };
    entry.data.set(key, slot);
  }
  for (let i = 0; i < entry.buckets.length; i++) {
    if (value <= entry.buckets[i]) {
      slot.counts[i]++;
    }
  }
  slot.sum += value;
  slot.count++;
}

// ── Metric definitions ─────────────────────────────────────────

// Golden signals
ensureCounter('capitalforge_http_requests_total',
  'Total HTTP requests received, partitioned by method, route, and HTTP status class.');

ensureCounter('capitalforge_http_errors_total',
  'Total HTTP error responses (4xx and 5xx), partitioned by method, route, and status class.');

ensureHistogram('capitalforge_http_request_duration_seconds',
  'HTTP request duration in seconds, partitioned by method and route.', LATENCY_BUCKETS);

ensureGauge('capitalforge_active_connections',
  'Number of currently active HTTP connections being processed.');

// Infrastructure
ensureGauge('capitalforge_db_pool_connections',
  'Database connection pool utilization by state (active, idle, waiting).');

ensureGauge('capitalforge_db_pool_size_max',
  'Maximum database connection pool size as configured.');

ensureGauge('capitalforge_queue_depth',
  'Number of waiting jobs in each BullMQ queue.');

// Business
ensureGauge('capitalforge_active_users',
  'Number of distinct users with an active session in the last hour.');

ensureGauge('capitalforge_applications_pending',
  'Number of card/funding applications in pending/in-review state.');

ensureGauge('capitalforge_apr_alerts_pending',
  'Open APR expiry alerts awaiting client action, by window (60d/30d/15d).');

ensureGauge('capitalforge_compliance_score',
  'Platform-wide compliance score as a percentage (0–100).');

// Compliance events
ensureCounter('capitalforge_consent_gate_failure_total',
  'Total TCPA consent gate failures — clients unable to pass consent requirement.');

ensureCounter('capitalforge_ach_unauthorized_total',
  'Total unauthorized ACH debit detections (Regulation E events).');

ensureCounter('capitalforge_compliance_check_failure_total',
  'Total internal compliance check failures (system errors, not user no-go blocks).');

ensureCounter('capitalforge_suitability_nogo_total',
  'Total suitability no-go blocks enforced by the Suitability Engine.');

ensureCounter('capitalforge_suitability_override_total',
  'Total suitability no-go overrides approved by supervisors.');

// ── Route normalisation ───────────────────────────────────────

/**
 * Normalise dynamic Express route segments to keep cardinality low.
 *
 * e.g.  /api/businesses/abc-123/applications/xyz-456
 *       → /api/businesses/:id/applications/:id
 */
function normaliseRoute(req: Request): string {
  // Use matched route pattern if Express resolved one
  if (req.route?.path && typeof req.route.path === 'string') {
    // Prefix with the mount path if nested router
    const base = (req.baseUrl ?? '').replace(/\/$/, '');
    return `${base}${req.route.path}`;
  }

  // Fallback: replace UUIDs and numeric IDs with :id
  return req.path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}

/** Classify HTTP status into 2xx / 3xx / 4xx / 5xx. */
function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

// ── Active connection tracking ─────────────────────────────────
let activeConnectionCount = 0;

// ── Request metrics middleware ────────────────────────────────

/**
 * Mount BEFORE routes to capture all requests.
 *
 *   app.use(metricsMiddleware);
 *   app.use('/api', apiRouter);
 *   app.get('/metrics', metricsEndpoint);   // scrape endpoint
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startHrTime = process.hrtime.bigint();
  activeConnectionCount++;
  setGauge('capitalforge_active_connections', {}, activeConnectionCount);

  res.on('finish', () => {
    activeConnectionCount = Math.max(0, activeConnectionCount - 1);
    setGauge('capitalforge_active_connections', {}, activeConnectionCount);

    const durationNs = process.hrtime.bigint() - startHrTime;
    const durationSeconds = Number(durationNs) / 1e9;
    const route = normaliseRoute(req);
    const method = req.method.toUpperCase();
    const sc = statusClass(res.statusCode);

    const labels: LabelSet = { method, route, status_class: sc };

    incCounter('capitalforge_http_requests_total', labels);
    observeHistogram('capitalforge_http_request_duration_seconds', { method, route }, durationSeconds);

    if (res.statusCode >= 400) {
      incCounter('capitalforge_http_errors_total', labels);
    }
  });

  res.on('close', () => {
    // Handle premature client disconnects (response never finished)
    if (!res.writableEnded) {
      activeConnectionCount = Math.max(0, activeConnectionCount - 1);
      setGauge('capitalforge_active_connections', {}, activeConnectionCount);
    }
  });

  next();
}

// ── Prometheus exposition format renderer ─────────────────────

function renderLabels(labels: LabelSet): string {
  const pairs = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
  return pairs.length > 0 ? `{${pairs.join(',')}}` : '';
}

function renderMetrics(): string {
  const lines: string[] = [];

  for (const [name, entry] of registry.entries()) {
    lines.push(`# HELP ${name} ${entry.help}`);

    if (entry.type === 'counter' || entry.type === 'gauge') {
      lines.push(`# TYPE ${name} ${entry.type}`);
      for (const { labels, value } of entry.values.values()) {
        lines.push(`${name}${renderLabels(labels)} ${value}`);
      }
    } else if (entry.type === 'histogram') {
      lines.push(`# TYPE ${name} histogram`);
      for (const { labels, counts, sum, count } of entry.data.values()) {
        // Cumulative bucket counts
        let cumulative = 0;
        for (let i = 0; i < entry.buckets.length; i++) {
          cumulative += counts[i];
          lines.push(`${name}_bucket${renderLabels({ ...labels, le: entry.buckets[i] })} ${cumulative}`);
        }
        lines.push(`${name}_bucket${renderLabels({ ...labels, le: '+Inf' })} ${count}`);
        lines.push(`${name}_sum${renderLabels(labels)} ${sum.toFixed(6)}`);
        lines.push(`${name}_count${renderLabels(labels)} ${count}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ── /metrics scrape endpoint ──────────────────────────────────

/**
 * Register this as a GET /metrics route in server.ts or the API router.
 *
 *   app.get('/metrics', metricsEndpoint);
 *
 * Restrict access to cluster-internal traffic via Kubernetes NetworkPolicy.
 * Do NOT expose this endpoint on the public-facing ingress.
 */
export function metricsEndpoint(_req: Request, res: Response): void {
  try {
    const output = renderMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(output);
  } catch (err) {
    logger.error('Failed to render Prometheus metrics', { error: err });
    res.status(500).end('# Error rendering metrics\n');
  }
}

// ── Business & compliance metric update helpers ───────────────
// Call these from service layer code to keep gauges/counters current.

/**
 * Update a named gauge metric.
 * Use for business metrics like active users, pending applications, etc.
 *
 * @example
 *   updateGauge('capitalforge_applications_pending', {}, pendingCount);
 *   updateGauge('capitalforge_apr_alerts_pending', { window: '30d' }, count);
 */
export function updateGauge(metricName: string, labels: LabelSet, value: number): void {
  setGauge(metricName, labels, value);
}

/**
 * Increment a named counter metric.
 *
 * @example
 *   incrementCounter('capitalforge_consent_gate_failure_total', { channel: 'sms' });
 *   incrementCounter('capitalforge_ach_unauthorized_total', { tenant_id: tenantId });
 */
export function incrementCounter(metricName: string, labels: LabelSet, amount = 1): void {
  incCounter(metricName, labels, amount);
}

/**
 * Increment the active_users gauge.
 * Called from session creation / expiry handlers.
 */
export function trackActiveUser(delta: 1 | -1): void {
  incGauge('capitalforge_active_users', {}, delta);
}
