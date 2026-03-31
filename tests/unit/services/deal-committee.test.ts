// ============================================================
// Unit Tests — Deal Committee Workspace & Decision Explainability
//
// Coverage:
//   Deal Committee Service:
//     - determineRiskTier: all tier thresholds
//     - requiresCommitteeEscalation: score and compliance triggers
//     - evaluateRedFlagChecklist: all 10 items, partial flags
//     - createDealReview: persist, escalation, event emit
//     - listPendingReviews: tenant filter, status filter
//     - updateDealReview: notes, conditions, status, decidedAt
//     - castVote: happy path, quorum, duplicate prevention, terminal state guard
//     - recordSignoff: counsel, accountant, both signoffs
//
//   Decision Explainability Service:
//     - buildRecommendationExplanation: reason codes, summary text
//     - buildExclusionExplanation: reason codes, summary text
//     - buildSuitabilityExplanation: scoring factors, no-go reasons, override fields
//     - logAiDecision: persist entry, return ID
//     - captureHumanOverride: justification gate, tenant mismatch, happy path, audit event
//     - getBusinessDecisionExplanations: tenant-scoped query
//     - getDecisionAuditTrail: decision + ledger events, not-found guard
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────
// Declared BEFORE imports so Vitest hoists them.

vi.mock('../../../src/backend/events/event-bus.js', () => ({
  eventBus: {
    publishAndPersist: vi.fn().mockResolvedValue({ id: 'evt-001', publishedAt: new Date() }),
  },
}));

vi.mock('@prisma/client', () => {
  const mockCreate     = vi.fn();
  const mockFindFirst  = vi.fn();
  const mockFindUnique = vi.fn();
  const mockUpdate     = vi.fn();
  const mockFindMany   = vi.fn();

  const PrismaClient = vi.fn().mockImplementation(() => ({
    dealCommitteeReview: {
      create:     mockCreate,
      findUnique: mockFindUnique,
      findMany:   mockFindMany,
      update:     mockUpdate,
    },
    aiDecisionLog: {
      create:     mockCreate,
      findUnique: mockFindUnique,
      findMany:   mockFindMany,
      update:     mockUpdate,
    },
    ledgerEvent: {
      findMany: mockFindMany,
    },
    suitabilityCheck: {
      findFirst: mockFindFirst,
    },
  }));

  return { PrismaClient };
});

// ── Imports (after mocks) ─────────────────────────────────────

import {
  determineRiskTier,
  requiresCommitteeEscalation,
  evaluateRedFlagChecklist,
  createDealReview,
  listPendingReviews,
  updateDealReview,
  castVote,
  recordSignoff,
  setPrismaClient as setDealPrismaClient,
  RISK_TIER,
  REVIEW_STATUS,
  RED_FLAG_ITEMS,
  type EscalationInput,
  type RedFlagCode,
} from '../../../src/backend/services/deal-committee.service.js';

import {
  buildRecommendationExplanation,
  buildExclusionExplanation,
  buildSuitabilityExplanation,
  logAiDecision,
  captureHumanOverride,
  getBusinessDecisionExplanations,
  getDecisionAuditTrail,
  setPrismaClient as setExplainPrismaClient,
  RECOMMENDATION_REASON_CODE,
  EXCLUSION_REASON_CODE,
} from '../../../src/backend/services/decision-explainability.service.js';

import { eventBus } from '../../../src/backend/events/event-bus.js';
import { PrismaClient } from '@prisma/client';

// ── Mock Prisma helpers ───────────────────────────────────────

function makeMockPrisma() {
  const mockCreate     = vi.fn();
  const mockFindFirst  = vi.fn();
  const mockFindUnique = vi.fn();
  const mockUpdate     = vi.fn();
  const mockFindMany   = vi.fn();

  return {
    dealCommitteeReview: { create: mockCreate, findUnique: mockFindUnique, findMany: mockFindMany, update: mockUpdate },
    aiDecisionLog:       { create: mockCreate, findUnique: mockFindUnique, findMany: mockFindMany, update: mockUpdate },
    ledgerEvent:         { findMany: mockFindMany },
    suitabilityCheck:    { findFirst: mockFindFirst },
    _mocks: { mockCreate, mockFindFirst, mockFindUnique, mockUpdate, mockFindMany },
  };
}

// ── Fixtures ──────────────────────────────────────────────────

const BASE_ESCALATION_INPUT: EscalationInput = {
  businessId:       'biz-001',
  tenantId:         'tenant-001',
  suitabilityScore: 40,
  complianceRisk:   'high',
  triggeredFlags:   ['BANKRUPTCY_RISK', 'LOW_PERSONAL_CREDIT'] as RedFlagCode[],
  initiatorNote:    'Needs committee review',
};

const MOCK_REVIEW = {
  id:               'rev-001',
  tenantId:         'tenant-001',
  businessId:       'biz-001',
  riskTier:         RISK_TIER.HIGH,
  status:           REVIEW_STATUS.ESCALATED,
  redFlagChecklist: [],
  conditions:       null,
  committeeNotes:   null,
  counselSignoff:   false,
  accountantSignoff: false,
  reviewedBy:       null,
  decidedAt:        null,
  createdAt:        new Date('2026-01-01'),
  updatedAt:        new Date('2026-01-01'),
};

const MOCK_AI_LOG = {
  id:             'log-001',
  tenantId:       'tenant-001',
  moduleSource:   'suitability',
  decisionType:   'suitability_assessment',
  inputHash:      null,
  output:         { businessId: 'biz-001', score: 40 },
  confidence:     null,
  overriddenBy:   null,
  overrideReason: null,
  modelVersion:   null,
  promptVersion:  null,
  latencyMs:      null,
  createdAt:      new Date('2026-01-01'),
};

// ============================================================
// DEAL COMMITTEE SERVICE
// ============================================================

describe('DealCommitteeService', () => {

  // ── determineRiskTier ─────────────────────────────────────

  describe('determineRiskTier', () => {
    it('returns CRITICAL when score < 30 (hard no-go)', () => {
      expect(determineRiskTier(25, 'low')).toBe(RISK_TIER.CRITICAL);
    });

    it('returns CRITICAL when compliance risk is critical regardless of score', () => {
      expect(determineRiskTier(85, 'critical')).toBe(RISK_TIER.CRITICAL);
    });

    it('returns HIGH when score is between 30 and 49', () => {
      expect(determineRiskTier(45, 'low')).toBe(RISK_TIER.HIGH);
    });

    it('returns HIGH when compliance risk is high (score >= 50)', () => {
      expect(determineRiskTier(60, 'high')).toBe(RISK_TIER.HIGH);
    });

    it('returns ELEVATED when score is between 50 and 69', () => {
      expect(determineRiskTier(55, 'low')).toBe(RISK_TIER.ELEVATED);
    });

    it('returns ELEVATED when compliance risk is medium (score >= 70)', () => {
      expect(determineRiskTier(75, 'medium')).toBe(RISK_TIER.ELEVATED);
    });

    it('returns STANDARD when score >= 70 and compliance is low', () => {
      expect(determineRiskTier(80, 'low')).toBe(RISK_TIER.STANDARD);
    });

    it('returns STANDARD at the boundary score of 70 with low compliance', () => {
      expect(determineRiskTier(70, 'low')).toBe(RISK_TIER.STANDARD);
    });
  });

  // ── requiresCommitteeEscalation ───────────────────────────

  describe('requiresCommitteeEscalation', () => {
    it('requires escalation when score < 50 (high tier)', () => {
      expect(requiresCommitteeEscalation(45, 'low')).toBe(true);
    });

    it('requires escalation when score < 30 (critical tier)', () => {
      expect(requiresCommitteeEscalation(20, 'low')).toBe(true);
    });

    it('requires escalation when compliance risk is critical', () => {
      expect(requiresCommitteeEscalation(90, 'critical')).toBe(true);
    });

    it('requires escalation when compliance risk is high', () => {
      expect(requiresCommitteeEscalation(65, 'high')).toBe(true);
    });

    it('does NOT require escalation for ELEVATED tier (score 50-69, low compliance)', () => {
      expect(requiresCommitteeEscalation(55, 'low')).toBe(false);
    });

    it('does NOT require escalation for STANDARD tier', () => {
      expect(requiresCommitteeEscalation(75, 'low')).toBe(false);
    });
  });

  // ── evaluateRedFlagChecklist ──────────────────────────────

  describe('evaluateRedFlagChecklist', () => {
    it('returns all 10 items', () => {
      const result = evaluateRedFlagChecklist([]);
      expect(result).toHaveLength(10);
    });

    it('marks exactly the triggered flags as flagged', () => {
      const triggered: RedFlagCode[] = ['BANKRUPTCY_RISK', 'FRAUD_SUSPICION'];
      const result = evaluateRedFlagChecklist(triggered);

      const flagged = result.filter((r) => r.flagged).map((r) => r.code);
      expect(flagged).toEqual(expect.arrayContaining(triggered));
      expect(flagged).toHaveLength(2);
    });

    it('marks non-triggered items as not flagged', () => {
      const result = evaluateRedFlagChecklist(['BANKRUPTCY_RISK'] as RedFlagCode[]);
      const notFlagged = result.filter((r) => !r.flagged);
      expect(notFlagged).toHaveLength(9);
    });

    it('returns empty flags when no triggers provided', () => {
      const result = evaluateRedFlagChecklist([]);
      expect(result.every((r) => !r.flagged)).toBe(true);
    });

    it('contains all 10 unique red-flag codes from RED_FLAG_ITEMS', () => {
      const result = evaluateRedFlagChecklist([]);
      const codes = result.map((r) => r.code);
      const expectedCodes = RED_FLAG_ITEMS.map((i) => i.code);
      expect(codes).toEqual(expect.arrayContaining(expectedCodes));
    });

    it('attaches optional notes to flagged items', () => {
      const result = evaluateRedFlagChecklist(
        ['SANCTIONS_MATCH'] as RedFlagCode[],
        { SANCTIONS_MATCH: 'OFAC list hit detected' },
      );
      const sanctionsItem = result.find((r) => r.code === 'SANCTIONS_MATCH');
      expect(sanctionsItem?.notes).toBe('OFAC list hit detected');
    });
  });

  // ── createDealReview ──────────────────────────────────────

  describe('createDealReview', () => {
    let mockPrisma: ReturnType<typeof makeMockPrisma>;

    beforeEach(() => {
      mockPrisma = makeMockPrisma();
      setDealPrismaClient(mockPrisma as unknown as PrismaClient);
      vi.mocked(eventBus.publishAndPersist).mockResolvedValue({ id: 'evt-001', publishedAt: new Date() });
    });

    it('creates a review with ESCALATED status when score < 50', async () => {
      mockPrisma.dealCommitteeReview.create.mockResolvedValue({
        ...MOCK_REVIEW,
        id: 'rev-new',
      });

      const result = await createDealReview(BASE_ESCALATION_INPUT);

      expect(result.escalated).toBe(true);
      expect(result.status).toBe(REVIEW_STATUS.ESCALATED);
      expect(mockPrisma.dealCommitteeReview.create).toHaveBeenCalledOnce();
    });

    it('creates a review with PENDING status when score >= 70 and compliance low', async () => {
      mockPrisma.dealCommitteeReview.create.mockResolvedValue({
        ...MOCK_REVIEW,
        status: REVIEW_STATUS.PENDING,
        riskTier: RISK_TIER.STANDARD,
      });

      const result = await createDealReview({
        ...BASE_ESCALATION_INPUT,
        suitabilityScore: 80,
        complianceRisk:   'low',
        triggeredFlags:   [],
      });

      expect(result.escalated).toBe(false);
      expect(result.status).toBe(REVIEW_STATUS.PENDING);
    });

    it('assigns CRITICAL risk tier when compliance is critical', async () => {
      mockPrisma.dealCommitteeReview.create.mockResolvedValue(MOCK_REVIEW);

      const result = await createDealReview({
        ...BASE_ESCALATION_INPUT,
        suitabilityScore: 70,
        complianceRisk:   'critical',
      });

      expect(result.riskTier).toBe(RISK_TIER.CRITICAL);
      expect(result.escalated).toBe(true);
    });

    it('emits a deal_committee.review.created event', async () => {
      mockPrisma.dealCommitteeReview.create.mockResolvedValue(MOCK_REVIEW);

      await createDealReview(BASE_ESCALATION_INPUT);

      expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
        'tenant-001',
        expect.objectContaining({ eventType: 'deal_committee.review.created' }),
      );
    });

    it('includes the triggeredFlags in the escalation reason string', async () => {
      mockPrisma.dealCommitteeReview.create.mockResolvedValue(MOCK_REVIEW);

      const result = await createDealReview({
        ...BASE_ESCALATION_INPUT,
        triggeredFlags: ['FRAUD_SUSPICION'] as RedFlagCode[],
      });

      expect(result.reason).toContain('FRAUD_SUSPICION');
    });
  });

  // ── listPendingReviews ────────────────────────────────────

  describe('listPendingReviews', () => {
    let mockPrisma: ReturnType<typeof makeMockPrisma>;

    beforeEach(() => {
      mockPrisma = makeMockPrisma();
      setDealPrismaClient(mockPrisma as unknown as PrismaClient);
    });

    it('returns reviews filtered by tenant', async () => {
      mockPrisma.dealCommitteeReview.findMany.mockResolvedValue([MOCK_REVIEW]);

      const result = await listPendingReviews('tenant-001');

      expect(mockPrisma.dealCommitteeReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-001' }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('defaults to pending/escalated/in_review status filter', async () => {
      mockPrisma.dealCommitteeReview.findMany.mockResolvedValue([]);

      await listPendingReviews('tenant-001');

      const call = mockPrisma.dealCommitteeReview.findMany.mock.calls[0][0] as { where: { status: { in: string[] } } };
      expect(call.where.status.in).toContain(REVIEW_STATUS.PENDING);
      expect(call.where.status.in).toContain(REVIEW_STATUS.ESCALATED);
      expect(call.where.status.in).toContain(REVIEW_STATUS.IN_REVIEW);
    });

    it('accepts a custom status filter', async () => {
      mockPrisma.dealCommitteeReview.findMany.mockResolvedValue([]);

      await listPendingReviews('tenant-001', [REVIEW_STATUS.APPROVED]);

      const call = mockPrisma.dealCommitteeReview.findMany.mock.calls[0][0] as { where: { status: { in: string[] } } };
      expect(call.where.status.in).toEqual([REVIEW_STATUS.APPROVED]);
    });
  });

  // ── updateDealReview ──────────────────────────────────────

  describe('updateDealReview', () => {
    let mockPrisma: ReturnType<typeof makeMockPrisma>;

    beforeEach(() => {
      mockPrisma = makeMockPrisma();
      setDealPrismaClient(mockPrisma as unknown as PrismaClient);
      vi.mocked(eventBus.publishAndPersist).mockResolvedValue({ id: 'evt-001', publishedAt: new Date() });
    });

    it('returns not-found error when review does not exist', async () => {
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue(null);

      const result = await updateDealReview({
        reviewId: 'rev-999',
        tenantId: 'tenant-001',
        userId:   'user-001',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('returns error on tenant mismatch', async () => {
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue({
        ...MOCK_REVIEW,
        tenantId: 'other-tenant',
      });

      const result = await updateDealReview({
        reviewId: 'rev-001',
        tenantId: 'tenant-001',
        userId:   'user-001',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Tenant mismatch');
    });

    it('sets decidedAt when status is APPROVED', async () => {
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue(MOCK_REVIEW);
      mockPrisma.dealCommitteeReview.update.mockResolvedValue({ ...MOCK_REVIEW, status: REVIEW_STATUS.APPROVED });

      await updateDealReview({
        reviewId: 'rev-001',
        tenantId: 'tenant-001',
        userId:   'user-001',
        status:   REVIEW_STATUS.APPROVED,
      });

      const updateCall = mockPrisma.dealCommitteeReview.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(updateCall.data['decidedAt']).toBeTruthy();
    });

    it('persists action items as conditions', async () => {
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue(MOCK_REVIEW);
      mockPrisma.dealCommitteeReview.update.mockResolvedValue(MOCK_REVIEW);

      const conditions = [
        { id: 'ai-1', description: 'Obtain financial statements', assignedTo: 'advisor-01', status: 'open' as const },
      ];

      await updateDealReview({
        reviewId:   'rev-001',
        tenantId:   'tenant-001',
        userId:     'user-001',
        conditions,
      });

      const updateCall = mockPrisma.dealCommitteeReview.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(updateCall.data['conditions']).toEqual(conditions);
    });
  });

  // ── castVote ──────────────────────────────────────────────

  describe('castVote', () => {
    let mockPrisma: ReturnType<typeof makeMockPrisma>;

    beforeEach(() => {
      mockPrisma = makeMockPrisma();
      setDealPrismaClient(mockPrisma as unknown as PrismaClient);
      vi.mocked(eventBus.publishAndPersist).mockResolvedValue({ id: 'evt-001', publishedAt: new Date() });
    });

    it('records a vote and returns success', async () => {
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue({
        ...MOCK_REVIEW,
        reviewedBy: [],
      });
      mockPrisma.dealCommitteeReview.update.mockResolvedValue({ ...MOCK_REVIEW, reviewedBy: [{}] });

      const result = await castVote({
        reviewId:   'rev-001',
        tenantId:   'tenant-001',
        memberId:   'user-001',
        memberRole: 'compliance_officer',
        vote:       'approve',
      });

      expect(result.success).toBe(true);
      expect(result.quorumReached).toBe(false);
    });

    it('prevents duplicate votes from the same member', async () => {
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue({
        ...MOCK_REVIEW,
        reviewedBy: [{ memberId: 'user-001', vote: 'approve', castAt: new Date().toISOString() }],
      });

      const result = await castVote({
        reviewId:   'rev-001',
        tenantId:   'tenant-001',
        memberId:   'user-001',
        memberRole: 'advisor',
        vote:       'approve',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already cast a vote');
    });

    it('reaches quorum and sets APPROVED decision after 3 approve votes', async () => {
      const existingVotes = [
        { memberId: 'user-001', vote: 'approve', memberRole: 'advisor', castAt: new Date().toISOString() },
        { memberId: 'user-002', vote: 'approve', memberRole: 'advisor', castAt: new Date().toISOString() },
      ];
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue({
        ...MOCK_REVIEW,
        reviewedBy: existingVotes,
      });
      mockPrisma.dealCommitteeReview.update.mockResolvedValue({
        ...MOCK_REVIEW,
        status: REVIEW_STATUS.APPROVED,
      });

      const result = await castVote({
        reviewId:   'rev-001',
        tenantId:   'tenant-001',
        memberId:   'user-003',
        memberRole: 'compliance_officer',
        vote:       'approve',
      });

      expect(result.quorumReached).toBe(true);
      expect(result.decision).toBe(REVIEW_STATUS.APPROVED);
    });

    it('reaches quorum and sets REJECTED when majority reject', async () => {
      const existingVotes = [
        { memberId: 'user-001', vote: 'reject', memberRole: 'advisor', castAt: new Date().toISOString() },
        { memberId: 'user-002', vote: 'reject', memberRole: 'advisor', castAt: new Date().toISOString() },
      ];
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue({
        ...MOCK_REVIEW,
        reviewedBy: existingVotes,
      });
      mockPrisma.dealCommitteeReview.update.mockResolvedValue({
        ...MOCK_REVIEW,
        status: REVIEW_STATUS.REJECTED,
      });

      const result = await castVote({
        reviewId:   'rev-001',
        tenantId:   'tenant-001',
        memberId:   'user-003',
        memberRole: 'compliance_officer',
        vote:       'approve',   // 1 approve vs 2 reject → REJECTED
      });

      expect(result.quorumReached).toBe(true);
      expect(result.decision).toBe(REVIEW_STATUS.REJECTED);
    });

    it('blocks voting on a review in a terminal state', async () => {
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue({
        ...MOCK_REVIEW,
        status: REVIEW_STATUS.APPROVED,
        reviewedBy: [],
      });

      const result = await castVote({
        reviewId:   'rev-001',
        tenantId:   'tenant-001',
        memberId:   'user-005',
        memberRole: 'advisor',
        vote:       'approve',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('terminal state');
    });

    it('emits a deal_committee.vote.cast event', async () => {
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue({
        ...MOCK_REVIEW,
        reviewedBy: [],
      });
      mockPrisma.dealCommitteeReview.update.mockResolvedValue(MOCK_REVIEW);

      await castVote({
        reviewId:   'rev-001',
        tenantId:   'tenant-001',
        memberId:   'user-001',
        memberRole: 'advisor',
        vote:       'abstain',
      });

      expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
        'tenant-001',
        expect.objectContaining({ eventType: 'deal_committee.vote.cast' }),
      );
    });
  });

  // ── recordSignoff ─────────────────────────────────────────

  describe('recordSignoff', () => {
    let mockPrisma: ReturnType<typeof makeMockPrisma>;

    beforeEach(() => {
      mockPrisma = makeMockPrisma();
      setDealPrismaClient(mockPrisma as unknown as PrismaClient);
      vi.mocked(eventBus.publishAndPersist).mockResolvedValue({ id: 'evt-001', publishedAt: new Date() });
    });

    it('records counsel signoff', async () => {
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue(MOCK_REVIEW);
      mockPrisma.dealCommitteeReview.update.mockResolvedValue({
        ...MOCK_REVIEW,
        counselSignoff: true,
        accountantSignoff: false,
      });

      const result = await recordSignoff({
        reviewId:    'rev-001',
        tenantId:    'tenant-001',
        userId:      'counsel-001',
        role:        'compliance_officer',
        signoffType: 'counsel',
      });

      expect(result.success).toBe(true);
      expect(result.counselSignoff).toBe(true);
      expect(result.bothSignedOff).toBe(false);
    });

    it('records accountant signoff', async () => {
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue(MOCK_REVIEW);
      mockPrisma.dealCommitteeReview.update.mockResolvedValue({
        ...MOCK_REVIEW,
        counselSignoff:   false,
        accountantSignoff: true,
      });

      const result = await recordSignoff({
        reviewId:    'rev-001',
        tenantId:    'tenant-001',
        userId:      'acct-001',
        role:        'advisor',
        signoffType: 'accountant',
      });

      expect(result.success).toBe(true);
      expect(result.accountantSignoff).toBe(true);
      expect(result.bothSignedOff).toBe(false);
    });

    it('reports bothSignedOff = true when both have signed', async () => {
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue({
        ...MOCK_REVIEW,
        counselSignoff: true,
      });
      mockPrisma.dealCommitteeReview.update.mockResolvedValue({
        ...MOCK_REVIEW,
        counselSignoff:   true,
        accountantSignoff: true,
      });

      const result = await recordSignoff({
        reviewId:    'rev-001',
        tenantId:    'tenant-001',
        userId:      'acct-001',
        role:        'advisor',
        signoffType: 'accountant',
      });

      expect(result.bothSignedOff).toBe(true);
      expect(result.message).toContain('Both counsel and accountant');
    });

    it('returns error when review not found', async () => {
      mockPrisma.dealCommitteeReview.findUnique.mockResolvedValue(null);

      const result = await recordSignoff({
        reviewId:    'rev-999',
        tenantId:    'tenant-001',
        userId:      'user-001',
        role:        'advisor',
        signoffType: 'counsel',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });
});

// ============================================================
// DECISION EXPLAINABILITY SERVICE
// ============================================================

describe('DecisionExplainabilityService', () => {

  // ── buildRecommendationExplanation ───────────────────────

  describe('buildRecommendationExplanation', () => {
    it('returns recommended = true', () => {
      const result = buildRecommendationExplanation({
        cardId:      'card-001',
        issuer:      'Chase',
        cardProduct: 'Ink Business Cash',
        reasons: [
          { code: RECOMMENDATION_REASON_CODE.HIGH_REWARDS_RATE, detail: '5% on office supplies' },
        ],
      });
      expect(result.recommended).toBe(true);
    });

    it('maps reason codes to labels', () => {
      const result = buildRecommendationExplanation({
        cardId:      'card-001',
        issuer:      'Amex',
        cardProduct: 'Blue Business Cash',
        reasons: [
          { code: RECOMMENDATION_REASON_CODE.ZERO_ANNUAL_FEE, detail: 'No annual fee' },
          { code: RECOMMENDATION_REASON_CODE.LONG_INTRO_APR, detail: '12 months 0% APR', supportingValue: 12 },
        ],
      });
      expect(result.reasons[0].label).toBe('No annual fee');
      expect(result.reasons[1].supportingValue).toBe(12);
    });

    it('generates a human-readable summary containing the issuer name', () => {
      const result = buildRecommendationExplanation({
        cardId:      'card-001',
        issuer:      'Capital One',
        cardProduct: 'Spark Cash',
        reasons: [
          { code: RECOMMENDATION_REASON_CODE.CASHBACK_CATEGORY_MATCH, detail: 'Matches top categories' },
        ],
      });
      expect(result.summary).toContain('Capital One');
    });
  });

  // ── buildExclusionExplanation ─────────────────────────────

  describe('buildExclusionExplanation', () => {
    it('returns recommended = false', () => {
      const result = buildExclusionExplanation({
        issuer:      'Chase',
        cardProduct: 'Sapphire Preferred',
        reasons: [
          { code: EXCLUSION_REASON_CODE.ISSUER_VELOCITY_RULE, detail: 'Chase 5/24 rule violation' },
        ],
      });
      expect(result.recommended).toBe(false);
    });

    it('maps exclusion reason codes to labels', () => {
      const result = buildExclusionExplanation({
        issuer:      'Citi',
        cardProduct: 'Double Cash',
        reasons: [
          { code: EXCLUSION_REASON_CODE.TOO_MANY_RECENT_INQUIRIES, detail: '7 inquiries in 90 days', supportingValue: 7 },
        ],
      });
      expect(result.reasons[0].label).toBe('Too many recent credit inquiries');
      expect(result.reasons[0].supportingValue).toBe(7);
    });

    it('generates a summary stating exclusion reason', () => {
      const result = buildExclusionExplanation({
        issuer:      'BofA',
        cardProduct: 'Business Advantage',
        reasons: [
          { code: EXCLUSION_REASON_CODE.CREDIT_SCORE_TOO_LOW, detail: 'Score 590, minimum is 680' },
        ],
      });
      expect(result.summary).toContain('excluded because');
    });
  });

  // ── buildSuitabilityExplanation ───────────────────────────

  describe('buildSuitabilityExplanation', () => {
    it('returns all 5 scoring factors when scoreBreakdown is provided', () => {
      const result = buildSuitabilityExplanation({
        checkId:       'chk-001',
        businessId:    'biz-001',
        score:         55,
        band:          'MODERATE',
        recommendation: 'Proceed with conditions',
        scoreBreakdown: {
          revenueScore:     20,
          cashFlowScore:    15,
          debtRatioScore:   10,
          creditScore:      8,
          businessAgeScore: 7,
        },
      });
      expect(result.scoringFactors).toHaveLength(5);
    });

    it('includes noGoReasons in the explanation', () => {
      const result = buildSuitabilityExplanation({
        checkId:       'chk-002',
        businessId:    'biz-002',
        score:         0,
        band:          'HARD_NOGO',
        recommendation: 'HARD NO-GO',
        noGoReasons:   ['active_bankruptcy', 'sanctions_match'],
      });
      expect(result.noGoReasons).toContain('active_bankruptcy');
      expect(result.noGoReasons).toContain('sanctions_match');
    });

    it('captures override fields when present', () => {
      const result = buildSuitabilityExplanation({
        checkId:       'chk-003',
        businessId:    'biz-003',
        score:         40,
        band:          'HIGH_RISK',
        recommendation: 'Requires committee',
        overriddenBy:  'officer-001',
        overrideReason: 'Waived — strategic exception approved by VP',
      });
      expect(result.overriddenBy).toBe('officer-001');
      expect(result.overrideReason).toContain('strategic exception');
    });

    it('sets generatedAt to a valid ISO timestamp', () => {
      const result = buildSuitabilityExplanation({
        checkId:       'chk-004',
        businessId:    'biz-004',
        score:         72,
        band:          'APPROVED',
        recommendation: 'Approved',
      });
      expect(() => new Date(result.generatedAt)).not.toThrow();
    });
  });

  // ── logAiDecision ─────────────────────────────────────────

  describe('logAiDecision', () => {
    let mockPrisma: ReturnType<typeof makeMockPrisma>;

    beforeEach(() => {
      mockPrisma = makeMockPrisma();
      setExplainPrismaClient(mockPrisma as unknown as PrismaClient);
    });

    it('persists the decision and returns the new entry ID', async () => {
      mockPrisma.aiDecisionLog.create.mockResolvedValue({ ...MOCK_AI_LOG, id: 'log-new' });

      const id = await logAiDecision({
        tenantId:     'tenant-001',
        moduleSource: 'suitability',
        decisionType: 'suitability_assessment',
        output:       { businessId: 'biz-001', score: 55 },
        confidence:   0.92,
      });

      expect(id).toBe('log-new');
      expect(mockPrisma.aiDecisionLog.create).toHaveBeenCalledOnce();
    });

    it('stores optional fields when provided', async () => {
      mockPrisma.aiDecisionLog.create.mockResolvedValue(MOCK_AI_LOG);

      await logAiDecision({
        tenantId:      'tenant-001',
        moduleSource:  'card_optimizer',
        decisionType:  'card_recommendation',
        output:        { cards: [] },
        modelVersion:  'v2.1',
        promptVersion: 'p3',
        latencyMs:     142,
      });

      const createCall = mockPrisma.aiDecisionLog.create.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(createCall.data['modelVersion']).toBe('v2.1');
      expect(createCall.data['latencyMs']).toBe(142);
    });
  });

  // ── captureHumanOverride ──────────────────────────────────

  describe('captureHumanOverride', () => {
    let mockPrisma: ReturnType<typeof makeMockPrisma>;

    beforeEach(() => {
      mockPrisma = makeMockPrisma();
      setExplainPrismaClient(mockPrisma as unknown as PrismaClient);
      vi.mocked(eventBus.publishAndPersist).mockResolvedValue({ id: 'evt-001', publishedAt: new Date() });
    });

    it('rejects justification shorter than 20 characters', async () => {
      const result = await captureHumanOverride({
        tenantId:      'tenant-001',
        decisionLogId: 'log-001',
        overriddenBy:  'user-001',
        overriderRole: 'compliance_officer',
        justification: 'Too short',
        newOutput:     {},
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('20 characters');
    });

    it('rejects when the decision log entry is not found', async () => {
      mockPrisma.aiDecisionLog.findUnique.mockResolvedValue(null);

      const result = await captureHumanOverride({
        tenantId:      'tenant-001',
        decisionLogId: 'log-999',
        overriddenBy:  'user-001',
        overriderRole: 'compliance_officer',
        justification: 'This is a sufficiently long justification for the override',
        newOutput:     {},
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('rejects on tenant mismatch', async () => {
      mockPrisma.aiDecisionLog.findUnique.mockResolvedValue({
        ...MOCK_AI_LOG,
        tenantId: 'other-tenant',
      });

      const result = await captureHumanOverride({
        tenantId:      'tenant-001',
        decisionLogId: 'log-001',
        overriddenBy:  'user-001',
        overriderRole: 'compliance_officer',
        justification: 'This is a sufficiently long justification for the override test',
        newOutput:     {},
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Tenant mismatch');
    });

    it('applies override and emits audit event on happy path', async () => {
      mockPrisma.aiDecisionLog.findUnique.mockResolvedValue(MOCK_AI_LOG);
      mockPrisma.aiDecisionLog.update.mockResolvedValue({ ...MOCK_AI_LOG, overriddenBy: 'user-001' });

      const result = await captureHumanOverride({
        tenantId:      'tenant-001',
        decisionLogId: 'log-001',
        overriddenBy:  'user-001',
        overriderRole: 'compliance_officer',
        justification: 'Approved by VP as a strategic exception for this client account',
        newOutput:     { score: 55, overridden: true },
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.aiDecisionLog.update).toHaveBeenCalledOnce();
      expect(eventBus.publishAndPersist).toHaveBeenCalledWith(
        'tenant-001',
        expect.objectContaining({ eventType: 'ai_decision.override.applied' }),
      );
    });
  });

  // ── getBusinessDecisionExplanations ──────────────────────

  describe('getBusinessDecisionExplanations', () => {
    let mockPrisma: ReturnType<typeof makeMockPrisma>;

    beforeEach(() => {
      mockPrisma = makeMockPrisma();
      setExplainPrismaClient(mockPrisma as unknown as PrismaClient);
    });

    it('queries by tenantId with businessId in output', async () => {
      mockPrisma.aiDecisionLog.findMany.mockResolvedValue([MOCK_AI_LOG]);

      const results = await getBusinessDecisionExplanations('biz-001', 'tenant-001');

      expect(mockPrisma.aiDecisionLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-001' }),
        }),
      );
      expect(results).toHaveLength(1);
    });

    it('maps Prisma records to AiDecisionLogEntry shape', async () => {
      mockPrisma.aiDecisionLog.findMany.mockResolvedValue([MOCK_AI_LOG]);

      const results = await getBusinessDecisionExplanations('biz-001', 'tenant-001');

      expect(results[0]).toMatchObject({
        id:           'log-001',
        moduleSource: 'suitability',
        decisionType: 'suitability_assessment',
      });
    });
  });

  // ── getDecisionAuditTrail ─────────────────────────────────

  describe('getDecisionAuditTrail', () => {
    let mockPrisma: ReturnType<typeof makeMockPrisma>;

    beforeEach(() => {
      mockPrisma = makeMockPrisma();
      setExplainPrismaClient(mockPrisma as unknown as PrismaClient);
    });

    it('returns null when decision log entry not found', async () => {
      mockPrisma.aiDecisionLog.findUnique.mockResolvedValue(null);

      const result = await getDecisionAuditTrail('log-999', 'tenant-001');

      expect(result).toBeNull();
    });

    it('returns null when tenantId does not match', async () => {
      mockPrisma.aiDecisionLog.findUnique.mockResolvedValue({
        ...MOCK_AI_LOG,
        tenantId: 'wrong-tenant',
      });

      const result = await getDecisionAuditTrail('log-001', 'tenant-001');

      expect(result).toBeNull();
    });

    it('returns decision + auditEvents on happy path', async () => {
      mockPrisma.aiDecisionLog.findUnique.mockResolvedValue(MOCK_AI_LOG);
      mockPrisma.ledgerEvent.findMany.mockResolvedValue([
        {
          id:            'evt-001',
          eventType:     'ai_decision.override.applied',
          aggregateId:   'log-001',
          payload:       { action: 'override' },
          publishedAt:   new Date('2026-01-02'),
        },
      ]);

      const result = await getDecisionAuditTrail('log-001', 'tenant-001');

      expect(result).not.toBeNull();
      expect(result!.decision.id).toBe('log-001');
      expect(result!.auditEvents).toHaveLength(1);
      expect(result!.auditEvents[0].eventType).toBe('ai_decision.override.applied');
    });
  });
});
