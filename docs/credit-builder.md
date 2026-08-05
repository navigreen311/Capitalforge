# Credit Builder

`/credit-builder` tracks a client's progress toward business credit: the DUNS
registration track, bureau scores, Net-30 vendor tradelines, and the criteria
that unlock card stacking.

This document covers what the page reads, what it writes, and — because it
matters more here than the feature list — **what it deliberately does not
claim**.

---

## Surfaces and their sources

| Surface | Source | Writes? |
|---|---|---|
| Client picker | `GET /api/v1/clients` | no |
| Business credit scores (3 cards) | `GET /api/credit-builder/:clientId/scores` | no |
| Score trajectory chart | `GET /api/credit-builder/:clientId/score-history` | no |
| DUNS track (6 steps + circles) | `GET /api/credit-builder/:clientId/steps` | `PUT …/steps/:stepNumber` |
| Net-30 vendor table | in-page reference list | no |
| Tradeline tracker | `GET /api/credit-builder/:clientId/tradelines` | POST tradelines, tradeline-payments, tradeline-disputes; PATCH tradelines/:id |
| SBSS milestones | reference thresholds only | no |
| Stacking unlock criteria | **nothing — not assessed** | no |
| Estimated timeline | derived from the scores and tradelines above | no |

Everything above the tradeline tracker is read-only. The two things this page
writes are tradelines and DUNS step marks.

---

## DUNS step completion

### The endpoints

```
GET /api/credit-builder/:clientId/steps
PUT /api/credit-builder/:clientId/steps/:stepNumber   { "completed": true }
```

`GET` always returns all six steps whether or not a row exists — a step nobody
has touched is not completed, and saying so here saves every caller from
deciding what a missing row means. It also returns `completedCount`, which the
page uses, and `totalSteps`.

`PUT` upserts on `(businessId, stepNumber)` and rejects anything outside 1–6:
a row numbered 7 would be counted by `completedCount` and never rendered, so
the progress figure would disagree with the track it describes.

### What a mark is

**An advisor's assertion, not an observation.** Nothing in this system verifies
a DUNS registration, a business address, or a bank account. `completedBy`
records who made the claim, and `completedAt` when.

Two of the six steps do have machine-readable proxies — step 4 against the
tradeline count and step 5 against the PAYDEX — and both are shown inside the
step row alongside the mark. They are deliberately not folded together: what an
advisor asserts and what the bureaus report are different facts, and a client
can plausibly be in either state without the other.

### Why it needed a table

The circles used to be `useState` in the page component:

- A reload wiped every mark.
- Nothing keyed them to a client, so marks made against one business stayed on
  screen after switching to another.
- `tier1Unlocked` reads the count. The graduation banner — *"ready for Tier 1
  stacking! All business credit prerequisites are met"* — requires three
  completed steps alongside a PAYDEX of 80 and five reporting trade lines. A
  claim that a client is ready to apply for credit rested partly on checkboxes
  that belonged to nobody.

The count is `null` until the track has been read, and `tier1Unlocked` checks
for that explicitly, so an unread track can neither satisfy the threshold nor
fail it. The circles are disabled when no client is selected.

---

## Score types, by product

Each card reads one product, by name. The names are not interchangeable and
neither are the scales:

| Card | `scoreType` | Scale | Written by |
|---|---|---|---|
| D&B PAYDEX | `paydex` | 0–100 | D&B business pull |
| Experian Business | `intelliscore` | 1–100 | Experian business pull |
| FICO SBSS | `sbss` | 0–300 | Equifax, TransUnion business pulls |

Until 2026-08-04 every business pull was written as `sbss` whatever bureau
produced it, and with a score in the personal-FICO range. So the Experian card
was unfillable — nothing emitted `intelliscore` — and a pulled SBSS could hold
a figure its own type does not allow, rendering as "730/300".

`validateScoreForType` in `src/shared/validators/credit.validators.ts` is the
authority on each range. `tests/unit/services/business-score-types.test.ts`
pulls each bureau twenty times and validates every stored score against it.

### Filling a score locally

Pulls fail closed. With no bureau credentials configured:

```sh
BUREAU_MODE=synthetic npm run dev:backend
```

Anything generated this way records `synthetic: true` in the profile's
`rawData`, and the row is indistinguishable from a real pull without it.
`BUREAU_MODE` is never inferred from `NODE_ENV` — a test environment is exactly
where a generated score gets mistaken for a real one.

```
POST /api/businesses/:id/credit/pull
{ "bureaus": ["experian"], "profileType": "business" }
```

The seed also provides one of each for `seed-biz-001`: PAYDEX 80 and
Intelliscore 64.

---

## Handoff to the optimizer

Three controls link to the optimizer naming a client:

| Control | Link |
|---|---|
| Step 6 — "View eligible cards" | `/optimizer?client_id=…&from=credit-builder` |
| Graduation banner — "Run Optimizer" | `/optimizer?client_id=…&from=graduation` |
| Milestone alert — "Run Optimizer" | `/optimizer?client_id=…&from=milestone` |

The optimizer preselects that client and states which surface it came from. If
the id does not resolve to a client in the advisor's list — a stale link, or
another tenant's business — it says so rather than presenting an empty form as
though nothing had been asked for.

---

## What this page does not claim

- **The eight stacking criteria are not assessed.** They are the requirements,
  not a judgment about any client, and every one reads "not assessed". A
  backend roadmap does exist —
  `GET /api/businesses/:id/credit-builder/roadmap` — but it evaluates five
  different gates (personal FICO, tradelines, utilisation, business age,
  revenue) against the Starter Stack track, and its tradeline count comes from
  a bureau profile's JSON rather than the `VendorTradeline` table this page
  writes. Wiring the two together is a modelling decision, not a connection.
- **No business age.** `Business.dateOfFormation` exists and is populated, but
  `/api/v1/clients` does not return it, so the page passes `null` rather than
  the constant 36 it used to.
- **No SBSS milestone progress** for a client with no SBSS on record. A bar at
  0% would read as a client scoring zero rather than one never scored.
- **No "Verify DUNS" or "Record account" button.** Both existed and neither had
  a handler. Nothing here verifies a DUNS number — the D&B adapter *generates*
  one — and no model records a business bank account.

---

## Running it

```sh
npm run dev                    # backend :4000, frontend :3000
npm run db:seed                # required: the page reads real clients only

npx vitest run tests/unit/frontend/credit-builder-steps.test.ts
npx vitest run tests/unit/services/business-score-types.test.ts
npx playwright test tests/e2e-playwright/credit-builder.spec.ts
npx playwright test tests/e2e-playwright/optimizer-handoff.spec.ts
```
