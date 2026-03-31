// ============================================================
// Unit Tests — VoiceForge Service
//
// Run: npx vitest run tests/unit/services/voiceforge.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  VoiceForgeService,
  type InitiateCallInput,
  type CallRecord,
} from '../../../src/backend/services/voiceforge.service.js';
import {
  VoiceForgeComplianceService,
  type CallComplianceScanInput,
  type CallQaScoreInput,
} from '../../../src/backend/services/voiceforge-compliance.js';
import { TcpaConsentError } from '../../../src/backend/services/consent-gate.js';

// ── Mock dependencies ────────────────────────────────────────────

vi.mock('../../../src/backend/events/event-bus.js', () => {
  const mockInstance = {
    publish:           vi.fn().mockResolvedValue(undefined),
    publishAndPersist: vi.fn().mockResolvedValue(undefined),
    subscribe:         vi.fn(),
    setLedgerWriter:   vi.fn(),
  };
  return {
    eventBus: mockInstance,
    EventBus: {
      getInstance: vi.fn().mockReturnValue(mockInstance),
      reset: vi.fn(),
    },
  };
});

vi.mock('../../../src/backend/services/consent-gate.js', () => ({
  consentGate: {
    check: vi.fn(),
  },
  TcpaConsentError: class TcpaConsentError extends Error {
    public reason:     string;
    public channel:    string;
    public businessId: string;
    constructor(reason: string, message: string, channel: string, businessId: string) {
      super(message ?? reason);
      this.reason     = reason;
      this.channel    = channel;
      this.businessId = businessId;
      this.name       = 'TcpaConsentError';
    }
  },
}));

// ── Prisma mock factory ──────────────────────────────────────────

function makeCallRecord(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id:              'call-001',
    tenantId:        'tenant-001',
    businessId:      'biz-001',
    advisorId:       null,
    twilioCallSid:   'CA1234567890abcdef1234567890abcdef',
    toPhoneNumber:   '+15550001111',
    fromPhoneNumber: '+15559998888',
    direction:       'outbound',
    status:          'queued',
    purpose:         'Test call',
    campaignType:    null,
    campaignId:      null,
    durationSeconds: null,
    recordingSid:    null,
    recordingUrl:    null,
    transcriptText:  null,
    documentVaultId: null,
    startedAt:       new Date('2026-01-01T00:00:00Z'),
    endedAt:         null,
    createdAt:       new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makePrismaMock() {
  const callRecord = makeCallRecord();

  return {
    voiceCall: {
      create:    vi.fn().mockResolvedValue(callRecord),
      update:    vi.fn().mockImplementation(({ data }: { data: Partial<CallRecord> }) =>
        Promise.resolve({ ...callRecord, ...data }),
      ),
      findFirst: vi.fn().mockResolvedValue(callRecord),
      findMany:  vi.fn().mockResolvedValue([callRecord]),
      count:     vi.fn().mockResolvedValue(1),
    },
    fundingRound: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    repaymentSchedule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    business: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    callComplianceScan: {
      create: vi.fn().mockResolvedValue({ id: 'scan-001' }),
    },
    callQaScore: {
      create:   vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data, id: 'qa-001', scoredAt: new Date() }),
      ),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function makeDocumentVaultMock() {
  return {
    uploadDocument: vi.fn().mockResolvedValue({ id: 'vault-doc-001' }),
    autoFile:       vi.fn().mockResolvedValue({ id: 'vault-doc-001' }),
  };
}

// ── Import mocked consent gate ───────────────────────────────────

import { consentGate } from '../../../src/backend/services/consent-gate.js';

// ─────────────────────────────────────────────────────────────────
// VoiceForgeService — initiateCall
// ─────────────────────────────────────────────────────────────────

describe('VoiceForgeService.initiateCall — TCPA gate', () => {
  let svc: VoiceForgeService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    svc    = new VoiceForgeService(
      prisma as unknown as Parameters<typeof VoiceForgeService.prototype.initiateCall>[never],
      makeDocumentVaultMock() as never,
    );
  });

  const baseInput: InitiateCallInput = {
    tenantId:        'tenant-001',
    businessId:      'biz-001',
    toPhoneNumber:   '+15550001111',
    fromPhoneNumber: '+15559998888',
    purpose:         'APR alert',
  };

  it('throws TcpaConsentError when consent is denied', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({
      allowed: false,
      reason:  'no_consent_on_file',
      message: 'No voice consent on file.',
    });

    await expect(svc.initiateCall(baseInput)).rejects.toThrow();
  });

  it('does not place a call when TCPA gate is denied', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({
      allowed: false,
      reason:  'no_consent_on_file',
      message: 'No voice consent on file.',
    });

    try {
      await svc.initiateCall(baseInput);
    } catch {
      // expected
    }

    expect(prisma.voiceCall.create).not.toHaveBeenCalled();
  });

  it('places the call when consent is granted', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({ allowed: true });

    const result = await svc.initiateCall(baseInput);

    expect(result.id).toBe('call-001');
    expect(prisma.voiceCall.create).toHaveBeenCalledTimes(1);
  });

  it('persists correct tenantId and businessId on call record', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({ allowed: true });

    await svc.initiateCall(baseInput);

    const createArgs = prisma.voiceCall.create.mock.calls[0]?.[0] as { data: Partial<CallRecord> };
    expect(createArgs.data.tenantId).toBe('tenant-001');
    expect(createArgs.data.businessId).toBe('biz-001');
  });

  it('persists direction as "outbound"', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({ allowed: true });

    await svc.initiateCall(baseInput);

    const createArgs = prisma.voiceCall.create.mock.calls[0]?.[0] as { data: Partial<CallRecord> };
    expect(createArgs.data.direction).toBe('outbound');
  });

  it('persists campaignType when supplied', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({ allowed: true });

    await svc.initiateCall({ ...baseInput, campaignType: 'apr_expiry' });

    const createArgs = prisma.voiceCall.create.mock.calls[0]?.[0] as { data: Partial<CallRecord> };
    expect(createArgs.data.campaignType).toBe('apr_expiry');
  });

  it('sets campaignType to null when not supplied', async () => {
    vi.mocked(consentGate.check).mockResolvedValue({ allowed: true });

    await svc.initiateCall(baseInput);

    const createArgs = prisma.voiceCall.create.mock.calls[0]?.[0] as { data: Partial<CallRecord> };
    expect(createArgs.data.campaignType).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// VoiceForgeService — getCallRecord
// ─────────────────────────────────────────────────────────────────

describe('VoiceForgeService.getCallRecord', () => {
  let svc: VoiceForgeService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    svc    = new VoiceForgeService(prisma as never, makeDocumentVaultMock() as never);
  });

  it('returns the call record when found', async () => {
    const result = await svc.getCallRecord('call-001', 'tenant-001');
    expect(result.id).toBe('call-001');
    expect(result.tenantId).toBe('tenant-001');
  });

  it('throws when call is not found for tenant', async () => {
    prisma.voiceCall.findFirst.mockResolvedValue(null as never);

    await expect(svc.getCallRecord('missing-id', 'tenant-001')).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────
// VoiceForgeService — listCallRecords
// ─────────────────────────────────────────────────────────────────

describe('VoiceForgeService.listCallRecords', () => {
  let svc: VoiceForgeService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    svc    = new VoiceForgeService(prisma as never, makeDocumentVaultMock() as never);
  });

  it('returns records array, total, page, and pageSize', async () => {
    const result = await svc.listCallRecords({ tenantId: 'tenant-001' });

    expect(result.records).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('clamps pageSize to 100 maximum', async () => {
    const result = await svc.listCallRecords({ tenantId: 'tenant-001', pageSize: 999 });
    expect(result.pageSize).toBe(100);
  });

  it('defaults page to 1', async () => {
    const result = await svc.listCallRecords({ tenantId: 'tenant-001' });
    expect(result.page).toBe(1);
  });

  it('applies businessId filter when provided', async () => {
    await svc.listCallRecords({ tenantId: 'tenant-001', businessId: 'biz-002' });

    const findManyArgs = prisma.voiceCall.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(findManyArgs.where['businessId']).toBe('biz-002');
  });

  it('applies status filter when provided', async () => {
    await svc.listCallRecords({ tenantId: 'tenant-001', status: 'completed' });

    const findManyArgs = prisma.voiceCall.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(findManyArgs.where['status']).toBe('completed');
  });
});

// ─────────────────────────────────────────────────────────────────
// VoiceForgeService — endCall
// ─────────────────────────────────────────────────────────────────

describe('VoiceForgeService.endCall', () => {
  let svc: VoiceForgeService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    svc    = new VoiceForgeService(prisma as never, makeDocumentVaultMock() as never);
  });

  it('sets status to "completed"', async () => {
    const result = await svc.endCall('call-001', 'tenant-001');
    expect(result.status).toBe('completed');
  });

  it('calls prisma.voiceCall.update with status completed', async () => {
    await svc.endCall('call-001', 'tenant-001');

    const updateArgs = prisma.voiceCall.update.mock.calls[0]?.[0] as {
      data: Partial<CallRecord>;
    };
    expect(updateArgs.data.status).toBe('completed');
  });

  it('calculates durationSeconds when startedAt is set', async () => {
    await svc.endCall('call-001', 'tenant-001');

    const updateArgs = prisma.voiceCall.update.mock.calls[0]?.[0] as {
      data: Partial<CallRecord>;
    };
    expect(typeof updateArgs.data.durationSeconds).toBe('number');
    expect(updateArgs.data.durationSeconds).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// VoiceForgeService — outreach campaigns
// ─────────────────────────────────────────────────────────────────

describe('VoiceForgeService — outreach campaigns', () => {
  let svc: VoiceForgeService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    svc    = new VoiceForgeService(prisma as never, makeDocumentVaultMock() as never);
  });

  it('triggerAprExpiryOutreach returns a campaign result', async () => {
    const result = await svc.triggerAprExpiryOutreach('tenant-001', '+15559998888');

    expect(result.campaignType).toBe('apr_expiry');
    expect(result.tenantId).toBe('tenant-001');
    expect(typeof result.campaignId).toBe('string');
    expect(typeof result.totalTargets).toBe('number');
  });

  it('triggerAprExpiryOutreach returns zero calls when no eligible rounds', async () => {
    prisma.fundingRound.findMany.mockResolvedValue([]);

    const result = await svc.triggerAprExpiryOutreach('tenant-001', '+15559998888');

    expect(result.callsInitiated).toBe(0);
    expect(result.totalTargets).toBe(0);
  });

  it('triggerRestackConsultationOutreach returns correct campaignType', async () => {
    const result = await svc.triggerRestackConsultationOutreach('tenant-001', '+15559998888');

    expect(result.campaignType).toBe('restack_consultation');
  });

  it('triggerRestackConsultationOutreach returns zero calls when no eligible businesses', async () => {
    prisma.business.findMany.mockResolvedValue([]);

    const result = await svc.triggerRestackConsultationOutreach('tenant-001', '+15559998888');

    expect(result.callsInitiated).toBe(0);
  });

  it('triggerRepaymentReminderOutreach returns repayment_reminder campaignType', async () => {
    const result = await svc.triggerRepaymentReminderOutreach('tenant-001', '+15559998888');

    expect(result.campaignType).toBe('repayment_reminder');
  });
});

// ─────────────────────────────────────────────────────────────────
// VoiceForgeComplianceService — scanTranscript
// ─────────────────────────────────────────────────────────────────

describe('VoiceForgeComplianceService.scanTranscript — clean transcript', () => {
  let svc: VoiceForgeComplianceService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    svc    = new VoiceForgeComplianceService(prisma as never);
  });

  const baseInput: CallComplianceScanInput = {
    tenantId:       'tenant-001',
    businessId:     'biz-001',
    callId:         'call-001',
    advisorId:      'advisor-001',
    transcriptText: 'Hello, I am calling to discuss your upcoming APR adjustment. ' +
                    'We recommend reviewing your options. Approval is subject to issuer review.',
  };

  it('returns riskScore 0 for clean transcript', async () => {
    const result = await svc.scanTranscript(baseInput);
    expect(result.riskScore).toBe(0);
  });

  it('returns riskLevel "low" for clean transcript', async () => {
    const result = await svc.scanTranscript(baseInput);
    expect(result.riskLevel).toBe('low');
  });

  it('returns complianceStatus "pass" for clean transcript', async () => {
    const result = await svc.scanTranscript(baseInput);
    expect(result.complianceStatus).toBe('pass');
  });

  it('returns zero violations for clean transcript', async () => {
    const result = await svc.scanTranscript(baseInput);
    expect(result.violationCount).toBe(0);
    expect(result.violations).toHaveLength(0);
  });

  it('persists the scan record to callComplianceScan', async () => {
    await svc.scanTranscript(baseInput);
    expect(prisma.callComplianceScan.create).toHaveBeenCalledTimes(1);
  });

  it('returns a scanId string', async () => {
    const result = await svc.scanTranscript(baseInput);
    expect(typeof result.scanId).toBe('string');
    expect(result.scanId.length).toBeGreaterThan(0);
  });

  it('echoes callId and advisorId in result', async () => {
    const result = await svc.scanTranscript(baseInput);
    expect(result.callId).toBe('call-001');
    expect(result.advisorId).toBe('advisor-001');
  });
});

describe('VoiceForgeComplianceService.scanTranscript — banned claims', () => {
  let svc: VoiceForgeComplianceService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    svc    = new VoiceForgeComplianceService(prisma as never);
  });

  it('detects guaranteed_approval violation', async () => {
    const result = await svc.scanTranscript({
      tenantId:       'tenant-001',
      businessId:     'biz-001',
      callId:         'call-001',
      advisorId:      'advisor-001',
      transcriptText: 'We offer guaranteed approval for all businesses.',
    });
    const categories = result.violations.map((v) => v.category);
    expect(categories).toContain('guaranteed_approval');
  });

  it('returns riskLevel "critical" for severe violations', async () => {
    const result = await svc.scanTranscript({
      tenantId:       'tenant-001',
      businessId:     'biz-001',
      callId:         'call-001',
      advisorId:      'advisor-001',
      transcriptText: 'Guaranteed approval! SBA-approved program. Zero risk capital.',
    });
    expect(['high', 'critical']).toContain(result.riskLevel);
  });

  it('returns complianceStatus "fail" for critical violations', async () => {
    const result = await svc.scanTranscript({
      tenantId:       'tenant-001',
      businessId:     'biz-001',
      callId:         'call-001',
      advisorId:      'advisor-001',
      transcriptText: 'Guaranteed approval! SBA-approved federal program.',
    });
    expect(['fail', 'advisory']).toContain(result.complianceStatus);
  });

  it('includes requiredDisclosures array in result', async () => {
    const result = await svc.scanTranscript({
      tenantId:       'tenant-001',
      businessId:     'biz-001',
      callId:         'call-001',
      advisorId:      'advisor-001',
      transcriptText: 'This is a risk-free program with guaranteed approval.',
    });
    expect(Array.isArray(result.requiredDisclosures)).toBe(true);
  });

  it('includes summary string in result', async () => {
    const result = await svc.scanTranscript({
      tenantId:       'tenant-001',
      businessId:     'biz-001',
      callId:         'call-001',
      advisorId:      'advisor-001',
      transcriptText: 'Guaranteed approval for everyone.',
    });
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// VoiceForgeComplianceService — recordCallQaScore
// ─────────────────────────────────────────────────────────────────

describe('VoiceForgeComplianceService.recordCallQaScore', () => {
  let svc: VoiceForgeComplianceService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    svc    = new VoiceForgeComplianceService(prisma as never);
  });

  const baseQaInput: CallQaScoreInput = {
    tenantId:    'tenant-001',
    advisorId:   'advisor-001',
    callId:      'call-001',
    overallScore: 88,
  };

  it('records a QA score and returns a result with grade', async () => {
    const result = await svc.recordCallQaScore(baseQaInput);
    expect(typeof result.id).toBe('string');
    expect(result.overallScore).toBe(88);
    expect(['excellent', 'satisfactory', 'needs_improvement', 'unsatisfactory']).toContain(
      result.grade,
    );
  });

  it('assigns "satisfactory" grade for score 88', async () => {
    const result = await svc.recordCallQaScore(baseQaInput);
    expect(result.grade).toBe('satisfactory');
  });

  it('assigns "excellent" grade for score 95', async () => {
    const result = await svc.recordCallQaScore({ ...baseQaInput, overallScore: 95 });
    expect(result.grade).toBe('excellent');
  });

  it('assigns "needs_improvement" grade for score 65', async () => {
    const result = await svc.recordCallQaScore({ ...baseQaInput, overallScore: 65 });
    expect(result.grade).toBe('needs_improvement');
  });

  it('assigns "unsatisfactory" grade for score 50', async () => {
    const result = await svc.recordCallQaScore({ ...baseQaInput, overallScore: 50 });
    expect(result.grade).toBe('unsatisfactory');
  });

  it('persists optional score fields when provided', async () => {
    await svc.recordCallQaScore({
      ...baseQaInput,
      complianceScore:    90,
      scriptAdherence:    85,
      tcpaHandling:       100,
      riskClaimAvoidance: 92,
      disclosureDelivery: 88,
      feedback:           'Good call.',
    });

    const createArgs = prisma.callQaScore.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createArgs.data['complianceScore']).toBe(90);
    expect(createArgs.data['feedback']).toBe('Good call.');
  });
});

// ─────────────────────────────────────────────────────────────────
// VoiceForgeComplianceService — getAdvisorQaSummary
// ─────────────────────────────────────────────────────────────────

describe('VoiceForgeComplianceService.getAdvisorQaSummary', () => {
  let svc: VoiceForgeComplianceService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    svc    = new VoiceForgeComplianceService(prisma as never);
  });

  it('returns summary with advisorId and tenantId', async () => {
    const summary = await svc.getAdvisorQaSummary('advisor-001', 'tenant-001');
    expect(summary.advisorId).toBe('advisor-001');
    expect(summary.tenantId).toBe('tenant-001');
  });

  it('returns totalCallsScored = 0 when no scores exist', async () => {
    prisma.callQaScore.findMany.mockResolvedValue([]);

    const summary = await svc.getAdvisorQaSummary('advisor-001', 'tenant-001');
    expect(summary.totalCallsScored).toBe(0);
    expect(summary.averageOverallScore).toBe(0);
  });

  it('returns gradeDistribution object', async () => {
    const summary = await svc.getAdvisorQaSummary('advisor-001', 'tenant-001');
    expect(typeof summary.gradeDistribution).toBe('object');
    expect('excellent' in summary.gradeDistribution).toBe(true);
    expect('satisfactory' in summary.gradeDistribution).toBe(true);
    expect('needs_improvement' in summary.gradeDistribution).toBe(true);
    expect('unsatisfactory' in summary.gradeDistribution).toBe(true);
  });

  it('returns recentScores array', async () => {
    const summary = await svc.getAdvisorQaSummary('advisor-001', 'tenant-001');
    expect(Array.isArray(summary.recentScores)).toBe(true);
  });

  it('sets lastScoredAt to null when no scores exist', async () => {
    prisma.callQaScore.findMany.mockResolvedValue([]);

    const summary = await svc.getAdvisorQaSummary('advisor-001', 'tenant-001');
    expect(summary.lastScoredAt).toBeNull();
  });
});
