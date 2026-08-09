# A seed file nothing runs

**Status:** open. `prisma/seed-full.ts` is referenced by nothing.

## What it is

`npm run db:seed` runs `prisma/seed.ts`. `prisma/seed-full.ts` is not
referenced by `package.json`, by any CI workflow, or by any script. It is a
1,000-line file describing a database that has never existed.

Found while asking why `statement_records` was empty. `seed-full.ts` defines
ten statement records — `fs-stmt-001` through `fs-stmt-010`, with balances,
minimum payments and interest charges. The table has zero rows, because
nothing has ever executed that file.

## Why it belongs in this backlog rather than a cleanup ticket

It is the same defect as the flagged-transaction rule and the mock execution
log, one level further back.

A fixture describes a system. When nothing runs the fixture, it describes a
system that does not exist — and it keeps describing it, convincingly, to
anyone reading the repository to understand what the product holds. Its rows
carry `normalizedData: { raw: true, extractedBy: 'ocr-pipeline-v2' }`,
naming an OCR pipeline this codebase does not contain. Someone reading that
file would conclude statements arrive by OCR. Nothing arrives at all; the
import endpoint takes JSON.

The danger is not that the file is stale. It is that a stale fixture and a
live one are indistinguishable by reading, and this one is the more detailed
of the two — so it is the more persuasive.

## What to decide

1. **Delete it, or wire it up.** If its data is wanted, `db:seed` should call
   it and its claims should be true — which means removing `extractedBy:
   'ocr-pipeline-v2'` before it reaches a database, not after.
2. **If deleted, check what else references its ids.** `fs-stmt-*`,
   `fs-app-*` and similar appear across the file; something else may cite
   them as though they exist.
3. **A guard.** `tests/unit/runner-coverage.test.ts` already fails when a test
   directory goes unrun — the same idea applies to a seed module. A seed file
   in `prisma/` that no entry point imports could fail a test rather than sit
   there.

## Related

- `docs/backlog/false-success-audit.md` — the seventh entry, on fabricated and
  real data rendering identically. This is the same failure in a file rather
  than on a screen.
