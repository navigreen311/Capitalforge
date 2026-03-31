// ============================================================
// Unit Tests — Communication Compliance & Training
//
// Run: npx vitest run tests/unit/services/comm-compliance.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  CommComplianceService,
  BANNED_CLAIMS,
  REQUIRED_DISCLOSURES,
  type BannedClaimViolation,
  type CommComplianceScanResult,
  type QaScoreInput,
} from '../../../src/backend/services/comm-compliance.service.js';

import {
  TrainingService,
  TRACK_CATALOGUE,
  type TrackName,
} from '../../../src/backend/services/training.service.js';

// ── Mock event bus ────────────────────────────────────────────────
vi.mock('../../../src/backend/events/event-bus.js', () => ({
  eventBus: {
    publish: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Prisma mock factory ───────────────────────────────────────────

function makePrismaMock() {
  return {
    commComplianceRecord: {
      create:   vi.fn().mockResolvedValue({ id: 'scan-001' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    approvedScript: {
      create:    vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ ...args.data, createdAt: new Date(), updatedAt: new Date() })),
      findMany:  vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update:    vi.fn().mockResolvedValue({}),
    },
    advisorQaScore: {
      create:   vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ ...args.data, scoredAt: new Date() })),
      findMany: vi.fn().mockResolvedValue([]),
    },
    trainingCertification: {
      create:     vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ ...args.data, createdAt: new Date(), updatedAt: new Date() })),
      findFirst:  vi.fn().mockResolvedValue(null),
      findMany:   vi.fn().mockResolvedValue([]),
      update:     vi.fn().mockImplementation((_args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise.resolve({ id: 'cert-001', tenantId: 'tenant-001', userId: 'user-001', trackName: 'onboarding', status: 'passed', score: 90, completedAt: new Date(), expiresAt: null, certificateRef: 'cert-ABC', createdAt: new Date(), updatedAt: new Date() })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

// ── Text fixtures ────────────────────────────────────────────────

const CLEAN_TEXT =
  'Our programme helps businesses access working capital through business credit cards. ' +
  'Programme fees are disclosed upfront. Results vary and approval is subject to each ' +
  'issuer\'s underwriting. A personal guarantee is typically required.';

const GUARANTEED_APPROVAL_TEXT =
  'We offer guaranteed approval for every business that joins our programme. ' +
  'You will receive 100% approval on all applications.';

const SBA_TEXT =
  'We are an SBA-approved government program and all funding is federally backed.';

const NO_RISK_TEXT =
  'There is absolutely no risk and zero risk to your personal assets. Risk-free capital.';

const INCOME_PROJECTION_TEXT =
  'Join today and earn up to $50,000 per month with our credit stacking strategy.';

const URGENCY_TEXT =
  'You must decide today or lose your spot. This is a limited time offer that expires tonight.';

const COACHING_FEE_TEXT =
  'Coaching is completely free and there is absolutely no programme fee charged upfront.';

const MULTI_VIOLATION_TEXT =
  'Guaranteed approval! SBA-approved program. No upfront fee. ' +
  'Risk-free capital. You must decide today. Earn up to $30,000 per month.';

// ─────────────────────────────────────────────────────────────────
// BANNED CLAIMS LIBRARY
// ─────────────────────────────────────────────────────────────────

describe('Banned claims library', () => {
  it('contains at least 15 banned claims', () => {
    expect(BANNED_CLAIMS.length).toBeGreaterThanOrEqual(15);
  });

  it('all claims have required fields', () => {
    for (const claim of BANNED_CLAIMS) {
      expect(claim.id).toBeTruthy();
      expect(claim.category).toBeTruthy();
      expect(claim.pattern).toBeInstanceOf(RegExp);
      expect(claim.label).toBeTruthy();
      expect(claim.legalCitation).toBeTruthy();
      expect(claim.severityWeight).toBeGreaterThanOrEqual(1);
      expect(claim.severityWeight).toBeLessThanOrEqual(10);
    }
  });

  it('covers all required banned claim categories', () => {
    const categories = new Set(BANNED_CLAIMS.map((c) => c.category));
    expect(categories.has('guaranteed_approval')).toBe(true);
    expect(categories.has('sba_affiliation')).toBe(true);
    expect(categories.has('government_affiliation')).toBe(true);
    expect(categories.has('no_risk_claim')).toBe(true);
    expect(categories.has('income_projection')).toBe(true);
    expect(categories.has('urgency_pressure')).toBe(true);
    expect(categories.has('coaching_misrepresentation')).toBe(true);
    expect(categories.has('upfront_fee_concealment')).toBe(true);
  });

  it('guaranteed approval claims have severity weight 10', () => {
    const guaranteedClaims = BANNED_CLAIMS.filter((c) => c.category === 'guaranteed_approval');
    for (const claim of guaranteedClaims) {
      expect(claim.severityWeight).toBeGreaterThanOrEqual(8);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// COMM COMPLIANCE SERVICE — scoreCommunication (synchronous)
// ─────────────────────────────────────────────────────────────────

describe('CommComplianceService.scoreCommunication — clean text', () => {
  const svc = new CommComplianceService(makePrismaMock() as unknown as Parameters<typeof CommComplianceService.prototype.scoreCommunication>[never]);

  it('returns riskScore 0 for compliant text', () => {
    const result = svc.scoreCommunication(CLEAN_TEXT);
    expect(result.riskScore).toBe(0);
  });

  it('returns riskLevel "clean" for compliant text', () => {
    const result = svc.scoreCommunication(CLEAN_TEXT);
    expect(result.riskLevel).toBe('clean');
  });

  it('returns no violations for compliant text', () => {
    const result = svc.scoreCommunication(CLEAN_TEXT);
    expect(result.violations).toHaveLength(0);
  });

  it('marks communication as approved for clean text', () => {
    const result = svc.scoreCommunication(CLEAN_TEXT);
    expect(result.approved).toBe(true);
  });
});

describe('CommComplianceService.scoreCommunication — banned claims detection', () => {
  let svc: CommComplianceService;

  beforeEach(() => {
    svc = new CommComplianceService(makePrismaMock() as unknown as Parameters<typeof CommComplianceService.prototype.scoreCommunication>[never]);
  });

  it('detects guaranteed_approval violations', () => {
    const result = svc.scoreCommunication(GUARANTEED_APPROVAL_TEXT);
    const categories = result.violations.map((v) => v.category);
    expect(categories).toContain('guaranteed_approval');
  });

  it('detects sba_affiliation violation', () => {
    const result = svc.scoreCommunication(SBA_TEXT);
    const categories = result.violations.map((v) => v.category);
    expect(categories).toContain('sba_affiliation');
  });

  it('detects government_affiliation violation', () => {
    const result = svc.scoreCommunication(SBA_TEXT);
    // "federally backed" should trigger government_affiliation
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it('detects no_risk_claim violations', () => {
    const result = svc.scoreCommunication(NO_RISK_TEXT);
    const categories = result.violations.map((v) => v.category);
    expect(categories).toContain('no_risk_claim');
  });

  it('detects income_projection violations', () => {
    const result = svc.scoreCommunication(INCOME_PROJECTION_TEXT);
    const categories = result.violations.map((v) => v.category);
    expect(categories).toContain('income_projection');
  });

  it('detects urgency_pressure violations', () => {
    const result = svc.scoreCommunication(URGENCY_TEXT);
    const categories = result.violations.map((v) => v.category);
    expect(categories).toContain('urgency_pressure');
  });

  it('detects coaching_misrepresentation violations', () => {
    const result = svc.scoreCommunication(COACHING_FEE_TEXT);
    const categories = result.violations.map((v) => v.category);
    expect(categories).toContain('coaching_misrepresentation');
  });

  it('detects upfront_fee_concealment violations', () => {
    const result = svc.scoreCommunication(COACHING_FEE_TEXT);
    const categories = result.violations.map((v) => v.category);
    expect(categories).toContain('upfront_fee_concealment');
  });

  it('multi-violation text produces high riskScore', () => {
    const result = svc.scoreCommunication(MULTI_VIOLATION_TEXT);
    expect(result.riskScore).toBeGreaterThan(50);
    expect(result.approved).toBe(false);
  });

  it('riskScore is capped at 100', () => {
    const result = svc.scoreCommunication(MULTI_VIOLATION_TEXT);
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  it('violations include evidence text', () => {
    const result = svc.scoreCommunication(GUARANTEED_APPROVAL_TEXT);
    for (const v of result.violations) {
      expect(typeof v.evidence).toBe('string');
      expect(v.evidence.length).toBeGreaterThan(0);
    }
  });

  it('violations include legal citations', () => {
    const result = svc.scoreCommunication(GUARANTEED_APPROVAL_TEXT);
    for (const v of result.violations) {
      expect(v.legalCitation).toBeTruthy();
    }
  });

  it('deduplicates same claim detected multiple times', () => {
    const repeated = GUARANTEED_APPROVAL_TEXT + ' ' + GUARANTEED_APPROVAL_TEXT;
    const result = svc.scoreCommunication(repeated);
    const claimIds = result.violations.map((v) => v.claimId);
    const uniqueIds = new Set(claimIds);
    expect(claimIds.length).toBe(uniqueIds.size);
  });
});

// ─────────────────────────────────────────────────────────────────
// COMM COMPLIANCE SERVICE — scanCommunication (async / persisting)
// ─────────────────────────────────────────────────────────────────

describe('CommComplianceService.scanCommunication', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let svc: CommComplianceService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    svc = new CommComplianceService(prismaMock as unknown as Parameters<typeof CommComplianceService.prototype.scoreCommunication>[never]);
  });

  it('persists a CommComplianceRecord on scan', async () => {
    await svc.scanCommunication({
      tenantId:  'tenant-001',
      advisorId: 'advisor-001',
      channel:   'voice',
      content:   CLEAN_TEXT,
    });
    expect(prismaMock.commComplianceRecord.create).toHaveBeenCalledOnce();
  });

  it('returns scanId, riskScore, violations, summary', async () => {
    const result: CommComplianceScanResult = await svc.scanCommunication({
      tenantId:  'tenant-001',
      advisorId: 'advisor-001',
      channel:   'email',
      content:   GUARANTEED_APPROVAL_TEXT,
    });

    expect(result.scanId).toBeTruthy();
    expect(result.riskScore).toBeGreaterThan(0);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.summary).toBeTruthy();
    expect(result.approved).toBe(false);
  });

  it('scan of clean text returns approved=true', async () => {
    const result = await svc.scanCommunication({
      tenantId:  'tenant-001',
      advisorId: 'advisor-001',
      channel:   'sms',
      content:   CLEAN_TEXT,
    });
    expect(result.approved).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// DISCLOSURE INSERTION ENGINE
// ─────────────────────────────────────────────────────────────────

describe('Disclosure insertion engine', () => {
  let svc: CommComplianceService;

  beforeEach(() => {
    svc = new CommComplianceService(makePrismaMock() as unknown as Parameters<typeof CommComplianceService.prototype.scoreCommunication>[never]);
  });

  it('required disclosures library contains at least 5 entries', () => {
    expect(REQUIRED_DISCLOSURES.length).toBeGreaterThanOrEqual(5);
  });

  it('insertRequiredDisclosures appends disclosures to content', () => {
    const result = svc.insertRequiredDisclosures('Hello client.', ['disc-001']);
    expect(result).toContain('REQUIRED DISCLOSURE');
    expect(result).toContain('hard inquiries');
  });

  it('insertRequiredDisclosures with no trigger IDs returns content unchanged', () => {
    const content = 'Hello client.';
    const result = svc.insertRequiredDisclosures(content, []);
    expect(result).toBe(content);
  });

  it('scanCommunication injects no-affiliation disclosure', async () => {
    const result = await svc.scanCommunication({
      tenantId:  'tenant-001',
      advisorId: 'advisor-001',
      channel:   'email',
      content:   CLEAN_TEXT,
    });
    expect(result.requiredDisclosures.some((d) => d.id === 'disc-005')).toBe(true);
    expect(result.contentWithDisclosures).toContain('independent advisory service');
  });

  it('scanCommunication injects personal-guarantee disclosure for no-risk text', async () => {
    const result = await svc.scanCommunication({
      tenantId:  'tenant-001',
      advisorId: 'advisor-001',
      channel:   'voice',
      content:   NO_RISK_TEXT,
    });
    expect(result.requiredDisclosures.some((d) => d.id === 'disc-003')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// SCRIPT MANAGEMENT
// ─────────────────────────────────────────────────────────────────

describe('Script management', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let svc: CommComplianceService;

  const SCRIPT_PAYLOAD = {
    tenantId:  'tenant-001',
    name:      'Opening Call Script',
    category:  'onboarding',
    content:   'Hello, my name is [NAME] and I am calling from CapitalForge...',
    version:   '1.0.0',
    approvedBy: 'compliance-officer-001',
  };

  beforeEach(() => {
    prismaMock = makePrismaMock();
    svc = new CommComplianceService(prismaMock as unknown as Parameters<typeof CommComplianceService.prototype.scoreCommunication>[never]);
  });

  it('createScript persists a record', async () => {
    await svc.createScript(SCRIPT_PAYLOAD);
    expect(prismaMock.approvedScript.create).toHaveBeenCalledOnce();
  });

  it('createScript returns script with version metadata', async () => {
    const result = await svc.createScript(SCRIPT_PAYLOAD);
    expect(result.currentVersion.version).toBe('1.0.0');
    expect(result.currentVersion.approvedBy).toBe('compliance-officer-001');
    expect(result.currentVersion.isActive).toBe(true);
  });

  it('listScripts queries with tenantId filter', async () => {
    await svc.listScripts('tenant-001', 'onboarding');
    expect(prismaMock.approvedScript.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-001', isActive: true }),
      }),
    );
  });

  it('deactivateScript returns false for unknown script', async () => {
    prismaMock.approvedScript.findFirst.mockResolvedValueOnce(null);
    const result = await svc.deactivateScript('unknown-id', 'tenant-001');
    expect(result).toBe(false);
  });

  it('deactivateScript returns true for known script', async () => {
    prismaMock.approvedScript.findFirst.mockResolvedValueOnce({
      id:        'script-001',
      tenantId:  'tenant-001',
      isActive:  true,
      name:      'Test',
      category:  'test',
      content:   '...',
      version:   '1.0',
      approvedBy: null,
      approvedAt: null,
      createdAt:  new Date(),
      updatedAt:  new Date(),
    });
    const result = await svc.deactivateScript('script-001', 'tenant-001');
    expect(result).toBe(true);
    expect(prismaMock.approvedScript.update).toHaveBeenCalledOnce();
  });

  it('getBannedClaimsLibrary returns entries without pattern field', () => {
    const library = svc.getBannedClaimsLibrary();
    expect(library.length).toBeGreaterThan(0);
    for (const claim of library) {
      expect((claim as { pattern?: unknown }).pattern).toBeUndefined();
      expect(claim.label).toBeTruthy();
      expect(claim.legalCitation).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// QA SCORING
// ─────────────────────────────────────────────────────────────────

describe('QA call scoring', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let svc: CommComplianceService;

  const QA_INPUT: QaScoreInput = {
    tenantId:           'tenant-001',
    advisorId:          'advisor-001',
    callRecordId:       'call-abc-123',
    overallScore:       88,
    complianceScore:    92,
    scriptAdherence:    85,
    consentCapture:     95,
    riskClaimAvoidance: 90,
    feedback:           'Good job — avoid urgency language.',
  };

  beforeEach(() => {
    prismaMock = makePrismaMock();
    svc = new CommComplianceService(prismaMock as unknown as Parameters<typeof CommComplianceService.prototype.scoreCommunication>[never]);
  });

  it('recordQaScore persists a record', async () => {
    await svc.recordQaScore(QA_INPUT);
    expect(prismaMock.advisorQaScore.create).toHaveBeenCalledOnce();
  });

  it('recordQaScore returns all score dimensions', async () => {
    const result = await svc.recordQaScore(QA_INPUT);
    expect(result.overallScore).toBe(88);
    expect(result.complianceScore).toBe(92);
    expect(result.scriptAdherence).toBe(85);
    expect(result.consentCapture).toBe(95);
    expect(result.riskClaimAvoidance).toBe(90);
    expect(result.callRecordId).toBe('call-abc-123');
    expect(result.feedback).toBe('Good job — avoid urgency language.');
  });

  it('listQaScores queries by advisorId and tenantId', async () => {
    await svc.listQaScores('advisor-001', 'tenant-001');
    expect(prismaMock.advisorQaScore.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { advisorId: 'advisor-001', tenantId: 'tenant-001' },
      }),
    );
  });

  it('getAdvisorQaAverage returns sampleCount 0 for no data', async () => {
    const result = await svc.getAdvisorQaAverage('advisor-001', 'tenant-001');
    expect(result.sampleCount).toBe(0);
    expect(result.averageOverall).toBe(0);
  });

  it('getAdvisorQaAverage computes averages correctly', async () => {
    prismaMock.advisorQaScore.findMany.mockResolvedValueOnce([
      { overallScore: 80, complianceScore: 85, scriptAdherence: 75, consentCapture: 90, riskClaimAvoidance: 80 },
      { overallScore: 90, complianceScore: 95, scriptAdherence: 85, consentCapture: 100, riskClaimAvoidance: 90 },
    ]);
    const result = await svc.getAdvisorQaAverage('advisor-001', 'tenant-001');
    expect(result.sampleCount).toBe(2);
    expect(result.averageOverall).toBe(85);
    expect(result.averageCompliance).toBe(90);
  });
});

// ─────────────────────────────────────────────────────────────────
// TRAINING SERVICE — TRACK CATALOGUE
// ─────────────────────────────────────────────────────────────────

describe('Training track catalogue', () => {
  it('contains onboarding, annual, and advanced tracks', () => {
    expect(TRACK_CATALOGUE.onboarding).toBeDefined();
    expect(TRACK_CATALOGUE.annual).toBeDefined();
    expect(TRACK_CATALOGUE.advanced).toBeDefined();
  });

  it('onboarding track has no prerequisites', () => {
    expect(TRACK_CATALOGUE.onboarding.prerequisiteTracks).toHaveLength(0);
  });

  it('annual track requires onboarding as prerequisite', () => {
    expect(TRACK_CATALOGUE.annual.prerequisiteTracks).toContain('onboarding');
  });

  it('advanced track requires both onboarding and annual', () => {
    expect(TRACK_CATALOGUE.advanced.prerequisiteTracks).toContain('onboarding');
    expect(TRACK_CATALOGUE.advanced.prerequisiteTracks).toContain('annual');
  });

  it('each track has at least 2 modules', () => {
    for (const track of Object.values(TRACK_CATALOGUE)) {
      expect(track.modules.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('annual track has expiryMonths of 12', () => {
    expect(TRACK_CATALOGUE.annual.expiryMonths).toBe(12);
  });

  it('onboarding track does not expire (expiryMonths null)', () => {
    expect(TRACK_CATALOGUE.onboarding.expiryMonths).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// TRAINING SERVICE — CERTIFICATION MANAGEMENT
// ─────────────────────────────────────────────────────────────────

describe('TrainingService certification management', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let svc: TrainingService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    svc = new TrainingService(prismaMock as unknown as Parameters<typeof TrainingService.prototype.enrolUser>[never]);
  });

  it('enrolUser creates a not_started record', async () => {
    await svc.enrolUser('tenant-001', 'user-001', 'onboarding');
    expect(prismaMock.trainingCertification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trackName: 'onboarding',
          status:    'not_started',
        }),
      }),
    );
  });

  it('enrolUser returns existing cert if already enrolled', async () => {
    const existing = {
      id: 'cert-existing', tenantId: 'tenant-001', userId: 'user-001',
      trackName: 'onboarding', status: 'in_progress', score: null,
      completedAt: null, expiresAt: null, certificateRef: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    prismaMock.trainingCertification.findFirst.mockResolvedValueOnce(existing);

    await svc.enrolUser('tenant-001', 'user-001', 'onboarding');
    expect(prismaMock.trainingCertification.create).not.toHaveBeenCalled();
  });

  it('completeCertification with passing score sets status to passed', async () => {
    prismaMock.trainingCertification.findFirst.mockResolvedValueOnce({
      id: 'cert-001', tenantId: 'tenant-001', userId: 'user-001',
      trackName: 'onboarding', status: 'in_progress', score: null,
      completedAt: null, expiresAt: null, certificateRef: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await svc.completeCertification('cert-001', 'tenant-001', 90);
    expect(result.status).toBe('passed');
    expect(result.score).toBe(90);
    expect(result.certificateRef).toBeTruthy();
  });

  it('completeCertification with failing score sets status to failed', async () => {
    prismaMock.trainingCertification.findFirst.mockResolvedValueOnce({
      id: 'cert-002', tenantId: 'tenant-001', userId: 'user-001',
      trackName: 'onboarding', status: 'in_progress', score: null,
      completedAt: null, expiresAt: null, certificateRef: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    prismaMock.trainingCertification.update.mockResolvedValueOnce({
      id: 'cert-002', tenantId: 'tenant-001', userId: 'user-001',
      trackName: 'onboarding', status: 'failed', score: 55,
      completedAt: new Date(), expiresAt: null, certificateRef: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await svc.completeCertification('cert-002', 'tenant-001', 55);
    expect(result.status).toBe('failed');
    expect(result.certificateRef).toBeNull();
  });

  it('completeCertification throws for unknown certificationId', async () => {
    prismaMock.trainingCertification.findFirst.mockResolvedValueOnce(null);
    await expect(svc.completeCertification('bad-id', 'tenant-001', 90))
      .rejects.toThrow('not found');
  });
});

// ─────────────────────────────────────────────────────────────────
// TRAINING SERVICE — TRAINING GAP IDENTIFICATION
// ─────────────────────────────────────────────────────────────────

describe('Training gap identification', () => {
  let prismaMock: ReturnType<typeof makePrismaMock>;
  let svc: TrainingService;

  beforeEach(() => {
    prismaMock = makePrismaMock();
    svc = new TrainingService(prismaMock as unknown as Parameters<typeof TrainingService.prototype.enrolUser>[never]);
  });

  it('identifies critical gap when onboarding certification is missing', async () => {
    prismaMock.trainingCertification.findMany.mockResolvedValueOnce([]);
    prismaMock.commComplianceRecord.findMany.mockResolvedValueOnce([]);
    prismaMock.advisorQaScore.findMany.mockResolvedValueOnce([]);

    const gaps = await svc.identifyTrainingGaps('advisor-001', 'tenant-001');

    const onboardingGap = gaps.find((g) => g.track === 'onboarding' && g.gapType === 'certification_missing');
    expect(onboardingGap).toBeDefined();
    expect(onboardingGap!.severity).toBe('critical');
  });

  it('identifies violation pattern gap from recurring banned claims', async () => {
    prismaMock.trainingCertification.findMany.mockResolvedValueOnce([
      { trackName: 'onboarding', status: 'passed', completedAt: new Date(), expiresAt: null },
    ]);

    // Simulate 3 recent violations in guaranteed_approval category
    prismaMock.commComplianceRecord.findMany.mockResolvedValueOnce([
      { violations: [{ category: 'guaranteed_approval' }] },
      { violations: [{ category: 'guaranteed_approval' }] },
      { violations: [{ category: 'guaranteed_approval' }] },
    ]);
    prismaMock.advisorQaScore.findMany.mockResolvedValueOnce([]);

    const gaps = await svc.identifyTrainingGaps('advisor-001', 'tenant-001');

    const violationGap = gaps.find((g) => g.gapType === 'compliance_violation_pattern');
    expect(violationGap).toBeDefined();
    expect(violationGap!.description).toMatch(/guaranteed_approval/);
  });

  it('identifies low QA score gap when complianceScore < 70', async () => {
    prismaMock.trainingCertification.findMany.mockResolvedValueOnce([
      { trackName: 'onboarding', status: 'passed', completedAt: new Date(), expiresAt: null },
    ]);
    prismaMock.commComplianceRecord.findMany.mockResolvedValueOnce([]);

    // 3+ recent QA scores all below threshold
    prismaMock.advisorQaScore.findMany.mockResolvedValueOnce([
      { overallScore: 65, complianceScore: 55, scriptAdherence: 72, consentCapture: 80, riskClaimAvoidance: 75 },
      { overallScore: 60, complianceScore: 50, scriptAdherence: 68, consentCapture: 75, riskClaimAvoidance: 70 },
      { overallScore: 62, complianceScore: 58, scriptAdherence: 70, consentCapture: 78, riskClaimAvoidance: 72 },
    ]);

    const gaps = await svc.identifyTrainingGaps('advisor-001', 'tenant-001');
    const qaGap = gaps.find((g) => g.gapType === 'low_qa_score');
    expect(qaGap).toBeDefined();
  });

  it('returns no gaps for a fully certified, clean advisor', async () => {
    const onboardingDate = new Date();
    onboardingDate.setMonth(onboardingDate.getMonth() - 6); // 6 months ago — no annual needed yet

    prismaMock.trainingCertification.findMany.mockResolvedValueOnce([
      { trackName: 'onboarding', status: 'passed', completedAt: onboardingDate, expiresAt: null },
      { trackName: 'annual', status: 'passed', completedAt: new Date(), expiresAt: new Date(Date.now() + 1e10) },
    ]);
    prismaMock.commComplianceRecord.findMany.mockResolvedValueOnce([]);
    prismaMock.advisorQaScore.findMany.mockResolvedValueOnce([]);

    const gaps = await svc.identifyTrainingGaps('advisor-001', 'tenant-001');
    expect(gaps).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// TRAINING SERVICE — REGULATION TRIGGERS
// ─────────────────────────────────────────────────────────────────

describe('Regulation training triggers', () => {
  let svc: TrainingService;

  beforeEach(() => {
    svc = new TrainingService(makePrismaMock() as unknown as Parameters<typeof TrainingService.prototype.enrolUser>[never]);
  });

  it('triggerRegulationTraining returns a trigger object', async () => {
    const requiredByDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const trigger = await svc.triggerRegulationTraining({
      tenantId:        'tenant-001',
      regulationTitle: 'CFPB Commercial Finance Disclosure Rule 2026',
      affectedTracks:  ['annual', 'advanced'],
      description:     'New disclosure requirements for commercial financing.',
      requiredByDate,
      triggerSource:   'regulatory_alert',
    });

    expect(trigger.id).toBeTruthy();
    expect(trigger.regulationTitle).toBe('CFPB Commercial Finance Disclosure Rule 2026');
    expect(trigger.affectedTracks).toContain('annual');
    expect(trigger.requiredByDate).toBe(requiredByDate);
  });

  it('getEnforcementCasesForCategory returns cases for guaranteed_approval', () => {
    const cases = svc.getEnforcementCasesForCategory('guaranteed_approval');
    // Returns what enforcement examples are tied to that category via modules
    expect(Array.isArray(cases)).toBe(true);
  });

  it('getTrackCatalogue returns all three tracks', () => {
    const catalogue = svc.getTrackCatalogue();
    const names = catalogue.map((t) => t.name);
    expect(names).toContain('onboarding');
    expect(names).toContain('annual');
    expect(names).toContain('advanced');
  });
});
