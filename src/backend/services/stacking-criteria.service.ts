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

export interface TierAssessment {
  tier: 1 | 2 | 3;
  criteria: StackingCriterion[];
  met: number;
  total: number;
  /**
   * Unlocked only when every criterion in the tier is met. An unknown or an
   * unassessable one leaves it locked: a tier is a statement that the client
   * clears every requirement, and "we did not check" is not clearing it.
   */
  unlocked: boolean;
  /** Why it is not unlocked, when it is not. */
  blockedBy: string[];
}

export const TIER_1_TRADELINES = 5;
export const TIER_1_PAYDEX = 80;
export const TIER_2_SBSS = 140;
export const TIER_2_INTELLISCORE = 60;
export const TIER_3_BUSINESS_AGE_MONTHS = 24;
export const TIER_3_SBSS = 175;

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

  // ── sc_004 — SBSS at the SBA pre-screen threshold ──
  criteria.push({
    id: 'sc_004',
    label: 'SBSS ≥ 140',
    description: 'FICO SBSS score at or above SBA pre-screen threshold.',
    requiredForTier: 2,
    ...assessScore(facts.sbss, TIER_2_SBSS, 'SBSS'),
  });

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

  // ── sc_006 — the one nothing can answer ──
  //
  // No pull path produces an Equifax business risk score. The Equifax business
  // adapter writes an SBSS, which is FICO's product on a different scale, so
  // there is no figure to compare against 500 — for this client or any other.
  // Reported as unassessable rather than not met: the client has not failed
  // anything.
  criteria.push({
    id: 'sc_006',
    label: 'Equifax Business Credit ≥ 500',
    description: 'Equifax Business Risk Score above 500.',
    requiredForTier: 2,
    status: 'unassessable',
    basis:
      'No Equifax business risk score is produced anywhere in this system — '
      + 'the Equifax business pull writes an SBSS. Nothing to assess, for any client.',
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

  // ── sc_008 — SBSS at the Tier 3 unlock ──
  criteria.push({
    id: 'sc_008',
    label: 'SBSS ≥ 175',
    description: 'FICO SBSS at Tier 3 stacking unlock threshold.',
    requiredForTier: 3,
    ...assessScore(facts.sbss, TIER_3_SBSS, 'SBSS'),
  });

  return criteria;
}

/** Group the assessed criteria by tier, and say what each tier is waiting on. */
export function assessTiers(criteria: StackingCriterion[]): TierAssessment[] {
  return ([1, 2, 3] as const).map((tier) => {
    const forTier = criteria.filter((c) => c.requiredForTier === tier);
    const met = forTier.filter((c) => c.status === 'met').length;

    return {
      tier,
      criteria: forTier,
      met,
      total: forTier.length,
      unlocked: forTier.length > 0 && met === forTier.length,
      // Named, not counted. "2 of 3" does not tell an advisor whether the
      // third is something the client can act on.
      blockedBy: forTier.filter((c) => c.status !== 'met').map((c) => c.label),
    };
  });
}
