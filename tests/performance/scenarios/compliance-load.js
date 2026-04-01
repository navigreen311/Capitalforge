// ============================================================
// CapitalForge — Compliance Load Test
//
// Tests the compliance subsystems under realistic concurrent load:
//   1. POST /api/businesses/:id/compliance/check  — UDAP scoring
//   2. POST /api/businesses/:id/consent           — consent gate grant
//   3. GET  /api/businesses/:id/consent           — consent gate read
//   4. POST /api/businesses/:id/documents         — document vault upload
//   5. GET  /api/businesses/:id/compliance/risk-score — risk score poll
//
// 30 concurrent VUs. Ramp mirrors onboarding-load.js:
//   0:00 –  1:00  warm-up   → 10 VUs
//   1:00 –  6:00  sustained → 30 VUs
//   6:00 –  6:30  cool-down →  0 VUs
//
// Thresholds:
//   UDAP scoring     p95 < 600 ms
//   Consent gate     p95 < 300 ms
//   Document upload  p95 < 1200 ms
//   Risk score       p95 < 500 ms
// ============================================================

import http from 'k6/http';
import { check, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import {
  BASE_URL, getAuthHeaders, thinkTime, THRESHOLDS, TAGS,
  jsonBody, assertOk, extractData,
} from '../k6-config.js';

// ── Custom metrics ───────────────────────────────────────────
const complianceFlowCompleted  = new Counter('compliance_flow_completed');
const complianceFlowFailed     = new Counter('compliance_flow_failed');
const udapScoringLatency       = new Trend('udap_scoring_ms',      true);
const consentGrantLatency      = new Trend('consent_grant_ms',     true);
const consentReadLatency       = new Trend('consent_read_ms',      true);
const docUploadLatency         = new Trend('doc_upload_ms',        true);
const riskScoreLatency         = new Trend('compliance_risk_score_ms', true);

// ── Scenario options ─────────────────────────────────────────
export const options = {
  scenarios: {
    compliance_load: {
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
    'compliance_flow_completed':  ['count>0'],
    'udap_scoring_ms':            ['p(95)<600'],
    'consent_grant_ms':           ['p(95)<300'],
    'consent_read_ms':            ['p(95)<300'],
    'doc_upload_ms':              ['p(95)<1200'],
    'compliance_risk_score_ms':   ['p(95)<500'],
  },
};

// ── Test data generators ─────────────────────────────────────

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const INDUSTRIES      = ['technology', 'retail', 'healthcare', 'professional_services', 'manufacturing'];
const ENTITY_TYPES    = ['llc', 'corporation', 's_corp'];
const STATES          = ['CA', 'NY', 'TX', 'FL', 'WA', 'IL'];
const CONSENT_CHANNELS = ['email', 'sms', 'voice', 'partner', 'document'];
const CONSENT_TYPES    = ['marketing', 'service', 'data_sharing', 'notifications'];
const DOC_TYPES        = ['bank_statement', 'tax_return', 'formation_document', 'identity_document'];

function generateBusinessPayload(vuId) {
  const ts = Date.now();
  return {
    legalName:            `Compliance Test Biz ${vuId}-${ts}`,
    ein:                  `${randomInt(10,99)}-${randomInt(1000000,9999999)}`,
    entityType:           randomElement(ENTITY_TYPES),
    industry:             randomElement(INDUSTRIES),
    stateOfIncorporation: randomElement(STATES),
    businessAddressLine1: `${randomInt(100,9999)} Compliance Blvd`,
    businessCity:         'New York',
    businessState:        'NY',
    businessZip:          '10001',
    monthlyRevenue:       randomInt(75000, 750000),
    yearsInOperation:     randomInt(1, 20),
    employeeCount:        randomInt(5, 500),
  };
}

function generateUdapCheckPayload() {
  return {
    checkType:       'udap',
    interactionText: `Congratulations! You are pre-approved for a business credit line of $${randomInt(25000, 200000)}.
                      This offer is available for a limited time and subject to credit approval.
                      Annual percentage rate is ${randomInt(12, 28)}%. No hidden fees.
                      Apply now to unlock your business potential with our exclusive funding program.`,
    riskRegisterInput: {
      monthlyRevenue:        randomInt(50000, 500000),
      existingDebt:          randomInt(0, 150000),
      creditUtilization:     parseFloat((Math.random() * 0.7).toFixed(2)),
      ficoScore:             randomInt(660, 820),
      businessAgeMonths:     randomInt(12, 180),
      proposedFundingAmount: randomInt(25000, 200000),
      mcc:                   '7372',
      kycCompleted:          true,
      amlCleared:            true,
      stateCode:             randomElement(STATES),
    },
  };
}

function generateConsentPayload() {
  return {
    channel:     randomElement(CONSENT_CHANNELS),
    consentType: randomElement(CONSENT_TYPES),
    evidenceRef: `load-test-evidence-${Date.now()}`,
    metadata: {
      source:    'load_test',
      ipAddress: `10.0.${randomInt(0,255)}.${randomInt(1,254)}`,
    },
  };
}

function generateDocumentPayload(vuId) {
  // Simulate a small base64-encoded document (realistic payload size: ~4 KB)
  const fakePdfContent = btoa(`%PDF-1.4 LoadTest Document VU=${vuId} TS=${Date.now()} ${'x'.repeat(3000)}`);
  return {
    documentType:  randomElement(DOC_TYPES),
    filename:      `load-test-doc-${vuId}-${Date.now()}.pdf`,
    mimeType:      'application/pdf',
    content:       fakePdfContent,
    description:   `Load test document upload — VU ${vuId}`,
    tags:          ['load-test', 'automated'],
  };
}

// ── Setup: seed business pool ────────────────────────────────
export function setup() {
  const headers     = getAuthHeaders();
  const businessIds = [];

  for (let i = 0; i < 30; i++) {
    const response = http.post(
      `${BASE_URL}/api/businesses`,
      jsonBody(generateBusinessPayload(i)),
      { headers },
    );

    if (response.status === 201) {
      const d = extractData(response);
      if (d?.business?.id) businessIds.push(d.business.id);
    }
  }

  console.log(`[setup] Seeded ${businessIds.length} businesses for compliance load test`);
  return { businessIds };
}

// ── Main VU scenario ─────────────────────────────────────────
export default function (data) {
  const vuId       = __VU;
  const headers    = getAuthHeaders();
  const businessIds = data?.businessIds ?? [];

  // Each VU gets a stable business ID — avoids cross-VU conflicts
  let businessId = businessIds.length > 0
    ? businessIds[vuId % businessIds.length]
    : null;

  // Fallback: create inline
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
    complianceFlowFailed.add(1);
    return;
  }

  // ── Step 1: UDAP scoring (compliance check) ──────────────
  group('udap_scoring', () => {
    const start    = Date.now();
    const response = http.post(
      `${BASE_URL}/api/businesses/${businessId}/compliance/check`,
      jsonBody(generateUdapCheckPayload()),
      { headers, tags: TAGS.UDAP_CHECK },
    );
    udapScoringLatency.add(Date.now() - start);

    const ok = assertOk(response, 'udap_scoring');
    if (!ok) {
      console.warn(`[VU ${vuId}] UDAP check failed: ${response.status}`);
    }
  });

  thinkTime(0.3, 1);

  // ── Step 2: Grant consent (consent gate) ─────────────────
  group('consent_grant', () => {
    const start    = Date.now();
    const response = http.post(
      `${BASE_URL}/api/businesses/${businessId}/consent`,
      jsonBody(generateConsentPayload()),
      { headers, tags: TAGS.CONSENT_GATE },
    );
    consentGrantLatency.add(Date.now() - start);

    check(response, {
      'consent_grant — status 200/201/401': (r) =>
        r.status === 200 || r.status === 201 || r.status === 401,
    });
  });

  thinkTime(0.2, 0.8);

  // ── Step 3: Read consent status (gate check) ─────────────
  group('consent_read', () => {
    const start    = Date.now();
    const response = http.get(
      `${BASE_URL}/api/businesses/${businessId}/consent`,
      { headers, tags: TAGS.CONSENT_GATE },
    );
    consentReadLatency.add(Date.now() - start);

    check(response, {
      'consent_read — status 200/401': (r) =>
        r.status === 200 || r.status === 401,
    });
  });

  thinkTime(0.2, 0.8);

  // ── Step 4: Document vault upload ────────────────────────
  group('doc_vault_upload', () => {
    const start    = Date.now();
    const response = http.post(
      `${BASE_URL}/api/businesses/${businessId}/documents`,
      jsonBody(generateDocumentPayload(vuId)),
      {
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        tags: TAGS.DOC_UPLOAD,
      },
    );
    docUploadLatency.add(Date.now() - start);

    check(response, {
      'doc_upload — status not 5xx': (r) => r.status < 500,
    });
  });

  thinkTime(0.5, 1.5);

  // ── Step 5: Risk score poll ───────────────────────────────
  group('risk_score_poll', () => {
    const start    = Date.now();
    const response = http.get(
      `${BASE_URL}/api/businesses/${businessId}/compliance/risk-score`,
      { headers, tags: TAGS.RISK_SCORE },
    );
    riskScoreLatency.add(Date.now() - start);

    check(response, {
      'risk_score — status not 5xx': (r) => r.status < 500,
    });
  });

  complianceFlowCompleted.add(1);
  thinkTime(1, 2);
}

// ── Summary output ───────────────────────────────────────────
export function handleSummary(data) {
  return {
    'reports/compliance-load-summary.json': JSON.stringify(data, null, 2),
  };
}
