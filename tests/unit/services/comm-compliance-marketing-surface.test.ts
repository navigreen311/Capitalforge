// ============================================================
// Unit Tests — Marketing compliance surface (TILA + CROA)
//
// Run standalone:
//   npx vitest run tests/unit/services/comm-compliance-marketing-surface.test.ts
//
// WHY THIS FILE EXISTS
//
//   AnimaForge now scans video generation scripts through THIS list before
//   rendering. Two categories were added for that surface — rate/term claims
//   (TILA / Regulation Z) and credit-improvement claims (CROA) — because a
//   marketing video makes claims an advisor on a call does not.
//
//   These tests assert the patterns actually match the language they were
//   written for, and, just as importantly, that they do NOT match the
//   compliant phrasing of the same idea. A rate claim scanner that rejects
//   "0% intro APR for 12 months, then 18.99% variable" is a scanner people
//   route around, and a scanner people route around protects nothing.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  BANNED_CLAIMS,
  type BannedClaimCategory,
} from '../../../src/backend/services/comm-compliance.service.js';

/** Every claim whose pattern matches this text. */
function hits(text: string): { id: string; category: BannedClaimCategory }[] {
  return BANNED_CLAIMS.filter((c) => new RegExp(c.pattern.source, c.pattern.flags).test(text)).map(
    (c) => ({ id: c.id, category: c.category }),
  );
}

function categoriesFor(text: string): BannedClaimCategory[] {
  return [...new Set(hits(text).map((h) => h.category))];
}

describe('Rate and term claims — TILA / Regulation Z', () => {
  it.each([
    ['0% APR forever on every card in the stack', 'banned-020'],
    ['zero % interest forever', 'banned-020'],
    ['no interest, ever, on your new lines', 'banned-021'],
    ['a guaranteed rate of 9.99%', 'banned-022'],
    ['we get you a locked-in APR', 'banned-022'],
    ['the lowest rates anywhere', 'banned-023'],
  ])('blocks %j', (text, expectedId) => {
    expect(hits(text).map((h) => h.id)).toContain(expectedId);
  });

  it('does NOT block a complete Regulation Z disclosure', () => {
    const compliant =
      '0% intro APR for 12 months, then the standard variable rate — currently 18.99% to 24.99%.';
    expect(categoriesFor(compliant)).not.toContain('rate_or_term_claim');
  });

  it('does NOT block a qualified no-interest statement', () => {
    // banned-021 uses a negative lookahead precisely so the qualified form
    // survives. If that lookahead is ever dropped this test is what notices.
    const compliant = 'No interest for the first 12 billing cycles on qualifying purchases.';
    expect(categoriesFor(compliant)).not.toContain('rate_or_term_claim');
  });

  it('does NOT block an honest starting-rate statement', () => {
    const compliant = 'Rates start at 9.99% APR and depend on your credit profile.';
    expect(categoriesFor(compliant)).not.toContain('rate_or_term_claim');
  });
});

describe('Credit improvement claims — CROA', () => {
  it.each([
    ['we remove negative items from your report', 'banned-024'],
    ['delete derogatory marks in 30 days', 'banned-024'],
    ['we fix your credit fast', 'banned-025'],
    ['let us repair your credit', 'banned-025'],
    ['boost your credit by 120 points', 'banned-026'],
    ['raise your score 100+ points', 'banned-026'],
    ['start a new credit file today', 'banned-027'],
    ['we issue a CPN', 'banned-027'],
  ])('blocks %j', (text, expectedId) => {
    expect(hits(text).map((h) => h.id)).toContain(expectedId);
  });

  it('does NOT block the honest disclaimer of the same subject', () => {
    const compliant =
      'We do not repair credit and are not a credit repair organization. Accurate information ' +
      'stays on your report for the statutory period.';
    expect(categoriesFor(compliant)).not.toContain('credit_improvement_claim');
  });

  it('does NOT block a factual statement about business credit structuring', () => {
    const compliant = 'We structure business credit so your personal report carries less of it.';
    expect(categoriesFor(compliant)).not.toContain('credit_improvement_claim');
  });
});

describe('The library stays one library', () => {
  it('has a unique id per claim', () => {
    const ids = BANNED_CLAIMS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries a legal citation on every claim, including the new ones', () => {
    // The citation is what an operator reads when a render is refused. A claim
    // with no citation produces a refusal nobody can act on.
    for (const claim of BANNED_CLAIMS) {
      expect(claim.legalCitation.length, `${claim.id} has no citation`).toBeGreaterThan(3);
      expect(claim.severityWeight).toBeGreaterThan(0);
    }
  });

  it('covers the marketing surface AnimaForge depends on', () => {
    const categories = new Set(BANNED_CLAIMS.map((c) => c.category));
    expect(categories).toContain('rate_or_term_claim');
    expect(categories).toContain('credit_improvement_claim');
    expect(categories).toContain('guaranteed_approval');
  });
});

describe('The video script from the finding', () => {
  it('blocks the exact case that previously scored 0.0 and was then signed', () => {
    // Under the old pipeline this was moderated by classifying the FILENAME of
    // the rendered mp4. It scored 0.0, passed, and was C2PA-signed.
    const script =
      'Narrator: Guaranteed approval for your business. You get 0% APR forever, and we fix ' +
      'your credit along the way. Act now — this offer expires tonight.';

    const found = categoriesFor(script);

    expect(found).toContain('guaranteed_approval');
    expect(found).toContain('rate_or_term_claim');
    expect(found).toContain('credit_improvement_claim');
    expect(found).toContain('urgency_pressure');
  });
});
