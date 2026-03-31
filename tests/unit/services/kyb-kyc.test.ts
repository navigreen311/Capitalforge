// ============================================================
// CapitalForge — KYB / KYC Service Unit Tests
//
// Coverage:
//   sanctions-screening.ts  — OFAC watchlist matching, confidence scoring
//   fraud-detection.ts      — All 5 heuristic checks, score aggregation
//   kyb-kyc.service.ts      — KYB flow, KYC flow, verification status
//                             (Prisma and EventBus are mocked)
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module mocks (must be declared before imports) ───────────────────────────

// Mock Prisma so we never hit a real database
vi.mock('@prisma/client', () => {
  const mockPrisma = {
    business: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    businessOwner: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    complianceCheck: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  return {
    PrismaClient: vi.fn(() => mockPrisma),
    Prisma: {
      Decimal: class MockDecimal {
        private val: number;
        constructor(v: number) { this.val = v; }
        toString() { return String(this.val); }
      },
      JsonObject: {},
    },
  };
});

// Mock EventBus so we assert publishes without side-effects
vi.mock('../../../src/backend/events/event-bus.js', () => ({
  eventBus: {
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'mock-event-id', publishedAt: new Date() }),
    publish: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { screenSanctions, isHardOFACStop } from '../../../src/backend/services/sanctions-screening.js';
import { detectFraud } from '../../../src/backend/services/fraud-detection.js';
import {
  verifyKyb,
  verifyKyc,
  getVerificationStatus,
  KybKycError,
} from '../../../src/backend/services/kyb-kyc.service.js';
import { PrismaClient, Prisma } from '@prisma/client';
import { eventBus } from '../../../src/backend/events/event-bus.js';
import { EVENT_TYPES } from '../../../src/shared/constants/index.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

// Typed access to the mocked prisma instance
function getMockPrisma() {
  const instance = new (PrismaClient as unknown as new () => {
    business: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    businessOwner: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    complianceCheck: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
  })();
  return instance;
}

const mockPrisma = getMockPrisma();

function makeKybRequest(overrides = {}) {
  return {
    legalName: 'Acme Innovations LLC',
    entityType: 'llc' as const,
    ein: '12-3456789',
    stateOfFormation: 'CA',
    dateOfFormation: '2020-01-15',
    registeredAddress: {
      street: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      country: 'US',
    },
    ...overrides,
  };
}

function makeKycRequest(overrides = {}) {
  return {
    firstName: 'Jane',
    lastName: 'Smith',
    ownershipPercent: 51,
    ssn: '123-45-6789',
    dateOfBirth: '1985-06-15',
    address: {
      street: '456 Oak Ave',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90001',
      country: 'US',
    },
    ...overrides,
  };
}

function makeMockBusiness(overrides = {}) {
  return {
    id: 'biz-001',
    tenantId: 'tenant-001',
    legalName: 'Acme Innovations LLC',
    status: 'intake',
    ein: null,
    owners: [],
    ...overrides,
  };
}

function makeMockOwner(overrides = {}) {
  return {
    id: 'owner-001',
    businessId: 'biz-001',
    firstName: 'Jane',
    lastName: 'Smith',
    ownershipPercent: { toString: () => '51' },
    isBeneficialOwner: true,
    kycStatus: 'pending',
    kycVerifiedAt: null,
    ...overrides,
  };
}

// ── SANCTIONS SCREENING TESTS ─────────────────────────────────────────────────

describe('sanctions-screening', () => {
  describe('screenSanctions()', () => {
    it('returns no_match for a clearly clean name', async () => {
      const result = await screenSanctions({ name: 'Completely Legitimate Business Inc' });
      expect(result.result).toBe('no_match');
      expect(result.confidenceScore).toBeLessThan(0.55);
      expect(result.requiresManualReview).toBe(false);
      expect(result.matchedEntries).toHaveLength(0);
      expect(result.screenedAt).toBeInstanceOf(Date);
    });

    it('returns match for a name that is identical to a stub watchlist entry', async () => {
      // "Sanctioned Corp LLC" is in OFAC_SDN_STUB
      const result = await screenSanctions({ name: 'Sanctioned Corp LLC' });
      expect(result.result).toBe('match');
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.85);
      expect(result.requiresManualReview).toBe(true);
      expect(result.matchedEntries.length).toBeGreaterThan(0);
    });

    it('returns possible_match for a fuzzy near-match name', async () => {
      // Slight variation on "Blocked Entity International"
      const result = await screenSanctions({ name: 'Blocked Entities International' });
      expect(['possible_match', 'match']).toContain(result.result);
      expect(result.requiresManualReview).toBe(true);
    });

    it('country boost increases confidence for matching-country entry', async () => {
      const withCountry = await screenSanctions({
        name: 'Sanctioned Corp LLC',
        country: 'IR', // Iran — matches the stub entry country
      });
      const withoutCountry = await screenSanctions({ name: 'Sanctioned Corp LLC' });

      // Country match should produce equal or higher confidence
      expect(withCountry.confidenceScore).toBeGreaterThanOrEqual(withoutCountry.confidenceScore);
    });

    it('PEP watchlist entry triggers a match', async () => {
      const result = await screenSanctions({ name: 'PEP Individual One' });
      expect(result.result).toBe('match');
      expect(result.requiresManualReview).toBe(true);
    });

    it('includes screenedAt timestamp in result', async () => {
      const before = new Date();
      const result = await screenSanctions({ name: 'Clean Business Name' });
      const after = new Date();
      expect(result.screenedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.screenedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('isHardOFACStop()', () => {
    it('returns true for match result', () => {
      const mockOutput = {
        result: 'match' as const,
        confidenceScore: 0.95,
        reason: 'hard match',
        requiresManualReview: true,
        matchedEntries: ['Bad Actor'],
        screenedAt: new Date(),
      };
      expect(isHardOFACStop(mockOutput)).toBe(true);
    });

    it('returns false for possible_match result', () => {
      const mockOutput = {
        result: 'possible_match' as const,
        confidenceScore: 0.65,
        reason: 'possible match',
        requiresManualReview: true,
        matchedEntries: ['Possible Entity'],
        screenedAt: new Date(),
      };
      expect(isHardOFACStop(mockOutput)).toBe(false);
    });

    it('returns false for no_match result', () => {
      const mockOutput = {
        result: 'no_match' as const,
        confidenceScore: 0.1,
        reason: 'no match',
        requiresManualReview: false,
        matchedEntries: [],
        screenedAt: new Date(),
      };
      expect(isHardOFACStop(mockOutput)).toBe(false);
    });
  });
});

// ── FRAUD DETECTION TESTS ─────────────────────────────────────────────────────

describe('fraud-detection', () => {
  describe('detectFraud()', () => {
    it('returns low risk with no signals for a clean input', async () => {
      const result = await detectFraud({
        dateOfBirth: '1990-03-20',
        creditFileAgeMonths: 84,
        tradelineCount: 8,
        highestCreditLimit: 5000,
        inquiriesLast6Mo: 1,
        einVerified: true,
        einAgeMonths: 48,
        entityFormationDate: '2022-01-01', // ~50 months ago, gap with EIN of 48 months is ~2 (<6 tolerance)
      });
      expect(result.riskScore).toBeLessThan(30);
      expect(result.disposition).toBe('low');
      expect(result.requiresManualReview).toBe(false);
      expect(result.signals).toHaveLength(0);
    });

    it('detects SSN_AGE_MISMATCH when adult has thin credit file', async () => {
      const result = await detectFraud({
        dateOfBirth: '1975-01-01', // ~50 years old
        creditFileAgeMonths: 12,   // only 1 year old credit file
      });
      const codes = result.signals.map((s) => s.code);
      expect(codes).toContain('SSN_AGE_MISMATCH');
      expect(result.signals.find((s) => s.code === 'SSN_AGE_MISMATCH')?.flagForReview).toBe(true);
    });

    it('detects SSN_THIN_FILE_ADULT for 25+ year old with < 12 month file', async () => {
      const result = await detectFraud({
        dateOfBirth: '1995-01-01', // ~31 years old
        creditFileAgeMonths: 8,
      });
      const codes = result.signals.map((s) => s.code);
      expect(codes).toContain('SSN_THIN_FILE_ADULT');
    });

    it('detects ADDRESS_VELOCITY_CRITICAL with 4+ moves in 12 months', async () => {
      const recentDate = (monthsAgo: number) => {
        const d = new Date();
        d.setMonth(d.getMonth() - monthsAgo);
        return d.toISOString().split('T')[0];
      };
      const result = await detectFraud({
        addressHistory: [
          { street: '1 A St', city: 'NY', state: 'NY', zip: '10001', movedInDate: recentDate(1) },
          { street: '2 B St', city: 'NY', state: 'NY', zip: '10002', movedInDate: recentDate(3) },
          { street: '3 C St', city: 'CA', state: 'CA', zip: '90001', movedInDate: recentDate(6) },
          { street: '4 D St', city: 'TX', state: 'TX', zip: '75001', movedInDate: recentDate(9) },
        ],
      });
      const codes = result.signals.map((s) => s.code);
      expect(codes).toContain('ADDRESS_VELOCITY_CRITICAL');
      expect(result.signals.find((s) => s.code === 'ADDRESS_VELOCITY_CRITICAL')?.flagForReview).toBe(true);
    });

    it('detects ADDRESS_VELOCITY_ELEVATED with 2-3 moves in 12 months', async () => {
      const recentDate = (monthsAgo: number) => {
        const d = new Date();
        d.setMonth(d.getMonth() - monthsAgo);
        return d.toISOString().split('T')[0];
      };
      const result = await detectFraud({
        addressHistory: [
          { street: '1 A St', city: 'NY', state: 'NY', zip: '10001', movedInDate: recentDate(2) },
          { street: '2 B St', city: 'TX', state: 'TX', zip: '75001', movedInDate: recentDate(8) },
        ],
      });
      const codes = result.signals.map((s) => s.code);
      expect(codes).toContain('ADDRESS_VELOCITY_ELEVATED');
    });

    it('detects THIN_FILE_HIGH_LIMIT when thin file has high credit limit', async () => {
      const result = await detectFraud({
        creditFileAgeMonths: 18,
        tradelineCount: 2,
        highestCreditLimit: 25000,
      });
      const codes = result.signals.map((s) => s.code);
      expect(codes).toContain('THIN_FILE_HIGH_LIMIT');
      expect(result.signals.find((s) => s.code === 'THIN_FILE_HIGH_LIMIT')?.flagForReview).toBe(true);
    });

    it('detects NO_TRADELINES when credit file exists but has zero tradelines', async () => {
      const result = await detectFraud({
        creditFileAgeMonths: 24,
        tradelineCount: 0,
        highestCreditLimit: 0,
      });
      const codes = result.signals.map((s) => s.code);
      expect(codes).toContain('NO_TRADELINES');
    });

    it('detects INQUIRY_VELOCITY_CRITICAL at 10+ inquiries', async () => {
      const result = await detectFraud({ inquiriesLast6Mo: 12 });
      const codes = result.signals.map((s) => s.code);
      expect(codes).toContain('INQUIRY_VELOCITY_CRITICAL');
    });

    it('detects INQUIRY_VELOCITY_HIGH at 6-9 inquiries', async () => {
      const result = await detectFraud({ inquiriesLast6Mo: 7 });
      const codes = result.signals.map((s) => s.code);
      expect(codes).toContain('INQUIRY_VELOCITY_HIGH');
    });

    it('detects EIN_NOT_VERIFIED when einVerified is false', async () => {
      const result = await detectFraud({ einVerified: false });
      const codes = result.signals.map((s) => s.code);
      expect(codes).toContain('EIN_NOT_VERIFIED');
      expect(result.riskScore).toBeGreaterThanOrEqual(50);
    });

    it('detects EIN_ENTITY_AGE_MISMATCH when EIN is much younger than entity', async () => {
      const result = await detectFraud({
        einVerified: true,
        einAgeMonths: 3,
        entityFormationDate: '2015-01-01', // 10+ years old entity
      });
      const codes = result.signals.map((s) => s.code);
      expect(codes).toContain('EIN_ENTITY_AGE_MISMATCH');
    });

    it('detects EIN_ADDRESS_CHURN for 5+ EIN addresses', async () => {
      const result = await detectFraud({
        einVerified: true,
        einAgeMonths: 60,
        entityFormationDate: '2021-04-01', // ~60 months ago, gap with EIN of 60 months is ~0 (<6 tolerance)
        einAddressCount: 6,
      });
      const codes = result.signals.map((s) => s.code);
      expect(codes).toContain('EIN_ADDRESS_CHURN');
    });

    it('caps aggregate score at 100 with many signals', async () => {
      const result = await detectFraud({
        dateOfBirth: '1970-01-01',
        creditFileAgeMonths: 6,
        tradelineCount: 1,
        highestCreditLimit: 50000,
        inquiriesLast6Mo: 15,
        einVerified: false,
        einAgeMonths: 1,
        entityFormationDate: '2010-01-01',
      });
      expect(result.riskScore).toBeLessThanOrEqual(100);
    });

    it('maps score >= 85 to critical disposition', async () => {
      const result = await detectFraud({
        dateOfBirth: '1970-01-01',
        creditFileAgeMonths: 6,
        tradelineCount: 1,
        highestCreditLimit: 50000,
        inquiriesLast6Mo: 15,
        einVerified: false,
      });
      if (result.riskScore >= 85) {
        expect(result.disposition).toBe('critical');
        expect(result.requiresManualReview).toBe(true);
      }
    });

    it('returns evaluatedAt timestamp', async () => {
      const before = new Date();
      const result = await detectFraud({});
      expect(result.evaluatedAt).toBeInstanceOf(Date);
      expect(result.evaluatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });
});

// ── KYB / KYC SERVICE TESTS ───────────────────────────────────────────────────

describe('kyb-kyc.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy-path Prisma stubs
    mockPrisma.business.findFirst.mockResolvedValue(makeMockBusiness());
    mockPrisma.business.update.mockResolvedValue(makeMockBusiness({ status: 'onboarding' }));
    mockPrisma.complianceCheck.create.mockResolvedValue({ id: 'cc-001' });
    mockPrisma.complianceCheck.findFirst.mockResolvedValue(null);
    mockPrisma.businessOwner.findMany.mockResolvedValue([]);
    mockPrisma.businessOwner.update.mockResolvedValue(makeMockOwner({ kycStatus: 'verified' }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ── verifyKyb ───────────────────────────────────────────────────────────────

  describe('verifyKyb()', () => {
    it('returns verified status for a clean business entity', async () => {
      const result = await verifyKyb('biz-001', 'tenant-001', makeKybRequest());

      expect(result.status).toBe('verified');
      expect(result.businessId).toBe('biz-001');
      expect(result.verifiedAt).toBeInstanceOf(Date);
      expect(result.sosResult.verified).toBe(true);
      expect(result.sanctionsResult.result).toBe('no_match');
    });

    it('publishes KYB_VERIFIED event on successful verification', async () => {
      await verifyKyb('biz-001', 'tenant-001', makeKybRequest());

      expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
        'tenant-001',
        expect.objectContaining({
          eventType: EVENT_TYPES.KYB_VERIFIED,
          aggregateId: 'biz-001',
        }),
      );
    });

    it('throws KybKycError(404) when business is not found', async () => {
      mockPrisma.business.findFirst.mockResolvedValue(null);

      await expect(
        verifyKyb('missing-biz', 'tenant-001', makeKybRequest()),
      ).rejects.toMatchObject({
        code: 'BUSINESS_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('returns sanctions_hold and does NOT publish event when business is an OFAC hard match', async () => {
      const result = await verifyKyb(
        'biz-001',
        'tenant-001',
        makeKybRequest({ legalName: 'Sanctioned Corp LLC' }),
      );

      expect(result.status).toBe('sanctions_hold');
      expect(result.sanctionsResult.result).toBe('match');
      expect(eventBus.publishAndPersist).not.toHaveBeenCalled();
    });

    it('returns failed when SoS verification fails (bad EIN prefix)', async () => {
      const result = await verifyKyb(
        'biz-001',
        'tenant-001',
        makeKybRequest({ ein: '00-1234567' }),
      );

      expect(result.status).toBe('failed');
      expect(result.sosResult.verified).toBe(false);
    });

    it('persists a ComplianceCheck record for every verification attempt', async () => {
      await verifyKyb('biz-001', 'tenant-001', makeKybRequest());
      expect(mockPrisma.complianceCheck.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.complianceCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ checkType: 'kyb' }),
        }),
      );
    });

    it('sets in_review status when business name produces possible_match', async () => {
      // "Blocked Entities International" produces a possible_match
      const result = await verifyKyb(
        'biz-001',
        'tenant-001',
        makeKybRequest({ legalName: 'Blocked Entities International' }),
      );

      // May be in_review or match — just ensure it's not blindly passing
      expect(['in_review', 'match', 'sanctions_hold']).toContain(result.status);
    });
  });

  // ── verifyKyc ───────────────────────────────────────────────────────────────

  describe('verifyKyc()', () => {
    beforeEach(() => {
      // KYB is verified by default in these tests
      mockPrisma.complianceCheck.findFirst.mockResolvedValue({
        id: 'cc-kyb',
        findings: { status: 'verified' },
        createdAt: new Date(),
      });

      // Business has one owner by default
      mockPrisma.business.findFirst.mockResolvedValue(
        makeMockBusiness({ owners: [makeMockOwner()] }),
      );
    });

    it('returns verified status for a clean owner', async () => {
      mockPrisma.businessOwner.findMany.mockResolvedValue([
        makeMockOwner({ kycStatus: 'verified', kycVerifiedAt: new Date() }),
      ]);

      const result = await verifyKyc(
        'biz-001',
        'owner-001',
        'tenant-001',
        makeKycRequest(),
      );

      expect(result.status).toBe('verified');
      expect(result.ownerId).toBe('owner-001');
      expect(result.verifiedAt).toBeInstanceOf(Date);
    });

    it('publishes KYC_VERIFIED when all beneficial owners are verified', async () => {
      mockPrisma.businessOwner.findMany.mockResolvedValue([
        makeMockOwner({ kycStatus: 'verified', kycVerifiedAt: new Date() }),
      ]);

      await verifyKyc('biz-001', 'owner-001', 'tenant-001', makeKycRequest());

      expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
        'tenant-001',
        expect.objectContaining({
          eventType: EVENT_TYPES.KYC_VERIFIED,
          aggregateId: 'biz-001',
        }),
      );
    });

    it('does NOT publish KYC_VERIFIED when some beneficial owners are still pending', async () => {
      mockPrisma.businessOwner.findMany.mockResolvedValue([
        makeMockOwner({ id: 'owner-001', kycStatus: 'verified' }),
        makeMockOwner({ id: 'owner-002', kycStatus: 'pending', ownershipPercent: { toString: () => '30' } }),
      ]);

      await verifyKyc('biz-001', 'owner-001', 'tenant-001', makeKycRequest());

      expect(eventBus.publishAndPersist).not.toHaveBeenCalledWith(
        'tenant-001',
        expect.objectContaining({ eventType: EVENT_TYPES.KYC_VERIFIED }),
      );
    });

    it('throws KybKycError(422) when KYB is not yet verified', async () => {
      mockPrisma.complianceCheck.findFirst.mockResolvedValue(null); // no KYB check on file

      await expect(
        verifyKyc('biz-001', 'owner-001', 'tenant-001', makeKycRequest()),
      ).rejects.toMatchObject({
        code: 'KYB_NOT_VERIFIED',
        statusCode: 422,
      });
    });

    it('throws KybKycError(404) when business is not found', async () => {
      mockPrisma.business.findFirst.mockResolvedValue(null);

      await expect(
        verifyKyc('missing-biz', 'owner-001', 'tenant-001', makeKycRequest()),
      ).rejects.toMatchObject({
        code: 'BUSINESS_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('throws KybKycError(404) when owner is not found on business', async () => {
      mockPrisma.business.findFirst.mockResolvedValue(
        makeMockBusiness({ owners: [] }), // no owners
      );

      await expect(
        verifyKyc('biz-001', 'owner-001', 'tenant-001', makeKycRequest()),
      ).rejects.toMatchObject({
        code: 'OWNER_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('returns sanctions_hold for OFAC hard match owner and does NOT publish KYC_VERIFIED', async () => {
      const result = await verifyKyc(
        'biz-001',
        'owner-001',
        'tenant-001',
        makeKycRequest({ firstName: 'John', lastName: 'Doe Sanctioned' }),
      );

      expect(result.status).toBe('sanctions_hold');
      expect(result.sanctionsResult.result).toBe('match');
      expect(eventBus.publishAndPersist).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: EVENT_TYPES.KYC_VERIFIED }),
      );
    });

    it('returns fraud_review when fraud detection flags critical risk', async () => {
      // Feed data that triggers multiple hard fraud signals
      const result = await verifyKyc(
        'biz-001',
        'owner-001',
        'tenant-001',
        makeKycRequest({
          dateOfBirth: '1970-01-01',
          creditData: {
            creditFileAgeMonths: 6,
            tradelineCount: 1,
            highestCreditLimit: 50000,
            inquiriesLast6Mo: 15,
          },
        }),
      );

      // Should be in_review or fraud_review — definitely not verified
      expect(['in_review', 'fraud_review']).toContain(result.status);
      expect(result.fraudResult.requiresManualReview).toBe(true);
    });

    it('persists a ComplianceCheck record with checkType kyc', async () => {
      mockPrisma.businessOwner.findMany.mockResolvedValue([
        makeMockOwner({ kycStatus: 'verified', kycVerifiedAt: new Date() }),
      ]);

      await verifyKyc('biz-001', 'owner-001', 'tenant-001', makeKycRequest());

      expect(mockPrisma.complianceCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ checkType: 'kyc' }),
        }),
      );
    });

    it('marks owner as beneficial owner when ownership >= 25%', async () => {
      mockPrisma.businessOwner.findMany.mockResolvedValue([
        makeMockOwner({ kycStatus: 'verified', kycVerifiedAt: new Date() }),
      ]);

      await verifyKyc(
        'biz-001',
        'owner-001',
        'tenant-001',
        makeKycRequest({ ownershipPercent: 30 }),
      );

      expect(mockPrisma.businessOwner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isBeneficialOwner: true }),
        }),
      );
    });

    it('marks owner as non-beneficial when ownership < 25%', async () => {
      mockPrisma.businessOwner.findMany.mockResolvedValue([]);

      await verifyKyc(
        'biz-001',
        'owner-001',
        'tenant-001',
        makeKycRequest({ ownershipPercent: 10 }),
      );

      expect(mockPrisma.businessOwner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isBeneficialOwner: false }),
        }),
      );
    });
  });

  // ── getVerificationStatus ───────────────────────────────────────────────────

  describe('getVerificationStatus()', () => {
    it('returns pending kybStatus when no compliance check exists', async () => {
      mockPrisma.complianceCheck.findFirst.mockResolvedValue(null);
      mockPrisma.business.findFirst.mockResolvedValue(makeMockBusiness({ owners: [] }));

      const result = await getVerificationStatus('biz-001', 'tenant-001');

      expect(result.kybStatus).toBe('pending');
      expect(result.readyForApplications).toBe(false);
      expect(result.kybVerifiedAt).toBeNull();
    });

    it('returns readyForApplications=false when KYB verified but KYC pending', async () => {
      mockPrisma.complianceCheck.findFirst.mockResolvedValue({
        id: 'cc-kyb',
        findings: { status: 'verified' },
        createdAt: new Date(),
      });
      mockPrisma.business.findFirst.mockResolvedValue(
        makeMockBusiness({
          owners: [makeMockOwner({ kycStatus: 'pending', isBeneficialOwner: true })],
        }),
      );

      const result = await getVerificationStatus('biz-001', 'tenant-001');

      expect(result.kybStatus).toBe('verified');
      expect(result.readyForApplications).toBe(false);
    });

    it('returns readyForApplications=true when KYB verified and all beneficial owners KYC verified', async () => {
      mockPrisma.complianceCheck.findFirst.mockResolvedValue({
        id: 'cc-kyb',
        findings: { status: 'verified' },
        createdAt: new Date(),
      });
      mockPrisma.business.findFirst.mockResolvedValue(
        makeMockBusiness({
          owners: [
            makeMockOwner({ kycStatus: 'verified', isBeneficialOwner: true }),
          ],
        }),
      );

      const result = await getVerificationStatus('biz-001', 'tenant-001');

      expect(result.kybStatus).toBe('verified');
      expect(result.readyForApplications).toBe(true);
    });

    it('returns readyForApplications=true when KYB verified and no beneficial owners (sole prop)', async () => {
      mockPrisma.complianceCheck.findFirst.mockResolvedValue({
        id: 'cc-kyb',
        findings: { status: 'verified' },
        createdAt: new Date(),
      });
      // Owner with < 25% ownership — not a beneficial owner
      mockPrisma.business.findFirst.mockResolvedValue(
        makeMockBusiness({
          owners: [
            makeMockOwner({
              kycStatus: 'pending',
              isBeneficialOwner: false,
              ownershipPercent: { toString: () => '10' },
            }),
          ],
        }),
      );

      const result = await getVerificationStatus('biz-001', 'tenant-001');

      expect(result.readyForApplications).toBe(true);
    });

    it('throws KybKycError(404) when business not found', async () => {
      mockPrisma.business.findFirst.mockResolvedValue(null);

      await expect(
        getVerificationStatus('missing-biz', 'tenant-001'),
      ).rejects.toMatchObject({
        code: 'BUSINESS_NOT_FOUND',
        statusCode: 404,
      });
    });

    it('returns owner details when includeOwners is true', async () => {
      mockPrisma.complianceCheck.findFirst.mockResolvedValue(null);
      mockPrisma.business.findFirst.mockResolvedValue(
        makeMockBusiness({
          owners: [makeMockOwner({ kycStatus: 'pending' })],
        }),
      );

      const result = await getVerificationStatus('biz-001', 'tenant-001', true);

      expect(result.owners).toBeDefined();
      expect(result.owners).toHaveLength(1);
      expect(result.owners?.[0].kycStatus).toBe('pending');
      expect(result.owners?.[0].fullName).toBe('Jane Smith');
    });
  });
});
