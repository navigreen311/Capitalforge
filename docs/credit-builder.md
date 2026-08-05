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
| Stacking unlock criteria | `GET /api/credit-builder/:clientId/stacking-criteria` | no |
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

### Two kinds of claim

A step is either **derived** or **attested**, and the page must not present
them identically. "The PAYDEX is 80" and "Sarah confirmed the bank account" are
different claims, and only one of them has an author.

| Step | Kind | Complete when |
|---|---|---|
| 1 Register DUNS | attested | an advisor says so |
| 2 Address & phone | derived | `addressLine1`, `city`, `state`, `zip` **and** `phoneNumber` are on the business |
| 3 Bank account | attested | an advisor says so |
| 4 Five trade lines | derived | ≥ 5 open `VendorTradeline` rows reporting to D&B |
| 5 PAYDEX ≥ 80 | derived | the latest `paydex` `CreditProfile` scores 80+ |
| 6 Applied for cards | derived | ≥ 1 `CardApplication` that has left draft |

**Derived** is recomputed on every read and stored nowhere. It carries a
`basis` — *"3 of 5 trade lines reporting to D&B"*, *"PAYDEX 80, pulled
2026-03-01"* — and no author, because nobody marked it. It **can go backwards**:
close a trade line and step 4 stops being complete, which a stored mark could
never do. `PUT /steps/:n` on a derived step answers **422 `STEP_IS_DERIVED`**,
and a stored mark left over from before these rules is ignored — a mark on
step 5 must not report a PAYDEX the client does not have.

**Attested** is an advisor's assertion, with `completedBy` and `completedAt` on
the record. Steps 1 and 3 stay attested because nothing here can observe them:
no column records a DUNS number, nothing verifies one (the D&B adapter
*generates* a nine-digit number), and no model records a business bank account.
`AchAuthorization` is the nearest row and it is a debit authorisation naming a
processor, which answers a different question.

The rules live in `services/credit-builder-steps.service.ts`, kept pure so each
is testable without a database.

### Why it needed deriving

A client with a PAYDEX of 80 showed the score card ticked and the step-5
progress bar full at 80/80 — while step 5 sat unchecked and the track read
**0/6, Overall Progress 0%**. Completion was manual-only, so nothing connected
the figure on screen to the step describing it. That client now reads 3/6 on
load, with no one having clicked anything.

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

## Stacking unlock criteria

Eight requirements across three tiers, assessed from **the same `CreditFacts`
the DUNS steps derive from**. That sharing is the point: `sc_002` and step 4 are
the same question about trade lines, `sc_003` and step 5 the same question about
PAYDEX, and asking them separately is how two figures on one page come to
disagree. `credit-facts.ts` reads them once; `credit-builder-steps.service.ts`
and `stacking-criteria.service.ts` both consume the result and are pure.

| Criterion | Tier | Assessed from |
|---|---|---|
| `sc_001` DUNS registered & active | 1 | step 1's attestation **and** ≥ 1 D&B trade line |
| `sc_002` 5+ trade lines | 1 | same count as step 4 |
| `sc_003` PAYDEX ≥ 80 | 1 | same score as step 5 |
| `sc_004` SBSS ≥ 140 | 2 | latest `sbss` profile |
| `sc_005` Intelliscore ≥ 60 | 2 | latest `intelliscore` profile |
| `sc_006` Equifax ≥ 500 | 2 | latest `equifax_business_risk` profile |
| `sc_007` 2+ years | 3 | `Business.dateOfFormation` |
| `sc_008` SBSS ≥ 175 | 3 | latest `sbss` profile |

### Four statuses, because there are four things that can be true

| Status | Means | Shown as |
|---|---|---|
| `met` | the figure clears the threshold | Met |
| `not_met` | the figure is on record and falls short | Not yet |
| `unknown` | that score has never been pulled for this client | Not measured |
| `unassessable` | nothing in this system produces that figure, for anybody | Cannot assess |

Collapsing `unknown` or `unassessable` into `not_met` would tell an advisor
their client had failed a threshold nobody measured them against. Neither
borrows the failure colour, for the same reason.

`sc_001` is the only criterion built from an attestation and a fact together,
and its basis says which half is missing.

A tier unlocks only when **every** criterion in it is met — an unknown or an
unassessable one leaves it locked, because a tier is a statement that the client
clears every requirement and "we did not check" is not clearing it. The panel
names what each tier is waiting on rather than only counting.

`unassessable` currently applies to nothing: every score the eight criteria read
has a producer. It is kept because the state is real — the moment a criterion is
written against a product no adapter emits, that is what it must report, and
`sc_006` spent its whole life in exactly that state.

## Score types, by product

Each card reads one product, by name. The names are not interchangeable and
neither are the scales:

Every business product has exactly one producer, and each is the product that
bureau actually sells:

| Product | `scoreType` | Scale | Written by | Read by |
|---|---|---|---|---|
| D&B PAYDEX | `paydex` | 0–100 | D&B | score card, step 5, `sc_003` |
| Experian Intelliscore Plus | `intelliscore` | 1–100 | Experian | score card, `sc_005` |
| FICO SBSS | `sbss` | 0–300 | TransUnion | score card, `sc_004`, `sc_008` |
| Equifax Business Credit Risk | `equifax_business_risk` | 101–992 | Equifax | `sc_006` |

Both corrections came from the same defect: a bureau adapter labelling its
output with another company's product name. Experian wrote `sbss` until an
Intelliscore card could never be filled; Equifax wrote `sbss` until an Equifax
criterion could never be assessed. When adding a bureau, the check is whether
anything reads what it writes.

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

- **The Equifax criterion cannot be assessed for anybody.** No pull path
  produces an Equifax business risk score — the Equifax business adapter writes
  an SBSS — so there is no figure to compare against 500. Reported as *cannot
  assess*, never as *not met*.
- **No SBSS milestone progress** for a client with no SBSS on record. A bar at
  0% would read as a client scoring zero rather than one never scored.
- **No "Verify DUNS" or "Record account" button.** Both existed and neither had
  a handler. Nothing here verifies a DUNS number — the D&B adapter *generates*
  one — and no model records a business bank account. Step 1 offers a link to
  D&B's registration page instead, which goes where it says it goes and claims
  nothing about having done it.
- **No derived step claims an author.** A derived step reports data; it does not
  report that anybody checked it.

## Outbound links

| Where | URL | Checked |
|---|---|---|
| Step 1, "Register at D&B" | `https://www.dnb.com/en-us/smb/duns/get-a-duns.html` | 2026-08-05 — 200, no redirect |

D&B has moved this page before: the path this repo previously hardcoded,
`https://www.dnb.com/duns-number/get-a-duns.html`, now answers 301 to the one
above. Both the page and `DUNS_REGISTRATION_STEPS` in
`credit-builder.service.ts` use the current path, and a browser test asserts
the `href`, `target="_blank"` and `rel="noopener noreferrer"`. Re-check with
`curl -sIL` rather than assuming; a link that quietly becomes a redirect chain
is the failure mode here.

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
