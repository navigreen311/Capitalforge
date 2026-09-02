# Callable modules

What a Village OS agent can be granted, as module ids, with the trust each one
should carry. One entry per module id; a grant names an id, so an id has to be
the smallest thing worth granting on its own.

This file is written surface by surface as each is swept. It is **not** a
complete list of what the API exposes — it is the list of what has been read
closely enough to be granted. An endpoint absent from this file has not been
reviewed for grantability, which is different from being forbidden.

**The rule this file exists to enforce:** a module id groups calls that share a
blast radius, not calls that share a URL prefix. Two endpoints under one router
can be a read and an outbound email, and one grant covering both is a grant
nobody can reason about.

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

### `client_read`

Thirteen GETs: profile, owners, acknowledgments, ACH authorisation, business
credit, personal credit, credit history, credit recommendations, repayment,
timeline, compliance, compliance status, documents.

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

### PROPOSED — splitting `client_read` again

**Not built. This is a proposal.**

`client_read` was split off from three writes because a grant covering both
reading a client's name and mailing that client is a grant nobody can reason
about. The same mistake exists one level down, inside `client_read`: **`GET /`
returns a legal name; `/owners` returns dates of birth and `/credit/*` returns
bureau data, and one grant covers all three.**

As of 2026-09-02 the router requires `business:read` and nothing finer, so the
permission system does not separate them either. The floor is now in place; the
ceiling is this proposal.

#### The boundary

The line is **whether the response is regulated data about a natural person**,
not whether it is sensitive in general. That is a boundary a reviewer can apply
without judgement calls, and it maps onto compliance entries that already
exist.

| Proposed id | Endpoints | Why together |
|---|---|---|
| `client_read` | `/`, `/documents`, `/acknowledgments`, `/compliance`, `/compliance/status`, `/repayment`, `/ach-authorization` | Business-level facts and the firm's own records about the engagement. No bureau data, no personal identifiers beyond the business itself. |
| `client_read_pii` | `/owners`, `/timeline` | Natural-person identifiers. `/owners` returns dates of birth, addresses and `ssnLast4`; `/timeline` returns ledger payloads carrying consent evidence references and IP addresses. Governed by `compliance/consumer-privacy-rights-v1`. |
| `client_read_credit` | `/credit/business`, `/credit/personal`, `/credit/history`, `/credit/recommendations` | Bureau-derived data, governed by `compliance/bureau-report-handling-v1`, which already restricts what may be done with it downstream. |

#### Tiers

| Id | Tier | Reasoning |
|---|---|---|
| `client_read` | `auto_execute` | Business facts the firm recorded about its own engagement. |
| `client_read_pii` | `auto_execute`, **narrow grants only** | Still a read, so the act is safe; the exposure is the breadth of who holds the grant. The control is who gets it, not what happens when it runs. |
| `client_read_credit` | `auto_execute`, **narrow grants only** | Same, plus a downstream constraint the manual already carries: this data may never be attached to a lender packet or rendered as Burkham's own assertion of creditworthiness. |

None of the three should be `propose`. Making a read wait for a human is a
control that trains people to approve without looking, and it does not reduce
what the grant holder can see — the grant already decided that.

#### What it costs

- **Three permissions**, not one. `business:read`, `business:read:pii`,
  `business:read:credit`, applied per handler rather than to the router. Under
  an hour.
- **Three module ids** in the registry, and any existing `client_read` grant
  has to be re-issued as one, two or three.
- **`/ach-authorization` is the debatable one.** It returns bank authorisation
  details for a business, not a natural person, so it sits in `client_read`
  above — but an account authorisation reads as personal to most people. If it
  moves, it moves to `client_read_pii`.

#### What I would not do

**Do not split by URL depth or by tab.** `/credit/*` looks like a natural group
because of the path, and it happens to be one here — but `/timeline` sits at
the top level and belongs with `/owners`, while `/repayment` sits at the top
level and belongs with the business facts. Grouping by prefix is the mistake
this whole exercise exists to correct, and it would have put `/timeline` in the
wrong module.

---

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

## Not yet swept

Every other route file. Absence from this document means unreviewed, not
forbidden — and a module id that does not appear here should not be granted
until it does.
