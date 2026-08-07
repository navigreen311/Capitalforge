# Saved strategies and optimizer-created funding rounds

**Status:** CLOSED 2026-08-07 — both built
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

**`influencesPlan` must survive with the rest.** Each provenance entry records
whether the scorer actually read it — six inputs are collected and unread today,
and that set will shrink as fields are wired. A plan read in six months has to
report the system that produced it, not the system reading it: if PAYDEX is
wired next quarter, a plan built before that must still show its PAYDEX as
decorative. Storing the plan whole gets this for free, which is a further
argument for JSON over normalised columns — a schema that models today's inputs
would silently re-interpret yesterday's plans.

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

---

## How the four decisions went

**Does saving replace or append?** *Append.* One strategy per client means the
second save destroys the record of what was discussed at the first, and the
numbers an advisor took a client through are the thing worth keeping. The list
view is the cost, and it is built.

**Who can save?** *Anyone in the tenant with `business:write`*, with `createdBy`
recording which of them did. Restricting to "the advisor on the deal" needs a
notion of deal ownership this system does not have; inventing one here would
put a second, weaker answer beside the RBAC that already exists.

**Does a saved strategy expire?** *No, and it is never deleted.*
`OptimizerResult.expiresAt` exists because a live recommendation goes stale.
A *record* of a recommendation does not go stale — it becomes historical, which
is a different thing. Callers get `createdAt` and can say "planned in March"
rather than being handed a plan presenting itself as current.

**Does creating a round from a plan link the two?** *Yes*, and the link lives on
the round: `FundingRound.savedStrategyId`. A round opened six months from now
needs to say what it was planned from, one strategy can reasonably produce more
than one round, and a round created from the Funding Rounds page carries null —
which is honest, because not every round comes from a plan.

## What was found while building it

`planHasAssumedDefaults` was first written to scan `inputProvenance` for
entries with `source === 'assumed_default'`. That was wrong twice: the
provenance block is a **record keyed by input name, not a list**, so the scan
would have found nothing and marked every plan as fully observed — and the
block already publishes its own `hasAssumedDefaults`. It reads the optimizer's
flag now. A second implementation of a rule is how a checker drifts from the
thing it checks, which this repository has already paid for once in
`scripts/track-migration-impact.ts`.
