// ============================================================
// Held cards and Chase 5/24
//
// 5/24 was counted from `CardApplication` — applications made through
// CapitalForge — and nothing recorded a card a client arrived with. A client
// who opened four bank cards before onboarding counted as zero, so the panel
// read "5 of 5 slots open".
//
// The error ran one way. The count could only be too low, and too low reads as
// headroom: the advisor sends the client to Chase and the auto-decline is the
// first anyone hears of the four cards.
//
// These pin the arithmetic. It is pure so it can be tested without a database
// and, more importantly, so the caveat that describes it and the code that
// performs it cannot drift.
// ============================================================

import { describe, it, expect } from 'vitest';
import { tallyHeldCardsForFiveTwentyFour } from '../../../src/backend/services/held-cards.service';

const NOW = new Date('2026-08-06T00:00:00.000Z');
/** Two years before NOW. */
const WINDOW_START = new Date('2024-08-06T00:00:00.000Z');

const card = (issuer: string, openedAt: string | null) => ({
  issuer,
  openedAt: openedAt === null ? null : new Date(openedAt),
});

describe('tallyHeldCardsForFiveTwentyFour', () => {
  it('counts a bank card opened inside the window', () => {
    const t = tallyHeldCardsForFiveTwentyFour([card('Chase', '2025-03-01')], WINDOW_START, NOW);
    expect(t).toEqual({ counted: 1, unplaceable: 0, creditUnionExcluded: 0 });
  });

  it('does not count one opened before the window', () => {
    const t = tallyHeldCardsForFiveTwentyFour([card('Chase', '2020-01-01')], WINDOW_START, NOW);
    expect(t.counted).toBe(0);
    // Not unplaceable either — it has a date, it is simply outside.
    expect(t.unplaceable).toBe(0);
  });

  it('reports a card with no opening date as unplaceable, not as zero or one', () => {
    // The distinction the stacking optimizer already drew and the issuer-rules
    // path did not: this is why an answer is "at most N slots open".
    const t = tallyHeldCardsForFiveTwentyFour([card('Amex', null)], WINDOW_START, NOW);
    expect(t).toEqual({ counted: 0, unplaceable: 1, creditUnionExcluded: 0 });
  });

  it('excludes credit-union cards and says how many', () => {
    // A count that is simply smaller is indistinguishable from cards being
    // missed — the same reason the application-side exemption is reported.
    const t = tallyHeldCardsForFiveTwentyFour(
      [card('Alliant Credit Union', '2025-01-01'), card('Chase', '2025-01-01')],
      WINDOW_START,
      NOW,
    );
    expect(t.counted).toBe(1);
    expect(t.creditUnionExcluded).toBe(1);
  });

  it('excludes a credit-union card even when its date is missing', () => {
    // Exemption is decided by the issuer, so it must be checked before the
    // date. Otherwise an undated CU card inflates the unplaceable count and
    // makes the answer needlessly vaguer than the rule requires.
    const t = tallyHeldCardsForFiveTwentyFour(
      [card('Lake Michigan Credit Union', null)],
      WINDOW_START,
      NOW,
    );
    expect(t).toEqual({ counted: 0, unplaceable: 0, creditUnionExcluded: 1 });
  });

  it('counts a closed card that was opened inside the window', () => {
    // The rule intuition gets wrong: 5/24 counts *openings*, not current
    // holdings. Closing a card does not return the slot.
    const t = tallyHeldCardsForFiveTwentyFour([card('Chase', '2025-06-01')], WINDOW_START, NOW);
    expect(t.counted).toBe(1);
  });

  it('ignores a future opening date', () => {
    // Data entry, not a card. Counting it spends a slot on something that has
    // not happened.
    const t = tallyHeldCardsForFiveTwentyFour([card('Chase', '2027-01-01')], WINDOW_START, NOW);
    expect(t).toEqual({ counted: 0, unplaceable: 0, creditUnionExcluded: 0 });
  });

  it('is zero across the board for a client with nothing recorded', () => {
    expect(tallyHeldCardsForFiveTwentyFour([], WINDOW_START, NOW)).toEqual({
      counted: 0,
      unplaceable: 0,
      creditUnionExcluded: 0,
    });
  });

  it('adds up a realistic mix', () => {
    const t = tallyHeldCardsForFiveTwentyFour(
      [
        card('Chase', '2025-02-01'), // counts
        card('Amex', '2024-12-01'), // counts
        card('Capital One', '2019-01-01'), // too old
        card('Citi', null), // unplaceable
        card('Alliant Credit Union', '2025-05-01'), // exempt
      ],
      WINDOW_START,
      NOW,
    );

    expect(t).toEqual({ counted: 2, unplaceable: 1, creditUnionExcluded: 1 });
    // Every card is accounted for in exactly one bucket — nothing is silently
    // dropped, which is the property that let the old count read as complete.
    expect(t.counted + t.unplaceable + t.creditUnionExcluded).toBe(4);
  });
});
