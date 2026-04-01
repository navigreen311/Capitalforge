// ============================================================
// CapitalForge — k6 Load Test Shared Configuration
//
// Provides:
//   - BASE_URL           Environment-driven API base URL
//   - getAuthToken()     JWT injection for authenticated routes
//   - thinkTime()        Realistic pause between user actions
//   - THRESHOLDS         p95 < 500 ms, error rate < 1%
//   - TAGS               Metric grouping labels
//
// Usage in scenario files:
//   import { BASE_URL, getAuthHeaders, thinkTime, THRESHOLDS } from '../k6-config.ts';
// ============================================================

import { sleep } from 'k6';
import http from 'k6/http';
import { Options } from 'k6/options';

// ── Base URL ────────────────────────────────────────────────
// Override via K6_BASE_URL env variable in CI / production runs.
// Default targets local dev server.
export const BASE_URL: string = __ENV.K6_BASE_URL || 'http://localhost:4000';

// ── Auth token ──────────────────────────────────────────────
// Tokens are sourced from environment variables so credentials
// never appear in source code or test reports.
//
//   K6_AUTH_TOKEN   — pre-minted JWT for a test tenant
//   K6_TENANT_ID    — tenant UUID matching the JWT sub claim
//   K6_USER_ID      — user UUID for audit trail attribution
export const AUTH_TOKEN: string = __ENV.K6_AUTH_TOKEN || '';
export const TENANT_ID: string  = __ENV.K6_TENANT_ID  || 'test-tenant-load';
export const USER_ID: string    = __ENV.K6_USER_ID    || 'test-user-load';

// ── Auth header factory ──────────────────────────────────────
// Returns the header map required by every authenticated endpoint.
// Injects a JWT Bearer token plus tenant context headers.
export function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type':  'application/json',
    'Authorization': AUTH_TOKEN ? `Bearer ${AUTH_TOKEN}` : '',
    'X-Tenant-Id':   TENANT_ID,
    'X-User-Id':     USER_ID,
    ...extraHeaders,
  };
}

// ── Think time ───────────────────────────────────────────────
// Simulates realistic pause between user actions.
// Defaults to 1–3 s (uniform distribution) mimicking human reading time.
// Passing 0 skips the sleep for pure throughput measurements.
export function thinkTime(minSec = 1, maxSec = 3): void {
  if (minSec <= 0) return;
  const delay = minSec + Math.random() * (maxSec - minSec);
  sleep(delay);
}

// ── Performance thresholds ───────────────────────────────────
// Global SLA targets applied to every scenario unless overridden.
//
//   http_req_duration p(95) < 500 ms  — 95th-percentile latency
//   http_req_failed   rate  < 1%      — error (non-2xx / network) budget
export const THRESHOLDS: Options['thresholds'] = {
  // Global p95 latency SLA
  'http_req_duration': ['p(95)<500'],

  // Global error budget: less than 1% of all requests may fail
  'http_req_failed': ['rate<0.01'],

  // Per-tag latency breakdowns — tighter SLA on health / read endpoints,
  // more headroom for write-heavy paths (KYB, optimizer, compliance).
  'http_req_duration{endpoint:health}':          ['p(95)<100'],
  'http_req_duration{endpoint:business_list}':   ['p(95)<300'],
  'http_req_duration{endpoint:business_create}': ['p(95)<500'],
  'http_req_duration{endpoint:owner_add}':       ['p(95)<500'],
  'http_req_duration{endpoint:kyb_verify}':      ['p(95)<800'],
  'http_req_duration{endpoint:kyc_verify}':      ['p(95)<800'],
  'http_req_duration{endpoint:suitability}':     ['p(95)<600'],
  'http_req_duration{endpoint:optimizer}':       ['p(95)<700'],
  'http_req_duration{endpoint:application}':     ['p(95)<600'],
  'http_req_duration{endpoint:risk_score}':      ['p(95)<500'],
  'http_req_duration{endpoint:udap_check}':      ['p(95)<600'],
  'http_req_duration{endpoint:consent_gate}':    ['p(95)<300'],
  'http_req_duration{endpoint:doc_upload}':      ['p(95)<1200'],
};

// ── Named metric tags ────────────────────────────────────────
// Used with { tags: { endpoint: TAGS.HEALTH } } in http.get / http.post
// to slice dashboards by endpoint family.
export const TAGS = {
  HEALTH:           { endpoint: 'health' },
  BUSINESS_LIST:    { endpoint: 'business_list' },
  BUSINESS_CREATE:  { endpoint: 'business_create' },
  BUSINESS_GET:     { endpoint: 'business_get' },
  OWNER_ADD:        { endpoint: 'owner_add' },
  KYB_VERIFY:       { endpoint: 'kyb_verify' },
  KYC_VERIFY:       { endpoint: 'kyc_verify' },
  SUITABILITY:      { endpoint: 'suitability' },
  OPTIMIZER:        { endpoint: 'optimizer' },
  APPLICATION:      { endpoint: 'application' },
  RISK_SCORE:       { endpoint: 'risk_score' },
  UDAP_CHECK:       { endpoint: 'udap_check' },
  CONSENT_GATE:     { endpoint: 'consent_gate' },
  DOC_UPLOAD:       { endpoint: 'doc_upload' },
} as const;

// ── Scenario stage helpers ───────────────────────────────────
// Reusable ramp profiles — compose into scenario.stages arrays.

/** Standard 3-phase ramp: warm-up → sustained → cool-down */
export function buildRampStages(
  targetVUs: number,
  warmupDuration   = '1m',
  sustainedDuration = '5m',
  cooldownDuration  = '30s',
) {
  return [
    { duration: warmupDuration,    target: Math.ceil(targetVUs * 0.2) },
    { duration: sustainedDuration, target: targetVUs },
    { duration: cooldownDuration,  target: 0 },
  ];
}

/** Spike ramp: normal → spike → recovery → zero */
export function buildSpikeStages(normalVUs: number, spikeVUs: number) {
  return [
    { duration: '30s', target: normalVUs },
    { duration: '1m',  target: spikeVUs  },
    { duration: '1m',  target: normalVUs },
    { duration: '30s', target: 0         },
  ];
}

// ── JSON body helper ─────────────────────────────────────────
export function jsonBody(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

// ── Response assertion helpers ───────────────────────────────
import { check } from 'k6';
import { RefinedResponse } from 'k6/http';

/** Assert 2xx and that body.success === true */
export function assertOk(response: RefinedResponse<'text'>, label: string): boolean {
  return check(response, {
    [`${label} — status 2xx`]:   (r) => r.status >= 200 && r.status < 300,
    [`${label} — body.success`]: (r) => {
      try { return (JSON.parse(r.body as string) as { success: boolean }).success === true; }
      catch { return false; }
    },
  });
}

/** Extract data from a typed ApiResponse body. Returns undefined on parse error. */
export function extractData<T = unknown>(response: RefinedResponse<'text'>): T | undefined {
  try {
    const parsed = JSON.parse(response.body as string) as { success: boolean; data?: T };
    return parsed.data;
  } catch {
    return undefined;
  }
}
