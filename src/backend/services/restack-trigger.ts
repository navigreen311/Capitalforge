// ============================================================
// CapitalForge — Re-Stack Trigger Engine
//
// Responsibilities:
//   1. checkRestackEligibility(businessId) — evaluate a single business
//   2. scanAllForRestack() — scan all businesses and return eligible ones
//
// Eligibility Criteria:
//   - fundingReadinessScore >= 70
//   - Days since last application >= 90
//   - Current utilization <= 40%
//   - No more than 2 active (non-decided) applications
//   - No funding round already in progress
//
// THE READINESS CHECK IS A FUNDABILITY FLOOR, NOT A RECOVERY MEASURE
//
//   `fundingReadinessScore` is computed by `funding-readiness.ts` at ONBOARDING
//   and answers a different question from the one this engine asks. It measures
//   fundability — revenue, business age, industry risk, credit, leverage. This
//   engine asks whether a client has recovered enough to stack again.
//
//   Those are not the same question. A client who has never borrowed and a
//   client who has just worked through a hardship can score identically on
//   fundability while being in completely different positions for a re-stack.
//
//   Using it here is DELIBERATE, and it is deliberately a floor: a client who
//   is not fundable at all should not re-stack either. THE RECOVERY TEST IS THE
//   OTHER FOUR CRITERIA — days since last application, utilization, active
//   applications, and a round already in progress. Those carry the recovery
//   signal; this one carries only "fundable at all".
//
//   Written down so it can be revisited rather than inherited. A proxy that
//   nobody has named stops being questioned; naming its limitation is what
//   keeps it open. If re-stack readiness is ever worth measuring on its own
//   terms, that is a new measure and a new column, not a new threshold on this
//   one. See docs/decisions/restack-recommend.md, entry 6.
//
//   Note also that 70 is not the only threshold read off this column: the
//   client detail card colours at 75/55 and the funding-rounds tab gates
//   "Start Round 2" at 75. Three numbers, one column, no shared definition.
//
// THIS IS THE ONLY COPY OF THESE RULES.
//
// There were two. `dashboard-restack.routes.ts` reimplemented the question
// inline with a different answer: readiness `> 70` rather than `>= 70`, ninety
// days measured from the last completed ROUND rather than the last
// application, at least one completed round required, and no utilization or
// active-application check at all. A client scoring exactly 70 was eligible on
// one surface and invisible on the other, and nothing in either response said
// which rule set had answered.
//
// The last of those five differences was the dashboard being right: a client
// with a round already in progress is not ready for another one. It is an
// eligibility rule, not a presentation concern, so it moved here — which makes
// GET /api/restack/eligible stricter than it was.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { prisma as sharedPrisma } from '../config/database.js';
import logger from '../config/logger.js';

// ── Prisma singleton ─────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = sharedPrisma;
  return _prisma;
}

export function setPrismaClient(client: PrismaClient): void {
  _prisma = client;
}

// ── Constants ────────────────────────────────────────────────

const MIN_READINESS_SCORE = 70;
const MIN_DAYS_SINCE_LAST_APP = 90;
const MAX_UTILIZATION = 0.40;
const MAX_ACTIVE_APPLICATIONS = 2;

/** A round in one of these states is under way, so another cannot start. */
const IN_PROGRESS_ROUND_STATUSES = ['planning', 'in_progress'];

// ── Types ────────────────────────────────────────────────────

export interface RestackEligibilityResult {
  businessId: string;
  businessName: string;
  eligible: boolean;
  reasons: string[];
  /** Null when readiness has never been assessed. Not the same as scoring zero. */
  readinessScore: number | null;
  daysSinceLastApp: number | null;
  currentUtilization: number | null;
  activeApplicationCount: number;
  recommendedRoundNumber: number;
  /** Highest round number this business has reached. 0 when it has none. */
  currentRoundNumber: number;
  /**
   * When the last completed round completed. Null when there is none, and also
   * when a completed round carries no `completedAt` — the dashboard's inline
   * copy treated a missing timestamp as passing its ninety-day test, so a
   * round completed yesterday without one was offered as a 90-day-old
   * opportunity.
   */
  lastCompletedRoundAt: string | null;
  /** A round already under way, if there is one. */
  roundInProgress: boolean;
}

/** No such business under this tenant. */
export class RestackBusinessNotFoundError extends Error {
  constructor(public readonly businessId: string) {
    super(`Business not found: ${businessId}`);
    this.name = 'RestackBusinessNotFoundError';
  }
}

/**
 * What a scan looked at, not only what it found.
 *
 * `scanAllForRestack` returned a bare array, and the endpoint above it
 * answered `{ eligible, total: eligible.length }`. "3 eligible" with no
 * denominator reads as three out of everybody; the pre-filter means it is
 * three out of whoever has been assessed, and nothing said how many had not.
 */
export interface RestackScanResult {
  results: RestackEligibilityResult[];
  /** Active businesses in this tenant. */
  activeCount: number;
  /** Those that passed the readiness pre-filter and were actually evaluated. */
  candidateCount: number;
  /** Active businesses whose readiness has never been assessed. */
  notAssessedCount: number;
}

// ── Core: Check Single Business Eligibility ──────────────────

export async function checkRestackEligibility(
  businessId: string,
  tenantId: string,
): Promise<RestackEligibilityResult> {
  const prisma = getPrisma();

  // tenantId is required, not conditional. `if (tenantId) whereClause.tenantId`
  // meant the query ran unscoped whenever a caller omitted it — a filter that
  // reads as scoped while being written to work without one. Not reachable from
  // the routes today, which pass it; the point is that it cannot become
  // reachable.
  const whereClause: Record<string, unknown> = { id: businessId, tenantId };

  const business = await prisma.business.findFirst({
    where: whereClause,
    include: {
      cardApplications: {
        orderBy: { createdAt: 'desc' },
      },
      fundingRounds: {
        orderBy: { roundNumber: 'desc' },
      },
      creditProfiles: {
        orderBy: { pulledAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!business) {
    // Thrown, not answered.
    //
    // This returned `{ businessName: 'Unknown', eligible: false, reasons:
    // ['Business not found'], recommendedRoundNumber: 1 }` and the route
    // answered 200. A caller reading `eligible: false` could not tell "checked
    // and not eligible" from "no such business", and the object carried a
    // recommendation — round 1 — for a business that does not exist.
    //
    // Same answer for a business in another tenant, since the read is scoped:
    // the response cannot be used to find out whether an id is real.
    throw new RestackBusinessNotFoundError(businessId);
  }

  const reasons: string[] = [];
  let eligible = true;

  // 1. Readiness score check
  // Unassessed is not zero. `?? 0` produced the sentence "Readiness score 0 is
  // below threshold" for a client nobody had assessed — an assessment stated as
  // fact, in the prose an advisor reads.
  const readinessScore =
    typeof business.fundingReadinessScore === 'number' ? business.fundingReadinessScore : null;
  if (readinessScore === null) {
    // Not eligible, and for a different reason than failing. "Not assessed" and
    // "assessed and too low" are different findings and must not read the same.
    eligible = false;
    reasons.push(
      'Readiness has never been assessed for this client, so eligibility cannot be '
      + `determined. Threshold is ${MIN_READINESS_SCORE}.`,
    );
  } else if (readinessScore < MIN_READINESS_SCORE) {
    eligible = false;
    reasons.push(`Readiness score ${readinessScore} is below threshold of ${MIN_READINESS_SCORE}`);
  } else {
    reasons.push(`Readiness score ${readinessScore} meets threshold`);
  }

  // 2. Days since last application
  const lastApp = business.cardApplications[0] ?? null;
  let daysSinceLastApp: number | null = null;
  if (lastApp) {
    const appDate = lastApp.submittedAt ?? lastApp.createdAt;
    daysSinceLastApp = Math.floor(
      (Date.now() - new Date(appDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceLastApp < MIN_DAYS_SINCE_LAST_APP) {
      eligible = false;
      reasons.push(`Only ${daysSinceLastApp} days since last application (need ${MIN_DAYS_SINCE_LAST_APP})`);
    } else {
      reasons.push(`${daysSinceLastApp} days since last application meets threshold`);
    }
  } else {
    reasons.push('No prior applications — eligible for first round');
  }

  // 3. Current utilization
  //
  // `latestCredit?.utilization ? Number(...) : null` treated 0 as absent,
  // because 0 is falsy — so a client at 0% utilization, the best reading there
  // is, was recorded as having no utilization data and the check was skipped.
  // Nullish, not truthy: only a missing value is missing.
  const latestCredit = business.creditProfiles[0] ?? null;
  const rawUtilization = latestCredit?.utilization ?? null;
  const currentUtilization = rawUtilization === null ? null : Number(rawUtilization);

  if (currentUtilization === null) {
    // Blocks, and says it could not be checked.
    //
    // This used to skip and pass, eight lines below a readiness check that
    // blocks for exactly this reason. Two opposite policies for missing data
    // in one function: an unassessed client was refused while a client with no
    // credit profile sailed through the check meant to catch overextension.
    // Missing data is not evidence that a client qualifies.
    eligible = false;
    reasons.push(
      'Utilization could not be checked: no credit profile is recorded for this client. '
      + `The limit is ${Math.round(MAX_UTILIZATION * 100)}%.`,
    );
  } else if (currentUtilization > MAX_UTILIZATION) {
    eligible = false;
    reasons.push(`Utilization ${Math.round(currentUtilization * 100)}% exceeds ${Math.round(MAX_UTILIZATION * 100)}% max`);
  } else {
    reasons.push(`Utilization ${Math.round(currentUtilization * 100)}% is within limit`);
  }

  // 4. Active application count
  const activeStatuses = ['draft', 'submitted', 'in_review', 'pending'];
  const activeApplicationCount = business.cardApplications.filter(
    (app) => activeStatuses.includes(app.status),
  ).length;
  if (activeApplicationCount > MAX_ACTIVE_APPLICATIONS) {
    eligible = false;
    reasons.push(`${activeApplicationCount} active applications exceed max of ${MAX_ACTIVE_APPLICATIONS}`);
  } else {
    reasons.push(`${activeApplicationCount} active applications within limit`);
  }

  // 5. A round already under way
  //
  // From the dashboard's inline copy, which was right about this and is the
  // only place it was checked. Starting a second round while one is open is
  // not a re-stack; it is two rounds.
  const roundInProgress = business.fundingRounds.some(
    (fr) => IN_PROGRESS_ROUND_STATUSES.includes(fr.status),
  );
  if (roundInProgress) {
    eligible = false;
    reasons.push('A funding round is already in progress');
  } else {
    reasons.push('No funding round in progress');
  }

  // Recommended next round number
  const highestRound = business.fundingRounds[0]?.roundNumber ?? 0;
  const recommendedRoundNumber = highestRound + 1;

  const lastCompleted = business.fundingRounds
    .filter((fr) => fr.status === 'completed' && fr.completedAt !== null)
    .sort((a, b) => b.roundNumber - a.roundNumber)[0];

  return {
    businessId,
    businessName: business.legalName,
    eligible,
    reasons,
    readinessScore,
    daysSinceLastApp,
    currentUtilization,
    activeApplicationCount,
    recommendedRoundNumber,
    currentRoundNumber: highestRound,
    lastCompletedRoundAt: lastCompleted?.completedAt?.toISOString() ?? null,
    roundInProgress,
  };
}

// ── Core: Scan All Businesses for Restack Eligibility ────────

export async function scanAllForRestack(tenantId: string): Promise<RestackScanResult> {
  const prisma = getPrisma();

  // As above: required. Unscoped, this returned every tenant's businesses.
  const activeWhere = { status: 'active', tenantId };

  // Pre-filter: only look at businesses with readiness >= threshold.
  //
  // Prisma's `gte` excludes NULLs, so a client nobody has assessed is never
  // scanned. That is consistent — an unassessed client cannot be eligible,
  // the readiness check refuses them by name — but it made them INVISIBLE:
  // the endpoint answered "3 eligible" with no denominator, and no way to see
  // that forty clients had never been scored. The counts below are what makes
  // the pre-filter honest rather than lossy.
  const [businesses, activeCount, notAssessedCount] = await prisma.$transaction([
    prisma.business.findMany({
      where: { ...activeWhere, fundingReadinessScore: { gte: MIN_READINESS_SCORE } },
      select: { id: true, tenantId: true },
    }),
    prisma.business.count({ where: activeWhere }),
    prisma.business.count({ where: { ...activeWhere, fundingReadinessScore: null } }),
  ]);

  logger.info('[RestackTrigger] Scanning businesses for restack eligibility', {
    candidateCount: businesses.length,
    activeCount,
    notAssessedCount,
    tenantId,
  });

  const results: RestackEligibilityResult[] = [];

  for (const biz of businesses) {
    try {
      const result = await checkRestackEligibility(biz.id, biz.tenantId);
      if (result.eligible) {
        results.push(result);
      }
    } catch (err) {
      // The business was there a moment ago. A row deleted between the scan
      // and the check is not a reason to fail the whole scan, and it is also
      // not something to pass over in silence.
      if (err instanceof RestackBusinessNotFoundError) {
        logger.warn('[RestackTrigger] Business disappeared mid-scan', { businessId: biz.id });
        continue;
      }
      throw err;
    }
  }

  // Sort by readiness score descending, unassessed last.
  //
  // Not `?? 0` here either: sorting an unassessed client as a zero puts them at
  // the bottom of the list, which is a ranking claim. They go last because
  // nothing is known about them, and the null in the row says which it is.
  results.sort((a, b) => {
    if (a.readinessScore === null && b.readinessScore === null) return 0;
    if (a.readinessScore === null) return 1;
    if (b.readinessScore === null) return -1;
    return b.readinessScore - a.readinessScore;
  });

  logger.info('[RestackTrigger] Scan complete', {
    eligible: results.length,
    total: businesses.length,
  });

  return {
    results,
    activeCount,
    candidateCount: businesses.length,
    notAssessedCount,
  };
}
