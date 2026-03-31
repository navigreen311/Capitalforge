// ============================================================
// CapitalForge — Test Data Factory Functions
// Returns valid objects matching Prisma model shapes.
// Supports partial overrides for targeted test scenarios.
// ============================================================

import { Prisma } from '@prisma/client';

// ── ID counter for deterministic fake IDs ─────────────────────
let _seq = 0;
function nextId(prefix = 'test'): string {
  return `${prefix}-${String(++_seq).padStart(6, '0')}`;
}

/** Reset sequence counter between test files if needed */
export function resetTestSequence(): void {
  _seq = 0;
}

function dec(v: string | number): Prisma.Decimal {
  return new Prisma.Decimal(String(v));
}

function now(offsetMs = 0): Date {
  return new Date(Date.now() + offsetMs);
}

// ── Tenant ────────────────────────────────────────────────────

export interface TestTenant {
  id: string;
  name: string;
  slug: string;
  brandConfig: Prisma.JsonValue;
  plan: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function createTestTenant(overrides: Partial<TestTenant> = {}): TestTenant {
  const id = overrides.id ?? nextId('tenant');
  return {
    id,
    name: 'Test Advisors LLC',
    slug: `test-advisors-${id.slice(-6)}`,
    brandConfig: { primaryColor: '#000000' },
    plan: 'starter',
    isActive: true,
    createdAt: now(-86_400_000),
    updatedAt: now(),
    ...overrides,
  };
}

// ── User ──────────────────────────────────────────────────────

export interface TestUser {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string | null;
  firstName: string;
  lastName: string;
  role: string;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  const id = overrides.id ?? nextId('user');
  const tenantId = overrides.tenantId ?? nextId('tenant');
  return {
    id,
    tenantId,
    email: `user-${id}@test.capitalforge.io`,
    passwordHash: '$2b$12$mockedHashForTestingPurposes1234567',
    firstName: 'Test',
    lastName: 'User',
    role: 'advisor',
    mfaEnabled: false,
    mfaSecret: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: now(-43_200_000),
    updatedAt: now(),
    ...overrides,
  };
}

export function createTestAdminUser(overrides: Partial<TestUser> = {}): TestUser {
  return createTestUser({ role: 'admin', ...overrides });
}

// ── Business ──────────────────────────────────────────────────

export interface TestBusiness {
  id: string;
  tenantId: string;
  advisorId: string | null;
  legalName: string;
  dba: string | null;
  ein: string | null;
  entityType: string;
  stateOfFormation: string | null;
  dateOfFormation: Date | null;
  mcc: string | null;
  industry: string | null;
  annualRevenue: Prisma.Decimal | null;
  monthlyRevenue: Prisma.Decimal | null;
  fundingReadinessScore: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export function createTestBusiness(overrides: Partial<TestBusiness> = {}): TestBusiness {
  const id = overrides.id ?? nextId('biz');
  const tenantId = overrides.tenantId ?? nextId('tenant');
  return {
    id,
    tenantId,
    advisorId: null,
    legalName: `Test Business ${id} LLC`,
    dba: null,
    ein: '99-0000000',
    entityType: 'llc',
    stateOfFormation: 'DE',
    dateOfFormation: new Date('2020-01-01'),
    mcc: '7372',
    industry: 'Technology',
    annualRevenue: dec('120000'),
    monthlyRevenue: dec('10000'),
    fundingReadinessScore: 72,
    status: 'active',
    createdAt: now(-86_400_000),
    updatedAt: now(),
    ...overrides,
  };
}

// ── Business Owner ────────────────────────────────────────────

export interface TestBusinessOwner {
  id: string;
  businessId: string;
  firstName: string;
  lastName: string;
  ownershipPercent: Prisma.Decimal;
  ssn: string | null;
  dateOfBirth: Date | null;
  address: Prisma.JsonValue | null;
  isBeneficialOwner: boolean;
  kycStatus: string;
  kycVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function createTestOwner(overrides: Partial<TestBusinessOwner> = {}): TestBusinessOwner {
  const id = overrides.id ?? nextId('owner');
  const businessId = overrides.businessId ?? nextId('biz');
  return {
    id,
    businessId,
    firstName: 'Jane',
    lastName: 'Doe',
    ownershipPercent: dec('100'),
    ssn: null,
    dateOfBirth: new Date('1980-05-15'),
    address: {
      street: '123 Main St',
      city: 'Anytown',
      state: 'DE',
      zip: '19801',
      country: 'US',
    },
    isBeneficialOwner: true,
    kycStatus: 'pending',
    kycVerifiedAt: null,
    createdAt: now(-86_400_000),
    updatedAt: now(),
    ...overrides,
  };
}

// ── Credit Profile ────────────────────────────────────────────

export interface TestCreditProfile {
  id: string;
  businessId: string;
  profileType: string;
  bureau: string;
  score: number | null;
  scoreType: string | null;
  utilization: Prisma.Decimal | null;
  inquiryCount: number | null;
  derogatoryCount: number | null;
  tradelines: Prisma.JsonValue | null;
  rawData: Prisma.JsonValue | null;
  pulledAt: Date;
  createdAt: Date;
}

export function createTestCreditProfile(
  overrides: Partial<TestCreditProfile> = {},
): TestCreditProfile {
  const id = overrides.id ?? nextId('cp');
  const businessId = overrides.businessId ?? nextId('biz');
  return {
    id,
    businessId,
    profileType: 'personal',
    bureau: 'experian',
    score: 720,
    scoreType: 'fico',
    utilization: dec('0.25'),
    inquiryCount: 3,
    derogatoryCount: 0,
    tradelines: { accounts: 12, avgAge: 7.5 },
    rawData: null,
    pulledAt: now(-604_800_000), // 7 days ago
    createdAt: now(-604_800_000),
    ...overrides,
  };
}

// ── Funding Round ─────────────────────────────────────────────

export interface TestFundingRound {
  id: string;
  businessId: string;
  roundNumber: number;
  targetCredit: Prisma.Decimal | null;
  targetCardCount: number | null;
  status: string;
  aprExpiryDate: Date | null;
  alertSent60: boolean;
  alertSent30: boolean;
  alertSent15: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function createTestFundingRound(
  overrides: Partial<TestFundingRound> = {},
): TestFundingRound {
  const id = overrides.id ?? nextId('round');
  const businessId = overrides.businessId ?? nextId('biz');
  return {
    id,
    businessId,
    roundNumber: 1,
    targetCredit: dec('100000'),
    targetCardCount: 4,
    status: 'planning',
    aprExpiryDate: null,
    alertSent60: false,
    alertSent30: false,
    alertSent15: false,
    startedAt: null,
    completedAt: null,
    createdAt: now(-86_400_000),
    updatedAt: now(),
    ...overrides,
  };
}

// ── Card Application ──────────────────────────────────────────

export interface TestCardApplication {
  id: string;
  businessId: string;
  fundingRoundId: string | null;
  issuer: string;
  cardProduct: string;
  status: string;
  creditLimit: Prisma.Decimal | null;
  introApr: Prisma.Decimal | null;
  introAprExpiry: Date | null;
  regularApr: Prisma.Decimal | null;
  annualFee: Prisma.Decimal | null;
  cashAdvanceFee: Prisma.Decimal | null;
  consentCapturedAt: Date | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  declineReason: string | null;
  adverseActionNotice: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

export function createTestApplication(
  overrides: Partial<TestCardApplication> = {},
): TestCardApplication {
  const id = overrides.id ?? nextId('app');
  const businessId = overrides.businessId ?? nextId('biz');
  return {
    id,
    businessId,
    fundingRoundId: null,
    issuer: 'Chase',
    cardProduct: 'Ink Business Preferred',
    status: 'draft',
    creditLimit: null,
    introApr: null,
    introAprExpiry: null,
    regularApr: dec('0.2124'),
    annualFee: dec('95'),
    cashAdvanceFee: dec('0.05'),
    consentCapturedAt: null,
    submittedAt: null,
    decidedAt: null,
    declineReason: null,
    adverseActionNotice: null,
    createdAt: now(-3_600_000),
    updatedAt: now(),
    ...overrides,
  };
}

// ── Consent Record ────────────────────────────────────────────

export interface TestConsentRecord {
  id: string;
  tenantId: string;
  businessId: string | null;
  channel: string;
  consentType: string;
  status: string;
  grantedAt: Date;
  revokedAt: Date | null;
  revocationReason: string | null;
  ipAddress: string | null;
  evidenceRef: string | null;
  metadata: Prisma.JsonValue | null;
}

export function createTestConsentRecord(
  overrides: Partial<TestConsentRecord> = {},
): TestConsentRecord {
  const id = overrides.id ?? nextId('consent');
  const tenantId = overrides.tenantId ?? nextId('tenant');
  return {
    id,
    tenantId,
    businessId: null,
    channel: 'email',
    consentType: 'tcpa',
    status: 'active',
    grantedAt: now(-86_400_000),
    revokedAt: null,
    revocationReason: null,
    ipAddress: '192.0.2.1',
    evidenceRef: `email-ref-${id}`,
    metadata: { source: 'test' },
    ...overrides,
  };
}

// ── Suitability Check ─────────────────────────────────────────

export interface TestSuitabilityCheck {
  id: string;
  businessId: string;
  score: number;
  maxSafeLeverage: Prisma.Decimal | null;
  recommendation: string;
  noGoTriggered: boolean;
  noGoReasons: Prisma.JsonValue | null;
  alternativeProducts: Prisma.JsonValue | null;
  decisionExplanation: string | null;
  overriddenBy: string | null;
  overrideReason: string | null;
  createdAt: Date;
}

export function createTestSuitabilityCheck(
  overrides: Partial<TestSuitabilityCheck> = {},
): TestSuitabilityCheck {
  const id = overrides.id ?? nextId('suit');
  const businessId = overrides.businessId ?? nextId('biz');
  return {
    id,
    businessId,
    score: 72,
    maxSafeLeverage: dec('100000'),
    recommendation: 'proceed',
    noGoTriggered: false,
    noGoReasons: [],
    alternativeProducts: [],
    decisionExplanation: 'Standard approval based on credit profile.',
    overriddenBy: null,
    overrideReason: null,
    createdAt: now(-3_600_000),
    ...overrides,
  };
}

// ── Audit Log ─────────────────────────────────────────────────

export interface TestAuditLog {
  id: string;
  userId: string | null;
  tenantId: string;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Prisma.JsonValue | null;
  ipAddress: string | null;
  timestamp: Date;
}

export function createTestAuditLog(overrides: Partial<TestAuditLog> = {}): TestAuditLog {
  const id = overrides.id ?? nextId('audit');
  const tenantId = overrides.tenantId ?? nextId('tenant');
  return {
    id,
    userId: null,
    tenantId,
    action: 'CREATE',
    resource: 'business',
    resourceId: null,
    metadata: null,
    ipAddress: '192.0.2.1',
    timestamp: now(),
    ...overrides,
  };
}

// ── Composite builders ────────────────────────────────────────

/**
 * Build a complete business graph: tenant + advisor user + business + owner.
 * Returns all entities with consistent foreign keys.
 */
export function createTestBusinessGraph(overrides: {
  tenant?: Partial<TestTenant>;
  user?: Partial<TestUser>;
  business?: Partial<TestBusiness>;
  owner?: Partial<TestBusinessOwner>;
} = {}) {
  const tenant = createTestTenant(overrides.tenant);
  const user = createTestUser({ tenantId: tenant.id, ...overrides.user });
  const business = createTestBusiness({
    tenantId: tenant.id,
    advisorId: user.id,
    ...overrides.business,
  });
  const owner = createTestOwner({ businessId: business.id, ...overrides.owner });

  return { tenant, user, business, owner };
}
