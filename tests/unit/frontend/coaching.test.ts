// ============================================================
// Coaching cards — read the client, or say nothing about them
//
// Coaching was keyed on the tier alone while stating facts about the client.
// Every Tier 1 client was told "you need 5 reporting tradelines… apply to at
// least 2 new accounts this week" — a client with six got it, and so did a
// client whose trade lines had never been read.
//
// The rule under test: an unknown is not a quantity. Where a fact is missing
// the card drops the number and says why, rather than defaulting to one and
// presenting it as measured. That is the same defect as a count that hides
// what produced it, in prose instead of arithmetic.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  coachingForTier,
  PAYDEX_TARGET,
  TRADELINE_TARGET,
  type CoachingFacts,
} from '../../../src/frontend/lib/coaching';

const facts = (over: Partial<CoachingFacts> = {}): CoachingFacts => ({
  tradelineCount: 3,
  paydex: 70,
  experianBusiness: 55,
  ...over,
});

/** Every card's text, for asserting what is and is not claimed. */
const text = (tier: number, f: CoachingFacts) =>
  coachingForTier(tier, f)
    .map((c) => `${c.title} ${c.description}`)
    .join('\n');

describe('coaching reads the client', () => {
  it('computes the quantity it prescribes', () => {
    const two = text(1, facts({ tradelineCount: 3 }));
    expect(two).toMatch(/Apply for 2 more Net-30 vendors/);
    expect(two).toMatch(/3 of the 5 trade lines/);

    // Not a fixed "2 more" for everyone: the number follows the client.
    const four = text(1, facts({ tradelineCount: 1 }));
    expect(four).toMatch(/Apply for 4 more Net-30 vendors/);
  });

  it('says one vendor, not 1 vendors', () => {
    expect(text(1, facts({ tradelineCount: 4 }))).toMatch(/Apply for 1 more Net-30 vendor\b/);
  });

  it('stops asking for more when the client already has enough', () => {
    // The original card told a client with six accounts to open two more.
    const enough = text(1, facts({ tradelineCount: 6 }));
    expect(enough).toMatch(/Enough trade lines/);
    expect(enough).not.toMatch(/Apply for \d+ more/);
  });

  it('never renders an unknown count as a quantity', () => {
    const unread = text(1, facts({ tradelineCount: null }));

    expect(unread).toMatch(/have not been read/i);
    // The specific regression: no prescribed number anywhere in the tier's
    // cards when the count behind it is unknown.
    expect(unread).not.toMatch(/Apply for \d+ more/);
    expect(unread).not.toMatch(/\d+ of the \d+ trade lines/);
  });

  it('does not claim a PAYDEX trajectory for a client with no PAYDEX', () => {
    const none = text(2, facts({ paydex: null }));

    // "With your Paydex approaching 80" was said to every Tier 2 client.
    expect(none).not.toMatch(/approaching/i);
    expect(none).toMatch(/No PAYDEX on record/i);

    const short = text(2, facts({ paydex: 62 }));
    expect(short).toMatch(new RegExp(`PAYDEX is 62 — ${PAYDEX_TARGET - 62} short`));
  });

  it('does not tell a client they qualify for a card nobody checked', () => {
    // "With Paydex 80+ and 5+ tradelines, you qualify for Costco" asserted
    // two facts and a conclusion, reading none of them. A decline leaves an
    // inquiry on the file.
    const unknown = text(3, facts({ paydex: null, tradelineCount: null }));
    expect(unknown).toMatch(/eligibility not established/i);
    expect(unknown).toMatch(/PAYDEX and trade-line count/);
    expect(unknown).not.toMatch(/you qualify/i);

    const short = text(3, facts({ paydex: 70, tradelineCount: 6 }));
    expect(short).toMatch(/Not yet ready for Costco/i);
    expect(short).toMatch(/PAYDEX 70 of 80/);

    const ready = text(3, facts({ paydex: 85, tradelineCount: 7 }));
    expect(ready).toMatch(/Apply for Costco Business Credit/);
    expect(ready).toMatch(/PAYDEX 85 and 7 reporting trade lines/);
  });

  it('offers the Costco link only when the client actually clears it', () => {
    const link = (f: CoachingFacts) =>
      coachingForTier(3, f).find((c) => c.id === 'c3-3')?.actionUrl ?? null;

    expect(link(facts({ paydex: 85, tradelineCount: 7 }))).toMatch(/costco/);
    // No outbound application link where eligibility is unknown or short —
    // the link is the part an advisor acts on.
    expect(link(facts({ paydex: null, tradelineCount: null }))).toBeNull();
    expect(link(facts({ paydex: 70, tradelineCount: 7 }))).toBeNull();
  });
});

describe('coaching that asserts nothing about the client', () => {
  it('keeps generic advice identical whatever the facts', () => {
    // "Pay invoices 10+ days early" is sound for anyone and needs no data.
    // These cards must not vary, or they are quietly claiming something.
    const generic = (f: CoachingFacts) =>
      coachingForTier(1, f)
        .filter((c) => c.id !== 'c1-1')
        .map((c) => c.description);

    expect(generic(facts({ tradelineCount: null }))).toEqual(
      generic(facts({ tradelineCount: 9 })),
    );
  });

  it('gives every tier at least one card in every state', () => {
    for (const tier of [1, 2, 3]) {
      for (const f of [
        facts(),
        facts({ tradelineCount: null, paydex: null, experianBusiness: null }),
        facts({ tradelineCount: 9, paydex: 95 }),
      ]) {
        expect(coachingForTier(tier, f).length, `tier ${tier}`).toBeGreaterThan(0);
      }
    }
  });

  it('offers nothing for a tier that does not exist', () => {
    expect(coachingForTier(4, facts())).toEqual([]);
  });
});

describe('thresholds are shared, not restated', () => {
  it('exports the figures the tier criteria also use', () => {
    // Two copies of a threshold is how one panel says "4 of 5 trade lines"
    // while the card beneath it asks for two more.
    expect(TRADELINE_TARGET).toBe(5);
    expect(PAYDEX_TARGET).toBe(80);
  });
});
