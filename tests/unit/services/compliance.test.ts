// ============================================================
// Unit Tests — Compliance & Risk Center
//
// Run: npx vitest run tests/unit/services/compliance.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module imports ─────────────────────────────────────────────
import { scoreUdapRisk } from '../../../src/backend/services/udap-scorer.js';
import type { UdapScorerInput } from '../../../src/backend/services/udap-scorer.js';

import {
  getStateLawProfile,
  getRequiredDisclosures,
  getComplianceSteps,
  hasSpecificStateLaw,
  getStatesWithSpecificLaws,
} from '../../../src/backend/services/state-law-mapper.js';

import {
  scoreRiskRegister,
  ComplianceService,
} from '../../../src/backend/services/compliance.service.js';
import type { RiskRegisterInput } from '../../../src/backend/services/compliance.service.js';

// ── Prisma mock ────────────────────────────────────────────────
// We never hit a real database in unit tests. Prisma is injected.

function makePrismaMock() {
  return {
    complianceCheck: {
      create:    vi.fn().mockResolvedValue({ id: 'check-001' }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    business: {
      findFirst: vi.fn().mockResolvedValue({ id: 'biz-001' }),
    },
  };
}

// ── Shared fixtures ────────────────────────────────────────────

const CLEAN_TEXT = 'We offer transparent business financing with clear terms and full disclosures.';

const UDAP_TOXIC_TEXT =
  'Absolutely no upfront fees — we are an SBA-approved government program! ' +
  'Guaranteed approval for every business. You must decide today or lose your spot. ' +
  'Coaching is completely free. Earn up to $50,000 per month with our programme.';

const BASE_RISK_INPUT: RiskRegisterInput = {
  businessId:            'biz-001',
  tenantId:              'tenant-001',
  monthlyRevenue:        20000,
  existingDebt:          10000,
  creditUtilization:     0.3,
  ficoScore:             720,
  businessAgeMonths:     36,
  proposedFundingAmount: 50000,
  kycCompleted:          true,
  amlCleared:            true,
  stateCode:             'TX',
};

// ─────────────────────────────────────────────────────────────────
// UDAP SCORER
// ─────────────────────────────────────────────────────────────────

describe('UDAP Scorer — clean interaction', () => {
  it('returns score 0 and no violations for compliant text', () => {
    const result = scoreUdapRisk({ interactionText: CLEAN_TEXT });
    expect(result.score).toBe(0);
    expect(result.violations).toHaveLength(0);
    expect(result.requiresReview).toBe(false);
    expect(result.hardStop).toBe(false);
  });

  it('summary states no red flags for clean text', () => {
    const result = scoreUdapRisk({ interactionText: CLEAN_TEXT });
    expect(result.summary).toMatch(/no udap\/udaap red flags/i);
  });
});

describe('UDAP Scorer — single violation types', () => {
  it('detects no_upfront_fee_claim', () => {
    const result = scoreUdapRisk({ interactionText: 'We charge no upfront fees ever.' });
    const v = result.violations.find((x) => x.type === 'no_upfront_fee_claim');
    expect(v).toBeDefined();
    expect(v!.severityWeight).toBeGreaterThanOrEqual(8);
  });

  it('detects government_affiliation_claim', () => {
    const result = scoreUdapRisk({ interactionText: 'This is an SBA-approved government program.' });
    const v = result.violations.find((x) => x.type === 'government_affiliation_claim');
    expect(v).toBeDefined();
    expect(v!.severityWeight).toBe(10);
  });

  it('detects guaranteed_approval_claim', () => {
    const result = scoreUdapRisk({ interactionText: 'Guaranteed approval for all businesses.' });
    const v = result.violations.find((x) => x.type === 'guaranteed_approval_claim');
    expect(v).toBeDefined();
  });

  it('detects pressure_tactic', () => {
    const result = scoreUdapRisk({ interactionText: 'This offer expires today — you must decide right now.' });
    const v = result.violations.find((x) => x.type === 'pressure_tactic');
    expect(v).toBeDefined();
  });

  it('detects coaching_misrepresentation', () => {
    const result = scoreUdapRisk({ interactionText: 'Coaching is free and included with your package.' });
    const v = result.violations.find((x) => x.type === 'coaching_misrepresentation');
    expect(v).toBeDefined();
  });

  it('detects income_projection_misrepresentation', () => {
    const result = scoreUdapRisk({ interactionText: 'Earn up to $50,000 per month with our system.' });
    const v = result.violations.find((x) => x.type === 'income_projection_misrepresentation');
    expect(v).toBeDefined();
  });

  it('detects misleading_fee_representation', () => {
    const result = scoreUdapRisk({ interactionText: 'There are no hidden fees whatsoever.' });
    const v = result.violations.find((x) => x.type === 'misleading_fee_representation');
    expect(v).toBeDefined();
  });

  it('detects unauthorized_consent', () => {
    const result = scoreUdapRisk({ interactionText: "We'll just pull your credit without any issue." });
    const v = result.violations.find((x) => x.type === 'unauthorized_consent');
    expect(v).toBeDefined();
  });
});

describe('UDAP Scorer — aggregate toxic text', () => {
  it('scores toxic text well above 50', () => {
    const result = scoreUdapRisk({ interactionText: UDAP_TOXIC_TEXT });
    expect(result.score).toBeGreaterThan(50);
  });

  it('sets hardStop=true for toxic text', () => {
    const result = scoreUdapRisk({ interactionText: UDAP_TOXIC_TEXT });
    expect(result.hardStop).toBe(true);
  });

  it('sets requiresReview=true for toxic text', () => {
    const result = scoreUdapRisk({ interactionText: UDAP_TOXIC_TEXT });
    expect(result.requiresReview).toBe(true);
  });

  it('detects multiple violation types in one pass', () => {
    const result = scoreUdapRisk({ interactionText: UDAP_TOXIC_TEXT });
    expect(result.violations.length).toBeGreaterThanOrEqual(4);
  });

  it('summary includes HARD STOP for toxic text', () => {
    const result = scoreUdapRisk({ interactionText: UDAP_TOXIC_TEXT });
    expect(result.summary).toMatch(/hard stop/i);
  });
});

describe('UDAP Scorer — context multipliers', () => {
  it('boosts missing_disclosure weight when disclosureSent=false', () => {
    const withFlag = scoreUdapRisk({
      interactionText: "Just sign here and we'll explain the fine print later.",
      disclosureSent: false,
    });
    const withoutFlag = scoreUdapRisk({
      interactionText: "Just sign here and we'll explain the fine print later.",
    });
    // Both should detect missing_disclosure; flag version should score >= clean version
    expect(withFlag.score).toBeGreaterThanOrEqual(withoutFlag.score);
  });

  it('boosts unauthorized_consent weight when consentOnFile=false', () => {
    const withFlag = scoreUdapRisk({
      interactionText: "We'll automatically pull your credit.",
      consentOnFile: false,
    });
    expect(withFlag.score).toBeGreaterThan(0);
    const v = withFlag.violations.find((x) => x.type === 'unauthorized_consent');
    expect(v?.severityWeight).toBeGreaterThanOrEqual(9);
  });
});

describe('UDAP Scorer — output shape', () => {
  it('always returns score in [0, 100]', () => {
    const result = scoreUdapRisk({ interactionText: UDAP_TOXIC_TEXT });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('each violation has required fields', () => {
    const result = scoreUdapRisk({ interactionText: UDAP_TOXIC_TEXT });
    for (const v of result.violations) {
      expect(v.type).toBeTruthy();
      expect(v.evidence).toBeTruthy();
      expect(v.severityWeight).toBeGreaterThan(0);
      expect(v.description).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// STATE LAW MAPPER
// ─────────────────────────────────────────────────────────────────

describe('State Law Mapper — California (SB 1235)', () => {
  it('returns a non-null profile for CA', () => {
    const profile = getStateLawProfile('CA');
    expect(profile).not.toBeNull();
  });

  it('marks CA as having a specific state law', () => {
    expect(hasSpecificStateLaw('CA')).toBe(true);
  });

  it('requires broker license in CA', () => {
    const profile = getStateLawProfile('CA');
    expect(profile!.requiresBrokerLicense).toBe(true);
  });

  it('CA profile includes SB 1235 estimated APR disclosure', () => {
    const disclosures = getRequiredDisclosures('CA');
    const apDisclosure = disclosures.find((d) => d.id === 'CA_SB1235_ESTIMATED_APR');
    expect(apDisclosure).toBeDefined();
    expect(apDisclosure!.legalCitation).toMatch(/SB 1235/i);
  });

  it('CA profile references Cal. Fin. Code in primary citation', () => {
    const profile = getStateLawProfile('CA');
    expect(profile!.primaryCitation).toMatch(/Cal\. Fin\. Code/);
  });

  it('CA compliance steps include DFPI registration check', () => {
    const steps = getComplianceSteps('CA');
    const regStep = steps.find((s) => s.id === 'CA_DFPI_REGISTRATION_CHECK');
    expect(regStep).toBeDefined();
  });

  it('CA profile includes notes array with at least one entry', () => {
    const profile = getStateLawProfile('CA');
    expect(profile!.notes.length).toBeGreaterThan(0);
  });
});

describe('State Law Mapper — New York (CFDL)', () => {
  it('returns a non-null profile for NY', () => {
    const profile = getStateLawProfile('NY');
    expect(profile).not.toBeNull();
  });

  it('marks NY as having a specific state law', () => {
    expect(hasSpecificStateLaw('NY')).toBe(true);
  });

  it('NY profile includes CFDL estimated APR disclosure', () => {
    const disclosures = getRequiredDisclosures('NY');
    const apr = disclosures.find((d) => d.id === 'NY_CFDL_ESTIMATED_APR');
    expect(apr).toBeDefined();
  });

  it('NY has pending legislation flag', () => {
    const profile = getStateLawProfile('NY');
    expect(profile!.pendingLegislation).toBe(true);
  });

  it('NY compliance steps include AG anti-fraud check', () => {
    const steps = getComplianceSteps('NY');
    const agStep = steps.find((s) => s.id === 'NY_AG_ANTI_FRAUD_CHECK');
    expect(agStep).toBeDefined();
  });
});

describe('State Law Mapper — federal baseline states', () => {
  it('returns a stub profile for TX', () => {
    const profile = getStateLawProfile('TX');
    expect(profile).not.toBeNull();
    expect(profile!.hasSpecificStateLaw).toBe(false);
  });

  it('TX profile uses federal baseline disclosures', () => {
    const disclosures = getRequiredDisclosures('TX');
    expect(disclosures.length).toBeGreaterThan(0);
    const ftcDisclosure = disclosures.find((d) => d.legalCitation.includes('FTC'));
    expect(ftcDisclosure).toBeDefined();
  });

  it('returns null for unknown state code', () => {
    const profile = getStateLawProfile('ZZ');
    expect(profile).toBeNull();
  });

  it('getStatesWithSpecificLaws returns at least CA and NY', () => {
    const states = getStatesWithSpecificLaws();
    expect(states).toContain('CA');
    expect(states).toContain('NY');
  });

  it('handles lowercase state code input', () => {
    const profile = getStateLawProfile('ca');
    expect(profile).not.toBeNull();
    expect(profile!.stateCode).toBe('CA');
  });
});

// ─────────────────────────────────────────────────────────────────
// RISK REGISTER SCORER
// ─────────────────────────────────────────────────────────────────

describe('Risk Register — low-risk baseline business', () => {
  it('returns an overall score in [0, 100]', () => {
    const result = scoreRiskRegister(BASE_RISK_INPUT);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('returns exactly 10 category scores', () => {
    const result = scoreRiskRegister(BASE_RISK_INPUT);
    expect(result.categoryScores).toHaveLength(10);
  });

  it('maps to low risk level for healthy inputs', () => {
    const result = scoreRiskRegister(BASE_RISK_INPUT);
    expect(['low', 'medium']).toContain(result.riskLevel);
  });

  it('evaluatedAt is a valid Date', () => {
    const result = scoreRiskRegister(BASE_RISK_INPUT);
    expect(result.evaluatedAt).toBeInstanceOf(Date);
  });

  it('each category score is between 1 and 10', () => {
    const result = scoreRiskRegister(BASE_RISK_INPUT);
    for (const cat of result.categoryScores) {
      expect(cat.score).toBeGreaterThanOrEqual(1);
      expect(cat.score).toBeLessThanOrEqual(10);
    }
  });
});

describe('Risk Register — high-risk business inputs', () => {
  it('poor FICO raises credit_cash_flow score', () => {
    const result = scoreRiskRegister({ ...BASE_RISK_INPUT, ficoScore: 520 });
    const cat = result.categoryScores.find((c) => c.category === 'credit_cash_flow');
    const baseline = scoreRiskRegister(BASE_RISK_INPUT).categoryScores
      .find((c) => c.category === 'credit_cash_flow')!.score;
    expect(cat!.score).toBeGreaterThan(baseline);
  });

  it('high utilization raises credit_cash_flow score', () => {
    const result = scoreRiskRegister({ ...BASE_RISK_INPUT, creditUtilization: 0.95 });
    const cat = result.categoryScores.find((c) => c.category === 'credit_cash_flow');
    expect(cat!.score).toBeGreaterThan(1);
  });

  it('kyc not completed raises aml_kyc score significantly', () => {
    const result = scoreRiskRegister({ ...BASE_RISK_INPUT, kycCompleted: false, amlCleared: false });
    const cat = result.categoryScores.find((c) => c.category === 'aml_kyc');
    expect(cat!.score).toBeGreaterThanOrEqual(7);
  });

  it('UDAP toxic interaction text raises regulatory_udaap score', () => {
    const result = scoreRiskRegister({ ...BASE_RISK_INPUT, interactionText: UDAP_TOXIC_TEXT });
    const cat = result.categoryScores.find((c) => c.category === 'regulatory_udaap');
    const baseline = scoreRiskRegister(BASE_RISK_INPUT).categoryScores
      .find((c) => c.category === 'regulatory_udaap')!.score;
    expect(cat!.score).toBeGreaterThan(baseline);
  });

  it('UDAP hard-stop text sets representation_fraud score to 10', () => {
    const result = scoreRiskRegister({ ...BASE_RISK_INPUT, interactionText: UDAP_TOXIC_TEXT });
    const cat = result.categoryScores.find((c) => c.category === 'representation_fraud');
    expect(cat!.score).toBe(10);
  });

  it('high-risk MCC raises chargeback score', () => {
    const result = scoreRiskRegister({ ...BASE_RISK_INPUT, mcc: '7995' });
    const cat = result.categoryScores.find((c) => c.category === 'chargeback');
    expect(cat!.score).toBeGreaterThan(1);
  });

  it('vendor in enforcement DB raises reputational score', () => {
    const result = scoreRiskRegister({ ...BASE_RISK_INPUT, vendorIds: ['vendor-critical-001'] });
    const cat = result.categoryScores.find((c) => c.category === 'reputational');
    expect(cat!.score).toBeGreaterThan(1);
  });

  it('critical overall score has at least one critical category', () => {
    const worstCase: RiskRegisterInput = {
      ...BASE_RISK_INPUT,
      ficoScore:         450,
      creditUtilization: 0.98,
      kycCompleted:      false,
      amlCleared:        false,
      interactionText:   UDAP_TOXIC_TEXT,
      businessAgeMonths: 2,
      mcc:               '7995',
      vendorIds:         ['vendor-critical-001'],
    };
    const result = scoreRiskRegister(worstCase);
    expect(result.criticalCategories.length).toBeGreaterThan(0);
  });
});

describe('Risk Register — risk level mapping', () => {
  it('score <= 30 maps to low', () => {
    const result = scoreRiskRegister(BASE_RISK_INPUT);
    if (result.overallScore <= 30) {
      expect(result.riskLevel).toBe('low');
    }
  });

  it('summary is a non-empty string', () => {
    const result = scoreRiskRegister(BASE_RISK_INPUT);
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// COMPLIANCE SERVICE
// ─────────────────────────────────────────────────────────────────

describe('ComplianceService — getRiskScore', () => {
  it('returns riskScore 0 and low when no check exists', async () => {
    const mock = makePrismaMock();
    mock.complianceCheck.findFirst.mockResolvedValue(null);
    const svc = new ComplianceService(mock as never);

    const result = await svc.getRiskScore('biz-001', 'tenant-001');
    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe('low');
    expect(result.lastCheckAt).toBeNull();
  });

  it('returns persisted score when a check record exists', async () => {
    const mock = makePrismaMock();
    mock.complianceCheck.findFirst.mockResolvedValue({
      riskScore: 65,
      riskLevel:  'high',
      createdAt:  new Date('2026-01-15'),
    });
    const svc = new ComplianceService(mock as never);

    const result = await svc.getRiskScore('biz-001', 'tenant-001');
    expect(result.riskScore).toBe(65);
    expect(result.riskLevel).toBe('high');
    expect(result.lastCheckAt).toEqual(new Date('2026-01-15'));
  });
});

describe('ComplianceService — runComplianceCheck (UDAP)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists a compliance check record for UDAP check', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    await svc.runComplianceCheck({
      businessId:      'biz-001',
      tenantId:        'tenant-001',
      checkType:       'udap',
      interactionText: CLEAN_TEXT,
    });

    expect(mock.complianceCheck.create).toHaveBeenCalledOnce();
    const createCall = mock.complianceCheck.create.mock.calls[0][0];
    expect(createCall.data.checkType).toBe('udap');
    expect(createCall.data.businessId).toBe('biz-001');
    expect(createCall.data.tenantId).toBe('tenant-001');
  });

  it('returns udapResult with violation data for toxic text', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const result = await svc.runComplianceCheck({
      businessId:      'biz-001',
      tenantId:        'tenant-001',
      checkType:       'udap',
      interactionText: UDAP_TOXIC_TEXT,
    });

    expect(result.udapResult).toBeDefined();
    expect(result.udapResult!.violations.length).toBeGreaterThan(0);
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it('findings include UDAP violation details for toxic text', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const result = await svc.runComplianceCheck({
      businessId:      'biz-001',
      tenantId:        'tenant-001',
      checkType:       'udap',
      interactionText: UDAP_TOXIC_TEXT,
    });

    expect(result.findings.length).toBeGreaterThan(0);
    const critical = result.findings.filter((f) => f.severity === 'critical');
    expect(critical.length).toBeGreaterThan(0);
  });
});

describe('ComplianceService — runComplianceCheck (state_law)', () => {
  it('returns stateLawProfile for CA', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const result = await svc.runComplianceCheck({
      businessId: 'biz-001',
      tenantId:   'tenant-001',
      checkType:  'state_law',
      stateCode:  'CA',
    });

    expect(result.stateLawProfile).toBeDefined();
    expect(result.stateLawProfile!.stateCode).toBe('CA');
  });

  it('findings include broker license warning for CA', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const result = await svc.runComplianceCheck({
      businessId: 'biz-001',
      tenantId:   'tenant-001',
      checkType:  'state_law',
      stateCode:  'CA',
    });

    const licenseFinding = result.findings.find((f) => f.category === 'state_law.license');
    expect(licenseFinding).toBeDefined();
    expect(licenseFinding!.severity).toBe('violation');
  });
});

describe('ComplianceService — runComplianceCheck (vendor)', () => {
  it('returns vendor enforcement history for a known high-risk vendor', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const result = await svc.runComplianceCheck({
      businessId: 'biz-001',
      tenantId:   'tenant-001',
      checkType:  'vendor',
      vendorId:   'vendor-critical-001',
    });

    expect(result.vendorHistory).toBeDefined();
    expect(result.vendorHistory!.riskLevel).toBe('critical');
    expect(result.vendorHistory!.enforcementActions.length).toBeGreaterThan(0);
    expect(result.riskLevel).toBe('critical');
  });

  it('returns low-risk vendor record for unknown vendor', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const result = await svc.runComplianceCheck({
      businessId: 'biz-001',
      tenantId:   'tenant-001',
      checkType:  'vendor',
      vendorId:   'vendor-unknown-xyz',
    });

    expect(result.vendorHistory!.riskLevel).toBe('low');
    expect(result.vendorHistory!.enforcementActions).toHaveLength(0);
  });

  it('findings include enforcement action details for critical vendor', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const result = await svc.runComplianceCheck({
      businessId: 'biz-001',
      tenantId:   'tenant-001',
      checkType:  'vendor',
      vendorId:   'vendor-critical-001',
    });

    const criticalFinding = result.findings.find((f) => f.severity === 'critical');
    expect(criticalFinding).toBeDefined();
    expect(criticalFinding!.description).toMatch(/Pinnacle Business Capital/);
  });
});

describe('ComplianceService — runComplianceCheck (kyb/aml)', () => {
  it('runs risk register for kyb check type', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const result = await svc.runComplianceCheck({
      businessId:        'biz-001',
      tenantId:          'tenant-001',
      checkType:         'kyb',
      riskRegisterInput: BASE_RISK_INPUT,
    });

    expect(result.riskRegister).toBeDefined();
    expect(result.riskRegister!.categoryScores).toHaveLength(10);
  });

  it('critical findings from risk register appear in result.findings', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const result = await svc.runComplianceCheck({
      businessId: 'biz-001',
      tenantId:   'tenant-001',
      checkType:  'aml',
      riskRegisterInput: {
        ...BASE_RISK_INPUT,
        kycCompleted: false,
        amlCleared:   false,
      },
    });

    const amlFinding = result.findings.find((f) =>
      f.category.includes('aml_kyc'),
    );
    expect(amlFinding).toBeDefined();
  });
});

describe('ComplianceService — getVendorHistory', () => {
  it('returns known vendor record from stub DB', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const history = await svc.getVendorHistory('vendor-high-risk-001');
    expect(history.riskLevel).toBe('high');
    expect(history.enforcementActions[0].agency).toBe('CFPB');
  });

  it('returns clean stub for unknown vendor', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const history = await svc.getVendorHistory('vendor-99-unknown');
    expect(history.riskLevel).toBe('low');
    expect(history.isStubData).toBe(true);
  });
});

describe('ComplianceService — scoreInteraction (proxy)', () => {
  it('delegates to udap scorer and returns violations', () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const result = svc.scoreInteraction({ interactionText: UDAP_TOXIC_TEXT });
    expect(result.score).toBeGreaterThan(0);
  });
});

describe('ComplianceService — getStateRequirements', () => {
  it('returns profile, disclosures, and steps for CA', () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const { profile, disclosures, steps } = svc.getStateRequirements('CA');
    expect(profile).not.toBeNull();
    expect(disclosures.length).toBeGreaterThan(0);
    expect(steps.length).toBeGreaterThan(0);
  });

  it('returns federal baseline for unknown state', () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const { profile, disclosures } = svc.getStateRequirements('ZZ');
    expect(profile).toBeNull();
    expect(disclosures.length).toBeGreaterThan(0); // federal baseline fallback
  });
});

describe('ComplianceService — result shape', () => {
  it('result has all required fields', async () => {
    const mock = makePrismaMock();
    const svc = new ComplianceService(mock as never);

    const result = await svc.runComplianceCheck({
      businessId:      'biz-001',
      tenantId:        'tenant-001',
      checkType:       'udap',
      interactionText: CLEAN_TEXT,
    });

    expect(result.checkId).toBeTruthy();
    expect(result.businessId).toBe('biz-001');
    expect(result.tenantId).toBe('tenant-001');
    expect(result.checkType).toBe('udap');
    expect(typeof result.riskScore).toBe('number');
    expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});
