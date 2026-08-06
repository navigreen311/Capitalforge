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

Twenty-two endpoints answer `501 NOT_IMPLEMENTED`. Each says why in its response
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
| `GET /api/contracts/:id/detail` | Nothing stores a contract's terms, counterparty, value or dates. | **Table.** Contracts are referenced but never stored. |
| `POST /api/compliance/disclosures/:id/file` | Nothing submits to a regulator, and no table records a filing. | **Product.** Filing is a real-world act with a real-world receipt; the system needs to model what "filed" means before it can claim it. |
| `POST /api/statements/anomalies/:id/dismiss`<br>`POST /api/statements/anomalies/:id/steps/:step` | A `StatementAnomaly` is computed while reading a statement and carries no identifier, so there is nothing to key a dismissal to. | **Product then table.** Anomalies need stable identity first — deciding what makes two anomalies "the same" across reads — and then somewhere to record a dismissal. |
| `POST /api/platform/billing/send-overdue-reminders` | Nothing queues or sends them. This system can send real SMS and email, so a reported send is consequential. | **Product.** Needs a scheduling decision (who, when, how often) before any send. |
| `POST /api/platform/referrals`<br>`POST /api/platform/referrals/:id/follow-up` | No table holds a referral link, its conversions or a commission. | **Table.** |
| `POST /api/platform/reports/schedules` | Nothing stores a schedule and nothing runs one. | **Table + a runner.** |
| ~~`POST /api/platform/tenants/:id/suspend`~~ | **Built 2026-08-06.** Both directions are real and enforced at login, token refresh and `tenantMiddleware`. A 30-second per-process cache keeps the middleware off a per-request query; the staleness bound is stated in `tenant-status.service`. | **Done.** See `docs/backlog/tenant-suspension.md`. |

| `PATCH /api/platform/offboarding/:id/advance` | Deliberate: stage moves when the export or the deletion actually happens, not because somebody advanced it. | **None — this one should stay refused.** Advancing by hand is how a workflow claims a deletion that never ran. |
| `POST /api/declines/:id/reminder` | Nothing schedules or delivers a reapply reminder. | **Product.** Same scheduling question as overdue reminders. |
| `POST /api/optimizer/save-strategy` | No table stores an optimizer strategy. This answered `200` with `{ savedAt, clientId }` and wrote nothing, while the page reported "Strategy saved to *client* profile". | **Table.** A `SavedStrategy` holding the plan as JSON, including the input provenance it was built on. See `docs/backlog/saved-strategy-and-funding-round-persistence.md`. |
| `POST /api/optimizer/create-round` | Nothing created the round. This answered `201` with an invented id — `round-<client>-<n>-<timestamp>` — reported "Funding Round N created" and navigated to `/funding-rounds`, where it was not. | **Wiring.** `FundingRound` exists; the optimizer never wrote one. Should call the same service the Funding Rounds page uses rather than adding a second creation path. |

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

## 3. Tables that exist but are never written

Four tables are in the schema and never receive a row:

| Table | Read by | Effect |
|---|---|---|
| `BackupRecord` | nothing | Backups are reported from nowhere. Until recently a module-level seeder invented seven days of completed ones on every process start. |
| `TenantBranding` | nothing | Per-tenant branding is modelled and unused. |
| `RewardsOptimization` | nothing | Modelled and unused. |
| `SandboxProfile` | nothing | Modelled and unused. |

**None of them is read by anything**, so none is currently causing a surface to
answer emptily. They are dead weight in the schema rather than gaps in the
product, and the only one with a live consequence is `BackupRecord`: the
business-continuity endpoints report on backups, and with nothing writing that
table there is nothing truthful for them to report.

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

## 5. Pages that explain what they no longer show

Seven pages carry an on-screen note rather than a silent absence, so a reader
does not have to wonder whether something is broken:

`/card-benefits` · `/compliance` · `/funding-rounds/[id]` · `/multi-tenant` ·
`/platform/visionaudioforge` · `/referrals` · `/sandbox`

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

### Seven places gate or project on SBSS

Confirmed by reading, 2026-08-05. Any change here must touch all of them —
this is the case the CLAUDE.md rule about threshold consumers was written for.

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

## 6b. A signer is a business, not a person

`BusinessOwner` records firstName, lastName, title, ownership percentage and
KYC status — and **no email**. So when a document goes out for signature, the
only recorded destination is `Business.businessEmail`.

That is usually the right envelope going to roughly the right place, and it is
not the same as sending it to the person who signs. The owner is named on the
envelope — largest stake first — while the address belongs to the business.

**Cost.** *Column.* `BusinessOwner.email`, plus a decision about which owner
signs when several are recorded. Largest stake is a reasonable default and not
obviously right for every document type.

Until then the route refuses rather than substitutes: a business with no email
gets a stated refusal. An envelope to a placeholder reaches nobody, and an
envelope to a real wrong address is a client's contract in a stranger's inbox.

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

**Still open:** the optimizer accepts `existingCards` on the request with no
opening date, so it cannot place them either. Pointing that surface at the
table — one record, two readers — is the remaining half.

---

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
