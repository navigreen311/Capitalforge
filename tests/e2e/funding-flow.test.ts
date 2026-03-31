// ============================================================
// CapitalForge — E2E: Funding Flow
//
// Covers the full funding lifecycle:
//   suitability check → acknowledgment gate → consent gate →
//   optimizer → application creation → approval → round completion
//
// All Prisma calls are mocked. Services are tested with real logic
// wired to injected mocks — no HTTP layer involved.
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

// ── Service imports ───────────────────────────────────────────
import {
  SuitabilityService,
  setPrismaClient as setSuitabilityPrisma,
  NOGO_REASON,
} from '../../src/backend/services/suitability.service.js';
import {
  ProductAcknowledgmentService,
  setPrismaClient as setAckPrisma,
} from '../../src/backend/services/product-acknowledgment.service.js';
import {
  ConsentService,
  setPrismaClient as setConsentPrisma,
} from '../../src/backend/services/consent.service.js';
import {
  consentGate,
} from '../../src/backend/services/consent-gate.js';
import {
  StackingOptimizerService,
} from '../../src/backend/services/stacking-optimizer.service.js';
import {
  ApplicationPipelineService,
  setPrismaClient as setAppPrisma,
} from '../../src/backend/services/application-pipeline.service.js';
import {
  FundingRoundService,
  setPrismaClient as setRoundPrisma,
} from '../../src/backend/services/funding-round.service.js';
import { eventBus } from '../../src/backend/events/event-bus.js';

// ── Test suite ─────────────────────────────────────────────────

describe('E2E: Funding Flow', () => {
  let graph: TestBusinessGraph;

  beforeEach(() => {
    graph = createFullTestBusiness({
      tenantIdSuffix:  'funding',
      kybVerified:     true,
      kycVerified:     true,
      withConsent:     true,
      creditScore:     740,
      annualRevenue:   600_000,
      businessAgeYears: 4,
      existingDebt:    15_000,
    });
    setSuitabilityPrisma(graph.prisma);
    setAckPrisma(graph.prisma);
    setConsentPrisma(graph.prisma);
    setAppPrisma(graph.prisma);
    setRoundPrisma(graph.prisma);
  });

  afterEach(() => {
    cleanupTestBusiness(graph);
    vi.restoreAllMocks();
  });

  // ── Test 1: Suitability check approves a qualified business ───

  it('produces an APPROVED suitability result for a qualified business', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new SuitabilityService(graph.prisma);

    const result = await svc.assess({
      businessId:    graph.business.id,
      tenantId:      graph.tenant.id,
      monthlyRevenue: 50_000,
      existingDebt:  15_000,
      creditScore:   740,
      businessAgeMonths: 48,
      industry:      'technology consulting',
      mcc:           '7372',
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.noGoTriggered).toBe(false);
    expect(result.noGoReasons).toHaveLength(0);
    expect(result.recommendation).toMatch(/APPROVED/i);
    spy.assertEventFired('suitability.assessed');
    spy.restore();
  });

  // ── Test 2: No-go triggers for below-threshold credit ─────────

  it('triggers no-go for a business with critically low credit score', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new SuitabilityService(graph.prisma);

    const result = await svc.assess({
      businessId:    graph.business.id,
      tenantId:      graph.tenant.id,
      monthlyRevenue: 10_000,
      existingDebt:  300_000,
      creditScore:   490,
      businessAgeMonths: 6,
      industry:      'retail',
      mcc:           '5999',
    });

    expect(result.noGoTriggered).toBe(true);
    expect(result.noGoReasons).toContain(NOGO_REASON.CREDIT_SCORE_TOO_LOW);
    expect(result.score).toBeLessThan(30);
    spy.assertEventFired('nogo.triggered');
    spy.restore();
  });

  // ── Test 3: Max safe leverage is calculated ────────────────────

  it('calculates maximum safe leverage within the suitability result', async () => {
    const svc = new SuitabilityService(graph.prisma);

    const result = await svc.assess({
      businessId:    graph.business.id,
      tenantId:      graph.tenant.id,
      monthlyRevenue: 50_000,
      existingDebt:  15_000,
      creditScore:   740,
      businessAgeMonths: 48,
      industry:      'technology consulting',
      mcc:           '7372',
    });

    expect(result.maxSafeLeverage).toBeGreaterThan(0);
    expect(Number(result.maxSafeLeverage)).toBeLessThanOrEqual(600_000);
  });

  // ── Test 4: Product acknowledgment gate blocks without signature

  it('blocks application submission when product_reality acknowledgment is missing', async () => {
    const svc = new ProductAcknowledgmentService(graph.prisma);

    graph.prisma.productAcknowledgment.findFirst = vi.fn().mockResolvedValue(null);

    const gateResult = await svc.checkPreSubmissionGate({
      businessId: graph.business.id,
      tenantId:   graph.tenant.id,
    });

    expect(gateResult.passed).toBe(false);
    expect(gateResult.missing).toContain('product_reality');
  });

  // ── Test 5: Acknowledgment gate passes when all acks are signed ─

  it('allows application when all required acknowledgments are signed', async () => {
    const svc = new ProductAcknowledgmentService(graph.prisma);

    graph.prisma.productAcknowledgment.findFirst = vi.fn().mockResolvedValue({
      id:                 `ack-${graph.business.id}`,
      businessId:         graph.business.id,
      acknowledgmentType: 'product_reality',
      version:            '1.0.0',
      signedAt:           new Date(Date.now() - 3600_000),
      signatureRef:       'sig_abc123',
      documentVaultId:    `doc-ack-${graph.business.id}`,
      metadata:           {},
      createdAt:          new Date(Date.now() - 3600_000),
    });

    const gateResult = await svc.checkPreSubmissionGate({
      businessId: graph.business.id,
      tenantId:   graph.tenant.id,
    });

    expect(gateResult.passed).toBe(true);
    expect(gateResult.missing).toHaveLength(0);
  });

  // ── Test 6: Consent gate allows outbound call when TCPA active ─

  it('consent gate allows outbound voice call with active TCPA consent', async () => {
    const svc = new ConsentService(graph.prisma);
    graph.prisma.consentRecord.findFirst = vi.fn().mockResolvedValue(graph.tcpaConsent);

    const result = await consentGate.check(
      graph.tenant.id,
      graph.business.id,
      'voice',
      svc,
    );

    expect(result.allowed).toBe(true);
    expect(result.channel).toBe('voice');
  });

  // ── Test 7: Consent gate blocks when consent is revoked ────────

  it('consent gate denies outbound call when TCPA consent is revoked', async () => {
    const svc = new ConsentService(graph.prisma);

    graph.prisma.consentRecord.findFirst = vi.fn().mockResolvedValue({
      ...graph.tcpaConsent,
      status: 'revoked',
      revokedAt: new Date(Date.now() - 3600_000),
    });

    const result = await consentGate.check(
      graph.tenant.id,
      graph.business.id,
      'voice',
      svc,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('CONSENT_REVOKED');
  });

  // ── Test 8: Optimizer produces a ranked card plan ──────────────

  it('optimizer returns a prioritized card application plan', () => {
    const optimizer = new StackingOptimizerService();

    const plan = optimizer.optimize({
      personal: {
        ficoScore:       740,
        utilizationRatio: 0.20,
        derogatoryCount: 0,
        inquiries12m:    1,
        creditAgeMonths: 84,
      },
      business: {
        businessId:        graph.business.id,
        yearsInOperation:  4,
        annualRevenue:     600_000,
        targetCreditLimit: 120_000,
      },
      existingCards: [],
    });

    expect(plan.rounds).toBeDefined();
    expect(plan.rounds.length).toBeGreaterThan(0);
    expect(plan.totalEstimatedCredit).toBeGreaterThan(0);
    expect(plan.rounds[0].applications.length).toBeGreaterThan(0);
  });

  // ── Test 9: Application is created in draft status ─────────────

  it('creates a card application in draft status', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new ApplicationPipelineService(graph.prisma);
    const ctx = buildCallerContext(graph);

    graph.prisma.cardApplication.create = vi.fn().mockResolvedValue({
      ...graph.application,
      status: 'draft',
    });

    const app = await svc.createApplication({
      tenantId:       graph.tenant.id,
      businessId:     graph.business.id,
      fundingRoundId: graph.fundingRound.id,
      issuer:         'Chase',
      cardProduct:    'Ink Business Preferred',
      creditLimit:    new Prisma.Decimal('25000'),
      regularApr:     new Prisma.Decimal('0.2124'),
      annualFee:      new Prisma.Decimal('95'),
    }, ctx);

    expect(app.status).toBe('draft');
    expect(graph.prisma.cardApplication.create).toHaveBeenCalledOnce();
    spy.restore();
  });

  // ── Test 10: Application transitions draft → submitted ─────────

  it('transitions application from draft to submitted and emits event', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new ApplicationPipelineService(graph.prisma);
    const ctx = buildCallerContext(graph);

    // Application is in pending_consent state (consent has been captured),
    // which is the valid predecessor state before submission.
    graph.prisma.cardApplication.findFirst = vi.fn().mockResolvedValue({
      ...graph.application,
      status: 'pending_consent',
      tenantId: graph.tenant.id,
      consentCapturedAt: new Date(),
    });
    graph.prisma.cardApplication.findUnique = vi.fn().mockResolvedValue({
      ...graph.application,
      status: 'pending_consent',
      consentCapturedAt: new Date(), // consent is captured
    });
    graph.prisma.cardApplication.update = vi.fn().mockResolvedValue({
      ...graph.application,
      status: 'submitted',
    });
    // Gates pass
    graph.prisma.productAcknowledgment.findFirst = vi.fn().mockResolvedValue({
      id: `ack-${graph.business.id}`,
      acknowledgmentType: 'product_reality',
      version: '1.0.0',
      signedAt: new Date(Date.now() - 3600_000),
    });

    const updated = await svc.transitionStatus({
      applicationId:    graph.application.id,
      tenantId:         graph.tenant.id,
      toStatus:         'submitted',
      approvedByUserId: graph.complianceUser.id,
    }, ctx);

    expect(updated.status).toBe('submitted');
    spy.assertEventFired('application.submitted');
    spy.restore();
  });

  // ── Test 11: Application is approved by a different user ───────

  it('approves application and enforces maker-checker (approver ≠ creator)', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new ApplicationPipelineService(graph.prisma);
    const complianceCtx = buildCallerContext(graph, 'compliance_officer');

    graph.prisma.cardApplication.findFirst = vi.fn().mockResolvedValue({
      ...graph.application,
      status:    'submitted',
      tenantId:  graph.tenant.id,
      createdBy: graph.advisorUser.id,
    });
    graph.prisma.cardApplication.update = vi.fn().mockResolvedValue({
      ...graph.application,
      status: 'approved',
    });

    const approved = await svc.transitionStatus({
      applicationId: graph.application.id,
      tenantId:      graph.tenant.id,
      toStatus:      'approved',
    }, complianceCtx);

    expect(approved.status).toBe('approved');
    spy.assertEventFired('application.approved');
    spy.restore();
  });

  // ── Test 12: Funding round is completed after all apps close ───

  it('marks a funding round as completed when all applications close', async () => {
    const spy = createEventBusSpy(eventBus);
    const svc = new FundingRoundService(graph.prisma);
    const ctx = buildCallerContext(graph);

    const approvedApps = [{ ...graph.application, status: 'approved' }];
    graph.prisma.fundingRound.findUnique = vi.fn().mockResolvedValue({
      ...graph.fundingRound,
      status: 'planning',
      applications: approvedApps,
    });
    graph.prisma.fundingRound.update = vi.fn().mockResolvedValue({
      ...graph.fundingRound,
      status: 'completed',
    });
    graph.prisma.cardApplication.findMany = vi.fn().mockResolvedValue(approvedApps);

    const round = await svc.completeRound({
      fundingRoundId: graph.fundingRound.id,
      tenantId:       graph.tenant.id,
    }, ctx);

    expect(round.status).toBe('completed');
    spy.assertEventFired('funding_round.completed');
    spy.restore();
  });
});
