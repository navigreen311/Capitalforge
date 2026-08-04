# Saved strategies and optimizer-created funding rounds

**Status:** open, not started
**Blocks:** persisting `inputProvenance` with a plan (P0-1 item 5)
**Related:** `docs/gaps.md` — both endpoints now answer 501

## What exists

Nothing. `POST /api/optimizer/save-strategy` and `POST /api/optimizer/create-round`
were mock handlers with no Prisma import. They returned success, and
`create-round` fabricated an id of the form `round-<client>-<n>-<timestamp>`.
Both now answer **501** rather than claiming a write that never happened.

There is no table for a saved strategy. A funding round has a real model —
`FundingRound` — but the optimizer never wrote one.

## Why it matters

A plan is only useful if it can be read back. Today, closing the tab loses it,
and the numbers an advisor discussed with a client cannot be reconstructed.

It also blocks provenance. A plan now records whether its FICO came from a
credit pull, the advisor, or an assumed constant — but that record dies with
the page. **A plan read six months from now must still show what it was built
on**, which is the whole point of the provenance work, and needs somewhere to
live.

## What it would take

**`SavedStrategy` table.**

```prisma
model SavedStrategy {
  id               String   @id @default(uuid())
  tenantId         String
  businessId       String
  /** The StackingPlan as returned, including inputProvenance. */
  plan             Json
  /** Denormalised for listing without parsing the plan. */
  totalEstimatedCredit  Decimal?
  cardCount        Int
  prioritizationMode String
  /** True when the plan rested on at least one assumed default. */
  hasAssumedDefaults Boolean @default(false)
  createdBy        String?
  createdAt        DateTime @default(now())
}
```

Storing the whole plan as JSON is deliberate: a strategy is a **snapshot of a
recommendation made at a moment**, not live data. If card products change next
month, the saved plan must still show what was recommended and why — including
which inputs were assumed. Normalising it into rows would let it drift.

`hasAssumedDefaults` is denormalised so a list can flag estimate-only plans
without parsing every JSON blob.

**Real `FundingRound` create.** The model exists. The optimizer route should
call the same service the Funding Rounds page uses rather than growing a second
creation path — worth checking whether one exists before writing a new one.

**Re-enable the UI.** Both buttons are disabled and badged "Not built". The
frontend success paths are still in place, so this is a backend change plus
removing the `disabled`.

## Decisions to make first

- **Does saving replace or append?** One saved strategy per client, or a
  history? History is more useful and costs a list view.
- **Who can save?** The advisor on the deal, or anyone in the tenant.
- **Does a saved strategy expire?** The optimizer already treats results as
  fresh for 24 hours in `OptimizerResult.expiresAt`. A six-month-old saved plan
  should probably be readable but visibly stale.
- **Does creating a round from a plan link the two?** A `fundingRoundId` on the
  strategy, or a `strategyId` on the round, would let the round show what it was
  planned from. Worth doing while both are being built.
