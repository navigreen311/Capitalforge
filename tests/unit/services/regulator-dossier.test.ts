// ============================================================
// What a regulator dossier claims, and what it leaves out
//
//   - `preservedDocumentIds` was `documents.map(d => d.id)` — every document
//     for the business, now — under a hold timestamped earlier, with no filter
//     on `d.legalHold` and none on the activation date. A document whose own
//     flag was false, and a document created after the hold, both appeared in a
//     list called PRESERVED. That is a fabricated provenance claim inside a
//     legal-hold record going to a regulator.
//   - `activateLegalHold` resolved the business from `metadata['businessId']`
//     alone while `exportDossier` read the column first, so a backfilled
//     inquiry flagged no documents at all while the export reported every one
//     of them as preserved.
//   - The ACH read was `where: { businessId }` while the four beside it named
//     the tenant.
//   - Every fetch carried a `businessId ? … : Promise.resolve([])` guard that
//     became unreachable when the refusal above it was added — with the comment
//     explaining that those guards WERE the defect sitting on top of them.
//   - `generatedBy` was optional, so an evidence export could be attributed to
//     nobody, and the null was persisted to the stored row.
//   - Hashes and timestamp tokens were passed through unverified, on the one
//     artefact that actually goes to a regulator.
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
  RegulatorResponseService,
  UnknownDossierRequesterError,
  DOSSIER_EXCLUDED_RECORD_TYPES,
} from '../../../src/backend/services/regulator-response.service.js';

const publishAndPersist = eventBus.publishAndPersist as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'tenant-001';
const BIZ = 'biz-001';
const INQUIRY = 'inquiry-001';
const USER = 'user-001';

const HOLD_AT = new Date('2026-06-01T00:00:00.000Z');
const BEFORE_HOLD = new Date('2026-05-01T00:00:00.000Z');
const AFTER_HOLD = new Date('2026-07-01T00:00:00.000Z');

function doc(over: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    documentType: 'consent',
    title: 'A doc',
    storageKey: 'key/1',
    createdAt: BEFORE_HOLD,
    legalHold: true,
    sha256Hash: null,
    cryptoTimestamp: null,
    ...over,
  };
}

function mocks(over: Record<string, unknown> = {}) {
  return {
    regulatoryAlert: {
      findFirst: vi.fn().mockResolvedValue({
        id: INQUIRY,
        tenantId: TENANT,
        businessId: BIZ,
        ruleType: 'CFPB',
        createdAt: new Date(),
        metadata: { legalHoldActivatedAt: HOLD_AT.toISOString(), legalHoldActivatedBy: USER },
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    user: { findFirst: vi.fn().mockResolvedValue({ id: USER }) },
    document: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    complaint: { findMany: vi.fn().mockResolvedValue([]) },
    consentRecord: { findMany: vi.fn().mockResolvedValue([]) },
    complianceCheck: { findMany: vi.fn().mockResolvedValue([]) },
    achAuthorization: { findMany: vi.fn().mockResolvedValue([]) },
    regulatoryDossierExport: { create: vi.fn().mockResolvedValue({}) },
    ...over,
  };
}

let m: ReturnType<typeof mocks>;
beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks clears calls, NOT implementations. The write-ordering test
  // below installs one; without this it would leak into every test after it.
  publishAndPersist.mockReset();
  publishAndPersist.mockResolvedValue({ id: 'e1', publishedAt: new Date() });
  m = mocks();
});

const svc = () => new RegulatorResponseService(m as never);

describe('the legal-hold preservation list', () => {
  it('excludes a document that is not under hold', async () => {
    m.document.findMany.mockResolvedValue([
      doc({ id: 'held', legalHold: true }),
      doc({ id: 'not-held', legalHold: false }),
    ]);

    const d = await svc().exportDossier(INQUIRY, TENANT, USER);

    expect(d.sections.legalHoldSummary!.preservedDocumentIds).toEqual(['held']);
    expect(d.sections.legalHoldSummary!.documentCount).toBe(1);
  });

  it('excludes a document created after the hold was activated', async () => {
    // A hold cannot have preserved a document that did not exist when it ran.
    m.document.findMany.mockResolvedValue([
      doc({ id: 'existed', createdAt: BEFORE_HOLD, legalHold: true }),
      doc({ id: 'came-later', createdAt: AFTER_HOLD, legalHold: true }),
    ]);

    const d = await svc().exportDossier(INQUIRY, TENANT, USER);

    expect(d.sections.legalHoldSummary!.preservedDocumentIds).toEqual(['existed']);
  });

  it('still reports every document in the documents section', async () => {
    // Narrowing the hold list must not narrow what the dossier discloses.
    m.document.findMany.mockResolvedValue([
      doc({ id: 'held', legalHold: true }),
      doc({ id: 'not-held', legalHold: false }),
    ]);

    const d = await svc().exportDossier(INQUIRY, TENANT, USER);

    expect(d.sections.documents.map((x) => x.id)).toEqual(['held', 'not-held']);
    expect(d.totalDocuments).toBe(2);
  });

  it('resolves the business from the column when metadata omits it', async () => {
    // activateLegalHold read metadata['businessId'] alone while the export read
    // the column, so the two halves disagreed for a backfilled inquiry.
    m.regulatoryAlert.findFirst.mockResolvedValue({
      id: INQUIRY, tenantId: TENANT, businessId: BIZ, ruleType: 'CFPB',
      createdAt: new Date(), metadata: {},
    });

    await svc().activateLegalHold(INQUIRY, TENANT, USER);

    const [{ where }] = m.document.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ tenantId: TENANT, businessId: BIZ });
  });
});

describe('the queries the dossier runs', () => {
  it('scopes the ACH read through the tenant', async () => {
    await svc().exportDossier(INQUIRY, TENANT, USER);

    const [{ where }] = m.achAuthorization.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ businessId: BIZ, business: { tenantId: TENANT } });
  });

  it('runs every fetch rather than guarding it on a value already refused', async () => {
    await svc().exportDossier(INQUIRY, TENANT, USER);

    for (const table of [m.document, m.complaint, m.consentRecord, m.complianceCheck, m.achAuthorization]) {
      expect(table.findMany).toHaveBeenCalledTimes(1);
    }
  });
});

describe('who exported it', () => {
  it('refuses an id that resolves to nobody, before anything is written', async () => {
    m.user.findFirst.mockResolvedValue(null);

    await expect(svc().exportDossier(INQUIRY, TENANT, 'ghost'))
      .rejects.toBeInstanceOf(UnknownDossierRequesterError);

    expect(m.regulatoryDossierExport.create).not.toHaveBeenCalled();
    expect(m.document.findMany).not.toHaveBeenCalled();
  });

  it('verifies the requester against the tenant, not just the id', async () => {
    await svc().exportDossier(INQUIRY, TENANT, USER);

    const [{ where }] = m.user.findFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ id: USER, tenantId: TENANT });
  });

  it('persists the requester to the stored export row', async () => {
    await svc().exportDossier(INQUIRY, TENANT, USER);

    const [{ data }] = m.regulatoryDossierExport.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data.generatedBy).toBe(USER);
  });
});

describe('what the dossier says about itself', () => {
  it('declares that it carries references rather than documents', async () => {
    const d = await svc().exportDossier(INQUIRY, TENANT, USER);
    expect(d.contents).toBe('references');
  });

  it('names what it omits, so an omission is not read as an empty record set', async () => {
    const d = await svc().exportDossier(INQUIRY, TENANT, USER);
    const omitted = d.excludedRecordTypes.map((e) => e.recordType);

    // Each of these is carried by the sibling per-business manifest and not
    // here, and a reader cannot otherwise tell that from "this client has none".
    expect(omitted).toContain('product_acknowledgments');
    expect(omitted).toContain('card_applications');
    expect(omitted).toContain('suitability_checks');
    expect(d.excludedRecordTypes.every((e) => e.reason.length > 0)).toBe(true);
  });

  it('exports the exclusion list so callers can assert on it', () => {
    expect(DOSSIER_EXCLUDED_RECORD_TYPES.length).toBeGreaterThan(0);
  });
});

describe('document integrity is checked, not passed through', () => {
  it('counts a document with no hash as unverifiable rather than as sound', async () => {
    m.document.findMany.mockResolvedValue([doc({ sha256Hash: null, cryptoTimestamp: null })]);

    const d = await svc().exportDossier(INQUIRY, TENANT, USER);

    expect(d.sections.documents[0]!.timestampIntegrity).toBe('unverifiable');
    expect(d.documentsUnverifiable).toBe(1);
    expect(d.documentsVerified).toBe(0);
    expect(d.documentsTampered).toBe(0);
  });

  it('reports a token that does not match as tampered', async () => {
    m.document.findMany.mockResolvedValue([
      doc({ sha256Hash: 'deadbeef', cryptoTimestamp: 'v1:not-the-right-hash' }),
    ]);

    const d = await svc().exportDossier(INQUIRY, TENANT, USER);

    expect(d.sections.documents[0]!.timestampIntegrity).toBe('tampered');
    expect(d.documentsTampered).toBe(1);
  });

  it('the three counts account for every document', async () => {
    m.document.findMany.mockResolvedValue([
      doc({ id: 'a', sha256Hash: null }),
      doc({ id: 'b', sha256Hash: 'deadbeef', cryptoTimestamp: 'v1:wrong' }),
    ]);

    const d = await svc().exportDossier(INQUIRY, TENANT, USER);

    expect(d.documentsVerified + d.documentsUnverifiable + d.documentsTampered)
      .toBe(d.totalDocuments);
  });
});

describe('the order of the two writes', () => {
  it('does not announce an export that was never written', async () => {
    // The event used to be published first, so a failing `create` left
    // `regulator.dossier.exported` in the ledger carrying an exportId that
    // resolved to nothing — an event attributing an artefact to a record that
    // was never created.
    m.regulatoryDossierExport.create.mockRejectedValue(new Error('write failed'));

    await expect(svc().exportDossier(INQUIRY, TENANT, USER)).rejects.toThrow('write failed');

    expect(publishAndPersist).not.toHaveBeenCalled();
  });

  it('writes the row before emitting the event on the happy path', async () => {
    const order: string[] = [];
    m.regulatoryDossierExport.create.mockImplementation(() => {
      order.push('row');
      return Promise.resolve({});
    });
    publishAndPersist.mockImplementation(() => {
      order.push('event');
      return Promise.resolve({ id: 'e1', publishedAt: new Date() });
    });

    await svc().exportDossier(INQUIRY, TENANT, USER);

    expect(order).toEqual(['row', 'event']);
  });

  it('still emits the event, carrying the exportId that now resolves', async () => {
    const d = await svc().exportDossier(INQUIRY, TENANT, USER);

    const [, envelope] = publishAndPersist.mock.calls.at(-1) as [
      string, { payload: Record<string, unknown> },
    ];
    const [{ data }] = m.regulatoryDossierExport.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];

    expect(envelope.payload.exportId).toBe(d.exportId);
    expect(data.id).toBe(d.exportId);
  });
});
