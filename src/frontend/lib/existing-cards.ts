// ============================================================
// The optimizer's Existing Cards catalogue
//
// Lives here rather than in the page because the split below is a claim
// about issuer identity, and a claim needs a test. `parseIssuer` matches
// exactly and returns null rather than guessing, so a label split wrongly
// does not error — it records a card under an issuer nothing recognises,
// which silently skips both the issuer rules and the credit-union exemption
// that decides whether the card counts against 5/24.
// ============================================================

/**
 * The catalogue, split into the two fields the record actually stores.
 *
 * Written out rather than derived by splitting the label on its first word.
 * That heuristic gets Chase and Amex right and then makes "Bank" the issuer of
 * a Bank of America card and "US" the issuer of a US Bank one. `parseIssuer`
 * matches exactly and returns null instead of guessing, so those two would
 * come back unidentified — and the 5/24 exemption for credit unions is decided
 * by issuer name. A wrong issuer is not a cosmetic error here.
 */
export const EXISTING_CARD_CATALOGUE: readonly { label: string; issuer: string; productName: string }[] = [
  { label: 'Chase Ink Business Preferred',      issuer: 'Chase',            productName: 'Ink Business Preferred' },
  { label: 'Chase Ink Business Cash',           issuer: 'Chase',            productName: 'Ink Business Cash' },
  { label: 'Chase Ink Business Unlimited',      issuer: 'Chase',            productName: 'Ink Business Unlimited' },
  { label: 'Amex Business Gold',                issuer: 'Amex',             productName: 'Business Gold' },
  { label: 'Amex Business Platinum',            issuer: 'Amex',             productName: 'Business Platinum' },
  { label: 'Amex Blue Business Cash',           issuer: 'Amex',             productName: 'Blue Business Cash' },
  { label: 'Capital One Spark Cash Plus',       issuer: 'Capital One',      productName: 'Spark Cash Plus' },
  { label: 'Capital One Spark Miles',           issuer: 'Capital One',      productName: 'Spark Miles' },
  { label: 'Brex 30',                           issuer: 'Brex',             productName: 'Brex 30' },
  { label: 'Bank of America Business Advantage', issuer: 'Bank of America', productName: 'Business Advantage' },
  { label: 'Citi Business Custom Cash',         issuer: 'Citi',             productName: 'Business Custom Cash' },
  { label: 'US Bank Business Triple Cash',      issuer: 'US Bank',          productName: 'Business Triple Cash' },
  { label: 'Wells Fargo Business Platinum',     issuer: 'Wells Fargo',      productName: 'Business Platinum' },
  { label: 'Discover it Business',              issuer: 'Discover',         productName: 'it Business' },
];

export const EXISTING_CARDS = EXISTING_CARD_CATALOGUE.map((c) => c.label);

/** The catalogue entry for a label, or null for one that is not in it. */
export function catalogueEntry(label: string) {
  return EXISTING_CARD_CATALOGUE.find((c) => c.label === label) ?? null;
}

/**
 * Catalogue issuers that `parseIssuer` does not recognise.
 *
 * Brex is offered as a checkbox here and appears nowhere in
 * `shared/constants/issuers.ts` — not in the bank list, not in the aliases.
 * Recording a Brex card is therefore honest but partial:
 *
 *   - it counts against 5/24, correctly, because that count asks only whether
 *     the issuer is a credit union and Brex is not;
 *   - it reaches the issuer-rules path as an unresolved issuer, which that
 *     path already reports rather than resolving in the card's favour.
 *
 * Listed rather than fixed by adding `brex` to the registry. Membership there
 * implies a cooldown, a velocity rule and an application policy for the
 * issuer, and inventing those is the failure `parseIssuer` returns null to
 * avoid. This constant exists so the gap is visible and so a *new* catalogue
 * entry with an unrecognised issuer fails a test instead of joining it
 * quietly.
 *
 * See `docs/gaps.md` §7.
 */
export const CATALOGUE_ISSUERS_NOT_IN_REGISTRY: readonly string[] = ['Brex'];
