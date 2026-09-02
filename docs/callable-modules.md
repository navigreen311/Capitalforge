# Callable modules

What a Village OS agent can be granted, as module ids, with the trust each one
should carry. One entry per module id; a grant names an id, so an id has to be
the smallest thing worth granting on its own.

This file is written surface by surface as each is swept. It is **not** a
complete list of what the API exposes — it is the list of what has been read
closely enough to be granted. An endpoint absent from this file has not been
reviewed for grantability, which is different from being forbidden.

## The two rules this file exists to enforce

**1. A module id groups calls that share a blast radius, not calls that share a
URL prefix.** Two endpoints under one router can be a read and an outbound
email, and one grant covering both is a grant nobody can reason about.

**2. Path depth is not evidence of blast radius.** This is the same mistake one
level down, and it nearly happened here.

Splitting the client reads, `/credit/*` looked like a natural group *because of
the path* — and it happens to be one. But `/timeline` sits at the top level
beside `/`, and belongs with `/owners`: its ledger payloads carry consent
evidence references and IP addresses. `/repayment` also sits at the top level,
and belongs with the business facts. Grouping by prefix would have put
`/timeline` in the wrong module and nothing would have failed.

Depth tells you how a URL was designed. Blast radius is what the response
contains and what a holder of the grant can then do. Derive the second from
reading the responses, and check the first only to see whether it happens to
agree.

---

## Client surface — `/api/clients/:clientId` (and `/api/v1/clients/:clientId`)

Sixteen handlers on one router, split into four module ids.

**Tenancy, true of all four:** `requireOwnedBusiness('clientId')` is installed
in `api/routes/index.ts` before this router, so every handler is reachable only
for a client in the caller's tenant. That is a property of the mount table, not
of any handler — individual handlers vary in whether they also filter on
`tenantId`, and reading one in isolation will not tell you it is scoped.

**Both mounts are the same router.** `/api/clients/:clientId` and
`/api/v1/clients/:clientId` are aliases. A registry naming one will not stop
calls to the other.

### The client reads — three ids, not one

Thirteen GETs. They were one module id until 2026-09-02, when the same mistake
that separated the reads from the writes turned out to exist one level down:
`GET /` returns a legal name, `/owners` returns dates of birth and `/credit/*`
returns bureau data, and one grant covered all three.

| | |
|---|---|
| Reads | Business, BusinessOwner, ProductAcknowledgment, AchAuthorization, CreditProfile, RepaymentPlan, CardApplication, ComplianceCheck, Document |
| Writes | nothing |
| Idempotency | natural |
| Suggested tier | `auto_execute` |

**What a manual has to carry:**

- **`GET /credit/history` requires `profileType`.** Not defaulted, deliberately.
  Personal and business scores run on different scales — FICO 300-850, PAYDEX
  0-100 — and this used to return both in one series, so a caller plotting one
  axis saw a PAYDEX 80 beside a FICO 762 and read a 682-point collapse. A call
  without it fails, and it is the likeliest first-call error in this module.
- **`GET /ach-authorization` returns 404 when none is on file.** The client
  exists — the mount guard already proved that — so this 404 means "no
  authorisation", not "no such client". Returning a fabricated active
  authorisation for a client who never signed one is a compliance problem, not
  a cosmetic one, which is why it refuses rather than inventing.
- **`GET /owners` returning `[]` is a real answer**, not an error.
- **`GET /credit/recommendations` carries no point-impact estimates.**
  Predicting a score change needs a model this system does not have. With no
  credit pull on record it returns `[]` with
  `basis: 'no_credit_profile_on_record'` rather than recommendations.

### The three read modules

Built 2026-09-02. The boundary is **whether the response is regulated data
about a natural person** — not whether it is sensitive in general. That is a
line a reviewer can apply without judgement calls, and it maps onto compliance
entries that already exist.

| Id | Permission | Endpoints |
|---|---|---|
| `client_read` | `business:read` | `/`, `/documents`, `/acknowledgments`, `/compliance`, `/compliance/status`, `/repayment` |
| `client_read_pii` | `business:read` + `business:read:pii` | `/owners`, `/timeline`, `/ach-authorization` |
| `client_read_credit` | `business:read` + `business:read:credit` | `/credit/business`, `/credit/personal`, `/credit/history`, `/credit/recommendations` |

`business:read` stays on the router as a floor, so a handler added tomorrow
inherits a gate rather than inheriting nothing — which is how this router came
to have no gate at all.

**`/ach-authorization` is in the PII module by decision, not by category.**
Formally it is an authorisation against a business account. On a small business
the owner and the business are effectively the same person, and personal
guarantees are everywhere in this venture, so the formal distinction does not
survive contact with the product.

#### Tiers — all three `auto_execute`

| Id | Tier | Reasoning |
|---|---|---|
| `client_read` | `auto_execute` | Business facts the firm recorded about its own engagement. |
| `client_read_pii` | `auto_execute`, **narrow grants only** | Still a read, so the act is safe; the exposure is the breadth of who holds the grant. |
| `client_read_credit` | `auto_execute`, **narrow grants only** | Same, plus a downstream constraint: this data may never be attached to a lender packet or rendered as Burkham's own assertion of creditworthiness. |

**None of the three is `propose`, and the reasoning generalises.** Making a
read wait for a human is a control that trains people to approve without
looking, and it does not reduce what the grant holder can see — the grant
already decided that. For a read, the control is **who holds the grant**, not
what happens when it runs. Reserve `propose` for calls that change something or
reach somebody.

#### Who holds them

`business:read:pii` and `business:read:credit` go to super admin, tenant admin,
compliance officer and advisor. **They are deliberately withheld from
`readonly` and `client`** — both previously reached dates of birth and bureau
data with exactly the same permission as an advisor, because one permission
covered a legal name and a social security number alike. If a client portal
turns out to need its own owners, that is a grant to add deliberately, and it
will be visible as one.

### `client_profile_update`

`PATCH /` — business profile fields only.

| | |
|---|---|
| Writes | Business, on an explicit column allowlist |
| Idempotency | natural |
| Suggested tier | `propose` |

`UPDATABLE_BUSINESS_FIELDS` is the contract. `tenantId` is absent by design; so,
as of 2026-09-02, are `fundingReadinessScore`, `advisorId` and `status` — see
below.

### `client_reassign` — NOT BUILT

Reassigning a client to a different advisor (`advisorId`), and changing a
client's status (`status`).

Both were writable through `PATCH /`, so they rode on the same grant as reading
a client's name. They are real operations and neither is a lookup, so they are
out of the allowlist and belong here — but **no endpoint exists**, because
nothing calls one: the edit-profile form sends twelve fields and none of these.
Building an unused surface would be inventing a capability rather than
recording one.

`status` in particular needs design before it gets an endpoint: it interacts
with offboarding, where `PATCH /platform/offboarding/:id/advance` is
deliberately refused on the grounds that advancing a stage by hand is how a
workflow comes to claim a deletion that never ran.

### `client_compliance_run`

`POST /compliance/run` — runs a compliance check and persists the result.

| | |
|---|---|
| Writes | ComplianceCheck |
| Idempotency | **none** — each call persists a new check |
| Suggested tier | `propose` |

### `client_consent_request` — SENDS OUTBOUND EMAIL

`POST /consent/request` — emails a re-consent request to a beneficial owner.

| | |
|---|---|
| Writes | nothing in the database; **sends mail to a client** |
| Idempotency | **none** — retrying a timeout re-sends |
| Suggested tier | `propose` at most; `suggest` is defensible |

**This is the reason the surface is split.** One grant previously covered both
this and `GET /` — reading a client's name and mailing that client are not the
same act, and a retry that is harmless for one is a second email to a client for
the other.

It refuses with `NO_OWNER_ON_FILE` (422) when no beneficial owner is recorded
and no `recipientEmail` was supplied. Until 2026-09-02 it asserted an owner
existed and crashed on a state `GET /owners` calls valid.

---

## Compliance evidence — two artefacts, two module ids

Both were exported as a type called `ComplianceManifest`, from two services,
with completely different shapes, distinguished only by which file a route
imported from. Both were described to their callers as the artefact handed to
counsel. Renamed 2026-09-02 to `ComplianceManifest` and `RegulatorDossier`.

**Rule 1 splits them regardless of the name.** They differ in blast radius, and
the difference is the whole of it: one writes nothing but its own audit trace,
the other mints an id and creates an artefact of record.

### `compliance_manifest_assemble`

`GET /api/documents/export/:businessId` — everything compliance-relevant on
file for one **business**: consents, acknowledgments, applications with adverse
-action notices, fee schedules, ACH authorisations, suitability checks,
compliance checks, document references, and the attributable ledger events.

| | |
|---|---|
| Key | a business |
| Permission | `compliance:read` |
| Writes | **one ledger event** — `compliance.manifest.assembled` — and nothing else |
| Idempotency | safe to retry; a retry adds a second assembly event, which is true |
| Suggested tier | `auto_execute` |

Declares `contents: 'references'`, `excludedRecordTypes` with reasons,
`filteredFields` (four different date columns behind one `since`), a
`ledgerScopeNote`, and `documentsVerified` / `documentsUnverifiable` /
`timestampsTampered`. Refuses an unreadable or inverted date range (400) and a
requester who does not resolve (400), because `assembledBy` on a document read
by counsel cannot name nobody.

Until 2026-09-02 it left **no trace at all** that a client's whole compliance
file had been assembled.

### `regulator_dossier_export` — WRITES AN ARTEFACT OF RECORD

`POST /api/regulator/inquiries/:id/export-dossier` — the subset relevant to one
**regulatory inquiry**: documents, complaints, consents, compliance checks, ACH
authorisations, and the legal-hold summary.

| | |
|---|---|
| Key | a regulatory inquiry |
| Permission | `compliance:read` |
| Writes | a `regulatoryDossierExport` row **and** a `regulator.dossier.exported` ledger event |
| Idempotency | **none** — every call mints a new `exportId` |
| Suggested tier | `propose` |

**`at_most_once`.** A retry after a timeout produces a second export of the same
inquiry, and the audit trail then shows two. On an evidence artefact that is
exactly the thing to escalate rather than retry: "the dossier we sent on the
14th" has to resolve to one row.

Refuses with 422 `INQUIRY_HAS_NO_BUSINESS` when the inquiry exists but nothing
is attached — deliberately not a 404, because "no such inquiry" and "nothing
attached to it" are different facts and must not share a response. 404 for an
unknown inquiry; 400 `UNKNOWN_REQUESTER` for an id that resolves to nobody.

**It carries less than its sibling and now says so.** `excludedRecordTypes`
names product acknowledgments, card applications, fee schedules, suitability
checks and the ledger — all carried by `compliance_manifest_assemble` and none
carried here. Without that list a reader cannot tell an omitted record type from
one that is empty for the business, on the artefact that goes to a regulator.

**Neither contains a document.** Both carry `storageKey`, `sha256Hash` and
`cryptoTimestamp`; nothing in this repository fetches a byte or builds an
archive. The manifest route sets `Content-Disposition: attachment`, so a browser
saves a file that looks like a deliverable. Whether either should assemble real
bytes is recorded in `docs/gaps.md`, not assumed.

---

## Not yet swept

Every other route file. Absence from this document means unreviewed, not
forbidden — and a module id that does not appear here should not be granted
until it does.
