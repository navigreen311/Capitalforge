// ============================================================
// What a complaint file holds, and whose records are in it
//
//   - `businessId` arrived in the request body and was written straight to the
//     row. For an unauthorized_debit complaint it then drove
//     `achAuthorization.findFirst({ where: { businessId } })` with no tenant
//     filter, returning a bank authorisation and fifty debit events for any
//     business in any tenant.
//   - `_autoAttachCallRecords(businessId, tenantId, supplied)` returned early
//     without a businessId and then never used it: the ten most recently
//     QA-scored calls IN THE WHOLE TENANT were attached as evidence, so a
//     complaint about one client carried recordings of conversations with ten
//     others.
//   - `type` was validated and then collapsed — call_record to one id array,
//     everything else to the other — so a debit event and a screenshot were
//     stored identically and the title and notes were discarded.
//   - The ledger event reported items SENT, not items added, so re-sending
//     fifty references the merge correctly ignored recorded fifty new
//     attachments that never happened.
//   - `addedBy` was `parsed.data.addedBy ?? userId`, so a caller could
//     attribute an attachment to somebody else.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@backend/events/event-bus.js', () => ({
  eventBus: {
    publish: vi.fn().mockResolvedValue(undefined),
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'e1', publishedAt: new Date() }),
  },
}));

vi.mock('@backend/config/database.js', () => ({ prisma: {} }));

import { eventBus } from '../../../src/backend/events/event-bus.js';
import {
  ComplaintService,
  UnknownComplaintBusinessError,
  type EvidenceItemRecord,
} from '../../../src/backend/services/complaint.service.js';

const publish = eventBus.publish as unknown as ReturnType<typeof vi.fn>;
const publishAndPersist = eventBus.publishAndPersist as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'tenant-1';
const BUSINESS = 'biz-1';
const USER = 'user-1';

const businessFindFirst = vi.fn();
const complaintCreate = vi.fn();
const complaintFindFirst = vi.fn();
const complaintUpdate = vi.fn();
const achFindFirst = vi.fn();
const qaFindMany = vi.fn();

function service() {
  return new ComplaintService({
    business: { findFirst: businessFindFirst },
    complaint: {
      create: complaintCreate,
      findFirst: complaintFindFirst,
      update: complaintUpdate,
    },
    achAuthorization: { findFirst: achFindFirst },
    advisorQaScore: { findMany: qaFindMany },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  publishAndPersist.mockResolvedValue({ id: 'e1', publishedAt: new Date() });
  businessFindFirst.mockResolvedValue({ id: BUSINESS });
  complaintCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...args.data, createdAt: new Date(), updatedAt: new Date() }),
  );
  complaintUpdate.mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'c-1',
      tenantId: TENANT,
      category: 'billing',
      status: 'open',
      ...args.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  );
  achFindFirst.mockResolvedValue(null);
  qaFindMany.mockResolvedValue([{ callRecordId: 'someone-elses-call' }]);
});

const base = {
  tenantId: TENANT,
  category: 'billing' as const,
  source: 'portal' as const,
  description: 'A complaint.',
  filedBy: USER,
};

describe('the business a complaint names', () => {
  it('is verified against the tenant before anything reads on it', async () => {
    await service().createComplaint({ ...base, businessId: BUSINESS });

    const [{ where }] = businessFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ id: BUSINESS, tenantId: TENANT });
  });

  it('is refused when it belongs to another tenant, before any row is written', async () => {
    businessFindFirst.mockResolvedValue(null);

    await expect(
      service().createComplaint({ ...base, businessId: 'other-tenant-biz' }),
    ).rejects.toBeInstanceOf(UnknownComplaintBusinessError);

    expect(complaintCreate).not.toHaveBeenCalled();
    expect(achFindFirst).not.toHaveBeenCalled();
  });

  it('scopes the ACH bundle through the business as well', async () => {
    // Neither the check nor the filter is load-bearing alone.
    achFindFirst.mockResolvedValue({
      id: 'ach-1',
      processorName: 'Acme ACH',
      authorizedAmount: 100,
      authorizedFrequency: 'monthly',
      status: 'active',
      signedDocumentRef: null,
      debitEvents: [],
    });

    await service().createComplaint({
      ...base,
      category: 'unauthorized_debit',
      businessId: BUSINESS,
    });

    const [{ where }] = achFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ businessId: BUSINESS, business: { tenantId: TENANT } });
  });
});

describe('nothing is auto-attached', () => {
  it('does not read QA scores at all', async () => {
    // The ten most recently QA-scored calls in the whole tenant, from any
    // advisor about any client, used to arrive as evidence on this complaint.
    await service().createComplaint({ ...base, businessId: BUSINESS });

    expect(qaFindMany).not.toHaveBeenCalled();
  });

  it('attaches only what the caller supplied at intake', async () => {
    await service().createComplaint({
      ...base,
      businessId: BUSINESS,
      initialCallRecordIds: ['call-mine'],
    });

    const [{ data }] = complaintCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.callRecordIds).toEqual(['call-mine']);
    expect(JSON.stringify(data.callRecordIds)).not.toContain('someone-elses-call');
  });
});

describe('evidence keeps its type', () => {
  beforeEach(() => {
    complaintFindFirst.mockResolvedValue({
      id: 'c-1',
      tenantId: TENANT,
      evidenceDocIds: [],
      callRecordIds: [],
      evidenceItems: [],
    });
  });

  it('stores a debit event and a screenshot distinguishably', async () => {
    // Both used to land in evidenceDocIds as bare strings.
    await service().attachEvidence({
      complaintId: 'c-1',
      tenantId: TENANT,
      addedBy: USER,
      evidenceItems: [
        { type: 'debit_event', referenceId: 'debit-1', title: 'The debit' },
        { type: 'screenshot', referenceId: 'shot-1', title: 'The screen' },
      ],
    });

    const [{ data }] = complaintUpdate.mock.calls[0] as [{ data: Record<string, unknown> }];
    const items = data.evidenceItems as EvidenceItemRecord[];

    expect(items.map((i) => i.type)).toEqual(['debit_event', 'screenshot']);
    expect(items.map((i) => i.title)).toEqual(['The debit', 'The screen']);
    // And the id arrays still work as the derived index everything reads.
    expect(data.evidenceDocIds).toEqual(['debit-1', 'shot-1']);
  });

  it('records who attached it and when', async () => {
    await service().attachEvidence({
      complaintId: 'c-1',
      tenantId: TENANT,
      addedBy: USER,
      evidenceItems: [{ type: 'document', referenceId: 'doc-1', title: 'A doc' }],
    });

    const [{ data }] = complaintUpdate.mock.calls[0] as [{ data: Record<string, unknown> }];
    const items = data.evidenceItems as EvidenceItemRecord[];

    expect(items[0]!.addedBy).toBe(USER);
    expect(items[0]!.addedAt).toEqual(expect.any(String));
  });
});

describe('the ledger event', () => {
  it('counts items added, not items sent', async () => {
    // The merge correctly ignored a re-send; the event reported it as fifty
    // new attachments.
    complaintFindFirst.mockResolvedValue({
      id: 'c-1',
      tenantId: TENANT,
      evidenceDocIds: ['doc-1'],
      callRecordIds: [],
      evidenceItems: [
        { type: 'document', referenceId: 'doc-1', title: null, notes: null, addedBy: USER, addedAt: '2026-09-01' },
      ],
    });

    await service().attachEvidence({
      complaintId: 'c-1',
      tenantId: TENANT,
      addedBy: USER,
      evidenceItems: [
        { type: 'document', referenceId: 'doc-1', title: 'Already here' },
        { type: 'document', referenceId: 'doc-2', title: 'New' },
      ],
    });

    const [, envelope] = publishAndPersist.mock.calls[0] as [string, { payload: Record<string, unknown> }];
    expect(envelope.payload.newItems).toBe(1);
    expect(envelope.payload.itemsSubmitted).toBe(2);
  });

  it('reaches the ledger rather than only the process', async () => {
    complaintFindFirst.mockResolvedValue({
      id: 'c-1', tenantId: TENANT, evidenceDocIds: [], callRecordIds: [], evidenceItems: [],
    });

    await service().attachEvidence({
      complaintId: 'c-1',
      tenantId: TENANT,
      addedBy: USER,
      evidenceItems: [{ type: 'document', referenceId: 'doc-1', title: 'A doc' }],
    });

    expect(publishAndPersist).toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('the unauthorized-debit bundle', () => {
  it('says when it was built and that it is a snapshot', async () => {
    // Built at filing and never rebuilt, so debits after that do not appear.
    // Defensible for evidence; indistinguishable from a current view until it
    // carried the date.
    achFindFirst.mockResolvedValue({
      id: 'ach-1',
      processorName: 'Acme ACH',
      authorizedAmount: 100,
      authorizedFrequency: 'monthly',
      status: 'active',
      signedDocumentRef: null,
      debitEvents: [],
    });

    const result = await service().createComplaint({
      ...base,
      category: 'unauthorized_debit',
      businessId: BUSINESS,
    });

    expect(result.unauthorizedDebitBundle?.isSnapshot).toBe(true);
    expect(result.unauthorizedDebitBundle?.builtAt).toEqual(expect.any(String));
  });
});
