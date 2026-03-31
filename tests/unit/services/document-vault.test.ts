// ============================================================
// Unit Tests — Document Vault Service, Crypto Timestamp, Compliance Dossier
//
// Run standalone:
//   npx vitest run tests/unit/services/document-vault.test.ts
//
// Coverage:
//   - CryptoTimestamp: generation, verification, tamper detection
//   - DocumentVaultService: upload, list, retrieve, legal hold, deletion guard, auto-file
//   - ComplianceDossierService: dossier assembly, timestamp integrity, summary counts
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashContent,
  sha256Hex,
  generateCryptoTimestamp,
  verifyCryptoTimestamp,
  parseTokenRecord,
} from '../../../src/backend/services/crypto-timestamp.js';
import {
  DocumentVaultService,
  DocumentNotFoundError,
  DocumentOnLegalHoldError,
  type UploadDocumentInput,
} from '../../../src/backend/services/document-vault.service.js';
import {
  ComplianceDossierService,
  BusinessNotFoundForDossierError,
} from '../../../src/backend/services/compliance-dossier.js';

// ── Fixtures ────────────────────────────────────────────────────

const TENANT_ID    = 'tenant-abc-123';
const BUSINESS_ID  = 'biz-xyz-456';
const DOCUMENT_ID  = 'doc-aaa-111';
const USER_ID      = 'user-001';

const SAMPLE_CONTENT = Buffer.from('Hello, CapitalForge Document Vault!', 'utf-8');
const SAMPLE_HASH    = hashContent(SAMPLE_CONTENT);

function makeUploadInput(overrides: Partial<UploadDocumentInput> = {}): UploadDocumentInput {
  return {
    tenantId:     TENANT_ID,
    businessId:   BUSINESS_ID,
    uploadedBy:   USER_ID,
    documentType: 'consent_form',
    title:        'TCPA Consent Form',
    mimeType:     'application/pdf',
    content:      SAMPLE_CONTENT,
    ...overrides,
  };
}

// ── Prisma mock factory ──────────────────────────────────────────
// Returns a minimal mock PrismaClient shaped for the document vault tests.

function makeDocumentRow(overrides: Record<string, unknown> = {}) {
  return {
    id:              DOCUMENT_ID,
    tenantId:        TENANT_ID,
    businessId:      BUSINESS_ID,
    documentType:    'consent_form',
    title:           'TCPA Consent Form',
    storageKey:      `${TENANT_ID}/${BUSINESS_ID}/consent_form/${DOCUMENT_ID}/tcpa_consent_form`,
    mimeType:        'application/pdf',
    sizeBytes:       SAMPLE_CONTENT.length,
    sha256Hash:      SAMPLE_HASH,
    cryptoTimestamp: null,
    legalHold:       false,
    metadata:        {},
    uploadedBy:      USER_ID,
    createdAt:       new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

function makeMockPrisma() {
  const documentRow = makeDocumentRow();

  return {
    document: {
      create:     vi.fn().mockResolvedValue(documentRow),
      update:     vi.fn().mockResolvedValue(documentRow),
      findFirst:  vi.fn().mockResolvedValue(documentRow),
      findMany:   vi.fn().mockResolvedValue([documentRow]),
      count:      vi.fn().mockResolvedValue(1),
      delete:     vi.fn().mockResolvedValue(documentRow),
    },
    business:             { findFirst:  vi.fn().mockResolvedValue(null) },
    consentRecord:        { findMany:   vi.fn().mockResolvedValue([]) },
    productAcknowledgment:{ findMany:   vi.fn().mockResolvedValue([]) },
    cardApplication:      { findMany:   vi.fn().mockResolvedValue([]) },
    costCalculation:      { findMany:   vi.fn().mockResolvedValue([]) },
    achAuthorization:     { findMany:   vi.fn().mockResolvedValue([]) },
    suitabilityCheck:     { findMany:   vi.fn().mockResolvedValue([]) },
    complianceCheck:      { findMany:   vi.fn().mockResolvedValue([]) },
  };
}

function makeMockEventBus() {
  return {
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'evt-001', publishedAt: new Date() }),
  };
}

// ================================================================
// SECTION 1 — CryptoTimestamp
// ================================================================

describe('CryptoTimestamp — hashContent', () => {
  it('returns a 64-character hex string', () => {
    const hash = hashContent(SAMPLE_CONTENT);
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('is deterministic for the same content', () => {
    const h1 = hashContent(Buffer.from('same content'));
    const h2 = hashContent(Buffer.from('same content'));
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different content', () => {
    const h1 = hashContent(Buffer.from('document A'));
    const h2 = hashContent(Buffer.from('document B'));
    expect(h1).not.toBe(h2);
  });
});

describe('CryptoTimestamp — sha256Hex', () => {
  it('hashes a string input', () => {
    const result = sha256Hex('test string');
    expect(result).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
  });
});

describe('CryptoTimestamp — generateCryptoTimestamp', () => {
  const validInput = {
    contentHash: SAMPLE_HASH,
    timestamp:   '2026-01-15T10:00:00.000Z',
    tenantId:    TENANT_ID,
    documentId:  DOCUMENT_ID,
  };

  it('returns a token with v1 prefix', () => {
    const record = generateCryptoTimestamp(validInput);
    expect(record.token).toMatch(/^v1:[0-9a-f]{64}$/);
  });

  it('returns version "v1"', () => {
    const record = generateCryptoTimestamp(validInput);
    expect(record.version).toBe('v1');
  });

  it('echoes back the timestamp and contentHash', () => {
    const record = generateCryptoTimestamp(validInput);
    expect(record.timestamp).toBe(validInput.timestamp);
    expect(record.contentHash).toBe(validInput.contentHash);
  });

  it('is deterministic — same inputs yield same token', () => {
    const r1 = generateCryptoTimestamp(validInput);
    const r2 = generateCryptoTimestamp(validInput);
    expect(r1.token).toBe(r2.token);
  });

  it('produces different tokens for different documentId', () => {
    const r1 = generateCryptoTimestamp({ ...validInput, documentId: 'doc-1' });
    const r2 = generateCryptoTimestamp({ ...validInput, documentId: 'doc-2' });
    expect(r1.token).not.toBe(r2.token);
  });

  it('produces different tokens for different tenantId', () => {
    const r1 = generateCryptoTimestamp({ ...validInput, tenantId: 'tenant-A' });
    const r2 = generateCryptoTimestamp({ ...validInput, tenantId: 'tenant-B' });
    expect(r1.token).not.toBe(r2.token);
  });

  it('produces different tokens for different timestamps', () => {
    const r1 = generateCryptoTimestamp({ ...validInput, timestamp: '2026-01-15T10:00:00.000Z' });
    const r2 = generateCryptoTimestamp({ ...validInput, timestamp: '2026-01-15T10:00:01.000Z' });
    expect(r1.token).not.toBe(r2.token);
  });

  it('throws when contentHash is invalid', () => {
    expect(() =>
      generateCryptoTimestamp({ ...validInput, contentHash: 'not-a-hash' }),
    ).toThrow('[CryptoTimestamp]');
  });

  it('throws when timestamp is invalid', () => {
    expect(() =>
      generateCryptoTimestamp({ ...validInput, timestamp: 'not-a-date' }),
    ).toThrow('[CryptoTimestamp]');
  });

  it('throws when tenantId is empty', () => {
    expect(() =>
      generateCryptoTimestamp({ ...validInput, tenantId: '' }),
    ).toThrow('[CryptoTimestamp]');
  });

  it('throws when documentId is empty', () => {
    expect(() =>
      generateCryptoTimestamp({ ...validInput, documentId: '' }),
    ).toThrow('[CryptoTimestamp]');
  });
});

describe('CryptoTimestamp — verifyCryptoTimestamp', () => {
  const input = {
    contentHash: SAMPLE_HASH,
    timestamp:   '2026-01-15T10:00:00.000Z',
    tenantId:    TENANT_ID,
    documentId:  DOCUMENT_ID,
  };

  it('returns valid: true for a legitimately generated token', () => {
    const record = generateCryptoTimestamp(input);
    const result = verifyCryptoTimestamp(record.token, input);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns valid: false when contentHash is mutated (tamper detection)', () => {
    const record = generateCryptoTimestamp(input);
    const tampered = {
      ...input,
      contentHash: sha256Hex('different content'),
    };
    const result = verifyCryptoTimestamp(record.token, tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not match/i);
  });

  it('returns valid: false when tenantId is mutated', () => {
    const record = generateCryptoTimestamp(input);
    const result = verifyCryptoTimestamp(record.token, { ...input, tenantId: 'tenant-EVIL' });
    expect(result.valid).toBe(false);
  });

  it('returns valid: false when timestamp is mutated', () => {
    const record = generateCryptoTimestamp(input);
    const result = verifyCryptoTimestamp(record.token, {
      ...input,
      timestamp: '2020-01-01T00:00:00.000Z',
    });
    expect(result.valid).toBe(false);
  });

  it('returns valid: false when documentId is mutated', () => {
    const record = generateCryptoTimestamp(input);
    const result = verifyCryptoTimestamp(record.token, { ...input, documentId: 'doc-FAKE' });
    expect(result.valid).toBe(false);
  });

  it('returns valid: false for a completely forged token', () => {
    const forged = `v1:${'a'.repeat(64)}`;
    const result = verifyCryptoTimestamp(forged, input);
    expect(result.valid).toBe(false);
  });

  it('returns valid: false for a token with unknown version', () => {
    const record = generateCryptoTimestamp(input);
    const wrongVersion = record.token.replace('v1:', 'v99:');
    const result = verifyCryptoTimestamp(wrongVersion, input);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/unsupported token version/i);
  });

  it('returns valid: false for a malformed token (no colon)', () => {
    const result = verifyCryptoTimestamp('notavalidtoken', input);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/malformed/i);
  });

  it('returns valid: false for empty token string', () => {
    const result = verifyCryptoTimestamp('', input);
    expect(result.valid).toBe(false);
  });
});

describe('CryptoTimestamp — parseTokenRecord', () => {
  it('extracts proofHash, version, timestamp, and contentHash', () => {
    const input = {
      contentHash: SAMPLE_HASH,
      timestamp:   '2026-01-15T10:00:00.000Z',
      tenantId:    TENANT_ID,
      documentId:  DOCUMENT_ID,
    };
    const record = generateCryptoTimestamp(input);
    const parsed = parseTokenRecord(record);

    expect(parsed.version).toBe('v1');
    expect(parsed.timestamp).toBe(input.timestamp);
    expect(parsed.contentHash).toBe(input.contentHash);
    expect(parsed.proofHash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(parsed.proofHash)).toBe(true);
  });
});

// ================================================================
// SECTION 2 — DocumentVaultService
// ================================================================

describe('DocumentVaultService — upload', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let eventBus: ReturnType<typeof makeMockEventBus>;
  let service: DocumentVaultService;

  beforeEach(() => {
    prisma   = makeMockPrisma();
    eventBus = makeMockEventBus();
    service  = new DocumentVaultService(prisma as never, eventBus as never);
  });

  it('creates a document record via prisma.document.create', async () => {
    await service.upload(makeUploadInput());
    expect(prisma.document.create).toHaveBeenCalledOnce();
  });

  it('updates the record with storageKey and cryptoTimestamp', async () => {
    await service.upload(makeUploadInput());
    expect(prisma.document.update).toHaveBeenCalledOnce();

    const updateCall = prisma.document.update.mock.calls[0][0];
    expect(updateCall.data.storageKey).toContain(TENANT_ID);
    expect(updateCall.data.cryptoTimestamp).toMatch(/^v1:[0-9a-f]{64}$/);
  });

  it('stores the SHA-256 hash of the content in the create call', async () => {
    await service.upload(makeUploadInput());

    const createCall = prisma.document.create.mock.calls[0][0];
    expect(createCall.data.sha256Hash).toBe(SAMPLE_HASH);
  });

  it('stores the byte size of the content', async () => {
    await service.upload(makeUploadInput());

    const createCall = prisma.document.create.mock.calls[0][0];
    expect(createCall.data.sizeBytes).toBe(SAMPLE_CONTENT.length);
  });

  it('publishes a DOCUMENT_UPLOADED event', async () => {
    await service.upload(makeUploadInput());
    expect(eventBus.publishAndPersist).toHaveBeenCalledOnce();

    const [tenantId, envelope] = eventBus.publishAndPersist.mock.calls[0];
    expect(tenantId).toBe(TENANT_ID);
    expect(envelope.eventType).toBe('document.uploaded');
    expect(envelope.aggregateType).toBe('document');
  });

  it('event payload does NOT contain raw content or full PII', async () => {
    await service.upload(makeUploadInput());

    const [, envelope] = eventBus.publishAndPersist.mock.calls[0];
    const payloadKeys = Object.keys(envelope.payload as object);
    expect(payloadKeys).not.toContain('content');
    expect(payloadKeys).not.toContain('ssn');
  });

  it('handles upload without businessId (tenant-level document)', async () => {
    const input = makeUploadInput({ businessId: undefined });
    await expect(service.upload(input)).resolves.not.toThrow();
  });

  it('storageKey is namespaced under tenantId', async () => {
    await service.upload(makeUploadInput());
    const updateCall = prisma.document.update.mock.calls[0][0];
    expect(updateCall.data.storageKey).toMatch(new RegExp(`^${TENANT_ID}/`));
  });

  it('hash is different for different content', async () => {
    const content1 = Buffer.from('document one');
    const content2 = Buffer.from('document two');
    expect(hashContent(content1)).not.toBe(hashContent(content2));
  });
});

describe('DocumentVaultService — list', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let service: DocumentVaultService;

  beforeEach(() => {
    prisma  = makeMockPrisma();
    service = new DocumentVaultService(prisma as never, makeMockEventBus() as never);
  });

  it('returns documents with pagination metadata', async () => {
    const result = await service.list({ tenantId: TENANT_ID, businessId: BUSINESS_ID });
    expect(result.documents).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('always includes tenantId in the where clause', async () => {
    await service.list({ tenantId: TENANT_ID });
    const whereClause = prisma.document.findMany.mock.calls[0][0].where;
    expect(whereClause.tenantId).toBe(TENANT_ID);
  });

  it('applies businessId filter when provided', async () => {
    await service.list({ tenantId: TENANT_ID, businessId: BUSINESS_ID });
    const whereClause = prisma.document.findMany.mock.calls[0][0].where;
    expect(whereClause.businessId).toBe(BUSINESS_ID);
  });

  it('applies documentType filter when provided', async () => {
    await service.list({ tenantId: TENANT_ID, documentType: 'contract' });
    const whereClause = prisma.document.findMany.mock.calls[0][0].where;
    expect(whereClause.documentType).toBe('contract');
  });

  it('applies legalHold filter when provided', async () => {
    await service.list({ tenantId: TENANT_ID, legalHold: true });
    const whereClause = prisma.document.findMany.mock.calls[0][0].where;
    expect(whereClause.legalHold).toBe(true);
  });

  it('applies since date filter', async () => {
    await service.list({ tenantId: TENANT_ID, since: '2026-01-01T00:00:00Z' });
    const whereClause = prisma.document.findMany.mock.calls[0][0].where;
    expect(whereClause.createdAt).toBeDefined();
    expect(whereClause.createdAt.gte).toBeInstanceOf(Date);
  });

  it('respects custom page size', async () => {
    await service.list({ tenantId: TENANT_ID, pageSize: 50 });
    const queryArgs = prisma.document.findMany.mock.calls[0][0];
    expect(queryArgs.take).toBe(50);
  });

  it('caps page size at 100', async () => {
    await service.list({ tenantId: TENANT_ID, pageSize: 9999 });
    const queryArgs = prisma.document.findMany.mock.calls[0][0];
    expect(queryArgs.take).toBe(100);
  });
});

describe('DocumentVaultService — retrieve', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let service: DocumentVaultService;

  beforeEach(() => {
    prisma  = makeMockPrisma();
    service = new DocumentVaultService(prisma as never, makeMockEventBus() as never);
  });

  it('returns document and presigned URL stub', async () => {
    const result = await service.retrieve(DOCUMENT_ID, TENANT_ID);
    expect(result.document.id).toBe(DOCUMENT_ID);
    expect(result.presignedUrl).toContain('s3');
    expect(result.presignedUrl).toContain('X-Amz-Stub=true');
    expect(result.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  it('throws DocumentNotFoundError when document does not exist', async () => {
    prisma.document.findFirst.mockResolvedValueOnce(null);
    await expect(service.retrieve('ghost-id', TENANT_ID)).rejects.toThrow(
      DocumentNotFoundError,
    );
  });

  it('is tenant-scoped — queries with tenantId in the where clause', async () => {
    await service.retrieve(DOCUMENT_ID, TENANT_ID);
    const whereClause = prisma.document.findFirst.mock.calls[0][0].where;
    expect(whereClause.tenantId).toBe(TENANT_ID);
    expect(whereClause.id).toBe(DOCUMENT_ID);
  });

  it('presigned URL expires in the future', async () => {
    const result = await service.retrieve(DOCUMENT_ID, TENANT_ID);
    expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

describe('DocumentVaultService — legal hold', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let service: DocumentVaultService;

  beforeEach(() => {
    prisma  = makeMockPrisma();
    service = new DocumentVaultService(prisma as never, makeMockEventBus() as never);
  });

  it('sets legalHold to true and updates metadata', async () => {
    await service.setLegalHold(DOCUMENT_ID, TENANT_ID, true, USER_ID);
    const updateCall = prisma.document.update.mock.calls[0][0];
    expect(updateCall.data.legalHold).toBe(true);
    expect(updateCall.data.metadata.legalHoldSetAt).toBeTruthy();
    expect(updateCall.data.metadata.legalHoldSetBy).toBe(USER_ID);
  });

  it('sets legalHold to false (lifts hold) and records removal in metadata', async () => {
    // Simulate a document already on legal hold
    prisma.document.findFirst.mockResolvedValueOnce(
      makeDocumentRow({ legalHold: true }),
    );
    prisma.document.update.mockResolvedValueOnce(
      makeDocumentRow({ legalHold: false }),
    );

    await service.setLegalHold(DOCUMENT_ID, TENANT_ID, false, USER_ID);
    const updateCall = prisma.document.update.mock.calls[0][0];
    expect(updateCall.data.legalHold).toBe(false);
  });

  it('throws DocumentNotFoundError when document does not exist', async () => {
    prisma.document.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.setLegalHold('ghost-id', TENANT_ID, true, USER_ID),
    ).rejects.toThrow(DocumentNotFoundError);
  });

  it('is tenant-scoped — queries with both id and tenantId', async () => {
    await service.setLegalHold(DOCUMENT_ID, TENANT_ID, true, USER_ID);
    const whereClause = prisma.document.findFirst.mock.calls[0][0].where;
    expect(whereClause.id).toBe(DOCUMENT_ID);
    expect(whereClause.tenantId).toBe(TENANT_ID);
  });
});

describe('DocumentVaultService — deletion guard', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let service: DocumentVaultService;

  beforeEach(() => {
    prisma  = makeMockPrisma();
    service = new DocumentVaultService(prisma as never, makeMockEventBus() as never);
  });

  it('deletes a document that is NOT on legal hold', async () => {
    prisma.document.findFirst.mockResolvedValueOnce(
      makeDocumentRow({ legalHold: false }),
    );
    const result = await service.delete(DOCUMENT_ID, TENANT_ID, USER_ID);
    expect(result).toBe(true);
    expect(prisma.document.delete).toHaveBeenCalledOnce();
  });

  it('BLOCKS deletion when document is on legal hold', async () => {
    prisma.document.findFirst.mockResolvedValueOnce(
      makeDocumentRow({ legalHold: true }),
    );
    await expect(service.delete(DOCUMENT_ID, TENANT_ID, USER_ID)).rejects.toThrow(
      DocumentOnLegalHoldError,
    );
    expect(prisma.document.delete).not.toHaveBeenCalled();
  });

  it('DocumentOnLegalHoldError has the correct code', async () => {
    prisma.document.findFirst.mockResolvedValueOnce(
      makeDocumentRow({ legalHold: true }),
    );
    try {
      await service.delete(DOCUMENT_ID, TENANT_ID, USER_ID);
    } catch (err) {
      expect(err).toBeInstanceOf(DocumentOnLegalHoldError);
      expect((err as DocumentOnLegalHoldError).code).toBe('DOCUMENT_ON_LEGAL_HOLD');
    }
  });

  it('throws DocumentNotFoundError when document does not exist', async () => {
    prisma.document.findFirst.mockResolvedValueOnce(null);
    await expect(service.delete('ghost-id', TENANT_ID, USER_ID)).rejects.toThrow(
      DocumentNotFoundError,
    );
    expect(prisma.document.delete).not.toHaveBeenCalled();
  });
});

describe('DocumentVaultService — autoFile', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let service: DocumentVaultService;

  beforeEach(() => {
    prisma  = makeMockPrisma();
    service = new DocumentVaultService(prisma as never, makeMockEventBus() as never);
  });

  it('auto-file enriches metadata with sourceModule and sourceId', async () => {
    await service.autoFile({
      ...makeUploadInput(),
      sourceModule: 'consent',
      sourceId:     'consent-001',
    });

    const createCall = prisma.document.create.mock.calls[0][0];
    const metadata   = createCall.data.metadata as Record<string, unknown>;
    expect(metadata['autoFiled']).toBe(true);
    expect(metadata['sourceModule']).toBe('consent');
    expect(metadata['sourceId']).toBe('consent-001');
    expect(metadata['autoFiledAt']).toBeTruthy();
  });

  it('auto-file still publishes DOCUMENT_UPLOADED event', async () => {
    const eventBus = makeMockEventBus();
    service        = new DocumentVaultService(prisma as never, eventBus as never);

    await service.autoFile({
      ...makeUploadInput(),
      sourceModule: 'application',
      sourceId:     'app-xyz',
    });

    expect(eventBus.publishAndPersist).toHaveBeenCalledOnce();
  });
});

// ================================================================
// SECTION 3 — Compliance Dossier
// ================================================================

function makeFullMockPrisma() {
  const business = {
    id:                   BUSINESS_ID,
    tenantId:             TENANT_ID,
    legalName:            'Acme Corp LLC',
    dba:                  'Acme',
    ein:                  '12-3456789',
    entityType:           'llc',
    stateOfFormation:     'DE',
    dateOfFormation:      new Date('2020-01-01'),
    industry:             'technology',
    annualRevenue:        '500000',
    fundingReadinessScore: 80,
    status:               'active',
    advisorId:            null,
    mcc:                  null,
    monthlyRevenue:       null,
    createdAt:            new Date('2020-01-01'),
    updatedAt:            new Date(),
  };

  const consent = {
    id:               'consent-001',
    tenantId:         TENANT_ID,
    businessId:       BUSINESS_ID,
    channel:          'email',
    consentType:      'tcpa',
    status:           'active',
    grantedAt:        new Date('2026-01-01'),
    revokedAt:        null,
    revocationReason: null,
    ipAddress:        '192.168.1.100',
    evidenceRef:      null,
    metadata:         null,
  };

  const revokedConsent = {
    ...consent,
    id:               'consent-002',
    status:           'revoked',
    revokedAt:        new Date('2026-02-01'),
    revocationReason: 'User request',
  };

  const acknowledgment = {
    id:                  'ack-001',
    businessId:          BUSINESS_ID,
    acknowledgmentType:  'product_reality',
    version:             '1.0',
    signedAt:            new Date('2026-01-05'),
    signatureRef:        'sig-abc',
    documentVaultId:     DOCUMENT_ID,
    metadata:            null,
    createdAt:           new Date('2026-01-05'),
  };

  const application = {
    id:                  'app-001',
    businessId:          BUSINESS_ID,
    fundingRoundId:      null,
    issuer:              'Chase',
    cardProduct:         'Ink Business Unlimited',
    status:              'approved',
    creditLimit:         '25000',
    introApr:            '0',
    introAprExpiry:      new Date('2027-01-01'),
    regularApr:          '19.99',
    annualFee:           '0',
    cashAdvanceFee:      null,
    consentCapturedAt:   new Date('2026-01-10'),
    submittedAt:         new Date('2026-01-11'),
    decidedAt:           new Date('2026-01-12'),
    declineReason:       null,
    adverseActionNotice: null,
    createdAt:           new Date('2026-01-10'),
    updatedAt:           new Date(),
  };

  const declinedApp = {
    ...application,
    id:            'app-002',
    issuer:        'Amex',
    status:        'declined',
    declineReason: 'Insufficient credit history',
  };

  const feeSchedule = {
    id:               'fee-001',
    businessId:       BUSINESS_ID,
    programFees:      '1500',
    percentOfFunding: '3',
    annualFees:       '0',
    cashAdvanceFees:  '0',
    processorFees:    '500',
    totalCost:        '2000',
    effectiveApr:     '8',
    irc163jImpact:    null,
    bestCaseFlow:     null,
    baseCaseFlow:     null,
    worstCaseFlow:    null,
    createdAt:        new Date('2026-01-05'),
  };

  const achAuth = {
    id:                    'ach-001',
    businessId:            BUSINESS_ID,
    processorName:         'Stripe',
    authorizedAmount:      '500',
    authorizedFrequency:   'monthly',
    status:                'active',
    signedDocumentRef:     null,
    authorizedAt:          new Date('2026-01-08'),
    revokedAt:             null,
    revocationNotifiedAt:  null,
    createdAt:             new Date('2026-01-08'),
    updatedAt:             new Date(),
  };

  const suitability = {
    id:                  'suit-001',
    businessId:          BUSINESS_ID,
    score:               75,
    maxSafeLeverage:     '100000',
    recommendation:      'Proceed with standard stack',
    noGoTriggered:       false,
    noGoReasons:         null,
    alternativeProducts: null,
    decisionExplanation: null,
    overriddenBy:        null,
    overrideReason:      null,
    createdAt:           new Date('2026-01-03'),
  };

  const complianceCheck = {
    id:                'cc-001',
    tenantId:          TENANT_ID,
    businessId:        BUSINESS_ID,
    checkType:         'udap',
    riskScore:         20,
    riskLevel:         'low',
    findings:          { notes: 'No issues found' },
    stateJurisdiction: 'CA',
    resolvedAt:        new Date('2026-01-04'),
    createdAt:         new Date('2026-01-03'),
  };

  const openComplianceCheck = {
    ...complianceCheck,
    id:         'cc-002',
    checkType:  'state_law',
    resolvedAt: null,
  };

  // Build a document row with a VALID crypto timestamp for testing verification
  const ts    = new Date('2026-01-15T10:00:00Z').toISOString();
  const hash  = hashContent(SAMPLE_CONTENT);
  const docId = 'doc-dossier-001';
  const tsRecord = generateCryptoTimestamp({
    contentHash: hash,
    timestamp:   ts,
    tenantId:    TENANT_ID,
    documentId:  docId,
  });

  const vaultDocument = {
    id:              docId,
    tenantId:        TENANT_ID,
    businessId:      BUSINESS_ID,
    documentType:    'consent_form',
    title:           'TCPA Consent',
    storageKey:      `${TENANT_ID}/${BUSINESS_ID}/consent_form/${docId}/tcpa_consent`,
    mimeType:        'application/pdf',
    sizeBytes:       SAMPLE_CONTENT.length,
    sha256Hash:      hash,
    cryptoTimestamp: tsRecord.token,
    legalHold:       false,
    metadata:        {},
    uploadedBy:      USER_ID,
    createdAt:       new Date(ts),
  };

  const legalHoldDocument = {
    ...vaultDocument,
    id:        'doc-hold-001',
    legalHold: true,
  };

  return {
    business:             { findFirst: vi.fn().mockResolvedValue(business) },
    consentRecord:        { findMany:  vi.fn().mockResolvedValue([consent, revokedConsent]) },
    productAcknowledgment:{ findMany:  vi.fn().mockResolvedValue([acknowledgment]) },
    cardApplication:      { findMany:  vi.fn().mockResolvedValue([application, declinedApp]) },
    costCalculation:      { findMany:  vi.fn().mockResolvedValue([feeSchedule]) },
    achAuthorization:     { findMany:  vi.fn().mockResolvedValue([achAuth]) },
    suitabilityCheck:     { findMany:  vi.fn().mockResolvedValue([suitability]) },
    complianceCheck:      { findMany:  vi.fn().mockResolvedValue([complianceCheck, openComplianceCheck]) },
    document:             { findMany:  vi.fn().mockResolvedValue([vaultDocument, legalHoldDocument]) },
  };
}

describe('ComplianceDossierService — assemble', () => {
  let prisma: ReturnType<typeof makeFullMockPrisma>;
  let service: ComplianceDossierService;

  beforeEach(() => {
    prisma  = makeFullMockPrisma();
    service = new ComplianceDossierService(prisma as never);
  });

  it('returns a dossier with the correct tenantId and businessId', async () => {
    const dossier = await service.assemble({
      tenantId:    TENANT_ID,
      businessId:  BUSINESS_ID,
      requestedBy: USER_ID,
    });

    expect(dossier.tenantId).toBe(TENANT_ID);
    expect(dossier.businessId).toBe(BUSINESS_ID);
    expect(dossier.assembledBy).toBe(USER_ID);
  });

  it('includes all consent records', async () => {
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });
    expect(dossier.consentRecords).toHaveLength(2);
  });

  it('includes acknowledgments', async () => {
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });
    expect(dossier.acknowledgments).toHaveLength(1);
    expect(dossier.acknowledgments[0]?.acknowledgmentType).toBe('product_reality');
  });

  it('includes card applications', async () => {
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });
    expect(dossier.applications).toHaveLength(2);
  });

  it('includes fee schedules', async () => {
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });
    expect(dossier.feeSchedules).toHaveLength(1);
  });

  it('includes ACH authorizations', async () => {
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });
    expect(dossier.achAuthorizations).toHaveLength(1);
  });

  it('includes suitability checks', async () => {
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });
    expect(dossier.suitabilityChecks).toHaveLength(1);
  });

  it('includes compliance checks', async () => {
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });
    expect(dossier.complianceChecks).toHaveLength(2);
  });

  it('includes vault documents', async () => {
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });
    expect(dossier.documents).toHaveLength(2);
  });

  it('summary counts are accurate', async () => {
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });

    expect(dossier.summary.totalConsents).toBe(2);
    expect(dossier.summary.activeConsents).toBe(1);
    expect(dossier.summary.revokedConsents).toBe(1);
    expect(dossier.summary.totalApplications).toBe(2);
    expect(dossier.summary.approvedApplications).toBe(1);
    expect(dossier.summary.declinedApplications).toBe(1);
    expect(dossier.summary.totalDocuments).toBe(2);
    expect(dossier.summary.documentsOnLegalHold).toBe(1);
    expect(dossier.summary.openComplianceIssues).toBe(1);
    expect(dossier.summary.noGoTriggered).toBe(false);
  });
});

describe('ComplianceDossierService — timestamp integrity', () => {
  it('marks document with valid crypto timestamp as "verified"', async () => {
    const ts    = new Date('2026-01-15T10:00:00Z').toISOString();
    const hash  = hashContent(SAMPLE_CONTENT);
    const docId = 'doc-verified-001';
    const tsRecord = generateCryptoTimestamp({
      contentHash: hash,
      timestamp:   ts,
      tenantId:    TENANT_ID,
      documentId:  docId,
    });

    const prisma = {
      business:             { findFirst: vi.fn().mockResolvedValue({
        id: BUSINESS_ID, tenantId: TENANT_ID, legalName: 'Test Co', dba: null, ein: null,
        entityType: 'llc', stateOfFormation: null, dateOfFormation: null, industry: null,
        annualRevenue: null, fundingReadinessScore: null, status: 'active',
      })},
      consentRecord:        { findMany: vi.fn().mockResolvedValue([]) },
      productAcknowledgment:{ findMany: vi.fn().mockResolvedValue([]) },
      cardApplication:      { findMany: vi.fn().mockResolvedValue([]) },
      costCalculation:      { findMany: vi.fn().mockResolvedValue([]) },
      achAuthorization:     { findMany: vi.fn().mockResolvedValue([]) },
      suitabilityCheck:     { findMany: vi.fn().mockResolvedValue([]) },
      complianceCheck:      { findMany: vi.fn().mockResolvedValue([]) },
      document: { findMany: vi.fn().mockResolvedValue([{
        id:              docId,
        tenantId:        TENANT_ID,
        businessId:      BUSINESS_ID,
        documentType:    'consent_form',
        title:           'Verified Doc',
        storageKey:      'key',
        mimeType:        'application/pdf',
        sizeBytes:       SAMPLE_CONTENT.length,
        sha256Hash:      hash,
        cryptoTimestamp: tsRecord.token,
        legalHold:       false,
        metadata:        {},
        uploadedBy:      USER_ID,
        createdAt:       new Date(ts),
      }])},
    };

    const service = new ComplianceDossierService(prisma as never);
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });

    expect(dossier.documents[0]?.timestampIntegrity).toBe('verified');
  });

  it('marks document with tampered hash as "tampered"', async () => {
    const ts     = new Date('2026-01-15T10:00:00Z').toISOString();
    const docId  = 'doc-tampered-001';
    const realHash   = hashContent(SAMPLE_CONTENT);
    const tamperedHash = sha256Hex('different content entirely');

    // Token was generated for realHash, but we store tamperedHash in sha256Hash
    const tsRecord = generateCryptoTimestamp({
      contentHash: realHash,
      timestamp:   ts,
      tenantId:    TENANT_ID,
      documentId:  docId,
    });

    const prisma = {
      business:             { findFirst: vi.fn().mockResolvedValue({
        id: BUSINESS_ID, tenantId: TENANT_ID, legalName: 'Test Co', dba: null, ein: null,
        entityType: 'llc', stateOfFormation: null, dateOfFormation: null, industry: null,
        annualRevenue: null, fundingReadinessScore: null, status: 'active',
      })},
      consentRecord:        { findMany: vi.fn().mockResolvedValue([]) },
      productAcknowledgment:{ findMany: vi.fn().mockResolvedValue([]) },
      cardApplication:      { findMany: vi.fn().mockResolvedValue([]) },
      costCalculation:      { findMany: vi.fn().mockResolvedValue([]) },
      achAuthorization:     { findMany: vi.fn().mockResolvedValue([]) },
      suitabilityCheck:     { findMany: vi.fn().mockResolvedValue([]) },
      complianceCheck:      { findMany: vi.fn().mockResolvedValue([]) },
      document: { findMany: vi.fn().mockResolvedValue([{
        id:              docId,
        tenantId:        TENANT_ID,
        businessId:      BUSINESS_ID,
        documentType:    'consent_form',
        title:           'Tampered Doc',
        storageKey:      'key',
        mimeType:        'application/pdf',
        sizeBytes:       100,
        sha256Hash:      tamperedHash, // mismatch — simulates content swap attack
        cryptoTimestamp: tsRecord.token,
        legalHold:       false,
        metadata:        {},
        uploadedBy:      USER_ID,
        createdAt:       new Date(ts),
      }])},
    };

    const service = new ComplianceDossierService(prisma as never);
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });

    expect(dossier.documents[0]?.timestampIntegrity).toBe('tampered');
    expect(dossier.summary.timestampsTampered).toBe(1);
  });

  it('marks document with no crypto timestamp as "unverifiable"', async () => {
    const prisma = {
      business:             { findFirst: vi.fn().mockResolvedValue({
        id: BUSINESS_ID, tenantId: TENANT_ID, legalName: 'Test Co', dba: null, ein: null,
        entityType: 'llc', stateOfFormation: null, dateOfFormation: null, industry: null,
        annualRevenue: null, fundingReadinessScore: null, status: 'active',
      })},
      consentRecord:        { findMany: vi.fn().mockResolvedValue([]) },
      productAcknowledgment:{ findMany: vi.fn().mockResolvedValue([]) },
      cardApplication:      { findMany: vi.fn().mockResolvedValue([]) },
      costCalculation:      { findMany: vi.fn().mockResolvedValue([]) },
      achAuthorization:     { findMany: vi.fn().mockResolvedValue([]) },
      suitabilityCheck:     { findMany: vi.fn().mockResolvedValue([]) },
      complianceCheck:      { findMany: vi.fn().mockResolvedValue([]) },
      document: { findMany: vi.fn().mockResolvedValue([{
        id:              'doc-no-ts',
        tenantId:        TENANT_ID,
        businessId:      BUSINESS_ID,
        documentType:    'statement',
        title:           'Legacy Doc',
        storageKey:      'key',
        mimeType:        null,
        sizeBytes:       null,
        sha256Hash:      null,      // no hash
        cryptoTimestamp: null,      // no timestamp
        legalHold:       false,
        metadata:        {},
        uploadedBy:      null,
        createdAt:       new Date('2025-06-01'),
      }])},
    };

    const service = new ComplianceDossierService(prisma as never);
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });

    expect(dossier.documents[0]?.timestampIntegrity).toBe('unverifiable');
  });
});

describe('ComplianceDossierService — error handling', () => {
  it('throws BusinessNotFoundForDossierError when business does not exist', async () => {
    const prisma = {
      business:             { findFirst: vi.fn().mockResolvedValue(null) },
      consentRecord:        { findMany: vi.fn().mockResolvedValue([]) },
      productAcknowledgment:{ findMany: vi.fn().mockResolvedValue([]) },
      cardApplication:      { findMany: vi.fn().mockResolvedValue([]) },
      costCalculation:      { findMany: vi.fn().mockResolvedValue([]) },
      achAuthorization:     { findMany: vi.fn().mockResolvedValue([]) },
      suitabilityCheck:     { findMany: vi.fn().mockResolvedValue([]) },
      complianceCheck:      { findMany: vi.fn().mockResolvedValue([]) },
      document:             { findMany: vi.fn().mockResolvedValue([]) },
    };

    const service = new ComplianceDossierService(prisma as never);

    await expect(
      service.assemble({ tenantId: TENANT_ID, businessId: 'ghost-biz', requestedBy: USER_ID }),
    ).rejects.toThrow(BusinessNotFoundForDossierError);
  });

  it('BusinessNotFoundForDossierError has correct code', async () => {
    const err = new BusinessNotFoundForDossierError('biz-123');
    expect(err.code).toBe('BUSINESS_NOT_FOUND');
    expect(err.name).toBe('BusinessNotFoundForDossierError');
  });

  it('passes since/until filter options through', async () => {
    const prisma = makeFullMockPrisma();
    const service = new ComplianceDossierService(prisma as never);

    const dossier = await service.assemble({
      tenantId:    TENANT_ID,
      businessId:  BUSINESS_ID,
      requestedBy: USER_ID,
      since:       '2026-01-01T00:00:00Z',
      until:       '2026-12-31T23:59:59Z',
    });

    expect(dossier.filterSince).toBe('2026-01-01T00:00:00Z');
    expect(dossier.filterUntil).toBe('2026-12-31T23:59:59Z');
  });
});

describe('ComplianceDossierService — PII handling', () => {
  it('masks EIN in business snapshot — only last 4 digits shown', async () => {
    const prisma = makeFullMockPrisma();
    const service = new ComplianceDossierService(prisma as never);
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });

    // EIN '12-3456789' → '***-**-6789'
    expect(dossier.business.ein).not.toBe('12-3456789');
    expect(dossier.business.ein).toMatch(/\*\*\*/);
    expect(dossier.business.ein).toContain('6789');
  });

  it('masks IP address in consent records — last octet replaced', async () => {
    const prisma = makeFullMockPrisma();
    const service = new ComplianceDossierService(prisma as never);
    const dossier = await service.assemble({
      tenantId: TENANT_ID, businessId: BUSINESS_ID, requestedBy: USER_ID,
    });

    const activeConsent = dossier.consentRecords.find((c) => c.status === 'active');
    expect(activeConsent?.ipAddress).toMatch(/\.xxx$/);
    expect(activeConsent?.ipAddress).not.toContain('192.168.1.100');
  });
});
