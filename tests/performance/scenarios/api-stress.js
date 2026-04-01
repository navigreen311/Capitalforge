// ============================================================
// CapitalForge — API Stress Test
//
// Stress tests core API endpoints with 100 concurrent VUs to
// identify the breaking point and degradation curve.
//
// Endpoints under test:
//   GET  /api/health                              — liveness probe
//   GET  /api/health/ready                        — readiness probe
//   GET  /api/businesses                          — list businesses
//   GET  /api/businesses/:id                      — get single business
//   GET  /api/businesses/:id/credit               — credit profiles
//   GET  /api/businesses/:id/compliance/risk-score — risk score
//
// Ramp profile (intentionally aggressive):
//   0:00 –  30s  ramp to  25 VUs  — initial load
//   0:30 –  2:00 ramp to  50 VUs  — medium stress
//   2:00 –  4:00 ramp to 100 VUs  — high stress
//   4:00 –  5:30 ramp to  50 VUs  — recovery check
//   5:30 –  6:00 ramp to   0 VUs  — cool-down
//
// Thresholds are intentionally relaxed vs. the SLA thresholds
// to allow stress observation before the test is aborted.
// ============================================================

import http from 'k6/http';
import { check, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  BASE_URL, getAuthHeaders, thinkTime, THRESHOLDS, TAGS,
  jsonBody, assertOk, extractData,
} from '../k6-config.js';

// ── Custom metrics ───────────────────────────────────────────
const requestsTotal      = new Counter('stress_requests_total');
const errorRate          = new Rate('stress_error_rate');
const healthLatency      = new Trend('stress_health_ms',        true);
const businessListLatency = new Trend('stress_business_list_ms', true);
const businessGetLatency  = new Trend('stress_business_get_ms',  true);
const creditLatency       = new Trend('stress_credit_ms',        true);
const riskScoreLatency    = new Trend('stress_risk_score_ms',    true);

// ── Scenario options ─────────────────────────────────────────
export const options = {
  scenarios: {
    api_stress: {
      executor:   'ramping-vus',
      startVUs:   0,
      stages: [
        { duration: '30s', target:  25 }, // ramp-up to initial load
        { duration: '90s', target:  50 }, // medium stress
        { duration: '2m',  target: 100 }, // peak stress
        { duration: '90s', target:  50 }, // recovery validation
        { duration: '30s', target:   0 }, // cool-down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Stress thresholds: looser than SLA, exist to catch catastrophic failure
    'http_req_duration':                          ['p(95)<2000'],
    'http_req_failed':                            ['rate<0.05'],  // 5% error budget under extreme stress
    'stress_health_ms':                           ['p(95)<200'],
    'stress_business_list_ms':                    ['p(95)<1000'],
    'stress_business_get_ms':                     ['p(95)<1000'],
    'stress_credit_ms':                           ['p(95)<1500'],
    'stress_risk_score_ms':                       ['p(95)<1500'],
    'http_req_duration{endpoint:health}':         ['p(99)<500'],
    'http_req_duration{endpoint:business_list}':  ['p(99)<2000'],
    'http_req_duration{endpoint:risk_score}':     ['p(99)<2000'],
  },
};

// ── Setup: seed a pool of business IDs ──────────────────────
export function setup() {
  const headers    = getAuthHeaders();
  const businessIds = [];

  // Create 20 seed businesses — enough to give each VU a stable target
  for (let i = 0; i < 20; i++) {
    const ts = Date.now() + i;
    const response = http.post(
      `${BASE_URL}/api/businesses`,
      jsonBody({
        legalName:            `Stress Seed Business ${i}-${ts}`,
        ein:                  `${10 + i}-${1000000 + i}`,
        entityType:           'llc',
        industry:             'technology',
        stateOfIncorporation: 'CA',
        businessAddressLine1: `${1000 + i} Stress Test Blvd`,
        businessCity:         'San Francisco',
        businessState:        'CA',
        businessZip:          '94105',
        monthlyRevenue:       100000 + i * 5000,
        yearsInOperation:     5,
        employeeCount:        50,
      }),
      { headers },
    );

    if (response.status === 201) {
      const d = extractData(response);
      if (d?.business?.id) businessIds.push(d.business.id);
    }
  }

  console.log(`[setup] Seeded ${businessIds.length} businesses for stress test`);
  return { businessIds };
}

// ── Main VU scenario ─────────────────────────────────────────
export default function (data) {
  const vuId       = __VU;
  const headers    = getAuthHeaders();
  const businessIds = data?.businessIds ?? [];
  const businessId  = businessIds.length > 0
    ? businessIds[vuId % businessIds.length]
    : null;

  // ── Health check (liveness) ──────────────────────────────
  group('health_liveness', () => {
    const start    = Date.now();
    const response = http.get(`${BASE_URL}/api/health`, {
      tags: TAGS.HEALTH,
    });
    healthLatency.add(Date.now() - start);
    requestsTotal.add(1);

    const ok = check(response, {
      'health — status 200':       (r) => r.status === 200,
      'health — body status ok':   (r) => {
        try { return JSON.parse(r.body).data?.status === 'ok'; }
        catch { return false; }
      },
    });
    errorRate.add(!ok);
  });

  thinkTime(0, 0.2);

  // ── Health check (readiness) ─────────────────────────────
  group('health_readiness', () => {
    const response = http.get(`${BASE_URL}/api/health/ready`, {
      tags: TAGS.HEALTH,
    });
    requestsTotal.add(1);

    const ok = check(response, {
      'health/ready — status 200 or 503': (r) => r.status === 200 || r.status === 503,
    });
    errorRate.add(!ok);
  });

  thinkTime(0, 0.3);

  // ── List businesses ──────────────────────────────────────
  group('business_list', () => {
    const start    = Date.now();
    const response = http.get(`${BASE_URL}/api/businesses?page=1&pageSize=10`, {
      headers,
      tags: TAGS.BUSINESS_LIST,
    });
    businessListLatency.add(Date.now() - start);
    requestsTotal.add(1);

    const ok = check(response, {
      'business_list — status 2xx or 401': (r) =>
        (r.status >= 200 && r.status < 300) || r.status === 401,
    });
    errorRate.add(r => r.status >= 500);
  });

  if (!businessId) {
    thinkTime(0.2, 0.5);
    return;
  }

  thinkTime(0, 0.3);

  // ── Get single business ──────────────────────────────────
  group('business_get', () => {
    const start    = Date.now();
    const response = http.get(`${BASE_URL}/api/businesses/${businessId}`, {
      headers,
      tags: TAGS.BUSINESS_GET,
    });
    businessGetLatency.add(Date.now() - start);
    requestsTotal.add(1);

    const ok = check(response, {
      'business_get — status 200/401/404': (r) =>
        r.status === 200 || r.status === 401 || r.status === 404,
    });
    errorRate.add(r => r.status >= 500);
  });

  thinkTime(0, 0.3);

  // ── Credit profiles ──────────────────────────────────────
  group('business_credit', () => {
    const start    = Date.now();
    const response = http.get(`${BASE_URL}/api/businesses/${businessId}/credit`, {
      headers,
      tags: { endpoint: 'credit' },
    });
    creditLatency.add(Date.now() - start);
    requestsTotal.add(1);

    check(response, {
      'credit — status not 5xx': (r) => r.status < 500,
    });
    errorRate.add(r => r.status >= 500);
  });

  thinkTime(0, 0.3);

  // ── Compliance risk score ────────────────────────────────
  group('compliance_risk_score', () => {
    const start    = Date.now();
    const response = http.get(
      `${BASE_URL}/api/businesses/${businessId}/compliance/risk-score`,
      { headers, tags: TAGS.RISK_SCORE },
    );
    riskScoreLatency.add(Date.now() - start);
    requestsTotal.add(1);

    check(response, {
      'risk_score — status not 5xx': (r) => r.status < 500,
    });
    errorRate.add(r => r.status >= 500);
  });

  thinkTime(0.1, 0.5);
}

// ── Teardown: log summary stats ──────────────────────────────
export function teardown(data) {
  console.log(`[teardown] Stress test complete. Seeded business count: ${data?.businessIds?.length ?? 0}`);
}

// ── Summary output ───────────────────────────────────────────
export function handleSummary(data) {
  const summary = {
    timestamp:     new Date().toISOString(),
    scenarios:     data.metrics?.['http_reqs']?.values?.count ?? 0,
    p95Duration:   data.metrics?.['http_req_duration']?.values?.['p(95)'] ?? null,
    p99Duration:   data.metrics?.['http_req_duration']?.values?.['p(99)'] ?? null,
    errorRate:     data.metrics?.['http_req_failed']?.values?.rate ?? null,
    raw:           data,
  };

  return {
    'reports/api-stress-summary.json': JSON.stringify(summary, null, 2),
    stdout: `
=== API STRESS TEST SUMMARY ===
  Total requests : ${summary.scenarios}
  p95 latency    : ${summary.p95Duration?.toFixed(1) ?? 'N/A'} ms
  p99 latency    : ${summary.p99Duration?.toFixed(1) ?? 'N/A'} ms
  Error rate     : ${summary.errorRate != null ? (summary.errorRate * 100).toFixed(2) : 'N/A'}%
================================
`,
  };
}
