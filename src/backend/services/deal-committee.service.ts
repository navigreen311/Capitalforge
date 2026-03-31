// ============================================================
// CapitalForge — Deal Committee Workspace
//
// Responsibilities:
//   1. Risk-tiered deal escalation routing
//      - Auto-escalate when suitability score < 50 (HIGH_RISK / HARD_NOGO)
//      - Auto-escalate when compliance risk level is "high" or "critical"
//   2. 10-item red-flag checklist evaluation
//   3. Conditional approval with action-item tracking
//   4. Counsel and accountant signoff workflows
//   5. Committee member voting (approve / reject / abstain)
//   6. Emit DEAL_COMMITTEE_* ledger events
// ============================================================

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES, RISK_THRESHOLDS, ROLES } from '@shared/constants/index.js';
import type { RiskLevel } from '@shared/types/index.js';
import logger from '../config/logger.js';

// ── Prisma singleton ──────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

// ── Risk Tiers ────────────────────────────────────────────────

export const RISK_TIER = {
  STANDARD:   'standard',    // score >= 70, compliance low/medium  → advisor-level approval
  ELEVATED:   'elevated',    // score 50–69, compliance medium       → senior advisor review
  HIGH:       'high',        // score 30–49, compliance high         → committee required
  CRITICAL:   'critical',    // score < 30 or compliance critical    → committee + counsel
} as const;

export type RiskTier = (typeof RISK_TIER)[keyof typeof RISK_TIER];

// ── Committee Review Status ───────────────────────────────────

export const REVIEW_STATUS = {
  PENDING:              'pending',
  IN_REVIEW:            'in_review',
  APPROVED:             'approved',
  APPROVED_CONDITIONAL: 'approved_conditional',
  REJECTED:             'rejected',
  ESCALATED:            'escalated',
} as const;

export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];

// ── 10-Item Red-Flag Checklist ────────────────────────────────

export const RED_FLAG_ITEMS = [
  {
    id:   'rf_01',
    name: 'Active or recent bankruptcy (within 7 years)',
    code: 'BANKRUPTCY_RISK',
  },
  {
    id:   'rf_02',
    name: 'OFAC / sanctions match on any owner or entity',
    code: 'SANCTIONS_MATCH',
  },
  {
    id:   'rf_03',
    name: 'Debt-to-monthly-revenue ratio exceeds 12×',
    code: 'EXCESSIVE_DEBT_RATIO',
  },
  {
    id:   'rf_04',
    name: 'Negative monthly cash flow for 3+ consecutive months',
    code: 'NEGATIVE_CASH_FLOW',
  },
  {
    id:   'rf_05',
    name: 'FICO below 620 on any guaranteeing owner',
    code: 'LOW_PERSONAL_CREDIT',
  },
  {
    id:   'rf_06',
    name: 'Business operating less than 6 months',
    code: 'BUSINESS_TOO_YOUNG',
  },
  {
    id:   'rf_07',
    name: 'Fraud suspicion flagged by compliance engine',
    code: 'FRAUD_SUSPICION',
  },
  {
    id:   'rf_08',
    name: 'Industry classified as high-risk (gambling, adult, cannabis, crypto)',
    code: 'HIGH_RISK_INDUSTRY',
  },
  {
    id:   'rf_09',
    name: 'Personal guarantee not obtainable from majority owner',
    code: 'NO_PERSONAL_GUARANTEE',
  },
  {
    id:   'rf_10',
    name: 'Prior default or charge-off with a stacking issuer within 24 months',
    code: 'PRIOR_ISSUER_DEFAULT',
  },
] as const;

export type RedFlagCode = (typeof RED_FLAG_ITEMS)[number]['code'];

export interface RedFlagChecklistResult {
  itemId:     string;
  name:       string;
  code:       RedFlagCode;
  flagged:    boolean;
  notes?:     string;
}

// ── Action Item (conditional approval) ───────────────────────

export interface ActionItem {
  id:           string;
  description:  string;
  assignedTo?:  string;
  dueDate?:     string;     // ISO date string
  completedAt?: string;
  status:       'open' | 'completed' | 'waived';
}

// ── Vote ──────────────────────────────────────────────────────

export interface CommitteeVote {
  memberId:   string;
  memberRole: string;
  vote:       'approve' | 'reject' | 'abstain';
  comment?:   string;
  castAt:     string;   // ISO timestamp
}

// ── Input types ───────────────────────────────────────────────

export interface EscalationInput {
  businessId:       string;
  tenantId:         string;
  suitabilityScore: number;
  complianceRisk:   RiskLevel;
  /** Specific red-flag codes that are known to be triggered */
  triggeredFlags:   RedFlagCode[];
  /** Optional manual note from the initiating advisor */
  initiatorNote?:   string;
}

export interface EscalationResult {
  reviewId:  string;
  riskTier:  RiskTier;
  status:    ReviewStatus;
  escalated: boolean;
  reason:    string;
}

export interface SignoffRequest {
  reviewId:  string;
  tenantId:  string;
  userId:    string;
  role:      string;
  signoffType: 'counsel' | 'accountant';
  notes?:    string;
}

export interface VoteRequest {
  reviewId:  string;
  tenantId:  string;
  memberId:  string;
  memberRole: string;
  vote:      'approve' | 'reject' | 'abstain';
  comment?:  string;
}

export interface UpdateReviewRequest {
  reviewId:        string;
  tenantId:        string;
  userId:          string;
  committeeNotes?: string;
  conditions?:     ActionItem[];
  status?:         ReviewStatus;
}

// ── Core helpers ──────────────────────────────────────────────

/**
 * Determine the risk tier from suitability score + compliance risk level.
 */
export function determineRiskTier(
  suitabilityScore: number,
  complianceRisk:   RiskLevel,
): RiskTier {
  // Critical tier: hard no-go score or critical compliance
  if (
    suitabilityScore < RISK_THRESHOLDS.SUITABILITY_NOGO ||
    complianceRisk === 'critical'
  ) {
    return RISK_TIER.CRITICAL;
  }

  // High tier: high-risk score band or high compliance risk
  if (
    suitabilityScore < RISK_THRESHOLDS.SUITABILITY_HIGH_RISK ||
    complianceRisk === 'high'
  ) {
    return RISK_TIER.HIGH;
  }

  // Elevated tier: moderate score band or medium compliance risk
  if (
    suitabilityScore < RISK_THRESHOLDS.SUITABILITY_MODERATE ||
    complianceRisk === 'medium'
  ) {
    return RISK_TIER.ELEVATED;
  }

  return RISK_TIER.STANDARD;
}

/**
 * Returns true if the deal requires committee escalation.
 * Triggers on: HIGH / CRITICAL risk tier, OR score < 50, OR compliance is high/critical.
 */
export function requiresCommitteeEscalation(
  suitabilityScore: number,
  complianceRisk:   RiskLevel,
): boolean {
  const tier = determineRiskTier(suitabilityScore, complianceRisk);
  return tier === RISK_TIER.HIGH || tier === RISK_TIER.CRITICAL;
}

/**
 * Evaluate a set of triggered red-flag codes against the full checklist.
 * Returns the full 10-item checklist with flagged/not-flagged status.
 */
export function evaluateRedFlagChecklist(
  triggeredFlags: RedFlagCode[],
  notes?: Partial<Record<RedFlagCode, string>>,
): RedFlagChecklistResult[] {
  const flagSet = new Set(triggeredFlags);
  return RED_FLAG_ITEMS.map((item) => ({
    itemId:  item.id,
    name:    item.name,
    code:    item.code,
    flagged: flagSet.has(item.code),
    notes:   notes?.[item.code],
  }));
}

// ── Service functions ─────────────────────────────────────────

/**
 * Create a DealCommitteeReview for a business.
 * Auto-escalates when suitability score < 50 or compliance risk is high/critical.
 * Persists the review with the initial red-flag checklist and emits an event.
 */
export async function createDealReview(
  input: EscalationInput,
): Promise<EscalationResult> {
  const prisma   = getPrisma();
  const reviewId = uuidv4();

  const riskTier  = determineRiskTier(input.suitabilityScore, input.complianceRisk);
  const escalated = requiresCommitteeEscalation(input.suitabilityScore, input.complianceRisk);
  const status    = escalated ? REVIEW_STATUS.ESCALATED : REVIEW_STATUS.PENDING;

  const checklist = evaluateRedFlagChecklist(input.triggeredFlags);

  const escalationReasons: string[] = [];
  if (input.suitabilityScore < RISK_THRESHOLDS.SUITABILITY_HIGH_RISK) {
    escalationReasons.push(`Suitability score ${input.suitabilityScore} is below 50 threshold`);
  }
  if (input.complianceRisk === 'high' || input.complianceRisk === 'critical') {
    escalationReasons.push(`Compliance risk level is ${input.complianceRisk}`);
  }
  if (input.triggeredFlags.length > 0) {
    escalationReasons.push(`Red flags triggered: ${input.triggeredFlags.join(', ')}`);
  }

  const reason = escalationReasons.length > 0
    ? escalationReasons.join('. ')
    : 'Routine deal review';

  await prisma.dealCommitteeReview.create({
    data: {
      id:              reviewId,
      tenantId:        input.tenantId,
      businessId:      input.businessId,
      riskTier,
      status,
      redFlagChecklist: checklist as unknown as object,
      committeeNotes:  input.initiatorNote ?? null,
      conditions:      null,
      counselSignoff:  false,
      accountantSignoff: false,
      reviewedBy:      null,
      decidedAt:       null,
    },
  });

  await eventBus.publishAndPersist(input.tenantId, {
    eventType:     'deal_committee.review.created',
    aggregateType: AGGREGATE_TYPES.COMPLIANCE,
    aggregateId:   reviewId,
    payload: {
      reviewId,
      businessId:      input.businessId,
      riskTier,
      status,
      escalated,
      suitabilityScore: input.suitabilityScore,
      complianceRisk:   input.complianceRisk,
      triggeredFlags:   input.triggeredFlags,
      reason,
    },
    metadata: { initiatorNote: input.initiatorNote },
  });

  logger.info('[DealCommittee] Review created', {
    reviewId,
    businessId: input.businessId,
    riskTier,
    escalated,
  });

  return { reviewId, riskTier, status, escalated, reason };
}

/**
 * List pending/escalated deal reviews for a tenant.
 */
export async function listPendingReviews(
  tenantId: string,
  statusFilter?: ReviewStatus[],
): Promise<Array<{
  id:              string;
  businessId:      string;
  riskTier:        string;
  status:          string;
  counselSignoff:  boolean;
  accountantSignoff: boolean;
  decidedAt:       Date | null;
  createdAt:       Date;
  updatedAt:       Date;
}>> {
  const prisma = getPrisma();

  const statuses = statusFilter ?? [
    REVIEW_STATUS.PENDING,
    REVIEW_STATUS.ESCALATED,
    REVIEW_STATUS.IN_REVIEW,
  ];

  const reviews = await prisma.dealCommitteeReview.findMany({
    where: {
      tenantId,
      status: { in: statuses },
    },
    orderBy: { createdAt: 'asc' },
  });

  return reviews.map((r: typeof reviews[number]) => ({
    id:               r.id,
    businessId:       r.businessId,
    riskTier:         r.riskTier,
    status:           r.status,
    counselSignoff:   r.counselSignoff,
    accountantSignoff: r.accountantSignoff,
    decidedAt:        r.decidedAt,
    createdAt:        r.createdAt,
    updatedAt:        r.updatedAt,
  }));
}

/**
 * Update a deal review: notes, conditions (action items), status.
 */
export async function updateDealReview(
  req: UpdateReviewRequest,
): Promise<{ success: boolean; message: string }> {
  const prisma = getPrisma();

  const review = await prisma.dealCommitteeReview.findUnique({
    where: { id: req.reviewId },
  });

  if (!review) {
    return { success: false, message: `Review ${req.reviewId} not found.` };
  }

  if (review.tenantId !== req.tenantId) {
    return { success: false, message: 'Tenant mismatch — access denied.' };
  }

  const decidedAt =
    req.status === REVIEW_STATUS.APPROVED ||
    req.status === REVIEW_STATUS.APPROVED_CONDITIONAL ||
    req.status === REVIEW_STATUS.REJECTED
      ? new Date()
      : review.decidedAt;

  await prisma.dealCommitteeReview.update({
    where: { id: req.reviewId },
    data: {
      ...(req.committeeNotes !== undefined && { committeeNotes: req.committeeNotes }),
      ...(req.conditions     !== undefined && { conditions: req.conditions as unknown as object }),
      ...(req.status         !== undefined && { status: req.status }),
      decidedAt,
    },
  });

  await eventBus.publishAndPersist(req.tenantId, {
    eventType:     'deal_committee.review.updated',
    aggregateType: AGGREGATE_TYPES.COMPLIANCE,
    aggregateId:   req.reviewId,
    payload: {
      reviewId:  req.reviewId,
      updatedBy: req.userId,
      status:    req.status,
      hasConditions: (req.conditions?.length ?? 0) > 0,
    },
  });

  logger.info('[DealCommittee] Review updated', { reviewId: req.reviewId, userId: req.userId });

  return { success: true, message: 'Review updated successfully.' };
}

/**
 * Record a committee member's vote on a deal review.
 * Votes are appended to the `reviewedBy` JSON array.
 * A final decision is set automatically when quorum is reached (majority of votes).
 */
export async function castVote(req: VoteRequest): Promise<{
  success:       boolean;
  message:       string;
  currentVotes?: CommitteeVote[];
  quorumReached: boolean;
  decision?:     ReviewStatus;
}> {
  const prisma = getPrisma();

  const review = await prisma.dealCommitteeReview.findUnique({
    where: { id: req.reviewId },
  });

  if (!review) {
    return { success: false, message: `Review ${req.reviewId} not found.`, quorumReached: false };
  }

  if (review.tenantId !== req.tenantId) {
    return { success: false, message: 'Tenant mismatch.', quorumReached: false };
  }

  if (
    review.status === REVIEW_STATUS.APPROVED ||
    review.status === REVIEW_STATUS.APPROVED_CONDITIONAL ||
    review.status === REVIEW_STATUS.REJECTED
  ) {
    return {
      success:      false,
      message:      `Review is already in a terminal state: ${review.status}.`,
      quorumReached: true,
    };
  }

  const existingVotes: CommitteeVote[] = Array.isArray(review.reviewedBy)
    ? (review.reviewedBy as unknown as CommitteeVote[])
    : [];

  // Prevent duplicate vote from same member
  const alreadyVoted = existingVotes.some((v) => v.memberId === req.memberId);
  if (alreadyVoted) {
    return {
      success:      false,
      message:      `Member ${req.memberId} has already cast a vote.`,
      quorumReached: false,
    };
  }

  const newVote: CommitteeVote = {
    memberId:   req.memberId,
    memberRole: req.memberRole,
    vote:       req.vote,
    comment:    req.comment,
    castAt:     new Date().toISOString(),
  };

  const updatedVotes = [...existingVotes, newVote];

  // Quorum = 3 votes; majority wins
  const QUORUM = 3;
  const approveCount = updatedVotes.filter((v) => v.vote === 'approve').length;
  const rejectCount  = updatedVotes.filter((v) => v.vote === 'reject').length;
  const totalCast    = updatedVotes.length;

  let decision: ReviewStatus | undefined;
  let quorumReached = false;

  if (totalCast >= QUORUM) {
    quorumReached = true;
    if (approveCount > rejectCount) {
      decision = REVIEW_STATUS.APPROVED;
    } else {
      decision = REVIEW_STATUS.REJECTED;
    }
  }

  await prisma.dealCommitteeReview.update({
    where: { id: req.reviewId },
    data: {
      reviewedBy: updatedVotes as unknown as object,
      status:     quorumReached && decision ? decision : REVIEW_STATUS.IN_REVIEW,
      decidedAt:  quorumReached ? new Date() : review.decidedAt,
    },
  });

  await eventBus.publishAndPersist(req.tenantId, {
    eventType:     'deal_committee.vote.cast',
    aggregateType: AGGREGATE_TYPES.COMPLIANCE,
    aggregateId:   req.reviewId,
    payload: {
      reviewId:     req.reviewId,
      memberId:     req.memberId,
      vote:         req.vote,
      quorumReached,
      decision,
      totalVotes:   totalCast,
      approveCount,
      rejectCount,
    },
  });

  logger.info('[DealCommittee] Vote cast', {
    reviewId:     req.reviewId,
    memberId:     req.memberId,
    vote:         req.vote,
    quorumReached,
    decision,
  });

  return {
    success:      true,
    message:      quorumReached ? `Quorum reached — decision: ${decision}` : 'Vote recorded.',
    currentVotes: updatedVotes,
    quorumReached,
    decision,
  };
}

/**
 * Record counsel or accountant signoff on a deal review.
 * Both signoffs are required before an approved_conditional review is fully cleared.
 */
export async function recordSignoff(req: SignoffRequest): Promise<{
  success:          boolean;
  message:          string;
  counselSignoff:   boolean;
  accountantSignoff: boolean;
  bothSignedOff:    boolean;
}> {
  const prisma = getPrisma();

  const review = await prisma.dealCommitteeReview.findUnique({
    where: { id: req.reviewId },
  });

  if (!review) {
    return {
      success:           false,
      message:           `Review ${req.reviewId} not found.`,
      counselSignoff:    false,
      accountantSignoff: false,
      bothSignedOff:     false,
    };
  }

  if (review.tenantId !== req.tenantId) {
    return {
      success:           false,
      message:           'Tenant mismatch — access denied.',
      counselSignoff:    review.counselSignoff,
      accountantSignoff: review.accountantSignoff,
      bothSignedOff:     false,
    };
  }

  const updateData: Record<string, unknown> = {};

  if (req.signoffType === 'counsel') {
    updateData['counselSignoff'] = true;
  } else {
    updateData['accountantSignoff'] = true;
  }

  const updatedReview = await prisma.dealCommitteeReview.update({
    where: { id: req.reviewId },
    data:  updateData as { counselSignoff?: boolean; accountantSignoff?: boolean },
  });

  const bothSignedOff = updatedReview.counselSignoff && updatedReview.accountantSignoff;

  await eventBus.publishAndPersist(req.tenantId, {
    eventType:     'deal_committee.signoff.recorded',
    aggregateType: AGGREGATE_TYPES.COMPLIANCE,
    aggregateId:   req.reviewId,
    payload: {
      reviewId:          req.reviewId,
      signoffType:       req.signoffType,
      signedBy:          req.userId,
      counselSignoff:    updatedReview.counselSignoff,
      accountantSignoff: updatedReview.accountantSignoff,
      bothSignedOff,
      notes:             req.notes,
    },
  });

  logger.info('[DealCommittee] Signoff recorded', {
    reviewId:    req.reviewId,
    signoffType: req.signoffType,
    userId:      req.userId,
    bothSignedOff,
  });

  return {
    success:           true,
    message:           bothSignedOff
      ? 'Both counsel and accountant have signed off.'
      : `${req.signoffType === 'counsel' ? 'Counsel' : 'Accountant'} signoff recorded.`,
    counselSignoff:    updatedReview.counselSignoff,
    accountantSignoff: updatedReview.accountantSignoff,
    bothSignedOff,
  };
}

/**
 * Fetch a single review by ID with full detail (checklist, conditions, votes).
 */
export async function getDealReview(
  reviewId: string,
  tenantId: string,
): Promise<{
  id:               string;
  businessId:       string;
  riskTier:         string;
  status:           string;
  redFlagChecklist: RedFlagChecklistResult[];
  conditions:       ActionItem[];
  committeeNotes:   string | null;
  counselSignoff:   boolean;
  accountantSignoff: boolean;
  votes:            CommitteeVote[];
  decidedAt:        Date | null;
  createdAt:        Date;
} | null> {
  const prisma = getPrisma();

  const review = await prisma.dealCommitteeReview.findUnique({
    where: { id: reviewId },
  });

  if (!review || review.tenantId !== tenantId) return null;

  return {
    id:               review.id,
    businessId:       review.businessId,
    riskTier:         review.riskTier,
    status:           review.status,
    redFlagChecklist: Array.isArray(review.redFlagChecklist)
      ? (review.redFlagChecklist as unknown as RedFlagChecklistResult[])
      : [],
    conditions:       Array.isArray(review.conditions)
      ? (review.conditions as unknown as ActionItem[])
      : [],
    committeeNotes:   review.committeeNotes,
    counselSignoff:   review.counselSignoff,
    accountantSignoff: review.accountantSignoff,
    votes:            Array.isArray(review.reviewedBy)
      ? (review.reviewedBy as unknown as CommitteeVote[])
      : [],
    decidedAt:        review.decidedAt,
    createdAt:        review.createdAt,
  };
}
