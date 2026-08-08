// ============================================================
// Unit Tests — held card → rate catalogue matching
//
// Run standalone:
//   npx vitest run tests/unit/services/held-card-catalog-match.test.ts
//
// The matching itself is the easy half. Most of these tests are about the
// failure half: a card that does not resolve must come back unmatched with a
// reason, never resolved to something near-enough and never given a rate.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  matchHeldCardToCatalog,
  catalogIssuerSlugs,
} from '../../../src/backend/services/held-card-catalog-match.js';
import { normalizeIssuerSlug } from '../../../src/backend/services/statement-normalizer.js';
import { getActiveCards } from '../../../src/backend/services/card-products.js';

describe('matchHeldCardToCatalog', () => {
  describe('resolving', () => {
    it('matches a product name written without the issuer prefix', () => {
      // The advisor types "Ink Business Preferred" beside an issuer field
      // that already says Chase; the catalogue calls it "Chase Ink Business
      // Preferred".
      const result = matchHeldCardToCatalog('Chase', 'Ink Business Preferred');

      expect(result.status).toBe('matched');
      if (result.status !== 'matched') return;
      expect(result.catalogCardId).toBe('chase-ink-business-preferred');
    });

    it('matches through an issuer alias', () => {
      // "American Express" is what an advisor writes; the catalogue says amex.
      const result = matchHeldCardToCatalog('American Express', 'Blue Business Cash');

      expect(result.status).toBe('matched');
      if (result.status !== 'matched') return;
      expect(result.catalogCardId).toBe('amex-blue-business-cash');
    });

    it('is case- and punctuation-insensitive', () => {
      const result = matchHeldCardToCatalog('chase', 'ink business-preferred');
      expect(result.status).toBe('matched');
    });

    it('carries the full tier structure, not a single rate', () => {
      // The whole point of resolving against this catalogue rather than the
      // Prisma table: a card earning 5% on office supplies and 1% elsewhere
      // cannot be expressed as one number.
      const result = matchHeldCardToCatalog('Chase', 'Ink Business Cash');

      expect(result.status).toBe('matched');
      if (result.status !== 'matched') return;
      expect(result.rewardsTiers.length).toBeGreaterThan(1);

      const office = result.rewardsTiers.find((t) => /office/i.test(t.category));
      expect(office?.rate).toBe(0.05);
      // A cap is part of the rate. 5% on the first $25,000 is not 5%.
      expect(office?.annualCap).toBe(25000);
    });
  });

  describe('refusing to resolve', () => {
    it('reports a product name that is not a product of that issuer', () => {
      // "Business Cash Preferred" conflates two real Chase products and is
      // neither. This is the seeded unmatched fixture.
      const result = matchHeldCardToCatalog('Chase', 'Business Cash Preferred');

      expect(result.status).toBe('unmatched');
      if (result.status !== 'unmatched') return;
      expect(['product_not_in_catalog', 'product_ambiguous']).toContain(result.reason);
      expect(result.explanation).toContain('Business Cash Preferred');
    });

    it('reports a missing product name rather than guessing from the issuer', () => {
      // An issuer alone could resolve to three Chase cards. Picking one would
      // attach rates to a card nobody identified.
      const result = matchHeldCardToCatalog('Chase', null);

      expect(result.status).toBe('unmatched');
      if (result.status !== 'unmatched') return;
      expect(result.reason).toBe('no_product_name');
    });

    it('treats an empty product name as missing, not as a name', () => {
      const result = matchHeldCardToCatalog('Chase', '   ');
      expect(result.status).toBe('unmatched');
      if (result.status !== 'unmatched') return;
      expect(result.reason).toBe('no_product_name');
    });

    it('reports an issuer the catalogue has no cards for', () => {
      // Barclays is in the issuer slug map but has no catalogue entry — a
      // legitimate non-resolution rather than a bug.
      const result = matchHeldCardToCatalog('Barclays', 'Business Card');

      expect(result.status).toBe('unmatched');
      if (result.status !== 'unmatched') return;
      expect(result.reason).toBe('issuer_not_in_catalog');
    });

    it('refuses an ambiguous name instead of taking the first', () => {
      const catalog = [
        { ...getActiveCards()[0]!, id: 'a', name: 'Business Card One', issuer: 'chase' as const },
        { ...getActiveCards()[0]!, id: 'b', name: 'Business Card Two', issuer: 'chase' as const },
      ];
      const result = matchHeldCardToCatalog('Chase', 'Business Card', catalog);

      expect(result.status).toBe('unmatched');
      if (result.status !== 'unmatched') return;
      expect(result.reason).toBe('product_ambiguous');
      // The advisor is told which cards it could have been, so they can
      // correct the record rather than guess at why it failed.
      expect(result.explanation).toContain('Business Card One');
      expect(result.explanation).toContain('Business Card Two');
    });

    it('never returns a rate on any unmatched outcome', () => {
      // The defect this module exists to prevent: a failed lookup producing
      // a number about the client's money.
      const unmatched = [
        matchHeldCardToCatalog('Chase', null),
        matchHeldCardToCatalog('Barclays', 'Anything'),
        matchHeldCardToCatalog('Chase', 'Not A Real Product Name Here'),
      ];

      for (const result of unmatched) {
        expect(result.status).toBe('unmatched');
        expect(result).not.toHaveProperty('rewardsTiers');
        expect(result).not.toHaveProperty('annualFee');
      }
    });
  });
});

describe('issuer slug vocabularies', () => {
  // Two lists in two files with nothing joining them. When they drift, the
  // issuer filter comes back empty and reads as "this issuer makes no cards"
  // rather than as an error — which is exactly how `lake_michigan` against
  // `lake_michigan_cu` survived between the rules engine and the catalogue.
  it('every catalogue issuer slug is reachable from normalizeIssuerSlug', () => {
    const unreachable = catalogIssuerSlugs().filter((slug) => {
      // A slug is reachable if some plausible human spelling folds onto it:
      // either it is already the slug, or its underscore form spelled with
      // spaces normalises back to it.
      const spelled = slug.replace(/_/g, ' ');
      return normalizeIssuerSlug(slug) !== slug && normalizeIssuerSlug(spelled) !== slug;
    });

    expect(unreachable).toEqual([]);
  });

  it('the catalogue issuers a held card can name are all matchable', () => {
    // Guards the whole path, not just the slug function: for every issuer in
    // the catalogue there is at least one card, so a correctly-spelled issuer
    // never returns issuer_not_in_catalog.
    for (const slug of catalogIssuerSlugs()) {
      const spelled = slug.replace(/_/g, ' ');
      const result = matchHeldCardToCatalog(spelled, 'definitely not a product');
      expect(result.status).toBe('unmatched');
      if (result.status !== 'unmatched') continue;
      expect(result.reason).not.toBe('issuer_not_in_catalog');
    }
  });
});
