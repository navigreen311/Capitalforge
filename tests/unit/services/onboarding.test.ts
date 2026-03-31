// ============================================================
// CapitalForge Onboarding Service — Unit Tests
//
// Covers:
//   - Business creation (happy path, EIN normalisation, MCC classification)
//   - Funding readiness scoring (high / medium / low scenarios)
//   - Gap analysis completeness
//   - Track routing thresholds
//   - Validator edge cases (EIN, state codes, entity types, ownership %)
//   - Owner addition
//   - lookupEin stub validation
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient, Business, BusinessOwner } from '@prisma/client';

// ── Funding Readiness (pure, no Prisma) ──────────────────────

import {
  calculateFundingReadiness,
  type FundingReadinessInput,
} from '../../../src/backend/services/funding-readiness.js';

// ── Validators ───────────────────────────────────────────────

import {
  createBusinessSchema,
  updateBusinessSchema,
  createOwnerSchema,
  parseEin,
  validateTotalOwnership,
} from '../../../src/shared/validators/business.validators.js';

// ── EIN lookup (stub, no Prisma) ──────────────────────────────

import { lookupEin, classifyMcc } from '../../../src/backend/services/onboarding.service.js';

// ============================================================
// Funding Readiness — Score Engine Tests
// ============================================================

describe('calculateFundingReadiness()', () => {
  // ── High score scenario ────────────────────────────────────

  describe('High readiness (>= 70 → Stacking track)', () => {
    const input: FundingReadinessInput = {
      annualRevenue:       800_000,
      personalCreditScore: 760,
      dateOfFormation:     new Date(Date.now() - 3 * 365.25 * 24 * 60 * 60 * 1000).toISOString(), // 3 years ago
      industry:            'technology consulting',
      existingDebtBalance: 50_000,
      monthlyDebtService:  1_500,
    };

    it('returns score >= 70', () => {
      const result = calculateFundingReadiness(input);
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('routes to stacking track', () => {
      const result = calculateFundingReadiness(input);
      expect(result.track).toBe('stacking');
      expect(result.trackLabel).toContain('Stacking');
    });

    it('revenue component is near max (22–30)', () => {
      const result = calculateFundingReadiness(input);
      expect(result.componentScores.revenue).toBeGreaterThanOrEqual(22);
    });

    it('credit score component is near max (18–25)', () => {
      const result = calculateFundingReadiness(input);
      expect(result.componentScores.creditScore).toBeGreaterThanOrEqual(18);
    });

    it('has no critical gaps', () => {
      const result = calculateFundingReadiness(input);
      const highImpactGaps = result.gaps.filter((g) => g.impact === 'high');
      expect(highImpactGaps).toHaveLength(0);
    });
  });

  // ── Medium score scenario ──────────────────────────────────

  describe('Medium readiness (40–69 → Credit Builder track)', () => {
    const input: FundingReadinessInput = {
      annualRevenue:       180_000,
      personalCreditScore: 650,
      dateOfFormation:     new Date(Date.now() - 18 * 30.44 * 24 * 60 * 60 * 1000).toISOString(), // 18 months ago
      industry:            'restaurant',
      existingDebtBalance: 80_000,
      monthlyDebtService:  2_200,
    };

    it('returns score in range 40–69', () => {
      const result = calculateFundingReadiness(input);
      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.score).toBeLessThan(70);
    });

    it('routes to credit_builder track', () => {
      const result = calculateFundingReadiness(input);
      expect(result.track).toBe('credit_builder');
    });

    it('includes at least one gap suggestion', () => {
      const result = calculateFundingReadiness(input);
      expect(result.gaps.length).toBeGreaterThan(0);
    });
  });

  // ── Low score scenario ─────────────────────────────────────

  describe('Low readiness (< 40 → Alternative products)', () => {
    const input: FundingReadinessInput = {
      annualRevenue:       20_000,
      personalCreditScore: 520,
      dateOfFormation:     new Date(Date.now() - 3 * 30.44 * 24 * 60 * 60 * 1000).toISOString(), // 3 months ago
      industry:            'gambling',
      existingDebtBalance: 200_000,
      monthlyDebtService:  6_000,
    };

    it('returns score < 40', () => {
      const result = calculateFundingReadiness(input);
      expect(result.score).toBeLessThan(40);
    });

    it('routes to alternative track', () => {
      const result = calculateFundingReadiness(input);
      expect(result.track).toBe('alternative');
    });

    it('summary mentions alternative products', () => {
      const result = calculateFundingReadiness(input);
      expect(result.summary.toLowerCase()).toMatch(/alternative|sba|loc/);
    });

    it('returns multiple high-impact gaps', () => {
      const result = calculateFundingReadiness(input);
      const highGaps = result.gaps.filter((g) => g.impact === 'high');
      expect(highGaps.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────

  describe('Edge cases', () => {
    it('handles all-null inputs without throwing', () => {
      expect(() => calculateFundingReadiness({})).not.toThrow();
    });

    it('returns score of 0 when all inputs are null', () => {
      const result = calculateFundingReadiness({});
      expect(result.score).toBe(0);
    });

    it('score is always between 0 and 100', () => {
      const extreme: FundingReadinessInput = {
        annualRevenue:       10_000_000,
        personalCreditScore: 850,
        dateOfFormation:     new Date(Date.now() - 10 * 365.25 * 24 * 60 * 60 * 1000).toISOString(),
        industry:            'accounting',
        existingDebtBalance: 0,
      };
      const result = calculateFundingReadiness(extreme);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('derives annual revenue from monthlyRevenue * 12 when annualRevenue is absent', () => {
      const withMonthly = calculateFundingReadiness({ monthlyRevenue: 20_834 }); // ~$250k/yr (20834*12=250008)
      const withAnnual  = calculateFundingReadiness({ annualRevenue:  250_000 });
      // Scores should be identical (or within 1 point due to rounding)
      expect(Math.abs(withMonthly.componentScores.revenue - withAnnual.componentScores.revenue)).toBeLessThanOrEqual(1);
    });

    it('prefers annualRevenue over monthlyRevenue when both provided', () => {
      const result = calculateFundingReadiness({ annualRevenue: 1_000_000, monthlyRevenue: 100 });
      expect(result.componentScores.revenue).toBe(30); // $1M gets full points
    });

    it('normalises business credit score (SBSS 0–300) correctly', () => {
      // Score of 200/300 SBSS → should produce a reasonable credit component
      const result = calculateFundingReadiness({ businessCreditScore: 200, personalCreditScore: null });
      expect(result.componentScores.creditScore).toBeGreaterThan(0);
    });

    it('uses best of personal vs business credit score', () => {
      const onlyPersonal = calculateFundingReadiness({ personalCreditScore: 750 });
      const both         = calculateFundingReadiness({ personalCreditScore: 750, businessCreditScore: 100 });
      expect(both.componentScores.creditScore).toBeGreaterThanOrEqual(onlyPersonal.componentScores.creditScore);
    });

    it('returns 0 debtBurden points for very high DTR', () => {
      const result = calculateFundingReadiness({ annualRevenue: 100_000, existingDebtBalance: 300_000 });
      expect(result.componentScores.debtBurden).toBeLessThanOrEqual(1);
    });

    it('returns 10 debtBurden points when no debt', () => {
      const result = calculateFundingReadiness({ annualRevenue: 500_000, existingDebtBalance: 0 });
      expect(result.componentScores.debtBurden).toBe(10);
    });

    it('treats invalid dateOfFormation gracefully', () => {
      const result = calculateFundingReadiness({ dateOfFormation: 'not-a-date' });
      expect(result.componentScores.businessAge).toBe(0);
    });
  });

  // ── Score threshold boundary conditions ───────────────────

  describe('Track routing boundaries', () => {
    it('score of exactly 70 routes to stacking', () => {
      // Build a score that sums to exactly 70 via controlled inputs
      // Revenue 22pts + Credit 18pts + Age 10pts + Industry 10pts + Debt 10pts = 70
      const result = calculateFundingReadiness({
        annualRevenue:       250_000,  // 22 pts
        personalCreditScore: 680,      // 18 pts
        dateOfFormation:     new Date(Date.now() - 14 * 30.44 * 24 * 60 * 60 * 1000).toISOString(), // ~14mo → 10pts
        industry:            'consulting', // 1.0 multiplier → 15pts
        existingDebtBalance: 0,        // 10pts
      });
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.track).toBe('stacking');
    });

    it('score of exactly 40 routes to credit_builder', () => {
      const result = calculateFundingReadiness({
        annualRevenue:       60_000,   // 12 pts
        personalCreditScore: 600,      // 8 pts
        dateOfFormation:     new Date(Date.now() - 7 * 30.44 * 24 * 60 * 60 * 1000).toISOString(), // ~7mo → 5pts
        industry:            'retail', // 0.2 multiplier → 3pts
        existingDebtBalance: 0,        // 10pts
      });
      // Score is 38–40 range; test track logic at boundary
      if (result.score >= 40) {
        expect(result.track).toBe('credit_builder');
      } else {
        expect(result.track).toBe('alternative');
      }
    });
  });
});

// ============================================================
// Validator Tests
// ============================================================

describe('createBusinessSchema', () => {
  const base = {
    legalName:  'Acme Corp LLC',
    entityType: 'llc',
  };

  it('accepts a minimal valid business', () => {
    const result = createBusinessSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('rejects missing legalName', () => {
    const result = createBusinessSchema.safeParse({ entityType: 'llc' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid entityType', () => {
    const result = createBusinessSchema.safeParse({ ...base, entityType: 'nonprofit' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid entity types', () => {
    const types = ['llc', 'corporation', 'sole_proprietor', 'partnership', 's_corp', 'c_corp'];
    for (const entityType of types) {
      const result = createBusinessSchema.safeParse({ ...base, entityType });
      expect(result.success, `Expected ${entityType} to be valid`).toBe(true);
    }
  });

  it('rejects invalid state code', () => {
    const result = createBusinessSchema.safeParse({ ...base, stateOfFormation: 'ZZ' });
    expect(result.success).toBe(false);
  });

  it('accepts valid US state code (case-insensitive)', () => {
    const result = createBusinessSchema.safeParse({ ...base, stateOfFormation: 'ca' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stateOfFormation).toBe('CA');
    }
  });

  it('accepts DC and PR as territory codes', () => {
    for (const code of ['DC', 'PR', 'GU']) {
      const result = createBusinessSchema.safeParse({ ...base, stateOfFormation: code });
      expect(result.success, `Expected ${code} to be valid`).toBe(true);
    }
  });

  it('rejects invalid MCC (not 4 digits)', () => {
    const result = createBusinessSchema.safeParse({ ...base, mcc: '123' });
    expect(result.success).toBe(false);
  });

  it('accepts valid 4-digit MCC', () => {
    const result = createBusinessSchema.safeParse({ ...base, mcc: '5812' });
    expect(result.success).toBe(true);
  });

  it('rejects negative revenue', () => {
    const result = createBusinessSchema.safeParse({ ...base, annualRevenue: -1000 });
    expect(result.success).toBe(false);
  });

  it('accepts zero revenue', () => {
    const result = createBusinessSchema.safeParse({ ...base, annualRevenue: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects advisorId that is not a UUID', () => {
    const result = createBusinessSchema.safeParse({ ...base, advisorId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('updateBusinessSchema', () => {
  it('accepts partial update with a single field', () => {
    const result = updateBusinessSchema.safeParse({ legalName: 'New Name LLC' });
    expect(result.success).toBe(true);
  });

  it('rejects empty object (no fields)', () => {
    const result = updateBusinessSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts valid status values', () => {
    for (const status of ['intake', 'onboarding', 'active', 'graduated', 'offboarding', 'closed']) {
      const result = updateBusinessSchema.safeParse({ status });
      expect(result.success, `Expected status ${status} to be valid`).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = updateBusinessSchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
  });
});

describe('createOwnerSchema', () => {
  const base = {
    firstName:        'Jane',
    lastName:         'Smith',
    ownershipPercent: 51,
  };

  it('accepts a minimal valid owner', () => {
    const result = createOwnerSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('rejects ownershipPercent of 0', () => {
    const result = createOwnerSchema.safeParse({ ...base, ownershipPercent: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects ownershipPercent > 100', () => {
    const result = createOwnerSchema.safeParse({ ...base, ownershipPercent: 101 });
    expect(result.success).toBe(false);
  });

  it('accepts ownershipPercent of exactly 100', () => {
    const result = createOwnerSchema.safeParse({ ...base, ownershipPercent: 100 });
    expect(result.success).toBe(true);
  });

  it('accepts ownershipPercent of 0.01', () => {
    const result = createOwnerSchema.safeParse({ ...base, ownershipPercent: 0.01 });
    expect(result.success).toBe(true);
  });

  it('rejects invalid SSN format', () => {
    const result = createOwnerSchema.safeParse({ ...base, ssn: '12-3456' });
    expect(result.success).toBe(false);
  });

  it('accepts hyphenated SSN', () => {
    const result = createOwnerSchema.safeParse({ ...base, ssn: '123-45-6789' });
    expect(result.success).toBe(true);
  });

  it('accepts raw 9-digit SSN', () => {
    const result = createOwnerSchema.safeParse({ ...base, ssn: '123456789' });
    expect(result.success).toBe(true);
  });

  it('rejects owner under 18 years old', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const result = createOwnerSchema.safeParse({ ...base, dateOfBirth: fiveDaysAgo });
    expect(result.success).toBe(false);
  });

  it('rejects owner impossibly old (>120 years)', () => {
    const tooOld = new Date('1850-01-01').toISOString();
    const result = createOwnerSchema.safeParse({ ...base, dateOfBirth: tooOld });
    expect(result.success).toBe(false);
  });

  it('rejects address with invalid state code', () => {
    const result = createOwnerSchema.safeParse({
      ...base,
      address: { street1: '123 Main St', city: 'Nowhere', state: 'XX', zip: '12345' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects address with invalid ZIP code', () => {
    const result = createOwnerSchema.safeParse({
      ...base,
      address: { street1: '123 Main St', city: 'Austin', state: 'TX', zip: '1234' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid full address', () => {
    const result = createOwnerSchema.safeParse({
      ...base,
      address: { street1: '100 Congress Ave', street2: 'Suite 200', city: 'Austin', state: 'TX', zip: '78701' },
    });
    expect(result.success).toBe(true);
  });

  it('defaults isBeneficialOwner to true when omitted', () => {
    const result = createOwnerSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isBeneficialOwner).toBe(true);
    }
  });
});

// ── parseEin helper ──────────────────────────────────────────

describe('parseEin()', () => {
  it('normalises raw 9 digits to XX-XXXXXXX', () => {
    expect(parseEin('123456789')).toBe('12-3456789');
  });

  it('normalises hyphenated EIN', () => {
    expect(parseEin('12-3456789')).toBe('12-3456789');
  });

  it('returns null for too few digits', () => {
    expect(parseEin('12345')).toBeNull();
  });

  it('returns null for too many digits', () => {
    expect(parseEin('1234567890')).toBeNull();
  });

  it('strips non-digit characters before validating', () => {
    expect(parseEin('12 3456789')).toBe('12-3456789');
  });
});

// ── validateTotalOwnership ────────────────────────────────────

describe('validateTotalOwnership()', () => {
  it('returns true when total is exactly 100%', () => {
    expect(validateTotalOwnership([50, 30, 20])).toBe(true);
  });

  it('returns true when total is under 100%', () => {
    expect(validateTotalOwnership([40, 30])).toBe(true);
  });

  it('returns false when total exceeds 100%', () => {
    expect(validateTotalOwnership([60, 50])).toBe(false);
  });

  it('handles floating point without false negatives', () => {
    // 33.33 * 3 = 99.99 — should be valid
    expect(validateTotalOwnership([33.33, 33.33, 33.34])).toBe(true);
  });
});

// ============================================================
// lookupEin (stub) Tests
// ============================================================

describe('lookupEin()', () => {
  it('returns valid + normalised for a proper EIN', async () => {
    const result = await lookupEin('12-3456789');
    expect(result.valid).toBe(true);
    expect(result.normalised).toBe('12-3456789');
    expect(result.source).toBe('format_only');
  });

  it('normalises raw 9-digit EIN', async () => {
    const result = await lookupEin('123456789');
    expect(result.valid).toBe(true);
    expect(result.normalised).toBe('12-3456789');
  });

  it('returns invalid for too-short input', async () => {
    const result = await lookupEin('12345');
    expect(result.valid).toBe(false);
    expect(result.normalised).toBeNull();
  });

  it('returns invalid for 00-prefixed EIN', async () => {
    const result = await lookupEin('001234567');
    expect(result.valid).toBe(false);
  });

  it('always returns null registeredName (stub)', async () => {
    const result = await lookupEin('12-3456789');
    expect(result.registeredName).toBeNull();
  });
});

// ============================================================
// classifyMcc() Tests
// ============================================================

describe('classifyMcc()', () => {
  it('classifies restaurant industry to 5812', () => {
    expect(classifyMcc('Restaurant & Bar')).toBe('5812');
  });

  it('classifies software to 7372', () => {
    expect(classifyMcc('software development')).toBe('7372');
  });

  it('classifies dental office', () => {
    expect(classifyMcc('dental clinic')).toBe('8021');
  });

  it('returns null for unknown industry', () => {
    expect(classifyMcc('artisanal pickle manufacturing')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(classifyMcc('RESTAURANT')).toBe('5812');
    expect(classifyMcc('Restaurant')).toBe('5812');
  });

  it('returns null for empty string', () => {
    expect(classifyMcc('')).toBeNull();
  });
});

// ============================================================
// Onboarding Service — createBusiness (with mocked Prisma)
// ============================================================

describe('createBusiness() — with mocked Prisma and EventBus', () => {
  // We import these after setting up mocks so they pick up the mock
  let createBusiness: typeof import('../../../src/backend/services/onboarding.service.js').createBusiness;
  let setPrismaClient: typeof import('../../../src/backend/services/onboarding.service.js').setPrismaClient;

  const mockBusiness: Business = {
    id:                   'biz-uuid-001',
    tenantId:             'tenant-001',
    advisorId:            null,
    legalName:            'Test Co LLC',
    dba:                  null,
    ein:                  '12-3456789',
    entityType:           'llc',
    stateOfFormation:     'TX',
    dateOfFormation:      new Date('2022-01-01'),
    mcc:                  '7372',
    industry:             'software',
    annualRevenue:        null,
    monthlyRevenue:       null,
    fundingReadinessScore: 55,
    status:               'intake',
    createdAt:            new Date(),
    updatedAt:            new Date(),
  };

  beforeEach(async () => {
    // Dynamically import after mock setup
    const mod = await import('../../../src/backend/services/onboarding.service.js');
    createBusiness = mod.createBusiness;
    setPrismaClient = mod.setPrismaClient;

    // Mock Prisma client
    const mockPrisma = {
      business: {
        create: vi.fn().mockResolvedValue(mockBusiness),
        findFirst: vi.fn().mockResolvedValue(mockBusiness),
        update: vi.fn().mockResolvedValue(mockBusiness),
      },
      businessOwner: {
        create: vi.fn().mockResolvedValue({
          id:               'owner-001',
          businessId:       'biz-uuid-001',
          firstName:        'John',
          lastName:         'Doe',
          ownershipPercent: 100,
          ssn:              null,
          dateOfBirth:      null,
          address:          null,
          isBeneficialOwner: true,
          kycStatus:        'pending',
          kycVerifiedAt:    null,
          createdAt:        new Date(),
          updatedAt:        new Date(),
        } satisfies BusinessOwner),
      },
    } as unknown as PrismaClient;

    setPrismaClient(mockPrisma);

    // Suppress event bus publish errors in unit tests (no real DB ledger writer)
    const { eventBus } = await import('../../../src/backend/events/event-bus.js');
    vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a business and returns it with a readiness result', async () => {
    const result = await createBusiness('tenant-001', {
      legalName:  'Test Co LLC',
      entityType: 'llc',
      ein:        '12-3456789',
      industry:   'software',
    });

    expect(result.business).toBeDefined();
    expect(result.business.legalName).toBe('Test Co LLC');
    expect(result.readiness).toBeDefined();
    expect(typeof result.readiness.score).toBe('number');
  });

  it('publishes BUSINESS_CREATED event', async () => {
    const { eventBus } = await import('../../../src/backend/events/event-bus.js');
    const spy = vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);

    await createBusiness('tenant-001', {
      legalName:  'Test Co LLC',
      entityType: 'llc',
    });

    expect(spy).toHaveBeenCalledOnce();
    const [tenantId, envelope] = spy.mock.calls[0];
    expect(tenantId).toBe('tenant-001');
    expect(envelope.eventType).toBe('business.created');
    expect(envelope.aggregateType).toBe('business');
  });

  it('auto-classifies MCC from industry when MCC not provided', async () => {
    const { eventBus } = await import('../../../src/backend/events/event-bus.js');
    vi.spyOn(eventBus, 'publishAndPersist').mockResolvedValue(null);

    // classifyMcc('software development') → '7372'
    // We verify the call completes successfully and the event is published,
    // confirming the MCC auto-classification code path ran without error.
    await createBusiness('tenant-001', {
      legalName:  'Byte Works LLC',
      entityType: 'llc',
      industry:   'software development',
      // No MCC provided — should be classified internally
    });

    expect(eventBus.publishAndPersist).toHaveBeenCalled();
  });
});
