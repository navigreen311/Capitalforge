// ============================================================
// The compliance manifest says what it is, and what it is not
//
//   - Nine fetches ran in one `Promise.all` and five filtered on `businessId`
//     alone. The ownership check came AFTER the await, so it did not precede
//     the queries it was meant to gate: they ran against another tenant's rows
//     and were discarded by the throw. Safe by arrangement, not construction.
//   - `timestampsTampered: 0` meant either "all verified" or "none checkable",
//     and a reader could not tell. It is the field a regulator reads first.
//   - `?since=last-tuesday` became an Invalid Date and then either a driver
//     error or a filter matching nothing.
//   - One `filterSince` described four clocks: signedAt, authorizedAt and two
//     createdAt.
//   - It was called a "packet" that "can be zipped and handed to regulators".
//     It contains document references and nothing builds an archive.
//   - Four record types were absent with nothing saying so.
//   - `assembledBy` was whoever called, unverified, on a document handed to
//     counsel.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  ComplianceDossierService,
  BusinessNotFoundForDossierError,
  InvalidDateRangeError,
  UnknownRequesterError,
  EXCLUDED_RECORD_TYPES,
  FILTERED_DATE_FIELDS,
} from '../../../src/backend/services/compliance-dossier.js';

const TENANT = 'tenant-1';
const BUSINESS = 'biz-1';
const USER = 'user-1';

const userFindFirst = vi.fn();
const businessFindFirst = vi.fn();
const findMany = {
  consentRecord: vi.fn(),
  productAcknowledgment: vi.fn(),
  cardApplication: vi.fn(),
  costCalculation: vi.fn(),
  achAuthorization: vi.fn(),
  suitabilityCheck: vi.fn(),
  complianceCheck: vi.fn(),
  document: vi.fn(),
};

function service() {
  return new ComplianceDossierService({
    user: { findFirst: userFindFirst },
    business: { findFirst: businessFindFirst },
    consentRecord: { findMany: findMany.consentRecord },
    productAcknowledgment: { findMany: findMany.productAcknowledgment },
    cardApplication: { findMany: findMany.cardApplication },
    costCalculation: { findMany: findMany.costCalculation },
    achAuthorization: { findMany: findMany.achAuthorization },
    suitabilityCheck: { findMany: findMany.suitabilityCheck },
    complianceCheck: { findMany: findMany.complianceCheck },
    document: { findMany: findMany.document },
  } as never);
}

const BUSINESS_ROW = {
  id: BUSINESS,
  legalName: 'Acme Holdings LLC',
  dba: null,
  ein: null,
  entityType: 'llc',
  stateOfFormation: 'WA',
  dateOfFormation: new Date('2020-01-01'),
  industry: null,
  annualRevenue: null,
  fundingReadinessScore: 80,
  status: 'active',
};

function doc(over: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    documentType: 'statement',
    title: 'x.pdf',
    storageKey: 'uploads/x.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 10,
    sha256Hash: null,
    cryptoTimestamp: null,
    legalHold: false,
    uploadedBy: USER,
    createdAt: new Date('2026-06-01'),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userFindFirst.mockResolvedValue({ id: USER });
  businessFindFirst.mockResolvedValue(BUSINESS_ROW);
  for (const fn of Object.values(findMany)) fn.mockResolvedValue([]);
});

function assemble(over: Record<string, unknown> = {}) {
  return service().assemble({
    tenantId: TENANT,
    businessId: BUSINESS,
    requestedBy: USER,
    ...over,
  } as never);
}

describe('ownership is a gate, not a filter applied afterwards', () => {
  it('does not run the record queries at all when the business is not the caller’s', async () => {
    businessFindFirst.mockResolvedValue(null);

    await expect(assemble()).rejects.toBeInstanceOf(BusinessNotFoundForDossierError);

    // They used to run concurrently with the check and be discarded by it.
    for (const [name, fn] of Object.entries(findMany)) {
      expect(fn, name).not.toHaveBeenCalled();
    }
  });

  it('scopes every record query to the tenant as well', async () => {
    // Neither the gate nor the filter is load-bearing alone.
    await assemble();

    for (const [name, fn] of Object.entries(findMany)) {
      const [{ where }] = fn.mock.calls[0] as [{ where: Record<string, unknown> }];
      const scoped =
        where['tenantId'] === TENANT
        || (where['business'] as { tenantId?: string } | undefined)?.tenantId === TENANT;
      expect(scoped, `${name} is not tenant-scoped`).toBe(true);
    }
  });
});

describe('the third state on the field a regulator reads first', () => {
  it('counts documents that could not be checked, separately from clean ones', async () => {
    findMany.document.mockResolvedValue([
      doc({ id: 'd1' }),
      doc({ id: 'd2', sha256Hash: 'abc' }),
    ]);

    const m = await assemble();

    // Neither has both a hash and a timestamp, so neither was checkable.
    expect(m.summary.timestampsTampered).toBe(0);
    expect(m.summary.documentsUnverifiable).toBe(2);
    expect(m.summary.documentsVerified).toBe(0);
  });

  it('distinguishes a clean bill of health from an unchecked one', async () => {
    const m = await assemble();

    // No documents at all: nothing tampered, and nothing unverifiable either.
    expect(m.summary.documentsUnverifiable).toBe(0);
    expect(m.summary.totalDocuments).toBe(0);
  });
});

describe('the date range', () => {
  it('refuses a date it cannot read', async () => {
    await expect(assemble({ since: 'last-tuesday' })).rejects.toBeInstanceOf(
      InvalidDateRangeError,
    );
    // And nothing is queried on a range nobody could parse.
    expect(businessFindFirst).not.toHaveBeenCalled();
  });

  it('refuses a range that ends before it starts', async () => {
    // Matches nothing, and reads as "this client has no records".
    await expect(
      assemble({ since: '2026-06-01', until: '2026-01-01' }),
    ).rejects.toBeInstanceOf(InvalidDateRangeError);
  });

  it('accepts an ISO range', async () => {
    const m = await assemble({ since: '2026-01-01', until: '2026-06-01' });
    expect(m.filterSince).toBe('2026-01-01');
  });

  it('reports which date column each record type was filtered on', async () => {
    // One `filterSince` described four clocks and said one thing.
    const m = await assemble({ since: '2026-01-01' });

    expect(m.filteredFields).toEqual(FILTERED_DATE_FIELDS);
    expect(m.filteredFields['acknowledgments']).toBe('signedAt');
    expect(m.filteredFields['achAuthorizations']).toBe('authorizedAt');
    expect(m.filteredFields['suitabilityChecks']).toBe('createdAt');
  });
});

describe('what the manifest says it is', () => {
  it('declares that it carries references, not documents', async () => {
    const m = await assemble();
    expect(m.contents).toBe('references');
  });

  it('names what it does not contain', async () => {
    // A reader cannot otherwise tell an omitted record type from one that is
    // empty for this client.
    const m = await assemble();
    const named = m.excludedRecordTypes.map((e) => e.recordType);

    expect(named).toContain('comm_compliance_records');
    expect(named).toContain('ledger_events');
    expect(named).toContain('ai_decision_logs');
    expect(named).toContain('regulatory_dossier_exports');
    expect(m.excludedRecordTypes).toEqual(EXCLUDED_RECORD_TYPES);
  });

  it('gives a reason for each omission', async () => {
    for (const entry of EXCLUDED_RECORD_TYPES) {
      expect(entry.reason.length, entry.recordType).toBeGreaterThan(20);
    }
  });
});

describe('who assembled it', () => {
  it('is verified against users in this tenant', async () => {
    await assemble();

    const [{ where }] = userFindFirst.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toMatchObject({ id: USER, tenantId: TENANT });
  });

  it('refuses an id that resolves to nobody', async () => {
    // The provenance line on a document handed to counsel.
    userFindFirst.mockResolvedValue(null);

    await expect(assemble()).rejects.toBeInstanceOf(UnknownRequesterError);
    expect(businessFindFirst).not.toHaveBeenCalled();
  });
});
