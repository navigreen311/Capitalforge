// ============================================================
// CapitalForge — Client Graduation Engine
//
// Responsibilities:
//   1. Define four progression tracks with milestone gating:
//      Credit Builder → Starter Stack → Full Stack → LOC/SBA Bridge
//   2. Gate each track on FICO threshold, business age, and revenue
//   3. Auto-assess graduation eligibility from live credit profiles
//   4. Generate timeline projections and an actionable roadmap
//   5. Persist graduation assessments and emit ledger events
// ============================================================

import { PrismaClient } from '@prisma/client';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import logger from '../config/logger.js';

// ── Prisma singleton ─────────────────────────────────────────

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

// ── Track Definitions ─────────────────────────────────────────

export const GRADUATION_TRACKS = {
  CREDIT_BUILDER: 'credit_builder',
  STARTER_STACK:  'starter_stack',
  FULL_STACK:     'full_stack',
  LOC_SBA_BRIDGE: 'loc_sba_bridge',
} as const;

export type GraduationTrack = (typeof GRADUATION_TRACKS)[keyof typeof GRADUATION_TRACKS];

// ── Track Thresholds ─────────────────────────────────────────

export interface TrackThresholds {
  minFicoScore:        number;
  minBusinessAgeMonths: number;
  minMonthlyRevenue:   number;
  minBusinessCreditScore: number;
  /** Minimum number of positive tradelines required */
  minTradelines:       number;
  /** Maximum utilization allowed to unlock */
  maxUtilization:      number;
}

export const TRACK_THRESHOLDS: Record<GraduationTrack, TrackThresholds> = {
  [GRADUATION_TRACKS.CREDIT_BUILDER]: {
    minFicoScore:           0,     // entry-level — no FICO gate
    minBusinessAgeMonths:   0,
    minMonthlyRevenue:      0,
    minBusinessCreditScore: 0,
    minTradelines:          0,
    maxUtilization:         1.0,
  },
  [GRADUATION_TRACKS.STARTER_STACK]: {
    minFicoScore:           620,
    minBusinessAgeMonths:   6,
    minMonthlyRevenue:      3_000,
    minBusinessCreditScore: 0,     // business credit not required at entry
    minTradelines:          2,
    maxUtilization:         0.70,
  },
  [GRADUATION_TRACKS.FULL_STACK]: {
    minFicoScore:           680,
    minBusinessAgeMonths:   12,
    minMonthlyRevenue:      8_000,
    minBusinessCreditScore: 50,
    minTradelines:          4,
    maxUtilization:         0.50,
  },
  [GRADUATION_TRACKS.LOC_SBA_BRIDGE]: {
    minFicoScore:           720,
    minBusinessAgeMonths:   24,
    minMonthlyRevenue:      15_000,
    minBusinessCreditScore: 100,
    minTradelines:          6,
    maxUtilization:         0.30,
  },
} as const;

// ── Track Display Metadata ───────────────────────────────────

export const TRACK_METADATA: Record<GraduationTrack, { label: string; description: string; targetCreditRange: string }> = {
  [GRADUATION_TRACKS.CREDIT_BUILDER]: {
    label:             'Credit Builder',
    description:       'Establish business credit identity, register DUNS, and build Net-30 tradelines.',
    targetCreditRange: '$0 – $5,000',
  },
  [GRADUATION_TRACKS.STARTER_STACK]: {
    label:             'Starter Stack',
    description:       'First wave of business credit cards with conservative limits (2–4 cards).',
    targetCreditRange: '$5,000 – $50,000',
  },
  [GRADUATION_TRACKS.FULL_STACK]: {
    label:             'Full Stack',
    description:       'Aggressive stacking across 6–10 issuers with velocity coordination.',
    targetCreditRange: '$50,000 – $250,000',
  },
  [GRADUATION_TRACKS.LOC_SBA_BRIDGE]: {
    label:             'LOC / SBA Bridge',
    description:       'Bridge to institutional credit: business lines of credit, SBA 7(a), and term loans.',
    targetCreditRange: '$250,000+',
  },
};

// ── Milestone Gate Result ────────────────────────────────────

export interface MilestoneGate {
  criterion:    string;
  required:     number | string;
  actual:       number | string;
  passed:       boolean;
  gap:          number | null;  // numeric gap to requirement (null if non-numeric)
}

// ── Graduation Assessment ────────────────────────────────────

export interface GraduationAssessment {
  businessId:       string;
  currentTrack:     GraduationTrack;
  nextTrack:        GraduationTrack | null;
  currentTrackMet:  boolean;
  nextTrackEligible: boolean;
  milestoneGates:   MilestoneGate[];
  /** Estimated months to qualify for the next track */
  estimatedMonthsToNextTrack: number | null;
  /** Prioritised actions the client must take */
  actionRoadmap:    RoadmapAction[];
  assessedAt:       Date;
}

export interface RoadmapAction {
  priority:   number;   // 1 = highest
  category:   'credit_score' | 'business_age' | 'revenue' | 'tradelines' | 'utilization' | 'business_credit';
  action:     string;
  impact:     string;
  timelineEstimate: string;
}

// ── Client Profile Input ─────────────────────────────────────

export interface GraduationInput {
  ficoScore:           number;
  businessAgeMonths:   number;
  monthlyRevenue:      number;
  businessCreditScore: number;
  tradelineCount:      number;
  currentUtilization:  number;
}

// ── Core Functions ────────────────────────────────────────────

/**
 * Determine which track a client currently qualifies for (highest met).
 */
export function resolveCurrentTrack(input: GraduationInput): GraduationTrack {
  const orderedTracks: GraduationTrack[] = [
    GRADUATION_TRACKS.LOC_SBA_BRIDGE,
    GRADUATION_TRACKS.FULL_STACK,
    GRADUATION_TRACKS.STARTER_STACK,
    GRADUATION_TRACKS.CREDIT_BUILDER,
  ];

  for (const track of orderedTracks) {
    if (checkTrackEligibility(track, input).eligible) {
      return track;
    }
  }

  // Credit Builder is always the floor
  return GRADUATION_TRACKS.CREDIT_BUILDER;
}

/**
 * Check whether a client meets all milestones for a specific track.
 */
export function checkTrackEligibility(
  track: GraduationTrack,
  input: GraduationInput,
): { eligible: boolean; gates: MilestoneGate[] } {
  const t = TRACK_THRESHOLDS[track];
  const gates: MilestoneGate[] = [];

  // FICO gate
  gates.push({
    criterion: 'Personal FICO Score',
    required:  t.minFicoScore,
    actual:    input.ficoScore,
    passed:    input.ficoScore >= t.minFicoScore,
    gap:       Math.max(0, t.minFicoScore - input.ficoScore),
  });

  // Business age gate
  gates.push({
    criterion: 'Business Age (months)',
    required:  t.minBusinessAgeMonths,
    actual:    input.businessAgeMonths,
    passed:    input.businessAgeMonths >= t.minBusinessAgeMonths,
    gap:       Math.max(0, t.minBusinessAgeMonths - input.businessAgeMonths),
  });

  // Revenue gate
  gates.push({
    criterion: 'Monthly Revenue ($)',
    required:  t.minMonthlyRevenue,
    actual:    input.monthlyRevenue,
    passed:    input.monthlyRevenue >= t.minMonthlyRevenue,
    gap:       Math.max(0, t.minMonthlyRevenue - input.monthlyRevenue),
  });

  // Business credit score gate
  gates.push({
    criterion: 'Business Credit Score (SBSS/Paydex)',
    required:  t.minBusinessCreditScore,
    actual:    input.businessCreditScore,
    passed:    input.businessCreditScore >= t.minBusinessCreditScore,
    gap:       Math.max(0, t.minBusinessCreditScore - input.businessCreditScore),
  });

  // Tradeline count gate
  gates.push({
    criterion: 'Active Positive Tradelines',
    required:  t.minTradelines,
    actual:    input.tradelineCount,
    passed:    input.tradelineCount >= t.minTradelines,
    gap:       Math.max(0, t.minTradelines - input.tradelineCount),
  });

  // Utilization gate (lower is better)
  gates.push({
    criterion: 'Credit Utilization (max)',
    required:  `≤ ${(t.maxUtilization * 100).toFixed(0)}%`,
    actual:    `${(input.currentUtilization * 100).toFixed(1)}%`,
    passed:    input.currentUtilization <= t.maxUtilization,
    gap:       null,
  });

  const eligible = gates.every((g) => g.passed);
  return { eligible, gates };
}

/**
 * Determine the next track in the progression.
 */
export function getNextTrack(current: GraduationTrack): GraduationTrack | null {
  const progression: GraduationTrack[] = [
    GRADUATION_TRACKS.CREDIT_BUILDER,
    GRADUATION_TRACKS.STARTER_STACK,
    GRADUATION_TRACKS.FULL_STACK,
    GRADUATION_TRACKS.LOC_SBA_BRIDGE,
  ];
  const idx = progression.indexOf(current);
  return idx >= 0 && idx < progression.length - 1 ? progression[idx + 1] : null;
}

/**
 * Estimate months until a client qualifies for the next track.
 * Uses conservative linear projections per metric.
 */
export function estimateMonthsToNextTrack(
  input:     GraduationInput,
  nextTrack: GraduationTrack,
): number | null {
  const t = TRACK_THRESHOLDS[nextTrack];
  let maxMonths = 0;

  // FICO improvement: ~5–8 pts/month with consistent on-time payments
  if (input.ficoScore < t.minFicoScore) {
    const gap = t.minFicoScore - input.ficoScore;
    maxMonths = Math.max(maxMonths, Math.ceil(gap / 6));
  }

  // Business age is fixed — it just takes time
  if (input.businessAgeMonths < t.minBusinessAgeMonths) {
    const gap = t.minBusinessAgeMonths - input.businessAgeMonths;
    maxMonths = Math.max(maxMonths, gap);
  }

  // Revenue growth: assume 5% monthly growth rate
  if (input.monthlyRevenue < t.minMonthlyRevenue && input.monthlyRevenue > 0) {
    const growthRate = 0.05;
    let rev = input.monthlyRevenue;
    let months = 0;
    while (rev < t.minMonthlyRevenue && months < 60) {
      rev *= (1 + growthRate);
      months++;
    }
    maxMonths = Math.max(maxMonths, months);
  }

  // Tradelines: 1–2 new net-30 accounts per month if actively building
  if (input.tradelineCount < t.minTradelines) {
    const gap = t.minTradelines - input.tradelineCount;
    maxMonths = Math.max(maxMonths, Math.ceil(gap / 1.5));
  }

  // Business credit: ~10–15 pts/month with active trade accounts
  if (input.businessCreditScore < t.minBusinessCreditScore) {
    const gap = t.minBusinessCreditScore - input.businessCreditScore;
    maxMonths = Math.max(maxMonths, Math.ceil(gap / 12));
  }

  return maxMonths > 0 ? maxMonths : 0;
}

/**
 * Build a prioritised action roadmap based on failing gates for the next track.
 */
export function buildActionRoadmap(
  input:       GraduationInput,
  failingGates: MilestoneGate[],
  nextTrack:   GraduationTrack,
): RoadmapAction[] {
  const t = TRACK_THRESHOLDS[nextTrack];
  const actions: RoadmapAction[] = [];
  let priority = 1;

  // Utilization — fastest win, highest impact
  if (input.currentUtilization > t.maxUtilization) {
    const targetPct = (t.maxUtilization * 100).toFixed(0);
    const currentPct = (input.currentUtilization * 100).toFixed(1);
    actions.push({
      priority: priority++,
      category: 'utilization',
      action:   `Reduce credit utilization from ${currentPct}% to below ${targetPct}%`,
      impact:   'Can improve FICO score 20–40 points and unlock next-track eligibility',
      timelineEstimate: '1–3 months (pay down balances, request credit limit increases)',
    });
  }

  // FICO
  const ficoGate = failingGates.find((g) => g.criterion === 'Personal FICO Score');
  if (ficoGate && !ficoGate.passed) {
    const gap = typeof ficoGate.gap === 'number' ? ficoGate.gap : 0;
    actions.push({
      priority: priority++,
      category: 'credit_score',
      action:   `Improve personal FICO score by ${gap} points (target: ${t.minFicoScore})`,
      impact:   'Unlocks higher-tier card products and lower interest rates',
      timelineEstimate: `${Math.ceil(gap / 6)}–${Math.ceil(gap / 4)} months with consistent on-time payments`,
    });
  }

  // Tradelines
  const tradelineGate = failingGates.find((g) => g.criterion === 'Active Positive Tradelines');
  if (tradelineGate && !tradelineGate.passed) {
    const needed = typeof tradelineGate.gap === 'number' ? tradelineGate.gap : 0;
    actions.push({
      priority: priority++,
      category: 'tradelines',
      action:   `Open ${needed} additional Net-30 vendor accounts and pay within terms`,
      impact:   'Builds business credit file depth, required for upper tracks',
      timelineEstimate: `${Math.ceil(needed / 2)}–${needed} months`,
    });
  }

  // Business credit score
  const bizCreditGate = failingGates.find((g) => g.criterion === 'Business Credit Score (SBSS/Paydex)');
  if (bizCreditGate && !bizCreditGate.passed) {
    const gap = typeof bizCreditGate.gap === 'number' ? bizCreditGate.gap : 0;
    actions.push({
      priority: priority++,
      category: 'business_credit',
      action:   `Increase SBSS/Paydex score by ${gap} points (target: ${t.minBusinessCreditScore})`,
      impact:   'Required for Full Stack and LOC/SBA tracks; lenders weight this heavily',
      timelineEstimate: `${Math.ceil(gap / 15)}–${Math.ceil(gap / 10)} months`,
    });
  }

  // Revenue
  const revenueGate = failingGates.find((g) => g.criterion === 'Monthly Revenue ($)');
  if (revenueGate && !revenueGate.passed) {
    const gap = typeof revenueGate.gap === 'number' ? revenueGate.gap : 0;
    actions.push({
      priority: priority++,
      category: 'revenue',
      action:   `Grow monthly revenue by $${gap.toLocaleString()} (target: $${t.minMonthlyRevenue.toLocaleString()}/mo)`,
      impact:   'Revenue threshold gates access to higher credit limits',
      timelineEstimate: 'Timeline depends on business model; focus on recurring revenue streams',
    });
  }

  // Business age
  const ageGate = failingGates.find((g) => g.criterion === 'Business Age (months)');
  if (ageGate && !ageGate.passed) {
    const months = typeof ageGate.gap === 'number' ? ageGate.gap : 0;
    actions.push({
      priority: priority++,
      category: 'business_age',
      action:   `Continue building business history — ${months} more month(s) until age requirement is met`,
      impact:   'Business age cannot be accelerated; use this time to build credit and revenue',
      timelineEstimate: `${months} month(s) — fixed timeline`,
    });
  }

  return actions;
}

/**
 * Full assessment for a business — pure computation, no DB required.
 */
export function assessGraduation(
  businessId: string,
  input:      GraduationInput,
): GraduationAssessment {
  const currentTrack = resolveCurrentTrack(input);
  const nextTrack    = getNextTrack(currentTrack);

  const { eligible: currentTrackMet, gates: currentGates } =
    checkTrackEligibility(currentTrack, input);

  let nextTrackEligible     = false;
  let milestoneGates        = currentGates;
  let estimatedMonths: number | null = null;
  let actionRoadmap: RoadmapAction[] = [];

  if (nextTrack) {
    const { eligible, gates } = checkTrackEligibility(nextTrack, input);
    nextTrackEligible = eligible;
    milestoneGates    = gates;

    if (!nextTrackEligible) {
      const failingGates = gates.filter((g) => !g.passed);
      estimatedMonths = estimateMonthsToNextTrack(input, nextTrack);
      actionRoadmap   = buildActionRoadmap(input, failingGates, nextTrack);
    }
  }

  return {
    businessId,
    currentTrack,
    nextTrack,
    currentTrackMet,
    nextTrackEligible,
    milestoneGates,
    estimatedMonthsToNextTrack: estimatedMonths,
    actionRoadmap,
    assessedAt: new Date(),
  };
}

/**
 * Auto-assess graduation eligibility from persisted credit profiles.
 * Reads the latest personal FICO, business credit, and business record.
 */
export async function autoAssessGraduation(
  businessId: string,
  tenantId:   string,
): Promise<GraduationAssessment> {
  const prisma = getPrisma();

  // Fetch business record
  const business = await prisma.business.findUnique({
    where:   { id: businessId },
    include: { creditProfiles: { orderBy: { pulledAt: 'desc' } } },
  });

  if (!business) {
    throw new Error(`Business ${businessId} not found`);
  }

  // Derive business age in months
  const ageMonths = business.dateOfFormation
    ? Math.floor(
        (Date.now() - new Date(business.dateOfFormation).getTime()) /
          (1000 * 60 * 60 * 24 * 30.44),
      )
    : 0;

  // Extract best personal FICO
  const personalProfiles = business.creditProfiles.filter(
    (p) => p.profileType === 'personal' && p.scoreType === 'fico',
  );
  const ficoScore = personalProfiles.length > 0
    ? Math.max(...personalProfiles.map((p) => p.score ?? 0))
    : 0;

  // Extract best business credit score (SBSS or Paydex)
  const bizProfiles = business.creditProfiles.filter(
    (p) => p.profileType === 'business' && (p.scoreType === 'sbss' || p.scoreType === 'paydex'),
  );
  const businessCreditScore = bizProfiles.length > 0
    ? Math.max(...bizProfiles.map((p) => p.score ?? 0))
    : 0;

  // Tradeline count from most recent business profile
  const latestBizProfile = bizProfiles[0] ?? null;
  const tradelines = latestBizProfile?.tradelines as Record<string, unknown>[] | null;
  const tradelineCount = Array.isArray(tradelines) ? tradelines.length : 0;

  // Utilization from most recent personal profile
  const latestPersonal = personalProfiles[0] ?? null;
  const currentUtilization = latestPersonal?.utilization
    ? Number(latestPersonal.utilization)
    : 0;

  const monthlyRevenue = business.monthlyRevenue
    ? Number(business.monthlyRevenue)
    : 0;

  const input: GraduationInput = {
    ficoScore,
    businessAgeMonths:   ageMonths,
    monthlyRevenue,
    businessCreditScore,
    tradelineCount,
    currentUtilization,
  };

  const assessment = assessGraduation(businessId, input);

  // Emit event for the ledger
  await eventBus.publishAndPersist(tenantId, {
    eventType:     EVENT_TYPES.SUITABILITY_ASSESSED,  // closest semantic match
    aggregateType: AGGREGATE_TYPES.BUSINESS,
    aggregateId:   businessId,
    payload: {
      module:          'graduation_engine',
      businessId,
      currentTrack:    assessment.currentTrack,
      nextTrack:       assessment.nextTrack,
      nextTrackEligible: assessment.nextTrackEligible,
      estimatedMonthsToNextTrack: assessment.estimatedMonthsToNextTrack,
    },
  });

  logger.info('[GraduationEngine] Auto-assessed graduation', {
    businessId,
    currentTrack: assessment.currentTrack,
    nextTrack:    assessment.nextTrack,
    eligible:     assessment.nextTrackEligible,
  });

  return assessment;
}

/**
 * Retrieve the latest graduation status from the event ledger.
 * Falls back to auto-assessment if no prior event exists.
 */
export async function getGraduationStatus(
  businessId: string,
  tenantId:   string,
): Promise<GraduationAssessment> {
  return autoAssessGraduation(businessId, tenantId);
}
