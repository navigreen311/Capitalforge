// ============================================================
// CapitalForge — Onboarding Load Test
//
// Simulates 50 concurrent users executing the full business
// onboarding flow:
//   1. POST /api/businesses          — create business entity
//   2. POST /api/businesses/:id/owners — add beneficial owner
//   3. POST /api/businesses/:id/verify/kyb — trigger KYB
//   4. POST /api/businesses/:id/verify/kyc/:ownerId — trigger KYC
//   5. GET  /api/businesses/:id/verification-status — assert readiness
//
// Ramp profile:
//   0:00 –  1:00  warm-up   → 10 VUs
//   1:00 –  6:00  sustained → 50 VUs
//   6:00 –  6:30  cool-down →  0 VUs
//
// Thresholds: p95 < 500 ms, error rate < 1%
// ============================================================

import http from 'k6/http';
import { check, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, getAuthHeaders, thinkTime, THRESHOLDS, TAGS, jsonBody, assertOk, extractData } from '../k6-config.js';

// ── Custom metrics ───────────────────────────────────────────
const onboardingCompleted    = new Counter('onboarding_flow_completed');
const onboardingFailed       = new Counter('onboarding_flow_failed');
const kybLatency             = new Trend('kyb_latency_ms',  true);
const kycLatency             = new Trend('kyc_latency_ms',  true);
const fullFlowLatency        = new Trend('onboarding_full_flow_ms', true);

// ── Scenario options ─────────────────────────────────────────
export const options = {
  scenarios: {
    onboarding_load: {
      executor:   'ramping-vus',
      startVUs:   0,
      stages: [
        { duration: '1m',  target: 10 }, // warm-up
        { duration: '5m',  target: 50 }, // sustained load
        { duration: '30s', target:  0 }, // cool-down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    ...THRESHOLDS,
    'onboarding_flow_completed': ['count>0'],
    'kyb_latency_ms':            ['p(95)<800'],
    'kyc_latency_ms':            ['p(95)<800'],
    'onboarding_full_flow_ms':   ['p(95)<3000'],
  },
};

// ── Test data generators ─────────────────────────────────────

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const INDUSTRIES   = ['technology', 'retail', 'healthcare', 'manufacturing', 'professional_services', 'hospitality'];
const ENTITY_TYPES = ['llc', 'corporation', 's_corp', 'partnership'];
const STATES       = ['CA', 'NY', 'TX', 'FL', 'WA', 'IL', 'GA', 'MA'];

function generateBusinessPayload(vuId) {
  const ts = Date.now();
  return {
    legalName:   `LoadTest Business ${vuId}-${ts}`,
    ein:         `${randomInt(10,99)}-${randomInt(1000000,9999999)}`,
    entityType:  randomElement(ENTITY_TYPES),
    industry:    randomElement(INDUSTRIES),
    stateOfIncorporation: randomElement(STATES),
    businessAddressLine1: `${randomInt(100,9999)} Load Test Ave`,
    businessCity:  'San Francisco',
    businessState: 'CA',
    businessZip:   '94105',
    monthlyRevenue:     randomInt(50000, 500000),
    yearsInOperation:   randomInt(1, 15),
    employeeCount:      randomInt(5, 500),
    website:            `https://loadtest-${vuId}-${ts}.example.com`,
  };
}

function generateOwnerPayload(vuId) {
  return {
    firstName:           'LoadTest',
    lastName:            `Owner-${vuId}`,
    email:               `owner-${vuId}-${Date.now()}@loadtest.example.com`,
    ownershipPercentage: 51,
    title:               'CEO',
    dateOfBirth:         '1980-06-15',
    ssn:                 `${randomInt(100,999)}-${randomInt(10,99)}-${randomInt(1000,9999)}`,
    personalCreditScore: randomInt(680, 800),
  };
}

function generateKybPayload() {
  return {
    registeredAgentName:   'Registered Agents Inc',
    registeredAgentState:  'CA',
    businessPhone:         '415-555-0100',
    ultimateBeneficialOwnerCount: 1,
    checkUCC:   true,
    checkSanctions: true,
  };
}

function generateKycPayload(ownerId) {
  return {
    ownerId,
    checkSanctions:   true,
    checkFraudSignals: true,
  };
}

// ── Main VU scenario ─────────────────────────────────────────
export default function () {
  const vuId    = __VU;
  const headers = getAuthHeaders();
  const flowStart = Date.now();

  let businessId;
  let ownerId;

  // ── Step 1: Create business ──────────────────────────────
  group('create_business', () => {
    const payload  = jsonBody(generateBusinessPayload(vuId));
    const response = http.post(`${BASE_URL}/api/businesses`, payload, {
      headers,
      tags: TAGS.BUSINESS_CREATE,
    });

    const ok = assertOk(response, 'create_business');

    if (ok) {
      const data = extractData(response);
      businessId = data?.business?.id;
    } else {
      console.warn(`[VU ${vuId}] create_business failed: ${response.status} ${response.body}`);
    }
  });

  if (!businessId) {
    onboardingFailed.add(1);
    return;
  }

  thinkTime(0.5, 1.5);

  // ── Step 2: Add beneficial owner ────────────────────────
  group('add_owner', () => {
    const payload  = jsonBody(generateOwnerPayload(vuId));
    const response = http.post(
      `${BASE_URL}/api/businesses/${businessId}/owners`,
      payload,
      { headers, tags: TAGS.OWNER_ADD },
    );

    const ok = assertOk(response, 'add_owner');

    if (ok) {
      const data = extractData(response);
      ownerId = data?.owner?.id;
    } else {
      console.warn(`[VU ${vuId}] add_owner failed: ${response.status}`);
    }
  });

  if (!ownerId) {
    onboardingFailed.add(1);
    return;
  }

  thinkTime(0.5, 1.5);

  // ── Step 3: Trigger KYB verification ────────────────────
  group('kyb_verification', () => {
    const payload    = jsonBody(generateKybPayload());
    const kybStart   = Date.now();
    const response   = http.post(
      `${BASE_URL}/api/businesses/${businessId}/verify/kyb`,
      payload,
      { headers, tags: TAGS.KYB_VERIFY },
    );
    kybLatency.add(Date.now() - kybStart);

    check(response, {
      'kyb_verify — status 200/202/451': (r) =>
        r.status === 200 || r.status === 202 || r.status === 451,
    });
  });

  thinkTime(0.5, 1);

  // ── Step 4: Trigger KYC for owner ───────────────────────
  group('kyc_verification', () => {
    const payload    = jsonBody(generateKycPayload(ownerId));
    const kycStart   = Date.now();
    const response   = http.post(
      `${BASE_URL}/api/businesses/${businessId}/verify/kyc/${ownerId}`,
      payload,
      { headers, tags: TAGS.KYC_VERIFY },
    );
    kycLatency.add(Date.now() - kycStart);

    check(response, {
      'kyc_verify — status 200/202/451': (r) =>
        r.status === 200 || r.status === 202 || r.status === 451,
    });
  });

  thinkTime(0.5, 1);

  // ── Step 5: Poll verification status ────────────────────
  group('verification_status', () => {
    const response = http.get(
      `${BASE_URL}/api/businesses/${businessId}/verification-status`,
      { headers, tags: { endpoint: 'verification_status' } },
    );

    assertOk(response, 'verification_status');
  });

  // ── Record full-flow completion ──────────────────────────
  fullFlowLatency.add(Date.now() - flowStart);
  onboardingCompleted.add(1);

  thinkTime(1, 2);
}

// ── Lifecycle hooks ──────────────────────────────────────────
export function handleSummary(data) {
  return {
    'reports/onboarding-load-summary.json': JSON.stringify(data, null, 2),
  };
}
