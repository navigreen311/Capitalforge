// ============================================================
// CapitalForge — Funding Flow Load Test
//
// Simulates 30 concurrent users executing the end-to-end
// funding evaluation and application pipeline:
//   1. POST /api/businesses/:id/suitability/check   — assess risk band
//   2. POST /api/businesses/:id/optimize            — generate card stack
//   3. POST /api/businesses/:id/applications        — submit application
//   4. PUT  /api/applications/:id/status            — approve application
//   5. GET  /api/businesses/:id/optimizer/results   — retrieve stack result
//
// Key metrics captured:
//   - optimizer_latency_ms        p95 target < 700 ms
//   - gate_check_latency_ms       p95 target < 600 ms (suitability check)
//   - application_submit_ms       p95 target < 600 ms
//   - full_funding_flow_ms        p95 target < 3 500 ms
//
// Event bus throughput is indirectly measured via Trend metrics
// tracking the wall-clock time from application create → approval.
//
// Ramp profile:
//   0:00 –  1:00  warm-up   → 10 VUs
//   1:00 –  6:00  sustained → 30 VUs
//   6:00 –  6:30  cool-down →  0 VUs
// ============================================================

import http from 'k6/http';
import { check, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import {
  BASE_URL, getAuthHeaders, thinkTime, THRESHOLDS, TAGS,
  jsonBody, assertOk, extractData,
} from '../k6-config.js';

// ── Custom metrics ───────────────────────────────────────────
const fundingFlowCompleted   = new Counter('funding_flow_completed');
const fundingFlowFailed      = new Counter('funding_flow_failed');
const optimizerLatency       = new Trend('optimizer_latency_ms',    true);
const gateCheckLatency       = new Trend('gate_check_latency_ms',   true);
const applicationSubmitMs    = new Trend('application_submit_ms',   true);
const approvalLatency        = new Trend('approval_latency_ms',     true);
const fullFlowLatency        = new Trend('full_funding_flow_ms',    true);

// ── Scenario options ─────────────────────────────────────────
export const options = {
  scenarios: {
    funding_flow_load: {
      executor:   'ramping-vus',
      startVUs:   0,
      stages: [
        { duration: '1m',  target: 10 }, // warm-up
        { duration: '5m',  target: 30 }, // sustained load
        { duration: '30s', target:  0 }, // cool-down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    ...THRESHOLDS,
    'funding_flow_completed':    ['count>0'],
    'optimizer_latency_ms':      ['p(95)<700'],
    'gate_check_latency_ms':     ['p(95)<600'],
    'application_submit_ms':     ['p(95)<600'],
    'approval_latency_ms':       ['p(95)<500'],
    'full_funding_flow_ms':      ['p(95)<3500'],
  },
};

// ── Test data generators ─────────────────────────────────────

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const INDUSTRIES    = ['technology', 'retail', 'healthcare', 'professional_services'];
const ENTITY_TYPES  = ['llc', 'corporation', 's_corp'];
const STATES        = ['CA', 'NY', 'TX', 'FL', 'WA'];
const CARD_ISSUERS  = ['chase', 'amex', 'capital_one', 'citi', 'bank_of_america'];
const CARD_PRODUCTS = ['ink_business_preferred', 'amex_blue_business_plus', 'capital_one_spark_miles'];

function generateBusinessPayload(vuId) {
  const ts = Date.now();
  return {
    legalName:            `FundingFlow Business ${vuId}-${ts}`,
    ein:                  `${randomInt(10,99)}-${randomInt(1000000,9999999)}`,
    entityType:           randomElement(ENTITY_TYPES),
    industry:             randomElement(INDUSTRIES),
    stateOfIncorporation: randomElement(STATES),
    businessAddressLine1: `${randomInt(100,9999)} Funding Ave`,
    businessCity:         'Austin',
    businessState:        'TX',
    businessZip:          '78701',
    monthlyRevenue:       randomInt(100000, 1000000),
    yearsInOperation:     randomInt(2, 20),
    employeeCount:        randomInt(10, 1000),
  };
}

function generateSuitabilityPayload() {
  return {
    monthlyRevenue:      randomInt(50000, 500000),
    existingDebt:        randomInt(0, 200000),
    cashFlowRatio:       parseFloat((Math.random() * 0.8).toFixed(2)),
    industry:            randomElement(INDUSTRIES),
    businessAgeMonths:   randomInt(24, 240),
    personalCreditScore: randomInt(680, 820),
    businessCreditScore: randomInt(40, 100),
    activeBankruptcy:    false,
    sanctionsMatch:      false,
    fraudSuspicion:      false,
  };
}

function generateOptimizerPayload() {
  const inquiries = randomInt(0, 5);
  return {
    personalCredit: {
      ficoScore:         randomInt(700, 820),
      utilizationRatio:  parseFloat((Math.random() * 0.4).toFixed(2)),
      derogatoryCount:   randomInt(0, 1),
      inquiries12m:      inquiries,
      creditAgeMonths:   randomInt(60, 240),
    },
    businessProfile: {
      yearsInOperation:  randomInt(2, 15),
      annualRevenue:     randomInt(500000, 5000000),
      targetCreditLimit: randomInt(50000, 300000),
    },
    existingCards: [],
    recentApplicationDates: [],
    excludeCardIds: [],
  };
}

function generateApplicationPayload(vuId) {
  return {
    productType:       'business_credit_card',
    requestedAmount:   randomInt(25000, 150000),
    advisorId:         `advisor-load-${vuId}`,
    notes:             `Load test application VU ${vuId}`,
    cards: [
      {
        cardProductId:   CARD_PRODUCTS[vuId % CARD_PRODUCTS.length],
        requestedLimit:  randomInt(25000, 100000),
      },
    ],
  };
}

// ── Setup: create a business to use across iterations ───────
// k6 setup() runs once per test, before VUs start.
export function setup() {
  // Create a shared pool of pre-seeded business IDs for the sustain phase.
  // Each VU will pick from this pool to avoid inter-VU state conflicts.
  const headers    = getAuthHeaders();
  const businessIds = [];

  for (let i = 0; i < 30; i++) {
    const response = http.post(
      `${BASE_URL}/api/businesses`,
      jsonBody(generateBusinessPayload(i)),
      { headers },
    );

    if (response.status === 201) {
      const data = extractData(response);
      if (data?.business?.id) {
        businessIds.push(data.business.id);
      }
    }
  }

  return { businessIds };
}

// ── Main VU scenario ─────────────────────────────────────────
export default function (data) {
  const vuId      = __VU;
  const headers   = getAuthHeaders();
  const flowStart = Date.now();

  // Pick a pre-created business or fall back to creating one inline
  const businessIds = data?.businessIds ?? [];
  let businessId = businessIds.length > 0
    ? businessIds[vuId % businessIds.length]
    : null;

  // Fallback: create inline if pool is empty (e.g. setup failure)
  if (!businessId) {
    const response = http.post(
      `${BASE_URL}/api/businesses`,
      jsonBody(generateBusinessPayload(vuId)),
      { headers, tags: TAGS.BUSINESS_CREATE },
    );
    if (response.status === 201) {
      const d = extractData(response);
      businessId = d?.business?.id;
    }
  }

  if (!businessId) {
    fundingFlowFailed.add(1);
    return;
  }

  let applicationId;

  // ── Step 1: Suitability gate check ──────────────────────
  group('suitability_check', () => {
    const gateStart = Date.now();
    const response  = http.post(
      `${BASE_URL}/api/businesses/${businessId}/suitability/check`,
      jsonBody(generateSuitabilityPayload()),
      { headers, tags: TAGS.SUITABILITY },
    );
    gateCheckLatency.add(Date.now() - gateStart);

    const ok = assertOk(response, 'suitability_check');
    if (!ok) {
      console.warn(`[VU ${vuId}] suitability_check failed: ${response.status}`);
    }
  });

  thinkTime(0.5, 1.5);

  // ── Step 2: Run card stack optimizer ────────────────────
  group('card_stack_optimize', () => {
    const optStart = Date.now();
    const response = http.post(
      `${BASE_URL}/api/businesses/${businessId}/optimize`,
      jsonBody(generateOptimizerPayload()),
      { headers, tags: TAGS.OPTIMIZER },
    );
    optimizerLatency.add(Date.now() - optStart);

    assertOk(response, 'optimizer');
  });

  thinkTime(0.5, 1);

  // ── Step 3: Submit application ───────────────────────────
  group('application_submit', () => {
    const appStart = Date.now();
    const response = http.post(
      `${BASE_URL}/api/businesses/${businessId}/applications`,
      jsonBody(generateApplicationPayload(vuId)),
      { headers, tags: TAGS.APPLICATION },
    );
    applicationSubmitMs.add(Date.now() - appStart);

    const ok = assertOk(response, 'application_submit');
    if (ok) {
      const d = extractData(response);
      applicationId = d?.id;
    }
  });

  if (!applicationId) {
    fundingFlowFailed.add(1);
    return;
  }

  thinkTime(0.5, 1);

  // ── Step 4: Approve application (simulate checker role) ─
  group('application_approve', () => {
    const approveStart = Date.now();
    const response     = http.put(
      `${BASE_URL}/api/applications/${applicationId}/status`,
      jsonBody({ status: 'approved', notes: 'Load test approval' }),
      { headers, tags: TAGS.APPLICATION },
    );
    approvalLatency.add(Date.now() - approveStart);

    check(response, {
      'approve — status 200/422': (r) => r.status === 200 || r.status === 422,
    });
  });

  thinkTime(0.5, 1);

  // ── Step 5: Retrieve cached optimizer results ────────────
  group('optimizer_results', () => {
    const response = http.get(
      `${BASE_URL}/api/businesses/${businessId}/optimizer/results`,
      { headers, tags: TAGS.OPTIMIZER },
    );

    check(response, {
      'optimizer_results — status 200/404': (r) =>
        r.status === 200 || r.status === 404,
    });
  });

  // ── Record full flow ─────────────────────────────────────
  fullFlowLatency.add(Date.now() - flowStart);
  fundingFlowCompleted.add(1);

  thinkTime(1, 2);
}

// ── Summary output ───────────────────────────────────────────
export function handleSummary(data) {
  return {
    'reports/funding-flow-load-summary.json': JSON.stringify(data, null, 2),
  };
}
