// ============================================================
// No claim without a source
//
// This is advisory content an advisor repeats to a client. The Tier 2 coaching
// card once told them to have the client "pull a free report" from Experian —
// it costs about $49.95, and the client finds out at the paywall. Nobody
// invented that maliciously; somebody wrote plausible copy without checking.
//
// The types make that a compile error. These assertions cover what types
// cannot: that a date is real and not in the future, that a source names a
// publisher rather than an empty string, and — the one that matters most —
// that the walk which checks all of this actually reaches every statement.
//
// Same shape as the CHECK constraint on eligibility floors: the rule lives
// where it cannot be forgotten rather than where it must be remembered.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  ACQUISITION_PATHS,
  statementsIn,
  isClaim,
  type AcquisitionKey,
  type Statement,
} from '../../../src/frontend/lib/score-acquisition';

const KEYS = Object.keys(ACQUISITION_PATHS) as AcquisitionKey[];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every statement in the module, with the path it came from. */
function allStatements(): Array<{ key: AcquisitionKey; s: Statement }> {
  return KEYS.flatMap((key) => statementsIn(ACQUISITION_PATHS[key]).map((s) => ({ key, s })));
}

describe('the walk reaches everything', () => {
  it('finds statements in all four paths', () => {
    // The assertions below are all of the form "every statement satisfies X".
    // If the walk returns nothing they pass vacuously, which is exactly the
    // failure this file exists to prevent — so the walk is checked first.
    for (const key of KEYS) {
      expect(statementsIn(ACQUISITION_PATHS[key]).length, `${key} yielded no statements`)
        .toBeGreaterThan(0);
    }
  });

  it('covers all four score products', () => {
    expect(KEYS.sort()).toEqual(['equifax_business_risk', 'intelliscore', 'paydex', 'sbss']);
  });

  it('reaches statements nested inside arrays of objects', () => {
    // PAYDEX keeps its statements one level deeper than the others — inside
    // `steps[].detail`. A walk that only looked at top-level fields would miss
    // them and report the path as fully sourced.
    const paydex = statementsIn(ACQUISITION_PATHS.paydex);
    expect(paydex.some((s) => s.text.includes('days-early'))).toBe(true);
  });
});

describe('every claim carries provenance', () => {
  it.each(allStatements().filter(({ s }) => isClaim(s)).map(({ key, s }) => [key, s.text.slice(0, 55)]))(
    '%s: "%s…" has a source and a date',
    (key, excerpt) => {
      const found = allStatements().find(
        ({ key: k, s }) => k === key && s.text.startsWith(excerpt.replace(/…$/, '')),
      );
      const s = found!.s;
      if (!isClaim(s)) throw new Error('expected a claim');

      expect(s.source.publisher.trim().length, 'publisher is empty').toBeGreaterThan(0);
      expect(s.source.title.trim().length, 'title is empty').toBeGreaterThan(0);
      expect(s.verifiedOn, 'verifiedOn is not an ISO date').toMatch(ISO_DATE);
    },
  );

  it('dates no claim in the future', () => {
    // A verification date ahead of today is a typo that reads as freshness.
    const today = new Date().toISOString().slice(0, 10);
    for (const { key, s } of allStatements()) {
      if (!isClaim(s)) continue;
      expect(s.verifiedOn <= today, `${key}: verifiedOn ${s.verifiedOn} is in the future`).toBe(true);
    }
  });

  it('gives every URL-bearing source a real URL', () => {
    for (const { key, s } of allStatements()) {
      if (!isClaim(s) || s.source.url === undefined) continue;
      expect(s.source.url, `${key}: malformed source URL`).toMatch(/^https?:\/\/\S+$/);
    }
  });
});

describe('an unverified statement stays unverified', () => {
  it('says what would settle it', () => {
    // Marked, not removed, and not upgraded — the standing pattern. A gap with
    // no route to closure becomes decoration within a week.
    const unverified = allStatements().filter(({ s }) => !isClaim(s));
    expect(unverified.length, 'no unverified statements — did one get upgraded?').toBeGreaterThan(0);

    for (const { key, s } of unverified) {
      if (isClaim(s)) continue;
      expect(s.whatWouldSettleIt.trim().length, `${key}: no route to closing the gap`)
        .toBeGreaterThan(20);
    }
  });

  it('keeps the PAYDEX trade-experience count unverified', () => {
    // The single most likely place this content goes wrong: an unconfirmed
    // count rendering as a number. The source document explicitly refuses to
    // state one, so this asserts we still refuse.
    const paydex = statementsIn(ACQUISITION_PATHS.paydex);
    const tradeExperience = paydex.find((s) => s.text.includes('trade experiences'));

    expect(tradeExperience, 'the trade-experience statement disappeared').toBeDefined();
    expect(isClaim(tradeExperience!), 'it was upgraded to a sourced claim').toBe(false);
  });

  it('quotes no specific trade-experience count anywhere in the PAYDEX path', () => {
    // Not just on that one statement — anywhere. "Open 5 accounts" phrased as a
    // D&B requirement would be the same defect in a different field.
    const text = statementsIn(ACQUISITION_PATHS.paydex).map((s) => s.text).join(' ');
    expect(text).not.toMatch(/\b\d+\s+(?:reporting\s+)?trade experiences?\s+(?:is|are|required)/i);
  });
});

describe('claims that would be repeated to a client', () => {
  it('does not describe any Experian report as free', () => {
    // The original defect, pinned — but the first version of this assertion
    // failed on the correction itself, because `caution` says "do not tell a
    // client to pull a free report". A substring check cannot tell asserting a
    // thing from warning against it.
    //
    // So the check is scoped to the fields that assert. The caution is
    // excluded and then checked separately for the opposite property.
    const { caution, ...asserts } = ACQUISITION_PATHS.intelliscore;
    const asserted = statementsIn(asserts as unknown as typeof ACQUISITION_PATHS.intelliscore)
      .map((s) => s.text)
      .join(' ')
      .toLowerCase();

    expect(asserted).not.toMatch(/free (?:experian |intelliscore |business )?report/);
    expect(caution.text.toLowerCase()).toContain('free report');
  });

  it('names 5000-876777 as the operative SBA notice', () => {
    // Citing only the superseded 5000-875701 encodes underwriting language
    // that has since been replaced.
    const text = statementsIn(ACQUISITION_PATHS.sbss).map((s) => s.text).join(' ');
    expect(text).toContain('5000-876777');
  });

  it('offers no SBSS target number to aim at', () => {
    // There is no current SBA figure. A number here would be the fifth
    // different threshold this codebase has quoted as the SBA's.
    const text = statementsIn(ACQUISITION_PATHS.sbss).map((s) => s.text).join(' ');
    expect(text).not.toMatch(/SBSS (?:of |to )?\d{2,3}\b/);
    expect(text).not.toMatch(/\braise your SBSS to \d/i);
  });

  it('marks the Equifax product that overlaps silently', () => {
    const equifax = ACQUISITION_PATHS.equifax_business_risk;
    const overlapping = equifax.products.filter((p) => p.overlapsSilently);
    expect(overlapping.map((p) => p.product)).toEqual(['OneScore for Commercial']);

    // And exactly one product is the one this card tracks.
    expect(equifax.products.filter((p) => p.isTheOneTracked)).toHaveLength(1);
  });
});
