// ============================================================
// CapitalForge — Application Pipeline Unit Tests
//
// Covers:
//   - Valid and invalid state transitions
//   - Gate enforcement (all 5 gates, individually and combined)
//   - Maker-checker flow
//   - Consent requirement
//   - Event emission (submitted / approved / declined)
//   - Decline → auto-route to Decline Recovery
//   - Multi-advisor assignment and role-based visibility
// ============================================================

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

// ── Mocks must be hoisted above imports that reference them ───

// Mock Prisma
vi.mock('@prisma/client', () => {
  const mockPrisma = {
    business: { findFirst: vi.fn(), findMany: vi.fn() },
    cardApplication: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    user: { findMany: vi.fn() },
    productAcknowledgment: { findFirst: vi.fn() },
    consentRecord: { findFirst: vi.fn() },
    suitabilityCheck: { findFirst: vi.fn() },
    complianceCheck: { findFirst: vi.fn() },
    businessOwner: { findMany: vi.fn() },
  };
  return {
    PrismaClient: vi.fn(() => mockPrisma),
    Prisma: {
      Decimal,
      QueryMode: { insensitive: 'insensitive' },
    },
  };
});

// Mock EventBus to prevent real event emission
vi.mock('@backend/events/event-bus.js', () => ({
  eventBus: {
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'evt-1', publishedAt: new Date() }),
    publish: vi.fn().mockResolvedValue(undefined),
  },
}));

import { PrismaClient } from '@prisma/client';
import { eventBus } from '@backend/events/event-bus.js';
import {
  ApplicationPipelineService,
  ApplicationWorkflowError,
  type CallerContext,
} from '@backend/services/application-pipeline.service.js';
import { ApplicationGateChecker } from '@backend/services/application-gates.js';
import {
  VALID_TRANSITIONS,
  CreateApplicationSchema,
  TransitionStatusSchema,
} from '@shared/validators/application.validators.js';
import { EVENT_TYPES } from '@shared/constants/index.js';

// ── Test fixtures ─────────────────────────────────────────────

const TENANT_ID = 'tenant-abc-001';
const BUSINESS_ID = 'business-def-002';
const APP_ID = 'app-ghi-003';
const ADVISOR_1 = 'user-advisor-001';
const ADVISOR_2 = 'user-advisor-002';
const COMPLIANCE_OFFICER = 'user-compliance-001';

const adminCaller: CallerContext = {
  tenantId: TENANT_ID,
  userId: ADVISOR_1,
  role: 'tenant_admin',
  permissions: ['application:submit', 'application:approve'],
};

const advisorCaller: CallerContext = {
  tenantId: TENANT_ID,
  userId: ADVISOR_1,
  role: 'advisor',
  permissions: ['application:submit', 'application:approve'],
};

const checkerCaller: CallerContext = {
  tenantId: TENANT_ID,
  userId: ADVISOR_2,
  role: 'advisor',
  permissions: ['application:approve'],
};

function makeAppRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APP_ID,
    businessId: BUSINESS_ID,
    fundingRoundId: null,
    issuer: 'Chase',
    cardProduct: 'Ink Business Unlimited',
    status: 'draft',
    creditLimit: null,
    introApr: null,
    introAprExpiry: null,
    regularApr: null,
    annualFee: null,
    cashAdvanceFee: null,
    consentCapturedAt: null,
    submittedAt: null,
    decidedAt: null,
    declineReason: null,
    adverseActionNotice: {
      assignedAdvisorIds: [ADVISOR_1],
      createdByUserId: ADVISOR_1,
      approvedByUserId: null,
    },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ── Helper: get the mock prisma instance ──────────────────────

function getMockPrisma() {
  return new PrismaClient() as unknown as ReturnType<typeof buildMockPrisma>;
}

function buildMockPrisma() {
  return {
    business: { findFirst: vi.fn(), findMany: vi.fn() },
    cardApplication: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    user: { findMany: vi.fn() },
    productAcknowledgment: { findFirst: vi.fn() },
    consentRecord: { findFirst: vi.fn() },
    suitabilityCheck: { findFirst: vi.fn() },
    complianceCheck: { findFirst: vi.fn() },
    businessOwner: { findMany: vi.fn() },
  };
}

// ── 1. Validator / schema tests ───────────────────────────────

describe('Application Validators', () => {
  describe('CreateApplicationSchema', () => {
    it('accepts a minimal valid payload', () => {
      const result = CreateApplicationSchema.safeParse({
        issuer: 'Chase',
        cardProduct: 'Ink Business Unlimited',
        assignedAdvisorIds: [ADVISOR_1],
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing issuer', () => {
      const result = CreateApplicationSchema.safeParse({
        cardProduct: 'Ink',
        assignedAdvisorIds: [ADVISOR_1],
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty assignedAdvisorIds', () => {
      const result = CreateApplicationSchema.safeParse({
        issuer: 'Chase',
        cardProduct: 'Ink',
        assignedAdvisorIds: [],
      });
      expect(result.success).toBe(false);
    });

    it('trims whitespace from issuer and cardProduct', () => {
      const result = CreateApplicationSchema.safeParse({
        issuer: '  Chase  ',
        cardProduct: '  Ink Business  ',
        assignedAdvisorIds: [ADVISOR_1],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.issuer).toBe('Chase');
        expect(result.data.cardProduct).toBe('Ink Business');
      }
    });
  });

  describe('TransitionStatusSchema', () => {
    it('requires approvedByUserId when status is submitted', () => {
      const result = TransitionStatusSchema.safeParse({ status: 'submitted' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('approvedByUserId');
      }
    });

    it('requires declineReason when declining', () => {
      const result = TransitionStatusSchema.safeParse({ status: 'declined' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('declineReason');
      }
    });

    it('accepts a valid submission with approvedByUserId', () => {
      const result = TransitionStatusSchema.safeParse({
        status: 'submitted',
        approvedByUserId: ADVISOR_2,
      });
      expect(result.success).toBe(true);
    });

    it('accepts pending_consent without extra fields', () => {
      const result = TransitionStatusSchema.safeParse({ status: 'pending_consent' });
      expect(result.success).toBe(true);
    });
  });

  describe('VALID_TRANSITIONS', () => {
    it('draft can only move to pending_consent', () => {
      expect(VALID_TRANSITIONS.draft).toEqual(['pending_consent']);
    });

    it('pending_consent can move to submitted or back to draft', () => {
      expect(VALID_TRANSITIONS.pending_consent).toContain('submitted');
      expect(VALID_TRANSITIONS.pending_consent).toContain('draft');
    });

    it('submitted can move to approved or declined', () => {
      expect(VALID_TRANSITIONS.submitted).toContain('approved');
      expect(VALID_TRANSITIONS.submitted).toContain('declined');
    });

    it('approved is a terminal state', () => {
      expect(VALID_TRANSITIONS.approved).toHaveLength(0);
    });

    it('declined can move to reconsideration', () => {
      expect(VALID_TRANSITIONS.declined).toContain('reconsideration');
    });

    it('reconsideration can be submitted or declined', () => {
      expect(VALID_TRANSITIONS.reconsideration).toContain('submitted');
      expect(VALID_TRANSITIONS.reconsideration).toContain('declined');
    });
  });
});

// ── 2. ApplicationGateChecker unit tests ──────────────────────

describe('ApplicationGateChecker', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let gateChecker: ApplicationGateChecker;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = getMockPrisma();
    gateChecker = new ApplicationGateChecker(mockPrisma as unknown as PrismaClient);
  });

  // Gate 1
  describe('Gate 1 — checkProductRealityAcknowledged', () => {
    it('passes when acknowledgment record exists', async () => {
      (mockPrisma.productAcknowledgment.findFirst as Mock).mockResolvedValue({
        id: 'ack-1',
        signedAt: new Date(),
      });
      const result = await gateChecker.checkProductRealityAcknowledged(BUSINESS_ID);
      expect(result.passed).toBe(true);
      expect(result.gate).toBe('product_reality');
    });

    it('fails when no acknowledgment exists', async () => {
      (mockPrisma.productAcknowledgment.findFirst as Mock).mockResolvedValue(null);
      const result = await gateChecker.checkProductRealityAcknowledged(BUSINESS_ID);
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/product reality/i);
    });
  });

  // Gate 2
  describe('Gate 2 — checkConsentCaptured', () => {
    it('passes when consentCapturedAt is set and active consent record exists', async () => {
      (mockPrisma.cardApplication.findUnique as Mock).mockResolvedValue({
        consentCapturedAt: new Date(),
      });
      (mockPrisma.consentRecord.findFirst as Mock).mockResolvedValue({ id: 'consent-1' });

      const result = await gateChecker.checkConsentCaptured(APP_ID, BUSINESS_ID);
      expect(result.passed).toBe(true);
    });

    it('fails when consentCapturedAt is null', async () => {
      (mockPrisma.cardApplication.findUnique as Mock).mockResolvedValue({
        consentCapturedAt: null,
      });

      const result = await gateChecker.checkConsentCaptured(APP_ID, BUSINESS_ID);
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/per-application consent/i);
    });

    it('fails when application not found', async () => {
      (mockPrisma.cardApplication.findUnique as Mock).mockResolvedValue(null);
      const result = await gateChecker.checkConsentCaptured(APP_ID, BUSINESS_ID);
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/not found/i);
    });

    it('fails when no active ConsentRecord for the business', async () => {
      (mockPrisma.cardApplication.findUnique as Mock).mockResolvedValue({
        consentCapturedAt: new Date(),
      });
      (mockPrisma.consentRecord.findFirst as Mock).mockResolvedValue(null);

      const result = await gateChecker.checkConsentCaptured(APP_ID, BUSINESS_ID);
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/no active application consent/i);
    });
  });

  // Gate 3
  describe('Gate 3 — checkSuitabilityPassed', () => {
    it('passes when no-go is not triggered', async () => {
      (mockPrisma.suitabilityCheck.findFirst as Mock).mockResolvedValue({
        noGoTriggered: false,
        noGoReasons: [],
        overriddenBy: null,
        score: 80,
      });
      const result = await gateChecker.checkSuitabilityPassed(BUSINESS_ID);
      expect(result.passed).toBe(true);
    });

    it('fails when no suitability check exists', async () => {
      (mockPrisma.suitabilityCheck.findFirst as Mock).mockResolvedValue(null);
      const result = await gateChecker.checkSuitabilityPassed(BUSINESS_ID);
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/no suitability assessment/i);
    });

    it('fails when no-go is triggered without override', async () => {
      (mockPrisma.suitabilityCheck.findFirst as Mock).mockResolvedValue({
        noGoTriggered: true,
        noGoReasons: ['monthly revenue below threshold'],
        overriddenBy: null,
        score: 20,
      });
      const result = await gateChecker.checkSuitabilityPassed(BUSINESS_ID);
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/no-go triggered/i);
    });

    it('passes when no-go is overridden by compliance officer', async () => {
      (mockPrisma.suitabilityCheck.findFirst as Mock).mockResolvedValue({
        noGoTriggered: true,
        noGoReasons: ['monthly revenue below threshold'],
        overriddenBy: COMPLIANCE_OFFICER,
        overrideReason: 'Exceptional case approved',
        score: 20,
      });
      const result = await gateChecker.checkSuitabilityPassed(BUSINESS_ID);
      expect(result.passed).toBe(true);
    });
  });

  // Gate 4
  describe('Gate 4 — checkKybKycVerified', () => {
    it('passes when KYB check exists and all owners are KYC verified', async () => {
      (mockPrisma.complianceCheck.findFirst as Mock).mockResolvedValue({
        riskLevel: 'low',
        resolvedAt: new Date(),
        findings: {},
      });
      (mockPrisma.businessOwner.findMany as Mock).mockResolvedValue([
        { id: 'owner-1', firstName: 'Jane', lastName: 'Doe', kycStatus: 'verified' },
        { id: 'owner-2', firstName: 'John', lastName: 'Doe', kycStatus: 'verified' },
      ]);

      const result = await gateChecker.checkKybKycVerified(BUSINESS_ID, TENANT_ID);
      expect(result.passed).toBe(true);
    });

    it('fails when KYB check is absent', async () => {
      (mockPrisma.complianceCheck.findFirst as Mock).mockResolvedValue(null);
      const result = await gateChecker.checkKybKycVerified(BUSINESS_ID, TENANT_ID);
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/no kyb/i);
    });

    it('fails when a beneficial owner has KYC pending', async () => {
      (mockPrisma.complianceCheck.findFirst as Mock).mockResolvedValue({
        riskLevel: 'medium',
        resolvedAt: null,
        findings: {},
      });
      (mockPrisma.businessOwner.findMany as Mock).mockResolvedValue([
        { id: 'owner-1', firstName: 'Jane', lastName: 'Doe', kycStatus: 'pending' },
      ]);

      const result = await gateChecker.checkKybKycVerified(BUSINESS_ID, TENANT_ID);
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/Jane Doe/);
    });

    it('fails when no beneficial owners exist', async () => {
      (mockPrisma.complianceCheck.findFirst as Mock).mockResolvedValue({
        riskLevel: 'low',
        resolvedAt: new Date(),
        findings: {},
      });
      (mockPrisma.businessOwner.findMany as Mock).mockResolvedValue([]);

      const result = await gateChecker.checkKybKycVerified(BUSINESS_ID, TENANT_ID);
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/no beneficial owners/i);
    });

    it('fails when critical KYB risk is unresolved', async () => {
      (mockPrisma.complianceCheck.findFirst as Mock).mockResolvedValue({
        riskLevel: 'critical',
        resolvedAt: null,
        findings: {},
      });
      const result = await gateChecker.checkKybKycVerified(BUSINESS_ID, TENANT_ID);
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/critical/i);
    });
  });

  // Gate 5
  describe('Gate 5 — checkMakerChecker', () => {
    it('passes when approver is different from creator', async () => {
      const result = await gateChecker.checkMakerChecker({
        createdByUserId: ADVISOR_1,
        approverUserId: ADVISOR_2,
      });
      expect(result.passed).toBe(true);
    });

    it('fails when approver equals creator (self-approval)', async () => {
      const result = await gateChecker.checkMakerChecker({
        createdByUserId: ADVISOR_1,
        approverUserId: ADVISOR_1,
      });
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/self-approval/i);
    });

    it('fails when approverUserId is empty', async () => {
      const result = await gateChecker.checkMakerChecker({
        createdByUserId: ADVISOR_1,
        approverUserId: '',
      });
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/no approver/i);
    });
  });

  // checkAll
  describe('checkAll', () => {
    it('returns allPassed = false and lists failed gates when any gate fails', async () => {
      // Gate 1 fails (no ack), others pass
      (mockPrisma.productAcknowledgment.findFirst as Mock).mockResolvedValue(null);
      (mockPrisma.cardApplication.findUnique as Mock).mockResolvedValue({
        consentCapturedAt: new Date(),
      });
      (mockPrisma.consentRecord.findFirst as Mock).mockResolvedValue({ id: 'c1' });
      (mockPrisma.suitabilityCheck.findFirst as Mock).mockResolvedValue({
        noGoTriggered: false,
        overriddenBy: null,
        score: 85,
      });
      (mockPrisma.complianceCheck.findFirst as Mock).mockResolvedValue({
        riskLevel: 'low',
        resolvedAt: new Date(),
      });
      (mockPrisma.businessOwner.findMany as Mock).mockResolvedValue([
        { id: 'o1', firstName: 'Jane', lastName: 'Doe', kycStatus: 'verified' },
      ]);

      const summary = await gateChecker.checkAll(APP_ID, BUSINESS_ID, TENANT_ID, {
        createdByUserId: ADVISOR_1,
        approverUserId: ADVISOR_2,
      });

      expect(summary.allPassed).toBe(false);
      expect(summary.failedGates).toContain('product_reality');
    });

    it('returns allPassed = true when every gate passes', async () => {
      (mockPrisma.productAcknowledgment.findFirst as Mock).mockResolvedValue({ id: 'ack-1', signedAt: new Date() });
      (mockPrisma.cardApplication.findUnique as Mock).mockResolvedValue({ consentCapturedAt: new Date() });
      (mockPrisma.consentRecord.findFirst as Mock).mockResolvedValue({ id: 'c1' });
      (mockPrisma.suitabilityCheck.findFirst as Mock).mockResolvedValue({ noGoTriggered: false, overriddenBy: null, score: 90 });
      (mockPrisma.complianceCheck.findFirst as Mock).mockResolvedValue({ riskLevel: 'low', resolvedAt: new Date() });
      (mockPrisma.businessOwner.findMany as Mock).mockResolvedValue([
        { id: 'o1', firstName: 'Jane', lastName: 'Doe', kycStatus: 'verified' },
      ]);

      const summary = await gateChecker.checkAll(APP_ID, BUSINESS_ID, TENANT_ID, {
        createdByUserId: ADVISOR_1,
        approverUserId: ADVISOR_2,
      });

      expect(summary.allPassed).toBe(true);
      expect(summary.failedGates).toHaveLength(0);
    });
  });
});

// ── 3. ApplicationPipelineService unit tests ──────────────────

describe('ApplicationPipelineService', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let service: ApplicationPipelineService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = getMockPrisma();
    service = new ApplicationPipelineService(mockPrisma as unknown as PrismaClient);
  });

  // ── createApplication ───────────────────────────────────────

  describe('createApplication', () => {
    it('creates an application in draft status', async () => {
      (mockPrisma.business.findFirst as Mock).mockResolvedValue({
        id: BUSINESS_ID,
        advisorId: ADVISOR_1,
      });
      (mockPrisma.user.findMany as Mock).mockResolvedValue([{ id: ADVISOR_1 }]);

      const created = makeAppRow();
      (mockPrisma.cardApplication.create as Mock).mockResolvedValue(created);

      const result = await service.createApplication(
        BUSINESS_ID,
        {
          issuer: 'Chase',
          cardProduct: 'Ink Business Unlimited',
          assignedAdvisorIds: [ADVISOR_1],
        },
        advisorCaller,
      );

      expect(result.status).toBe('draft');
      expect(result.businessId).toBe(BUSINESS_ID);
      expect(mockPrisma.cardApplication.create).toHaveBeenCalledOnce();
    });

    it('throws BUSINESS_NOT_FOUND when business does not belong to tenant', async () => {
      (mockPrisma.business.findFirst as Mock).mockResolvedValue(null);

      await expect(
        service.createApplication(
          BUSINESS_ID,
          { issuer: 'Chase', cardProduct: 'Ink', assignedAdvisorIds: [ADVISOR_1] },
          advisorCaller,
        ),
      ).rejects.toThrow(ApplicationWorkflowError);

      await expect(
        service.createApplication(
          BUSINESS_ID,
          { issuer: 'Chase', cardProduct: 'Ink', assignedAdvisorIds: [ADVISOR_1] },
          advisorCaller,
        ),
      ).rejects.toMatchObject({ code: 'BUSINESS_NOT_FOUND' });
    });

    it('throws ADVISOR_NOT_FOUND when an advisor ID does not exist', async () => {
      (mockPrisma.business.findFirst as Mock).mockResolvedValue({ id: BUSINESS_ID });
      (mockPrisma.user.findMany as Mock).mockResolvedValue([]); // no advisors found

      await expect(
        service.createApplication(
          BUSINESS_ID,
          { issuer: 'Chase', cardProduct: 'Ink', assignedAdvisorIds: ['non-existent'] },
          advisorCaller,
        ),
      ).rejects.toMatchObject({ code: 'ADVISOR_NOT_FOUND' });
    });
  });

  // ── transitionStatus — invalid transitions ──────────────────

  describe('transitionStatus — invalid transitions', () => {
    it('throws INVALID_TRANSITION when moving from approved to anything', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'approved' }),
      );

      await expect(
        service.transitionStatus(APP_ID, { status: 'submitted', approvedByUserId: ADVISOR_2 }, adminCaller),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('throws INVALID_TRANSITION when skipping from draft to submitted', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'draft' }),
      );

      await expect(
        service.transitionStatus(APP_ID, { status: 'submitted', approvedByUserId: ADVISOR_2 }, adminCaller),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('throws INVALID_TRANSITION when moving from draft to approved directly', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'draft' }),
      );

      await expect(
        service.transitionStatus(APP_ID, { status: 'approved' }, adminCaller),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });

    it('throws APPLICATION_NOT_FOUND for unknown application', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(null);

      await expect(
        service.transitionStatus(APP_ID, { status: 'pending_consent' }, adminCaller),
      ).rejects.toMatchObject({ code: 'APPLICATION_NOT_FOUND' });
    });
  });

  // ── transitionStatus — valid transitions ────────────────────

  describe('transitionStatus — valid transitions', () => {
    it('draft → pending_consent captures consentCapturedAt', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'draft' }),
      );
      const updatedRow = makeAppRow({ status: 'pending_consent', consentCapturedAt: new Date() });
      (mockPrisma.cardApplication.update as Mock).mockResolvedValue(updatedRow);

      const result = await service.transitionStatus(
        APP_ID,
        { status: 'pending_consent' },
        advisorCaller,
      );

      expect(result.status).toBe('pending_consent');
      expect(mockPrisma.cardApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ consentCapturedAt: expect.any(Date) }),
        }),
      );
    });

    it('submitted → approved publishes APPLICATION_APPROVED', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'submitted' }),
      );
      const updatedRow = makeAppRow({ status: 'approved', decidedAt: new Date() });
      (mockPrisma.cardApplication.update as Mock).mockResolvedValue(updatedRow);

      await service.transitionStatus(APP_ID, { status: 'approved' }, adminCaller);

      expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ eventType: EVENT_TYPES.APPLICATION_APPROVED }),
      );
    });

    it('submitted → declined publishes APPLICATION_DECLINED and triggers Decline Recovery', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'submitted' }),
      );
      const updatedRow = makeAppRow({
        status: 'declined',
        decidedAt: new Date(),
        declineReason: 'Insufficient credit score',
      });
      (mockPrisma.cardApplication.update as Mock).mockResolvedValue(updatedRow);

      await service.transitionStatus(
        APP_ID,
        { status: 'declined', declineReason: 'Insufficient credit score' },
        adminCaller,
      );

      // Must publish the main declined event
      expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ eventType: EVENT_TYPES.APPLICATION_DECLINED }),
      );
      // AND the decline recovery trigger
      expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ eventType: 'application.decline_recovery.triggered' }),
      );
    });
  });

  // ── Gate enforcement during submission ──────────────────────

  describe('Gate enforcement — submission blocked when gates fail', () => {
    function setupAllGatesPassing() {
      (mockPrisma.productAcknowledgment.findFirst as Mock).mockResolvedValue({ id: 'ack-1', signedAt: new Date() });
      (mockPrisma.cardApplication.findUnique as Mock).mockResolvedValue({ consentCapturedAt: new Date() });
      (mockPrisma.consentRecord.findFirst as Mock).mockResolvedValue({ id: 'c1' });
      (mockPrisma.suitabilityCheck.findFirst as Mock).mockResolvedValue({ noGoTriggered: false, overriddenBy: null, score: 90 });
      (mockPrisma.complianceCheck.findFirst as Mock).mockResolvedValue({ riskLevel: 'low', resolvedAt: new Date() });
      (mockPrisma.businessOwner.findMany as Mock).mockResolvedValue([
        { id: 'o1', firstName: 'Jane', lastName: 'Doe', kycStatus: 'verified' },
      ]);
    }

    it('proceeds to submitted when all gates pass', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'pending_consent' }),
      );
      setupAllGatesPassing();
      const updatedRow = makeAppRow({ status: 'submitted', submittedAt: new Date() });
      (mockPrisma.cardApplication.update as Mock).mockResolvedValue(updatedRow);

      const result = await service.transitionStatus(
        APP_ID,
        { status: 'submitted', approvedByUserId: ADVISOR_2 },
        advisorCaller,
      );

      expect(result.status).toBe('submitted');
      expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ eventType: EVENT_TYPES.APPLICATION_SUBMITTED }),
      );
    });

    it('blocks submission when product reality not acknowledged', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'pending_consent' }),
      );
      setupAllGatesPassing();
      // Override gate 1 to fail
      (mockPrisma.productAcknowledgment.findFirst as Mock).mockResolvedValue(null);

      await expect(
        service.transitionStatus(
          APP_ID,
          { status: 'submitted', approvedByUserId: ADVISOR_2 },
          advisorCaller,
        ),
      ).rejects.toMatchObject({ code: 'GATE_CHECK_FAILED' });
    });

    it('blocks submission when consent is missing', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'pending_consent' }),
      );
      setupAllGatesPassing();
      (mockPrisma.cardApplication.findUnique as Mock).mockResolvedValue({ consentCapturedAt: null });

      await expect(
        service.transitionStatus(
          APP_ID,
          { status: 'submitted', approvedByUserId: ADVISOR_2 },
          advisorCaller,
        ),
      ).rejects.toMatchObject({ code: 'GATE_CHECK_FAILED' });
    });

    it('blocks submission when suitability no-go is active', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'pending_consent' }),
      );
      setupAllGatesPassing();
      (mockPrisma.suitabilityCheck.findFirst as Mock).mockResolvedValue({
        noGoTriggered: true,
        noGoReasons: ['revenue too low'],
        overriddenBy: null,
        score: 20,
      });

      await expect(
        service.transitionStatus(
          APP_ID,
          { status: 'submitted', approvedByUserId: ADVISOR_2 },
          advisorCaller,
        ),
      ).rejects.toMatchObject({ code: 'GATE_CHECK_FAILED' });
    });

    it('blocks submission when KYC is not verified', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'pending_consent' }),
      );
      setupAllGatesPassing();
      (mockPrisma.businessOwner.findMany as Mock).mockResolvedValue([
        { id: 'o1', firstName: 'Bob', lastName: 'Smith', kycStatus: 'pending' },
      ]);

      await expect(
        service.transitionStatus(
          APP_ID,
          { status: 'submitted', approvedByUserId: ADVISOR_2 },
          advisorCaller,
        ),
      ).rejects.toMatchObject({ code: 'GATE_CHECK_FAILED' });
    });
  });

  // ── Maker-checker ───────────────────────────────────────────

  describe('Maker-checker enforcement', () => {
    function setupAllGatesPassing() {
      (mockPrisma.productAcknowledgment.findFirst as Mock).mockResolvedValue({ id: 'ack-1', signedAt: new Date() });
      (mockPrisma.cardApplication.findUnique as Mock).mockResolvedValue({ consentCapturedAt: new Date() });
      (mockPrisma.consentRecord.findFirst as Mock).mockResolvedValue({ id: 'c1' });
      (mockPrisma.suitabilityCheck.findFirst as Mock).mockResolvedValue({ noGoTriggered: false, overriddenBy: null, score: 90 });
      (mockPrisma.complianceCheck.findFirst as Mock).mockResolvedValue({ riskLevel: 'low', resolvedAt: new Date() });
      (mockPrisma.businessOwner.findMany as Mock).mockResolvedValue([
        { id: 'o1', firstName: 'Jane', lastName: 'Doe', kycStatus: 'verified' },
      ]);
    }

    it('blocks self-approval (maker = checker)', async () => {
      // Application was created by ADVISOR_1
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({
          status: 'pending_consent',
          adverseActionNotice: {
            assignedAdvisorIds: [ADVISOR_1],
            createdByUserId: ADVISOR_1, // same as caller
            approvedByUserId: null,
          },
        }),
      );
      setupAllGatesPassing();

      // approvedByUserId = ADVISOR_1 (same as creator) → should fail
      await expect(
        service.transitionStatus(
          APP_ID,
          { status: 'submitted', approvedByUserId: ADVISOR_1 },
          advisorCaller, // userId = ADVISOR_1
        ),
      ).rejects.toMatchObject({ code: 'GATE_CHECK_FAILED' });
    });

    it('succeeds when a different advisor approves', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({
          status: 'pending_consent',
          adverseActionNotice: {
            assignedAdvisorIds: [ADVISOR_1, ADVISOR_2],
            createdByUserId: ADVISOR_1,
            approvedByUserId: null,
          },
        }),
      );
      setupAllGatesPassing();
      const updatedRow = makeAppRow({ status: 'submitted', submittedAt: new Date() });
      (mockPrisma.cardApplication.update as Mock).mockResolvedValue(updatedRow);

      const result = await service.transitionStatus(
        APP_ID,
        { status: 'submitted', approvedByUserId: ADVISOR_2 },
        advisorCaller,
      );
      expect(result.status).toBe('submitted');
    });

    it('approvedByUserId is stored in metadata after successful submission', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({
          status: 'pending_consent',
          adverseActionNotice: {
            assignedAdvisorIds: [ADVISOR_1, ADVISOR_2],
            createdByUserId: ADVISOR_1,
            approvedByUserId: null,
          },
        }),
      );
      setupAllGatesPassing();
      const updatedRow = makeAppRow({ status: 'submitted', submittedAt: new Date() });
      (mockPrisma.cardApplication.update as Mock).mockResolvedValue(updatedRow);

      await service.transitionStatus(
        APP_ID,
        { status: 'submitted', approvedByUserId: ADVISOR_2 },
        advisorCaller,
      );

      const updateCall = (mockPrisma.cardApplication.update as Mock).mock.calls[0][0];
      const metaWritten = updateCall.data.adverseActionNotice as Record<string, unknown>;
      expect(metaWritten.approvedByUserId).toBe(ADVISOR_2);
    });
  });

  // ── Role-based visibility ────────────────────────────────────

  describe('Role-based visibility', () => {
    it('advisors only see applications where they are assigned', async () => {
      (mockPrisma.business.findFirst as Mock).mockResolvedValue({ id: BUSINESS_ID });

      // Return two apps: one assigned to ADVISOR_1, one assigned to ADVISOR_2 only
      const appForAdvisor1 = makeAppRow({
        id: 'app-001',
        adverseActionNotice: { assignedAdvisorIds: [ADVISOR_1], createdByUserId: ADVISOR_1 },
      });
      const appForAdvisor2Only = makeAppRow({
        id: 'app-002',
        adverseActionNotice: { assignedAdvisorIds: [ADVISOR_2], createdByUserId: ADVISOR_2 },
      });

      (mockPrisma.cardApplication.findMany as Mock).mockResolvedValue([
        appForAdvisor1,
        appForAdvisor2Only,
      ]);
      (mockPrisma.cardApplication.count as Mock).mockResolvedValue(2);

      const result = await service.listApplications(
        BUSINESS_ID,
        { page: 1, pageSize: 20, sortBy: 'createdAt', sortOrder: 'desc' },
        advisorCaller, // role: advisor, userId: ADVISOR_1
      );

      // Should only see the app assigned to ADVISOR_1
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('app-001');
    });

    it('tenant_admin sees all applications regardless of assignment', async () => {
      (mockPrisma.business.findFirst as Mock).mockResolvedValue({ id: BUSINESS_ID });

      const appForAdvisor1 = makeAppRow({
        id: 'app-001',
        adverseActionNotice: { assignedAdvisorIds: [ADVISOR_1], createdByUserId: ADVISOR_1 },
      });
      const appForAdvisor2Only = makeAppRow({
        id: 'app-002',
        adverseActionNotice: { assignedAdvisorIds: [ADVISOR_2], createdByUserId: ADVISOR_2 },
      });

      (mockPrisma.cardApplication.findMany as Mock).mockResolvedValue([
        appForAdvisor1,
        appForAdvisor2Only,
      ]);
      (mockPrisma.cardApplication.count as Mock).mockResolvedValue(2);

      const result = await service.listApplications(
        BUSINESS_ID,
        { page: 1, pageSize: 20, sortBy: 'createdAt', sortOrder: 'desc' },
        adminCaller, // role: tenant_admin
      );

      expect(result.items).toHaveLength(2);
    });

    it('compliance officer sees all applications', async () => {
      (mockPrisma.business.findFirst as Mock).mockResolvedValue({ id: BUSINESS_ID });

      const appForAdvisor2Only = makeAppRow({
        id: 'app-002',
        adverseActionNotice: { assignedAdvisorIds: [ADVISOR_2], createdByUserId: ADVISOR_2 },
      });
      (mockPrisma.cardApplication.findMany as Mock).mockResolvedValue([appForAdvisor2Only]);
      (mockPrisma.cardApplication.count as Mock).mockResolvedValue(1);

      const complianceCaller: CallerContext = {
        tenantId: TENANT_ID,
        userId: COMPLIANCE_OFFICER,
        role: 'compliance_officer',
        permissions: ['compliance:read', 'compliance:write'],
      };

      const result = await service.listApplications(
        BUSINESS_ID,
        { page: 1, pageSize: 20, sortBy: 'createdAt', sortOrder: 'desc' },
        complianceCaller,
      );

      expect(result.items).toHaveLength(1);
    });
  });

  // ── Decline recovery ─────────────────────────────────────────

  describe('Decline recovery auto-routing', () => {
    it('publishes decline_recovery.triggered after decline', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'submitted' }),
      );
      (mockPrisma.cardApplication.update as Mock).mockResolvedValue(
        makeAppRow({
          status: 'declined',
          decidedAt: new Date(),
          declineReason: 'Too many inquiries',
        }),
      );

      await service.transitionStatus(
        APP_ID,
        { status: 'declined', declineReason: 'Too many inquiries' },
        adminCaller,
      );

      const calls = (eventBus.publishAndPersist as Mock).mock.calls as Array<
        [string, { eventType: string }]
      >;
      const eventTypes = calls.map(([, env]) => env.eventType);
      expect(eventTypes).toContain('application.decline_recovery.triggered');
    });

    it('declined application can move to reconsideration', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(
        makeAppRow({ status: 'declined' }),
      );
      (mockPrisma.cardApplication.update as Mock).mockResolvedValue(
        makeAppRow({ status: 'reconsideration' }),
      );

      const result = await service.transitionStatus(
        APP_ID,
        { status: 'reconsideration' },
        adminCaller,
      );

      expect(result.status).toBe('reconsideration');
    });
  });

  // ── captureConsent ────────────────────────────────────────────

  describe('captureConsent', () => {
    it('sets consentCapturedAt on the application', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue({
        id: APP_ID,
        consentCapturedAt: null,
      });
      (mockPrisma.cardApplication.update as Mock).mockResolvedValue({});

      await service.captureConsent(APP_ID, advisorCaller);

      expect(mockPrisma.cardApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ consentCapturedAt: expect.any(Date) }),
        }),
      );
    });

    it('throws APPLICATION_NOT_FOUND for unknown application', async () => {
      (mockPrisma.cardApplication.findFirst as Mock).mockResolvedValue(null);

      await expect(service.captureConsent(APP_ID, advisorCaller)).rejects.toMatchObject({
        code: 'APPLICATION_NOT_FOUND',
      });
    });
  });
});
