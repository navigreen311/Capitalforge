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
  type EligibilityContext,
} from '../../../src/backend/services/issuer-rules-engine';

const context = (over: Partial<EligibilityContext> = {}): EligibilityContext =>
  ({
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
  }) as EligibilityContext;

const velocityRule = (periodDays: number) => ({ ruleType: 'velocity', periodDays });

describe('buildCaveats — cross-issuer velocity', () => {
  it('says what the 5/24 count was drawn from', () => {
    const caveats = buildCaveats([velocityRule(730)], context({ newCardsLast24Months: 2 }));

    expect(caveats).toHaveLength(1);
    expect(caveats[0]!.subject).toMatch(/5\/24/);
    expect(caveats[0]!.basis).toMatch(/Counted 2 cards from applications recorded in CapitalForge/);
    // The half that matters: what is missing, not just what was counted.
    expect(caveats[0]!.basis).toMatch(/already held, or opened elsewhere, are not recorded/);
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
    expect(caveats[0]!.basis).toMatch(/Counted 1 card from/);
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
