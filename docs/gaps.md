# What this system does not do

Every entry here was, at some point, something the application claimed to do
and did not. The claims are gone; the gaps they were covering are not. This is
the list of them.

It exists because the refusals are scattered — a `501` here, a null figure
there, an on-page note somewhere else — and from the outside a gap that needs
a database column looks identical to one that needs a product. They are not
the same size and should not be planned as though they were.

Nothing here is a bug report. The current behaviour in each case is correct:
the system says it cannot do the thing rather than pretending. What follows is
what it would take to be able to.

**How to read the cost column.** *Column* means an existing table needs a
field. *Table* means a new one. *Integration* means a third-party credential
and a client that calls it. *Product* means a decision about behaviour has to
be made before any of it can be built.

---

## 1. Endpoints that refuse

Twenty-three endpoints answer `501 NOT_IMPLEMENTED`. Each says why in its response
body, so a caller does not have to read the source to find out.

The last two arrived differently from the rest. They were not refusals that had
always been honest — they were mocks that answered `200` and `201` and reported
success for writes that never happened. They are listed here because the gap is
the same shape; only the reporting was worse.

Every row below was verified by calling it against a running server, not by
reading the handler. That check found one endpoint answering `404` instead —
`DELETE /api/integrations/:provider/disconnect`, whose catch block used a
different status from its three siblings, so the refusal read as a wrong URL.
It answers `501` now.

| Endpoint | What is missing | Cost |
|---|---|---|
| `POST /api/tax/documents/generate`<br>`GET /api/tax/documents`<br>`GET /api/tax/documents/:id/download`<br>`GET /api/tax/documents/:id/summary` | No tax document exists anywhere. These served a 1099-INT marked *final* with $2,345.67 of interest income, a $3,200 deductible fee summary and an IRC 163(j) worksheet — the same figures for every client and year. | **Product.** A 1099-INT is an IRS information return. Needs a `tax_documents` table, a generator driven by the invoices and interest actually recorded, and a status that distinguishes a draft from something filed. Somebody has to own the correctness of the numbers. |
| `POST /api/platform/integrations/:id/connect`<br>`POST /api/platform/integrations/:id/test`<br>`POST /api/integrations/:provider/connect`<br>`DELETE /api/integrations/:provider/disconnect` | Nothing contacts Plaid, QuickBooks, Xero, DocuSign or Stripe. No table records a connection. | **Integration.** Per provider: OAuth or key exchange, a `integration_connections` table, and a sync that fetches rather than returning a fixed count. |
| `GET /api/rewards/:clientId/points-balances` | Nothing records points or cash back, and no issuer integration reads them. | **Integration + table.** Balances come from the issuer; there is no source today. |
| `POST /api/rewards/:clientId/export` | The same balances, exported as a text report — 124,500 Amex points, 89,200 Chase points, $312.47 cash back, $3,206.72 total, identical for every client, and no tenant check on `:clientId`. Its sibling above had already been refused; this was missed. Refused 2026-09-01. | **Integration + table.** Same source as the balances it reported. |
| ~~`GET /api/contracts/:id/detail`~~ | **Built 2026-08-07.** A `Contract` table holds title, counterparty, type, value, dates and renewal. `autoRenews` is a nullable Boolean on purpose: null means nobody has read the clause, false means it does not renew, and only the first is somebody's to go and find out. An unknown id answers 404 rather than a plausible agreement. | **Done.** |
| `POST /api/compliance/disclosures/:id/file` | Nothing submits to a regulator, and no table records a filing. | **Product.** Filing is a real-world act with a real-world receipt; the system needs to model what "filed" means before it can claim it. |
| `POST /api/statements/anomalies/:id/dismiss`<br>`POST /api/statements/anomalies/:id/steps/:step` | A `StatementAnomaly` is computed while reading a statement and carries no identifier, so there is nothing to key a dismissal to. | **Product then table.** Anomalies need stable identity first — deciding what makes two anomalies "the same" across reads — and then somewhere to record a dismissal. |
| `POST /api/platform/billing/send-overdue-reminders` | Nothing queues or sends them. This system can send real SMS and email, so a reported send is consequential. | **Product.** Needs a scheduling decision (who, when, how often) before any send. |
| ~~`POST /api/platform/referrals`~~<br>~~`POST /api/platform/referrals/:id/follow-up`~~ | **Built 2026-08-07.** `Referral` and `ReferralFollowUp`, distinct from `ReferralAttribution` — that attributes an existing business to a source with a fee; this is the other direction. The link code is random rather than derived from the referred party's email, which would disclose an address to everyone the forwarded link reaches. `loggedBy` is the signed-in user, not the literal `"current_user"` it used to write. **Conversion is recorded when an advisor marks one; nothing detects it, so a conversion count is a floor and the API says so.** | **Done.** |
| `POST /api/platform/reports/schedules` | **Half built 2026-08-07 — deliberately.** A `ReportSchedule` table stores the intent and `computeNextRunAt` is real (it answered "tomorrow" for every frequency before, including weekly). **Nothing runs them**, `lastRunAt` stays null, and every response carries `delivery.active: false` with the reason. | **A runner, and the decision it waits on.** Same question as the two reminder endpoints: who gets sent what, how often, and what happens when a send fails. This system sends real email, so a schedule that quietly began delivering is a worse outcome than one that refuses. |
| ~~`POST /api/platform/tenants/:id/suspend`~~ | **Built 2026-08-06.** Both directions are real and enforced at login, token refresh and `tenantMiddleware`. A 30-second per-process cache keeps the middleware off a per-request query; the staleness bound is stated in `tenant-status.service`. | **Done.** See `docs/backlog/tenant-suspension.md`. |

| `PATCH /api/platform/offboarding/:id/advance` | Deliberate: stage moves when the export or the deletion actually happens, not because somebody advanced it. | **None — this one should stay refused.** Advancing by hand is how a workflow claims a deletion that never ran. |
| `POST /api/declines/:id/reminder` | Nothing schedules or delivers a reapply reminder. | **Product.** Same scheduling question as overdue reminders. |
| ~~`POST /api/optimizer/save-strategy`~~ | **Built 2026-08-07.** A `SavedStrategy` row holds the plan whole, including its input provenance, and `hasAssumedDefaults` is denormalised so a list can tell a plan built on a credit pull from one built on constants. Saving appends; a client keeps a history. | **Done.** |
| ~~`POST /api/optimizer/create-round`~~ | **Built 2026-08-07.** Calls `FundingRoundService.createRound` — the same path the Funding Rounds page uses — so round-number allocation and the `ROUND_STARTED` ledger event have one implementation. `FundingRound.savedStrategyId` records what a round was planned from, null when it came from no plan. | **Done.** |

---

## 1b. A rule that was inverted — fixed 2026-08-04

Everything else on this page is something the system declines to do. This one
it does wrongly, which is a different category and is recorded separately so it
is not mistaken for a gap that can wait.

**Chase 5/24 counts credit union applications, when the point of a credit union
application is that it does not count.**

`issuer-rules.routes.ts:251` counts new cards in the 24-month window as:

```ts
business.cardApplications.filter(
  (app) => app.status === 'approved' && app.decidedAt > twentyFourMonthsAgo,
).length
```

Every approved application, whatever the issuer. `CardApplication.issuer` is a
free string, so a credit union application is counted like a Chase one.

Credit union applications do not report to the bureaus in the way that drives
Chase 5/24, and `issuer-rules-engine.ts` says so in two places — *"Credit union
applications do not count against Chase 5/24 or Amex velocity limits"*
(line 666), *"Apply freely without impacting major bank eligibility"* (line 704).
The engine holding that knowledge is not the code doing the counting.

**Consequence if promoted to the live path.** The optimizer does not evaluate
5/24 today, so nothing acts on this yet. The moment it is wired up — which is
the obvious next step, and the reason the Credit Union Eligibility panel exists —
a client who took the recommended credit union cards would be told they had
exhausted their Chase eligibility when they had not. The advice would penalise
the client for following the advice.

**Cost.** *Correctness fix, small.* The count needs to exclude credit union
issuers. It also needs an issuer identity it can trust: `CardApplication.issuer`
is free text, and the credit union slugs in `issuer-rules-engine.ts`
(`lake_michigan`) already disagree with the ones in `card_products`
(`lake_michigan_cu`).

**Fixed.** The count now excludes credit union applications, via
`isCreditUnionIssuerName` in `src/shared/constants/issuers.ts`, which matches a
slug, a known display name, or anything self-identifying as a credit union — so
a credit union added to the catalogue without being added to the alias list is
treated as one rather than silently counted as a bank.

The exemption is *reported*, not merely subtracted:
`creditUnionCardsExcludedFrom524` travels with the count. A number that is
simply smaller is indistinguishable from cards having been missed, and an
advisor reading "3" could not otherwise tell whether the client has three cards
or five with two exempted.

Recorded here rather than deleted because the entry is the reason the
consolidation work has a fixed order: there are three velocity implementations,
this was the only one that was wrong, and merging before fixing it risked making
it the survivor.

## 1c. One figure compared three scales — fixed 2026-08-05

Recorded 2026-08-04 while giving each bureau's business score its own product
name, deliberately not fixed in that change, and fixed now as its own decision.

**What it was.** `client-graduation.service` computed a single
`businessCreditScore` as `Math.max` over every business profile a client held —
PAYDEX 0–100, Intelliscore 1–100, SBSS 0–300 — and measured the result against
thresholds that are SBSS figures (50 for Full Stack, 100 for LOC/SBA Bridge).
**A PAYDEX of 88 cleared a requirement for an SBSS of 50.** Nothing in the
comparison could notice: a number cannot say which product it is a number of.

Arithmetic on incompatible units, one scale further along than `rewardsRate`
storing both 2 and 0.02.

**Made unrepresentable 2026-08-05.** A business score is now a
`BusinessScore { scoreType, value }` rather than a bare number, and
`meetsThreshold` is generic in the product on both sides with `NoInfer` on the
score, so comparing a PAYDEX against an SBSS requirement **does not compile**.
Two `@ts-expect-error` tests assert exactly that: the directive fails the build
if the error it marks stops occurring, and CI compiles the test directory.

One limit, stated rather than glossed: `Object.values(scores)` still erases to
`any[]` through TypeScript's own overload, so spreading it into `Math.max`
compiles. The guarantee is on the scores themselves, which is where the defect
lived — every site that read them named a product.

**The fix — every threshold names its product.** `ScoreThreshold { scoreType,
min }` replaces the bare number, and `GraduationInput.businessScores` keeps each
product apart instead of flattening them. A threshold reads the product it
names, and only that one.

Three options were weighed. Normalising every score onto a shared 0–1 band was
rejected: it invents equivalences nobody has validated — is a PAYDEX of 80
really an SBSS of 160? — and converts "we do not know" into a plausible number,
which is the defect this codebase has spent several changes removing.

**Unknown is a third state, not a failure.** A client with no SBSS is `unknown`
on an SBSS gate, never `failed`. The gate carries what would resolve it —
*"Pull a FICO SBSS report for this client. No FICO SBSS is on record, so this
requirement has not been measured — it is not a shortfall."* — and the action
roadmap offers *pull the report, same day* rather than *raise the score, months*.
Unknown does not unlock a track: a track asserts the client clears every
requirement, and "we did not measure that one" is not clearing it.

A track that asserts no business-credit requirement now emits **no gate** rather
than a gate with a threshold of zero. Zero is a comparison a client with no
score would pass, which manufactures a cleared requirement out of an absent one.

### ~~Migration.~~ Closed 2026-08-05 — and the numbers were never real

This section said: *"`scripts/track-migration-impact.ts` reports who changes
track… Run against the development database: **3 businesses, 0 moved, 1 gate
flipped**… Run the script against a populated database before trusting a
number."*

**Do not trust that figure, and do not go looking for the script.** Both are
gone, for two independent reasons.

**The script had rotted silently.** It read
`TrackThresholds.minBusinessCreditScore` and built a `GraduationInput` with
`businessCreditScore` — two fields that **this very change** replaced, with
`businessCredit` and `businessScores`. `undefined >= 50` is false, so the
business-credit gate failed for every track, so every client resolved to Credit
Builder and the tool reported a migration that was pure artefact.

Nothing caught it because **`scripts/**` was not in the tsconfig `include`**.
The compiler had the answer and was never asked. That is fixed here: scripts are
type-checked now, and adding them surfaced four more real errors in
`migrate-data.ts` (Prisma JSON columns take `InputJsonValue`, not
`Record<string, unknown>`), also fixed.

**And the migration is moot regardless.** The business-credit gates it measured
were removed outright on 2026-08-05 — no track declares one now — because they
required a FICO SBSS, which a lender computes at application and no client can
obtain. There is no Option A transition left to perform, so the script has been
deleted rather than repaired: fixing it would have meant modelling a transition
that is twice superseded.

**The migration that actually mattered** is recorded in section 6: removing the
gates moved Apex Digital Solutions from Starter Stack to LOC/SBA Bridge, two
tracks up, having done nothing. That one was measured against the live engine
rather than a parallel model of it, which is the lesson — **a migration tool
that reimplements the rule it is checking will drift away from the rule, and
will keep answering.**

**Rendered as of 2026-08-05.** The Programme Track panel on `/credit-builder`
reads `/graduation/status`: the four tracks with the client's marked, the gates
holding the next one closed, and the roadmap out of them. `MilestoneGate.status`
drives three visually distinct states — *Met*, *Not yet*, *Not measured* — and
an unmeasured gate shows "Not on record" rather than a figure, alongside the
`resolution` naming the report that would answer it. The panel shares its
vocabulary with the stacking-criteria panel below it deliberately: one set of
words for one set of states.

---

## 2. Figures that are absent rather than zero

These endpoints answer normally. Individual figures come back `null` with the
reason stated, because a zero would be a claim.

| Figure | Why it is null | Cost |
|---|---|---|
| `delinquencyRate` (portfolio benchmarks) | **Partly recorded — see 2b below.** A missed payment *is* recorded, on `PaymentSchedule`, and it links to a card. But a schedule belongs to a repayment plan, so the only delinquency this system can see is a client already on one. | **Product decision, then small.** Not the column this row claimed. |
| ~~`graduationRate` (portfolio benchmarks)~~ | ~~Nothing records a client graduating from the programme.~~ | **Defined and counted, 2026-08-05.** A client graduates when observed on a track further along `TRACK_ORDER` than the one they were last observed on. `GraduationEvent` records observations; `graduationRate` counts upward moves in the quarter over clients observed before it began. Null with a stated reason until a quarter has history behind it — see 2c. |
| ~~`topPerformingSegments` (portfolio benchmarks)~~ | ~~Businesses carry an `industry`, but no application volume is attributed to a segment.~~ | **Done 2026-08-05.** It was query work only, as this row said: the endpoint fetched decided applications without selecting the business's industry, so it had nothing to group by. `segmentApprovalRates` in `platform-portfolio.routes.ts`, each segment carrying its own sample size. |
| ~~`resolved` (compliance sweep)~~ | ~~The sweep writes a new check row; nothing marks an earlier one resolved.~~ **`ComplianceCheck.resolvedAt` already existed** and was read in three places; no code path ever set it. | **Done 2026-08-05.** A finding is resolved when the next check of the same kind, for the same business, comes back below the level that raised it. Written in the service, so every path that runs a check resolves what it cleared. |
| ~~`applications` sparkline (dashboard KPIs)~~ | ~~"Active" is a current status with nothing on the row recording what it was before.~~ Half right: the *status* has no history, and the dates bounding an application's active life — `createdAt` and `decidedAt` — were on the row already. | **Done 2026-08-05.** Derived, no table. `activeApplicationsByDay` in `dashboard-kpi.routes.ts`; the last point equals the live headline count by construction. See 2d. |
| ~~`businessAgeMonths` (credit builder)~~ | ~~No formation date is recorded for a business.~~ **This was wrong.** `Business.dateOfFormation` exists (`schema.prisma:171`) and is populated for every seeded business. Nothing surfaced it: the credit-builder page passed `null` to the progress timeline, which rendered "Formation date not recorded". | **Done 2026-08-05.** No column was needed. The age is computed in `credit-facts.ts` and reaches both the Tier 3 criterion and the timeline. |
| `estimatedUnusedValue` (card benefits) | Null only when no unused benefit carries a value — this is working as intended. | **None.** |
| Compliance score, when no checks have run | A score of 100 from an empty check table is a clean bill of health derived from never having looked. | **None.** |
| Usage metering (billing) | **Nothing meters usage.** No counter, no plan record, no table — see 2e. | **A meter, plus a plan to count against.** |

### 2e. Usage metering, and the quota figures it used to invent

Recorded 2026-08-07. Absent from this document until then, though the
`/billing` page has carried a note about it.

Nothing counts API calls, deals or seats. There is no meter, no plan record
and no table to hold either. `/billing` states this, and now marks it
`not built` rather than leaving it as prose.

**What the page used to show, and why it is worth writing down:**

> 87,400 of 100,000 API calls · 48 of 50 deals · 12 of 12 seats — against a
> named **Enterprise** plan.

Every figure was a literal. Note the shape rather than the fact of the
fabrication: these are not round invented numbers, they are *quotas with
denominators, against a named tier, two of them near their limit*. 87,400 of
100,000 reads as a meter that has been running. 12 of 12 seats reads as a
customer who needs to buy more — a number a salesperson would act on and a
customer would be billed against.

A fabricated total is obvious once questioned. A fabricated **ratio** carries
an implied history: someone counted, repeatedly, over time. That is the
version that survives scrutiny, and it is the version this page shipped.

Same family as the `/statements` anomaly instructing an advisor to call Amex
about a duplicate $695 annual fee that was never charged, and as the
`/portfolio` benchmark block the tenant beat on every axis. The pattern worth
naming: **invented data is most dangerous when it is specific, plausible, and
slightly unflattering** — because all three are what real data looks like.

**Cost.** A meter is not large, but it is not the whole job: usage is only
meaningful against a plan, and no plan record exists. Both, or neither.

### 2b. Delinquency is recorded, but not of the portfolio

Written up 2026-08-05, after the row above turned out to be wrong in the same
way section 3 was, and the correction is the useful part.

**The claim.** *"No delinquency status is recorded against a card application."*
Costed as a column on `CardApplication`.

**What is actually there.** `PaymentSchedule` carries `cardApplicationId`, a
`status` of `'missed'`, and `jobs/inngest-functions.ts` writes that status
nightly for every schedule past its due date. `dashboard-payments.routes.ts`
already reads it. A missed payment against a specific card is recorded, has
been for as long as that job has run, and needs no new column.

**Why the figure is still null.** A `PaymentSchedule` belongs to a
`RepaymentPlan` — a hardship arrangement a client is put on. So the only
delinquency this system can observe is *a client already on a plan missing a
payment*. A card going past due outside a plan is invisible to it.

Computing `delinquentCards / allCards` from that would publish a portfolio
delinquency rate whose numerator and denominator are drawn from different
populations. On the development database today:

```
card applications                  7
payment schedules                  3
schedules linked to a card         3
cards with a missed payment        0
```

That computes to **0.0%**, which reads as "no delinquencies in this portfolio"
and means "we only ever looked at three cards". The figure this page exists to
support is one an advisor compares against an industry benchmark printed
beside it; a structurally low number there is worse than no number.

**A near-miss worth recording.** While tracing this it looked as though the
codebase wrote two different strings for one state — `'missed'` from the job,
`'overdue'` from `repayment.service.ts` — which would have been the same defect
as `sbss`/`intelliscore` one table over. It is not: `repayment.service` writes
`'overdue'` to a module-level `Map`, never to the database. The persisted
vocabulary is consistent. Recorded because the next person to grep for
`'overdue'` will have the same moment.

**Three options were weighed, in the order they cost:**

1. **Rename the figure to what it measures** — *missed payments among clients
   on a repayment plan* — and publish it with that denominator. True today,
   computable today, and not comparable to an industry delinquency benchmark,
   so it should not sit beside one.
2. **Record delinquency on the card**, which is what the original row assumed.
   The column is trivial; the writer is not. It needs a source: issuer feed,
   statement import, or advisor entry — and until one exists the column would
   be another unwritten field, which section 3 of this document is about.
3. **Leave it null.**

### Decided 2026-08-05: it stays null

Option 3. Recorded as a decision rather than left as an open question, because
the figure is computable-looking and the next person to find it will otherwise
work out that a rate can be derived from `PaymentSchedule` and derive one.

The reasoning, so it can be revisited on its merits rather than rediscovered:

- Option 1 is the smallest true thing and still probably wrong **here**. A
  figure sits on this page beside a published industry delinquency rate, in a
  block the reader is invited to compare across. A number labelled "missed
  payments among clients on a repayment plan" placed in that column will be
  read as the portfolio's delinquency rate whatever the label says underneath,
  because that is what the column means everywhere else it appears.
- Option 2 is the right answer and cannot be built yet. It needs a source of
  truth for whether a card is past due, and this system has none — no issuer
  feed, no statement import that carries it, no advisor-entry surface. Adding
  the column first would produce a field nothing writes, which is what section
  3 of this document exists to warn against.
- A null with a stated reason is the only option that does not make a claim.
  It is also the state the endpoint has been in since the literals were
  removed, so this decision changes no behaviour — it records why the behaviour
  is correct.

**What would change the ruling.** Any source that observes a card going past
due: an issuer integration, a statement import that carries payment status, or
a deliberate advisor-entered delinquency flag with a surface behind it. At that
point option 2 becomes available, the column has a writer, and the figure can
mean what the page implies it means. Until then, the honest answer to "what is
this portfolio's delinquency rate" is that this system does not know.

### Re-checked 2026-08-07 — the ruling held, and a second surface was ignoring it

The decision above is sound and stands. Checking it against the code found
that it was only being honoured in one of the two places that publish the
figure.

`/api/platform/portfolio` published `delinquencyRate: null` with the reasoning
attached. **`/api/platform/reports/generate` published `2.1`** — a literal, in
the `portfolio-performance` template, beside an invented average credit score
of 712 and a graduation rate of 18.6. Same tenant, same portfolio, two
answers; and the surface an advisor exports and sends was the invented one.

All five report templates were literals: `monthly-summary` reported 291
clients, 142 applications and $2,450,000 deployed for every tenant that asked,
and an absent date range defaulted to March 2026, so a report generated in
August was stamped March.

**Fixed by computing what can be counted and stating what cannot.** The reasons
now live in `services/portfolio-figures.ts` and both surfaces read them, so
they cannot drift apart again. Revenue and compliance-audit have no source at
all and now return a reason instead of figures.

**Option 1 exists after all — under a name that says what it counts.**
`repaymentPlanMissedPayments` reports missed, observed and rate, and appears in
the portfolio-performance report where repayment is the subject. It is never
called a delinquency rate and never sits beside the industry benchmark, which
was the actual objection to option 1 — not that it is false, but that placing
it in that column makes it read as something it is not. Its `rate` is null when
nothing was observed, for the same reason the portfolio figure is.


### 2c. What the graduation rate counts, and what it cannot see

"Graduated" was undefined, which was true: the engine computed a track from
live data every time it was asked and nothing recorded that the answer had
changed. The track engine supplied the vocabulary to define it — a client
graduates when they are observed on a track further along `TRACK_ORDER` than
the one they were last observed on.

Two rules keep the figure from flattering. **A downward move is not a
graduation**: a client whose utilisation rises can stop qualifying for a track,
and a rate counting any change would report deterioration as success. **The
denominator is clients observed before the quarter began**, not the whole book:
a client first seen mid-quarter had no earlier track to move from, and counting
them as a non-graduate would push the rate down for a reason unrelated to their
progress.

**What it cannot see.** An observation is written when a client is *assessed*,
and a client nobody assesses is never observed. Coverage is therefore the set
of clients somebody looked at, not the book. The rate reports its denominator
beside it (`graduationBasis.observedBeforeQuarter`) rather than dividing by the
book and publishing a number that could only understate — the same reasoning
that keeps `delinquencyRate` null in 2b, applied to a figure that can at least
say how much it saw.

Nothing schedules an assessment. `inngestFunctionDefs` is a registry of
definitions with cron strings that no scheduler consumes, so adding one there
would have looked like coverage without providing any. Wiring a scheduler to
that registry is what would make this a rate over the book rather than over the
clients somebody opened.


---

### 2d. The applications sparkline, and what counts as active

The row said this needed a status-history table. It did not. "Active" is
`status NOT IN (approved, declined)`, and the two dates bounding an
application's active life were on the row all along: `createdAt` opens it,
`decidedAt` closes it. The series is derived from those, so it reproduces the
headline rather than approximating it — the last point equals the live count by
construction, and a test asserts that for every case where the two could
disagree.

**Two edges, both judgments.** A terminal application with no `decidedAt`
cannot be placed in time: we know it left the active set, not when. It is
excluded, which keeps the last point honest because the headline excludes it
too. No such row exists today. An application decided and later reopened counts
as active across the whole window, including days it was closed — its current
status is not terminal, so the headline counts it, and a line disagreeing with
the number printed above it would be worse than one imprecise about its past.

**Surfaced while doing it, and then fixed together: `cancelled` counted as
active.** The headline was `NOT IN (approved, declined)`, so a cancelled card
appeared in "active applications" on the dashboard.

The root of it was not the query. **`cancelled` was not in the
`ApplicationStatus` union** — `rewards.routes.ts` had been writing a status
nothing declared, so no list enumerating statuses could have included it, and
the two count queries and the series each carried their own literal that
therefore missed it in the same way.

Fixed at the root: the status is declared, `CLOSED_APPLICATION_STATUSES` is one
exported list all three read, and the transition table keyed by that union
gained its missing terminal entry — which the compiler demanded the moment the
union was complete. A `cancelledAt` column records *when*, because a
cancellation closes an application but is not a decision, and without a time a
cancelled card could not be placed in history at all. The dashboard's headline
figure drops any cancelled cards it was counting.

---

## 3. ~~Tables that exist but are never written~~ — resolved 2026-08-07

Four tables were in the schema and never received a row. Each is now either
written or gone; none is left as a trap for somebody to write to on the
assumption it is wired.

| Table | Then | Now |
|---|---|---|
| `BackupRecord` | nothing wrote it; the service kept records in a process-local `Map` | **Written.** `triggerBackup` persists, and list / get / purge / RTO-RPO read the table |
| `TenantBranding` | modelled, unread, unwritten | **Dropped** |
| `RewardsOptimization` | modelled, unread, unwritten | **Dropped** |
| `SandboxProfile` | modelled, unread, unwritten | **Dropped** |

**`BackupRecord` was the one with a consequence**, and it was worse than "no
rows". The service held every record in a `Map`, so a backup recorded before a
restart did not exist after one — and the question these endpoints answer is
*when did we last back up*, which is asked precisely when something has gone
wrong. All four rows were verified empty before anything was dropped.

**Found on the way in: `sizeBytes` was `Int`.** That tops out at 2,147,483,647,
a shade over 2GB. The service has always typed it `bigint`; the column did not,
and nothing noticed because nothing ever wrote a row. The first full backup of
a real database over 2GB would have been the test. It is `BigInt` now.

**Also found: the purge test could not fail.** It mutated the object the
service returned and asserted `purged >= 0`. That passed whether anything was
purged or not, and would have gone on passing after the store moved to the
database, against a row it never touched. It now expires the row and asserts it
is gone.

**~~Still in memory: `recoveryTestStore`.~~ Built 2026-08-07.** A
`recovery_tests` table, and three things a table alone would not have fixed.

**Two people, not one.** The handler took a single `testedBy` string from the
request body, so the log named whoever the caller said it named. `performedBy`
is who ran the drill — often an infrastructure engineer, sometimes an external
vendor — and `loggedBy` is the signed-in user recording it. A record that
cannot tell those apart is not evidence.

**A pass is not the same as meeting the objective.** `rtoAchievedMinutes` sits
beside the outcome rather than folded into it, and `withinRto` is computed from
it. A restore can succeed and still take longer than the business agreed to
tolerate, and those are the drills worth finding.

**`?? 9999` was hiding a third state.** `getRtoRpoStatus` substituted 9999 for
an unmeasured restore time, so a drill that passed without anyone timing it
reported the objective as *missed*. That is the mirror of the `rpoBreached`
defect fixed in the same function earlier, and the same collapse. `withinRto`
is null when nothing was measured, and `rtoMeasurable` lets a caller tell that
from a genuine miss.

Duration is derived from the two timestamps and has no column. A stored
duration is a third fact that can drift from the two it comes from, and the one
that drifts is the one an auditor reads. A `backupId` citing a backup that is
not on record is refused with a 400 rather than a foreign-key error, and a
`completedAt` before `startedAt` is refused too — stored as-is it produces a
restore that took less than no time.

The three dropped tables were removed rather than documented-and-kept. An empty
table nobody reads is not neutral: the next person to find `TenantBranding` in
the schema reasonably concludes branding is modelled and starts writing to it.
The model definitions remain in git history, and the drop migration names all
three.

> **This section was wrong when first written, and the correction matters more
> than the content.** It claimed nine unwritten tables, four of them read by
> live endpoints — `CardProduct`, `Issuer`, `IssuerRule`, `CreditUnion`,
> `CreditUnionProduct` — and called seeding them the cheapest win available.
>
> All five are seeded, and always were. `prisma/seeds/card-products.ts` writes
> 41 card products and `prisma/seeds/issuer-rules.ts` writes 7 issuers, 22
> issuer rules, and the credit unions with their products. Both are wired into
> `db:seed`. The database has had all of it the whole time.
>
> The error came from searching `src/backend` and `prisma/seed.ts` for writes.
> The seeders live in `prisma/seeds/`, which that search never looked at, and
> the result was written down as fact without one query against the database
> to check it. The discovery came from acting on the recommendation: seeding
> data that already existed raised a unique-constraint violation on
> `Issuer.name`.
>
> Every other claim on this page has since been checked by calling the running
> system rather than by reading the source.

---

## 3b. What is deliberately still refused — reviewed 2026-08-07

Everything in §1 that remains a 501 is here, with what it is waiting on. None
of these is waiting on someone finding the time; each is waiting on something
specific, and that is the point of listing them apart from the closed rows.

**Waiting on a product decision nobody has made.**

| Endpoint | The decision |
|---|---|
| `POST /api/tax/documents/generate` + 3 more | A 1099-INT is an IRS information return. Somebody has to own the correctness of the numbers, and no table records the interest they would be computed from. A wrong 1099 is worse than no 1099. |
| `POST /api/compliance/disclosures/:id/file` | Filing is a real-world act with a real-world receipt. The system needs to model what "filed" means before it can claim it. |
| `POST /api/statements/anomalies/:id/dismiss` + `/steps/:step` | A `StatementAnomaly` is computed while reading a statement and carries no identifier. Deciding what makes two anomalies "the same" across reads comes before anywhere to record a dismissal. |
| `POST /api/statements/disputes` — refused 2026-09-01 | Nothing records a dispute and nothing acts on one. Unlike its two neighbours above, this is not blocked on identity: a dispute has real content and an obvious home. It is blocked on whether CapitalForge files billing-error disputes at all, which is a compliance question with a statutory clock attached, not an engineering one. See 3d. |
| `POST /api/platform/billing/send-overdue-reminders` | Who, when, how often — and what happens when a send fails. |
| `POST /api/declines/:id/reminder` | The same question. Both send real messages. |

The two reminder endpoints and the report-schedule runner (§1) are one
decision, not three. Answering it once unblocks all three.

**Waiting on an integration that does not exist.**

| Endpoint | Missing |
|---|---|
| `POST /api/platform/integrations/:id/connect` + `/test`, `POST /api/integrations/:provider/connect`, `DELETE .../disconnect` | OAuth or key exchange with Plaid, QuickBooks, Xero, DocuSign or Stripe, and a table to record a connection. |
| `GET /api/rewards/:clientId/points-balances` | Balances come from the issuer. There is no source. |

**Refused on purpose, and should stay refused.**

`PATCH /api/platform/offboarding/:id/advance`. A stage moves when the export or
the deletion actually happens. Advancing it by hand is how a workflow comes to
claim a deletion that never ran.



### 3e. Nothing records HOW a consent was obtained — open, 2026-09-01

`generateConsentConfirmationLetter` printed
`Consent Method: ${ctx.consent_method ?? 'Electronic signature via client
portal'}` — a statement, in the client's own copy of their consent record, of
how that consent was captured.

**There is no such field.** `ConsentRecord` holds `channel`, `consentType`,
`status`, `grantedAt`, `revokedAt`, `revocationReason`, `ipAddress`,
`evidenceRef` and `metadata`. No method column exists anywhere in the schema,
and `consent_method` appears in exactly one place in the codebase: the string
that letter used to print. The default was not a stale value — it was the
whole field.

The letter now says `[not recorded]` and explains that the system records the
channel, the date, the IP address and an evidence reference, not the method.

**Why this matters more than the default did.** The `consent_grant` manual
states that `evidenceRef` is the only field carrying proof a consent happened.
That is correct, and this letter contradicted it: it asserted a method the
record does not hold, beside a `Consent Reference` that was
`'CST-' + Date.now().toString(36)` when none was supplied — an invented
evidence pointer, given to a client, resolving to nothing.

### DECISION NEEDED — not a migration

**Do not add the column on engineering judgement.** The work is half a day: a
`method` column on `ConsentRecord`
(`portal_signature | voice_recorded | sms_reply | wet_signature | imported`),
set at capture, plus the four or five call sites that create a consent. That is
not the question.

The question is whether the method of consent is something Burkham should be
recording at all. Two things bear on it:

- **Every existing row is `[not recorded]`, permanently, and that is correct.**
  The method of a consent captured last year is genuinely unknown. Backfilling
  a guess would be this same defect one migration further from anyone noticing
  — a column full of `portal_signature` that nobody ever verified, indexed and
  queryable and wrong. So the column improves consents captured AFTER it ships
  and nothing before, and the letter keeps saying `[not recorded]` for the back
  catalogue either way.

- **`evidenceRef` may already be the answer.** The `consent_grant` manual says
  it is the only field carrying proof, and it is a pointer to the artefact — a
  call recording, a signed form, a portal event. Whoever opens that artefact
  learns the method from it. A `method` column would be a summary of something
  the evidence already establishes, which is worth having only if somebody
  needs to filter or report on it without opening the evidence.

**The case for adding it** is that a regulator asking "how were these consents
obtained" wants a count by method, not a folder of recordings, and TCPA
disputes turn on exactly that. **The case against** is a column that is null
for every historical row and only as good as the discipline of whoever sets it.

Flagged 2026-09-01. Awaiting a decision; the letter is honest either way.

**Two more defaults were in the same letter**, and both are fixed with it: the
consent date fell back to today, and the channels fell back to
`'Voice, SMS, Email'` — telling a client they had consented to all three when
nobody had said so, on the letter that is their record of what they agreed to.
The letter is now built from the consent records themselves and refuses when
there are none, because a letter confirming a consent that was never captured
is the document that endpoint exists not to produce.




### 3i. Every module read before the conventions existed is stale against them — open, 2026-09-02

**This is a conformance sweep, not a defect sweep, and it should happen once at
the end rather than per module.**

Ten modules were swept between 1 and 2 September. The conventions that now
govern how a module answers were written *during* that sweep, mostly near the
end, so most modules were read and fixed against rules that did not exist yet.
They are not wrong. They are inconsistent with what came after, and an agent
reading three manuals written to three different standards is the problem the
conventions exist to prevent.

**The conventions, and when they appeared:**

| Convention | Where it lives | Written |
|---|---|---|
| An empty result carries a `basis` | shared rule 2 | 2 Sep, after eight modules |
| A module id groups by blast radius, not URL prefix | `docs/callable-modules.md` rule 1 | 2 Sep, from the client split |
| Path depth is not evidence of blast radius | `docs/callable-modules.md` rule 2 | 2 Sep, same |
| A refusal is not an absence | shared rule 1a | 2 Sep, last |
| Never infer what you cannot read | shared rule 1b | 2 Sep, last |
| A count travels with its denominator | shared rule 7 | 2 Sep, from the restack scan |

**The sample, measured rather than guessed.** `statement_pull` was read and
fixed on 1 September, before all six. Against them today it opens four to six
items:

- no `basis` on any empty result in the module — the anomaly report, the
  statement list, the line-items refusal;
- `channel` on ingest is a free string, where `scan_communication` now has an
  enum drawn from one shared list;
- the anomaly report gives a count with no denominator — how many statements
  were scanned, not only how many carried anomalies;
- read and write endpoints share one module id, with the ingest/reconcile
  split never made;
- the two 501 refusals predate rule 1a and are not described as refusals in
  those terms anywhere an agent would read.

**Expect a similar count per module**, weighted towards the ones read earliest.
Roughly thirty to fifty items across the ten, nearly all of them one-line
response-shape changes or a paragraph in a manual.

**Why once, at the end.** Doing it per module means re-reading each one every
time a convention is added, and the conventions are still settling — three of
the six are less than a day old. A single pass after the last module is read
costs one traversal instead of ten, and it is the point at which the
convention set is stable enough to be worth conforming to.

**What this is not.** None of these is a live defect. The fixes shipped during
the sweep stand; this is the difference between a module that is correct and a
set of modules that are consistent. Recorded so it is not rediscovered per
module and fixed piecemeal, which is exactly the shape the sweep found
everywhere else — a class found and fixed three times, each time only in the
surface someone was looking at.


### 3j. Evidence removal is not tracked — open, 2026-09-02

`attachEvidence` adds references to a complaint. **Nothing removes one, and
nothing records that one was removed.**

There is no detach endpoint, so within the API evidence is append-only — which
is arguably the right property for an evidence record. The gap is what happens
outside it: a reference edited out of `evidenceDocIds` by a migration, a
support script or direct SQL leaves no trace at all. The array is simply
shorter, and the complaint file cannot answer whether an item was never
attached or was taken away.

As of 2026-09-02 `evidenceItems` records who attached each item and when, so
additions have provenance. Removals still have none, because there is no
removal to record.

**What it would take.** A `detachEvidence` that marks an item `removedAt` /
`removedBy` with a reason rather than deleting it, and a read that reports
removed items separately instead of omitting them. Half a day.

**What decides it** is whether evidence should be removable at all. An
append-only complaint file is defensible and simpler: an item attached in
error is annotated rather than deleted, which is what a regulator would expect
of an evidence record. If that is the answer, the fix is not a detach endpoint
— it is a note in the manual saying evidence cannot be withdrawn, and a check
that nothing outside the API shortens those arrays.

Recorded rather than fixed because the two answers are different products.

### 3h. There is no tenant-level communication monitoring report — open, 2026-09-02

Nothing answers "show me your communication monitoring" at the level the
question is actually asked.

`comm_compliance_records` holds every scan — advisor messages and marketing
scripts, the rules applied, the outcome, the violations found — and the only
ways to read it are `GET /api/advisors/:id/qa-scores`, which is a different
record entirely, and direct SQL. The compliance manifest deliberately does not
carry scans (§3g): they are tenant-scoped by nature, so a per-business section
would be sparse for reasons a reader could not see.

**What the report would be.** Over a date range, for a tenant: how many
communications were scanned, by channel; how many were approved; the
violations found, by category and by claim, with counts; how many scans a
person reviewed and how many nobody has read (`humanReviewedAt` is null for
most of them); and the advisors those scans belong to. An INDEX, not the
messages — the message text is inline in `content` and
`contentWithDisclosures`, and a bulk export of client communications is
retrieval under supervision rather than something an agent triggers. Any
implementation must select fields explicitly and carry a test asserting the
serialised report contains neither column, written so a third content column
added later fails it too.

**Why it matters more than it looks.** This is the record a regulator asks for
by name, and today the honest answer is that the data exists and nothing reads
it. The scans themselves became trustworthy on 2026-09-01 — the advisor is
verified, the violation reaches the ledger, repeats are counted, the disclosed
text is stored — which is what makes a report worth building now and would not
have been true a week ago.

**Not started.** Roughly a day: one aggregate query, a shaped response, a route
gated on `COMPLIANCE_READ`, and the field-selection test. The design question
is whether it belongs beside the manifest as an export or as a dashboard
surface — a regulator wants a document, an operator wants a page, and they are
not the same artefact.

### 3f. Manifest and packet are two modules — DECIDED 2026-09-02

`GET /api/documents/export/:businessId` assembles a JSON manifest: the
compliance records, plus **references** to the vault documents — `storageKey`,
`sha256Hash`, `cryptoTimestamp`. Nothing in this repository fetches a byte of
the documents or builds an archive. The route sets
`Content-Disposition: attachment`, so a browser saves a file and it looks like
a deliverable.

The service header used to call it "one-click regulator-ready packet
assembly", output that "can be zipped and handed to regulators / counsel". It
now says what it is, and the payload carries `contents: 'references'` so a
reader sees it without reading this file.

**Decided: a packet is not a bigger manifest. It is a different act.**

An index says what exists; a packet transfers it. They are two modules, and
this one is the manifest. `build_packet` as a module name describes the
manifest and should be read that way until a packet module exists.

**The packet is a separate module, unstarted, and gated on one question:** who
may receive a document under legal hold. It only arises for the packet — an
index naming a document under hold discloses that it exists, which is already
true of the case; a packet hands over the bytes, and that is a disclosure
decision rather than a streaming one.

That question reaches further than this module. `assemble_evidence` has the
same shape: it names documents, and any future version that transfers them
inherits the same decision. So it is one ruling covering both, not a detail of
whichever gets built first.

The engineering, when it is unblocked, is the old PRODUCTION NOTE: an archive
stream, per-document S3 reads, a response that cannot be buffered in memory,
and a size limit somebody chooses. None of it is the hard part.

### 3g. What the manifest contains — DECIDED 2026-09-02, one item blocked

**`ledger_events` — INCLUDED.** The canonical audit spine now travels in the
manifest, with the payload, because the envelope alone is a timestamp rather
than evidence.

Nothing on a ledger row names a business, so attribution is by
`aggregateId = businessId OR payload.businessId = businessId`, and each event
reports which predicate matched. **What that misses is stated in the manifest
itself** (`ledgerScopeNote`): an event whose aggregateId is a child entity —
an application, an authorisation — and whose payload omits businessId is not
found. The section is what can be attributed, not everything that touched the
business, and a regulator is owed the second sentence.

**`comm_compliance_records` — DECIDED OUT, on scope.** Considered for
inclusion as an index without message content, and rejected — not because it is
hard, but because it is the wrong shape.

A scan is **tenant-scoped by nature.** `comm_compliance_records` carries
`tenantId` and `advisorId` and no `businessId`, and that is not a gap in the
schema: there is no per-client fact to record. An advisor scans messages across
many clients, and a `video_script` scanned before render relates to none.
Communication monitoring is a programme, not a per-client fact.

Adding a nullable `businessId` would have produced a per-business section that
is sparse for reasons a reader could not see from the manifest — the same shape
the decision log is excluded for, one paragraph down. The per-business framing
was the error, not the missing column.

"Show me your communication monitoring" is answered by a tenant-level report.
See §3h.

**`ai_decision_logs` — EXCLUDED, and the reasoning is recorded rather than the
exclusion alone.** `AI_MODULE_SOURCES` names nine modules and only
`issuer_eligibility` writes a row (§7b). A section here would be almost empty
for every business and would read as "no decisions were made about this
client" — the absence-as-value shape, in the document where it does the most
damage. **Revisit when the other eight write:** at that point the section
becomes a real record of what a placement strategy was built on, and the
argument for excluding it stops holding. This is a decision with an expiry, not
a permanent omission.

**`regulatory_dossier_exports` — EXCLUDED.** A manifest listing its own
predecessors tells a reader about this system rather than about the business.
The export history is available to whoever administers the system without
being carried to a regulator.

**`business_owners`** remains excluded and is not a gap: beneficial owners with
encrypted SSNs are retrieved through a separately permissioned endpoint.

### 3d. The dispute that looked filed — refused 2026-09-01

`POST /api/statements/disputes` answered **201** with
`id: "disp-<timestamp>"`, `status: "open"` and
`estimatedResolution: "5-10 business days"`, and pushed the dispute onto a
module-level array. Nothing read that array. Nothing persisted it. It emptied
on every restart, and no `statement_disputes` table exists.

It also never read `req.tenant`: no tenant scoping, and no check that the
statement id existed or belonged to the caller. Any authenticated caller could
file a dispute against any statement id, real or invented, and be told it was
open.

**Why it survived the sweep that refused its two neighbours.** Anomaly
dismissal and investigation steps also wrote to module-level objects, and both
were converted to 501 on 2026-08-07. This one was three lines away and was
missed because a 201 carrying an id looks like a record was created. The other
two returned nothing you could mistake for a receipt.

**Why an invented SLA is the worst part.** Of everything in this document, a
billing-error dispute is the record with an actual statutory clock on it. The
answer did not merely fail to file — it told the caller when to expect
resolution. Nobody chases a dispute they have been told is in progress.

**What building it costs: about a day.** `tradeline_disputes` already exists
and is the model — tenant id, subject id, reason, status
(`pending | submitted | resolved | rejected`), `filedAt`, `resolvedAt`,
`resolutionNote`. A `statement_disputes` table in that shape, a create that
verifies the statement belongs to the tenant, a list-by-statement read, and a
status transition. The engineering is small.

**What is actually blocking it is not the day.** It is whether CapitalForge
files disputes with issuers at all, or only records that a client raised one.
Those are different products: the first has a deadline and a counterparty, the
second is a note. The endpoint's own answer — "5-10 business days" — assumed
the first. Nobody decided it.

### "No money moves" is true for reasons that can change without anyone noticing

Recorded 2026-08-07. **Nothing is broken today. The concern is what the claim
rests on.**

`/billing` tells an advisor, correctly, that marking an invoice paid records a
payment and does not take one — *"no card is debited and no money moves."*
Verified end to end: `POST /api/businesses/:id/invoices` validates, computes a
fee schedule and writes a row. The mark-paid handler returns an explicit
**`charged: false`**, and `stripePaymentId` is a reference the caller supplies
rather than one this system obtained. No payment call anywhere in the flow.

**But the capability is present, not absent.** `src/backend/integrations/stripe/`
holds a complete Stripe client — `paymentIntents.create`, `refunds.create`,
`subscriptions.create`, `invoices.create` — and `stripeRouter` **is mounted** at
`/api/stripe`. Two things, and only two, stop money moving:

1. **Nothing outside `integrations/stripe/` imports the client.** Verified by
   grep; the billing flow cannot reach it.
2. **`STRIPE_SECRET_KEY` is unset**, so `getStripeClient()` throws
   `STRIPE_NOT_CONFIGURED`. No `STRIPE_*` variable exists in `.env` at all.

So the truest statement of the page's claim is *"no billing code calls
Stripe, and Stripe is unconfigured"* — not *"this system cannot take
payments."* It plainly can; it is one import and one environment variable
away.

**Why that distinction is the whole entry.** A copy claim resting on a config
value goes stale in silence. Setting `STRIPE_SECRET_KEY` in an environment —
an ordinary act, done to enable something else entirely, in a file no reviewer
reads as product surface — moves this system one import from debiting a card,
while every reassuring sentence on `/billing` still renders unchanged. Nothing
fails. No test covers it, because there is nothing incorrect to catch: the
assertion and the reality diverge without either changing shape.

This is the §6 failure with the arrow reversed. There, sentences outlived the
defects they described. Here a sentence would outlive the *safety* it
describes, which is worse, because the sentence is what an advisor trusts
before telling a client no money will move.

The `not_built` marker on `/billing` therefore states the mechanism rather
than the conclusion — it names the unfollowed import and the unset key
explicitly, so a reader who changes either can see what they are changing.

**What would close this properly** (none done, all cheap):

- A test asserting no module under `src/backend/services/` or
  `src/backend/api/routes/billing*` imports `integrations/stripe`. That
  converts an invariant currently held by nobody into one held by CI.
- A startup assertion, or a check in the billing router, that refuses to serve
  the mark-paid endpoint if a Stripe key is configured **and** a payment path
  is wired — failing loudly rather than letting the copy go quietly false.
- Deciding whether the mounted `/api/stripe` router should exist at all while
  no product surface uses it.

---

## 3c. Third-state collapses — swept 2026-08-07

The `?? 9999` found while building the recovery-test table prompted a sweep for
the same shape: an absent measurement collapsed into a number or a boolean, so
"not known" becomes indistinguishable from a value somebody measured.

Three were found and fixed. Reported by consequence rather than by count,
because two were latent and one was firing.

**Live: `compliance.service.ts` fabricated a leverage ratio, in both
directions.**

```ts
const debtToRevenue = (input.existingDebt ?? 0) / Math.max(input.monthlyRevenue ?? 1, 1);
```

Every other input in that block is guarded with `!== undefined`, so an absent
FICO, utilisation or business age contributes nothing. This line collapsed two
absent inputs and computed a ratio from them.

Absent debt became 0, so a client whose debt nobody recorded scored as
unleveraged. Absent revenue divided by 1, so **the ratio became the debt
figure** — $50,000 against unrecorded revenue produced a printed finding
reading *"Debt-to-monthly-revenue 50000.0x — high leverage"*. A fabricated
number in a compliance artefact, indistinguishable from a measured one by
anybody reading it later.

Now assessed only when both figures are on record, and the artefact names the
gap — "leverage not assessed" and "leverage assessed and fine" must not look
the same. Zero revenue is distinguished from absent revenue.

**Latent: the risk matrix plotted unmeasured clients as low risk.**
`Number(profile.utilization ?? 0)` put a client with no utilisation on record
into the bottom threshold band with a detail string reading *"Utilization at
0%"* — an absent measurement rendered as the best possible value, on the page
whose purpose is spotting risk. Such clients are now skipped and counted, and
the count is returned as `unmeasured.utilization` so a reader can tell "nobody
is at risk" from "we could not look at some of them".

**Latent: an unscored regulatory alert was labelled MEDIUM.**
`(a.impactScore ?? 0) >= 70` presented an alert nobody had assessed as
assessed-and-moderate. Unscored now sorts as HIGH — an unreviewed regulatory
alert is the one that most needs looking at, and under-stating it is the
failure that costs something.

Both were latent in the sense that matters and no more: the columns are
nullable and the code was wrong, but this database has no nulls in either, so
neither was firing today. That is a weaker finding than the SBSS case, where
zero rows existed *and* the collapse fired for every client, and it is recorded
as weaker.

**Also fixed, as its own change: the DocuSign webhook invented signing times.**
`timestamp ?? new Date().toISOString()` used the moment the webhook was
processed as the moment the envelope was signed, so "when was this signed?"
answered "just now" for any payload DocuSign sent without a date. The reported
time and our recording time are separate now, and `timestampSource` says which
is which.

### Second sweep, 2026-08-07 — the graduation gates

A follow-up pass for shapes the first sweep did not look for: vacuous truth
(`.every()` on an empty set), optimistic string defaults, errors becoming empty
results, and `Math.max` over a possibly-empty spread. It found one cluster.

**All five numeric inputs to the graduation assessment collapsed to 0 when
absent**, and the direction of the comparison decided whether that was safe:

| Input | Gate | Collapsed to 0 | Effect |
|---|---|---|---|
| `ficoScore` | `>= min` | fails | safe, wrong reason |
| `businessAgeMonths` | `>= min` | fails | safe, wrong reason |
| `monthlyRevenue` | `>= min` | fails | safe, wrong reason |
| `tradelineCount` | `>= min` | fails | safe, wrong reason |
| **`currentUtilization`** | **`<= max`** | **passes** | **granted eligibility** |

Four fail closed. Utilisation is a maximum, so the identical collapse inverts —
`0 <= 0.30` is true on every track, and **a client whose utilisation nobody had
measured cleared the requirement.** Fixed first and on its own, because it
changes who is eligible.

That contradicted the rule stated twelve lines below it in the same function:
*"Unknown does not pass. A track is a statement that the client clears every
requirement, and 'we did not measure that one' is not clearing it."*
`gates.every(...)` honoured it; the inputs feeding it did not.

**The fix already existed in the same file.** `MilestoneGate` has carried
`status: 'unknown'` all along and the business-score gate has used it properly
— `actual: null`, `gap: null`, and a resolution explaining it is *not a
shortfall*. The numeric gates sat beside it on the old shape, because
`numericGate` took a plain `number`, which is what forced the `?? 0`.

**The visible cost was the reason, not the verdict.** A client with no credit
report was shown *"Personal FICO Score — required 620, actual 0, gap 620"* —
advice to raise a catastrophic score, when the work is to pull a report.

**Two more instances of an already-fixed expression.**
`Math.max(...profiles.map((p) => p.score ?? 0))` was fixed in
`credit-optimizer.ts` and left standing in `client-graduation.service.ts` and
`credit-builder.service.ts`. The `length > 0` ternary guarded the empty case
and not the null-score case. A threshold consumer the original change did not
sweep for — the CLAUDE.md rule about widening, in the other direction.

**Also found: `?.utilization ? ... : 0` folded a genuine 0% in with an absent
one**, because 0 is falsy. The same two states were being conflated from both
ends of the same expression.

**Clean this round.** The KYC beneficial-owner check guards its empty case with
an early return before `.every()`. `workflow-engine` returns `true` for zero
conditions explicitly and by design (a catch-all rule). `portfolio-health`
iterates a required-types constant rather than the data, so it cannot go
vacuous.

**Latent, not fixed:** `stress-test.ts` computes `peakOutstandingBalance` as
`Math.max(...projections.map(...))`, which is `-Infinity` on an empty
projection set. Whether that set can be empty was not established, and a fix
without that answer would be a guess.

### Fourth sweep, 2026-08-07 — a missing compiler setting

The third sweep came back thin and its most useful finding was a missing check
rather than a bug, so this one used the type-aware linting that finding
installed. The result was the same shape one level down.

**`noUncheckedIndexedAccess` was off.** It is not part of `strict`, so every
index access — `arr[0]`, `record[key]` — was typed as though something is
always there. Wrong in both directions, both costly:

- **A correct guard looked like dead code.** `tcpa-consent-gate.ts` checks
  `if (!record)` after a Record lookup and `consent-gate.ts` checks
  `if (!requiredTypes)` after a channel lookup. Both are necessary at runtime;
  the type system reported the branches as unreachable. That is why the
  dead-guard scan returned 90 hits — most were correct code with a lying type.
- **A missing guard was invisible.** `rows[0].id` compiled clean and threw.

Enabled over `src` only, in `tsconfig.src.json`, run as `npm run typecheck:src`
and wired into CI. Repository-wide it costs 468 errors, 290 of them in tests
where `rows[0]!.status` is an ordinary assertion and an undefined there fails
the test it is written in — the system working. The 159 in shipped code are the
ones that reach a client, and they are fixed.

**What the 159 turned out to be.** Route parameters the path defines (80),
guarded first-element reads, regex capture groups the pattern requires,
constant lookup tables, an edit-distance matrix bounded by its own loops, and
fallback keys that are literals in the table beside them. Every one was a place
where the code held an invariant the type could not see — the fix is that the
invariant is now written down as `!` rather than assumed.

Two read better afterwards than before: `rate-limiter.resolveLimit` did two
separate lookups so nothing tied its guard to the value it guarded, and the
group-by in `applications.routes` did a create-then-push pair for the same
reason. Both are one lookup now.

**A note on the sweep's own method.** The first run of it reported *zero hits
across five rules*. That was a broken harness — `--no-eslintrc` is invalid
under flat config and stderr had been redirected to `/dev/null`, so the failure
was invisible and empty output read as a clean result. The second attempt
passed rules without the plugin in scope and eslint's explanation was counted
as two hits, identically, for four different rules. Neither reading was
credible on its face; both looked like answers.

### Fifth sweep, 2026-08-07 — a regulator record built from `any`

Ran the `no-unsafe-*` family, now that type-aware linting exists. 758 hits,
and the count is misleading: the split is what matters. Four `: any`
annotations sit in `src/backend/integrations`, where an external payload
genuinely has no type. **Twelve sat in domain code and discarded a type Prisma
already provides** — `rows.map((r: any) => ...)` over a fully-typed query
result.

They were in two files, and one of them assembles document packs for a
regulator.

**One had already drifted.** `regulator-response.service._toRecord` read
`row.updatedAt ?? row.createdAt`, and `RegulatoryAlert` had **no `updatedAt`
column**. The fallback therefore always won: a regulator inquiry that had been
reviewed, updated or responded to reported an `updatedAt` equal to its creation
date and read as untouched. No crash and no null — a plausible date that was
wrong for every record anybody had worked on.

The column exists now (`@updatedAt`, so it cannot drift from the writes it
describes), and the `?? row.createdAt` fallback is gone: it is what made the
missing column invisible, and keeping it would hide the column's removal the
same way.

**The fix was subtraction.** Deleting the twelve annotations and the twelve
`eslint-disable` comments that existed only to permit them left `typecheck:src`
clean — Prisma's inferred types were sufficient the whole time. Both `_toRecord`
mappers are typed to their models, and the last `as any` at a call site is
gone.

Verified by negative control: reading a column that does not exist is now a
compile error in the regulator pack. It compiled before.

**Checked and clean this round.** Request-body handling. 65 sites cast
`req.body` rather than parsing it with zod, which looked like an unvalidated
trust boundary and is not — every site sampled, including money fields,
validates with explicit `typeof` checks and handles optional fields correctly.
Two styles in one codebase is an inconsistency, not a defect, and it is not
worth a refactor.

The remaining 746 unsafe-`any` hits are concentrated in the Twilio and
VoiceForge clients, where the payload is external and untyped at the source.
Left alone deliberately: `any` there is defensible, and a refactor would buy
much less than the twelve did.

### Sixth sweep, 2026-08-07 — a suite nobody ran

Previous sweeps audited the code. This one audited the apparatus that checks
the code, on the grounds that a check reporting nothing has either found
nothing or not run.

**`tests/e2e` — six flow suites, 81 assertions — was run by no CI job.** A
`test:e2e` script exists and points at it. The workflow calls `test:unit`,
`test:integration` and `test:playwright`, and never that one. The files looked
maintained, they passed the moment they were finally run, and nothing would
have said otherwise if they had stopped.

They need no database, so they run in the Unit job now.

**A guard, not just a fix.** `tests/unit/runner-coverage.test.ts` asserts the
mapping rather than a count: every directory under `tests/` that contains test
files must be named by an npm script **and** reached by a script CI actually
invokes. The second half is the one that was missing — `test:e2e` existed and
proved nothing, because existing is not being called.

Its first run flagged `tests/fixtures` and `tests/performance`, which hold
mocks and k6 scenarios and no test files at all. Scoped to directories that
actually contain tests; demanding a runner for the other two would have made
the assertion noise within a week.

Verified by negative control: pointing CI away from `test:e2e` fails it.

**Checked and clean this round.** No `.only` anywhere — one would silently
disable the rest of its file while CI reported green. No `.skip` or `xit`.
And **all 3,986 `it`/`test` blocks contain an assertion**, checked by parsing
each block rather than grepping the file, so a file with one `expect` in it
cannot vouch for the twenty tests around it.

That scan also produced a false positive worth recording: the first version
matched `test.describe(` as though it were a test and reported 65
assertion-free blocks. Suite blocks legitimately hold no assertions. The
corrected pattern found zero.

### Seventh and eighth sweeps, 2026-08-07 — the apparatus, then the setup

**Seventh: `master` had no branch protection.** No required status checks at
all. Every merge in this session was green because somebody waited for it, not
because anything enforced it, and a direct push bypassed CI entirely. Noted in
a CI comment on 2026-08-05 and never acted on — the docs-only path filter was
deliberately written as a job-level `if:` rather than a workflow-level
`paths-ignore` so that protection could be turned on later without leaving docs
PRs stuck waiting for a check that never reports. The accommodation was built;
the switch was never flipped.

Enabled with all six checks required, `strict` (a branch must be current before
merging, so checks describe the actual merge) and `enforce_admins`. Verified by
attempting a direct push, which was rejected: *6 of 6 required status checks are
expected*.

Clean in the same pass: no schema/migration drift, CI does migrate + seed + run
the seed-idempotency check, and `check-seed-idempotent.ts` documents precisely
which failure it would *not* have caught.

**Eighth: the setup file named the wrong secrets.** `.env.example` listed
`JWT_SECRET`, which nothing in the codebase reads, and named neither
`JWT_ACCESS_SECRET` nor `JWT_REFRESH_SECRET` — the two `config/auth.ts`
requires and throws without. Anybody setting up from it configured a variable
that did nothing, never learned about the two that mattered, got a server that
booted cleanly, and hit the first login as a failure. Fail-closed, so loud
rather than dangerous, and invisible to everyone who already had a working
`.env`.

**And `config/index.ts` exported a signing secret that degraded to a literal.**
`JWT_SECRET` fell back to `'dev-secret-change-in-production'` whenever
`IS_PRODUCTION` was false — and `NODE_ENV` defaults to `'development'` twenty
lines above it, so an unset `NODE_ENV` on a production host selected it. It was
surfaced as `config.jwt.secret`. **Nothing read it.**

A dead export is usually harmless. This one was a correct-looking answer to the
right question, sitting closer to hand than the real one — beneath a comment,
in the same file, explaining why `JWT_ACCESS_SECRET` is deliberately not
exported there for exactly that reason. The hazard was written down and the
code beside it embodied it.

Both fixed, and pinned by `tests/unit/services/auth-secret-config.test.ts`,
which reads the variable names out of `auth.ts` rather than hardcoding them and
asserts the example file names each one. It also asserts `auth.ts` never grows
an `IS_PRODUCTION` check, since that is precisely what would reintroduce the
export just removed.

Clean in the same pass: `requireSecret` throws unconditionally with a 32-char
minimum, and the health endpoint separates liveness from readiness, probes the
database for real, and answers 503 when it fails.

**Checked and clean.** `billing.routes.ts` is the model — `collectionRate` is
null on an empty month and there is an explicit comment about not fabricating a
growth rate from a zero base. The `?? false` hits across the codebase are
option defaults, not measurements, and the `Math.max` hits are pagination
clamps.

**~~One loaded gun, left loaded.~~ Unloaded 2026-08-07.**
`hasSpecificStateLaw(stateCode)` returned `false` for an unrecognised state —
"this state has no specific commercial financing law", a legal claim about a
jurisdiction nobody had looked up, in the unsafe direction. Nothing called it,
which is why it was deferred; it is fixed now rather than deleted, because the
question it answers is one somebody will eventually ask.

**A three-valued boolean would not have fixed it.** `boolean | null` still
reads as false in a condition, which is the exact misuse. `stateLawStatus`
returns a string union — `specific_law | federal_baseline_only |
state_not_recognised` — so `if (stateLawStatus(code))` is visibly nonsense
rather than quietly wrong, and a `switch` has to name the third case.

`isStateRecognised` was added alongside for the plain question.

**The baseline fallback stays.** `getRequiredDisclosures` and
`getComplianceSteps` still return the federal baseline for an unknown state,
and that is correct — those requirements genuinely apply everywhere. Withholding
them would be the wrong fix. What was missing is that the lists cannot say what
they are, so a caller reading only `disclosures` takes a baseline packet for a
complete one. `ComplianceService.getStateRequirements` now returns `status`,
`stateRecognised`, and for an unknown state a caveat saying any state-specific
obligation is **unknown, not absent**.

---

## 4. Integrations that fail closed

Three services refuse to answer unless credentials are configured. Each has a
documented escape hatch for local work, and anything produced through it is
marked on the record.

| Service | Gate | Escape hatch |
|---|---|---|
| `integrations/credit-bureaus/bureau-client` | Per-bureau credential (`EXPERIAN_CLIENT_ID`, `TRANSUNION_CLIENT_ID`, `EQUIFAX_CLIENT_ID`, `DNB_API_KEY`) | `BUREAU_MODE=synthetic` — profiles carry `synthetic: true` |
| `services/credit-intelligence` | Same credentials, same configuration | Same. A profile written in synthetic mode records `synthetic` in `rawData` |
| `services/integration-layer` | None — refuses unconditionally | None. Nothing here calls a provider yet, so there is nothing to gate on |

The bureau adapters still carry inline comments naming the real product,
endpoint and auth mechanism to replace each stub with. That scaffolding is the
useful part and was kept deliberately.

`BUREAU_MODE` is not inferred from `NODE_ENV`. Being outside production is not
consent to invent somebody's credit history, and a test environment is exactly
where a generated score gets mistaken for a real one.

---

## 5. Pages that explain what they no longer show — corrected 2026-08-07

> **This section listed seven pages and presented that as the set. It was a
> subset.** A scan of `src/frontend/app/**/page.tsx` for honest-absence copy
> returns **at least nineteen** pages carrying such a note — the seven below
> plus `/billing`, `/rewards`, `/statements`, `/financial-control/tax`,
> `/spend-governance`, `/portfolio`, `/training`, `/platform/crm`,
> `/platform/referrals`, `/compliance/deal-committee`,
> `/compliance/disclosures`, `/compliance/regulatory` and
> `/compliance/training`.
>
> That matters because of how the omission was found. Four of the missing
> pages — Rewards, Statements, Billing, Tax — were filed as bugs, repeatedly,
> **by the person who wrote them**. This document was the place to check
> whether a blank page was expected, and it said those pages were not in the
> category. It was consulted and it answered wrongly.
>
> Same failure as the §6 defects table going stale twice, in a third form: not
> a claim that rotted, but a list that was never complete and read as though it
> were. A count stated with confidence — *"all seven"* — is the tell. Nothing
> produced that seven; it was the length of a list somebody wrote once.
>
> Also corrected here: the entry `/referrals` appears to name the wrong page.
> The note this section describes correcting lives on `/platform/referrals`.
> Both routes exist. Both are listed below, separately, rather than one being
> assumed to mean the other.

### The distinction these pages must draw

Three facts used to render identically as grey prose:

1. **Not built** — the capability does not exist.
2. **No data** — it works; this client has nothing to show.
3. **Failed** — the read did not complete.

`components/ui/capability-state.tsx` gives each a structurally distinct
marker, so the difference survives a glance: `not_built` is a solid box with a
heavy left rule, `no_data` is **dashed**, `failed` is a solid red box. The
explanatory prose stays — it is good and has caught real defects — but it is
no longer the only signal.

`not_built` carries a modifier saying either what would **unblock** it or that
it is **deliberate**, because "waiting on something" and "will not be built"
are different answers to a reader deciding whether to keep asking.

### Converted so far

**First batch** — `/billing` · `/financial-control/tax` (aliased as `/tax`) ·
`/rewards` · `/statements`

**Second batch, the seven this section originally listed** —
`/card-benefits` · `/compliance` · `/funding-rounds/[id]` · `/multi-tenant` ·
`/platform/visionaudioforge` · `/referrals` · `/sandbox`

Two things came out of the second batch worth recording, because both would
have been invisible in a mechanical conversion.

**Three of the seven are dark surfaces.** `/card-benefits`, `/compliance` and
`/multi-tenant` are near-black pages; the first four were white. A slate-50
box on a `gray-950` page does not read as a subdued marker, it reads as a
rendering fault — the exact impression this component exists to remove. The
component took a `tone` prop rather than a second component: the grammar
(solid with a heavy left rule, dashed, red) is identical in both tones,
because the recognition being built has to survive moving between pages. Only
the palette flips.

**One bullet was not a gap at all.** `/compliance` listed *"A per-category
score"* under "Not shown here", but its own text says scores now come from the
checks that ran and a category nothing has scored shows no score. That is a
**fixed** defect and a `no_data` state — marking it `not_built` would have
re-opened a closed entry in the register and reported working code as missing.
It is the §6 stale-claim failure pointing the other way, and the only defence
against it is reading each item rather than converting the list.

`/multi-tenant`'s impersonation entry is the one to look at first if any of
these get built: the endpoint returned a token, started no session and wrote
no audit record, **while the dialog told the operator that impersonation was
logged and audited**. A control described but not implemented is worse than an
absent one.

### Still prose-only — to convert

`/spend-governance` · `/portfolio` · `/training` · `/platform/crm` ·
`/platform/referrals` · `/compliance/deal-committee` ·
`/compliance/disclosures` · `/compliance/regulatory` · `/compliance/training`

### The register, and why it is checkable

Every page rendering `CapabilityState` with `state="not_built"` must appear in
the block below. `tests/unit/frontend/capability-state-register.test.ts` reads
the source tree and this file and fails when they disagree — so a page
declaring an unbuilt capability cannot go unlisted, and a listed route cannot
quietly stop declaring one.

This is the mechanism the section lacked. The previous list was maintained by
remembering to update it, which is how it came to be missing twelve pages
while asserting completeness.

The check covers `not_built` only. `no_data` and `failed` are properties of a
request, not of the product, and there is nothing about them to enumerate.

<!-- capability-state:not-built:begin -->
- `/billing` — usage metering; taking payment
- `/card-benefits` — logging a cancellation; keep/negotiate/cancel advice
- `/compliance` — a recommended next filing
- `/financial-control/tax` — tax document generation
- `/funding-rounds/[id]` — advisor and target close date; round economics
- `/multi-tenant` — subscription invoices; advisor and client counts; activity log; impersonation
- `/platform/workflows` — an execution log. Nothing executes a saved rule, so no
  workflow has ever fired. The page rendered `MOCK_EXECUTION_LOG` — entries naming
  a workflow, a trigger, an action taken and a count of clients affected, with a
  success/failure filter — while the endpoint beneath it answered
  `execution: {runs: false}`. Recorded as removed on 2026-08-08 in two documents
  and actually removed 2026-09-01
- `/platform/visionaudioforge` — document and audio analysis
- `/referrals` — advisor referral tracking
- `/rewards` — best card per category
- `/sandbox` — sandbox mode
<!-- capability-state:not-built:end -->

---

## 6. Advisory content that is stale, wrong, or gated on the unobtainable

A different kind of gap from the rest of this document. Sections 1–5 are about
figures the system cannot produce. This one is about figures it produces
confidently that are **wrong in the world** — thresholds from a superseded
regulation, and gates on a score no client can obtain.

**Full write-up, with every claim dated and sourced:
[`docs/product/business-credit-scores.md`](product/business-credit-scores.md).**
It carries a defects table; the summary is here so it is findable from where
work gets planned.

### FICO SBSS is not client-obtainable, and its SBA threshold no longer exists

SBSS is computed **when a lender requests it**, blending the owners' personal
credit, business bureau data, financials and the application. It is not a
record held about a business, so there is nothing for a client or advisor to
pull. FICO does not sell it to business owners.

The SBA then removed the requirement entirely, effective **2026-03-01**, for
7(a) Small Loans of $350,000 and under — Procedural Notices
[5000-875701](https://www.sba.gov/document/procedural-notice-5000-875701-sunset-sbss-score-7a-small-loans)
(2026-01-16) and
[5000-876777](https://www.sba.gov/document/procedural-notice-5000-876777-sunset-sbss-score-supplemental-guidance)
(2026-02-20). **Cite 876777 for any requirement** — it replaced the SOP 50 10 8
amendments in the first notice. The requirement went 140 → 155 → 165 → sunset.

Note the distinction: the SBA removed **the requirement, not the option**.
Lenders still use SBSS by choice with their own models. SBSS is not irrelevant;
it is no longer a universal floor, so there is no number left to aim at.

### ~~Seven places gate or project on SBSS~~ — all seven closed, verified 2026-08-07

**This section outlived the work it described.** It was written 2026-08-05 as a
list of seven live sites; the remediation landed across the PRs of 2026-08-05
and 2026-08-06, and the list was never struck through. Re-read site by site on
2026-08-07 — every one is fixed, and the table below is kept as the record of
what was changed rather than as work outstanding.

That is the same failure this document warns about in the other direction. Five
claims here have been checked against the schema and found wrong; this is the
sixth entry to be checked and the first found *stale rather than mistaken* —
still describing a defect after it was fixed. A closed gap left open costs a
re-fix; the check is the same one either way, and it is cheap.

| Site | Then | Now |
|---|---|---|
| `stacking-criteria.service.ts` `sc_004` | Tier 2 gate, SBSS ≥ 140 | Criterion removed |
| `stacking-criteria.service.ts` `sc_008` | Tier 3 gate, SBSS ≥ 175 | Criterion removed |
| `client-graduation.service.ts` | `{ scoreType: 'sbss', min: 50 }` | Threshold removed |
| `client-graduation.service.ts` | `{ scoreType: 'sbss', min: 100 }` | Threshold removed |
| `credit-builder.service.ts` | `m.targetScore > (sbss?.value ?? 0)` | Returns `null` when no SBSS is on record; the `?? 0` is gone |
| `credit-optimizer.ts` | `Math.max(...map(p => p.score ?? 0))` | `sbssScores.length > 0 ? Math.max(...) : null` |
| `EstimatedProgressTimeline.tsx` | `SBSS_TARGET = 175`, ~3 pts/month | Projection removed; `SBSS_TARGET` no longer exists anywhere in the tree |

Also checked: `credit-builder/page.tsx` renders "No SBSS score is on record for
this client" rather than a milestone, and `isLenderComputed` marks `sbss` as
lender-computed so a surface can say why it is absent rather than showing a
blank.

A `scoreType = 'sbss'` count on 2026-08-07 still returns **zero rows**, which
is the fact all of the above turns on.

#### The original list, for the record

| Site | What it does |
|---|---|
| `stacking-criteria.service.ts` `sc_004` | Tier 2 gate, **SBSS ≥ 140** — two revisions stale |
| `stacking-criteria.service.ts` `sc_008` | Tier 3 gate, **SBSS ≥ 175** — no SBA basis found |
| `client-graduation.service.ts` | Track threshold `{ scoreType: 'sbss', min: 50 }` |
| `client-graduation.service.ts` | Track threshold `{ scoreType: 'sbss', min: 100 }` |
| `credit-builder.service.ts:417` | `m.targetScore > (sbss?.value ?? 0)` — **no score collapses to 0** |
| `credit-optimizer.ts:227` | `Math.max(...map(p => p.score ?? 0))` — **same collapse** |
| `EstimatedProgressTimeline.tsx` | `SBSS_TARGET = 175`, projecting **~3 pts/month** toward it |

The last three are the live ones. Two collapse "not measured" into zero — the
same defect as the `Math.max` across incompatible scales fixed in 1c. The
timeline projects an unlock date from a monthly gain rate for a score that is
not periodically measured and cannot be observed by the client at all.

**No client has ever had one.** A query on 2026-08-05 returned zero rows of
`scoreType = 'sbss'` in the database — so both criteria have been unassessable
for every client since they were written, and the milestone panel has never
measured anything.

### ~~An untested guard, left in place deliberately~~ — closed 2026-08-05

**The seam described at the end of this entry now exists.**
`estimateMonthsToNextTrack` takes the thresholds it measures against, defaulting
to the track's own, so the rule is exercised again without a track having to
declare a requirement on an unobtainable product. Production callers pass
nothing and behave exactly as before; two tests reach the guard directly.

That closes the last of the three guards that lost their exercise when the SBSS
gates were removed. The original entry is kept below, because the reasoning is
the reusable part — an untested guard is a guard on its way out, and the fix is
usually a parameter rather than a resurrected requirement.

---


`estimateMonthsToNextTrack` returns **null rather than 0** when a track
requires a business-credit score the client has never been measured on. Zero
means "nothing left to close"; an unmeasured gate has closed nothing. The
defect it was written for was real — a client cleared every measurable Full
Stack gate with no SBSS on record and the panel offered *"Estimated 0 months
at the current rate."*

**That guard is now unreachable.** It fires only when a track declares a
business-credit threshold, and none does since the SBSS gates were removed on
2026-08-05. No input can reach it, so nothing exercises it.

It is kept, not deleted, because the day a track declares a threshold again the
defect returns without it. But an untested guard is a guard on its way out:
nothing fails when someone simplifies it away, and the comment explaining it
will read like archaeology to whoever finds it.

**What would fix this properly:** a seam that lets a caller pass thresholds
into `estimateMonthsToNextTrack` rather than reading `TRACK_THRESHOLDS`
directly, so the rule can be exercised without a track having to declare a
requirement on an unobtainable product. Two sibling guards lost their only
exercise in the same change and were rescued that way — `businessCreditGate`
was exported and tested directly, and the compile-time proof that a PAYDEX
cannot be compared against an SBSS requirement now declares its own threshold
instead of borrowing one from a track. This is the third, and the only one
still uncovered.

**Cost.** *Small — a parameter and a test.* Recorded here rather than in a code
comment alone, because the comment is only read by someone already editing the
function, and the point is to reach someone planning work before that.

### Also recorded there

- `EstimatedProgressTimeline.tsx` `c2-2` told advisors the Experian report was
  **free**; it is ~$49.95. Fixed 2026-08-05 — the one defect here that made an
  advisor tell a client something untrue.
- SBSS milestone 2 cites **"7a/504"**. The prescreen was 7(a) Small Loans only;
  SBA Express was explicitly unaffected and 504 never applied.
- **The 504 error had two invisible siblings.** It was the one visible
  instance — on the page, in front of an advisor. Checking it turned up two
  more of exactly the same kind, in a roadmap ladder nobody had opened:
  *"SBA Express loan pre-qualification"* at SBSS 140, and *"SBA 7(a) loan
  ($500K–$5M)"* at SBSS 200. Express sat outside the prescreen entirely and
  the prescreen never touched loans above $350K, so all three were the same
  mistake — attaching an SBA product to an SBSS number that never gated it.
  Same shape as the issuer-site sweep that went from 6 sites to 15: the
  visible instance is a sample, not the population. Fixed 2026-08-05.
- Three different SBSS thresholds — **140, 160, 175** — appear on one page;
  nine sites carry one, and four different numbers were quoted as the SBA's.
- ~~Four coaching CTAs render as inert `<span>`s.~~ **Closed 2026-08-05.**
  "Set Reminder" went with the card that carried it; the other three are
  anchors to the sections they always named. An in-page jump renders with a
  down arrow rather than the outbound ↗ — the arrow promised a destination
  elsewhere — and a label with no destination still renders as a span, so a
  card with nothing to click does not pretend to have something.
- Coaching is keyed on **tier alone** and asserts client facts it never reads.

---

## 7b. ~~Nothing records that an eligibility question was asked~~ — issuer eligibility records, 2026-09-01

**`GET /issuers/:id/eligibility` computes an answer and returns it. Nothing
keeps it.** The context is rebuilt from live data on every call — held cards,
open applications, inquiries, the issuer's current rules — so re-running the
same URL next week produces a different answer with no trace of the earlier
one. This is the answer a placement strategy is built on.

What is lost is not mainly the verdict. It is everything qualifying the
verdict, and that is the volatile part:

- **`unevaluatedRules`.** A rule blocking today because nobody finished
  recording its threshold evaluates normally once somebody does. The record
  that an advisor was told the rule was unconfigured disappears with the fix.
- **`caveats`.** The 5/24 figure is a floor whose height depends on which held
  cards had been attested *at the time of asking*. An attestation added later
  silently improves the past.
- **The held-card tally itself**, which is an advisor's claim, not a
  measurement — and claims get corrected.

So when a client is declined, nobody can show what the system said, on what
basis, or which of the three the advisor actually relied on.

### The table already exists, and nothing writes to it

`AiDecisionLog` (`ai_decision_logs`) carries exactly this shape:
`moduleSource`, `decisionType`, `inputHash`, `output`, `confidence`,
`overriddenBy`, `modelVersion`, `latencyMs`. Its `moduleSource` union names
`stacking_optimizer`, `suitability_engine`, `credit_intelligence`,
`udap_scorer` and four more.

**None of those eight write a row.** The only writer in the codebase is
`POST /api/ai-governance/decisions`, an admin endpoint gated on
`COMPLIANCE_WRITE` — a human posting a decision by hand. The engines that
actually decide things do not call it.

And there is a reader. `GET /api/businesses/:id/decisions/explain` returns
`{ data: [], meta: { total: 0 } }` — which is what a compliance officer sees
for a business the system has made a dozen recommendations about. An empty
list reads as *no decisions were made*, not as *no decision has ever been
recorded by anything*. Same shape as section 2: a computed absence rendering
as a valid value, here on the surface whose whole purpose is to answer "why
did you recommend that".

### What recording costs

- **The write, for issuer eligibility alone: about half a day.** A call to
  `logAiDecision` at the end of `checkIssuerEligibility`'s route, with the
  whole `EligibilityResult` — caveats and `unevaluatedRules` included — as
  `output`, plus the `EligibilityContext` hashed into `inputHash` so two
  answers can be compared without storing a client's credit profile twice.
  `businessId` must go into `output`, because that is the key
  `getBusinessDecisionExplanations` filters on.
- **The other seven module sources: a day or so**, mostly finding where each
  engine's decision actually surfaces.
- **The empty-list fix is independent and smaller**: the explain endpoint
  should distinguish "nothing recorded" from "nothing decided" whether or not
  the writes are built. Until an engine writes, the honest answer is that this
  system does not record its decisions — which is worth saying out loud on the
  page a regulator would be shown.

### The objection, and the answer

Recording on a `GET` makes a read write. Two ways out: accept it (the write is
a fact about the question having been asked, not about the client), or make the
recording explicit — the surface that *acts* on an answer posts it. The second
is cleaner and costs a round trip; the first cannot be forgotten by a caller.
**Recommend the first**, because the failure being fixed is precisely that
nobody remembered to record.

### Built, same day

**`GET /issuers/:id/eligibility` writes a row**, when a `businessId` was named
— a default-context preview is a decision about nobody, and logging it would
fill the record a compliance officer reads with UI probes. The whole
`EligibilityResult` goes into `output`, `caveats` and `unevaluatedRules`
included, with `businessId` alongside it because that is the JSONB path the
reader filters on. The `EligibilityContext` is hashed into `inputHash` rather
than stored, so two answers can be compared without keeping a second copy of a
client's credit profile. `confidence` and `modelVersion` stay null: this is
rule evaluation, and a confidence figure invented for it would be the
fabrication this log exists to catch. A failed write does not fail the answer,
but it is reported — the response carries `decisionNotRecorded` saying the
answer cannot be produced later.

**The empty list now says what it is.** `getBusinessDecisionExplanations`
returns `{ decisions, coverage }`, and `coverage` is derived from the table
rather than asserted: a `groupBy` over `moduleSource` gives the modules that
have actually recorded something for this tenant, and everything else in
`AI_MODULE_SOURCES` is named as silent. When nothing has recorded anything the
note says so outright — *an empty list here means nothing writes to the
decision log, not that no decisions were made*.

`AI_MODULE_SOURCES` is now the single list. The union derives from it, and so
does the admin endpoint's zod enum, which was a second hand-kept copy of the
same nine names.

**Also closed while here: a cross-tenant read.** `buildContextFromBusiness` ran
`findUnique({ where: { id: businessId } })` with no tenant filter, so any
authenticated caller could pass any business id and read back its credit score,
age and revenue as `currentValue` on the rule violations. The mount-table guard
covers `:id` and `:clientId` in a path; this id arrives as a query parameter,
which `check-route-tenancy`'s own comment names as what it cannot see. Missing
and other-tenant now answer identically.

**Still open: the other eight modules.** `stacking_optimizer`,
`suitability_engine`, `credit_intelligence`, `udap_scorer`, `decline_recovery`,
`contract_analysis`, `comm_compliance` and `fraud_detection` are all named in
the union and none writes a row. A day or so, mostly finding where each
engine's decision actually surfaces. Until then `coverage.silent` names them on
every read, which is the honest interim answer.

**Flagged during the `lender_match` module review, 2026-09-01.**

## 6b. ~~A signer is a business, not a person~~ — fixed 2026-08-07

`BusinessOwner` recorded firstName, lastName, title, ownership percentage and
KYC status — and **no email**. So a document going out for signature had only
`Business.businessEmail` as a destination: the owner named on the envelope, the
company's address on the outside. Usually the right envelope going to roughly
the right place, and not the same as sending it to the person who signs.

**Two columns and one rule.** `BusinessOwner.email`, and `isSignatory` for the
case largest-stake gets wrong — a 60% owner may not be the officer authorised
to bind the company, and that exception is now recordable rather than quietly
incorrect.

The selection lives in `services/signer-selection.ts`, away from the route, in
this order:

1. an owner marked `isSignatory` who has an email;
2. otherwise the largest stake who has an email;
3. otherwise the largest stake, addressed at the business.

**Step 3 is kept, and reported.** A business address is not a stranger's inbox,
and refusing outright would break every client onboarded before the column
existed. What is not kept is the silence: the result carries `addressKind`,
`'owner'` or `'business'`, and a `reason` in words. A fallback nobody can
distinguish from the real thing is exactly how the original defect survived —
both paths produced a sent envelope and a success message.

The rule does not depend on the caller's ordering. The query sorts by stake
today; a refactor dropping that `orderBy` would otherwise silently change who
signs a contract.

Refusals remain for the two cases where there is genuinely nobody to send to:
no owner recorded at all, and no address anywhere.
---

## 7. ~~Nothing records a card a client already held~~ — recorded 2026-08-06

**A `HeldCard` table exists, and 5/24 counts it.** The product question was
*attestation or bureau pull*; the answer is **attestation**, because that is
what can exist today and it is what the optimizer already accepted on its
request. Every row carries `source` and `attestedBy`, so the claim travels with
its provenance rather than arriving as a fact.

Three things the record buys:

- **A card the client arrived with now counts.** The figure was structurally a
  floor for every client; it is now a floor only where an attestation is
  missing or undated.
- **`openedAt` may be null, and that is reported rather than smoothed.** A
  client often knows they hold a card without recalling the month. Such a card
  is *unplaceable* — neither counted nor ignored — which is the difference
  between "3 of 5 slots open" and "at most 3". The stacking optimizer already
  drew that distinction; the issuer-rules path now does too.
- **The exemption is checked before the date**, so an undated credit-union card
  does not inflate the unplaceable count and make the answer vaguer than the
  rule requires.

**What it does not buy.** An attestation is only as good as the entry, and
nothing forces an advisor to record a card. The caveat still reads
`may_understate` and now says so explicitly: *"a card nobody recorded is still
invisible"*. A bureau pull would replace the claim with a measurement, and
needs an integration that does not exist.

**~~Still open: the optimizer.~~ Closed 2026-08-06 — one record, two readers.**

The optimizer loaded held cards from the request payload only, so the two
surfaces answered from different data about the same client: the optimizer from
what an advisor had typed into that run's form, the issuer-rules path from
nothing. That is how "5 of 5 slots open" appeared beside an Inputs Used panel
listing a held Chase card.

Both read `HeldCard` now, through the same pure tally, so they cannot disagree
about how many cards a client holds or which are exempt.

**What the table buys over the payload:** an opening date. The form has no field
for one, so a card arriving only on the request can *never* be placed in the
window and can only widen the answer to "at most N". A recorded card with a date
counts properly. Cards still typed into the form are honoured and continue to
count as unplaceable — they are a draft, not a record.

**~~Still open, smaller: the form does not write what it collects.~~ Closed
2026-08-06 — the form persists.**

`POST /api/clients/:businessId/held-cards` replaces the client's list in one
transaction, and selecting a client loads it back and ticks it. So the section
now opens on what is on record rather than on empty, and a card entered once is
a card the next run and the 5/24 panel both see.

Four decisions worth keeping:

- **Saving is explicit, not a side effect of running a plan.** Ticking a card
  to see what the plan does is a question, not a claim, and every row carries an
  attestor's name. An auto-write on run would also only ever *add*: unticking
  could not remove, because a run cannot distinguish "no longer held" from "not
  mentioned this time". That is the enable-without-disable shape found three
  times in this codebase already.
- **The save replaces rather than appends**, which is the only way removal
  exists at all.
- **The date input is `YYYY-MM` and optional.** Requiring it would push an
  advisor to invent a month to get past the form, and an invented month counts
  against 5/24 as confidently as a real one. Blank stays blank and stays
  unplaceable.
- **A card on record that the form has no checkbox for is preserved on save and
  shown as a count**, because a replacing save would otherwise delete rows an
  advisor was never shown.

**Found while verifying it in a browser: the record's answer discarded a tick.**
Selecting a client starts a request whose response replaced the ticked list, so
a card ticked before it landed was thrown away when it did — the click
registered, the box cleared itself a moment later, and nothing on screen said
why. Invisible locally, where the request takes a few milliseconds; it showed
up on CI, where a test ticked a card, waited sixty seconds and never saw the
field that only appears when a card is ticked.

The section is now not editable until the record has answered, and it says so.
That closes the window for a person. The state update also merges rather than
replaces when an edit did get through, which is what actually guarantees
nothing is lost — a union cannot drop either side, and there is nothing to
untick during the wait, so nothing removed can come back. That second half is
deliberately not covered by a browser test: a click on a disabled control fires
no change event, so a driver cannot stage the case honestly.

**Found while writing the unit test: Brex is not in the issuer registry.** The
catalogue offers a *Brex 30* checkbox, and `Brex` appears nowhere in
`shared/constants/issuers.ts`. A recorded Brex card counts against 5/24
correctly — that count asks only whether the issuer is a credit union — and
reaches the issuer-rules path as an unresolved issuer, which that path already
reports rather than resolving in the card's favour. So the behaviour is honest
but partial.

Declared in `CATALOGUE_ISSUERS_NOT_IN_REGISTRY` rather than fixed by adding
`brex` to the registry: membership there implies a cooldown, a velocity rule
and an application policy for the issuer, and inventing those is exactly what
`parseIssuer` returns null to avoid. The test asserts the declared issuers
*still* fail to parse, so the exemption cannot outlive its reason, and a new
catalogue entry with an unrecognised issuer fails rather than joining quietly.

---

## 8. A wrong quantity under a right-sounding name — `CardApplication.creditLimit`

Recorded 2026-08-08, while asking whether the Issuer Directory could show a
real average approved limit.

`CardApplication.creditLimit` holds the amount **requested at draft**. It is
written once by `create()` and never touched by the decision transition, which
sets only `decidedAt` and `declineReason`.

So it is populated on declined applications:

```
Bank of America   status=declined   creditLimit=20000
US Bank           status=declined   creditLimit=18000
Wells Fargo       status=declined   creditLimit=12000
```

None of those was granted. Averaging the column produces an "average approved
limit" made largely of amounts nobody received.

**Why this is worse than an absent column.** A missing field announces itself:
the query fails, or there is nothing to select. A wrong quantity under a
right-sounding name passes every check — the column exists, it is populated, it
is a number, and it is called `creditLimit` on a table of card applications.
Nothing about reading the schema suggests it is not the granted limit. The name
invites the mistake, and the mistake produces a plausible figure.

This is the same family as the seventh entry in `false-success-audit.md`, one
level lower: there, fabricated and real data rendered identically on screen;
here, the wrong quantity and the right one would be indistinguishable in a
query.

**Resolution.** The column is kept and documented in `schema.prisma` as
requested-at-draft — every existing reader means "requested", and renaming it
would break them to fix a comment. `approvedCreditLimit` is the new column,
captured at the approval transition, guarded by a CHECK constraint so a granted
limit cannot sit on a decline, and by
`tests/integration/approved-credit-limit-constraint.test.ts` because Prisma
cannot express that constraint and a generated migration could otherwise drop
it silently.

**What to look for elsewhere.** Not "is this field populated" but "is this field
the quantity its name implies". The test that found this one was noticing a
value on a row where it could not logically exist — a limit on a decline. That
is the cheap detector: find a field on a record whose state should make it
impossible, and ask what it actually means.

## The original entry

**Chase 5/24 is counted from applications made through CapitalForge.** There is
no model for a card a client arrived with: `CardApplication` is an application
*this system* submitted, and the schema has no other card-holding table.

So a client who opened four bank cards before onboarding counts as **zero**
against 5/24, and the panel reads *"5 of 5 slots open"* — the most permissive
possible answer — while the optimizer's own Inputs Used panel may be showing a
held Chase card the advisor typed in. Two surfaces, one client, different
answers, and the one an advisor acts on is the wrong one.

**The error runs one way.** The count can only be too low, which is the
dangerous direction: it reads as headroom, the client applies, and the
auto-decline is the first anyone hears of the four cards. A figure that is
sometimes wrong in either direction invites scepticism; one that is only ever
too low invites trust it has not earned.

**What was done instead of a warning.** The eligibility result now carries a
`caveats` array stating what the number was counted from and which way it can
be wrong. Deliberately not a banner: this is true of **every client, always**,
and a flag that always fires is read as decoration inside a week — the same
reasoning that made *narrow* a property of a tier rather than a badge on all
four. It states the basis so a reader can weigh it, exactly as
`creditUnionCardsExcludedFrom524` is reported rather than silently subtracted.

The stacking optimizer already solved its half: it takes `existingCards` on the
request and says *"At most N of 5 slots open"* when a held card has no opening
date. The issuer-rules path has no equivalent input.

**Cost.** *Product, then table.* The product question first: is a held card an
**advisor attestation** or something pulled from a bureau? Attested is cheap and
immediately useful, and it is what the optimizer already accepts — but it is a
claim, and the 5/24 answer would then be only as good as the typing. A bureau
pull is authoritative and needs an integration that does not exist. Either way
the answer belongs in a table, so both surfaces read one record instead of one
reading a request payload and the other reading nothing.

Until then the caveat stands, and **the count should not be described as a
measurement of the client's 5/24 standing** — it measures what we recorded.

---

## What I would do first

**~~Two-factor authentication, ahead of everything else here.~~ Built 2026-08-06.** It is not on the
list above because it is not a gap of the same kind: the rest of this document
is about figures the system declines to produce, and this is a **security
control the interface offers, the user completes, and the system does not
have**.

Secrets and enabled flags live in a process-local `Map`, so a restart disables
2FA for every user silently, and with two instances the answer depends which
one you reach. And the enforcement is advisory: `login/page.tsx` writes the
access token, **then** checks `/2fa/status` and redirects — so the session
exists before the challenge, and anyone who does not follow the redirect is
already signed in.

**Do not plan the fix from this paragraph.**
[`docs/backlog/two-factor-auth.md`](backlog/two-factor-auth.md) has the scoping
questions, and they are unanswered on purpose: where secrets live and how they
are encrypted, whether the challenge gates token issue (it should, which
changes the login contract for every client), recovery codes, and what happens
to sessions established under the current scheme.

**~~The two columns in section 2.~~ Neither, as it turns out.** Both halves of
this recommendation were wrong, and wrong the same way section 3 was — a claim
about the schema written without checking the schema. Business age needed no
column (`dateOfFormation` was there). Delinquency needs no column either: a
missed payment is recorded on `PaymentSchedule` and linked to a card. What it
needs is a decision about what "portfolio delinquency" means when the only
delinquency observable is among clients already on a repayment plan. See 2b.

**Five** claims in this document have now been checked against the schema and
found wrong — business age, delinquency, section 3's nine tables, the
compliance `resolvedAt` column, and the status-history table below. Nothing
here should be planned from without running the query first.

**~~Then the application status history.~~ No table was needed.** This
recommended a row per status change to turn the `applications` sparkline from
null into a real series. The series is real now and no such table exists: an
application's active life is bounded by `createdAt` and `decidedAt`, both on
the row already, and a `cancelledAt` column closed the third case. See 2d.

The recommendation was not wrong about the value — it was wrong about the cost,
in the same direction as every other entry here that has been checked.

**Then decide about tax.** It is the largest gap and the only one where the
absence is currently safer than a fast implementation. A wrong 1099 is worse
than no 1099, which is why those four endpoints refuse rather than
approximate.

**Leave `/platform/offboarding/:id/advance` refused.** It is the one entry here
that is not a gap. Advancing a stage by hand is how a workflow comes to claim a
deletion that never ran.

**Do not plan from section 3.** Those four tables are unused schema, not
missing features. An earlier version of this document recommended exactly the
opposite, on data that was never checked against the database.

**Then section 6, and probably before most of the above.** Everything else in
this document is a figure the system declines to produce. Section 6 is figures
it produces confidently that are wrong in the world: tier gates on a score no
client can obtain, at a threshold a regulator retired in March 2026. An absent
number prompts a question; a stale number gets acted on.

---

*Verified against a running server on 2026-08-03: all nineteen refusals, the
null figures in section 2, and the row counts behind section 3.*
