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

// ── Recognising a credit union from free text ────────────────
//
// `CardApplication.issuer` is a free string holding a display name — "American
// Express", "Chase" — not a slug. Anything reasoning about an application's
// issuer therefore has to match text, and the one place that counts
// applications for Chase 5/24 matched nothing at all: it counted every approved
// application regardless of issuer, so a credit union application counted
// against 5/24, which is the inverse of the rule.
//
// Credit union applications do not drive 5/24. Getting that wrong does not
// merely lose an optimisation — it tells a client who took the recommended
// credit union cards that they have exhausted their Chase eligibility when they
// have not, penalising them for following the advice.

/** Display names each credit union appears under, alongside its slug. */
const CREDIT_UNION_ALIASES: Record<CreditUnionIssuerId, readonly string[]> = {
  navy_federal: ['Navy Federal Credit Union', 'Navy Federal', 'NFCU'],
  penfed: ['PenFed Credit Union', 'PenFed', 'Pentagon Federal Credit Union'],
  alliant: ['Alliant Credit Union', 'Alliant'],
  first_tech: ['First Tech Federal Credit Union', 'First Tech', 'First Tech FCU'],
  becu: ['BECU', 'Boeing Employees Credit Union'],
  // "Lake Michigan" without the suffix is how the frontend list spells it.
  // The slug carries a `_cu` the display name does not, so without this alias
  // a member of this credit union parsed to nothing and was told to join.
  lake_michigan_cu: ['Lake Michigan Credit Union', 'Lake Michigan CU', 'LMCU', 'Lake Michigan'],
};

function normaliseIssuerText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * True when this issuer string names a credit union, however it is spelled.
 *
 * Accepts the slug (`navy_federal`), any known display name ("Navy Federal
 * Credit Union"), and anything self-identifying as a credit union — the last so
 * that a credit union added to the catalogue without being added here is
 * treated as one rather than silently counted as a bank. BECU does not say
 * "credit union" in its name, which is why the alias list exists at all.
 */
export function isCreditUnionIssuerName(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalised = normaliseIssuerText(value);
  if (!normalised) return false;

  if ((CREDIT_UNION_ISSUER_IDS as readonly string[]).some((id) => normaliseIssuerText(id) === normalised)) {
    return true;
  }
  for (const id of CREDIT_UNION_ISSUER_IDS) {
    const aliases = CREDIT_UNION_ALIASES[id];
    if (aliases.some((alias) => normaliseIssuerText(alias) === normalised)) return true;
  }
  return normalised.includes('creditunion') || normalised.endsWith('fcu');
}

// ── The parse boundary ───────────────────────────────────────
//
// Issuer identity arrives as free text from four directions: a database column
// (`CardApplication.issuer` holds display names, `CardProduct.issuerId` holds
// slugs), a request body, a query parameter, and seed data. Every place that
// needed identity from one of those has, so far, worked it out for itself —
// `issuer.toLowerCase()`, `.replace(/\s+/g, '_')`, a `Record<string, T>` lookup
// that silently returns undefined. Five such sites existed before this
// function, no two agreeing, and the two most recently found were discovered by
// accident while doing something else.
//
// This is the one place text becomes identity. Past it, an issuer is a typed
// value with a known kind; before it, it is a string nobody has checked.

export type BankIssuerId = (typeof BANK_ISSUER_IDS)[number];
export type CreditUnionIssuerId = (typeof CREDIT_UNION_ISSUER_IDS)[number];

export interface BankIssuerIdentity {
  kind: 'bank';
  id: BankIssuerId;
}

export interface CreditUnionIssuerIdentity {
  kind: 'credit_union';
  id: CreditUnionIssuerId;
}

/**
 * An issuer, and which sort it is.
 *
 * The kind is on the identity rather than on each card, because everything it
 * decides — the Chase 5/24 exemption, whether membership is required, which
 * velocity rules apply — is a fact about the institution. A per-card flag could
 * disagree with itself; this cannot.
 */
export type IssuerIdentity = BankIssuerIdentity | CreditUnionIssuerIdentity;

/**
 * Resolve free text to an issuer, or null when it names none.
 *
 * Accepts a slug (`navy_federal`), a display name ("Navy Federal Credit
 * Union"), and the hyphen and spacing variants each of those appears in.
 * Returns null rather than guessing: a caller that cannot identify an issuer
 * needs to decide what to do, and the habit of defaulting is what put a
 * 30-day cooldown on issuers nobody had looked up.
 */
export function parseIssuer(raw: string | null | undefined): IssuerIdentity | null {
  if (!raw) return null;
  const normalised = normaliseIssuerText(raw);
  if (!normalised) return null;

  for (const id of CREDIT_UNION_ISSUER_IDS) {
    if (normaliseIssuerText(id) === normalised) return { kind: 'credit_union', id };
  }
  for (const id of CREDIT_UNION_ISSUER_IDS) {
    if (CREDIT_UNION_ALIASES[id].some((alias) => normaliseIssuerText(alias) === normalised)) {
      return { kind: 'credit_union', id };
    }
  }
  for (const id of BANK_ISSUER_IDS) {
    if (normaliseIssuerText(id) === normalised) return { kind: 'bank', id };
  }
  for (const id of BANK_ISSUER_IDS) {
    if (BANK_ISSUER_ALIASES[id].some((alias) => normaliseIssuerText(alias) === normalised)) {
      return { kind: 'bank', id };
    }
  }

  // An unlisted credit union deliberately does NOT resolve here.
  //
  // `IssuerIdentity.id` is a literal union, so there is no honest value to
  // return for an issuer we have no configuration for — and returning one
  // would imply a cooldown, a membership path and velocity rules that do not
  // exist. Null makes the caller decide.
  //
  // The fail-safe still holds where it matters: `isCreditUnionIssuerName`
  // accepts self-identifying credit unions, and the 5/24 count uses that
  // rather than this. Under-counting 5/24 costs a declined application, which
  // the advisor sees; counting a credit union card against it tells a client
  // they are out of Chase eligibility when they are not, so they never apply
  // and nobody finds out. The second is worse and silent.
  return null;
}

/** Display names each bank appears under. `CardApplication.issuer` holds these. */
const BANK_ISSUER_ALIASES: Record<BankIssuerId, readonly string[]> = {
  chase: ['Chase', 'JPMorgan Chase', 'Chase Bank'],
  amex: ['American Express', 'Amex', 'AmEx'],
  capital_one: ['Capital One'],
  citi: ['Citi', 'Citibank'],
  bank_of_america: ['Bank of America', 'BofA', 'BoA'],
  us_bank: ['US Bank', 'U.S. Bank', 'U.S. Bancorp'],
  wells_fargo: ['Wells Fargo'],
  discover: ['Discover'],
  td_bank: ['TD Bank', 'TD'],
  pnc: ['PNC', 'PNC Bank'],
};

// ── Credit union membership ──────────────────────────────────
//
// A credit union card cannot be applied for without joining the credit union.
// That is not a detail to discover after an advisor has taken the
// recommendation to a client: for some of these, joining is a $5 donation, and
// for others it requires having served in the military or living in one state.
//
// Each path below states what joining actually requires, and each cost says
// where it came from. Where the requirement is a fact about the client we do
// not hold, the answer is "unknown" — never "eligible"; where the cost is a
// figure we cannot source, it is "unconfirmed" — never a number.

/**
 * What joining costs, and whether we can stand behind the number.
 *
 * A bare `number` was not enough, and the reason is worth keeping. Four tables
 * in this codebase carried a join cost for the same six credit unions and no
 * two agreed — Alliant was $5 in one and $10 in three, PenFed $5 and $17,
 * First Tech $50 and $15. An advisor read one number off the screen and the
 * client met a different one at the credit union.
 *
 * Picking a winner would not have fixed it: no single table was right about
 * every issuer. So a cost now carries where it came from, and a cost nobody
 * can source is not rendered as a number at all. A figure with a caveat beside
 * it still reads as a figure — the eye takes the digits and skips the note,
 * which is the same reason an assumed FICO is surfaced as `assumed_default`
 * rather than as 680 with an asterisk.
 */
export type MembershipCost =
  /** This path has no join fee at all. Not a cost of zero — no cost. */
  | { kind: 'none' }
  /** A cost we can point at a source for. */
  | { kind: 'confirmed'; amount: number; source: string }
  /** A cost we cannot currently source. Never rendered as a number. */
  | { kind: 'unconfirmed'; note: string };

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
  /** What joining costs, with its provenance. */
  cost: MembershipCost;
}

/**
 * The one place a credit union membership requirement is described.
 *
 * Keyed by `CreditUnionIssuerId` rather than `string`, so adding a credit
 * union to the registry without describing how to join it is a compile error
 * rather than a card that appears in a plan with no membership path.
 */
export const CREDIT_UNION_MEMBERSHIP: Record<CreditUnionIssuerId, MembershipPath> = {
  alliant: {
    kind: 'open',
    description: 'Open to anyone via a Foster Care to Success donation.',
    cost: { kind: 'confirmed', amount: 5, source: 'Alliant Credit Union — Foster Care to Success donation' },
  },
  lake_michigan_cu: {
    kind: 'open',
    // Not "lower Michigan residents". LMCU is open nationally through this
    // donation; the residency wording was a stale restriction carried in the
    // frontend copy and contradicted this entry on the same screen.
    description: 'Open to anyone via an ALS of Michigan donation. Residency is not required.',
    cost: { kind: 'confirmed', amount: 5, source: 'Lake Michigan Credit Union — ALS of Michigan donation' },
  },
  penfed: {
    kind: 'open',
    description: "Open to anyone via a Voices for America's Troops donation.",
    cost: {
      kind: 'confirmed',
      amount: 5,
      source: "PenFed Credit Union — Voices for America's Troops donation",
    },
  },
  becu: {
    kind: 'state',
    description: 'Requires Washington state residency or employment.',
    state: 'WA',
    cost: { kind: 'none' },
  },
  first_tech: {
    kind: 'industry',
    description:
      'Requires employment with a partner technology company, or membership of the Computer History Museum.',
    // Deliberately unconfirmed. The four tables disagreed at $15 and $50 — a
    // threefold spread on a number an advisor quotes to a client — and neither
    // figure could be sourced. Joining through a partner employer carries no
    // association fee; the museum route has a price nobody here can cite.
    cost: {
      kind: 'unconfirmed',
      note: 'No fee when qualifying through a partner employer. The Computer History Museum route has a fee we cannot currently source.',
    },
  },
  navy_federal: {
    kind: 'military',
    description: 'Requires military, veteran, or Department of Defense affiliation.',
    cost: { kind: 'none' },
  },
};

/**
 * How a membership cost should be written on screen.
 *
 * The unconfirmed case deliberately returns no digits.
 */
export function formatMembershipCost(cost: MembershipCost): string {
  switch (cost.kind) {
    case 'none':
      return 'No membership fee';
    case 'confirmed':
      return `$${cost.amount}`;
    case 'unconfirmed':
      return 'Membership required — cost not confirmed';
  }
}

/** The cost as a number, or null when there is nothing citable to show. */
export function membershipCostAmount(cost: MembershipCost): number | null {
  return cost.kind === 'confirmed' ? cost.amount : cost.kind === 'none' ? 0 : null;
}

/**
 * The name to show a person, for an issuer we hold as a slug.
 *
 * Drawn from the same alias lists `parseIssuer` reads, first entry per issuer,
 * so the two directions cannot drift. Where a slug has no alias the slug is
 * de-slugified rather than shown raw — `sandbox.service.ts` did this inline
 * with `replace('_', ' ').toUpperCase()`, which handles one underscore and
 * shouts.
 */
export function issuerDisplayName(id: string): string {
  const parsed = parseIssuer(id);
  const key = parsed?.id ?? id;
  const alias =
    (CREDIT_UNION_ALIASES as Record<string, readonly string[] | undefined>)[key]?.[0]
    ?? (BANK_ISSUER_ALIASES as Record<string, readonly string[] | undefined>)[key]?.[0];
  if (alias) return alias;
  return key
    .split('_')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}
