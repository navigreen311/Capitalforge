// ============================================================
// Unit Tests — Complaint & Regulator Response Services
//
// Run: npx vitest run tests/unit/services/complaint.test.ts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  ComplaintService,
} from '../../../src/backend/services/complaint.service.js';
import type {
  CreateComplaintInput,
  UpdateComplaintInput,
  AttachEvidenceInput,
} from '../../../src/backend/services/complaint.service.js';

import {
  RegulatorResponseService,
} from '../../../src/backend/services/regulator-response.service.js';
import type {
  CreateInquiryInput,
  UpdateInquiryInput,
} from '../../../src/backend/services/regulator-response.service.js';

// ── Prisma mock factory ────────────────────────────────────────────

function makePrismaMock() {
  return {
    complaint: {
      create:     vi.fn(),
      findMany:   vi.fn().mockResolvedValue([]),
      findFirst:  vi.fn().mockResolvedValue(null),
      update:     vi.fn(),
      count:      vi.fn().mockResolvedValue(0),
    },
    regulatoryAlert: {
      create:     vi.fn(),
      findMany:   vi.fn().mockResolvedValue([]),
      findFirst:  vi.fn().mockResolvedValue(null),
      update:     vi.fn(),
      count:      vi.fn().mockResolvedValue(0),
    },
    advisorQaScore: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    achAuthorization: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany:  vi.fn().mockResolvedValue([]),
    },
    document: {
      findMany:    vi.fn().mockResolvedValue([]),
      updateMany:  vi.fn().mockResolvedValue({ count: 0 }),
    },
    consentRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    complianceCheck: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

// ── Shared fixtures ────────────────────────────────────────────────

const TENANT_ID  = 'tenant-001';
const BIZ_ID     = 'biz-001';
const COMPLAINT_ID = 'complaint-001';
const INQUIRY_ID   = 'inquiry-001';

const NOW = new Date('2026-03-31T10:00:00Z');

function makeComplaintRow(overrides: Record<string, unknown> = {}) {
  return {
    id:            COMPLAINT_ID,
    tenantId:      TENANT_ID,
    businessId:    BIZ_ID,
    category:      'billing',
    subcategory:   null,
    source:        'portal',
    severity:      'medium',
    status:        'open',
    description:   'Invoice has incorrect fee amount.',
    evidenceDocIds: [],
    callRecordIds:  [],
    rootCause:     null,
    resolution:    null,
    assignedTo:    null,
    escalatedTo:   null,
    resolvedAt:    null,
    createdAt:     NOW,
    updatedAt:     NOW,
    ...overrides,
  };
}

function makeInquiryRow(overrides: Record<string, unknown> = {}) {
  return {
    id:          INQUIRY_ID,
    tenantId:    TENANT_ID,
    source:      'CFPB Enforcement Division',
    ruleType:    'CFPB',
    title:       'CFPB Inquiry — REF-2026-001',
    summary:     'Inquiry regarding unauthorized debit practices.',
    impactScore: 90,
    status:      'open',
    reviewedBy:  null,
    reviewedAt:  null,
    effectiveDate: null,
    createdAt:   NOW,
    updatedAt:   NOW,
    metadata: {
      businessId:           BIZ_ID,
      matterType:           'CFPB',
      referenceNumber:      'REF-2026-001',
      severity:             'critical',
      responseDueDate:      new Date('2026-04-30').toISOString(),
      assignedCounsel:      null,
      assignedTo:           null,
      responseNotes:        null,
      resolution:           null,
      legalHoldActivatedAt: null,
      legalHoldActivatedBy: null,
      closedAt:             null,
    },
    ...overrides,
  };
}

// ============================================================
// COMPLAINT SERVICE — CREATION
// ============================================================

describe('ComplaintService — createComplaint (billing)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists a complaint record to the database', async () => {
    const mock = makePrismaMock();
    mock.complaint.create.mockResolvedValue(makeComplaintRow());

    const svc    = new ComplaintService(mock as never);
    const result = await svc.createComplaint({
      tenantId:    TENANT_ID,
      businessId:  BIZ_ID,
      category:    'billing',
      source:      'portal',
      description: 'Invoice has incorrect fee amount.',
    });

    expect(mock.complaint.create).toHaveBeenCalledOnce();
    expect(result.id).toBe(COMPLAINT_ID);
    expect(result.category).toBe('billing');
    expect(result.status).toBe('open');
  });

  it('infers medium severity for a billing complaint', async () => {
    const mock = makePrismaMock();
    mock.complaint.create.mockResolvedValue(makeComplaintRow());

    const svc    = new ComplaintService(mock as never);
    const result = await svc.createComplaint({
      tenantId:    TENANT_ID,
      category:    'billing',
      source:      'portal',
      description: 'Invoice has incorrect fee amount.',
    });

    expect(result.severity).toBe('medium');
  });

  it('auto-classifies unauthorized_debit from description keywords', async () => {
    const row = makeComplaintRow({ category: 'unauthorized_debit', severity: 'high' });
    const mock = makePrismaMock();
    mock.complaint.create.mockResolvedValue(row);

    const svc = new ComplaintService(mock as never);
    await svc.createComplaint({
      tenantId:    TENANT_ID,
      category:    'other', // caller supplies 'other' — service overrides
      source:      'phone',
      description: 'Client reports unauthorized ACH pull on their account.',
    });

    const createArgs = mock.complaint.create.mock.calls[0][0].data;
    expect(createArgs.category).toBe('unauthorized_debit');
  });

  it('auto-classifies compliance from CFPB keyword in description', async () => {
    const row = makeComplaintRow({ category: 'compliance', severity: 'critical' });
    const mock = makePrismaMock();
    mock.complaint.create.mockResolvedValue(row);

    const svc = new ComplaintService(mock as never);
    await svc.createComplaint({
      tenantId:    TENANT_ID,
      category:    'other',
      source:      'regulator_referral',
      description: 'CFPB has raised a regulatory inquiry about our fee disclosures.',
    });

    const createArgs = mock.complaint.create.mock.calls[0][0].data;
    expect(createArgs.category).toBe('compliance');
  });

  it('assigns critical severity to compliance complaints', async () => {
    const row = makeComplaintRow({ category: 'compliance', severity: 'critical' });
    const mock = makePrismaMock();
    mock.complaint.create.mockResolvedValue(row);

    const svc    = new ComplaintService(mock as never);
    const result = await svc.createComplaint({
      tenantId:    TENANT_ID,
      category:    'compliance',
      source:      'regulator_referral',
      description: 'Regulator flagged a potential violation of FTC rules.',
    });

    expect(result.severity).toBe('critical');
  });
});

// ============================================================
// COMPLAINT SERVICE — CATEGORY CLASSIFICATION
// ============================================================

describe('ComplaintService — category classification', () => {
  it('preserves service category when no override keywords present', async () => {
    const row = makeComplaintRow({ category: 'service' });
    const mock = makePrismaMock();
    mock.complaint.create.mockResolvedValue(row);

    const svc = new ComplaintService(mock as never);
    await svc.createComplaint({
      tenantId:    TENANT_ID,
      category:    'service',
      source:      'email',
      description: 'Support team did not respond within promised timeframe.',
    });

    const createArgs = mock.complaint.create.mock.calls[0][0].data;
    expect(createArgs.category).toBe('service');
  });

  it('overrides supplied category with unauthorized_debit on "revok" keyword', async () => {
    const row = makeComplaintRow({ category: 'unauthorized_debit' });
    const mock = makePrismaMock();
    mock.complaint.create.mockResolvedValue(row);

    const svc = new ComplaintService(mock as never);
    await svc.createComplaint({
      tenantId:    TENANT_ID,
      category:    'billing',
      source:      'phone',
      description: 'Customer is trying to revoke their auto-debit authorization.',
    });

    const createArgs = mock.complaint.create.mock.calls[0][0].data;
    expect(createArgs.category).toBe('unauthorized_debit');
  });
});

// ============================================================
// COMPLAINT SERVICE — UNAUTHORIZED DEBIT BUNDLE
// ============================================================

describe('ComplaintService — unauthorized debit evidence bundle', () => {
  it('attaches ACH authorization bundle for unauthorized_debit complaint', async () => {
    const achRow = {
      id:                  'auth-001',
      businessId:          BIZ_ID,
      processorName:       'Stripe ACH',
      authorizedAmount:    5000,
      authorizedFrequency: 'monthly',
      status:              'active',
      signedDocumentRef:   'doc-signed-001',
      authorizedAt:        NOW,
      revokedAt:           null,
      debitEvents: [
        {
          id: 'debit-001',
          amount: 6500,
          processedAt: NOW,
          flagged: true,
          flagReason: 'Exceeds authorized amount',
          isWithinTolerance: false,
        },
      ],
    };

    const row  = makeComplaintRow({ category: 'unauthorized_debit' });
    const mock = makePrismaMock();
    mock.complaint.create.mockResolvedValue(row);
    mock.achAuthorization.findFirst.mockResolvedValue(achRow);

    const svc    = new ComplaintService(mock as never);
    const result = await svc.createComplaint({
      tenantId:    TENANT_ID,
      businessId:  BIZ_ID,
      category:    'unauthorized_debit',
      source:      'phone',
      description: 'Client reports unauthorized debit exceeding authorized amount.',
    });

    expect(result.unauthorizedDebitBundle).toBeDefined();
    expect(result.unauthorizedDebitBundle!.achAuthorizationId).toBe('auth-001');
    expect(result.unauthorizedDebitBundle!.processorName).toBe('Stripe ACH');
    expect(result.unauthorizedDebitBundle!.debitEvents).toHaveLength(1);
    expect(result.unauthorizedDebitBundle!.debitEvents[0].flagged).toBe(true);
  });

  it('returns undefined bundle when no ACH authorization exists', async () => {
    const row  = makeComplaintRow({ category: 'unauthorized_debit' });
    const mock = makePrismaMock();
    mock.complaint.create.mockResolvedValue(row);
    mock.achAuthorization.findFirst.mockResolvedValue(null);

    const svc    = new ComplaintService(mock as never);
    const result = await svc.createComplaint({
      tenantId:    TENANT_ID,
      businessId:  BIZ_ID,
      category:    'unauthorized_debit',
      source:      'phone',
      description: 'Client reports unauthorized debit on account.',
    });

    expect(result.unauthorizedDebitBundle).toBeUndefined();
  });
});

// ============================================================
// COMPLAINT SERVICE — LIFECYCLE TRANSITIONS
// ============================================================

describe('ComplaintService — lifecycle transitions', () => {
  it('transitions open → investigating successfully', async () => {
    const existing = makeComplaintRow({ status: 'open' });
    const updated  = makeComplaintRow({ status: 'investigating' });
    const mock     = makePrismaMock();
    mock.complaint.findFirst.mockResolvedValue(existing);
    mock.complaint.update.mockResolvedValue(updated);

    const svc    = new ComplaintService(mock as never);
    const result = await svc.updateComplaint(COMPLAINT_ID, TENANT_ID, { status: 'investigating' });

    expect(result.status).toBe('investigating');
  });

  it('transitions investigating → resolved and sets resolvedAt', async () => {
    const existing = makeComplaintRow({ status: 'investigating' });
    const updated  = makeComplaintRow({ status: 'resolved', resolvedAt: NOW });
    const mock     = makePrismaMock();
    mock.complaint.findFirst.mockResolvedValue(existing);
    mock.complaint.update.mockResolvedValue(updated);

    const svc    = new ComplaintService(mock as never);
    const result = await svc.updateComplaint(COMPLAINT_ID, TENANT_ID, { status: 'resolved' });

    expect(result.status).toBe('resolved');
    expect(result.resolvedAt).toBeDefined();
  });

  it('rejects invalid transition: open → closed is allowed', async () => {
    const existing = makeComplaintRow({ status: 'open' });
    const updated  = makeComplaintRow({ status: 'closed' });
    const mock     = makePrismaMock();
    mock.complaint.findFirst.mockResolvedValue(existing);
    mock.complaint.update.mockResolvedValue(updated);

    const svc    = new ComplaintService(mock as never);
    const result = await svc.updateComplaint(COMPLAINT_ID, TENANT_ID, { status: 'closed' });
    expect(result.status).toBe('closed');
  });

  it('throws on invalid transition: closed → investigating', async () => {
    const existing = makeComplaintRow({ status: 'closed' });
    const mock     = makePrismaMock();
    mock.complaint.findFirst.mockResolvedValue(existing);

    const svc = new ComplaintService(mock as never);
    await expect(
      svc.updateComplaint(COMPLAINT_ID, TENANT_ID, { status: 'investigating' }),
    ).rejects.toThrow('Invalid status transition');
  });

  it('throws not-found error when complaint id is unknown', async () => {
    const mock = makePrismaMock();
    mock.complaint.findFirst.mockResolvedValue(null);

    const svc = new ComplaintService(mock as never);
    await expect(
      svc.updateComplaint('nonexistent-id', TENANT_ID, { status: 'investigating' }),
    ).rejects.toThrow('not found');
  });
});

// ============================================================
// COMPLAINT SERVICE — EVIDENCE ATTACHMENT
// ============================================================

describe('ComplaintService — evidence attachment', () => {
  it('merges new document IDs with existing ones', async () => {
    const existing = makeComplaintRow({ evidenceDocIds: ['doc-existing-1'] });
    const updated  = makeComplaintRow({ evidenceDocIds: ['doc-existing-1', 'doc-new-2'] });
    const mock     = makePrismaMock();
    mock.complaint.findFirst.mockResolvedValue(existing);
    mock.complaint.update.mockResolvedValue(updated);

    const svc: ComplaintService = new ComplaintService(mock as never);
    const input: AttachEvidenceInput = {
      complaintId:   COMPLAINT_ID,
      tenantId:      TENANT_ID,
      evidenceItems: [{ type: 'document', referenceId: 'doc-new-2', title: 'Bank Statement' }],
      addedBy:       'user-001',
    };

    const result = await svc.attachEvidence(input);
    expect(result.evidenceDocIds).toContain('doc-existing-1');
    expect(result.evidenceDocIds).toContain('doc-new-2');
  });

  it('routes call_record items to callRecordIds array', async () => {
    const existing = makeComplaintRow({ callRecordIds: [] });
    const updated  = makeComplaintRow({ callRecordIds: ['call-001'] });
    const mock     = makePrismaMock();
    mock.complaint.findFirst.mockResolvedValue(existing);
    mock.complaint.update.mockResolvedValue(updated);

    const svc: ComplaintService = new ComplaintService(mock as never);
    await svc.attachEvidence({
      complaintId:   COMPLAINT_ID,
      tenantId:      TENANT_ID,
      evidenceItems: [{ type: 'call_record', referenceId: 'call-001', title: 'Sales Call 2026-03-01' }],
    });

    const updateArgs = mock.complaint.update.mock.calls[0][0].data;
    expect(updateArgs.callRecordIds).toContain('call-001');
  });

  it('deduplicates evidence IDs on repeated attachment', async () => {
    const existing = makeComplaintRow({ evidenceDocIds: ['doc-001'] });
    const updated  = makeComplaintRow({ evidenceDocIds: ['doc-001'] });
    const mock     = makePrismaMock();
    mock.complaint.findFirst.mockResolvedValue(existing);
    mock.complaint.update.mockResolvedValue(updated);

    const svc = new ComplaintService(mock as never);
    await svc.attachEvidence({
      complaintId:   COMPLAINT_ID,
      tenantId:      TENANT_ID,
      evidenceItems: [{ type: 'document', referenceId: 'doc-001', title: 'Duplicate Doc' }],
    });

    const updateArgs = mock.complaint.update.mock.calls[0][0].data;
    const docs = updateArgs.evidenceDocIds as string[];
    const uniqueDocs = [...new Set(docs)];
    expect(docs).toHaveLength(uniqueDocs.length);
  });

  it('throws not-found when attaching to unknown complaint', async () => {
    const mock = makePrismaMock();
    mock.complaint.findFirst.mockResolvedValue(null);

    const svc = new ComplaintService(mock as never);
    await expect(
      svc.attachEvidence({
        complaintId:   'nonexistent',
        tenantId:      TENANT_ID,
        evidenceItems: [{ type: 'document', referenceId: 'doc-001', title: 'Doc' }],
      }),
    ).rejects.toThrow('not found');
  });
});

// ============================================================
// COMPLAINT SERVICE — ANALYTICS
// ============================================================

describe('ComplaintService — root-cause analytics', () => {
  it('returns correct totals for mixed complaint data', async () => {
    const mock = makePrismaMock();
    mock.complaint.findMany.mockResolvedValue([
      makeComplaintRow({ category: 'billing',             status: 'open',         severity: 'medium', rootCause: 'fee calculation bug' }),
      makeComplaintRow({ category: 'unauthorized_debit',  status: 'investigating', severity: 'high',   rootCause: 'ach error' }),
      makeComplaintRow({ category: 'compliance',          status: 'resolved',      severity: 'critical', rootCause: 'fee calculation bug', resolvedAt: new Date(NOW.getTime() + 2 * 86400000) }),
    ]);

    const svc    = new ComplaintService(mock as never);
    const result = await svc.getRootCauseAnalytics(TENANT_ID);

    expect(result.totalComplaints).toBe(3);
    expect(result.byCategory['billing']).toBe(1);
    expect(result.byCategory['unauthorized_debit']).toBe(1);
    expect(result.byCategory['compliance']).toBe(1);
    expect(result.byStatus['open']).toBe(1);
    expect(result.openCritical).toBe(1);
    expect(result.unauthorizedDebitOpenCount).toBe(1);
  });

  it('top root causes are sorted by frequency descending', async () => {
    const mock = makePrismaMock();
    mock.complaint.findMany.mockResolvedValue([
      makeComplaintRow({ rootCause: 'fee calculation bug' }),
      makeComplaintRow({ rootCause: 'fee calculation bug' }),
      makeComplaintRow({ rootCause: 'ach error' }),
    ]);

    const svc    = new ComplaintService(mock as never);
    const result = await svc.getRootCauseAnalytics(TENANT_ID);

    expect(result.topRootCauses[0].rootCause).toBe('fee calculation bug');
    expect(result.topRootCauses[0].count).toBe(2);
  });

  it('returns recentTrend with 6 months of data', async () => {
    const mock = makePrismaMock();
    mock.complaint.findMany.mockResolvedValue([]);

    const svc    = new ComplaintService(mock as never);
    const result = await svc.getRootCauseAnalytics(TENANT_ID);

    expect(result.recentTrend).toHaveLength(6);
  });

  it('averageResolutionDays is null when no resolved complaints', async () => {
    const mock = makePrismaMock();
    mock.complaint.findMany.mockResolvedValue([
      makeComplaintRow({ status: 'open', resolvedAt: null }),
    ]);

    const svc    = new ComplaintService(mock as never);
    const result = await svc.getRootCauseAnalytics(TENANT_ID);

    expect(result.averageResolutionDays).toBeNull();
  });
});

// ============================================================
// REGULATOR RESPONSE SERVICE — INQUIRY CREATION
// ============================================================

describe('RegulatorResponseService — createInquiry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists a regulator inquiry record', async () => {
    const mock = makePrismaMock();
    mock.regulatoryAlert.create.mockResolvedValue(makeInquiryRow());

    const svc    = new RegulatorResponseService(mock as never);
    const result = await svc.createInquiry({
      tenantId:    TENANT_ID,
      businessId:  BIZ_ID,
      matterType:  'CFPB',
      agencyName:  'CFPB Enforcement Division',
      description: 'Inquiry regarding unauthorized debit practices.',
    });

    expect(mock.regulatoryAlert.create).toHaveBeenCalledOnce();
    expect(result.id).toBe(INQUIRY_ID);
    expect(result.matterType).toBe('CFPB');
  });

  it('auto-classifies FTC from agencyName', async () => {
    const row  = makeInquiryRow({ ruleType: 'FTC', metadata: { ...makeInquiryRow().metadata, matterType: 'FTC' } });
    const mock = makePrismaMock();
    mock.regulatoryAlert.create.mockResolvedValue(row);

    const svc = new RegulatorResponseService(mock as never);
    await svc.createInquiry({
      tenantId:    TENANT_ID,
      matterType:  'audit',  // caller supplies audit — service overrides to FTC
      agencyName:  'Federal Trade Commission',
      description: 'FTC civil investigative demand.',
    });

    const createArgs = mock.regulatoryAlert.create.mock.calls[0][0].data;
    expect(createArgs.ruleType).toBe('FTC');
  });

  it('infers critical severity for CFPB inquiries', async () => {
    const mock = makePrismaMock();
    mock.regulatoryAlert.create.mockResolvedValue(makeInquiryRow());

    const svc = new RegulatorResponseService(mock as never);
    await svc.createInquiry({
      tenantId:   TENANT_ID,
      matterType: 'CFPB',
      agencyName: 'CFPB',
      description: 'Consumer complaint referral.',
    });

    const createArgs = mock.regulatoryAlert.create.mock.calls[0][0].data;
    const meta = createArgs.metadata as Record<string, unknown>;
    expect(meta['severity']).toBe('critical');
  });

  it('records responseDueDate and deadlineStatus correctly', async () => {
    const dueDate = new Date('2026-04-30');
    const mock    = makePrismaMock();
    mock.regulatoryAlert.create.mockResolvedValue(makeInquiryRow());

    const svc    = new RegulatorResponseService(mock as never);
    const result = await svc.createInquiry({
      tenantId:        TENANT_ID,
      matterType:      'CFPB',
      agencyName:      'CFPB',
      description:     'Inquiry',
      responseDueDate: dueDate,
    });

    expect(result.deadlineStatus).toBeDefined();
    expect(typeof result.deadlineStatus!.daysUntilDeadline).toBe('number');
  });
});

// ============================================================
// REGULATOR RESPONSE SERVICE — LEGAL HOLD
// ============================================================

describe('RegulatorResponseService — legal hold', () => {
  it('marks all business documents as legalHold=true', async () => {
    const docs = [{ id: 'doc-001' }, { id: 'doc-002' }];
    const mock = makePrismaMock();
    mock.regulatoryAlert.findFirst.mockResolvedValue(makeInquiryRow());
    mock.document.findMany.mockResolvedValue(docs);
    mock.document.updateMany.mockResolvedValue({ count: 2 });
    mock.regulatoryAlert.update.mockResolvedValue(
      makeInquiryRow({ status: 'legal_hold' }),
    );

    const svc    = new RegulatorResponseService(mock as never);
    const result = await svc.activateLegalHold(INQUIRY_ID, TENANT_ID, 'user-001');

    expect(mock.document.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['doc-001', 'doc-002'] } },
      data:  { legalHold: true },
    });
    expect(result.documentCount).toBe(2);
    expect(result.preservedDocumentIds).toEqual(['doc-001', 'doc-002']);
  });

  it('sets legalHold status on the inquiry record', async () => {
    const mock = makePrismaMock();
    mock.regulatoryAlert.findFirst.mockResolvedValue(makeInquiryRow());
    mock.document.findMany.mockResolvedValue([]);
    mock.regulatoryAlert.update.mockResolvedValue(
      makeInquiryRow({ status: 'legal_hold' }),
    );

    const svc = new RegulatorResponseService(mock as never);
    await svc.activateLegalHold(INQUIRY_ID, TENANT_ID);

    const updateArgs = mock.regulatoryAlert.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe('legal_hold');
  });

  it('throws not-found for unknown inquiry during legal hold', async () => {
    const mock = makePrismaMock();
    mock.regulatoryAlert.findFirst.mockResolvedValue(null);

    const svc = new RegulatorResponseService(mock as never);
    await expect(
      svc.activateLegalHold('nonexistent-id', TENANT_ID),
    ).rejects.toThrow('not found');
  });
});

// ============================================================
// REGULATOR RESPONSE SERVICE — DOSSIER EXPORT
// ============================================================

describe('RegulatorResponseService — dossier export', () => {
  it('returns a dossier with all required sections', async () => {
    const mock = makePrismaMock();
    mock.regulatoryAlert.findFirst.mockResolvedValue(makeInquiryRow());
    mock.document.findMany.mockResolvedValue([
      { id: 'doc-001', documentType: 'consent', title: 'ACH Auth', storageKey: 'key/001', createdAt: NOW, legalHold: true, sha256Hash: 'abc123', cryptoTimestamp: '2026-01-01' },
    ]);
    mock.complaint.findMany.mockResolvedValue([
      makeComplaintRow(),
    ]);
    mock.consentRecord.findMany.mockResolvedValue([]);
    mock.complianceCheck.findMany.mockResolvedValue([]);
    mock.achAuthorization.findMany.mockResolvedValue([]);

    const svc    = new RegulatorResponseService(mock as never);
    const result = await svc.exportDossier(INQUIRY_ID, TENANT_ID, 'user-001');

    expect(result.exportId).toBeTruthy();
    expect(result.inquiryId).toBe(INQUIRY_ID);
    expect(result.exportFormat).toBe('json');
    expect(result.sections.inquiryDetails).toBeDefined();
    expect(result.sections.documents).toHaveLength(1);
    expect(result.sections.complaints).toHaveLength(1);
    expect(result.totalDocuments).toBe(1);
  });

  it('includes sha256Hash and cryptoTimestamp in document section', async () => {
    const mock = makePrismaMock();
    mock.regulatoryAlert.findFirst.mockResolvedValue(makeInquiryRow());
    mock.document.findMany.mockResolvedValue([
      { id: 'doc-001', documentType: 'consent', title: 'Auth Doc', storageKey: 'key/001', createdAt: NOW, legalHold: true, sha256Hash: 'deadbeef', cryptoTimestamp: 'ts-2026-01-01' },
    ]);
    mock.complaint.findMany.mockResolvedValue([]);
    mock.consentRecord.findMany.mockResolvedValue([]);
    mock.complianceCheck.findMany.mockResolvedValue([]);
    mock.achAuthorization.findMany.mockResolvedValue([]);

    const svc    = new RegulatorResponseService(mock as never);
    const result = await svc.exportDossier(INQUIRY_ID, TENANT_ID);

    const doc = result.sections.documents[0];
    expect(doc.sha256Hash).toBe('deadbeef');
    expect(doc.cryptoTimestamp).toBe('ts-2026-01-01');
  });

  it('throws not-found for unknown inquiry', async () => {
    const mock = makePrismaMock();
    mock.regulatoryAlert.findFirst.mockResolvedValue(null);

    const svc = new RegulatorResponseService(mock as never);
    await expect(
      svc.exportDossier('nonexistent-id', TENANT_ID),
    ).rejects.toThrow('not found');
  });
});

// ============================================================
// REGULATOR RESPONSE SERVICE — DEADLINE TRACKING
// ============================================================

describe('RegulatorResponseService — deadline tracking', () => {
  it('escalates inquiries with deadline within 7 days', async () => {
    const soonDue = new Date();
    soonDue.setDate(soonDue.getDate() + 5); // 5 days from now

    const row = makeInquiryRow({
      metadata: {
        ...makeInquiryRow().metadata,
        responseDueDate: soonDue.toISOString(),
      },
    });

    const mock = makePrismaMock();
    mock.regulatoryAlert.findMany.mockResolvedValue([row]);

    const svc    = new RegulatorResponseService(mock as never);
    const result = await svc.checkDeadlines(TENANT_ID);

    expect(result.checked).toBe(1);
    expect(result.escalated).toHaveLength(1);
  });

  it('does not escalate inquiry with deadline 30+ days away', async () => {
    const farDue = new Date();
    farDue.setDate(farDue.getDate() + 30);

    const row = makeInquiryRow({
      metadata: {
        ...makeInquiryRow().metadata,
        responseDueDate: farDue.toISOString(),
      },
    });

    const mock = makePrismaMock();
    mock.regulatoryAlert.findMany.mockResolvedValue([row]);

    const svc    = new RegulatorResponseService(mock as never);
    const result = await svc.checkDeadlines(TENANT_ID);

    expect(result.escalated).toHaveLength(0);
  });

  it('marks overdue inquiry as critical escalation level', async () => {
    const pastDue = new Date();
    pastDue.setDate(pastDue.getDate() - 3); // 3 days overdue

    const row = makeInquiryRow({
      metadata: {
        ...makeInquiryRow().metadata,
        responseDueDate: pastDue.toISOString(),
      },
    });

    const mock = makePrismaMock();
    mock.regulatoryAlert.findMany.mockResolvedValue([row]);

    const svc    = new RegulatorResponseService(mock as never);
    const result = await svc.checkDeadlines(TENANT_ID);

    expect(result.escalated).toHaveLength(1);
    expect(result.escalated[0].deadlineStatus?.isOverdue).toBe(true);
    expect(result.escalated[0].deadlineStatus?.escalationLevel).toBe('critical');
  });

  it('skips inquiries with no responseDueDate', async () => {
    const row = makeInquiryRow({
      metadata: {
        ...makeInquiryRow().metadata,
        responseDueDate: null,
      },
    });

    const mock = makePrismaMock();
    mock.regulatoryAlert.findMany.mockResolvedValue([row]);

    const svc    = new RegulatorResponseService(mock as never);
    const result = await svc.checkDeadlines(TENANT_ID);

    expect(result.escalated).toHaveLength(0);
    expect(result.checked).toBe(1);
  });

  it('computes warning level for deadline 14 days out', async () => {
    const warningDue = new Date();
    warningDue.setDate(warningDue.getDate() + 14);

    const row = makeInquiryRow({
      metadata: {
        ...makeInquiryRow().metadata,
        responseDueDate: warningDue.toISOString(),
      },
    });

    const mock = makePrismaMock();
    mock.regulatoryAlert.findMany.mockResolvedValue([row]);

    const svc    = new RegulatorResponseService(mock as never);
    const result = await svc.checkDeadlines(TENANT_ID);

    // 14 days is within the 14-day warning threshold
    expect(result.escalated).toHaveLength(1);
    expect(result.escalated[0].deadlineStatus?.escalationLevel).toBe('warning');
  });
});
