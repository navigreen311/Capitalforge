# `CardProduct.issuerId` should reference `Issuer`

**Status:** open, not started
**Surfaced by:** the card-product dedup, 2026-08-03

## Two identifier spaces for the same concept

There are two independent ways to name an issuer in this database, and nothing
connects them:

| | `Issuer` table | `CardProduct.issuerId` |
|---|---|---|
| Key | **UUID** (`2b8bb54b-13dd-…`) | **slug** (`chase`) |
| Rows / values | **7** | **16 distinct** |
| Relation | — | **none** — a free `String` |

`Issuer` holds Chase, American Express, Capital One, Citi, Bank of America, US
Bank and Wells Fargo. `CardProduct.issuerId` holds those seven as slugs plus
nine the table has never heard of: `discover`, `td_bank`, `pnc`, and the six
credit unions (`alliant`, `becu`, `first_tech`, `lake_michigan_cu`,
`navy_federal`, `penfed`).

So the issuer of a card product is not the issuer in the issuer table. Joining
them is impossible without a lookup by name, and the names do not match either
— `amex` against "American Express".

## What it costs

The slug is matched by exact string in at least four places: the optimizer's
`ISSUER_COOLDOWNS`, the frontend `ISSUER_OPTIONS` exclude list, the issuer rules
engine, and the seed. **A row spelled `us-bank` where the rest of the system
says `us_bank` is matched by none of them.** It would be excluded by nothing,
given no cooldown, subject to no issuer rule — and would still appear in plans,
with nothing about the output looking wrong.

No such row exists today. Every value is correct. But that was true by luck
rather than by check: two seed sources wrote this table and neither validated
the field, and establishing it was correct required querying the database. A
guard now rejects an unknown `issuerId` at seed time
(`assertSeedsAreSane`, against `src/shared/constants/issuers.ts`), which closes
the gap for seeded data. It does not close it for anything written by other
means, and it does not remove the duplication of a list that now exists in four
places.

There is a worked example of what free-string keys cost here already: the
primary key was derived as `${issuerId}-${slug(name)}`, two seed sources spelled
the issuer differently, and twelve products were written twice under two ids
with no complaint from the database. The optimizer then recommended the same
card at rank 1 and rank 2 of one plan.

## What it would take

1. **Add a slug to `Issuer`** — `slug String @unique` — and backfill the seven
   existing rows.
2. **Seed the nine missing issuers.** Six are credit unions, which may argue for
   a `type` column (`bank` | `credit_union`) rather than a second table; the
   optimizer already treats CU products differently via `includeCreditUnions`.
3. **Backfill and constrain.** Point `CardProduct.issuerId` at `Issuer.slug`
   with a real relation. Every one of the 29 current rows already holds a valid
   slug, so the backfill is a no-op and the constraint should apply cleanly.
4. **Collapse the four hardcoded lists** into columns on `Issuer`: cooldown days
   and whether that cooldown is researched, and whether the issuer is offered in
   the Exclude Issuers control. The optimizer's `ISSUER_COOLDOWNS` currently
   carries a `source` marking twelve of seventeen entries as unresearched
   defaults — that belongs in the database next to the issuer, not in a service.

## Worth deciding first

- **Slug or UUID as the foreign key?** Slug reads better in the optimizer and in
  API payloads, and the whole system already speaks slugs. UUID is conventional
  here. A slug key means renaming an issuer is a migration.
- **Does `Issuer` become the home of issuer rules?** `issuer-rules.service.ts`
  hardcodes Chase, Amex and Citi. If cooldowns move to the table, the velocity
  rules probably should too — at which point "no published rule on file" becomes
  a nullable column rather than a marker in code.

## Correction: where the credit union blind spot actually began

Recorded because we traced this to the wrong place twice, and the wrong path is
plausible enough that the next reader will take it too.

The reasoning ran: `ExistingCard.issuer` is typed to ten banks, so a credit
union card is unrepresentable, so the Chase 5/24 exemption has nowhere to live.
That is true, and it is not where it starts.

**It starts at the request schema.** `optimizer.routes.ts` validated incoming
existing cards with a Zod enum of the same ten banks. A credit union card in a
request was rejected with a validation error before any type, engine or rule saw
it. The type limitation downstream was real but redundant — nothing could reach
it.

Two lessons worth keeping:

- **A type is not the outermost boundary.** The schema is. Widening a type
  without widening the validator that feeds it changes nothing, and the symptom
  — credit union cards never appearing — is identical either way.
- **The cast hid it.** `existingCards as ExistingCard[]` made the schema and the
  type agree by assertion. Removing the cast is what surfaced the enum; while it
  stood, the two could disagree indefinitely.

Both are now fixed (`5e2007a`). The schema accepts any issuer string and
resolves it through `parseIssuer`.
