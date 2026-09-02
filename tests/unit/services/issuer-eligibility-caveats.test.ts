// ============================================================
// Issuer eligibility — what the verdict rests on
//
// `eligible: true` is the absence of a violation, and an absence has a
// denominator. The cross-issuer velocity rules — Chase 5/24 and its relatives
// — count `CardApplication` rows created in this system, and **nothing here
// records a card a client already held**. No model exists for one:
// `CardApplication` is an application made through CapitalForge, so a client
// who arrived with four bank cards opened elsewhere counts as zero.
//
// The count is therefore a floor, and it errs permissively: the advisor is
// told there is room, the client applies, and the auto-decline is the first
// anyone hears of the four cards.
//
// A warning banner was the wrong shape — it would fire for every client,
// always, and be read as decoration within a week. The caveat states the basis
// of the number instead, the same reason `creditUnionCardsExcludedFrom524` is
// reported rather than silently subtracted.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  buildCaveats,
  CROSS_ISSUER_VELOCITY_RULE,
  type EligibilityContext,
} from '../../../src/backend/services/issuer-rules-engine';

// The two halves default to a reconciling split — everything from
// applications, nothing held — because the breakdown now refuses to guess a
// half it was not given, and most of these cases are about other clauses.
// The cases that ARE about a missing half pass `undefined` explicitly.
const context = (over: Partial<EligibilityContext> = {}): EligibilityContext => {
  const base = {
    newCardsLast24Months: 2,
    issuerAppsInPeriod: 0,
    lastApplicationDate: null,
    lastDeclineDate: null,
    creditScore: 720,
    inquiriesLast6Months: 0,
    inquiriesLast12Months: 0,
    utilization: 0.2,
    businessAgeMonths: 24,
    annualRevenue: 250_000,
    openCardsWithIssuer: 0,
    hasExistingRelationship: false,
    totalAppsInPeriod: 0,
    previousProducts: [],
    ...over,
  } as EligibilityContext;
  if (!('fiveTwentyFourFromApplications' in over)) {
    base.fiveTwentyFourFromApplications = base.newCardsLast24Months;
  }
  if (!('fiveTwentyFourFromHeldCards' in over)) {
    base.fiveTwentyFourFromHeldCards = 0;
  }
  return base;
};

// The literal the engine's own switch dispatches on, imported rather than
// retyped. An earlier draft of this file used 'velocity' — a rule type this
// engine has never emitted — and the test passed, because it asserted the
// same wrong string the code did. A test that repeats the assumption it is
// meant to check is not a check.
const velocityRule = (periodDays: number) => ({
  ruleType: CROSS_ISSUER_VELOCITY_RULE,
  periodDays,
});

describe('buildCaveats — cross-issuer velocity', () => {
  it('says what the 5/24 count was drawn from', () => {
    const caveats = buildCaveats([velocityRule(730)], context({ newCardsLast24Months: 2 }));

    expect(caveats).toHaveLength(1);
    expect(caveats[0]!.subject).toMatch(/5\/24/);
    // The wording gained a breakdown when held cards became a record: the
    // total now names its two sources, because they have different provenance
    // — one is what this system did, the other is what an advisor was told.
    expect(caveats[0]!.basis).toMatch(/Counted 2 cards/);
    expect(caveats[0]!.basis).toMatch(/2 from applications recorded in CapitalForge/);
    expect(caveats[0]!.basis).toMatch(/from cards the client is recorded as already holding/);
    // The half that matters: the limits of the number, not just its value.
    // Held cards are attestations, so the figure is only as good as the entry.
    expect(caveats[0]!.basis).toMatch(/advisor attestations rather than a bureau pull/);
    expect(caveats[0]!.basis).toMatch(/a card nobody recorded is still invisible/);
  });

  it('names the direction of the error', () => {
    // An advisor needs to know which way to be wrong. This count can only be
    // too low, which is the dangerous direction — it reads as headroom.
    const caveats = buildCaveats([velocityRule(730)], context());
    expect(caveats[0]!.direction).toBe('may_understate');
  });

  it('reports the credit-union exemption inside the basis', () => {
    const caveats = buildCaveats(
      [velocityRule(730)],
      context({ newCardsLast24Months: 3, creditUnionCardsExcludedFrom524: 2 }),
    );

    // A count that is simply smaller is indistinguishable from cards being
    // missed. Three counted, two exempted, so the client holds five.
    expect(caveats[0]!.basis).toMatch(/2 credit-union cards excluded as exempt/);
  });

  it('omits the exemption clause when nothing was exempted', () => {
    const caveats = buildCaveats(
      [velocityRule(730)],
      context({ creditUnionCardsExcludedFrom524: 0 }),
    );
    expect(caveats[0]!.basis).not.toMatch(/exempt/);
  });

  it('says one card, not 1 cards', () => {
    const caveats = buildCaveats([velocityRule(730)], context({ newCardsLast24Months: 1 }));
    expect(caveats[0]!.basis).toMatch(/Counted 1 card —/);
  });


  it('says the figure is a floor when a held card cannot be placed in time', () => {
    // The distinction that turns "3 of 5 slots open" into "at most 3". A card
    // with no opening date is neither counted nor ignored.
    const caveats = buildCaveats(
      [velocityRule(730)],
      context({ newCardsLast24Months: 3, heldCardsOfUnknownAge: 2 }),
    );

    expect(caveats[0]!.basis).toMatch(/2 held cards could not be placed in time/);
    expect(caveats[0]!.basis).toMatch(/the figure is a floor/);
  });

  it('omits the floor clause when every held card is placeable', () => {
    const caveats = buildCaveats(
      [velocityRule(730)],
      context({ newCardsLast24Months: 3, heldCardsOfUnknownAge: 0 }),
    );
    expect(caveats[0]!.basis).not.toMatch(/could not be placed/);
  });

  it('names both sources even when one contributes nothing', () => {
    // A client with no held cards on record still gets the breakdown, so the
    // reader can tell "none held" from "held cards not considered".
    const caveats = buildCaveats(
      [velocityRule(730)],
      context({
        newCardsLast24Months: 2,
        fiveTwentyFourFromApplications: 2,
        fiveTwentyFourFromHeldCards: 0,
      }),
    );
    expect(caveats[0]!.basis).toMatch(/2 from applications/);
    expect(caveats[0]!.basis).toMatch(/0 from cards the client is recorded as already holding/);
  });

  it('reports the breakdown as unavailable when a half was not supplied', () => {
    // `fiveTwentyFourFromApplications ?? newCardsLast24Months` used to fill the
    // gap with the total, so a caller supplying only the held-cards half got a
    // breakdown double-counting against itself: 5 held plus a "5 from
    // applications" it invented, summing to 10 under a headline of 5. These are
    // two halves of one figure, not counters with a meaningful zero.
    const caveats = buildCaveats(
      [velocityRule(730)],
      context({
        newCardsLast24Months: 5,
        fiveTwentyFourFromApplications: undefined,
        fiveTwentyFourFromHeldCards: 5,
      }),
    );

    expect(caveats[0]!.basis).toMatch(/NOT AVAILABLE/);
    // Which half, so somebody can go and supply it.
    expect(caveats[0]!.basis).toMatch(/the applications half was.*supplied/);
    // And no invented figure anywhere in the sentence.
    expect(caveats[0]!.basis).not.toMatch(/5 from applications/);
    // The headline still stands — it is the count that was actually made.
    expect(caveats[0]!.basis).toMatch(/Counted 5 cards/);
  });

  it('says neither half when both are absent', () => {
    const caveats = buildCaveats(
      [velocityRule(730)],
      context({
        fiveTwentyFourFromApplications: undefined,
        fiveTwentyFourFromHeldCards: undefined,
      }),
    );
    expect(caveats[0]!.basis).toMatch(/neither half was supplied/);
  });

  it('reports the breakdown as unavailable when the halves do not sum to the headline', () => {
    // A breakdown that does not add up to its own headline is not a breakdown.
    // Reported rather than silently preferring one of the three figures.
    const caveats = buildCaveats(
      [velocityRule(730)],
      context({
        newCardsLast24Months: 5,
        fiveTwentyFourFromApplications: 3,
        fiveTwentyFourFromHeldCards: 3,
      }),
    );

    expect(caveats[0]!.basis).toMatch(/NOT AVAILABLE/);
    expect(caveats[0]!.basis).toMatch(/do(es)? not reconcile|does not sum/i);
    expect(caveats[0]!.basis).toMatch(/Counted 5 cards/);
  });

  it('does not describe a rule that was never evaluated', () => {
    // Issuer-specific velocity uses a different counter, so a caveat about the
    // 5/24 figure would be describing arithmetic that did not happen.
    expect(buildCaveats([velocityRule(180)], context())).toEqual([]);
    expect(buildCaveats([], context())).toEqual([]);
    expect(buildCaveats([{ ruleType: 'cooldown', periodDays: 730 }], context())).toEqual([]);
  });

  it('caveats a clean verdict, not only a violation', () => {
    // The point of the exercise. A client with nothing recorded gets
    // `eligible: true` and the most permissive possible reading, and that is
    // exactly when the basis needs stating.
    const caveats = buildCaveats([velocityRule(730)], context({ newCardsLast24Months: 0 }));

    expect(caveats).toHaveLength(1);
    expect(caveats[0]!.basis).toMatch(/Counted 0 cards/);
  });
});
