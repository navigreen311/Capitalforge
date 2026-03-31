// ============================================================
// CapitalForge — Vitest Prisma Client Mock
// Creates a fully-typed mock PrismaClient where every model
// delegate method is a vi.fn() returning test data from factories.
//
// Usage in unit tests:
//   import { prismaMock, resetPrismaMock } from '../../fixtures/prisma-mock.js';
//   vi.mock('../../../src/backend/config/database.js', () => ({
//     default: prismaMock,
//     prisma: prismaMock,
//   }));
// ============================================================

import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  createTestTenant,
  createTestUser,
  createTestBusiness,
  createTestOwner,
  createTestCreditProfile,
  createTestFundingRound,
  createTestApplication,
  createTestConsentRecord,
  createTestSuitabilityCheck,
  createTestAuditLog,
} from './test-data.js';

// ── Delegate mock factory ─────────────────────────────────────

type MockFn = ReturnType<typeof vi.fn>;

interface ModelMockDelegate {
  findMany: MockFn;
  findFirst: MockFn;
  findUnique: MockFn;
  findUniqueOrThrow: MockFn;
  findFirstOrThrow: MockFn;
  create: MockFn;
  createMany: MockFn;
  update: MockFn;
  updateMany: MockFn;
  upsert: MockFn;
  delete: MockFn;
  deleteMany: MockFn;
  count: MockFn;
  aggregate: MockFn;
  groupBy: MockFn;
}

function mockDelegate(
  defaultSingle: unknown = null,
  defaultMany: unknown[] = [],
): ModelMockDelegate {
  return {
    findMany: vi.fn().mockResolvedValue(defaultMany),
    findFirst: vi.fn().mockResolvedValue(defaultSingle),
    findUnique: vi.fn().mockResolvedValue(defaultSingle),
    findUniqueOrThrow: vi.fn().mockResolvedValue(defaultSingle),
    findFirstOrThrow: vi.fn().mockResolvedValue(defaultSingle),
    create: vi.fn().mockResolvedValue(defaultSingle),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue(defaultSingle),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    upsert: vi.fn().mockResolvedValue(defaultSingle),
    delete: vi.fn().mockResolvedValue(defaultSingle),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(defaultMany.length),
    aggregate: vi.fn().mockResolvedValue({}),
    groupBy: vi.fn().mockResolvedValue([]),
  };
}

// ── Default test data instances ───────────────────────────────

const defaultTenant = createTestTenant({ id: 'mock-tenant-001' });
const defaultUser = createTestUser({ id: 'mock-user-001', tenantId: defaultTenant.id });
const defaultBusiness = createTestBusiness({ id: 'mock-biz-001', tenantId: defaultTenant.id });
const defaultOwner = createTestOwner({ id: 'mock-owner-001', businessId: defaultBusiness.id });
const defaultCreditProfile = createTestCreditProfile({ id: 'mock-cp-001', businessId: defaultBusiness.id });
const defaultFundingRound = createTestFundingRound({ id: 'mock-round-001', businessId: defaultBusiness.id });
const defaultApplication = createTestApplication({ id: 'mock-app-001', businessId: defaultBusiness.id });
const defaultConsentRecord = createTestConsentRecord({ id: 'mock-consent-001', tenantId: defaultTenant.id });
const defaultSuitabilityCheck = createTestSuitabilityCheck({ id: 'mock-suit-001', businessId: defaultBusiness.id });
const defaultAuditLog = createTestAuditLog({ id: 'mock-audit-001', tenantId: defaultTenant.id });

// ── Mock Prisma client ────────────────────────────────────────

/**
 * Vitest mock of PrismaClient. All model delegates return realistic
 * test data from factory functions by default. Individual tests can
 * override specific methods:
 *
 *   prismaMock.business.findMany.mockResolvedValue([...]);
 *   prismaMock.user.create.mockRejectedValue(new Error('DB error'));
 */
export const prismaMock = {
  // ── Identity & Tenant ──────────────────────────────────────
  tenant: mockDelegate(defaultTenant, [defaultTenant]),
  user: mockDelegate(defaultUser, [defaultUser]),
  auditLog: mockDelegate(defaultAuditLog, [defaultAuditLog]),

  // ── Business ───────────────────────────────────────────────
  business: mockDelegate(defaultBusiness, [defaultBusiness]),
  businessOwner: mockDelegate(defaultOwner, [defaultOwner]),

  // ── Credit ─────────────────────────────────────────────────
  creditProfile: mockDelegate(defaultCreditProfile, [defaultCreditProfile]),

  // ── Funding ────────────────────────────────────────────────
  fundingRound: mockDelegate(defaultFundingRound, [defaultFundingRound]),
  cardApplication: mockDelegate(defaultApplication, [defaultApplication]),
  suitabilityCheck: mockDelegate(defaultSuitabilityCheck, [defaultSuitabilityCheck]),

  // ── Consent & Compliance ───────────────────────────────────
  consentRecord: mockDelegate(defaultConsentRecord, [defaultConsentRecord]),
  productAcknowledgment: mockDelegate(null, []),
  complianceCheck: mockDelegate(null, []),

  // ── ACH & Debit ────────────────────────────────────────────
  achAuthorization: mockDelegate(null, []),
  debitEvent: mockDelegate(null, []),

  // ── Financial ──────────────────────────────────────────────
  costCalculation: mockDelegate(null, []),

  // ── Events & Documents ─────────────────────────────────────
  ledgerEvent: mockDelegate(null, []),
  document: mockDelegate(null, []),

  // ── Prisma client utility methods ─────────────────────────
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
  $transaction: vi.fn().mockImplementation(
    async (callbackOrArray: unknown) => {
      if (typeof callbackOrArray === 'function') {
        // Interactive transaction: pass mock client back to callback
        return callbackOrArray(prismaMock);
      }
      // Sequential transaction: resolve all promises in array
      if (Array.isArray(callbackOrArray)) {
        return Promise.all(callbackOrArray);
      }
      return null;
    },
  ),
  $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  $executeRaw: vi.fn().mockResolvedValue(1),
  $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  $use: vi.fn(),
  $on: vi.fn(),
  $extends: vi.fn(),
} as unknown as PrismaClient & {
  tenant: ModelMockDelegate;
  user: ModelMockDelegate;
  auditLog: ModelMockDelegate;
  business: ModelMockDelegate;
  businessOwner: ModelMockDelegate;
  creditProfile: ModelMockDelegate;
  fundingRound: ModelMockDelegate;
  cardApplication: ModelMockDelegate;
  suitabilityCheck: ModelMockDelegate;
  consentRecord: ModelMockDelegate;
  productAcknowledgment: ModelMockDelegate;
  complianceCheck: ModelMockDelegate;
  achAuthorization: ModelMockDelegate;
  debitEvent: ModelMockDelegate;
  costCalculation: ModelMockDelegate;
  ledgerEvent: ModelMockDelegate;
  document: ModelMockDelegate;
};

// ── Reset helper ──────────────────────────────────────────────

/**
 * Resets all mock function call history and restores default return values.
 * Call in beforeEach to keep tests isolated.
 *
 * @example
 *   beforeEach(() => { resetPrismaMock(); });
 */
export function resetPrismaMock(): void {
  const delegates = [
    'tenant', 'user', 'auditLog',
    'business', 'businessOwner',
    'creditProfile',
    'fundingRound', 'cardApplication', 'suitabilityCheck',
    'consentRecord', 'productAcknowledgment', 'complianceCheck',
    'achAuthorization', 'debitEvent',
    'costCalculation',
    'ledgerEvent', 'document',
  ] as const;

  for (const name of delegates) {
    const delegate = (prismaMock as Record<string, unknown>)[name] as Record<string, MockFn>;
    for (const method of Object.values(delegate)) {
      if (typeof method?.mockReset === 'function') {
        method.mockReset();
      }
    }
  }

  // Re-apply defaults after reset
  (prismaMock.tenant as ModelMockDelegate).findUnique.mockResolvedValue(defaultTenant);
  (prismaMock.tenant as ModelMockDelegate).findFirst.mockResolvedValue(defaultTenant);
  (prismaMock.tenant as ModelMockDelegate).findMany.mockResolvedValue([defaultTenant]);
  (prismaMock.tenant as ModelMockDelegate).create.mockResolvedValue(defaultTenant);
  (prismaMock.tenant as ModelMockDelegate).update.mockResolvedValue(defaultTenant);

  (prismaMock.user as ModelMockDelegate).findUnique.mockResolvedValue(defaultUser);
  (prismaMock.user as ModelMockDelegate).findFirst.mockResolvedValue(defaultUser);
  (prismaMock.user as ModelMockDelegate).findMany.mockResolvedValue([defaultUser]);
  (prismaMock.user as ModelMockDelegate).create.mockResolvedValue(defaultUser);
  (prismaMock.user as ModelMockDelegate).update.mockResolvedValue(defaultUser);

  (prismaMock.business as ModelMockDelegate).findUnique.mockResolvedValue(defaultBusiness);
  (prismaMock.business as ModelMockDelegate).findFirst.mockResolvedValue(defaultBusiness);
  (prismaMock.business as ModelMockDelegate).findMany.mockResolvedValue([defaultBusiness]);
  (prismaMock.business as ModelMockDelegate).create.mockResolvedValue(defaultBusiness);
  (prismaMock.business as ModelMockDelegate).update.mockResolvedValue(defaultBusiness);

  (prismaMock.creditProfile as ModelMockDelegate).findMany.mockResolvedValue([defaultCreditProfile]);
  (prismaMock.creditProfile as ModelMockDelegate).create.mockResolvedValue(defaultCreditProfile);

  (prismaMock.fundingRound as ModelMockDelegate).findMany.mockResolvedValue([defaultFundingRound]);
  (prismaMock.fundingRound as ModelMockDelegate).findFirst.mockResolvedValue(defaultFundingRound);
  (prismaMock.fundingRound as ModelMockDelegate).create.mockResolvedValue(defaultFundingRound);

  (prismaMock.cardApplication as ModelMockDelegate).findMany.mockResolvedValue([defaultApplication]);
  (prismaMock.cardApplication as ModelMockDelegate).create.mockResolvedValue(defaultApplication);

  (prismaMock.consentRecord as ModelMockDelegate).findMany.mockResolvedValue([defaultConsentRecord]);
  (prismaMock.consentRecord as ModelMockDelegate).create.mockResolvedValue(defaultConsentRecord);

  (prismaMock.$transaction as MockFn).mockImplementation(
    async (callbackOrArray: unknown) => {
      if (typeof callbackOrArray === 'function') return callbackOrArray(prismaMock);
      if (Array.isArray(callbackOrArray)) return Promise.all(callbackOrArray);
      return null;
    },
  );
}

// ── Exports ───────────────────────────────────────────────────

export {
  defaultTenant,
  defaultUser,
  defaultBusiness,
  defaultOwner,
  defaultCreditProfile,
  defaultFundingRound,
  defaultApplication,
  defaultConsentRecord,
  defaultSuitabilityCheck,
  defaultAuditLog,
};
