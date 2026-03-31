// ============================================================
// Unit Tests — VisionAudioForge Service
//
// Run: npx vitest run tests/unit/services/visionaudioforge.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  VisionAudioForgeService,
  AgentRunNotFoundError,
  AgentApprovalError,
  type ProcessDocumentInput,
  type AgentRunInput,
  type AgentType,
  type DocumentCategory,
} from '../../../src/backend/services/visionaudioforge.service.js';

// ── Mock dependencies ────────────────────────────────────────────

vi.mock('../../../src/backend/events/event-bus.js', () => ({
  EventBus: {
    getInstance: vi.fn().mockReturnValue({
      publishAndPersist: vi.fn().mockResolvedValue(undefined),
      publish:           vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// ── Mock DocumentVaultService ─────────────────────────────────────

function makeVaultMock() {
  return {
    autoFile: vi.fn().mockResolvedValue({ id: 'vault-doc-001' }),
    upload:   vi.fn().mockResolvedValue({ id: 'vault-doc-002' }),
  };
}

// ── Fixtures ─────────────────────────────────────────────────────

const TENANT_ID   = 'tenant-test-001';
const BUSINESS_ID = 'biz-test-001';
const USER_ID     = 'user-test-001';

function makeBuffer(content = 'stub file content'): Buffer {
  return Buffer.from(content, 'utf-8');
}

function makeProcessInput(overrides: Partial<ProcessDocumentInput> = {}): ProcessDocumentInput {
  return {
    tenantId:   TENANT_ID,
    businessId: BUSINESS_ID,
    uploadedBy: USER_ID,
    fileBuffer: makeBuffer(),
    mimeType:   'application/pdf',
    fileName:   'test-document.pdf',
    autoFile:   false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────
// processDocument — core behaviour
// ─────────────────────────────────────────────────────────────────

describe('VisionAudioForgeService.processDocument — core', () => {
  let svc: VisionAudioForgeService;

  beforeEach(() => {
    VisionAudioForgeService._reset();
    svc = new VisionAudioForgeService(undefined, makeVaultMock() as never);
  });

  afterEach(() => {
    VisionAudioForgeService._reset();
  });

  it('returns a processingId string', async () => {
    const result = await svc.processDocument(makeProcessInput());
    expect(typeof result.processingId).toBe('string');
    expect(result.processingId.length).toBeGreaterThan(0);
  });

  it('returns at least one OCR page', async () => {
    const result = await svc.processDocument(makeProcessInput());
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
  });

  it('returns fullText string', async () => {
    const result = await svc.processDocument(makeProcessInput());
    expect(typeof result.fullText).toBe('string');
  });

  it('returns confidence between 0 and 1', async () => {
    const result = await svc.processDocument(makeProcessInput());
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('returns processingMs as a non-negative number', async () => {
    const result = await svc.processDocument(makeProcessInput());
    expect(result.processingMs).toBeGreaterThanOrEqual(0);
  });

  it('returns keyValuePairs array', async () => {
    const result = await svc.processDocument(makeProcessInput());
    expect(Array.isArray(result.keyValuePairs)).toBe(true);
  });

  it('returns tables array', async () => {
    const result = await svc.processDocument(makeProcessInput());
    expect(Array.isArray(result.tables)).toBe(true);
  });

  it('returns warnings array', async () => {
    const result = await svc.processDocument(makeProcessInput());
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('sets vaultDocumentId to null when autoFile is false', async () => {
    const result = await svc.processDocument(makeProcessInput({ autoFile: false }));
    expect(result.vaultDocumentId).toBeNull();
  });

  it('stores result in memory for later retrieval', async () => {
    const result = await svc.processDocument(makeProcessInput());
    const retrieved = svc.getResult(result.processingId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.processingId).toBe(result.processingId);
  });
});

// ─────────────────────────────────────────────────────────────────
// processDocument — category detection
// ─────────────────────────────────────────────────────────────────

describe('VisionAudioForgeService.processDocument — category detection', () => {
  let svc: VisionAudioForgeService;

  beforeEach(() => {
    VisionAudioForgeService._reset();
    svc = new VisionAudioForgeService(undefined, makeVaultMock() as never);
  });

  afterEach(() => VisionAudioForgeService._reset());

  const cases: Array<[string, DocumentCategory]> = [
    ['bank_statement_jan_2026.pdf', 'bank_statement'],
    ['adverse_action_letter.pdf',   'adverse_action_letter'],
    ['loan_agreement_contract.pdf', 'contract'],
    ['ein_letter_kyb.pdf',          'kyb_document'],
    ['receipt_invoice_q1.pdf',      'receipt_invoice'],
    ['passport_id_scan.pdf',        'id_document'],
    ['unknown_file.pdf',            'unknown'],
  ];

  for (const [fileName, expectedCategory] of cases) {
    it(`detects category "${expectedCategory}" for file "${fileName}"`, async () => {
      const result = await svc.processDocument(makeProcessInput({ fileName }));
      expect(result.category).toBe(expectedCategory);
    });
  }

  it('respects explicit category override over filename hint', async () => {
    const result = await svc.processDocument(
      makeProcessInput({ fileName: 'bank_statement.pdf', category: 'contract' }),
    );
    expect(result.category).toBe('contract');
  });
});

// ─────────────────────────────────────────────────────────────────
// getResult
// ─────────────────────────────────────────────────────────────────

describe('VisionAudioForgeService.getResult', () => {
  let svc: VisionAudioForgeService;

  beforeEach(() => {
    VisionAudioForgeService._reset();
    svc = new VisionAudioForgeService(undefined, makeVaultMock() as never);
  });

  afterEach(() => VisionAudioForgeService._reset());

  it('returns null for an unknown processingId', () => {
    expect(svc.getResult('nonexistent-id')).toBeNull();
  });

  it('returns the result after processDocument is called', async () => {
    const { processingId } = await svc.processDocument(makeProcessInput());
    expect(svc.getResult(processingId)).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// ingestStatement
// ─────────────────────────────────────────────────────────────────

describe('VisionAudioForgeService.ingestStatement', () => {
  let svc: VisionAudioForgeService;

  beforeEach(() => {
    VisionAudioForgeService._reset();
    svc = new VisionAudioForgeService(undefined, makeVaultMock() as never);
  });

  afterEach(() => VisionAudioForgeService._reset());

  it('returns processingId and statement data', async () => {
    const result = await svc.ingestStatement(
      TENANT_ID,
      BUSINESS_ID,
      makeBuffer(),
      'application/pdf',
      'statement_jan.pdf',
    );

    expect(typeof result.processingId).toBe('string');
    expect(result.statement).toBeDefined();
  });

  it('statement data has masked account and routing numbers', async () => {
    const { statement } = await svc.ingestStatement(
      TENANT_ID,
      BUSINESS_ID,
      makeBuffer(),
      'application/pdf',
      'bank_statement.pdf',
    );

    expect(statement.accountNumber).toMatch(/\*{4}/);
    expect(statement.routingNumber).toMatch(/\*{4}/);
  });

  it('statement data includes transactions array', async () => {
    const { statement } = await svc.ingestStatement(
      TENANT_ID,
      BUSINESS_ID,
      makeBuffer(),
      'application/pdf',
      'bank_statement.pdf',
    );

    expect(Array.isArray(statement.transactions)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// parseAdverseActionLetter
// ─────────────────────────────────────────────────────────────────

describe('VisionAudioForgeService.parseAdverseActionLetter', () => {
  let svc: VisionAudioForgeService;

  beforeEach(() => {
    VisionAudioForgeService._reset();
    svc = new VisionAudioForgeService(undefined, makeVaultMock() as never);
  });

  afterEach(() => VisionAudioForgeService._reset());

  it('returns processingId and adverseAction data', async () => {
    const result = await svc.parseAdverseActionLetter(
      TENANT_ID,
      BUSINESS_ID,
      makeBuffer(),
      'application/pdf',
      'adverse_action.pdf',
    );

    expect(typeof result.processingId).toBe('string');
    expect(result.adverseAction).toBeDefined();
  });

  it('adverse action includes disputeRights flag', async () => {
    const { adverseAction } = await svc.parseAdverseActionLetter(
      TENANT_ID,
      BUSINESS_ID,
      makeBuffer(),
      'application/pdf',
      'denial_letter.pdf',
    );

    expect(typeof adverseAction.disputeRights).toBe('boolean');
  });

  it('adverse action includes reasons array', async () => {
    const { adverseAction } = await svc.parseAdverseActionLetter(
      TENANT_ID,
      BUSINESS_ID,
      makeBuffer(),
      'application/pdf',
      'adverse_action_letter.pdf',
    );

    expect(Array.isArray(adverseAction.reasons)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// detectIdLiveness
// ─────────────────────────────────────────────────────────────────

describe('VisionAudioForgeService.detectIdLiveness', () => {
  let svc: VisionAudioForgeService;

  beforeEach(() => {
    VisionAudioForgeService._reset();
    svc = new VisionAudioForgeService(undefined, makeVaultMock() as never);
  });

  afterEach(() => VisionAudioForgeService._reset());

  it('returns processingId and livenessData', async () => {
    const result = await svc.detectIdLiveness({
      tenantId:      TENANT_ID,
      businessId:    BUSINESS_ID,
      idImageBuffer: makeBuffer(),
      mimeType:      'image/jpeg',
      fileName:      'passport_id.jpg',
    });

    expect(typeof result.processingId).toBe('string');
    expect(result.livenessData).toBeDefined();
  });

  it('livenessScore is between 0 and 1', async () => {
    const { livenessData } = await svc.detectIdLiveness({
      tenantId:      TENANT_ID,
      idImageBuffer: makeBuffer(),
      mimeType:      'image/jpeg',
      fileName:      'id_scan.jpg',
    });

    expect(livenessData.livenessScore).toBeGreaterThanOrEqual(0);
    expect(livenessData.livenessScore).toBeLessThanOrEqual(1);
  });

  it('livenessVerdict is one of pass | fail | review', async () => {
    const { livenessData } = await svc.detectIdLiveness({
      tenantId:      TENANT_ID,
      idImageBuffer: makeBuffer(),
      mimeType:      'image/jpeg',
      fileName:      'passport_id.jpg',
    });

    expect(['pass', 'fail', 'review']).toContain(livenessData.livenessVerdict);
  });

  it('sets facialMatchScore when referencePhotoBuffer is provided', async () => {
    const { livenessData } = await svc.detectIdLiveness({
      tenantId:             TENANT_ID,
      idImageBuffer:        makeBuffer(),
      mimeType:             'image/jpeg',
      fileName:             'passport.jpg',
      referencePhotoBuffer: makeBuffer('reference photo'),
    });

    expect(livenessData.facialMatchScore).not.toBeNull();
    expect(livenessData.facialMatchScore).toBeGreaterThan(0);
  });

  it('facialMatchScore is null when no reference photo provided', async () => {
    const { livenessData } = await svc.detectIdLiveness({
      tenantId:      TENANT_ID,
      idImageBuffer: makeBuffer(),
      mimeType:      'image/jpeg',
      fileName:      'id_document.jpg',
    });

    expect(livenessData.facialMatchScore).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// triggerAgentRun — maker-checker
// ─────────────────────────────────────────────────────────────────

describe('VisionAudioForgeService.triggerAgentRun', () => {
  let svc: VisionAudioForgeService;

  beforeEach(() => {
    VisionAudioForgeService._reset();
    svc = new VisionAudioForgeService(undefined, makeVaultMock() as never);
  });

  afterEach(() => VisionAudioForgeService._reset());

  const baseAgentInput: AgentRunInput = {
    tenantId:    TENANT_ID,
    businessId:  BUSINESS_ID,
    triggeredBy: USER_ID,
    agentType:   'statement',
    payload:     { fileName: 'test.pdf' },
  };

  it('returns a run with runId and agentType', async () => {
    const run = await svc.triggerAgentRun(baseAgentInput);

    expect(typeof run.runId).toBe('string');
    expect(run.agentType).toBe('statement');
  });

  it('sets status "awaiting_approval" when requireApproval is true (default)', async () => {
    const run = await svc.triggerAgentRun({ ...baseAgentInput, requireApproval: true });
    expect(run.status).toBe('awaiting_approval');
    expect(run.approvalStatus).toBe('pending');
  });

  it('sets status "queued" when requireApproval is false', async () => {
    const run = await svc.triggerAgentRun({ ...baseAgentInput, requireApproval: false });
    expect(run.status).toBe('queued');
    expect(run.approvalStatus).toBe('auto_approved');
  });

  it('includes makerEntry with correct role', async () => {
    const run = await svc.triggerAgentRun(baseAgentInput);
    expect(run.makerEntry.role).toBe('maker');
    expect(run.makerEntry.actorId).toBe(USER_ID);
  });

  it('run output is null initially', async () => {
    const run = await svc.triggerAgentRun(baseAgentInput);
    expect(run.output).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// approveAgentRun / rejectAgentRun
// ─────────────────────────────────────────────────────────────────

describe('VisionAudioForgeService.approveAgentRun', () => {
  let svc: VisionAudioForgeService;

  beforeEach(() => {
    VisionAudioForgeService._reset();
    svc = new VisionAudioForgeService(undefined, makeVaultMock() as never);
  });

  afterEach(() => VisionAudioForgeService._reset());

  it('advances approvalStatus to "approved"', async () => {
    const run = await svc.triggerAgentRun({
      tenantId:    TENANT_ID,
      triggeredBy: USER_ID,
      agentType:   'kyb',
      payload:     {},
    });

    const approved = svc.approveAgentRun(run.runId, 'checker-001');
    expect(approved.approvalStatus).toBe('approved');
    expect(approved.status).toBe('queued');
  });

  it('throws AgentRunNotFoundError for unknown runId', () => {
    expect(() => svc.approveAgentRun('nonexistent-run-id', 'checker-001')).toThrow(
      AgentRunNotFoundError,
    );
  });

  it('throws AgentApprovalError when trying to approve an already-approved run', async () => {
    const run = await svc.triggerAgentRun({
      tenantId:    TENANT_ID,
      triggeredBy: USER_ID,
      agentType:   'contract',
      payload:     {},
    });

    svc.approveAgentRun(run.runId, 'checker-001');

    expect(() => svc.approveAgentRun(run.runId, 'checker-002')).toThrow(AgentApprovalError);
  });
});

describe('VisionAudioForgeService.rejectAgentRun', () => {
  let svc: VisionAudioForgeService;

  beforeEach(() => {
    VisionAudioForgeService._reset();
    svc = new VisionAudioForgeService(undefined, makeVaultMock() as never);
  });

  afterEach(() => VisionAudioForgeService._reset());

  it('sets status to "failed" and approvalStatus to "rejected"', async () => {
    const run = await svc.triggerAgentRun({
      tenantId:    TENANT_ID,
      triggeredBy: USER_ID,
      agentType:   'acknowledgment',
      payload:     {},
    });

    const rejected = svc.rejectAgentRun(run.runId, 'checker-001', 'Incomplete payload');
    expect(rejected.status).toBe('failed');
    expect(rejected.approvalStatus).toBe('rejected');
  });

  it('includes rejection reason in errors array', async () => {
    const run = await svc.triggerAgentRun({
      tenantId:    TENANT_ID,
      triggeredBy: USER_ID,
      agentType:   'evidence_bundle',
      payload:     {},
    });

    const rejected = svc.rejectAgentRun(run.runId, 'checker-001', 'Missing documents');
    expect(rejected.errors.some((e) => e.includes('Missing documents'))).toBe(true);
  });

  it('throws AgentRunNotFoundError for unknown runId', () => {
    expect(() => svc.rejectAgentRun('nonexistent', 'checker-001', 'reason')).toThrow(
      AgentRunNotFoundError,
    );
  });
});

// ─────────────────────────────────────────────────────────────────
// listAgentRuns + getMakerCheckerLog
// ─────────────────────────────────────────────────────────────────

describe('VisionAudioForgeService.listAgentRuns', () => {
  let svc: VisionAudioForgeService;

  beforeEach(() => {
    VisionAudioForgeService._reset();
    svc = new VisionAudioForgeService(undefined, makeVaultMock() as never);
  });

  afterEach(() => VisionAudioForgeService._reset());

  it('returns all runs when no filter is applied', async () => {
    await svc.triggerAgentRun({ tenantId: TENANT_ID, triggeredBy: USER_ID, agentType: 'statement', payload: {} });
    await svc.triggerAgentRun({ tenantId: TENANT_ID, triggeredBy: USER_ID, agentType: 'kyb', payload: {} });

    const runs = svc.listAgentRuns();
    expect(runs.length).toBe(2);
  });

  it('filters by agentType when specified', async () => {
    await svc.triggerAgentRun({ tenantId: TENANT_ID, triggeredBy: USER_ID, agentType: 'statement', payload: {} });
    await svc.triggerAgentRun({ tenantId: TENANT_ID, triggeredBy: USER_ID, agentType: 'kyb', payload: {} });

    const statementRuns = svc.listAgentRuns('statement');
    expect(statementRuns.length).toBe(1);
    expect(statementRuns[0]!.agentType).toBe('statement');
  });

  it('returns empty array when no runs exist', () => {
    expect(svc.listAgentRuns()).toHaveLength(0);
  });
});

describe('VisionAudioForgeService.getMakerCheckerLog', () => {
  let svc: VisionAudioForgeService;

  beforeEach(() => {
    VisionAudioForgeService._reset();
    svc = new VisionAudioForgeService(undefined, makeVaultMock() as never);
  });

  afterEach(() => VisionAudioForgeService._reset());

  it('logs maker entry for each triggered run', async () => {
    await svc.triggerAgentRun({ tenantId: TENANT_ID, triggeredBy: USER_ID, agentType: 'contract', payload: {} });

    const log = svc.getMakerCheckerLog();
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(log.some((e) => e.role === 'maker')).toBe(true);
  });

  it('filters log by agentType', async () => {
    await svc.triggerAgentRun({ tenantId: TENANT_ID, triggeredBy: USER_ID, agentType: 'statement', payload: {} });
    await svc.triggerAgentRun({ tenantId: TENANT_ID, triggeredBy: USER_ID, agentType: 'kyb', payload: {} });

    const statementLog = svc.getMakerCheckerLog('statement');
    expect(statementLog.every((e) => e.agentType === 'statement')).toBe(true);
  });

  it('adds checker entry after approval', async () => {
    const run = await svc.triggerAgentRun({
      tenantId:    TENANT_ID,
      triggeredBy: USER_ID,
      agentType:   'acknowledgment',
      payload:     {},
    });

    svc.approveAgentRun(run.runId, 'checker-001');

    const log = svc.getMakerCheckerLog('acknowledgment');
    expect(log.some((e) => e.role === 'checker')).toBe(true);
  });
});
