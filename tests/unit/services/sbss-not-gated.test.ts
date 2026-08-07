// ============================================================
// Nothing gates or projects on SBSS
//
// FICO computes SBSS when a lender requests it. It is not a record held about
// a business, so no client can obtain one, and a `scoreType = 'sbss'` count
// against this database returns zero. Seven sites nonetheless gated tiers on
// it, ranked clients against it, or projected an unlock date from a monthly
// gain rate for it. All seven were fixed across 2026-08-05 and 2026-08-06.
//
// These assertions exist because the fix was invisible: `docs/gaps.md` went on
// listing all seven as live for two days after they were closed, and the next
// reader would have spent a day re-fixing them. A test says what a document
// cannot — whether the property still holds today.
//
// Each one asserts a property rather than a wording, so a rewrite of the
// surrounding code fails here only if the behaviour actually comes back.
// ============================================================

import { describe, it, expect } from 'vitest';
import type { GraduationInput } from '../../../src/backend/services/client-graduation.service';
import {
  buildCreditRoadmap,
  evaluateStackingUnlock,
} from '../../../src/backend/services/credit-builder.service';
import { isLenderComputed } from '../../../src/backend/services/client-graduation.service';
import {
  assessStackingCriteria,
  assessTiers,
} from '../../../src/backend/services/stacking-criteria.service';
import type { CreditFacts } from '../../../src/backend/services/credit-facts';
import { TRACK_THRESHOLDS } from '../../../src/backend/services/client-graduation.service';

/**
 * Every CreditFacts field absent.
 *
 * Typed rather than cast. The first version cast a partial object, so
 * `equifaxOneScore` was `undefined` instead of null, `undefined !== null` took
 * the branch meaning "a OneScore is on record", and sc_006 reported one "of
 * undefined". A cast on a fixture turns off the one check that would have said
 * so — the same shape as the `as any` that lets a mock drift from the thing it
 * stands in for.
 */
const BLANK_FACTS: CreditFacts = {
  addressLine1: null,
  city: null,
  state: null,
  zip: null,
  phoneNumber: null,
  dnbTradelineCount: 0,
  paydex: null,
  paydexPulledAt: null,
  sbss: null,
  sbssPulledAt: null,
  intelliscore: null,
  intelliscorePulledAt: null,
  equifaxBusinessRisk: null,
  equifaxBusinessRiskPulledAt: null,
  equifaxOneScore: null,
  businessAgeMonths: null,
  submittedApplicationCount: 0,
};

/** A client with real business scores and, like every real client, no SBSS. */
const NO_SBSS: GraduationInput = {
  businessScores: {
    paydex: { scoreType: 'paydex', value: 88 },
    experian_business: { scoreType: 'experian_business', value: 76 },
  },
  tradelineCount: 5,
  businessAgeMonths: 36,
} as unknown as GraduationInput;

describe('a client with no SBSS is unassessable, not zero', () => {
  it('offers no "next milestone" rather than the bottom rung', () => {
    // `?? 0` picked the milestone above zero, which reads as a statement about
    // the client — they are at the start of this ladder — when nobody has
    // measured them against it and nobody can.
    const roadmap = buildCreditRoadmap('biz-1', 'consulting', NO_SBSS);
    expect(roadmap.currentSbssTarget).toBeNull();
  });

  it('estimates no completion date from an absence', () => {
    // This returned 6 months for every client whose next milestone could not
    // be identified — which, since no client has ever had an SBSS, was all of
    // them. A locked client got "about 6 months" as a fact about their file.
    const roadmap = buildCreditRoadmap('biz-1', 'consulting', NO_SBSS);
    expect(roadmap.estimatedCompletionMonths).toBeNull();
  });

  it('does not resolve any tier by way of an SBSS threshold', () => {
    const unlock = evaluateStackingUnlock(NO_SBSS);
    const serialised = JSON.stringify(unlock).toLowerCase();
    expect(serialised).not.toContain('sbss');
  });
});

describe('no surface carries an SBSS threshold', () => {
  // Asserted against the values these modules publish, not against their
  // source text. The first version of this file grepped the files and failed
  // on the comments that document the removal — a test that cannot tell a
  // fixed defect from a description of one is not a test.

  it('has no SBSS criterion in the stacking tiers', () => {
    // Assessed for a client carrying an SBSS, which is the case that would
    // reveal a surviving gate. Nothing produced may mention it.
    // The differential is the property: recording an SBSS must change
    // nothing. Asserting the output merely omits the string "sbss" is weaker
    // and also wrong — tier 3 carries a note explaining that its credit gate
    // was removed *because* it required one, which is exactly the kind of
    // honest sentence a blunt search would force out of the codebase.
    const base: CreditFacts = { ...BLANK_FACTS, paydex: 82, dnbTradelineCount: 6 };
    const withSbss: CreditFacts = {
      ...base,
      sbss: 190,
      sbssPulledAt: new Date('2026-01-01'),
    };

    expect(assessTiers(assessStackingCriteria(withSbss, true))).toEqual(
      assessTiers(assessStackingCriteria(base, true)),
    );

    // And a catastrophic SBSS is equally inert, so nothing reads it as a
    // reason to withhold a tier either.
    const withBadSbss: CreditFacts = { ...base, sbss: 20, sbssPulledAt: new Date('2026-01-01') };
    expect(assessTiers(assessStackingCriteria(withBadSbss, true))).toEqual(
      assessTiers(assessStackingCriteria(base, true)),
    );
  });

  it('has no SBSS threshold on any graduation track', () => {
    for (const [track, thresholds] of Object.entries(TRACK_THRESHOLDS)) {
      const credit = (thresholds as { businessCredit: unknown }).businessCredit;
      if (credit === null || credit === undefined) continue;
      expect(
        (credit as { scoreType?: string }).scoreType,
        `${track} still gates on a score type a client cannot obtain`,
      ).not.toBe('sbss');
    }
  });

  it('marks SBSS as lender-computed, so a surface can say why it is absent', () => {
    // The other half of not gating on it: a blank where a score should be
    // reads as a missing figure. This is what lets a panel say the score is
    // not one the client can hold.
    expect(isLenderComputed('sbss')).toBe(true);
    expect(isLenderComputed('paydex')).toBe(false);
  });
});

describe('the collapses that made an absent score look like a bad one', () => {
  it('does not fold a missing SBSS into a roadmap as a zero', () => {
    // Behaviour, not grep: a client with no SBSS and a strong PAYDEX must not
    // come back positioned at the bottom of the SBSS ladder.
    const roadmap = buildCreditRoadmap('biz-2', 'retail', NO_SBSS);
    expect(roadmap.currentSbssTarget).toBeNull();
    expect(roadmap.estimatedCompletionMonths).toBeNull();
  });

  it('ranks a client with no SBSS no differently from one never asked', () => {
    const withNothing = buildCreditRoadmap('biz-3', 'retail', {
      ...NO_SBSS,
      businessScores: {},
    } as unknown as GraduationInput);
    expect(withNothing.currentSbssTarget).toBeNull();
  });
});
