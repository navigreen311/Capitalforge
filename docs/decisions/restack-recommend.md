# Decision record — `restack_recommend`

Why this file exists: the decisions in entries 1–5 were made on 1 September 2026
and lived in a commit message (`5268991`) and a conversation. That is the same
shape as every named control with no content this codebase has turned up — a
decision nobody can read gets remade. Each entry states what was decided, the
reasoning, and what was rejected.

Entries are appended, never rewritten. A decision that is reversed gets a new
entry that says so.

---

## 1. The client document states a verdict the engine made

**Decided 2026-09-01.**

`restack_opportunity_summary` is handed to a client. Its executive summary read
"Based on your current credit profile and payment history, you are eligible for
an additional round of business credit card funding" — unconditionally, from a
generator that received no eligibility result and checked nothing. Whatever
`restack-trigger` had decided, the letter said yes.

**Decision.** The route reads the verdict from `checkRestackEligibility` using
the caller's own tenant, and overwrites anything sent under the same key. A
request body is not a source of verdicts about a client's credit: a caller who
could type `eligible: true` could hand a client a letter saying they qualify for
funding they do not. Without `business_id` the document refuses with 422; a
business outside the tenant is a 404. An ineligible client gets a summary that
says so and lists the findings.

`payment_rating ?? 'Good'` and `score_trend ?? 'Stable/Improving'` became
brackets. They were the only fields in any generator that degraded to a *claim*
rather than a placeholder, and both were claims about the client's credit in a
document the client reads.

---

## 2. Two surfaces, one rule set

**Decided 2026-09-01.**

`dashboard-restack.routes.ts` reimplemented eligibility inline and answered
differently: readiness `> 70` rather than `>= 70`, ninety days from the last
completed *round* rather than the last application, at least one completed round
required, and no utilization or active-application check. A client scoring
exactly 70 was eligible on one surface and invisible on the other, and neither
response said which rule set had answered.

**Decision.** `restack-trigger.ts` is the only copy of these rules; the dashboard
presents `scanAllForRestack`. The one rule the inline copy had and the service
did not — a round already in progress — moved *into* the service, because it is
an eligibility rule rather than a presentation concern. That made
`GET /api/restack/eligible` stricter than it was.

**Rejected:** keeping both and reconciling them in a test. Two implementations of
one rule is the defect; a test that pins them together preserves it.

---

## 3. A failed query is a failure, and the forecast is gone

**Decided 2026-09-01.**

The dashboard caught its own query failure, logged it, and answered
`success: true, opportunities: [], total_pipeline_value: 0` with a fresh
`last_updated`. An outage was indistinguishable from a tenant with nobody ready,
and the answer said it was current. The panel's error state was unreachable.

`estimated_additional_credit` was `Math.round(Number(targetCredit ?? 0) * 0.75)`
— the previous round's *target*, in a variable named `achievedCredit`, times a
multiplier derived from nothing, under a comment claiming to sum approved
applications. It read one field and summed nothing.

**Decision.** The failure surfaces. Both money figures are deleted and nothing
replaces them: nothing here forecasts what a client will be approved for. The
badge is a count of clients, which is a fact.

---

## 4. Falsy-zero utilization, and one policy for missing data

**Decided 2026-09-01.**

`latestCredit?.utilization ? Number(...) : null` treated a utilization of 0 as
absent — the best possible value read as no value.

**Decision.** Nullish, not truthy. And missing data **blocks** rather than
passes: a criterion that cannot be evaluated is not a criterion that was met.
An unassessed client is refused *by name* — "Readiness has never been assessed
for this client, so eligibility cannot be determined" — rather than reported as
scoring zero.

---

## 5. The scan reports its denominator

**Decided 2026-09-01.**

`scanAllForRestack` pre-filters on `fundingReadinessScore >= 70`, and Prisma's
`gte` excludes nulls. Consistent — an unassessed client cannot be eligible — but
lossy: the endpoint answered "3 eligible" with no way to see that forty clients
had never been scored.

**Decision.** Keep the pre-filter, and return `activeCount`, `candidateCount`
and `notAssessedCount` alongside the results. The filter is honest once the
denominator is visible.

---

## 6. The readiness check is a fundability floor, not a recovery measure

**Decided 2026-09-02.**

`fundingReadinessScore` is computed at onboarding and measures **fundability**:
revenue, business age, industry risk, credit, leverage. `restack_recommend`
gates on it at `>= 70` to answer **"has this client recovered enough to stack
again"**. Those are not the same question. A client who has never borrowed and a
client who has just worked through a hardship can score identically on
fundability while being in completely different positions for a re-stack.

Before the deletion in entry 7 this was a *collision*: two engines scoring the
same client differently. With one engine left it is a **borrowed number** —
a gate reading the nearest available measure, undeclared.

**Decision. (a) Keep the borrowing, and declare it as a floor.**

The wording matters and is deliberate: **a fundability floor, not a recovery
measure. The recovery test is the other four criteria** — days since last
application, utilization, active applications, and a round already in progress.
Those carry the recovery signal; `>= 70` carries only "fundable at all", which
is a sensible thing to require and not a thing that measures recovery.

**Why it is written as a limitation rather than as a right answer.** The risk of
declaring a proxy deliberate is that it stops being revisited — an inherited
number acquires the authority of a decision. Naming what it does *not* measure
is what keeps it open. If re-stack readiness is ever worth measuring on its own
terms, that is a new measure and a new column, not a new threshold on this one.

**Rejected: (b), giving re-stack its own measure.** It is a new column and a new
scorer, immediately after deleting one of each for being a second answer to a
question already answered (entry 7). Defensible if Burkham decides recovery is a
thing to measure on its own terms — this entry is the record that it was
considered and deferred, not overlooked.

**Recorded, not decided:** 70 is not the only threshold read off this column.
The client detail card colours at 75/55 and the funding-rounds tab gates "Start
Round 2" at 75. Three numbers, one column, no shared definition of what any of
them means.

---

## 7. The second engine was deleted rather than repaired

**Decided 2026-09-02.**

`auto-restack.service.ts` answered the same question as `restack-trigger.ts`
with different thresholds, and wrote nothing. `evaluateRestackReadiness`
returned a score from a pure function; `triggerRestackOutreach` published
`restack.trigger.fired` and returned a `triggerId` for a record that was never
created. `recordRestackConversion` then attributed revenue to that id.

**Decision.** Delete the service, its two hardship routes, and
`recordRestackConversion`. Before deleting, the ledger was checked: **0**
`restack.trigger.fired` and **0** `restack.conversion.recorded` events existed
out of 53 in the dev database, and the only reader of either was the frontend
timeline's display-category map.

`RESTACK_TRIGGER_FIRED` stays in `src/shared/constants` documented as DEAD.
Nothing emits it; a reader resolving an eventType on a historical row still
needs the name to resolve to something.

**Rejected:** repairing it so the trigger persisted. That would have made a
second rule set real rather than removing it.

---

## 8. Without credit there is no readiness score

**Decided 2026-09-02.**

Two halves of one defect.

**The scorer.** `scoreCreditScore` returned `{ points: 0, label: 'no data' }`
when nobody had pulled the client's credit. On a component worth 25 of 100 that
does not produce a lower score — it produces a *different measurement wearing
the same scale*. A client with no credit on file and a client with a 580 FICO
were 25 points apart in reality and 0 apart in the function, and the first also
read worse than they were.

**The recompute.** Three of the four writers of the column rebuilt the scorer's
input from five business columns — revenue, monthly revenue, formation date,
MCC, industry — with **no credit fields in it at all**. Only `addOwner` ever
supplied credit, and only the score handed to it at that moment. So a real score
recorded by `addOwner` was **discarded** by the next profile edit or readiness
refresh: 78 became 53, silently, in the same column, with nothing recording
which inputs either number came from. `refreshReadinessScore` — whose doc
comment names "after credit pulls" as its use — recomputed *without* the credit
that pull had just created, and produced a lower number than before.

**Decision, both halves together.**

- `scoreCreditScore` returns `points: null` with
  `notAssessedReason: 'no_credit_profile_on_record'` — the same basis the credit
  read endpoints already return for the same absence. One absence, one name.
- `calculateFundingReadiness` then returns `score: null`, `track: null`,
  `trackLabel: 'Not assessed'`. A fundability score missing its credit component
  is not a lower score, it is not a score. The gap is still reported, at high
  impact.
- Every writer reads the credit on record via `creditInputsOnRecord` — the
  latest `CreditProfile` of each type, matching how every other reader in the
  codebase picks a profile. `refreshReadinessScore` still lets an explicit
  override win, for a pull that is not persisted yet.
- `createBusiness` continues to pass explicit nulls, so a client is **not
  assessed at intake** rather than scored out of 75. That is the intended state.

**Why the halves are inseparable.** Returning null for absent credit does nothing
if the path that recomputes the score is what makes the credit absent.

**Consequences accepted.** More clients will read as not-assessed than before,
including every client at intake. That is the honest state and both gates
already handle it: `checkRestackEligibility` refuses an unassessed client by
name, and `scanAllForRestack` counts them (entries 4 and 5). The display surfaces
were changed to show it — the roster route's `?? 0`, the platform report's
`?? 0`, the detail card's `null / 100`, and the "Start Round 2" tooltip that
told an unassessed client they were below a threshold nobody had measured them
against.

**Recorded, not fixed —** see `docs/gaps.md` §3m. `scoreDebtBurden` is worth 10
points and no caller has ever supplied `existingDebtBalance` or
`monthlyDebtService`. There is no column for either. Every production score is
out of 90 and compared against thresholds written for 100. It needs a data
source, not a code change.
