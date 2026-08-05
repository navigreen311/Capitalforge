// ============================================================
// Score card state — obtainable vs not client-obtainable
//
// The score cards derived their empty state from `score === null`. That
// expression has one output for two different facts: "nobody has pulled this
// yet" and "nobody can pull this at all". Both rendered as "Not yet pulled",
// so the FICO SBSS card named an action that does not exist — SBSS is
// calculated by FICO when a lender requests it, and there is no dormant
// record for an advisor to fetch.
//
// These pin the property that a null score is NOT one state, which is the
// thing a future refactor is most likely to collapse back.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  scoreCardState,
  showsProgressToward,
  type ScoreObtainability,
} from '../../../src/frontend/lib/credit-view';

const OBTAINABLE: ScoreObtainability = {
  kind: 'client_obtainable',
  action: 'About $49.95 a report from Experian.',
};

const LENDER: ScoreObtainability = {
  kind: 'lender_computed',
  reason: 'Calculated by FICO when a lender requests it.',
};

describe('scoreCardState', () => {
  it('reports a pulled score as measured, whoever computes it', () => {
    expect(scoreCardState(72, OBTAINABLE)).toBe('measured');
    // A lender can share an SBSS they pulled. Having one is not the same
    // question as being able to obtain one.
    expect(scoreCardState(148, LENDER)).toBe('measured');
  });

  it('distinguishes the two empty states that used to render identically', () => {
    expect(scoreCardState(null, OBTAINABLE)).toBe('awaiting_pull');
    expect(scoreCardState(null, LENDER)).toBe('not_obtainable');

    // The regression this file exists for: both are a null score, and they
    // must not be the same state.
    expect(scoreCardState(null, OBTAINABLE)).not.toBe(scoreCardState(null, LENDER));
  });

  it('treats a score of zero as measured rather than absent', () => {
    // 0 is a real value on the SBSS 0-300 scale. `!score` would have called
    // this empty, which is the same class of collapse in a different guise.
    expect(scoreCardState(0, LENDER)).toBe('measured');
    expect(scoreCardState(0, OBTAINABLE)).toBe('measured');
  });
});

describe('showsProgressToward', () => {
  it('offers a target only where an action can close the gap', () => {
    expect(showsProgressToward(OBTAINABLE)).toBe(true);
    expect(showsProgressToward(LENDER)).toBe(false);
  });

  it('does not depend on whether a score has been pulled', () => {
    // Progress is a property of the product, not of our records. An SBSS on
    // file still has no target, because nothing the client does moves it
    // toward one.
    expect(showsProgressToward(LENDER)).toBe(false);
    expect(showsProgressToward(OBTAINABLE)).toBe(true);
  });
});
