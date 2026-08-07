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
import { prisma as sharedPrisma } from '../config/database.js';
import { eventBus } from '../events/event-bus.js';
import { EVENT_TYPES, AGGREGATE_TYPES } from '@shared/constants/index.js';
import logger from '../config/logger.js';
import type { ScoreType } from '@shared/types/index.js';

// ── Prisma singleton ─────────────────────────────────────────

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = sharedPrisma;
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

/**
 * The tracks in progression order, weakest first.
 *
 * Exported because "graduated" means moving *up* this list, and a rate that
 * counted any change would count a client who stopped qualifying for a track
 * as having graduated from it.
 */
export const TRACK_ORDER: readonly GraduationTrack[] = [
  GRADUATION_TRACKS.CREDIT_BUILDER,
  GRADUATION_TRACKS.STARTER_STACK,
  GRADUATION_TRACKS.FULL_STACK,
  GRADUATION_TRACKS.LOC_SBA_BRIDGE,
] as const;

/** Positive when `to` is further along than `from`; 0 when unchanged. */
export function trackDirection(from: GraduationTrack | null, to: GraduationTrack): number {
  if (from === null) return 0;
  return TRACK_ORDER.indexOf(to) - TRACK_ORDER.indexOf(from);
}

// ── Track Thresholds ─────────────────────────────────────────

/**
 * A threshold that names the product it reads.
 *
 * The whole point of the type: a number on its own cannot say which score it
 * is a number *of*, so nothing stopped a PAYDEX being compared against an SBSS
 * requirement. `scoreType` makes the comparison state its terms.
 */
export interface ScoreThreshold<T extends ScoreType = ScoreType> {
  scoreType: T;
  min:       number;
}

/**
 * A score, carrying the product it is a score of.
 *
 * The reason it is an object and not a number: `Math.max` over a client's
 * business scores compiles happily when they are numbers, and that is exactly
 * how a PAYDEX of 88 came to clear a threshold of 50 that is an SBSS figure.
 * `Math.max(...Object.values(scores))` is now a type error, because a
 * `BusinessScore` is not a number and there is no meaningful maximum across
 * products measured on different scales.
 *
 * Reading `.value` is still possible, and should be — but it is a deliberate
 * act that names one product, not an accident that flattens several.
 */
export interface BusinessScore<T extends ScoreType = ScoreType> {
  readonly scoreType: T;
  readonly value:     number;
}

/** Build a score, so the product and the figure travel together from the start. */
export function businessScore<T extends ScoreType>(scoreType: T, value: number): BusinessScore<T> {
  return { scoreType, value };
}

/**
 * Whether a score clears a threshold.
 *
 * Both sides are generic in the same `T`, so comparing a PAYDEX against an
 * SBSS requirement does not type-check. The rule that used to live in a
 * comment — and before that, in nobody's head — is now the signature.
 */
export function meetsThreshold<T extends ScoreType>(
  threshold: ScoreThreshold<T>,
  // `NoInfer` matters here. Without it TypeScript infers `T` from both
  // arguments and settles on their union, so a PAYDEX against an SBSS
  // requirement produces `T = 'sbss' | 'paydex'` and compiles — the check
  // silently widens to fit whatever it was given. The requirement fixes the
  // product; the score is then checked against it.
  score: BusinessScore<NoInfer<T>>,
): boolean {
  return score.value >= threshold.min;
}

export interface TrackThresholds {
  minFicoScore:        number;
  minBusinessAgeMonths: number;
  minMonthlyRevenue:   number;
  /**
   * The business-credit requirement, naming its product. Null where a track
   * asserts none — which is different from a threshold of zero, because zero
   * is a comparison that a client with no score at all would pass.
   */
  businessCredit:         ScoreThreshold | null;
  /** Minimum number of positive tradelines required */
  minTradelines:       number;
  /** Maximum utilization allowed to unlock */
  maxUtilization:      number;
}

/**
 * `satisfies` rather than a type annotation, deliberately.
 *
 * Annotating this `Record<GraduationTrack, TrackThresholds>` widens each
 * `scoreType: 'sbss'` to the whole ScoreType union, and once the threshold's
 * product is the union, `meetsThreshold` infers the union too and accepts a
 * PAYDEX against an SBSS requirement — the exact comparison the generic exists
 * to reject. `satisfies` checks the shape without erasing the literal, so the
 * requirement keeps knowing which product it is a requirement for.
 */
export const TRACK_THRESHOLDS = {
  [GRADUATION_TRACKS.CREDIT_BUILDER]: {
    minFicoScore:           0,     // entry-level — no FICO gate
    minBusinessAgeMonths:   0,
    minMonthlyRevenue:      0,
    businessCredit:         null,
    minTradelines:          0,
    maxUtilization:         1.0,
  },
  [GRADUATION_TRACKS.STARTER_STACK]: {
    minFicoScore:           620,
    minBusinessAgeMonths:   6,
    minMonthlyRevenue:      3_000,
    businessCredit:         null,  // business credit not required at entry
    minTradelines:          2,
    maxUtilization:         0.70,
  },
  [GRADUATION_TRACKS.FULL_STACK]: {
    minFicoScore:           680,
    minBusinessAgeMonths:   12,
    minMonthlyRevenue:      8_000,
    // Was { scoreType: 'sbss', min: 50 }. Removed 2026-08-05: FICO computes
    // SBSS when a lender requests it, so no client could ever clear this by
    // any action, and zero rows of that score type have ever existed here.
    //
    // Null, not a smaller number and not a substitute product. A threshold on
    // Intelliscore would need a figure nobody can source, and inventing one is
    // exactly how 140 survived two revisions and a retirement.
    //
    // NOTE: this track now asserts no business-credit requirement at all. It
    // is easier to reach than it was this morning, and that is a real change
    // in meaning rather than a tidy-up.
    businessCredit:         null,
    minTradelines:          4,
    maxUtilization:         0.50,
  },
  [GRADUATION_TRACKS.LOC_SBA_BRIDGE]: {
    minFicoScore:           720,
    minBusinessAgeMonths:   24,
    minMonthlyRevenue:      15_000,
    // Was { scoreType: 'sbss', min: 100 } — same removal, same reasoning, and
    // the same consequence: the highest track no longer tests business credit.
    // Tradelines, revenue, age, personal FICO and utilisation still gate it.
    businessCredit:         null,
    minTradelines:          6,
    maxUtilization:         0.30,
  },
} as const satisfies Record<GraduationTrack, TrackThresholds>;

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

/**
 * Three outcomes, because there are three things that can be true.
 *
 * `unknown` is a client we have not measured against this requirement — not a
 * client who fell short of it. Collapsing the two tells an advisor their client
 * failed a threshold nobody applied to them, and it is the reason a PAYDEX of
 * 88 used to be read as an SBSS of 88: with only pass and fail available, the
 * absent score had to become a number, and the nearest number was another
 * product's.
 */
export type GateStatus = 'passed' | 'failed' | 'unknown';

export interface MilestoneGate {
  criterion:    string;
  required:     number | string;
  /** Null when the figure this gate reads has never been recorded. */
  actual:       number | string | null;
  status:       GateStatus;
  /**
   * `status === 'passed'`. Kept because callers predate the third state, and
   * because false is the safe reading for both `failed` and `unknown` — a gate
   * that was not measured must not let a client through. Anything that shows a
   * client why they are held back should read `status`, not this.
   */
  passed:       boolean;
  gap:          number | null;  // numeric gap to requirement (null if non-numeric or unknown)
  /** What would answer an unknown gate. Absent when the gate was measured. */
  resolution?:  string;
}

// ── Graduation Assessment ────────────────────────────────────

/**
 * How much of a track this system can assess — a fact about the track, not
 * about the client.
 *
 * `narrow` means the track **lost** a requirement it used to assert, so
 * qualifying for it covers less ground than it did. That is different from a
 * track which never asserted one: Credit Builder and Starter Stack have always
 * carried `businessCredit: null` on purpose, because business credit is not
 * expected at entry. Full Stack and LOC/SBA Bridge did assert it, and no
 * longer do.
 *
 * The distinction matters because a track is a funding-readiness claim an
 * advisor acts on. "Ready for institutional credit" arrived at by deleting a
 * requirement is a stronger statement than the evidence now supports.
 */
export type TrackCoverage = 'full' | 'narrow';

export const TRACK_COVERAGE: Record<GraduationTrack, { coverage: TrackCoverage; note: string | null }> = {
  [GRADUATION_TRACKS.CREDIT_BUILDER]: { coverage: 'full', note: null },
  [GRADUATION_TRACKS.STARTER_STACK]: { coverage: 'full', note: null },
  [GRADUATION_TRACKS.FULL_STACK]: {
    coverage: 'narrow',
    note:
      'This track no longer tests business credit. Its requirement was a FICO '
      + 'SBSS of 50, removed on 2026-08-05: a lender computes SBSS at '
      + 'application, so no client could clear it by any action, and no client '
      + 'here has ever had one. Personal FICO, business age, revenue, '
      + 'tradelines and utilisation are still assessed.',
  },
  [GRADUATION_TRACKS.LOC_SBA_BRIDGE]: {
    coverage: 'narrow',
    note:
      'This track no longer tests business credit. Its requirement was a FICO '
      + 'SBSS of 100, removed on 2026-08-05 for the same reason: a lender '
      + 'computes SBSS at application, and no client here has ever had one. '
      + 'Personal FICO, business age, revenue, tradelines and utilisation are '
      + 'still assessed — but reaching this track is not evidence of business '
      + 'credit strength, because nothing here measures it.',
  },
};

export interface GraduationAssessment {
  businessId:       string;
  currentTrack:     GraduationTrack;
  nextTrack:        GraduationTrack | null;
  /** Coverage of `currentTrack`. See TRACK_COVERAGE. */
  currentTrackCoverage: TrackCoverage;
  currentTrackCoverageNote: string | null;
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

/**
 * A client's business scores, by product.
 *
 * A key that is absent means that score has never been pulled for this client.
 * This replaced a single `businessCreditScore: number` produced by `Math.max`
 * over whatever business profiles existed — PAYDEX 0–100, Intelliscore 1–100
 * and SBSS 0–300 — and then compared against thresholds that are SBSS figures.
 * A PAYDEX of 88 cleared a requirement for an SBSS of 50.
 */
export type BusinessScores = { readonly [K in ScoreType]?: BusinessScore<K> };

/**
 * Record a score under its own product key.
 *
 * A mapped type keyed by product means the key and the score's own
 * `scoreType` cannot disagree: `scores.sbss` is a `BusinessScore<'sbss'>` or
 * nothing. Setting one through this helper keeps that true at the point of
 * construction rather than trusting every call site to line them up.
 */
export function withBusinessScore<T extends ScoreType>(
  scores: BusinessScores,
  scoreType: T,
  value: number,
): BusinessScores {
  return { ...scores, [scoreType]: businessScore(scoreType, value) };
}

export interface GraduationInput {
  /**
   * Each of these is null when the figure has never been recorded.
   *
   * They were plain numbers, and the loader collapsed an absent figure to 0.
   * These four gate on minimums, so a zero fails — the safe direction, which
   * is why it survived. What it cost was the reason: a client with no credit
   * report on file was shown "Personal FICO Score — required 620, actual 0,
   * gap 620", which tells an advisor to raise a catastrophic score rather than
   * to pull a report.
   */
  ficoScore:           number | null;
  businessAgeMonths:   number | null;
  monthlyRevenue:      number | null;
  businessScores:      BusinessScores;
  tradelineCount:      number | null;
  /**
   * Revolving utilisation, or null when none has been recorded.
   *
   * Nullable where the other numeric inputs are not, because this is the one
   * gate that reads as a **maximum**. Collapsing an absent figure to 0 makes
   * every other gate fail — the safe direction — and makes this one *pass*:
   * `0 <= 0.30` is true on every track. An unmeasured client was clearing a
   * requirement nobody had measured.
   */
  currentUtilization:  number | null;
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
 * A gate on a figure this system always holds — a FICO, an age, a count.
 *
 * These have no unknown state: zero revenue is a real answer, and a client
 * with no tradelines genuinely has none. Only scores that must be *pulled*
 * can be absent.
 */
function numericGate(
  criterion: string,
  required: number,
  actual: number | null,
  resolution: string,
): MilestoneGate {
  // Unmeasured is its own status, with no figure and no gap.
  //
  // A gap is the distance to a target, and there is no distance from nothing.
  // Reporting `required - 0` told an advisor a client with no credit report
  // was 620 points short, which is a shortfall they cannot close by improving
  // anything — the first step is to measure it.
  if (actual === null) {
    return { criterion, required, actual: null, status: 'unknown', passed: false, gap: null, resolution };
  }

  const passed = actual >= required;
  return {
    criterion,
    required,
    actual,
    status: passed ? 'passed' : 'failed',
    passed,
    gap: Math.max(0, required - actual),
  };
}

/** How each business score is referred to when the client has not got one. */
const SCORE_LABELS: Partial<Record<ScoreType, string>> = {
  sbss: 'FICO SBSS',
  paydex: 'D&B PAYDEX',
  intelliscore: 'Experian Intelliscore',
  fico: 'FICO',
  vantage: 'VantageScore',
};

/**
 * Products no client or advisor can obtain a report for.
 *
 * FICO SBSS is calculated by FICO when a *lender* requests it, from the
 * owners' personal credit, business bureau data, financials and the
 * application itself. There is no dormant SBSS held about a business, so
 * "pull a report" is not a thing anybody can do — and telling an advisor to
 * do it "same day" describes an errand that does not exist.
 *
 * Everything else here is a record held at a bureau and can be bought.
 * See docs/product/business-credit-scores.md.
 */
const LENDER_COMPUTED: ReadonlySet<ScoreType> = new Set<ScoreType>(['sbss']);

export function isLenderComputed(scoreType: ScoreType): boolean {
  return LENDER_COMPUTED.has(scoreType);
}

function scoreLabel(scoreType: ScoreType): string {
  return SCORE_LABELS[scoreType] ?? scoreType;
}

/**
 * The business-credit gate, read against the one product its threshold names.
 *
 * Absent is `unknown`, and the gate carries what would resolve it. That is the
 * difference the whole change exists for: "this client needs a stronger SBSS"
 * and "nobody has pulled this client's SBSS" are different sentences, and only
 * the first is about the client.
 */
/**
 * Exported for its own tests, not because anything else calls it.
 *
 * No track declares a business-credit threshold since the SBSS gates were
 * removed on 2026-08-05, so this function is currently unreachable through
 * `checkTrackEligibility`. The rules it encodes are still the rules — an
 * absent score is `unknown` rather than `failed`, and the resolution names
 * whether anybody can obtain the product — and they have to keep being
 * provable through a period when no track happens to use them, or they will
 * quietly stop being true before the next track needs them.
 */
export function businessCreditGate<T extends ScoreType>(
  threshold: ScoreThreshold<T>,
  scores: BusinessScores,
): MilestoneGate {
  const label = scoreLabel(threshold.scoreType);
  // Typed as the threshold's own product: the mapped key guarantees the score
  // found here is a score of the thing being required.
  const score = scores[threshold.scoreType] as BusinessScore<T> | undefined;

  if (score === undefined) {
    return {
      criterion: `Business Credit Score (${label})`,
      required: threshold.min,
      actual: null,
      status: 'unknown',
      passed: false,
      gap: null,
      resolution: isLenderComputed(threshold.scoreType)
        ? `No ${label} is on record, and nobody here can obtain one: it is calculated when a lender requests it, from the owners' personal credit, business bureau data, financials and the application. This requirement cannot be measured on demand — it is not a shortfall. Coach the inputs, personal credit first, or ask a lender who has pulled one.`
        : `Pull a ${label} report for this client. No ${label} is on record, so this requirement has not been measured — it is not a shortfall.`,
    };
  }

  const passed = meetsThreshold(threshold, score);
  return {
    criterion: `Business Credit Score (${label})`,
    required: threshold.min,
    actual: score.value,
    status: passed ? 'passed' : 'failed',
    passed,
    gap: Math.max(0, threshold.min - score.value),
  };
}

/**
 * Check whether a client meets all milestones for a specific track.
 */
export function checkTrackEligibility(
  track: GraduationTrack,
  input: GraduationInput,
): { eligible: boolean; gates: MilestoneGate[] } {
  // Annotated, not inferred. TRACK_THRESHOLDS keeps its literal types at the
  // declaration site — that is what makes the scoreType/threshold pairing a
  // compile error rather than a plausible `true`. But every track's
  // businessCredit is currently null, so the inferred literal type of this
  // local is `null`, and TypeScript narrows the non-null branches below to
  // `never`. Widening here keeps the code that reads a threshold reachable and
  // compiling, ready for the first track that declares one again.
  const t: TrackThresholds = TRACK_THRESHOLDS[track];
  const gates: MilestoneGate[] = [];

  // FICO gate
  gates.push(numericGate(
    'Personal FICO Score',
    t.minFicoScore,
    input.ficoScore,
    'No personal FICO is on record, so this requirement has not been measured — it is not a '
      + 'shortfall. Pull a personal credit report for this client.',
  ));

  // Business age gate
  gates.push(numericGate(
    'Business Age (months)',
    t.minBusinessAgeMonths,
    input.businessAgeMonths,
    'No formation date is recorded for this business, so its age has not been measured — it is '
      + 'not a shortfall. Add the date of formation on the client profile.',
  ));

  // Revenue gate
  gates.push(numericGate(
    'Monthly Revenue ($)',
    t.minMonthlyRevenue,
    input.monthlyRevenue,
    'No monthly revenue is recorded for this business, so this requirement has not been measured '
      + '— it is not a shortfall. Record revenue on the client profile.',
  ));

  // Business credit gate — reads the product the threshold names, and only
  // that one. A client with a strong PAYDEX and no SBSS is unknown here, not
  // eligible: a gate asserts the client clears a specific requirement, and
  // another bureau's score on another scale is not evidence about it.
  if (t.businessCredit !== null) {
    gates.push(businessCreditGate(t.businessCredit, input.businessScores));
  }

  // Tradeline count gate
  gates.push(numericGate(
    'Active Positive Tradelines',
    t.minTradelines,
    input.tradelineCount,
    'No business credit profile has been pulled, so trade lines have not been counted — it is '
      + 'not a shortfall. Pull a business credit report to count them.',
  ));

  // Utilization gate (lower is better)
  if (input.currentUtilization === null) {
    // Unknown, and unknown does not pass — the rule stated below this block,
    // which the `?? 0` above it used to break in exactly one direction.
    gates.push({
      criterion: 'Credit Utilization (max)',
      required:  `≤ ${(t.maxUtilization * 100).toFixed(0)}%`,
      actual:    null,
      status:    'unknown',
      passed:    false,
      gap:       null,
      resolution:
        'No utilisation is on record for this client, so this requirement has not been '
        + 'measured — it is not a shortfall. Pull a personal credit report to measure it.',
    });
  } else {
    const utilisationPasses = input.currentUtilization <= t.maxUtilization;
    gates.push({
      criterion: 'Credit Utilization (max)',
      required:  `≤ ${(t.maxUtilization * 100).toFixed(0)}%`,
      actual:    `${(input.currentUtilization * 100).toFixed(1)}%`,
      status:    utilisationPasses ? 'passed' : 'failed',
      passed:    utilisationPasses,
      gap:       null,
    });
  }

  // Unknown does not pass. A track is a statement that the client clears every
  // requirement, and "we did not measure that one" is not clearing it.
  const eligible = gates.every((g) => g.status === 'passed');
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
  return idx >= 0 && idx < progression.length - 1 ? progression[idx + 1]! : null;
}

/**
 * Estimate months until a client qualifies for the next track.
 * Uses conservative linear projections per metric.
 */
export function estimateMonthsToNextTrack(
  input:     GraduationInput,
  nextTrack: GraduationTrack,
  /**
   * The thresholds to measure against. Defaults to the track's own.
   *
   * A seam, added because the null-not-zero guard below became unreachable
   * when the SBSS gates were removed on 2026-08-05: it fires only when a track
   * declares a business-credit threshold, and none does. The rule still
   * matters — it exists because a client who cleared every measurable gate
   * with no score on record was told "Estimated 0 months at the current rate",
   * and zero means "nothing left to close" — so it needs to stay exercised
   * through a period when no track happens to use it.
   *
   * Recorded in docs/gaps.md as an untested guard until this existed.
   * Production callers pass nothing and behave exactly as before.
   */
  thresholds: TrackThresholds = TRACK_THRESHOLDS[nextTrack],
): number | null {
  const t: TrackThresholds = thresholds;
  let maxMonths = 0;

  // FICO improvement: ~5–8 pts/month with consistent on-time payments
  if (input.ficoScore !== null && input.ficoScore < t.minFicoScore) {
    const gap = t.minFicoScore - input.ficoScore;
    maxMonths = Math.max(maxMonths, Math.ceil(gap / 6));
  }

  // Business age is fixed — it just takes time
  if (input.businessAgeMonths !== null && input.businessAgeMonths < t.minBusinessAgeMonths) {
    const gap = t.minBusinessAgeMonths - input.businessAgeMonths;
    maxMonths = Math.max(maxMonths, gap);
  }

  // Revenue growth: assume 5% monthly growth rate
  if (
    input.monthlyRevenue !== null
    && input.monthlyRevenue < t.minMonthlyRevenue
    && input.monthlyRevenue > 0
  ) {
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
  if (input.tradelineCount !== null && input.tradelineCount < t.minTradelines) {
    const gap = t.minTradelines - input.tradelineCount;
    maxMonths = Math.max(maxMonths, Math.ceil(gap / 1.5));
  }

  // Business credit: ~10–15 pts/month with active trade accounts.
  //
  // Only when the score is on record. A client whose SBSS has never been
  // pulled has no gap to close at 12 points a month — the wait is a report,
  // not months of building, and projecting one from an absence is how a
  // timeline comes to promise something nobody measured.
  if (t.businessCredit !== null) {
    const score = input.businessScores[t.businessCredit.scoreType];
    if (score !== undefined && !meetsThreshold(t.businessCredit, score)) {
      const gap = t.businessCredit.min - score.value;
      maxMonths = Math.max(maxMonths, Math.ceil(gap / 12));
    }
  }

  // Null, not zero, when a requirement was never measured.
  //
  // Zero means "nothing left to close". An unmeasured gate closes nothing —
  // it contributes no months because there is no gap to project from, and
  // returning 0 would report a client as ready for a track they have not been
  // assessed against. The signature has always allowed null; nothing produced
  // it until a gate could be unknown.
  //
  // Surfaced by giving the seed real trade-line arrays: a client cleared every
  // measurable gate for Full Stack with no SBSS on record, and the panel
  // offered "Estimated 0 months at the current rate."
  if (t.businessCredit !== null && input.businessScores[t.businessCredit.scoreType] === undefined) {
    return null;
  }

  // The same rule, extended to the four numeric requirements when they were
  // widened to nullable. Each used to arrive as 0, so an unmeasured FICO
  // projected a 104-month climb from zero — a number, confidently wrong —
  // and an unmeasured revenue skipped its branch silently. Neither is an
  // estimate; both are the absence of one.
  if (
    input.ficoScore === null
    || input.businessAgeMonths === null
    || input.monthlyRevenue === null
    || input.tradelineCount === null
    || input.currentUtilization === null
  ) {
    return null;
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
  const t: TrackThresholds = TRACK_THRESHOLDS[nextTrack];
  const actions: RoadmapAction[] = [];
  let priority = 1;

  // Utilization — fastest win, highest impact.
  //
  // No action when it has never been measured: "reduce utilisation from 0.0%"
  // is advice built on an absence, and the honest first step is to measure it.
  if (input.currentUtilization === null) {
    actions.push({
      priority: priority++,
      category: 'utilization',
      action:   'Pull a personal credit report — no utilisation is on record, so this requirement cannot be assessed',
      impact:   'Utilisation gates every track; until it is measured this client cannot be cleared for one',
      timelineEstimate: 'Immediate',
    });
  } else if (input.currentUtilization > t.maxUtilization) {
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

  // Business credit — two different actions, because there are two different
  // situations. Telling an advisor to raise a score nobody has pulled sends
  // them to build something for months when the answer is a report.
  const bizCreditGate = failingGates.find((g) => g.criterion.startsWith('Business Credit Score'));
  if (bizCreditGate && bizCreditGate.status === 'unknown') {
    actions.push({
      priority: priority++,
      category: 'business_credit',
      action:   bizCreditGate.resolution
        ?? `Pull the business credit report this track requires (target: ${bizCreditGate.required})`,
      impact:   'This requirement has not been measured for this client — it is not a shortfall',
      // "Same day" is true of a report somebody can buy this afternoon. It is
      // false of a lender-computed score, where the honest answer is that no
      // amount of time spent by this advisor produces one.
      timelineEstimate:
        t.businessCredit && isLenderComputed(t.businessCredit.scoreType)
          ? 'Not obtainable on demand'
          : 'Same day',
    });
  } else if (bizCreditGate && bizCreditGate.status === 'failed') {
    const gap = typeof bizCreditGate.gap === 'number' ? bizCreditGate.gap : 0;
    const product = t.businessCredit ? scoreLabel(t.businessCredit.scoreType) : 'business credit';
    actions.push({
      priority: priority++,
      category: 'business_credit',
      action:   `Increase ${product} by ${gap} points (target: ${bizCreditGate.required})`,
      impact:   'Required for Full Stack and LOC/SBA tracks; lenders weight this heavily',
      timelineEstimate: gap > 0 ? `${Math.ceil(gap / 15)}–${Math.ceil(gap / 10)} months` : 'Unknown',
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
    currentTrackCoverage: TRACK_COVERAGE[currentTrack].coverage,
    currentTrackCoverageNote: TRACK_COVERAGE[currentTrack].note,
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
  // Null when no formation date is recorded — not a business aged zero months.
  const ageMonths = business.dateOfFormation
    ? Math.floor(
        (Date.now() - business.dateOfFormation.getTime()) /
          (1000 * 60 * 60 * 24 * 30.44),
      )
    : null;

  // Extract best personal FICO
  const personalProfiles = business.creditProfiles.filter(
    (p) => p.profileType === 'personal' && p.scoreType === 'fico',
  );
  // The highest *recorded* FICO, or null when none is.
  //
  // Was `personalProfiles.length > 0 ? Math.max(...map(p => p.score ?? 0)) : 0`,
  // which collapsed twice: `?? 0` fed an unscored profile row into the max as
  // zero, and the empty case returned zero rather than nothing. The same
  // expression was fixed in credit-optimizer.ts and left standing here and in
  // the sibling service — a threshold consumer the original change did not
  // sweep for.
  const recordedFico = personalProfiles
    .map((p) => p.score)
    .filter((v): v is number => v !== null);
  const ficoScore = recordedFico.length > 0 ? Math.max(...recordedFico) : null;

  // The latest score of each business product, kept apart.
  //
  // This was `Math.max` over every business profile — PAYDEX 0–100,
  // Intelliscore 1–100, SBSS 0–300 — producing one number that was then
  // compared against thresholds that are SBSS figures. A PAYDEX of 88 cleared
  // a requirement for an SBSS of 50. There was no way for the comparison to
  // notice, because a number cannot say which product it is a number of.
  //
  // Each threshold now names its product, so nothing has to be flattened, and
  // a product the client has never been scored on is simply absent.
  const bizProfiles = business.creditProfiles
    .filter((p) => p.profileType === 'business')
    .sort((a, b) => b.pulledAt.getTime() - a.pulledAt.getTime());

  let businessScores: BusinessScores = {};
  for (const p of bizProfiles) {
    if (!p.scoreType || p.score === null) continue;
    const scoreType = p.scoreType as ScoreType;
    // Latest wins: the list is newest-first, so the first of each product is
    // the current one.
    if (businessScores[scoreType] === undefined) {
      businessScores = withBusinessScore(businessScores, scoreType, p.score);
    }
  }

  // Tradeline count from most recent business profile
  const latestBizProfile = bizProfiles[0] ?? null;
  const tradelines = latestBizProfile?.tradelines as Record<string, unknown>[] | null;
  // Null when no business profile has been pulled at all. Zero trade lines
  // reporting and no report to read them from are different findings, and only
  // the first is the client's to fix.
  const tradelineCount = latestBizProfile === null
    ? null
    : (Array.isArray(tradelines) ? tradelines.length : 0);

  // Utilization from most recent personal profile
  const latestPersonal = personalProfiles[0] ?? null;
  // Null, not 0. See the field comment on GraduationInput: this is the only
  // gate that reads as a maximum, so an absent figure collapsed to zero was
  // the one collapse that granted eligibility instead of withholding it.
  //
  // `?.utilization ? ... : 0` also treated a genuine 0% as absent, because 0
  // is falsy — so the two states were folded together from both ends.
  const currentUtilization =
    latestPersonal?.utilization == null ? null : Number(latestPersonal.utilization);

  // Null when none is recorded — not a business earning nothing.
  const monthlyRevenue =
    business.monthlyRevenue == null ? null : Number(business.monthlyRevenue);

  const input: GraduationInput = {
    ficoScore,
    businessAgeMonths:   ageMonths,
    monthlyRevenue,
    businessScores,
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

  await recordTrackObservation(businessId, tenantId, assessment.currentTrack);

  logger.info('[GraduationEngine] Auto-assessed graduation', {
    businessId,
    currentTrack: assessment.currentTrack,
    nextTrack:    assessment.nextTrack,
    eligible:     assessment.nextTrackEligible,
  });

  return assessment;
}

/**
 * Record that this client was observed on a track, when it differs from the
 * last observation.
 *
 * Writes a baseline row on first sight (`fromTrack` null) and a transition row
 * whenever the track changes. Nothing is written when the track is unchanged,
 * so repeated assessments do not accumulate rows.
 *
 * The honest limit, and it is the reason `graduationRate` reports what it
 * reports: this runs when a client is assessed, and a client nobody assesses
 * is never observed. Coverage is therefore the set of clients somebody looked
 * at, not the book. The rate says so rather than dividing by the book and
 * publishing a number that only ever understates.
 */
async function recordTrackObservation(
  businessId: string,
  tenantId:   string,
  currentTrack: GraduationTrack,
): Promise<void> {
  const prisma = getPrisma();

  try {
    const last = await prisma.graduationEvent.findFirst({
      where: { businessId, tenantId },
      orderBy: { observedAt: 'desc' },
      select: { toTrack: true },
    });

    if (last?.toTrack === currentTrack) return;

    await prisma.graduationEvent.create({
      data: {
        tenantId,
        businessId,
        fromTrack: last?.toTrack ?? null,
        toTrack: currentTrack,
      },
    });

    logger.info('[GraduationEngine] Track observation recorded', {
      businessId,
      from: last?.toTrack ?? null,
      to: currentTrack,
    });
  } catch (err) {
    // An assessment that cannot be recorded is still a valid assessment. The
    // caller asked what track this client is on, and failing their request
    // because a history row could not be written would trade the answer they
    // wanted for bookkeeping they did not ask about.
    logger.error('[GraduationEngine] Could not record track observation', { businessId, err });
  }
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
