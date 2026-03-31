// ============================================================
// CapitalForge — E2E Test Helpers
//
// Provides:
//   - createFullTestBusiness()  — complete tenant/user/business/owner/
//     credit-profile/consent/acknowledgment graph with consistent IDs
//   - cleanupTestBusiness()     — reset mock call history for a graph
//   - createEventBusSpy()       — spy on all publishAndPersist calls
//   - buildCallerContext()      — CallerContext for application pipeline
//   - makePrismaMockFor()       — local prisma mock scoped to a business graph
// ============================================================

import { vi, type MockInstance } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
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
  type TestTenant,
  type TestUser,
  type TestBusiness,
  type TestBusinessOwner,
  type TestCreditProfile,
  type TestFundingRound,
  type TestCardApplication,
  type TestConsentRecord,
  type TestSuitabilityCheck,
} from '../../fixtures/test-data.js';

// ── Graph type ────────────────────────────────────────────────

export interface TestBusinessGraph {
  tenant: TestTenant;
  advisorUser: TestUser;
  complianceUser: TestUser;
  business: TestBusiness;
  owner: TestBusinessOwner;
  creditProfile: TestCreditProfile;
  fundingRound: TestFundingRound;
  application: TestCardApplication;
  tcpaConsent: TestConsentRecord;
  suitability: TestSuitabilityCheck;

  /** Shared Prisma mock wired to this graph's IDs */
  prisma: ReturnType<typeof makePrismaMockFor>;
}

// ── Factory ───────────────────────────────────────────────────

/**
 * Build a complete, self-consistent business graph for E2E tests.
 * All FK references are internally consistent.
 *
 * Optionally accepts per-entity overrides so individual tests can
 * customise a single field without rebuilding the whole graph.
 */
export function createFullTestBusiness(opts: {
  tenantIdSuffix?: string;
  kybVerified?: boolean;
  kycVerified?: boolean;
  withConsent?: boolean;
  withAcknowledgment?: boolean;
  creditScore?: number;
  annualRevenue?: number;
  businessAgeYears?: number;
  existingDebt?: number;
} = {}): TestBusinessGraph {
  const {
    tenantIdSuffix   = 'e2e',
    kybVerified      = true,
    kycVerified      = true,
    withConsent      = true,
    creditScore      = 720,
    annualRevenue    = 480_000,
    businessAgeYears = 3,
    existingDebt     = 20_000,
  } = opts;

  const tenant = createTestTenant({
    id:   `tenant-${tenantIdSuffix}`,
    name: 'E2E Advisors LLC',
    slug: `e2e-advisors-${tenantIdSuffix}`,
  });

  const advisorUser = createTestUser({
    id:       `user-advisor-${tenantIdSuffix}`,
    tenantId: tenant.id,
    role:     'advisor',
    email:    `advisor-${tenantIdSuffix}@test.capitalforge.io`,
  });

  const complianceUser = createTestUser({
    id:       `user-compliance-${tenantIdSuffix}`,
    tenantId: tenant.id,
    role:     'compliance_officer',
    email:    `compliance-${tenantIdSuffix}@test.capitalforge.io`,
  });

  const formationDate = new Date(
    Date.now() - businessAgeYears * 365.25 * 24 * 60 * 60 * 1000,
  );

  const business = createTestBusiness({
    id:                  `biz-${tenantIdSuffix}`,
    tenantId:            tenant.id,
    advisorId:           advisorUser.id,
    legalName:           `E2E Test Corp ${tenantIdSuffix} LLC`,
    ein:                 '82-1234567',
    entityType:          'llc',
    stateOfFormation:    'DE',
    dateOfFormation:     formationDate,
    industry:            'technology consulting',
    mcc:                 '7372',
    annualRevenue:       new Prisma.Decimal(String(annualRevenue)),
    monthlyRevenue:      new Prisma.Decimal(String(annualRevenue / 12)),
    fundingReadinessScore: 75,
    status:              kybVerified ? 'active' : 'intake',
  });

  const owner = createTestOwner({
    id:               `owner-${tenantIdSuffix}`,
    businessId:       business.id,
    firstName:        'Jane',
    lastName:         'Doe',
    ownershipPercent: new Prisma.Decimal('100'),
    isBeneficialOwner: true,
    kycStatus:        kycVerified ? 'verified' : 'pending',
    kycVerifiedAt:    kycVerified ? new Date() : null,
  });

  const creditProfile = createTestCreditProfile({
    id:          `cp-${tenantIdSuffix}`,
    businessId:  business.id,
    score:       creditScore,
    utilization: new Prisma.Decimal('0.22'),
    inquiryCount: 2,
    derogatoryCount: 0,
  });

  const fundingRound = createTestFundingRound({
    id:          `round-${tenantIdSuffix}`,
    businessId:  business.id,
    status:      'planning',
    targetCredit: new Prisma.Decimal('120000'),
    targetCardCount: 4,
  });

  const application = createTestApplication({
    id:             `app-${tenantIdSuffix}`,
    businessId:     business.id,
    fundingRoundId: fundingRound.id,
    issuer:         'Chase',
    cardProduct:    'Ink Business Preferred',
    status:         'draft',
    regularApr:     new Prisma.Decimal('0.2124'),
    annualFee:      new Prisma.Decimal('95'),
    creditLimit:    new Prisma.Decimal('25000'),
    introApr:       new Prisma.Decimal('0'),
    introAprExpiry: new Date(Date.now() + 12 * 30 * 24 * 60 * 60 * 1000),
  });

  const tcpaConsent = createTestConsentRecord({
    id:          `consent-${tenantIdSuffix}`,
    tenantId:    tenant.id,
    businessId:  business.id,
    channel:     'voice',
    consentType: 'tcpa',
    status:      withConsent ? 'active' : 'revoked',
    grantedAt:   new Date(Date.now() - 24 * 60 * 60 * 1000),
    evidenceRef: `tcpa-sig-${tenantIdSuffix}`,
  });

  const suitability = createTestSuitabilityCheck({
    id:              `suit-${tenantIdSuffix}`,
    businessId:      business.id,
    score:           76,
    maxSafeLeverage: new Prisma.Decimal('120000'),
    recommendation:  'APPROVED (score: 76): Business profile supports credit card stacking.',
    noGoTriggered:   false,
    noGoReasons:     [],
  });

  const prisma = makePrismaMockFor({
    tenant,
    advisorUser,
    complianceUser,
    business,
    owner,
    creditProfile,
    fundingRound,
    application,
    tcpaConsent,
    suitability,
    existingDebt,
    kybVerified,
  });

  return {
    tenant,
    advisorUser,
    complianceUser,
    business,
    owner,
    creditProfile,
    fundingRound,
    application,
    tcpaConsent,
    suitability,
    prisma,
  };
}

// ── Prisma mock factory ───────────────────────────────────────

type MockFn = ReturnType<typeof vi.fn>;

function mockDelegate(defaultSingle: unknown = null, defaultMany: unknown[] = []) {
  return {
    findMany:            vi.fn().mockResolvedValue(defaultMany),
    findFirst:           vi.fn().mockResolvedValue(defaultSingle),
    findUnique:          vi.fn().mockResolvedValue(defaultSingle),
    findUniqueOrThrow:   vi.fn().mockResolvedValue(defaultSingle),
    findFirstOrThrow:    vi.fn().mockResolvedValue(defaultSingle),
    create:              vi.fn().mockResolvedValue(defaultSingle),
    createMany:          vi.fn().mockResolvedValue({ count: 1 }),
    update:              vi.fn().mockResolvedValue(defaultSingle),
    updateMany:          vi.fn().mockResolvedValue({ count: 1 }),
    upsert:              vi.fn().mockResolvedValue(defaultSingle),
    delete:              vi.fn().mockResolvedValue(defaultSingle),
    deleteMany:          vi.fn().mockResolvedValue({ count: 1 }),
    count:               vi.fn().mockResolvedValue(defaultMany.length),
    aggregate:           vi.fn().mockResolvedValue({}),
    groupBy:             vi.fn().mockResolvedValue([]),
  };
}

export function makePrismaMockFor(graph: {
  tenant: TestTenant;
  advisorUser: TestUser;
  complianceUser: TestUser;
  business: TestBusiness;
  owner: TestBusinessOwner;
  creditProfile: TestCreditProfile;
  fundingRound: TestFundingRound;
  application: TestCardApplication;
  tcpaConsent: TestConsentRecord;
  suitability: TestSuitabilityCheck;
  existingDebt?: number;
  kybVerified?: boolean;
}) {
  const { business, owner, kybVerified = true } = graph;

  // KYB compliance check record
  const kybCheck = {
    id:          `kyb-check-${graph.tenant.id}`,
    tenantId:    graph.tenant.id,
    businessId:  business.id,
    checkType:   'kyb',
    riskScore:   kybVerified ? 10 : 70,
    riskLevel:   kybVerified ? 'low' : 'high',
    findings:    kybVerified
      ? { status: 'verified', summary: 'KYB VERIFIED' }
      : { status: 'failed',   summary: 'KYB FAILED' },
    createdAt:   new Date(Date.now() - 12 * 60 * 60 * 1000),
  };

  const ackRecord = {
    id:                 `ack-${business.id}`,
    businessId:         business.id,
    acknowledgmentType: 'product_reality',
    version:            '1.0.0',
    signedAt:           new Date(Date.now() - 6 * 60 * 60 * 1000),
    signatureRef:       `ack_abc123def456`,
    documentVaultId:    `doc-ack-${business.id}`,
    metadata:           { signerUserId: graph.advisorUser.id },
    createdAt:          new Date(Date.now() - 6 * 60 * 60 * 1000),
  };

  const documentRecord = {
    id:             `doc-${business.id}`,
    tenantId:       graph.tenant.id,
    businessId:     business.id,
    documentType:   'consent_form',
    title:          'TCPA Consent Form',
    storageKey:     `docs/${graph.tenant.id}/${business.id}/consent.txt`,
    mimeType:       'text/plain',
    sizeBytes:      1024,
    sha256Hash:     'abc123',
    cryptoTimestamp: new Date().toISOString() + ':abc123def456789a',
    legalHold:      false,
    uploadedBy:     graph.advisorUser.id,
    metadata:       {},
    createdAt:      new Date(),
    updatedAt:      new Date(),
  };

  const costCalculationRecord = {
    id:          `cost-${business.id}`,
    businessId:  business.id,
    tenantId:    graph.tenant.id,
    totalFunding: new Prisma.Decimal('25000'),
    programFee:  new Prisma.Decimal('1500'),
    effectiveApr: new Prisma.Decimal('0.0450'),
    breakdown:   {},
    createdAt:   new Date(),
  };

  const mock = {
    tenant: mockDelegate(graph.tenant, [graph.tenant]),
    user: mockDelegate(graph.advisorUser, [graph.advisorUser, graph.complianceUser]),

    business: {
      ...mockDelegate(business, [business]),
      // findFirst with include: { owners } returns business + owners
      findFirst: vi.fn().mockImplementation((args?: { include?: unknown }) => {
        if (args?.include && (args.include as Record<string, unknown>).owners) {
          return Promise.resolve({ ...business, owners: [owner] });
        }
        return Promise.resolve(business);
      }),
    },

    businessOwner: mockDelegate(owner, [owner]),

    creditProfile: mockDelegate(graph.creditProfile, [graph.creditProfile]),

    fundingRound: mockDelegate(graph.fundingRound, [graph.fundingRound]),

    cardApplication: {
      ...mockDelegate(graph.application, [graph.application]),
      create: vi.fn().mockResolvedValue(graph.application),
    },

    suitabilityCheck: {
      ...mockDelegate(graph.suitability, [graph.suitability]),
      create: vi.fn().mockResolvedValue(graph.suitability),
    },

    consentRecord: mockDelegate(graph.tcpaConsent, [graph.tcpaConsent]),

    productAcknowledgment: {
      ...mockDelegate(ackRecord, [ackRecord]),
      create: vi.fn().mockResolvedValue(ackRecord),
    },

    complianceCheck: {
      ...mockDelegate(kybCheck, [kybCheck]),
      create: vi.fn().mockResolvedValue(kybCheck),
      findFirst: vi.fn().mockResolvedValue(kybCheck),
    },

    achAuthorization: mockDelegate(null, []),
    debitEvent:       mockDelegate(null, []),

    costCalculation: {
      ...mockDelegate(costCalculationRecord, [costCalculationRecord]),
      create: vi.fn().mockResolvedValue(costCalculationRecord),
    },

    ledgerEvent: {
      ...mockDelegate(null, []),
      create: vi.fn().mockResolvedValue({ id: 'ledger-001', publishedAt: new Date() }),
    },

    document: {
      ...mockDelegate(documentRecord, [documentRecord]),
      create: vi.fn().mockResolvedValue(documentRecord),
      findMany: vi.fn().mockResolvedValue([documentRecord]),
    },

    auditLog: mockDelegate(null, []),

    $connect:    vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn().mockImplementation(async (callbackOrArray: unknown) => {
      if (typeof callbackOrArray === 'function') {
        return callbackOrArray(mock);
      }
      if (Array.isArray(callbackOrArray)) {
        return Promise.all(callbackOrArray);
      }
      return null;
    }),
    $queryRaw:        vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $executeRaw:      vi.fn().mockResolvedValue(1),
    $queryRawUnsafe:  vi.fn().mockResolvedValue([]),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $use:     vi.fn(),
    $on:      vi.fn(),
    $extends: vi.fn(),
  };

  return mock as unknown as PrismaClient & typeof mock;
}

// ── Cleanup helper ────────────────────────────────────────────

/**
 * Reset all mock call history on the prisma mock embedded in a graph.
 * Call in beforeEach / afterEach to keep tests isolated.
 */
export function cleanupTestBusiness(graph: TestBusinessGraph): void {
  const delegates = [
    'tenant', 'user', 'business', 'businessOwner', 'creditProfile',
    'fundingRound', 'cardApplication', 'suitabilityCheck', 'consentRecord',
    'productAcknowledgment', 'complianceCheck', 'achAuthorization',
    'debitEvent', 'costCalculation', 'ledgerEvent', 'document', 'auditLog',
  ] as const;

  for (const name of delegates) {
    const delegate = (graph.prisma as unknown as Record<string, Record<string, MockFn>>)[name];
    if (delegate) {
      for (const fn of Object.values(delegate)) {
        if (typeof fn?.mockClear === 'function') fn.mockClear();
      }
    }
  }
}

// ── Event bus spy ─────────────────────────────────────────────

export interface EventBusSpy {
  spy: MockInstance;
  /** All events published during the test, in order */
  published: Array<{ tenantId: string; eventType: string; payload: unknown }>;
  /** Find the first event matching a type */
  findEvent: (eventType: string) => { tenantId: string; eventType: string; payload: unknown } | undefined;
  /** Assert at least one event of given type was published */
  assertEventFired: (eventType: string) => void;
  restore: () => void;
}

/**
 * Attach a spy to `eventBus.publishAndPersist` and collect all events.
 *
 * Usage:
 *   const spy = createEventBusSpy();
 *   // ... run service calls ...
 *   spy.assertEventFired('business.created');
 *   spy.restore();
 */
export function createEventBusSpy(eventBus: { publishAndPersist: (...args: unknown[]) => unknown }): EventBusSpy {
  const published: EventBusSpy['published'] = [];

  const spy = vi.spyOn(eventBus, 'publishAndPersist').mockImplementation(
    async (tenantId: unknown, envelope: unknown) => {
      const env = envelope as { eventType: string; payload?: unknown };
      published.push({ tenantId: String(tenantId), eventType: env.eventType, payload: env.payload ?? {} });
      return { id: `ledger-${Date.now()}`, publishedAt: new Date() };
    },
  );

  return {
    spy,
    published,
    findEvent: (eventType) => published.find((e) => e.eventType === eventType),
    assertEventFired: (eventType) => {
      const found = published.some((e) => e.eventType === eventType);
      if (!found) {
        throw new Error(
          `Expected event "${eventType}" to be fired. ` +
          `Published events: [${published.map((e) => e.eventType).join(', ')}]`,
        );
      }
    },
    restore: () => spy.mockRestore(),
  };
}

// ── CallerContext builder ─────────────────────────────────────

export interface CallerContext {
  tenantId: string;
  userId: string;
  role: string;
  permissions: string[];
}

export function buildCallerContext(
  graph: TestBusinessGraph,
  role: 'advisor' | 'compliance_officer' | 'tenant_admin' = 'advisor',
): CallerContext {
  const user = role === 'compliance_officer' ? graph.complianceUser : graph.advisorUser;
  const permissions = role === 'compliance_officer'
    ? ['compliance:read', 'compliance:write', 'business:read']
    : role === 'tenant_admin'
      ? ['business:read', 'business:write', 'application:submit', 'application:approve', 'compliance:read']
      : ['business:read', 'business:write', 'application:submit'];

  return {
    tenantId:    graph.tenant.id,
    userId:      user.id,
    role,
    permissions,
  };
}
