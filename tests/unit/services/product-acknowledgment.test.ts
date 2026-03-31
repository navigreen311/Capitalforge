// ============================================================
// Unit Tests — ProductAcknowledgmentService
//
// Covers:
//   - Acknowledgment creation and persistence
//   - Version checking (current vs. stale)
//   - Gate enforcement: pre-engagement and pre-submission
//   - Template rendering (title/body presence)
//   - PRODUCT_REALITY_ACKNOWLEDGED event publication
//   - AcknowledgmentGateError thrown when gate fails
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  ProductAcknowledgmentService,
  AcknowledgmentGateError,
  type SignAcknowledgmentOptions,
} from '../../../src/backend/services/product-acknowledgment.service.js';

import {
  getCurrentTemplate,
  CURRENT_VERSIONS,
  PRE_SUBMISSION_REQUIRED,
  PRE_ENGAGEMENT_REQUIRED,
  type AcknowledgmentType,
} from '../../../src/backend/services/acknowledgment-templates.js';

import { EventBus } from '../../../src/backend/events/event-bus.js';
import { EVENT_TYPES } from '../../../src/backend/events/event-types.js';

// ---- Prisma mock -------------------------------------------

/**
 * A minimal in-memory Prisma stand-in.
 * We track every created record so assertions can inspect them.
 */
function buildPrismaMock() {
  const documents: Record<string, unknown>[] = [];
  const acknowledgments: Record<string, unknown>[] = [];

  let ackIdCounter = 0;

  return {
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => {
      return Promise.all(operations);
    }),

    document: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const doc = { ...data, createdAt: new Date() };
        documents.push(doc);
        return doc;
      }),
    },

    productAcknowledgment: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        ackIdCounter += 1;
        const ack = {
          ...data,
          id:        `ack-${ackIdCounter}`,
          createdAt: new Date(),
          metadata:  data['metadata'] ?? null,
        };
        acknowledgments.push(ack);
        return ack;
      }),

      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const matches = acknowledgments.filter(
          (a) =>
            a['businessId'] === where['businessId'] &&
            a['acknowledgmentType'] === where['acknowledgmentType'],
        );
        if (matches.length === 0) return null;
        // Return the most recently signed
        return matches.sort(
          (a, b) =>
            new Date(a['signedAt'] as string).getTime() -
            new Date(b['signedAt'] as string).getTime(),
        )[matches.length - 1];
      }),

      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return acknowledgments.filter(
          (a) =>
            a['businessId'] === where['businessId'] &&
            (where['acknowledgmentType'] === undefined ||
              a['acknowledgmentType'] === where['acknowledgmentType']),
        );
      }),
    },

    // Expose for test assertions
    _documents:       documents,
    _acknowledgments: acknowledgments,
  };
}

type PrismaMock = ReturnType<typeof buildPrismaMock>;

// ---- EventBus mock -----------------------------------------

function buildEventBusMock() {
  const published: { tenantId: string; envelope: Record<string, unknown> }[] = [];

  return {
    publishAndPersist: vi.fn(
      async (tenantId: string, envelope: Record<string, unknown>) => {
        published.push({ tenantId, envelope });
        return { id: `evt-${published.length}`, publishedAt: new Date() };
      },
    ),
    _published: published,
  };
}

// ---- Test helpers ------------------------------------------

function defaultSignOpts(
  overrides: Partial<SignAcknowledgmentOptions> = {},
): SignAcknowledgmentOptions {
  return {
    businessId:      'biz-001',
    tenantId:        'tenant-001',
    signedByUserId:  'user-001',
    signerIp:        '192.168.1.1',
    input: {
      acknowledgmentType:     'product_reality',
      agreedToCurrentVersion: true,
      signerName:             'Jane Doe',
    },
    ...overrides,
  };
}

// ---- Tests -------------------------------------------------

describe('ProductAcknowledgmentService', () => {
  let prismaMock: PrismaMock;
  let eventBusMock: ReturnType<typeof buildEventBusMock>;
  let svc: ProductAcknowledgmentService;

  beforeEach(() => {
    prismaMock    = buildPrismaMock();
    eventBusMock  = buildEventBusMock();

    // Inject mocks
    svc = new ProductAcknowledgmentService(prismaMock as unknown as import('@prisma/client').PrismaClient);

    // Stub the module-level eventBus singleton used by the service
    vi.spyOn(EventBus.prototype, 'publishAndPersist').mockImplementation(
      eventBusMock.publishAndPersist,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    EventBus.reset();
  });

  // ── Template rendering ──────────────────────────────────

  describe('Template content', () => {
    it('product_reality template contains FTC-critical language', () => {
      const tpl = getCurrentTemplate('product_reality');
      expect(tpl.body).toContain('CREDIT CARDS');
      expect(tpl.body).toContain('NOT a term loan');
      expect(tpl.body).toContain('FTC');
    });

    it('fee_schedule template itemizes all fee categories', () => {
      const tpl = getCurrentTemplate('fee_schedule');
      expect(tpl.body).toContain('PROGRAM ENROLLMENT FEE');
      expect(tpl.body).toContain('SUCCESS FEE');
      expect(tpl.body).toContain('ANNUAL CARD FEES');
      expect(tpl.body).toContain('PAYMENT PROCESSOR FEES');
    });

    it('personal_guarantee template explains personal liability', () => {
      const tpl = getCurrentTemplate('personal_guarantee');
      expect(tpl.body).toContain('personally guaranteeing');
      expect(tpl.body).toContain('personal credit');
    });

    it('cash_advance_risk template shows fee examples', () => {
      const tpl = getCurrentTemplate('cash_advance_risk');
      expect(tpl.body).toContain('cash advance');
      expect(tpl.body).toContain('grace period');
    });

    it('all current versions exist in registry', () => {
      const types: AcknowledgmentType[] = [
        'product_reality',
        'fee_schedule',
        'personal_guarantee',
        'cash_advance_risk',
      ];
      for (const type of types) {
        expect(() => getCurrentTemplate(type)).not.toThrow();
        const tpl = getCurrentTemplate(type);
        expect(tpl.version).toBe(CURRENT_VERSIONS[type]);
        expect(tpl.title.length).toBeGreaterThan(10);
        expect(tpl.body.length).toBeGreaterThan(100);
      }
    });
  });

  // ── sign() ──────────────────────────────────────────────

  describe('sign()', () => {
    it('creates a ProductAcknowledgment record with correct fields', async () => {
      const opts = defaultSignOpts();
      const record = await svc.sign(opts);

      expect(record.businessId).toBe('biz-001');
      expect(record.acknowledgmentType).toBe('product_reality');
      expect(record.version).toBe(CURRENT_VERSIONS['product_reality']);
      expect(record.signedAt).toBeInstanceOf(Date);
      expect(typeof record.signatureRef).toBe('string');
      expect(record.signatureRef).toMatch(/^ack_[a-f0-9]{40}$/);
    });

    it('writes a Document Vault record with legalHold=true', async () => {
      await svc.sign(defaultSignOpts());

      expect(prismaMock.document.create).toHaveBeenCalledOnce();
      const docArg = prismaMock.document.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(docArg.data['legalHold']).toBe(true);
      expect(docArg.data['tenantId']).toBe('tenant-001');
      expect(docArg.data['businessId']).toBe('biz-001');
      expect(String(docArg.data['storageKey'])).toContain('product_reality');
    });

    it('generates a unique signatureRef on each call', async () => {
      const r1 = await svc.sign(defaultSignOpts());
      const r2 = await svc.sign(defaultSignOpts());
      expect(r1.signatureRef).not.toBe(r2.signatureRef);
    });

    it('stores metadata including signerIp and signerName', async () => {
      await svc.sign(defaultSignOpts({ signerIp: '10.0.0.5' }));

      const ackArg = prismaMock.productAcknowledgment.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      const meta = ackArg.data['metadata'] as Record<string, unknown>;
      expect(meta['signerIp']).toBe('10.0.0.5');
      expect(meta['signerName']).toBe('Jane Doe');
    });

    it('uses $transaction so document and acknowledgment are atomic', async () => {
      await svc.sign(defaultSignOpts());
      expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    });

    it('wraps all four ack types without error', async () => {
      const types: AcknowledgmentType[] = [
        'product_reality',
        'fee_schedule',
        'personal_guarantee',
        'cash_advance_risk',
      ];

      for (const type of types) {
        const record = await svc.sign(
          defaultSignOpts({
            input: { acknowledgmentType: type, agreedToCurrentVersion: true },
          }),
        );
        expect(record.acknowledgmentType).toBe(type);
        expect(record.version).toBe(CURRENT_VERSIONS[type]);
      }
    });
  });

  // ── Event publication ───────────────────────────────────

  describe('Event publication', () => {
    it('publishes PRODUCT_REALITY_ACKNOWLEDGED for product_reality type', async () => {
      await svc.sign(defaultSignOpts({ input: { acknowledgmentType: 'product_reality', agreedToCurrentVersion: true } }));

      expect(eventBusMock.publishAndPersist).toHaveBeenCalledOnce();
      const [tenantId, envelope] = eventBusMock.publishAndPersist.mock.calls[0] as [string, Record<string, unknown>];
      expect(tenantId).toBe('tenant-001');
      expect(envelope['eventType']).toBe(EVENT_TYPES.PRODUCT_REALITY_ACKNOWLEDGED);
    });

    it('publishes a namespaced event for non-product_reality types', async () => {
      await svc.sign(
        defaultSignOpts({ input: { acknowledgmentType: 'fee_schedule', agreedToCurrentVersion: true } }),
      );

      const [, envelope] = eventBusMock.publishAndPersist.mock.calls[0] as [string, Record<string, unknown>];
      expect(String(envelope['eventType'])).toBe('acknowledgment.signed.fee_schedule');
    });

    it('event payload includes signatureRef and documentVaultId', async () => {
      await svc.sign(defaultSignOpts());

      const [, envelope] = eventBusMock.publishAndPersist.mock.calls[0] as [string, Record<string, unknown>];
      const payload = envelope['payload'] as Record<string, unknown>;
      expect(typeof payload['signatureRef']).toBe('string');
      expect(typeof payload['documentVaultId']).toBe('string');
      expect(payload['acknowledgmentType']).toBe('product_reality');
    });
  });

  // ── getStatus() ─────────────────────────────────────────

  describe('getStatus()', () => {
    it('returns isSigned=false and isCurrentVersionSigned=false when no ack exists', async () => {
      prismaMock.productAcknowledgment.findFirst.mockResolvedValueOnce(null);

      const status = await svc.getStatus('biz-001', 'product_reality');
      expect(status.isSigned).toBe(false);
      expect(status.isCurrentVersionSigned).toBe(false);
      expect(status.signedVersion).toBeNull();
      expect(status.currentVersion).toBe(CURRENT_VERSIONS['product_reality']);
    });

    it('returns isCurrentVersionSigned=true when current version is signed', async () => {
      prismaMock.productAcknowledgment.findFirst.mockResolvedValueOnce({
        id:                 'ack-1',
        businessId:         'biz-001',
        acknowledgmentType: 'product_reality',
        version:            CURRENT_VERSIONS['product_reality'],
        signedAt:           new Date(),
        signatureRef:       'ack_abc',
        documentVaultId:    'doc-1',
        metadata:           null,
        createdAt:          new Date(),
      });

      const status = await svc.getStatus('biz-001', 'product_reality');
      expect(status.isSigned).toBe(true);
      expect(status.isCurrentVersionSigned).toBe(true);
      expect(status.signedVersion).toBe(CURRENT_VERSIONS['product_reality']);
    });

    it('returns isCurrentVersionSigned=false when a stale version is signed', async () => {
      prismaMock.productAcknowledgment.findFirst.mockResolvedValueOnce({
        id:                 'ack-1',
        businessId:         'biz-001',
        acknowledgmentType: 'product_reality',
        version:            '0.9.0',   // intentionally outdated
        signedAt:           new Date(),
        signatureRef:       'ack_xyz',
        documentVaultId:    'doc-1',
        metadata:           null,
        createdAt:          new Date(),
      });

      const status = await svc.getStatus('biz-001', 'product_reality');
      expect(status.isSigned).toBe(true);
      expect(status.isCurrentVersionSigned).toBe(false);
      expect(status.signedVersion).toBe('0.9.0');
    });
  });

  // ── checkGate() ─────────────────────────────────────────

  describe('checkGate()', () => {
    it('passes when all required types are signed at current version', async () => {
      prismaMock.productAcknowledgment.findFirst.mockResolvedValue({
        id:                 'ack-1',
        businessId:         'biz-001',
        acknowledgmentType: 'product_reality',
        version:            CURRENT_VERSIONS['product_reality'],
        signedAt:           new Date(),
        signatureRef:       'ack_ok',
        documentVaultId:    'doc-1',
        metadata:           null,
        createdAt:          new Date(),
      });

      const result = await svc.checkGate('biz-001', ['product_reality']);
      expect(result.passed).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('fails and lists missing types when acks are absent', async () => {
      prismaMock.productAcknowledgment.findFirst.mockResolvedValue(null);

      const result = await svc.checkGate('biz-001', PRE_SUBMISSION_REQUIRED);
      expect(result.passed).toBe(false);
      expect(result.missing).toEqual(expect.arrayContaining(PRE_SUBMISSION_REQUIRED));
    });

    it('fails when any required type is at a stale version', async () => {
      // product_reality is stale, fee_schedule is current
      prismaMock.productAcknowledgment.findFirst.mockImplementation(
        async ({ where }: { where: Record<string, unknown> }) => {
          if (where['acknowledgmentType'] === 'product_reality') {
            return {
              id: 'ack-1', businessId: 'biz-001',
              acknowledgmentType: 'product_reality',
              version: '0.9.0',  // stale
              signedAt: new Date(), signatureRef: 'ack_x',
              documentVaultId: 'doc-1', metadata: null, createdAt: new Date(),
            };
          }
          return {
            id: 'ack-2', businessId: 'biz-001',
            acknowledgmentType: 'fee_schedule',
            version: CURRENT_VERSIONS['fee_schedule'],
            signedAt: new Date(), signatureRef: 'ack_y',
            documentVaultId: 'doc-2', metadata: null, createdAt: new Date(),
          };
        },
      );

      const result = await svc.checkGate('biz-001', PRE_SUBMISSION_REQUIRED);
      expect(result.passed).toBe(false);
      expect(result.missing).toContain('product_reality');
      expect(result.missing).not.toContain('fee_schedule');
    });
  });

  // ── assertPreSubmissionGate() ───────────────────────────

  describe('assertPreSubmissionGate()', () => {
    it('does not throw when all pre-submission acks are current', async () => {
      prismaMock.productAcknowledgment.findFirst.mockResolvedValue({
        id: 'ack-1', businessId: 'biz-001',
        acknowledgmentType: 'product_reality',
        version: CURRENT_VERSIONS['product_reality'],
        signedAt: new Date(), signatureRef: 'ack_ok',
        documentVaultId: 'doc-1', metadata: null, createdAt: new Date(),
      });

      await expect(svc.assertPreSubmissionGate('biz-001')).resolves.toBeUndefined();
    });

    it('throws AcknowledgmentGateError when product_reality is missing', async () => {
      prismaMock.productAcknowledgment.findFirst.mockResolvedValue(null);

      await expect(svc.assertPreSubmissionGate('biz-001')).rejects.toThrow(
        AcknowledgmentGateError,
      );
    });

    it('AcknowledgmentGateError carries gate=pre_submission and missingTypes', async () => {
      prismaMock.productAcknowledgment.findFirst.mockResolvedValue(null);

      let caught: AcknowledgmentGateError | null = null;
      try {
        await svc.assertPreSubmissionGate('biz-001');
      } catch (err) {
        caught = err as AcknowledgmentGateError;
      }

      expect(caught).not.toBeNull();
      expect(caught!.gate).toBe('pre_submission');
      expect(caught!.missingTypes.length).toBeGreaterThan(0);
      expect(caught!.missingTypes).toEqual(
        expect.arrayContaining(PRE_SUBMISSION_REQUIRED),
      );
    });
  });

  // ── assertPreEngagementGate() ───────────────────────────

  describe('assertPreEngagementGate()', () => {
    it('throws AcknowledgmentGateError with gate=pre_engagement when missing', async () => {
      prismaMock.productAcknowledgment.findFirst.mockResolvedValue(null);

      let caught: AcknowledgmentGateError | null = null;
      try {
        await svc.assertPreEngagementGate('biz-001');
      } catch (err) {
        caught = err as AcknowledgmentGateError;
      }

      expect(caught).not.toBeNull();
      expect(caught!.gate).toBe('pre_engagement');
      expect(caught!.missingTypes).toEqual(
        expect.arrayContaining(PRE_ENGAGEMENT_REQUIRED),
      );
    });
  });

  // ── listForBusiness() ───────────────────────────────────

  describe('listForBusiness()', () => {
    it('returns empty array when no acknowledgments exist', async () => {
      prismaMock.productAcknowledgment.findMany.mockResolvedValueOnce([]);
      const records = await svc.listForBusiness('biz-001');
      expect(records).toHaveLength(0);
    });

    it('returns all signed records ordered by service', async () => {
      // Sign two different types
      await svc.sign(defaultSignOpts({ input: { acknowledgmentType: 'product_reality', agreedToCurrentVersion: true } }));
      await svc.sign(defaultSignOpts({ input: { acknowledgmentType: 'fee_schedule',    agreedToCurrentVersion: true } }));

      // findMany mock returns all stored acks
      const records = await svc.listForBusiness('biz-001');
      expect(records.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by type when provided', async () => {
      await svc.sign(defaultSignOpts({ input: { acknowledgmentType: 'product_reality', agreedToCurrentVersion: true } }));
      await svc.sign(defaultSignOpts({ input: { acknowledgmentType: 'fee_schedule',    agreedToCurrentVersion: true } }));

      const records = await svc.listForBusiness('biz-001', { type: 'product_reality' });
      for (const r of records) {
        expect(r.acknowledgmentType).toBe('product_reality');
      }
    });
  });
});
