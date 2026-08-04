// ============================================================
// CapitalForge — the issuer slugs card products may use
//
// `CardProduct.issuerId` is a free string. Everything that reasons about an
// issuer — the optimizer's cooldown table, the Exclude Issuers control, the
// issuer rules engine — matches on it exactly, so a row spelled "us-bank"
// where the rest of the system says "us_bank" would be silently unmatched:
// excluded from nothing, given no cooldown, subject to no issuer rule. It
// would still appear in plans, and nothing would look wrong.
//
// No such row exists today — every one of the sixteen values in the table is
// in this list. That was true by luck rather than by check: two seed sources
// wrote this table and neither validated the field. This list makes it
// checkable, and `assertSeedsAreSane` in prisma/seeds/card-products.ts turns a
// stray spelling into a failed seed rather than a card nobody can exclude.
//
// Adding an issuer is deliberate: add it here, then decide its cooldown in
// ISSUER_COOLDOWNS and whether it belongs in the Exclude Issuers list.
// ============================================================

/** Banks and card networks. */
export const BANK_ISSUER_IDS = [
  'chase',
  'amex',
  'capital_one',
  'citi',
  'bank_of_america',
  'us_bank',
  'wells_fargo',
  'discover',
  'td_bank',
  'pnc',
] as const;

/** Credit unions. Membership-gated, so they only appear when asked for. */
export const CREDIT_UNION_ISSUER_IDS = [
  'alliant',
  'becu',
  'first_tech',
  'lake_michigan_cu',
  'navy_federal',
  'penfed',
] as const;

export const KNOWN_ISSUER_IDS = [
  ...BANK_ISSUER_IDS,
  ...CREDIT_UNION_ISSUER_IDS,
] as const;

export type KnownIssuerId = (typeof KNOWN_ISSUER_IDS)[number];

export function isKnownIssuerId(value: string): value is KnownIssuerId {
  return (KNOWN_ISSUER_IDS as readonly string[]).includes(value);
}
