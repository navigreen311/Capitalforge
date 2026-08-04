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

export function isCreditUnionIssuer(value: string): boolean {
  return (CREDIT_UNION_ISSUER_IDS as readonly string[]).includes(value);
}

// ── Credit union membership ──────────────────────────────────
//
// A credit union card cannot be applied for without joining the credit union.
// That is not a detail to discover after an advisor has taken the
// recommendation to a client: for some of these, joining is a $5 donation, and
// for others it requires having served in the military or living in one state.
//
// Each path below is taken from the product's own `notes` field, which states
// the membership requirement. Where the requirement is a fact about the client
// we do not hold, the answer is "unknown" — never "eligible".

export type MembershipPathKind =
  /** Anyone may join, usually for a small donation or deposit. */
  | 'open'
  /** Residency or employment in a particular state. */
  | 'state'
  /** Employment in a particular industry, or an association. */
  | 'industry'
  /** Military or defence affiliation. */
  | 'military';

export interface MembershipPath {
  kind: MembershipPathKind;
  /** Shown to the advisor. Says what joining actually requires. */
  description: string;
  /** For `state`: the two-letter code that qualifies. */
  state?: string;
  /** Approximate cost of joining, in dollars. */
  cost?: number;
}

export const CREDIT_UNION_MEMBERSHIP: Record<string, MembershipPath> = {
  alliant: {
    kind: 'open',
    description: 'Open to anyone via a $5 Foster Care to Success donation.',
    cost: 5,
  },
  lake_michigan_cu: {
    kind: 'open',
    description: 'Open to anyone via a $5 ALS of Michigan donation.',
    cost: 5,
  },
  penfed: {
    kind: 'open',
    description: 'Open to anyone via a $5 National Military Family Association savings account.',
    cost: 5,
  },
  becu: {
    kind: 'state',
    description: 'Requires Washington state residency or employment.',
    state: 'WA',
  },
  first_tech: {
    kind: 'industry',
    description:
      'Requires employment with a partner technology company, or Computer History Museum membership (about $50).',
    cost: 50,
  },
  navy_federal: {
    kind: 'military',
    description: 'Requires military, veteran, or Department of Defense affiliation.',
  },
};
