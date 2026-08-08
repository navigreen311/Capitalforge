// ============================================================
// CapitalForge — resolving a held card to its earn rates
//
// `HeldCard` records what a client says they hold: a free-text issuer and an
// optional free-text product name, attested by an advisor. `CARD_CATALOG`
// records what cards earn, per category, with caps. Nothing joins them —
// there is no foreign key, and there cannot be one while the left side is
// whatever somebody typed.
//
// So this is string matching, and the honest part is not the matching. It is
// what happens when the matching fails.
//
// A card that does not resolve is REPORTED AS UNRESOLVED. It is never dropped
// from the list, and it never falls back to a flat rate. Both of those are
// worse than showing nothing:
//
//   • Dropped — a card the client holds goes missing from their own page, and
//     the omission is invisible, because a list always looks complete.
//   • Defaulted to a flat rate — the page states an earn rate for a card
//     nobody matched. That is a number about the client's money, invented by
//     a failed lookup.
//
// With eighteen catalogue entries against open-ended advisor typing,
// non-resolution is the common case rather than the edge case. It is modelled
// as a first-class outcome carrying a reason, in the same shape as the
// `unknown` gate on the graduation engine and the unscored transaction on the
// risk summary: a third state, named, rather than collapsed into whichever of
// the two convenient ones is nearer to hand.
// ============================================================

import {
  getActiveCards,
  type CardProduct,
  type RewardTier,
} from './card-products.js';
import { normalizeIssuerSlug } from './statement-normalizer.js';

/** Why a held card could not be resolved to a catalogue entry. */
export type UnmatchedReason =
  | 'no_product_name'
  | 'issuer_not_in_catalog'
  | 'product_not_in_catalog'
  | 'product_ambiguous';

export interface MatchedHeldCard {
  status: 'matched';
  catalogCardId: string;
  catalogCardName: string;
  rewardsType: CardProduct['rewardsType'];
  rewardsTiers: ReadonlyArray<RewardTier>;
  annualFee: number;
}

export interface UnmatchedHeldCard {
  status: 'unmatched';
  reason: UnmatchedReason;
  /** Shown to the advisor verbatim. Never a rate, never a guess. */
  explanation: string;
}

export type HeldCardMatch = MatchedHeldCard | UnmatchedHeldCard;

/**
 * Reduce a product name to a comparison key.
 *
 * Punctuation and case vary freely in typed input, and the issuer often
 * appears in the catalogue name but not in what an advisor writes: the
 * catalogue says "Chase Ink Business Preferred" while the advisor types "Ink
 * Business Preferred" beside an issuer field that already says Chase.
 */
function productKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Count of shared tokens between two keys, order-insensitive. */
function tokenOverlap(a: string, b: string): number {
  const bTokens = new Set(b.split(' ').filter(Boolean));
  return a.split(' ').filter((t) => t !== '' && bTokens.has(t)).length;
}

/**
 * Resolve a held card to its catalogue entry, or say why not.
 *
 * Matching is deliberately conservative: the issuer must resolve AND the
 * product name must correspond to exactly one card from that issuer. Two
 * cards matching equally well is reported unmatched rather than resolved to
 * whichever sorted first. A wrong match is worse than no match here — it
 * attaches one card's earn rates to a different card, and nothing downstream
 * can tell that it did.
 */
export function matchHeldCardToCatalog(
  issuer: string,
  productName: string | null | undefined,
  catalog: ReadonlyArray<CardProduct> = getActiveCards(),
): HeldCardMatch {
  if (productName == null || productName.trim() === '') {
    return {
      status: 'unmatched',
      reason: 'no_product_name',
      explanation:
        'No product name is recorded for this card, so it cannot be matched to a rate catalogue entry.',
    };
  }

  const issuerSlug = normalizeIssuerSlug(issuer);
  const fromIssuer = catalog.filter((c) => c.issuer === issuerSlug);

  if (fromIssuer.length === 0) {
    return {
      status: 'unmatched',
      reason: 'issuer_not_in_catalog',
      explanation: `No ${issuer} card is in the rate catalogue.`,
    };
  }

  const key = productKey(productName);
  const issuerWords = issuerSlug.replace(/_/g, ' ');

  // Exact match first, against the catalogue name both as written and with
  // the issuer prefix removed — the same card written two ways.
  const exact = fromIssuer.filter((c) => {
    const catKey = productKey(c.name);
    return (
      catKey === key ||
      catKey === productKey(`${issuerWords} ${productName}`) ||
      (catKey.startsWith(`${issuerWords} `) &&
        catKey.slice(issuerWords.length + 1) === key)
    );
  });

  if (exact.length === 1) return matched(exact[0]!);

  // Otherwise best token overlap, and only when one card wins outright.
  const scored = fromIssuer
    .map((c) => ({ card: c, score: tokenOverlap(key, productKey(c.name)) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best === undefined) {
    return {
      status: 'unmatched',
      reason: 'product_not_in_catalog',
      explanation: `"${productName}" does not correspond to any ${issuer} card in the rate catalogue.`,
    };
  }

  const tied = scored.filter((s) => s.score === best.score);
  if (tied.length > 1) {
    return {
      status: 'unmatched',
      reason: 'product_ambiguous',
      explanation:
        `"${productName}" matches ${tied.length} ${issuer} cards equally well ` +
        `(${tied.map((t) => t.card.name).join(', ')}), so it is not resolved to any of them.`,
    };
  }

  return matched(best.card);
}

function matched(card: CardProduct): MatchedHeldCard {
  return {
    status: 'matched',
    catalogCardId: card.id,
    catalogCardName: card.name,
    rewardsType: card.rewardsType,
    rewardsTiers: card.rewardsTiers,
    annualFee: card.annualFee,
  };
}

/**
 * The issuer slugs the catalogue actually contains.
 *
 * Exported so a test can assert this vocabulary and `normalizeIssuerSlug`'s
 * output still agree. They are two lists in different files, and a drift
 * between them makes `fromIssuer` empty here — which reads as "this issuer
 * makes no cards" rather than as an error. That failure has already happened
 * once in this codebase, between the rules engine and the card catalogue;
 * see `CREDIT_UNION_SLUGS_IN_RULES_ENGINE`.
 */
export function catalogIssuerSlugs(
  catalog: ReadonlyArray<CardProduct> = getActiveCards(),
): string[] {
  return [...new Set(catalog.map((c) => c.issuer))].sort();
}
