# Two card catalogues, overlapping sets, nothing keeping them honest

Raised 2026-08-07, during the held-cards work on `/rewards`. **Status: open —
this is a scoped question, not a proposed fix.** The decision is a product and
data-ownership call, not a refactor anyone should make on the way past.

---

## What exists

Two independent records of what business cards are and what they earn.

| | `prisma.CardProduct` | `CARD_CATALOG` |
|---|---|---|
| Where | database table, `prisma/seeds/card-products.ts` | `src/backend/services/card-products.ts`, a `const` |
| Rows | **23** live | **18** hardcoded |
| Earn structure | one `rewardsRate Decimal` | `rewardsTiers: RewardTier[]` |
| Caps | none | `annualCap` per tier |
| Read by | card list, eligibility, optimizer's *table* consumers | `RewardsOptimizationService`, held-card matching |
| Underwriting fields | `scoreMinimum`, `revenueMinimum`, `businessAgeMinimum`, `approvalDifficulty` | `minFicoEstimate`, `requiresPersonalGuarantee`, `reportsToPersonalBureau` |
| Freshness | `updatedAt` | `lastVerified` per card, `CARD_CATALOG_VERSION` |

They are **not** the same 18 cards plus 5. The sets overlap without either
containing the other, and the two disagree about which issuers exist at all —
`CARD_CATALOG` has `td_bank` and `pnc`; the table has credit-union issuers such
as `alliant` that the constant does not model.

## Why it matters

**The table cannot express a card's actual earn structure.** Chase Ink Business
Cash earns 5% on office supplies and phone services capped at $25,000, 2% on
gas and restaurants, 1% on everything else. `CardProduct.rewardsRate` holds one
number. The tier structure survives only in `rewardsDetails`, as prose:

```
"2% cash back on first $50,000/yr purchases, 1% after"
"4x on top 2 eligible spend categories each billing cycle (first $150K/yr), 1x all other"
```

That is machine-unusable. The information is present, and no code can act on it.

**A flat rate overstates or understates in the direction that matters.** A
single "5%" for the Ink Cash overstates every dollar past $25,000 in office
supplies and every dollar in any other category — and a client's largest
category is exactly where a cap bites. "1%" understates the reason to hold the
card at all. Neither error is conservative.

**Nothing fails when they disagree.** There is no test, no constraint, and no
build step comparing them. `rewardsRate` has already carried two conventions at
once — 28 rows as a percent and 12 as a fraction, for the same products,
because two seed sources disagreed — and the guard added afterwards
(`prisma/seeds/card-products.ts`, `scripts/dedupe-card-products.ts`) checks that
one table against itself, not against the constant.

This is the `scripts/track-migration-impact.ts` shape: a second copy of
something, with nothing checking it against the original, that keeps answering
plausibly after it rots. There the copy read `TrackThresholds.minBusinessCreditScore`
for weeks after the field was renamed, resolved every client to Credit Builder,
and produced a formatted report that `docs/gaps.md` then cited as evidence.

**It is already load-bearing for advice about money.** The optimizer reads the
constant. `/rewards` now resolves held cards against the constant and prints
earn rates to an advisor. The card list and eligibility paths read the table. An
advisor comparing the two screens is comparing two different sources, and
nothing on either says so.

## The options

### A. Move the tier structure into the database

Add a `CardRewardTier` table (`cardProductId`, `category`, `rate`, `unit`,
`annualCap`), drop the flat `rewardsRate`, delete `CARD_CATALOG`, point the
optimizer and the matcher at the table.

- **For** — one source. Rates become editable without a deploy, which matters
  because issuers change them and `lastVerified: '2026-03-01'` is already
  stale. Per-tenant overrides become possible.
- **Against** — the largest change. Everything reading `CARD_CATALOG`
  synchronously becomes async. The catalogue's *underwriting* fields
  (`minFicoEstimate`, `reportsToPersonalBureau`) have no column and would need
  reconciling with the table's differently-named ones, which is its own
  migration with its own threshold-comparison risk. Editable rates need an audit
  trail: a rate is an input to advice, and a changed rate silently changes
  historical recommendations.

### B. `CARD_CATALOG` becomes the source; the table derives from it

Keep the constant as the authored artifact. Make the seeder generate
`CardProduct` rows from it, so the table is a projection. Add a check that
fails when the table contains a product the constant does not.

- **For** — much the smallest change, and it matches how the data is actually
  maintained today: somebody edits a file and opens a PR, which is the right
  workflow for a number that feeds financial advice, because it gets reviewed.
  Kills the drift by construction rather than by a test that must be remembered.
- **Against** — rates need a deploy to change. The 5 table-only products have to
  be authored into the constant or consciously dropped, and the credit-union
  products are the awkward ones: they are real, and the constant's `Issuer`
  union does not model them. Does not resolve *which* fields are canonical where
  the two disagree.

### C. They serve different purposes and both stay, with the boundary stated

`CardProduct` is the **eligibility and shopping** catalogue: what exists, who
underwrites it, what it costs, who qualifies. `CARD_CATALOG` is the **earn-rate**
catalogue: what a card pays per category. Neither is a subset; each is
authoritative for its own columns; a test asserts the overlap agrees on the
fields both carry (issuer slug, product identity, annual fee).

- **For** — no migration. Possibly closest to the truth: the underwriting fields
  and the earn fields genuinely have different owners, different update
  cadences, and different consequences when wrong.
- **Against** — two catalogues is the status quo with a doc attached. Requires
  real discipline about which is read where, and the overlap test is the whole
  safety mechanism. Product identity across the two is currently only
  matchable by string, which is what this ticket is about.

## Recommendation, if one is wanted

**B**, then reassess. It is the cheapest change that makes the drift impossible
rather than merely detectable, and it preserves review-on-change for numbers
that feed advice about money. The 5 table-only products are the real work, and
enumerating them is a half-hour job that would also answer whether C is the
honest description.

**What should not happen is a partial A** — adding a tier table while
`CARD_CATALOG` stays and stays read. That is three sources.

## Before any of it

**Enumerate the disagreement.** Nobody has yet listed which products exist in
both, which in one, and where the shared fields differ. That list is the input
to this decision, and none of the options above should be chosen without it. It
is a script, not a design.

## Meanwhile

`held-card-catalog-match.ts` reads `CARD_CATALOG` and says so, and its
`catalogIssuerSlugs()` exists so a test can assert the issuer vocabulary has not
drifted from `normalizeIssuerSlug` — the narrow version of this problem, caught
because the same failure has already happened once between the rules engine and
the card catalogue (`CREDIT_UNION_SLUGS_IN_RULES_ENGINE`). That test covers
issuer slugs only. It does not cover rates, products, or fees.
