// ============================================================
// Recognising a credit union from a free-text issuer name
//
// `CardApplication.issuer` is a display name, not a slug — "American Express",
// "Chase". The Chase 5/24 count in issuer-rules.routes.ts matched on nothing at
// all: it counted every approved application in the window regardless of
// issuer, so a credit union application counted towards the limit.
//
// That is the inverse of the rule. Credit union applications do not drive 5/24,
// and counting them tells a client who took the recommended credit union cards
// that they have exhausted their Chase eligibility when they have not — the
// advice penalising them for following it.
//
// These pin the identification, because the fix is only as good as its ability
// to tell a credit union from a bank in whatever spelling reaches it.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  isCreditUnionIssuerName,
  CREDIT_UNION_ISSUER_IDS,
  BANK_ISSUER_IDS,
} from '../../../src/shared/constants/issuers';

describe('isCreditUnionIssuerName — slugs', () => {
  it.each([...CREDIT_UNION_ISSUER_IDS])('recognises the slug %s', (slug) => {
    expect(isCreditUnionIssuerName(slug)).toBe(true);
  });

  it.each([...BANK_ISSUER_IDS])('does not treat the bank slug %s as a credit union', (slug) => {
    expect(isCreditUnionIssuerName(slug)).toBe(false);
  });
});

describe('isCreditUnionIssuerName — display names', () => {
  // These are the values CardApplication.issuer actually holds.
  it.each([
    'Navy Federal Credit Union',
    'PenFed Credit Union',
    'Alliant Credit Union',
    'First Tech Federal Credit Union',
    'Lake Michigan Credit Union',
  ])('recognises %s', (name) => {
    expect(isCreditUnionIssuerName(name)).toBe(true);
  });

  it('recognises BECU, which does not say "credit union" in its name', () => {
    // The reason an alias list exists at all — the generic check cannot see it.
    expect(isCreditUnionIssuerName('BECU')).toBe(true);
    expect(isCreditUnionIssuerName('Boeing Employees Credit Union')).toBe(true);
  });

  it.each([
    'Chase',
    'American Express',
    'Bank of America',
    'Capital One',
    'Citi',
    'US Bank',
    'Wells Fargo',
  ])('does not treat the bank %s as a credit union', (name) => {
    expect(isCreditUnionIssuerName(name)).toBe(false);
  });
});

describe('isCreditUnionIssuerName — spelling it differently', () => {
  it.each([
    'navy federal credit union',
    'NAVY FEDERAL CREDIT UNION',
    '  Navy Federal Credit Union  ',
    'navy-federal',
    'navy_federal',
  ])('matches %s', (value) => {
    expect(isCreditUnionIssuerName(value)).toBe(true);
  });

  it('catches a credit union nobody added to the alias list', () => {
    // Better to treat an unlisted credit union as one than to count it against
    // 5/24 because it was missed.
    expect(isCreditUnionIssuerName('Some Other Credit Union')).toBe(true);
    expect(isCreditUnionIssuerName('Golden 1 FCU')).toBe(true);
  });

  it.each([null, undefined, '', '   '])('returns false for %s', (value) => {
    expect(isCreditUnionIssuerName(value)).toBe(false);
  });
});

describe('the 5/24 count itself', () => {
  /** The rule as issuer-rules.routes.ts now applies it. */
  function countFor524(
    apps: Array<{ issuer: string; status: string; decidedAt: Date | null }>,
    windowStart: Date,
  ): { counted: number; creditUnionsExcluded: number } {
    const inWindow = apps.filter(
      (a) => a.status === 'approved' && a.decidedAt && a.decidedAt > windowStart,
    );
    const cu = inWindow.filter((a) => isCreditUnionIssuerName(a.issuer));
    return { counted: inWindow.length - cu.length, creditUnionsExcluded: cu.length };
  }

  const recent = new Date('2026-06-01');
  const old = new Date('2023-01-01');
  const windowStart = new Date('2024-08-04');

  it('does not count credit union cards towards 5/24', () => {
    const result = countFor524(
      [
        { issuer: 'Chase', status: 'approved', decidedAt: recent },
        { issuer: 'Amex', status: 'approved', decidedAt: recent },
        { issuer: 'Navy Federal Credit Union', status: 'approved', decidedAt: recent },
        { issuer: 'Alliant Credit Union', status: 'approved', decidedAt: recent },
      ],
      windowStart,
    );
    expect(result.counted).toBe(2);
    expect(result.creditUnionsExcluded).toBe(2);
  });

  it('reports the exemption rather than only shrinking the number', () => {
    // Two clients can both show "2 cards"; only one of them has four cards.
    const withCus = countFor524(
      [
        { issuer: 'Chase', status: 'approved', decidedAt: recent },
        { issuer: 'Citi', status: 'approved', decidedAt: recent },
        { issuer: 'BECU', status: 'approved', decidedAt: recent },
      ],
      windowStart,
    );
    const withoutCus = countFor524(
      [
        { issuer: 'Chase', status: 'approved', decidedAt: recent },
        { issuer: 'Citi', status: 'approved', decidedAt: recent },
      ],
      windowStart,
    );
    expect(withCus.counted).toBe(withoutCus.counted);
    expect(withCus.creditUnionsExcluded).toBe(1);
    expect(withoutCus.creditUnionsExcluded).toBe(0);
  });

  it('still counts every bank issuer, not only Chase', () => {
    // 5/24 counts cards from everywhere; filtering to Chase would be the
    // opposite mistake.
    const result = countFor524(
      [
        { issuer: 'Chase', status: 'approved', decidedAt: recent },
        { issuer: 'Wells Fargo', status: 'approved', decidedAt: recent },
        { issuer: 'US Bank', status: 'approved', decidedAt: recent },
      ],
      windowStart,
    );
    expect(result.counted).toBe(3);
  });

  it('ignores applications that were not approved, and ones outside the window', () => {
    const result = countFor524(
      [
        { issuer: 'Chase', status: 'declined', decidedAt: recent },
        { issuer: 'Citi', status: 'draft', decidedAt: null },
        { issuer: 'Amex', status: 'approved', decidedAt: old },
      ],
      windowStart,
    );
    expect(result.counted).toBe(0);
  });
});
