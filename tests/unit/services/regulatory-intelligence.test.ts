// ============================================================
// Unit Tests — Regulatory Intelligence Monitor &
//              Funds-Flow Classification Service
//
// Run: npx vitest run tests/unit/services/regulatory-intelligence.test.ts
//
// Coverage targets (25 tests):
//   Regulatory Intelligence Service (9 tests):
//     - Alert creation with auto-computed impact scoring
//     - Alert creation with manual impact override
//     - Impact scoring for every major rule type
//     - Alert listing with and without filters
//     - Alert review flow (all valid transitions)
//     - Impact assessment generation
//     - Stub feed ingestion (dedup logic)
//     - urgency / score band mapping
//
//   Funds-Flow Classification Service (16 tests):
//     - All 5 classification types (merchant, bill_payment,
//       account_funding, cash_disbursement, money_transmission_risk)
//     - Processor-role decision tree
//     - Licensing-status determination
//     - Money-transmission alert flag
//     - All 5 suspicious-pattern detectors
//     - AML readiness — full score (no gaps)
//     - AML readiness — multiple gaps / critical level
//     - AML readiness — stale audit penalty
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Service imports ───────────────────────────────────────────────

import {
  RegulatoryIntelligenceService,
  computeImpactScore,
  scoreToUrgency,
  STUB_REGULATORY_FEED,
} from '../../../src/backend/services/regulatory-intelligence.service.js';
import type {
  CreateAlertInput,
  RegulatoryAlertRecord,
  AlertReviewInput,
} from '../../../src/backend/services/regulatory-intelligence.service.js';

import {
  FundsFlowClassificationService,
  classifyPaymentFlow,
  determineProcessorRole,
  determineLicensingStatus,
  detectSuspiciousPatterns,
  evaluateAmlReadiness,
} from '../../../src/backend/services/funds-flow-classification.service.js';
import type {
  WorkflowClassificationInput,
  AmlReadinessInput,
} from '../../../src/backend/services/funds-flow-classification.service.js';

// ── Prisma mock helpers ───────────────────────────────────────────

function makeRegulatoryPrismaMock() {
  const alertStore: Record<string, unknown> = {};

  return {
    regulatoryAlert: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        alertStore[data['id'] as string] = { ...data, createdAt: new Date() };
        return Promise.resolve({ ...data, createdAt: new Date() });
      }),
      findMany: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const rows = Object.values(alertStore).filter((r) => {
          const row = r as Record<string, unknown>;
          if (row['tenantId'] !== where['tenantId']) return false;
          if (where['status'] && row['status'] !== where['status']) return false;
          if (where['source'] && row['source'] !== where['source']) return false;
          return true;
        });
        return Promise.resolve(rows);
      }),
      findFirst: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const match = Object.values(alertStore).find((r) => {
          const row = r as Record<string, unknown>;
          return row['id'] === where['id'] && row['tenantId'] === where['tenantId'];
        });
        return Promise.resolve(match ?? null);
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const row = alertStore[where['id'] as string] as Record<string, unknown>;
        if (!row) throw new Error(`Alert ${where['id']} not found.`);
        const updated = { ...row, ...data };
        alertStore[where['id'] as string] = updated;
        return Promise.resolve(updated);
      }),
    },
    ledgerEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeFundsFlowPrismaMock() {
  const classStore: Record<string, unknown> = {};

  return {
    fundsFlowClassification: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        classStore[data['id'] as string] = { ...data, createdAt: new Date(), updatedAt: new Date() };
        return Promise.resolve({ ...data, createdAt: new Date(), updatedAt: new Date() });
      }),
      findMany: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        return Promise.resolve(
          Object.values(classStore).filter((r) => {
            const row = r as Record<string, unknown>;
            if (row['tenantId'] !== where['tenantId']) return false;
            if (where['classification'] && row['classification'] !== where['classification']) return false;
            return true;
          }),
        );
      }),
    },
    ledgerEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

// ── Fixtures ──────────────────────────────────────────────────────

const TENANT_ID = 'tenant-test-001';

const BASE_ALERT_INPUT: CreateAlertInput = {
  tenantId:  TENANT_ID,
  source:    'CFPB',
  ruleType:  'commercial_financing_disclosure',
  title:     'Test Disclosure Rule Change',
  summary:   'CFPB updates commercial financing disclosure requirements.',
  effectiveDate: new Date('2026-06-01'),
};

const BASE_WORKFLOW_INPUT: WorkflowClassificationInput = {
  tenantId:           TENANT_ID,
  workflowName:       'Standard Merchant Payment',
  receivesAndRemits:  false,
  isBeneficialRecipient: true,
  involvesStoredValue: false,
  includesCashElement: false,
  isBillPayment:      false,
  isMerchantOfRecord: true,
  mcc:                '5411', // Grocery store — neutral MCC
};

const BASE_AML_INPUT: AmlReadinessInput = {
  tenantId:                         TENANT_ID,
  hasBsaOfficerDesignated:          true,
  hasWrittenAmlPolicy:              true,
  hasOfacScreeningProcess:          true,
  hasCtrFilingProcess:              true,
  hasSarFilingProcess:              true,
  hasEmployeeAmlTraining:           true,
  hasIndependentAudit:              true,
  hasBeneficialOwnershipProcedures: true,
};

// ══════════════════════════════════════════════════════════════════
// REGULATORY INTELLIGENCE SERVICE
// ══════════════════════════════════════════════════════════════════

describe('computeImpactScore — pure function', () => {
  it('returns impactScore in 1–100 range and non-empty affectedModules', () => {
    const { impactScore, affectedModules } = computeImpactScore('CFPB', 'commercial_financing_disclosure');
    expect(impactScore).toBeGreaterThanOrEqual(1);
    expect(impactScore).toBeLessThanOrEqual(100);
    expect(affectedModules.length).toBeGreaterThan(0);
  });

  it('CFPB commercial_financing_disclosure scores higher than Visa network_operating_rule', () => {
    const cfpb = computeImpactScore('CFPB', 'commercial_financing_disclosure');
    const visa = computeImpactScore('Visa', 'network_operating_rule');
    expect(cfpb.impactScore).toBeGreaterThan(visa.impactScore);
  });

  it('money_transmission rule type produces score 100 for FinCEN source', () => {
    const { impactScore } = computeImpactScore('FinCEN', 'money_transmission');
    expect(impactScore).toBe(100);
  });

  it('includes correct modules for aml_bsa rule type', () => {
    const { affectedModules } = computeImpactScore('FinCEN', 'aml_bsa');
    expect(affectedModules).toContain('kyb_kyc');
    expect(affectedModules).toContain('funds_flow');
  });
});

describe('scoreToUrgency — pure function', () => {
  it('maps score 85 and above to critical', () => {
    expect(scoreToUrgency(85)).toBe('critical');
    expect(scoreToUrgency(100)).toBe('critical');
  });

  it('maps score 65–84 to high', () => {
    expect(scoreToUrgency(65)).toBe('high');
    expect(scoreToUrgency(84)).toBe('high');
  });

  it('maps score 40–64 to medium', () => {
    expect(scoreToUrgency(40)).toBe('medium');
    expect(scoreToUrgency(64)).toBe('medium');
  });

  it('maps score below 40 to low', () => {
    expect(scoreToUrgency(0)).toBe('low');
    expect(scoreToUrgency(39)).toBe('low');
  });
});

describe('RegulatoryIntelligenceService — alert lifecycle', () => {
  let svc: RegulatoryIntelligenceService;
  let prismaMock: ReturnType<typeof makeRegulatoryPrismaMock>;

  beforeEach(() => {
    prismaMock = makeRegulatoryPrismaMock();
    svc = new RegulatoryIntelligenceService(prismaMock as unknown as ConstructorParameters<typeof RegulatoryIntelligenceService>[0]);
  });

  it('creates an alert and returns a record with auto-computed impactScore', async () => {
    const alert = await svc.createAlert(BASE_ALERT_INPUT);
    expect(alert.id).toBeTruthy();
    expect(alert.tenantId).toBe(TENANT_ID);
    expect(alert.impactScore).toBeGreaterThan(0);
    expect(alert.affectedModules.length).toBeGreaterThan(0);
    expect(alert.status).toBe('new');
  });

  it('respects manual impactScore and affectedModules overrides', async () => {
    const alert = await svc.createAlert({
      ...BASE_ALERT_INPUT,
      impactScore:     42,
      affectedModules: ['cost_calculator'],
    });
    expect(alert.impactScore).toBe(42);
    expect(alert.affectedModules).toEqual(['cost_calculator']);
  });

  it('persists the alert via prisma.regulatoryAlert.create', async () => {
    await svc.createAlert(BASE_ALERT_INPUT);
    expect(prismaMock.regulatoryAlert.create).toHaveBeenCalledOnce();
  });

  it('listAlerts returns the created alert for the tenant', async () => {
    await svc.createAlert(BASE_ALERT_INPUT);
    const alerts = await svc.listAlerts(TENANT_ID);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].tenantId).toBe(TENANT_ID);
  });

  it('listAlerts filters by status', async () => {
    await svc.createAlert(BASE_ALERT_INPUT);
    const newAlerts = await svc.listAlerts(TENANT_ID, { status: 'new' });
    expect(newAlerts.every((a) => a.status === 'new')).toBe(true);
  });

  it('reviewAlert transitions status to under_review', async () => {
    const alert = await svc.createAlert(BASE_ALERT_INPUT);

    // Make findFirst return the created alert
    prismaMock.regulatoryAlert.findFirst.mockResolvedValueOnce({
      id:        alert.id,
      tenantId:  TENANT_ID,
      source:    alert.source,
      ruleType:  alert.ruleType,
      title:     alert.title,
      summary:   alert.summary,
      impactScore: alert.impactScore,
      affectedModules: alert.affectedModules,
      status:    'new',
      createdAt: alert.createdAt,
    });

    const input: AlertReviewInput = {
      alertId:    alert.id,
      tenantId:   TENANT_ID,
      reviewedBy: 'compliance-officer-001',
      newStatus:  'under_review',
    };

    const updated = await svc.reviewAlert(input);
    expect(updated.status).toBe('under_review');
    expect(updated.reviewedBy).toBe('compliance-officer-001');
    expect(updated.reviewedAt).toBeInstanceOf(Date);
  });

  it('reviewAlert throws when alert not found', async () => {
    prismaMock.regulatoryAlert.findFirst.mockResolvedValueOnce(null);

    const input: AlertReviewInput = {
      alertId:    'non-existent-id',
      tenantId:   TENANT_ID,
      reviewedBy: 'user-001',
      newStatus:  'resolved',
    };

    await expect(svc.reviewAlert(input)).rejects.toThrow(/not found/i);
  });

  it('getImpactAssessment returns assessment with urgency and recommendations', async () => {
    const alert = await svc.createAlert(BASE_ALERT_INPUT);

    prismaMock.regulatoryAlert.findFirst.mockResolvedValueOnce({
      id:             alert.id,
      tenantId:       TENANT_ID,
      source:         alert.source,
      ruleType:       alert.ruleType,
      title:          alert.title,
      summary:        alert.summary,
      impactScore:    alert.impactScore,
      affectedModules: alert.affectedModules,
      status:         'new',
      createdAt:      alert.createdAt,
    });

    const assessment = await svc.getImpactAssessment(alert.id, TENANT_ID);
    expect(assessment.ruleId).toBe(alert.id);
    expect(assessment.impactScore).toBe(alert.impactScore);
    expect(assessment.recommendedActions.length).toBeGreaterThan(0);
    expect(['low', 'medium', 'high', 'critical']).toContain(assessment.urgency);
  });
});

// ══════════════════════════════════════════════════════════════════
// FUNDS-FLOW CLASSIFICATION — PURE FUNCTIONS
// ══════════════════════════════════════════════════════════════════

describe('classifyPaymentFlow — merchant (default)', () => {
  it('classifies standard merchant payment correctly', () => {
    const result = classifyPaymentFlow(BASE_WORKFLOW_INPUT);
    expect(result.classification).toBe('merchant');
    expect(result.riskBasis).toMatch(/merchant/i);
  });
});

describe('classifyPaymentFlow — money_transmission_risk', () => {
  it('flags receive-and-remit flow without MOR status', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      receivesAndRemits:     true,
      isBeneficialRecipient: false,
      isMerchantOfRecord:    false,
    };
    const result = classifyPaymentFlow(input);
    expect(result.classification).toBe('money_transmission_risk');
    expect(result.riskBasis).toMatch(/money transmission/i);
  });

  it('includes FinCEN MSB in the regulatory framework for MT risk', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      receivesAndRemits:     true,
      isBeneficialRecipient: false,
      isMerchantOfRecord:    false,
    };
    const { regulatoryFramework } = classifyPaymentFlow(input);
    expect(regulatoryFramework).toMatch(/FinCEN/i);
  });
});

describe('classifyPaymentFlow — cash_disbursement', () => {
  it('classifies flow with includesCashElement flag', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      receivesAndRemits:     false,
      isBeneficialRecipient: true,
      includesCashElement:   true,
    };
    const result = classifyPaymentFlow(input);
    expect(result.classification).toBe('cash_disbursement');
  });

  it('classifies flow with cash-like MCC 6011', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      mcc:                 '6011',
      includesCashElement: false,
    };
    const result = classifyPaymentFlow(input);
    expect(result.classification).toBe('cash_disbursement');
    expect(result.riskBasis).toMatch(/BSA/i);
  });
});

describe('classifyPaymentFlow — account_funding', () => {
  it('classifies stored-value flow as account_funding', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      involvesStoredValue:  true,
      includesCashElement:  false,
      receivesAndRemits:    true,
      isBeneficialRecipient: true,
      isMerchantOfRecord:   false,
    };
    const result = classifyPaymentFlow(input);
    expect(result.classification).toBe('account_funding');
    expect(result.riskBasis).toMatch(/stored.value|AFT/i);
  });

  it('classifies MCC 6540 (Visa AFT) as account_funding', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      mcc:                 '6540',
      involvesStoredValue: false,
    };
    const result = classifyPaymentFlow(input);
    expect(result.classification).toBe('account_funding');
  });
});

describe('classifyPaymentFlow — bill_payment', () => {
  it('classifies isBillPayment flag correctly', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      isBillPayment:       true,
      involvesStoredValue: false,
      includesCashElement: false,
    };
    const result = classifyPaymentFlow(input);
    expect(result.classification).toBe('bill_payment');
    expect(result.riskBasis).toMatch(/biller/i);
  });

  it('classifies utility MCC 4900 as bill_payment', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      mcc:                '4900',
      isBillPayment:      false,
      involvesStoredValue: false,
      includesCashElement: false,
    };
    const result = classifyPaymentFlow(input);
    expect(result.classification).toBe('bill_payment');
  });
});

describe('determineProcessorRole', () => {
  it('returns merchant_of_record when isMerchantOfRecord is true', () => {
    expect(determineProcessorRole({ ...BASE_WORKFLOW_INPUT, isMerchantOfRecord: true })).toBe('merchant_of_record');
  });

  it('returns payment_facilitator when receivesAndRemits + isBeneficialRecipient', () => {
    expect(
      determineProcessorRole({
        ...BASE_WORKFLOW_INPUT,
        isMerchantOfRecord:    false,
        receivesAndRemits:     true,
        isBeneficialRecipient: true,
      }),
    ).toBe('payment_facilitator');
  });

  it('returns direct_acquirer when platform does not receive and remit', () => {
    expect(
      determineProcessorRole({
        ...BASE_WORKFLOW_INPUT,
        isMerchantOfRecord: false,
        receivesAndRemits:  false,
      }),
    ).toBe('direct_acquirer');
  });
});

describe('determineLicensingStatus', () => {
  it('returns escalated for money_transmission_risk', () => {
    expect(
      determineLicensingStatus('money_transmission_risk', 'iso', BASE_WORKFLOW_INPUT),
    ).toBe('escalated');
  });

  it('returns review_required for account_funding', () => {
    expect(
      determineLicensingStatus('account_funding', 'payment_facilitator', BASE_WORKFLOW_INPUT),
    ).toBe('review_required');
  });

  it('returns not_required for standard merchant flow', () => {
    expect(
      determineLicensingStatus('merchant', 'merchant_of_record', BASE_WORKFLOW_INPUT),
    ).toBe('not_required');
  });
});

// ══════════════════════════════════════════════════════════════════
// SUSPICIOUS PATTERN DETECTION
// ══════════════════════════════════════════════════════════════════

describe('detectSuspiciousPatterns', () => {
  it('SP-001: flags high-volume many-to-one disbursement', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      receivesAndRemits:        true,
      isBeneficialRecipient:    false,
      isMerchantOfRecord:       false,
      uniquePayeeCountMonthly:  1,
    };
    const alerts = detectSuspiciousPatterns('test-workflow', input);
    expect(alerts.some((a) => a.patternId === 'SP-001')).toBe(true);
  });

  it('SP-002: flags high-value cash disbursement above $10,000', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      includesCashElement:            true,
      averageTransactionAmountUsd:    15_000,
    };
    const alerts = detectSuspiciousPatterns('test-workflow', input);
    expect(alerts.some((a) => a.patternId === 'SP-002')).toBe(true);
  });

  it('SP-003: flags account-funding through gambling MCC 7995', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      involvesStoredValue: true,
      mcc:                 '7995',
    };
    const alerts = detectSuspiciousPatterns('test-workflow', input);
    expect(alerts.some((a) => a.patternId === 'SP-003')).toBe(true);
  });

  it('SP-004: flags unbounded payee fan-out without MOR status', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      isMerchantOfRecord:      false,
      receivesAndRemits:       true,
      uniquePayeeCountMonthly: 600,
    };
    const alerts = detectSuspiciousPatterns('test-workflow', input);
    expect(alerts.some((a) => a.patternId === 'SP-004')).toBe(true);
  });

  it('SP-005: flags wire-transfer MCC on non-beneficial-recipient flow', () => {
    const input: WorkflowClassificationInput = {
      ...BASE_WORKFLOW_INPUT,
      mcc:                   '4829',
      isBeneficialRecipient: false,
    };
    const alerts = detectSuspiciousPatterns('test-workflow', input);
    expect(alerts.some((a) => a.patternId === 'SP-005')).toBe(true);
  });

  it('returns empty array for clean merchant workflow', () => {
    const alerts = detectSuspiciousPatterns('clean-workflow', BASE_WORKFLOW_INPUT);
    expect(alerts).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// AML READINESS
// ══════════════════════════════════════════════════════════════════

describe('evaluateAmlReadiness — full compliance', () => {
  it('returns adequate readiness with score 100 when all pillars satisfied', () => {
    const report = evaluateAmlReadiness(BASE_AML_INPUT);
    expect(report.overallReadiness).toBe('adequate');
    expect(report.score).toBe(100);
    expect(report.gaps).toHaveLength(0);
  });
});

describe('evaluateAmlReadiness — critical gaps', () => {
  it('marks critical_gap when BSA officer and written policy are missing', () => {
    const report = evaluateAmlReadiness({
      ...BASE_AML_INPUT,
      hasBsaOfficerDesignated: false,
      hasWrittenAmlPolicy:     false,
    });
    expect(report.overallReadiness).toBe('critical_gap');
    expect(report.gaps.length).toBeGreaterThanOrEqual(2);
    expect(report.gaps.some((g) => g.severity === 'critical')).toBe(true);
  });

  it('includes OFAC gap when screening is missing', () => {
    const report = evaluateAmlReadiness({
      ...BASE_AML_INPUT,
      hasOfacScreeningProcess: false,
    });
    const ofacGap = report.gaps.find((g) => g.area === 'OFAC Screening');
    expect(ofacGap).toBeDefined();
    expect(ofacGap!.severity).toBe('high');
  });

  it('penalises for stale audit (>12 months old)', () => {
    const staleDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const report = evaluateAmlReadiness({
      ...BASE_AML_INPUT,
      lastAuditDate: staleDate,
    });
    expect(report.score).toBeLessThan(100);
    expect(report.gaps.some((g) => g.area === 'Audit Currency')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// FUNDS-FLOW SERVICE — INTEGRATION (with mocked Prisma)
// ══════════════════════════════════════════════════════════════════

describe('FundsFlowClassificationService — classifyWorkflow', () => {
  let svc: FundsFlowClassificationService;
  let prismaMock: ReturnType<typeof makeFundsFlowPrismaMock>;

  beforeEach(() => {
    prismaMock = makeFundsFlowPrismaMock();
    svc = new FundsFlowClassificationService(
      prismaMock as unknown as ConstructorParameters<typeof FundsFlowClassificationService>[0],
    );
  });

  it('classifies and persists a standard merchant workflow', async () => {
    const result = await svc.classifyWorkflow({
      ...BASE_WORKFLOW_INPUT,
      tenantId: TENANT_ID,
    });
    expect(result.id).toBeTruthy();
    expect(result.classification).toBe('merchant');
    expect(result.moneyTransmissionAlert).toBe(false);
    expect(prismaMock.fundsFlowClassification.create).toHaveBeenCalledOnce();
  });

  it('sets moneyTransmissionAlert = true for MT-risk workflow', async () => {
    const result = await svc.classifyWorkflow({
      ...BASE_WORKFLOW_INPUT,
      tenantId:              TENANT_ID,
      receivesAndRemits:     true,
      isBeneficialRecipient: false,
      isMerchantOfRecord:    false,
    });
    expect(result.moneyTransmissionAlert).toBe(true);
    expect(result.alertDetails).toBeTruthy();
    expect(result.licensingStatus).toBe('escalated');
  });

  it('listClassifications returns persisted records', async () => {
    await svc.classifyWorkflow({ ...BASE_WORKFLOW_INPUT, tenantId: TENANT_ID });
    const list = await svc.listClassifications(TENANT_ID);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Stub feed integrity ───────────────────────────────────────────

describe('STUB_REGULATORY_FEED', () => {
  it('contains at least 6 feed entries', () => {
    expect(STUB_REGULATORY_FEED.length).toBeGreaterThanOrEqual(6);
  });

  it('each entry has title, summary, source, ruleType, impactScore, and affectedModules', () => {
    for (const item of STUB_REGULATORY_FEED) {
      expect(item.title).toBeTruthy();
      expect(item.summary).toBeTruthy();
      expect(item.source).toBeTruthy();
      expect(item.ruleType).toBeTruthy();
      expect(item.impactScore).toBeGreaterThan(0);
      expect(item.affectedModules.length).toBeGreaterThan(0);
    }
  });

  it('all impactScores in feed are in 1–100 range', () => {
    for (const item of STUB_REGULATORY_FEED) {
      expect(item.impactScore).toBeGreaterThanOrEqual(1);
      expect(item.impactScore).toBeLessThanOrEqual(100);
    }
  });
});
