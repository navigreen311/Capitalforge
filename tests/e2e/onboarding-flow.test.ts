// ============================================================
// CapitalForge — E2E: Onboarding Flow
//
// Covers the full business intake pipeline:
//   create business → add owners → KYB verification →
//   KYC verification → funding readiness score → track routing
//
// All Prisma calls are mocked via makePrismaMockFor().
// All service-to-service calls are tested through real service
// logic with injected mocks — no HTTP layer.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  createFullTestBusiness,
  cleanupTestBusiness,
  createEventBusSpy,
  buildCallerContext,
  type TestBusinessGraph,
} from './helpers/test-setup.js';

// ── Top-level module mocks (must be at top level for Vitest hoisting) ─────────
vi.mock('../../src/backend/services/sanctions-screening.js', () => ({
  screenSanctions: vi.fn().mockResolvedValue({
    result: 'no_match',
    confidenceScore: 0.0,
    reason: 'No watchlist matches found.',
    requiresManualReview: false,
    matchedEntries: [],
    screenedAt: new Date(),
  }),
  isHardOFACStop: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/backend/services/fraud-detection.js', () => ({
  detectFraud: vi.fn().mockResolvedValue({
    riskScore:            10,
    disposition:          'clear',
    signals:              [],
    requiresManualReview: false,
    summary:              'No fraud signals detected.',
    evaluatedAt:          new Date(),
  }),
}));

// ── Service imports ───────────────────────────────────────────
import {
  OnboardingService,
  setPrismaClient as setOnboardingPrisma,
} from '../../src/backend/services/onboarding.service.js';
import {
  KybKycService,
  setPrismaClient as setKybPrisma,
} from '../../src/backend/services/kyb-kyc.service.js';
import { screenSanctions, isHardOFACStop } from '../../src/backend/services/sanctions-screening.js';
import { detectFraud } from '../../src/backend/services/fraud-detection.js';
import {
  calculateFundingReadiness,
} from '../../src/backend/services/funding-readiness.js';
import { eventBus } from '../../src/backend/events/event-bus.js';

// ── Test suite ─────────────────────────────────────────────────

describe('E2E: Onboarding Flow', () => {
  let graph: TestBusinessGraph;

  beforeEach(() => {
    graph = createFullTestBusiness({
      tenantIdSuffix: 'onboard',
      kybVerified: false,
      kycVerified: false,
    });
    setOnboardingPrisma(graph.prisma);
    setKybPrisma(graph.prisma);

    // Re-apply mock implementations after vi.restoreAllMocks() clears them
    vi.mocked(screenSanctions).mockResolvedValue({
      result: 'no_match',
      confidenceScore: 0.0,
      reason: 'No watchlist matches found.',
      requiresManualReview: false,
      matchedEntries: [],
      screenedAt: new Date(),
    });
    vi.mocked(isHardOFACStop).mockReturnValue(false);
    vi.mocked(detectFraud).mockResolvedValue({
      riskScore: 10,
      disposition: 'clear',
      signals: [],
      requiresManualReview: false,
      summary: 'No fraud signals detected.',
      evaluatedAt: new Date(),
    });
  });

  afterEach(() => {
    cleanupTestBusiness(graph);
    vi.restoreAllMocks();
  });

  // ── Test 1: Business creation persists record ─────────────────

  it('creates a business record and emits BUSINESS_CREATED event', async () => {
    const spy = createEventBusSpy(eventBus);

    graph.prisma.business.create = vi.fn().mockResolvedValue({
      ...graph.business,
      status: 'intake',
    });

    const svc = new OnboardingService(graph.prisma);
    const result = await svc.createBusiness({
      tenantId:         graph.tenant.id,
      advisorId:        graph.advisorUser.id,
      legalName:        'Acme Corp LLC',
      ein:              '12-3456789',
      entityType:       'llc',
      stateOfFormation: 'DE',
      industry:         'technology consulting',
      annualRevenue:    480_000,
      monthlyRevenue:   40_000,
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('intake');
    expect(graph.prisma.business.create).toHaveBeenCalledOnce();
    spy.assertEventFired('business.created');
    spy.restore();
  });

  // ── Test 2: Business creation sets MCC from industry ─────────

  it('derives MCC from industry label during creation', async () => {
    const svc = new OnboardingService(graph.prisma);

    graph.prisma.business.create = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({ ...graph.business, mcc: data.mcc, status: 'intake' }),
    );

    const result = await svc.createBusiness({
      tenantId:         graph.tenant.id,
      advisorId:        graph.advisorUser.id,
      legalName:        'Tech Forge LLC',
      ein:              '98-7654321',
      entityType:       'llc',
      stateOfFormation: 'DE',
      industry:         'software',
      annualRevenue:    600_000,
    });

    expect(result.mcc).toMatch(/^\d{4}$/);
  });

  // ── Test 3: Adding a beneficial owner ─────────────────────────

  it('adds a beneficial owner and emits OWNER_ADDED event', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new OnboardingService(graph.prisma);

    graph.prisma.businessOwner.create = vi.fn().mockResolvedValue(graph.owner);

    const result = await svc.addOwner({
      businessId:       graph.business.id,
      tenantId:         graph.tenant.id,
      firstName:        'Jane',
      lastName:         'Doe',
      dateOfBirth:      '1985-06-15',
      ssn:              '123-45-6789',
      ownershipPercent: 100,
      isBeneficialOwner: true,
    });

    expect(result).toBeDefined();
    expect(result.isBeneficialOwner).toBe(true);
    expect(graph.prisma.businessOwner.create).toHaveBeenCalledOnce();
    spy.assertEventFired('owner.added');
    spy.restore();
  });

  // ── Test 4: KYB verification succeeds and transitions status ──

  it('performs KYB and transitions business to active when verified', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new KybKycService(graph.prisma);

    graph.prisma.business.update = vi.fn().mockResolvedValue({
      ...graph.business,
      status: 'onboarding',
    });
    graph.prisma.complianceCheck.create = vi.fn().mockResolvedValue({
      id:        `kyb-check-${graph.business.id}`,
      businessId: graph.business.id,
      checkType: 'kyb',
      riskScore: 10,
      riskLevel: 'low',
      findings:  { status: 'verified', summary: 'KYB VERIFIED' },
      createdAt: new Date(),
    });

    const result = await svc.verifyKyb({
      businessId:       graph.business.id,
      tenantId:         graph.tenant.id,
      legalName:        graph.business.legalName,
      ein:              graph.business.ein,
      entityType:       graph.business.entityType,
      stateOfFormation: graph.business.stateOfFormation,
    });

    expect(result.status).toBe('verified');
    expect(result.riskLevel).toBe('low');
    expect(graph.prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: graph.business.id },
      }),
    );
    spy.assertEventFired('kyb.verified');
    spy.restore();
  });

  // ── Test 5: KYB fails when OFAC match detected ─────────────────

  it('halts onboarding with a hard stop on OFAC sanctions match', async () => {
    const svc = new KybKycService(graph.prisma);

    // Override the top-level mock to simulate an OFAC match for this test
    vi.mocked(screenSanctions).mockResolvedValueOnce({
      result: 'match' as const,
      confidenceScore: 0.97,
      reason: 'Hard OFAC match: Rogue Corp',
      requiresManualReview: false,
      matchedEntries: ['Rogue Corp'],
      screenedAt: new Date(),
    });
    vi.mocked(isHardOFACStop).mockReturnValueOnce(true);

    await expect(
      svc.verifyKyb({
        businessId:       graph.business.id,
        tenantId:         graph.tenant.id,
        legalName:        'Rogue Corp',
        ein:              '00-0000000',
        entityType:       'llc',
        stateOfFormation: 'DE',
      }),
    ).rejects.toThrow(/OFAC|sanctions/i);
  });

  // ── Test 6: KYC verification succeeds for a beneficial owner ──

  it('verifies a beneficial owner via KYC and emits KYC_VERIFIED', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new KybKycService(graph.prisma);

    // Override complianceCheck.findFirst to return a verified KYB check
    // (the default mock has kybVerified: false for this test suite)
    graph.prisma.complianceCheck.findFirst = vi.fn().mockResolvedValue({
      id: `kyb-check-${graph.business.id}`,
      businessId: graph.business.id,
      checkType: 'kyb',
      riskScore: 10,
      riskLevel: 'low',
      findings:  { status: 'verified', summary: 'KYB VERIFIED' },
      createdAt: new Date(),
    });
    graph.prisma.businessOwner.update = vi.fn().mockResolvedValue({
      ...graph.owner,
      kycStatus:     'verified',
      kycVerifiedAt: new Date(),
    });
    graph.prisma.businessOwner.findMany = vi.fn().mockResolvedValue([{
      ...graph.owner,
      kycStatus:     'verified',
      kycVerifiedAt: new Date(),
    }]);
    graph.prisma.complianceCheck.create = vi.fn().mockResolvedValue({
      id:         `kyc-check-${graph.owner.id}`,
      businessId: graph.business.id,
      checkType:  'kyc',
      riskScore:  8,
      riskLevel:  'low',
      findings:   { status: 'verified', summary: 'KYC VERIFIED' },
      createdAt:  new Date(),
    });

    const result = await svc.verifyKyc({
      ownerId:    graph.owner.id,
      businessId: graph.business.id,
      tenantId:   graph.tenant.id,
      firstName:  graph.owner.firstName,
      lastName:   graph.owner.lastName,
      ssn:        '123-45-6789',
      dateOfBirth: '1985-06-15',
    });

    expect(result.status).toBe('verified');
    spy.assertEventFired('kyc.verified');
    spy.restore();
  });

  // ── Test 7: KYC fails on synthetic-identity suspicion ─────────

  it('routes to manual review when synthetic identity risk is high', async () => {
    const svc = new KybKycService(graph.prisma);

    // Override complianceCheck.findFirst to return a verified KYB check
    graph.prisma.complianceCheck.findFirst = vi.fn().mockResolvedValue({
      id: `kyb-check-${graph.business.id}`,
      businessId: graph.business.id,
      checkType: 'kyb',
      riskScore: 10,
      riskLevel: 'low',
      findings:  { status: 'verified', summary: 'KYB VERIFIED' },
      createdAt: new Date(),
    });

    // Override fraud detection mock for this test to simulate high-risk fraud
    vi.mocked(detectFraud).mockResolvedValueOnce({
      riskScore:            85,
      disposition:          'review_required' as const,
      signals:              [{ type: 'synthetic_identity', score: 85, description: 'Synthetic identity' }],
      requiresManualReview: true,
      summary:              'High-risk synthetic identity detected.',
      evaluatedAt:          new Date(),
    });

    const result = await svc.verifyKyc({
      ownerId:     graph.owner.id,
      businessId:  graph.business.id,
      tenantId:    graph.tenant.id,
      firstName:   'John',
      lastName:    'Doe',
      ssn:         '999-99-9999',
      dateOfBirth: '1900-01-01',
    });

    expect(['in_review', 'fraud_review', 'manual_review', 'pending']).toContain(result.status);
  });

  // ── Test 8: Funding readiness score calculates all components ─

  it('computes a composite funding readiness score with all components', () => {
    const result = calculateFundingReadiness({
      annualRevenue:       480_000,
      personalCreditScore: 720,
      dateOfFormation:     new Date(Date.now() - 3 * 365.25 * 24 * 60 * 60 * 1000).toISOString(),
      mcc:                 '7372',
      existingDebtBalance: 20_000,
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.componentScores.revenue).toBeGreaterThanOrEqual(0);
    expect(result.componentScores.creditScore).toBeGreaterThanOrEqual(0);
    expect(result.componentScores.businessAge).toBeGreaterThanOrEqual(0);
    expect(result.componentScores.industryRisk).toBeGreaterThanOrEqual(0);
    expect(result.componentScores.debtBurden).toBeGreaterThanOrEqual(0);
  });

  // ── Test 9: Score >= 70 routes to stacking track ──────────────

  it('routes business with score >= 70 to the stacking track', () => {
    const result = calculateFundingReadiness({
      annualRevenue:       960_000,
      personalCreditScore: 780,
      dateOfFormation:     new Date(Date.now() - 5 * 365.25 * 24 * 60 * 60 * 1000).toISOString(),
      mcc:                 '7372',
      existingDebtBalance: 5_000,
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.track).toBe('stacking');
  });

  // ── Test 10: Score 40-69 routes to credit builder track ───────

  it('routes business with score 40–69 to the credit_builder track', () => {
    const result = calculateFundingReadiness({
      annualRevenue:       120_000,
      personalCreditScore: 640,
      dateOfFormation:     new Date(Date.now() - 1.2 * 365.25 * 24 * 60 * 60 * 1000).toISOString(),
      mcc:                 '5812',
      existingDebtBalance: 60_000,
    });

    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(70);
    expect(result.track).toBe('credit_builder');
  });

  // ── Test 11: Score < 40 routes to alternative track ───────────

  it('routes business with score < 40 to the alternative products track', () => {
    const result = calculateFundingReadiness({
      annualRevenue:       36_000,
      personalCreditScore: 550,
      dateOfFormation:     new Date(Date.now() - 0.5 * 365.25 * 24 * 60 * 60 * 1000).toISOString(),
      mcc:                 '5999',
      existingDebtBalance: 200_000,
    });

    expect(result.score).toBeLessThan(40);
    expect(result.track).toBe('alternative');
  });

  // ── Test 12: Full onboarding flow integration ─────────────────

  it('completes full intake → KYB → KYC → score → track pipeline end-to-end', async () => {
    const spy = createEventBusSpy(eventBus);
    const ctx = buildCallerContext(graph);

    // Step 1: Create business
    const onboardingSvc = new OnboardingService(graph.prisma);
    graph.prisma.business.create = vi.fn().mockResolvedValue({
      ...graph.business,
      status: 'intake',
    });
    const business = await onboardingSvc.createBusiness({
      tenantId:         graph.tenant.id,
      advisorId:        ctx.userId,
      legalName:        graph.business.legalName,
      ein:              graph.business.ein,
      entityType:       graph.business.entityType,
      stateOfFormation: graph.business.stateOfFormation,
      industry:         graph.business.industry,
      annualRevenue:    Number(graph.business.annualRevenue),
    });
    expect(business).toBeDefined();

    // Step 2: Add owner
    graph.prisma.businessOwner.create = vi.fn().mockResolvedValue(graph.owner);
    const owner = await onboardingSvc.addOwner({
      businessId:        business.id,
      tenantId:          graph.tenant.id,
      firstName:         graph.owner.firstName,
      lastName:          graph.owner.lastName,
      dateOfBirth:       '1985-06-15',
      ssn:               '123-45-6789',
      ownershipPercent:  100,
      isBeneficialOwner: true,
    });
    expect(owner).toBeDefined();

    // Step 3: KYB
    const kybSvc = new KybKycService(graph.prisma);
    graph.prisma.complianceCheck.create = vi.fn().mockResolvedValue({
      id: 'kyb-check', businessId: business.id, checkType: 'kyb',
      riskScore: 10, riskLevel: 'low',
      findings: { status: 'verified', summary: 'KYB VERIFIED' }, createdAt: new Date(),
    });
    graph.prisma.business.update = vi.fn().mockResolvedValue({ ...business, status: 'active' });

    const kyb = await kybSvc.verifyKyb({
      businessId: business.id, tenantId: graph.tenant.id,
      legalName: business.legalName, ein: business.ein,
      entityType: business.entityType, stateOfFormation: business.stateOfFormation,
    });
    expect(kyb.status).toBe('verified');

    // After KYB succeeds, override findFirst so verifyKyc sees a verified KYB check
    graph.prisma.complianceCheck.findFirst = vi.fn().mockResolvedValue({
      id: 'kyb-check', businessId: business.id, checkType: 'kyb',
      riskScore: 10, riskLevel: 'low',
      findings: { status: 'verified', summary: 'KYB VERIFIED' }, createdAt: new Date(),
    });

    // Step 4: KYC
    graph.prisma.businessOwner.update = vi.fn().mockResolvedValue({
      ...owner, kycStatus: 'verified', kycVerifiedAt: new Date(),
    });
    graph.prisma.complianceCheck.create = vi.fn().mockResolvedValue({
      id: 'kyc-check', businessId: business.id, checkType: 'kyc',
      riskScore: 8, riskLevel: 'low',
      findings: { status: 'verified', summary: 'KYC VERIFIED' }, createdAt: new Date(),
    });

    const kyc = await kybSvc.verifyKyc({
      ownerId: owner.id, businessId: business.id, tenantId: graph.tenant.id,
      firstName: owner.firstName, lastName: owner.lastName,
      ssn: '123-45-6789', dateOfBirth: '1985-06-15',
    });
    expect(kyc.status).toBe('verified');

    // Step 5: Funding readiness + track routing
    const readiness = calculateFundingReadiness({
      annualRevenue:       Number(graph.business.annualRevenue),
      personalCreditScore: graph.creditProfile.score,
      dateOfFormation:     graph.business.dateOfFormation?.toISOString(),
      mcc:                 graph.business.mcc,
      existingDebtBalance: 20_000,
    });
    expect(readiness.score).toBeGreaterThan(0);
    expect(['stacking', 'credit_builder', 'alternative']).toContain(readiness.track);

    // At least the core events must have fired
    expect(spy.published.length).toBeGreaterThanOrEqual(3);
    spy.restore();
  });
});
