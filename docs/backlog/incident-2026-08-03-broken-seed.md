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

`npm run db:seed` runs in CI before the E2E job (`.github/workflows/ci.yml:237`),
so this would have failed there — after the commit, on a signal nobody was
watching yet.

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

The rule depends on remembering it. Two options that would not:

- **Run `db:seed` against a scratch database in CI on every PR**, not only
  before E2E, so the failure lands on the PR that caused it.
- **A test that seeds a throwaway schema and asserts it is idempotent** — run
  it twice, expect the same row count. That would have caught this, and would
  catch the next unique constraint that collides with a derived key.

Neither is built. The second is the stronger of the two: it turns a process rule
into a check.
