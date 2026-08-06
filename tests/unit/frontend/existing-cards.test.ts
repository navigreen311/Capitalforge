// ============================================================
// existing-cards — the label the advisor ticks vs. the issuer that gets stored
//
// The optimizer's card list holds display labels: "Chase Ink Business
// Preferred", "Bank of America Business Advantage". The record holds an issuer
// and a product separately, because issuer identity is what decides the
// credit-union 5/24 exemption and which issuer's rules apply.
//
// Splitting the label on its first word is the obvious way to bridge those,
// and it is wrong twice: it makes "Bank" the issuer of a Bank of America card
// and "US" the issuer of a US Bank one. Nothing would fail. `parseIssuer`
// returns null rather than guessing, so those cards would be recorded under an
// issuer nothing recognises and quietly skip both rule sets.
//
// So the split is written out by hand, and these assertions are what make a
// hand-written table safe to edit: every issuer in it has to resolve.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  EXISTING_CARDS,
  EXISTING_CARD_CATALOGUE,
  catalogueEntry,
  CATALOGUE_ISSUERS_NOT_IN_REGISTRY,
} from '../../../src/frontend/lib/existing-cards';
import { parseIssuer } from '../../../src/shared/constants/issuers';

describe('every catalogue issuer resolves, or is declared as one that does not', () => {
  it.each(EXISTING_CARD_CATALOGUE.map((c) => [c.label, c.issuer] as const))(
    '%s → %s',
    (_label, issuer) => {
      // Writing this as "must resolve" is what found the one that does not:
      // the form offers a Brex 30 checkbox for an issuer that appears nowhere
      // in the issuer registry. The declaration is the fix, not the registry —
      // adding `brex` there would assert a cooldown and a velocity rule nobody
      // has looked up. What matters is that the gap cannot grow silently.
      if (CATALOGUE_ISSUERS_NOT_IN_REGISTRY.includes(issuer)) {
        expect(parseIssuer(issuer)).toBeNull();
        return;
      }
      expect(parseIssuer(issuer)).not.toBeNull();
    },
  );

  it('declares no issuer that has since been registered', () => {
    // Otherwise the exemption outlives the reason for it, and a registered
    // issuer keeps being treated as unknown because a list said so.
    for (const issuer of CATALOGUE_ISSUERS_NOT_IN_REGISTRY) {
      expect(parseIssuer(issuer)).toBeNull();
      expect(EXISTING_CARD_CATALOGUE.some((c) => c.issuer === issuer)).toBe(true);
    }
  });

  it('rejects the naive split that motivated writing this out', () => {
    // Documenting the failure rather than describing it: these are what a
    // first-word split would have produced for two of the entries.
    expect(parseIssuer('Bank')).toBeNull();
    expect(parseIssuer('US')).toBeNull();
  });
});

describe('the catalogue round-trips', () => {
  it('exposes one label per entry, in order', () => {
    expect(EXISTING_CARDS).toEqual(EXISTING_CARD_CATALOGUE.map((c) => c.label));
  });

  it('finds every label', () => {
    for (const label of EXISTING_CARDS) {
      expect(catalogueEntry(label)).not.toBeNull();
    }
  });

  it('returns null for a label that is not in it, rather than a guess', () => {
    // The page relies on this: a card on a client's record that has no
    // checkbox is preserved on save rather than deleted, and that branch is
    // reached only because this returns null instead of inventing an entry.
    expect(catalogueEntry('Some Card We Do Not List')).toBeNull();
  });

  it('has no duplicate labels and no duplicate issuer/product pairs', () => {
    // Loading a client's record matches rows back to labels by issuer and
    // product. A duplicate pair would tick the wrong box; a duplicate label
    // would tick two.
    expect(new Set(EXISTING_CARDS).size).toBe(EXISTING_CARDS.length);
    const pairs = EXISTING_CARD_CATALOGUE.map((c) => `${c.issuer}|${c.productName}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});
