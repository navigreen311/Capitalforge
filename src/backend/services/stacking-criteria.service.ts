// ============================================================
// CapitalForge — stacking unlock criteria
//
// What a client has to satisfy before each tier of card stacking. The page
// listed all eight with a hardcoded status of "unknown" and `allMet = false`
// beside them, so it had shown "8 stacking criteria, none assessed" to every
// client since it was written.
//
// Seven of the eight can be answered from data this system already holds, and
// they are answered from the same `CreditFacts` the DUNS track derives its
// steps from — sc_002 and step 4 are the same question about trade lines,
// sc_003 and step 5 the same question about PAYDEX, and asking them separately
// is how two numbers on one page come to disagree.
//
// The eighth cannot be answered at all, and says so rather than defaulting to
// "not met". A criterion nothing can assess and a criterion a client fails are
// different facts about the client, and only one of them is their problem.
// ============================================================

import type { CreditFacts } from './credit-facts.js';

/**
 * Four states, because there are four things that can be true.
 *
 * `unknown` — the figure it needs has never been pulled for this client.
 * `unassessable` — nothing in this system produces that figure for anybody.
 *
 * Collapsing either into `not_met` would tell an advisor their client had
 * failed a threshold nobody measured them against.
 */
export type CriterionStatus = 'met' | 'not_met' | 'unknown' | 'unassessable';

export interface StackingCriterion {
  id: string;
  label: string;
  description: string;
  requiredForTier: 1 | 2 | 3;
  status: CriterionStatus;
  /** What the assessment read, or why it could not be made. */
  basis: string;
}

/**
 * How much of a tier this system can assess at all — a fact about the tier,
 * not about any client.
 *
 * `narrow` says the tier lost requirements because they could not be measured,
 * so a full house of ticks covers less ground than it appears to. Tier 3 is
 * the case: its credit-strength gate required a FICO SBSS, which a lender
 * computes at application and no client can obtain.
 *
 * Deliberately declared rather than inferred from the criterion count. It is a
 * statement about what was removed and why, and nothing in the data records
 * that.
 */
export type TierCoverage = 'full' | 'narrow';

export interface TierAssessment {
  tier: 1 | 2 | 3;
  criteria: StackingCriterion[];
  met: number;
  total: number;
  /**
   * Broken out rather than left to `total - met`, because that subtraction is
   * where the provenance goes missing. "2 of 4 met" is the same fraction
   * whether the other two fell short or were never measurable, and those are
   * different conversations with the client.
   */
  notMet: number;
  notYetMeasured: number;
  cannotAssess: number;
  /**
   * Unlocked only when every criterion in the tier is met. An unknown or an
   * unassessable one leaves it locked: a tier is a statement that the client
   * clears every requirement, and "we did not check" is not clearing it.
   */
  unlocked: boolean;
  /**
   * Never render a narrow tier as complete, however its criteria land. A green
   * card for a tier that went green by having requirements deleted is the same
   * defect as a count that hides what produced it — in the channel a reader
   * takes in first.
   */
  coverage: TierCoverage;
  coverageNote: string | null;
  /** Why it is not unlocked, when it is not. */
  blockedBy: string[];
}

export const TIER_1_TRADELINES = 5;
export const TIER_1_PAYDEX = 80;
export const TIER_2_INTELLISCORE = 60;
/** On the Equifax Business Credit Risk scale, 101–992. */
export const TIER_2_EQUIFAX_RISK = 500;
export const TIER_3_BUSINESS_AGE_MONTHS = 24;

/**
 * What this system can and cannot assess per tier, in the words an advisor
 * reads. Null where the tier's requirements are all measurable.
 */
const TIER_COVERAGE: Record<1 | 2 | 3, { coverage: TierCoverage; note: string | null }> = {
  1: { coverage: 'full', note: null },
  2: { coverage: 'full', note: null },
  3: {
    coverage: 'narrow',
    note:
      'Business age is the only Tier 3 requirement this system can assess. The '
      + 'credit-strength gate was removed on 2026-08-05: it required a FICO SBSS, '
      + 'which a lender computes at application and no client can obtain, at a '
      + 'threshold the SBA retired. Meeting this tier is not evidence of credit '
      + 'strength — nothing here measures it.',
  },
};

/**
 * Assess a score against a threshold.
 *
 * Null is `unknown`, never `not_met`: `null >= 140` is false in JavaScript,
 * and a criterion that leaned on that would report a client as failing a
 * threshold nobody has measured them against.
 */
function assessScore(
  score: number | null,
  threshold: number,
  productName: string,
): { status: CriterionStatus; basis: string } {
  if (score === null) {
    return { status: 'unknown', basis: `No ${productName} on record for this client` };
  }
  if (score >= threshold) {
    return { status: 'met', basis: `${productName} ${score}, needs ${threshold}` };
  }
  return { status: 'not_met', basis: `${productName} ${score}, needs ${threshold}` };
}

/**
 * The eight criteria, assessed.
 *
 * `dunsAttested` is step 1 of the DUNS track — an advisor's claim that a
 * D-U-N-S number was registered. Nothing here can verify one, so sc_001 is the
 * one criterion built from an attestation and a fact together, and its basis
 * says which half is missing.
 */
export function assessStackingCriteria(
  facts: CreditFacts,
  dunsAttested: boolean,
): StackingCriterion[] {
  const criteria: StackingCriterion[] = [];

  // ── sc_001 — DUNS registered, and a D&B file that is live ──
  const dnbActive = facts.dnbTradelineCount >= 1;
  criteria.push({
    id: 'sc_001',
    label: 'DUNS Registered & Active',
    description: 'D-U-N-S Number registered and at least 1 D&B tradeline reporting.',
    requiredForTier: 1,
    status: dunsAttested && dnbActive ? 'met' : 'not_met',
    basis: dunsAttested
      ? dnbActive
        ? `DUNS confirmed by an advisor · ${facts.dnbTradelineCount} D&B trade line${facts.dnbTradelineCount === 1 ? '' : 's'} reporting`
        : 'DUNS confirmed by an advisor, but no trade line reports to D&B yet'
      : dnbActive
        ? `${facts.dnbTradelineCount} D&B trade line${facts.dnbTradelineCount === 1 ? '' : 's'} reporting, but no advisor has confirmed the DUNS registration`
        : 'No advisor has confirmed the DUNS registration, and no trade line reports to D&B',
  });

  // ── sc_002 — five trade lines. Step 4 of the DUNS track. ──
  criteria.push({
    id: 'sc_002',
    label: '5+ Net-30 Trade Lines',
    description: 'Minimum 5 open trade lines with positive payment history.',
    requiredForTier: 1,
    status: facts.dnbTradelineCount >= TIER_1_TRADELINES ? 'met' : 'not_met',
    basis: `${facts.dnbTradelineCount} of ${TIER_1_TRADELINES} trade lines reporting to D&B`,
  });

  // ── sc_003 — PAYDEX 80. Step 5 of the DUNS track. ──
  const paydex = assessScore(facts.paydex, TIER_1_PAYDEX, 'PAYDEX');
  criteria.push({
    id: 'sc_003',
    label: 'Paydex Score ≥ 80',
    description: 'D&B Paydex at or above 80 (on-time payment average).',
    requiredForTier: 1,
    ...paydex,
  });

  // sc_004 was "SBSS ≥ 140 — at or above SBA pre-screen threshold", gating
  // Tier 2. Removed 2026-08-05, for two independent reasons either of which
  // would have been sufficient:
  //
  //  - No client can obtain an SBSS. FICO computes it when a lender requests
  //    it, from an application. A gate nobody can clear by any action is not a
  //    requirement, it is a wall.
  //  - The threshold had not existed for years. 140 became 155 in Oct 2020 and
  //    165 in Jun 2025, and the SBA retired the pre-screen entirely on
  //    2026-03-01 (Procedural Notices 5000-875701 and 5000-876777).
  //
  // A query on 2026-08-05 found zero rows of scoreType 'sbss' in the database,
  // so this criterion had never been assessed for any client since it was
  // written. Tier 2 keeps Intelliscore and Equifax Business Risk, both of
  // which measure credit strength and both of which a client can obtain.
  //
  // See docs/product/business-credit-scores.md.

  // ── sc_005 — Experian's business score ──
  //
  // Assessable only since business pulls stopped being written as `sbss`
  // whatever bureau produced them. Experian's product is Intelliscore Plus,
  // and until it carried that name nothing in any database could satisfy this.
  criteria.push({
    id: 'sc_005',
    label: 'Experian Intelliscore ≥ 60',
    description: 'Experian Business Intelliscore in good standing.',
    requiredForTier: 2,
    ...assessScore(facts.intelliscore, TIER_2_INTELLISCORE, 'Intelliscore'),
  });

  // ── sc_006 — Equifax's own business product ──
  //
  // Unassessable until the Equifax business adapter stopped writing `sbss`:
  // nothing produced the score this reads, so it could not be satisfied by any
  // client and said so rather than reporting a failure. The adapter now writes
  // its own Business Credit Risk Score, 101–992.
  criteria.push({
    id: 'sc_006',
    label: 'Equifax Business Credit ≥ 500',
    description: 'Equifax Business Risk Score above 500.',
    requiredForTier: 2,
    ...assessScore(facts.equifaxBusinessRisk, TIER_2_EQUIFAX_RISK, 'Equifax Business Risk'),
  });

  // ── sc_007 — two years of trading ──
  criteria.push({
    id: 'sc_007',
    label: '2+ Years Business Age',
    description: 'Business entity must show 2+ years on credit reports.',
    requiredForTier: 3,
    status:
      facts.businessAgeMonths === null
        ? 'unknown'
        : facts.businessAgeMonths >= TIER_3_BUSINESS_AGE_MONTHS
          ? 'met'
          : 'not_met',
    basis:
      facts.businessAgeMonths === null
        ? 'No formation date recorded for this business'
        : `${facts.businessAgeMonths} months since formation, needs ${TIER_3_BUSINESS_AGE_MONTHS}`,
  });

  // sc_008 was "SBSS ≥ 175", gating Tier 3. Removed 2026-08-05 for the same
  // reasons as sc_004, and with less standing: 175 had no SBA basis at all —
  // it was neither 140, 155 nor 165, and no source for it was found.
  //
  // Removing it leaves Tier 3 with one assessable requirement, which is why
  // TIER_COVERAGE marks the tier narrow. That is stated on the page rather
  // than padded out with placeholder criteria: the tier really does assess one
  // thing, and pretending otherwise would be the same dishonesty pointed the
  // other way.

  return criteria;
}

/** Group the assessed criteria by tier, and say what each tier is waiting on. */
export function assessTiers(criteria: StackingCriterion[]): TierAssessment[] {
  return ([1, 2, 3] as const).map((tier) => {
    const forTier = criteria.filter((c) => c.requiredForTier === tier);
    const count = (s: CriterionStatus) => forTier.filter((c) => c.status === s).length;
    const met = count('met');
    const { coverage, note } = TIER_COVERAGE[tier];

    return {
      tier,
      criteria: forTier,
      met,
      total: forTier.length,
      notMet: count('not_met'),
      notYetMeasured: count('unknown'),
      cannotAssess: count('unassessable'),
      unlocked: forTier.length > 0 && met === forTier.length,
      coverage,
      coverageNote: note,
      // Named, not counted. "2 of 3" does not tell an advisor whether the
      // third is something the client can act on.
      blockedBy: forTier.filter((c) => c.status !== 'met').map((c) => c.label),
    };
  });
}
