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

Twenty-one endpoints answer `501 NOT_IMPLEMENTED`. Each says why in its response
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

## 2. Figures that are absent rather than zero

These endpoints answer normally. Individual figures come back `null` with the
reason stated, because a zero would be a claim.

| Figure | Why it is null | Cost |
|---|---|---|
| `delinquencyRate` (portfolio benchmarks) | No delinquency status is recorded against a card application. `VendorTradeline.status` does carry a `delinquent` value, but that is a Net-30 vendor account, not a card — counting it as the portfolio delinquency rate would answer a different question than the one asked. | **Column** on `CardApplication`, plus whatever sets it. |
| `graduationRate` (portfolio benchmarks) | Nothing records a client graduating from the programme. | **Product.** "Graduated" is undefined today. |
| `topPerformingSegments` (portfolio benchmarks) | Businesses carry an `industry`, but no application volume is attributed to a segment. | **Query work only** — this one is close. Attribute applications to the business industry and it computes. |
| `resolved` (compliance sweep) | The sweep writes a new check row; nothing marks an earlier one resolved. | **Product.** Needs a resolution model for checks. |
| `applications` sparkline (dashboard KPIs) | "Active" is a current status with nothing on the row recording what it was before. | **Column or table.** A status-history row per application would make every trend on this page derivable. |
| `businessAgeMonths` (credit builder) | No formation date is recorded for a business. | **Column** on `Business`. Small, and it unblocks the Tier 3 criterion. |
| `estimatedUnusedValue` (card benefits) | Null only when no unused benefit carries a value — this is working as intended. | **None.** |
| Compliance score, when no checks have run | A score of 100 from an empty check table is a clean bill of health derived from never having looked. | **None.** |

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

## What I would do first

**The two columns in section 2.** `Business.foundedDate` unblocks the Tier 3
business-age criterion on the credit builder, which currently reports
"formation date not recorded" to every client. A delinquency status on
`CardApplication` unblocks the portfolio delinquency rate. Both are single
fields with obvious owners, and both are currently the only thing standing
between an existing page and a real number.

**Then the application status history.** One table — a row per status change on
a card application — turns the dashboard's `applications` sparkline from null
into a real series, and makes every other trend on that page derivable rather
than approximated. It is the highest ratio of surface unlocked to work done on
this page.

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

---

*Verified against a running server on 2026-08-03: all nineteen refusals, the
null figures in section 2, and the row counts behind section 3.*
