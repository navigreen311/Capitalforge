# CapitalForge — Specification

**Written:** 2026-08-08
**Grounded in:** the codebase at commit `45b2513`, not in the previous specification.

---

## Method, and what it cost

Every claim below was checked against source. Where the codebase and the earlier
documents disagree, the codebase wins and the disagreement is recorded rather
than quietly resolved.

**The headline disagreement.** `docs/all-modules.md` is titled *"All 61 Modules
Reference"* and organises the system into four pillars. `docs/mvp-modules.md`
claims 15. The repository contains **95 route files** under
`src/backend/api/routes/` and **72 page files** under `src/frontend/app/`.

The 61 is not a subset, a rename or a rollup of what exists. It is a count from a
plan. Neither number reconciles to what ships, and this document does not attempt
to make them reconcile — it counts what is there and says so. Both older documents
are marked superseded at their heads and left in place, because what was
previously claimed is itself worth being able to read.

**Verification depth is declared per row, not implied.** Section 3 carries a
`Depth` column with three values:

| value | means |
|---|---|
| **inspected** | **at least one** route file in the domain was read and its behaviour confirmed — *not* every route in it |
| **grouped** | assigned to a domain from filename and path; not read |
| **asserted** | taken from an existing doc or a code comment; not independently verified |

A specification that implies uniform depth is making a claim about its own
reliability that it cannot support. Section 6 tells future readers not to do
that, so this document does not.

**The sweep was capped deliberately.** Files were read when they are cited in
section 2 as not-built, appear in `docs/gaps.md`, or touch money, compliance, or
client-facing advice. Of the 95 route files:

- **12 read** — `statements`, `compliance`, `complaints`, `platform`, `workflow`,
  `issuer-rules`, `tax`, `openapi`, `rewards`, `decline-actions`,
  `platform-offboarding`, `held-cards`
- **6 asserted** — the dashboard aggregators, whose behaviour is stated in their
  own header comments and not re-derived here
- **77 grouped** — assigned by filename and path only

Two supporting services were also read in full and are cited as evidence:
`application-pipeline.service.ts` and `statement-reconciliation.service.ts`, plus
`stacking-optimizer.service.ts` at the cooldown registry only.

**A correction made during drafting, recorded because it is the point.** The first
version of this section claimed *31 inspected*. Twelve route files were read. The
number was written from an impression of how much work the month had involved,
not from counting — which is the same defect as an approval rate computed from a
sample nobody stated. It was caught by counting the files and comparing against
the table. A `Depth` column filled in from memory would have been worse than no
column at all, because it would carry the authority of a measurement.

---

## 1. What the platform does

CapitalForge is a **multi-tenant advisory platform for business credit card
stacking**. An advisor works a client from intake through applications to funded
rounds, with compliance and complaint handling around it.

What an advisor can complete end to end today. Each line's depth is the one
declared for its domain in section 3 — several are **grouped**, meaning the route
files were not read, and those lines describe what the paths and page names
indicate rather than confirmed behaviour:

- **Onboard a client** — business record, KYB/KYC checks, consent capture with
  per-application timestamps
- **Run an optimizer** — a stacking plan across issuers, with per-issuer cooldowns
  that declare whether each came from a published rule or an unresearched default
  (`stacking-optimizer.service.ts:1590`)
- **Place applications through a validated state machine** — draft → pending
  consent → submitted → approved/declined, with maker-checker on submit — true
  of both routes to `submitted` since 2026-09-01, and true only of
  `PUT /applications/:id/status` before that, while `POST /applications/:id/submit`
  ran three inline checks and neither maker-checker nor KYB/KYC — and a
  decision transition that records `decidedAt`, `declineReason` and, since
  2026-08-08, the limit actually granted
- **Group applications into funding rounds** and track graduation/readiness
- **Run compliance checks** and read a score derived from recorded risk levels
- **Log and work complaints** through a five-state lifecycle with transition
  validation and event emission
- **Generate and send documents** for signature via DocuSign
- **Bill tenants** through Stripe

The system's distinguishing property is not any single module. It is that
**computed output carries its provenance**: a cooldown says whether it was
researched, a rule says where it came from and when it was last checked, a risk
level ships the terms that produced it, and a figure that is not known renders
as not known rather than as zero. Section 6 states these as requirements.

---

## 2. What this system does NOT do

Placed second deliberately. A reader taking this as a template needs the limits
before the inventory — at position four these read as caveats, and they are the
shape of the thing.

Each entry gives the **mechanism**, not the absence.

### It does not pull a business credit score

There is no bureau pull. `src/backend/integrations/credit-bureaus/bureau-client.ts`
exists as an adapter; nothing calls it against a live bureau. SBSS appears in
`credit-builder.routes.ts` and `graduation.routes.ts` as an input the advisor
supplies, not a value the system obtains. `docs/gaps.md` §6 records the advisory
content gated on this.

**Consequence:** any tier or graduation gate keyed on a bureau score is keyed on
a number somebody typed.

### It does not execute workflows

`POST /api/platform/workflows` persists a workflow: trigger, condition, action —
about ten action types including `voiceforge`, `docusign`, `webhook`. The record
is stored and listed.

**No scheduler, runner or cron consumes it.** A saved workflow will never fire.
Until 2026-09-01 the page also showed executions from `MOCK_EXECUTION_LOG`, a frontend constant
naming workflows that did not exist — 0 workflows configured and N executions on
the same screen. It was recorded as removed on 2026-08-08 and was not; the
constant went on driving a "Show Execution Log" panel for another three weeks
while the endpoint beneath it answered `execution: {runs: false}`. Removed
2026-09-01. The panel is now a `not_built` state saying no workflow has ever run,
registered in `gaps.md` §5.

### It does not import statement documents

Precision matters here, because the common summary is wrong in both directions.

- `POST /api/businesses/:id/statements` **is real and persists** —
  `statement-reconciliation.service.ts:223` writes a `StatementRecord`
- It accepts **JSON only**: a `rawData` object with issuer-aliased fields
- **No parser exists** for PDF, CSV or OFX. The caller must already have JSON
- Anomaly detection (`detectFeeAnomalies`, `detectBalanceMismatch`) runs **once, at
  ingest**, and is persisted. The report endpoint reads stored anomalies; it does
  not recompute. A statement imported before a detector improves keeps its old
  findings
- `POST /api/statements/anomalies/:id/dismiss` and `.../steps/:step` return **501**:
  anomalies are derived at read time and carry no identifier, so a dismissal
  cannot be recorded against one

### It does not meter usage

Usage appears only in `admin.routes.ts` and `multi-tenant.service.ts` as plan
configuration. Nothing counts calls, seats or storage against a tenant.

### It does not generate tax documents

Four endpoints in `tax.routes.ts` refuse explicitly — list, download, summarise,
generate — all via a shared `refuse()` helper.

### It does not move money

No transfer initiation exists. `ach.routes.ts` and the debit monitor handle
authorisation and monitoring concepts; nothing calls a payment rail to move funds.
Stripe integration bills tenants for the platform; it does not disburse to clients.

### It does not record a card a client holds without attestation

Held cards are recorded with per-row provenance rather than assumed.
`held-cards.service.ts` records how each card's date was established, because the
5/24 answer is only as good as the weakest row it was computed from. `gaps.md` §7
covers this.

### Other endpoints that refuse (501)

Twelve in total. Each states why in its response body rather than failing silently:

| endpoint | refuses because |
|---|---|
| `POST /compliance/disclosures/:id/file` | nothing files a disclosure; no submission path and no table |
| `POST /declines/:id/reminder` | nothing schedules or delivers reapply reminders |
| `PATCH /platform/offboarding/:id/advance` | stage moves when the export or task completes, not directly |
| `POST /platform/billing/send-overdue-reminders` | nothing queues or sends them |
| `POST /platform/integrations/:id/connect` | used to answer 200 reporting connected, from a held value |
| `POST /platform/integrations/:id/test` | same |
| `GET /platform/crm/mrr-trend` | — |
| `GET /rewards/:clientId/points-balances` | nothing records points or cash back |
| `POST /rewards/:clientId/export` | exported those same balances as a document. Refused 2026-09-01 |
| `POST /spend-governance/export-evidence` | returned an EVIDENCE report whose every figure — 142 transactions, three named violations with merchants and amounts — was written into the handler. Refused 2026-09-01 |
| `POST /statements/anomalies/:id/dismiss` | anomalies are derived and carry no id |
| `POST /statements/anomalies/:id/steps/:step` | same |

---

## 3. Module inventory

**95 route files, 72 page files.** Grouped into 16 domains. `State` uses the
`CapabilityState` vocabulary shipped in `components/ui/capability-state.tsx` —
`built`, `partial`, `not_built` — corresponding to the runtime states
`no_data` / `failed` / `not_built` a surface can render.

Detail per route file is in the appendix.

| # | Domain | Routes | State | Depth | Note |
|---|---|---|---|---|---|
| 1 | Auth, tenancy, 2FA | `auth`, `two-factor`, `tenant-lookup`, `admin` | built | grouped | TOTP tolerance corrected 2026-08-08; replay guard keyed on the token's step |
| 2 | Clients & CRM | `clients`, `client-detail`, `crm`, `portal` | built | grouped | |
| 3 | Applications | `applications`, `application`, `application-detail` | built | grouped | validated transitions; `approvedCreditLimit` captured at approval |
| 4 | Declines & recovery | `decline-actions`, `decline-recovery`, `restack` | partial | inspected | reapply reminder is 501 |
| 5 | Funding rounds | `funding-round`, `-actions`, `-detail`, `graduation`, `readiness` | built | grouped | graduation gates depend on advisor-supplied SBSS |
| 6 | Optimizer & simulation | `optimizer`, `optimizer-v2`, `optimizer-actions`, `simulator`, `suitability`, `suitability-engine`, `cost-calculator` | built | grouped | cooldowns declare researched vs default; simulator result presentation rebuilt 2026-08-08 |
| 7 | Credit & bureaus | `credit`, `credit-builder`, `credit-union`, `kyb-kyc` | partial | grouped | no bureau pull; SBSS is an input |
| 8 | Compliance | `compliance`, `comm-compliance`, `regulatory`, `governance`, `acknowledgment`, `consent` | partial | inspected | score derived from risk level, not pass/fail; disclosure filing 501 |
| 9 | Complaints | `complaints` | built | inspected | five-state machine incl. `escalated`; single validated write path since 2026-08-08 |
| 10 | Documents & signature | `document`, `document-gen`, `docusign`, `contracts` | built | grouped | |
| 11 | Billing | `billing`, `stripe` | partial | grouped | overdue reminders 501; no usage metering |
| 12 | Statements & spend | `statements`, `spend-governance` | partial | inspected | JSON-only import; anomaly dismissal 501; risk summary rebuilt 2026-08-07 |
| 13 | Repayment & hardship | `repayment`, `hardship`, `ach` | built | grouped | no money movement |
| 14 | Rewards & benefits | `rewards`, `card-benefits` | partial | inspected | points balances 501 |
| 15 | Tax | `tax`, `tax-reports` | not_built | inspected | all four document endpoints refuse |
| 16 | Platform & integrations | `platform`, `platform-*` (5), `workflow`, `issuer-rules`, `partners`, `integrations`, `webhooks`, `sms-webhooks`, `voiceforge`, `visionaudioforge` | partial | inspected | workflows persist but never execute; issuer directory rebuilt on sourced rules |
| — | Dashboard aggregators | `dashboard*` (16 files) | built | asserted | behaviour stated in their own headers; not re-derived here |
| — | Infrastructure | `health`, `notifications`, `activity`, `chat`, `openapi`, `index`, `_stub-response` | built | grouped | `openapi` inspected — js-yaml production fix 2026-08-07 |

---

## 4. Data model

**72 Prisma models** in `prisma/schema.prisma`.

### A constraint Prisma cannot express

```sql
ALTER TABLE "card_applications"
  ADD CONSTRAINT "approved_limit_requires_approval"
  CHECK ("approvedCreditLimit" IS NULL OR status = 'approved');
```

Prisma's schema language has no CHECK constraint. This lives only in
`prisma/migrations/20260808150000_card_application_approved_credit_limit/migration.sql`
and is invisible to `prisma migrate diff` — a generated migration could drop it
while every other test passed.

`tests/integration/approved-credit-limit-constraint.test.ts` fails instead. The
coupling is stated in three places — schema comment, migration, test — so whoever
finds one finds the others. **Verified by dropping the constraint and confirming
three assertions fail.**

### Identifier spaces that are not foreign keys

Three, and each is a place where a join is a decision rather than a schema fact.

**`CardApplication.issuer` is free text.** Resolution goes through
`parseIssuer()` (`src/shared/constants/issuers.ts:161`), which returns `null`
rather than guessing — its own doc records why: *"the habit of defaulting is what
put a 30-day cooldown on issuers nobody had looked up."* The resolved registry id
joins `Issuer.registryId`.

**`Issuer.slug` and the registry id are different spellings.** The registry uses
underscores (`us_bank`, `first_tech`); `slug` uses hyphens (`us-bank`,
`first-tech`). These diverged silently for all seven banks before credit unions
were added. `Issuer.registryId` now records the mapping as data.

**Held card resolution** carries per-row provenance rather than assuming a match,
because the 5/24 tally is only as good as the weakest row.

### Two columns that look like one

| column | is | populated on |
|---|---|---|
| `CardApplication.creditLimit` | the amount **requested at draft** | every row incl. declines |
| `CardApplication.approvedCreditLimit` | the limit **actually granted** | approvals only, enforced |

`creditLimit` is written once by `create()` and never touched by the decision
transition, so it sits on declined applications — 20000 on a Bank of America
decline, 18000 on US Bank, 12000 on Wells Fargo, none granted. Recorded as
`gaps.md` §8.

### Tables with no writer

`gaps.md` §3 tracked these; most were resolved 2026-08-07. `seed-full.ts` remains
a seed module nothing runs, describing ten statement records that have never
existed — `docs/backlog/seed-files-nothing-runs.md`.

---

## 5. Architectural standards

Written as requirements a future Forge inherits. Each states the defect it exists
to prevent — a rule without its incident gets relaxed by whoever finds it
inconvenient.

### 5.1 Computed output carries its provenance

A derived figure ships how it was derived.

**Prevents:** a 30-day cooldown applied to issuers nobody researched, rendered
identically to Chase's published 2/30. `ISSUER_COOLDOWNS` now tags every entry
`issuer_rule` or `unresearched_default`. `IssuerRule` carries `sourceUrl`,
`sourceNote` and `lastVerified`; the Issuer Directory shows *"8 without a source"*
rather than presenting all rules as equally established.

### 5.2 Third states are real states

`null`, `unknown` and `unassessable` never collapse into zero or a value.

**Prevents:** `averageRiskScore` summing with `?? 0` over unscored rows, so one
row scoring 95 among nine unscored averaged to 9.5 and read *low*. Also: a
compliance score of 100 for a tenant with no checks — the strongest claim the
endpoint can make, derived from no evidence at all.

Formatters return a marker, not a zero. A real zero must still render as zero;
the two are different answers.

### 5.3 A parse boundary is not a type assertion

A hand-written type describing data the compiler never sees is a claim, not a
check.

**Prevents — three instances, same shape, in one month:**

| where | the fiction | the failure |
|---|---|---|
| `two-factor.service.ts` | `window?: number` on an otplib adapter | option ignored; **zero** clock tolerance in production |
| `spend-governance/page.tsx` | `riskLevelBasis` declared required | `.length` threw; whole route to the error boundary |
| `platform/issuers/page.tsx` | four fields the API never sent | `.length` threw on every row expansion |

In each case `tsc` passed. Declare optional what a server may omit; validate at
the boundary; and remember that **root `tsc --noEmit` does not type-check
`src/frontend`** — only `npm run build` does.

### 5.4 Invalid states unrepresentable

Push the rule into the type or the database, not into convention.

**Prevents:** a complaint moving `closed → open`, which `VALID_TRANSITIONS`
forbids and a second write path allowed. A granted credit limit sitting on a
decline, which the CHECK constraint now refuses. A recommendation whose
justification contradicts its own scores, which a discriminated union
(`clear | tied | overridden`) makes the caller handle.

### 5.5 Honest empty states

Three states, distinguishable at a glance: `not_built`, `no_data`, `failed`.

**Prevents:** three separate pages being read as broken because an honest empty
state rendered as a blank page with explanatory prose. The state is text, not
colour alone.

### 5.6 Report the denominator

Never a bare rate where the sample is small or unstated.

**Prevents:** `chargebackRatio` reporting 0.5 — computed as `flagged / total` from
a denominator of **two**, rendering identically to 0.5 from 200, and forcing
`riskLevel: critical` on any book under 100. The Issuer Directory shows *"1 of 1
approved"* and suppresses rates entirely below 20 decided applications, because
below that one decision moves the rate five points or more.

### 5.7 A check that reports nothing has either found nothing or not run

Those are different results, and a checker must distinguish them.

**Prevents:** `tests/e2e` — six suites, 81 assertions — that no CI job ran until
2026-08-07. `check:prod-imports` prints its scanned-file count for this reason.
And in this month's own tooling: a merge script that read a rate-limited API error
as "build failed" and blocked a green merge, and one that reported "0 hits" from a
flag that made the linter error out.

### 5.8 Look for a value on a row whose state should make it impossible

A search heuristic, not a bug report. It found three defects:

- a **credit limit on a declined application** — the column was the requested
  amount, not the granted one
- an **`mfaEnabled` flag with no secret** — an enrolment that could lock an
  account out of a factor it never had
- a **suspension timestamp with no suspension**

Ask what a field *means* when the row's state should forbid it. A wrong quantity
under a right-sounding name passes every existence check.

---

## 6. Open decisions

Product questions, not defects. Each needs an owner's answer before code.

| # | Question | Source |
|---|---|---|
| 1 | What should the compliance score mean? "Passed" is currently `riskLevel` low-or-medium; medium subtracts nothing, so a Medium finding scores 100 | inspected |
| 2 | Is there an SLA policy? The 30-day deadline is synthesized as `createdAt + 30d` on every read, with no stored deadline and no per-severity variation | `complaint-status-vocabularies.md` |
| 3 | How do complaint `category`/`source` map to the canonical enums? The intake form offers values the enums reject | same |
| 4 | A third status vocabulary exists in `app/complaints/page.tsx` over the same column | same |
| 5 | What triggers a DNA flag, at what minimum sample, cleared by whom? | `issuer-dna-flag-derivation.md` |
| 6 | Do the six credit unions have any published velocity rule? None found; all six ship `0 of 0 sourced` | `issuer-velocity-rule-research.md` |
| 7 | Delete `seed-full.ts` or wire it up? | `seed-files-nothing-runs.md` |
| 8 | Should workflows execute, and if so what runs them? | inspected |
| 9 | The flagged-transaction seed writes a reason the service cannot produce from any rule it has | `spend-governance-underived-flags.md` |
| 10 | `gaps.md` §2, §4, §6 remain open — absent-not-zero figures, integrations that fail closed, advisory content gated on the unobtainable | `gaps.md` |

---

## Appendix A — Route file inventory

95 files. Depth per domain as stated in section 3; individual files inherit their
domain's depth unless noted.

**Auth & tenancy (4)** — `auth`, `two-factor`, `tenant-lookup`, `admin`
**Clients (4)** — `clients`, `client-detail`, `crm`, `portal`
**Applications (3)** — `applications`, `application`, `application-detail`
**Declines (3)** — `decline-actions`, `decline-recovery`, `restack`
**Funding rounds (5)** — `funding-round`, `funding-round-actions`, `funding-round-detail`, `graduation`, `readiness`
**Optimizer (7)** — `optimizer`, `optimizer-v2`, `optimizer-actions`, `simulator`, `suitability`, `suitability-engine`, `cost-calculator`
**Credit (4)** — `credit`, `credit-builder`, `credit-union`, `kyb-kyc`
**Compliance (6)** — `compliance`, `comm-compliance`, `regulatory`, `governance`, `acknowledgment`, `consent`
**Complaints (1)** — `complaints`
**Documents (4)** — `document`, `document-gen`, `docusign`, `contracts`
**Billing (2)** — `billing`, `stripe`
**Statements & spend (2)** — `statements`, `spend-governance`
**Repayment (3)** — `repayment`, `hardship`, `ach`
**Rewards (2)** — `rewards`, `card-benefits`
**Tax (2)** — `tax`, `tax-reports`
**Platform (12)** — `platform`, `platform-data-lineage`, `platform-extended`, `platform-offboarding`, `platform-portfolio`, `platform-reports`, `workflow`, `issuer-rules`, `partners`, `integrations`, `webhooks`, `sms-webhooks`
**Vendor surfaces (2)** — `voiceforge`, `visionaudioforge`
**Dashboard (16)** — `dashboard`, `dashboard-index`, `dashboard-events`, `dashboard-action-queue`, `dashboard-active-rounds`, `dashboard-apr-expiry`, `dashboard-committee`, `dashboard-compliance-deadlines`, `dashboard-consent`, `dashboard-kpi`, `dashboard-nav-counts`, `dashboard-payments`, `dashboard-recent-applications`, `dashboard-restack`, `dashboard-risk-matrix`, `dashboard-voiceforge`
**Other (13)** — `health`, `notifications`, `activity`, `chat`, `openapi`, `index`, `_stub-response`, `financial`, `onboarding`, `payment-reminders`, `portfolio-health`, `deal-committee`, `simulator`

---

## Appendix B — Where this document disagrees with its predecessors

| claim | source | codebase | resolution |
|---|---|---|---|
| "All 61 Modules" | `all-modules.md` title | 95 route files, 72 pages | count from a plan; superseded |
| 15 MVP modules | `mvp-modules.md` | — | narrower plan snapshot; superseded |
| Four-pillar taxonomy | `all-modules.md` | no pillar appears in any path or route name | organisational fiction; replaced by 16 domains from actual paths |
| Rewards balances | implied capability | 501 | never built |
| Tax documents | implied capability | four 501s | never built |
| Workflow automation | implied capability | persists, never executes | no runner exists |

Nothing above was dropped silently. Where a previous claim no longer holds, the
replacement is named.
