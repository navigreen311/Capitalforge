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

Fourteen endpoints answer `501 NOT_IMPLEMENTED`. Each says why in its response
body, so a caller does not have to read the source to find out.

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

---

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

These are the quiet ones. The table is in the schema, endpoints read it, and
nothing ever puts a row in — so the surface answers `200` with an empty list
forever, and looks like a feature nobody uses rather than one nobody finished.

| Table | Read by | Effect |
|---|---|---|
| `CardProduct` | `optimizer-v2.routes`, `stacking-optimizer.service` | The stacking optimiser has no catalogue of cards to optimise over. |
| `Issuer`, `IssuerRule` | `issuer-rules.routes`, `issuer-rules-engine` | The issuer rules engine has no rules. |
| `CreditUnion`, `CreditUnionProduct` | `credit-union.routes`, `issuer-rules.routes`, `optimizer-v2.routes` | Credit-union products never appear in any recommendation. |
| `BackupRecord` | nothing | Backups are reported from nowhere. Until recently a module-level seeder invented seven days of completed ones on every process start. |
| `TenantBranding` | nothing | Per-tenant branding is modelled and unused. |
| `RewardsOptimization`, `SandboxProfile` | nothing | Modelled and unused. |

**These are the cheapest wins on this page.** Four of them need seed or import
data, not code — the queries, routes and pages already exist and work. A
catalogue of card products and issuer rules would light up the optimiser
without a line of new logic.

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

**The unwritten tables in section 3.** They are the only entries where the code
is already finished. Seed `CardProduct`, `Issuer` and `IssuerRule` and the
stacking optimiser starts producing recommendations against a real catalogue —
no new logic, no schema change, no third-party credential.

**Then the two columns.** `Business.foundedDate` unblocks the Tier 3 business-age
criterion on the credit builder. A delinquency status on `CardApplication`
unblocks the portfolio delinquency rate. Both are single fields with obvious
owners.

**Then decide about tax.** It is the largest gap and the only one where the
absence is currently safer than a fast implementation. A wrong 1099 is worse
than no 1099, which is why those four endpoints refuse rather than approximate.

**Leave `/platform/offboarding/:id/advance` refused.** It is the one entry here
that is not a gap. Advancing a stage by hand is how a workflow comes to claim a
deletion that never ran.
