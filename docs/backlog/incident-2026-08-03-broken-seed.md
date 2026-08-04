# Incident: `db:seed` was broken by a commit and shipped untested

**Date:** 2026-08-03
**Commit:** `fb2e8bb` — *fix(card-products): collapse 12 duplicated products…*
**Found:** while writing an unrelated guard, one commit later
**Status:** fixed; the process rule below is the point of this note

## What happened

The commit collapsed twelve duplicated card products and re-keyed the survivors
to short ids, then added `@@unique([issuerId, name])`.

`prisma/seeds/card-products.ts` upserted on the **derived** id,
`${issuerId}-${slug(name)}`. After the re-key that id no longer matched any row,
so the upsert would have fallen through to `create` — and the new unique
constraint would have rejected it. **`npm run db:seed` was broken by the same
commit that added the constraint.**

It was committed anyway. Everything in that commit was verified: the data was
checked before and after, the optimizer was re-run and returned a clean plan,
`tsc`, `vitest` and `lint` were all green.

**None of that touches the seed path.** The verification ran against a database
that was already in the new state and an app that was already running. Nothing
rebuilt from scratch, which is the only thing that would have exercised the
seeder.

## What would and would not have caught it — measured, not assumed

An earlier version of this note said CI would have caught it, because
`npm run db:seed` runs before the E2E job (`.github/workflows/ci.yml:237`).
**That is wrong.** It was tested on a throwaway database:

| Scenario | Result |
|---|---|
| Fresh table, pre-fix seeder, run twice | **passes** — creates the long ids, matches them again |
| Table with re-keyed short ids, pre-fix seeder | **P2002** on `(issuerId, name)` |

CI creates an empty database, migrates and seeds **once**. The pre-fix seeder is
perfectly happy there: nothing exists, so it creates rows under the derived long
ids and finds them again next time. **CI would have stayed green.**

The failure needs the re-keyed state — a database where the dedup script has
already run and the surviving rows hold short ids. That existed in exactly one
place: the developer's own database.

So the only thing that would have caught this is running `npm run db:seed`
locally, against the database the change had just been applied to. Which is the
rule below, and it is enough on its own.

It also means the idempotence check (`scripts/check-seed-idempotent.ts`) would
**not** have caught this one. It runs against a scratch database, which is the
passing scenario above. It is still worth having — it catches a seed that cannot
run twice at all, which is a real and separate failure — but it is not a
substitute for seeding the database you actually changed.

## Why the existing checks did not catch it

| Check | Why it passed |
|---|---|
| `tsc --noEmit` | The upsert was type-correct. The key was wrong, not mistyped. |
| `vitest` | No test seeds the database; the suite uses fixtures and mocks. |
| `lint` | Not a lint-shaped problem. |
| Live app verification | Read from an already-migrated database. Never seeded. |

The gap is structural: **every check verified the running system, and the defect
was in rebuilding it.**

## The rule

**Any change to the Prisma schema, to a primary key or unique constraint, or to
seed data requires a clean `npm run db:seed` before commit.**

Not "the app still works" — the seed specifically. It is the only thing that
exercises the create path, the upsert keys and the seed guards together.

Added to `CLAUDE.md`.

## Worth considering separately

The rule depends on remembering it, and — as measured above — no automated check
run against a fresh database can replace it. The defect lives in the difference
between a database that has been *migrated and modified* and one built from
nothing, and CI only ever builds from nothing.

`scripts/check-seed-idempotent.ts` is built and wired into CI. It seeds a scratch
database twice and asserts the second run changes nothing. It catches a seed that
cannot run twice — a `create` where an upsert was meant, a unique constraint that
collides on the second pass. It does not catch this incident's failure, and the
script says so.

What would catch this class automatically is harder: seeding a database that has
been through the same data migrations the developer's has. That means either
running one-off data scripts in CI (they are one-off for a reason) or keeping a
restorable snapshot of a realistic database to seed against. Neither is built,
and both are a larger commitment than the rule.
