# CapitalForge — API Reference

**Base URL:** `http://localhost:4000/api` (development)

**Authentication:** All endpoints except those marked `Public` require a valid Bearer JWT access token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

**Tenant Context:** Taken from the access token. There is no tenant header.

`X-Tenant-ID` is ignored. It was previously honoured as a fallback, which let
a caller read and write another tenant's data by setting it — sending it now
has no effect, and no endpoint requires it.

**Response Envelope:**

All responses conform to the `ApiResponse` envelope:

```json
{
  "success": true,
  "data": { ... }
}
```

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { }
  }
}
```

---

## Contents

- [Health](#health)
- [Authentication](#authentication)
- [Businesses](#businesses)
- [Business Owners](#business-owners)
- [Credit Profiles](#credit-profiles)
- [Funding Readiness](#funding-readiness)
- [Leverage Calculator](#leverage-calculator)
- [Funding Rounds](#funding-rounds)
- [Card Applications](#card-applications)
- [Client Detail](#client-detail)
- [Credit Builder](#credit-builder)
- [Client Portal](#client-portal)
- [Payment Reminders and SMS](#payment-reminders-and-sms)
- [Suitability](#suitability)
- [Consent](#consent)
- [Product Acknowledgments](#product-acknowledgments)
- [ACH Authorizations](#ach-authorizations)
- [Compliance Checks](#compliance-checks)
- [Documents](#documents)
- [Audit Ledger](#audit-ledger)
- [Admin](#admin)

---

## Health

### GET /api/health

Public health check. Returns system status and uptime.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/health` |
| Auth Required | No |

**Response 200**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "2.0.0",
    "uptime": 3600,
    "timestamp": "2026-03-31T00:00:00.000Z",
    "services": {
      "database": "ok",
      "redis": "ok"
    }
  }
}
```

---

## Authentication

### POST /api/auth/register

Register a new user account under an existing tenant. `SUPER_ADMIN` role cannot be self-registered.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/auth/register` |
| Auth Required | No |

**Request Body**
```json
{
  "email": "advisor@example.com",
  "password": "Str0ng!Pass#2026",
  "firstName": "Jane",
  "lastName": "Doe",
  "tenantId": "uuid",
  "role": "advisor"
}
```

**Response 201** — `{ user, accessToken, refreshToken }`

---

### POST /api/auth/login

Authenticate and receive an access/refresh token pair.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/auth/login` |
| Auth Required | No |

**Request Body**
```json
{
  "email": "advisor@example.com",
  "password": "Str0ng!Pass#2026",
  "tenantId": "uuid"
}
```

**Response 200** — `{ user, accessToken, refreshToken }`

---

### POST /api/auth/refresh

Rotate the refresh token and issue a new access/refresh pair. Discard the old refresh token immediately.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/auth/refresh` |
| Auth Required | No |

**Request Body**
```json
{ "refreshToken": "..." }
```

**Response 200** — `{ accessToken, refreshToken }`

---

### POST /api/auth/logout

Invalidate the current refresh token. Access tokens expire naturally (15 min).

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/auth/logout` |
| Auth Required | Yes |

**Request Body**
```json
{ "refreshToken": "..." }
```

**Response 200** — `{ loggedOut: true }`

---

## Businesses

### POST /api/businesses

Create a new business record and begin onboarding.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/businesses` |
| Auth Required | Yes |
| Required Permission | `business:write` |

**Request Body**
```json
{
  "legalName": "Acme Corp LLC",
  "dba": "Acme Corp",
  "ein": "12-3456789",
  "entityType": "llc",
  "stateOfFormation": "DE",
  "dateOfFormation": "2020-01-15",
  "mcc": "7372",
  "industry": "Software",
  "annualRevenue": 500000,
  "monthlyRevenue": 41666,
  "advisorId": "uuid"
}
```

**Response 201** — `{ business }`

---

### GET /api/businesses

List all businesses within the tenant (paginated).

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Query Parameters:** `page`, `pageSize`, `status`, `advisorId`

**Response 200** — `{ businesses: [...], total, page, pageSize }`

---

### GET /api/businesses/:id

Get a single business by ID.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Response 200** — `{ business }`

---

### PATCH /api/businesses/:id

Update business record fields (partial update).

| Field | Value |
|-------|-------|
| Method | `PATCH` |
| Path | `/api/businesses/:id` |
| Auth Required | Yes |
| Required Permission | `business:write` |

**Response 200** — `{ business }`

---

## Business Owners

### POST /api/businesses/:id/owners

Add a beneficial owner to a business.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/businesses/:id/owners` |
| Auth Required | Yes |
| Required Permission | `business:write` |

**Request Body**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "ownershipPercent": 51.0,
  "ssn": "XXX-XX-1234",
  "dateOfBirth": "1980-06-15",
  "address": { "street": "123 Main St", "city": "Austin", "state": "TX", "zip": "78701" },
  "isBeneficialOwner": true
}
```

**Response 201** — `{ owner }`

---

### GET /api/businesses/:id/owners

List all beneficial owners for a business.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/owners` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Response 200** — `{ owners: [...] }`

---

## Credit Profiles

### POST /api/businesses/:id/credit-profiles

Ingest a new credit profile for a business (from bureau pull or manual entry).

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/businesses/:id/credit-profiles` |
| Auth Required | Yes |
| Required Permission | `business:write` |

**Request Body**
```json
{
  "profileType": "personal",
  "bureau": "experian",
  "score": 740,
  "scoreType": "fico",
  "utilization": 0.18,
  "inquiryCount": 2,
  "derogatoryCount": 0,
  "tradelines": [...],
  "pulledAt": "2026-03-31T00:00:00.000Z"
}
```

**Response 201** — `{ creditProfile }`

---

### GET /api/businesses/:id/credit-profiles

List all credit profiles for a business.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/credit-profiles` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Query Parameters:** `bureau`, `profileType`

**Response 200** — `{ profiles: [...] }`

---

### GET /api/businesses/:id/credit-profiles/latest

Get the most recent profile per bureau for a business.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/credit-profiles/latest` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Response 200** — `{ profiles: { experian: {...}, transunion: {...}, equifax: {...}, dnb: {...} } }`

---

## Funding Readiness

### POST /api/businesses/:id/readiness-score

Compute and persist a new funding readiness score.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/businesses/:id/readiness-score` |
| Auth Required | Yes |
| Required Permission | `business:write` |

**Response 201** — `{ score, factors, recommendations }`

---

### GET /api/businesses/:id/readiness-score/latest

Get the most recently computed readiness score.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/readiness-score/latest` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Response 200** — `{ score, factors, recommendations, computedAt }`

---

## Leverage Calculator

### POST /api/businesses/:id/cost-calculations

Compute a new total cost of capital calculation for a proposed program.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/businesses/:id/cost-calculations` |
| Auth Required | Yes |
| Required Permission | `business:write` |

**Request Body**
```json
{
  "programFees": 5000,
  "percentOfFunding": 0.05,
  "annualFees": 1200,
  "cashAdvanceFees": 0,
  "processorFees": 600,
  "targetCreditAmount": 100000
}
```

**Response 201** — `{ calculation }` with `totalCost`, `effectiveApr`, `irc163jImpact`, `bestCaseFlow`, `baseCaseFlow`, `worstCaseFlow`

---

### GET /api/businesses/:id/cost-calculations

List all cost calculations for a business.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/cost-calculations` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Response 200** — `{ calculations: [...] }`

---

### GET /api/businesses/:id/cost-calculations/:calcId

Get a specific cost calculation.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/cost-calculations/:calcId` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Response 200** — `{ calculation }`

---

## Funding Rounds

### POST /api/businesses/:id/funding-rounds

Create a new funding round for a business.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/businesses/:id/funding-rounds` |
| Auth Required | Yes |
| Required Permission | `application:submit` |

**Request Body**
```json
{
  "targetCredit": 100000,
  "targetCardCount": 5,
  "aprExpiryDate": "2027-03-31"
}
```

**Response 201** — `{ fundingRound }`

---

### GET /api/businesses/:id/funding-rounds

List all funding rounds for a business.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/funding-rounds` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Response 200** — `{ rounds: [...] }`

---

### GET /api/businesses/:id/funding-rounds/:roundId

Get a specific funding round with application summary.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/funding-rounds/:roundId` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Response 200** — `{ fundingRound, applications: [...] }`

---

### PATCH /api/businesses/:id/funding-rounds/:roundId

Update a funding round (status, APR expiry date, targets).

| Field | Value |
|-------|-------|
| Method | `PATCH` |
| Path | `/api/businesses/:id/funding-rounds/:roundId` |
| Auth Required | Yes |
| Required Permission | `application:submit` |

**Response 200** — `{ fundingRound }`

---

### GET /api/funding-rounds/:roundId

Round detail with derived progress, addressed by round id alone rather than
nested under a business.

Everything under `progress` is computed from the round's applications at read
time. It is not stored, so it cannot drift from the applications it describes.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/funding-rounds/:roundId` |
| Alias | `/api/v1/funding-rounds/:roundId` |
| Auth Required | Yes |

**Response 200**
```json
{
  "success": true,
  "data": {
    "id": "46f096b0-3ee0-4450-b44b-254908c95eff",
    "businessId": "seed-biz-001",
    "businessName": "Apex Digital Solutions LLC",
    "roundNumber": 1,
    "status": "completed",
    "targetCredit": 150000,
    "targetCardCount": 5,
    "aprExpiryDate": "2026-08-15T00:00:00.000Z",
    "aprExpiryDaysRemaining": 15,
    "alertsSent": { "day60": true, "day30": false, "day15": false },
    "startedAt": "2025-09-01T00:00:00.000Z",
    "completedAt": "2025-10-12T00:00:00.000Z",
    "progress": {
      "applicationCount": 2,
      "approvedCount": 2,
      "declinedCount": 0,
      "pendingCount": 0,
      "creditObtained": 80000,
      "creditRemaining": 70000,
      "targetProgressPct": 53
    },
    "applications": [
      {
        "id": "seed-app-001",
        "issuer": "Chase",
        "cardProduct": "Ink Business Preferred",
        "status": "approved",
        "creditLimit": 45000,
        "introAprExpiry": "2026-10-12T00:00:00.000Z",
        "declineReason": null
      }
    ]
  }
}
```

**Response 404** — `ROUND_NOT_FOUND`, including when the round belongs to
another tenant. The two cases are deliberately indistinguishable: a 403 would
confirm the round exists.

---

### PATCH /api/funding-rounds/:roundId

Update a round's status, targets, or APR expiry date.

| Field | Value |
|-------|-------|
| Method | `PATCH` |
| Path | `/api/funding-rounds/:roundId` |
| Alias | `/api/v1/funding-rounds/:roundId` |
| Auth Required | Yes |

**Response 200** — the updated round, in the shape above.

---

### GET /api/funding-rounds/:roundId/repayment

APR exposure across the cards obtained in the round.

`interestShockAnnualised` is what a full year at the regular APR would cost on
the balances currently carried — the figure that matters when the intro period
lapses. `interestShockBasedOnCards` and `cardsMissingRegularApr` say how much of
the portfolio that total actually covers: a card whose regular APR is unknown is
excluded from the sum rather than assumed to be zero, and the count is how you
tell an accurate total from a partial one.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/funding-rounds/:roundId/repayment` |
| Alias | `/api/v1/funding-rounds/:roundId/repayment` |
| Auth Required | Yes |

**Response 200**
```json
{
  "success": true,
  "data": {
    "roundId": "46f096b0-3ee0-4450-b44b-254908c95eff",
    "businessId": "seed-biz-001",
    "cards": [
      {
        "applicationId": "seed-app-001",
        "issuer": "Chase",
        "cardProduct": "Ink Business Preferred",
        "creditLimit": 45000,
        "introApr": 0,
        "introAprExpiry": "2026-10-12T00:00:00.000Z",
        "daysRemaining": 73,
        "regularApr": 0.2124,
        "annualFee": 95,
        "annualisedInterestAtRegularApr": 96,
        "severity": "ok"
      }
    ],
    "totals": {
      "cardCount": 2,
      "totalCreditLimit": 80000,
      "totalAnnualFees": 95,
      "interestShockAnnualised": 161,
      "interestShockBasedOnCards": 2,
      "cardsMissingRegularApr": 0
    },
    "nextAprExpiry": {
      "applicationId": "seed-app-001",
      "issuer": "Chase",
      "cardProduct": "Ink Business Preferred",
      "creditLimit": 45000,
      "introApr": 0,
      "introAprExpiry": "2026-10-12T00:00:00.000Z",
      "daysRemaining": 73,
      "regularApr": 0.2124,
      "annualFee": 95,
      "annualisedInterestAtRegularApr": 96,
      "severity": "ok"
    }
  }
}
```

`nextAprExpiry` repeats whichever card in `cards` lapses first, so the caller
does not have to sort to find it. The `cards` array above is abbreviated to one
of the two entries the totals describe.

A round with no approved cards returns `cards: []`, zeroed totals and
`nextAprExpiry: null`.

---

### GET /api/funding-rounds/:roundId/timeline

Round history, projected from the canonical ledger.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/funding-rounds/:roundId/timeline` |
| Alias | `/api/v1/funding-rounds/:roundId/timeline` |
| Auth Required | Yes |

**Response 200**
```json
{
  "success": true,
  "data": [
    {
      "id": "652c0528-0ae5-4f60-9ad9-914944700f88",
      "type": "funding_round.completed",
      "aggregateType": "funding_round",
      "aggregateId": "46f096b0-3ee0-4450-b44b-254908c95eff",
      "timestamp": "2026-07-31T02:58:35.562Z",
      "actor": "System",
      "detail": { "businessId": "seed-biz-001", "roundNumber": 1, "totalApproved": 80000 }
    }
  ],
  "meta": { "total": 1 }
}
```

Newest first, capped at 200 events. A round created before the ledger writer
was attached has no events, and returns `[]` — an empty history, not a
placeholder one.

---

### POST /api/funding-rounds/:roundId/export-dossier

Assemble the funding dossier for a round: the business, a summary, the cards
obtained, the cost of carrying them, and the APR timeline.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/funding-rounds/:roundId/export-dossier` |
| Alias | `/api/v1/funding-rounds/:roundId/export-dossier` |
| Auth Required | Yes |

**Response 200**
```json
{
  "success": true,
  "data": {
    "roundId": "46f096b0-3ee0-4450-b44b-254908c95eff",
    "tenantId": "9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b",
    "exportedAt": "2026-07-31T15:28:54.019Z",
    "business": {
      "id": "seed-biz-002",
      "legalName": "Meridian Health & Wellness S Corp",
      "ein": "83-1047299",
      "entityType": "s_corp"
    },
    "summary": {
      "status": "planning",
      "roundNumber": 1,
      "targetCredit": 75000,
      "targetCardCount": 3,
      "applicationCount": 0,
      "approvedCount": 0,
      "declinedCount": 0
    },
    "cards": [],
    "costs": {
      "totalCreditObtained": 0,
      "totalAnnualFees": 0,
      "annualisedInterestAtRegularApr": 0,
      "basedOnCards": 0,
      "cardsMissingRegularApr": 0,
      "advisorFee": null
    },
    "aprTimeline": []
  }
}
```

`advisorFee` is `null` when no fee is recorded against the round. It is not
defaulted to `0`: a fee that has not been entered and a fee of zero are
different facts, and a dossier is read by the client.

Returns JSON, not a file. Rendering is the caller's job.

---

## Card Applications

### POST /api/businesses/:id/applications

Create a new card application (draft state).

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/businesses/:id/applications` |
| Auth Required | Yes |
| Required Permission | `application:submit` |

**Request Body**
```json
{
  "fundingRoundId": "uuid",
  "issuer": "chase",
  "cardProduct": "Ink Business Cash",
  "introApr": 0.0,
  "introAprExpiry": "2027-03-31",
  "regularApr": 0.2299,
  "annualFee": 0,
  "cashAdvanceFee": 0.05
}
```

**Response 201** — `{ application }`

---

### GET /api/businesses/:id/applications

List all card applications for a business.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/applications` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Query Parameters:** `status`, `fundingRoundId`

**Response 200** — `{ applications: [...] }`

---

### GET /api/businesses/:id/applications/:appId

Get a specific card application.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/applications/:appId` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Response 200** — `{ application }`

---

### PATCH /api/businesses/:id/applications/:appId

Update application (status change, decision, adverse action notice).

| Field | Value |
|-------|-------|
| Method | `PATCH` |
| Path | `/api/businesses/:id/applications/:appId` |
| Auth Required | Yes |
| Required Permission | `application:submit` |

**Response 200** — `{ application }`

---

### GET /api/applications/:appId/timeline

Application history, projected from the canonical ledger.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/applications/:appId/timeline` |
| Auth Required | Yes |

**Response 200**
```json
{
  "success": true,
  "data": [],
  "meta": { "total": 0 }
}
```

Each entry carries `id`, `type`, `timestamp`, `actor` and a `detail` object
holding the event payload; newest first, capped at 100.

The example above is not an abbreviation — the seeded applications genuinely
have no ledger events, because they were created before the ledger writer was
attached to this path. An application with no recorded history returns an empty
array rather than a reconstructed one.

Tenant ownership is checked against the application before the ledger is
queried, since the ledger is addressed by aggregate id and would not otherwise
be scoped. A `404 APPLICATION_NOT_FOUND` covers both a missing application and
one belonging to another tenant.

---

## Suitability

### POST /api/businesses/:id/suitability

Run a suitability assessment for a business.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/businesses/:id/suitability` |
| Auth Required | Yes |
| Required Permission | `compliance:write` |

**Response 201** — `{ check }` with `score`, `recommendation`, `noGoTriggered`, `noGoReasons`, `alternativeProducts`, `decisionExplanation`

---

### GET /api/businesses/:id/suitability/latest

Get the most recent suitability check.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/suitability/latest` |
| Auth Required | Yes |
| Required Permission | `compliance:read` |

**Response 200** — `{ check }`

---

### POST /api/businesses/:id/suitability/:checkId/override

Override a no-go determination. Requires supervisor role and documented reason.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/businesses/:id/suitability/:checkId/override` |
| Auth Required | Yes |
| Required Permission | `compliance:write` |
| Required Role | `tenant_admin` or `super_admin` |

**Request Body**
```json
{ "overrideReason": "Client has substantial liquid assets offsetting credit risk. Reviewed and approved by compliance officer." }
```

**Response 200** — `{ check }`

---

## Consent

### POST /api/consent

Capture a new consent record.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/consent` |
| Auth Required | Yes |
| Required Permission | `consent:manage` |

**Request Body**
```json
{
  "businessId": "uuid",
  "channel": "voice",
  "consentType": "tcpa",
  "ipAddress": "203.0.113.42",
  "evidenceRef": "call-recording-id-xyz",
  "metadata": { "callerPhone": "+15125550100" }
}
```

**Response 201** — `{ consent }`

---

### GET /api/businesses/:id/consent

List all consent records for a business.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/consent` |
| Auth Required | Yes |
| Required Permission | `consent:manage` |

**Query Parameters:** `channel`, `consentType`, `status`

**Response 200** — `{ consents: [...] }`

---

### GET /api/consent/:consentId

Get a specific consent record.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/consent/:consentId` |
| Auth Required | Yes |
| Required Permission | `consent:manage` |

**Response 200** — `{ consent }`

---

### DELETE /api/consent/:consentId

Revoke a consent record (soft revocation — record is retained).

| Field | Value |
|-------|-------|
| Method | `DELETE` |
| Path | `/api/consent/:consentId` |
| Auth Required | Yes |
| Required Permission | `consent:manage` |

**Request Body**
```json
{ "revocationReason": "Client requested opt-out via phone" }
```

**Response 200** — `{ consent }` with `status: "revoked"`

---

## Product Acknowledgments

### GET /api/acknowledgment-templates

List all active acknowledgment templates.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/acknowledgment-templates` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Response 200** — `{ templates: [...] }`

---

### GET /api/acknowledgment-templates/:type

Get the current active template for a specific acknowledgment type.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/acknowledgment-templates/:type` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Path Parameters:** `type` — `product_reality` | `fee_schedule` | `personal_guarantee` | `cash_advance_risk`

**Response 200** — `{ template }` with `content`, `version`, `requiredFields`

---

### POST /api/businesses/:id/acknowledgments

Record a signed acknowledgment for a business.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/businesses/:id/acknowledgments` |
| Auth Required | Yes |
| Required Permission | `business:write` |

**Request Body**
```json
{
  "acknowledgmentType": "product_reality",
  "version": "1.2",
  "signedAt": "2026-03-31T14:00:00.000Z",
  "signatureRef": "docvault-uuid",
  "documentVaultId": "docvault-uuid"
}
```

**Response 201** — `{ acknowledgment }`

---

### GET /api/businesses/:id/acknowledgments

List all acknowledgments for a business.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/acknowledgments` |
| Auth Required | Yes |
| Required Permission | `business:read` |

**Response 200** — `{ acknowledgments: [...] }`

---

## ACH Authorizations

### POST /api/businesses/:id/ach-authorizations

Create an ACH debit authorization for a business.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/businesses/:id/ach-authorizations` |
| Auth Required | Yes |
| Required Permission | `ach:manage` |

**Request Body**
```json
{
  "processorName": "Stripe",
  "authorizedAmount": 1500.00,
  "authorizedFrequency": "monthly",
  "signedDocumentRef": "docvault-uuid",
  "authorizedAt": "2026-03-31T14:00:00.000Z"
}
```

**Response 201** — `{ authorization }`

---

### GET /api/businesses/:id/ach-authorizations

List all ACH authorizations for a business.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/ach-authorizations` |
| Auth Required | Yes |
| Required Permission | `ach:manage` |

**Response 200** — `{ authorizations: [...] }`

---

### DELETE /api/ach-authorizations/:authId

Revoke an ACH authorization.

| Field | Value |
|-------|-------|
| Method | `DELETE` |
| Path | `/api/ach-authorizations/:authId` |
| Auth Required | Yes |
| Required Permission | `ach:manage` |

**Response 200** — `{ authorization }` with `status: "revoked"`

---

### POST /api/ach-authorizations/:authId/debit-events

Record a debit event against an authorization (for monitoring).

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/ach-authorizations/:authId/debit-events` |
| Auth Required | Yes |
| Required Permission | `ach:manage` |

**Request Body**
```json
{
  "amount": 1500.00,
  "frequency": "monthly",
  "processedAt": "2026-03-31T08:00:00.000Z"
}
```

**Response 201** — `{ debitEvent }` with `isWithinTolerance`, `flagged`, `flagReason`

---

## Compliance Checks

### POST /api/compliance/udap-check

Run a UDAP/UDAAP compliance scan on content or a template.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/compliance/udap-check` |
| Auth Required | Yes |
| Required Permission | `compliance:write` |

**Request Body**
```json
{
  "content": "Get up to $250,000 in business funding guaranteed!",
  "contentType": "marketing_copy",
  "stateJurisdiction": "CA"
}
```

**Response 201** — `{ check }` with `riskScore`, `riskLevel`, `findings`

---

### GET /api/businesses/:id/compliance-checks

List all compliance checks for a business.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/compliance-checks` |
| Auth Required | Yes |
| Required Permission | `compliance:read` |

**Query Parameters:** `checkType`, `riskLevel`

**Response 200** — `{ checks: [...] }`

---

### PATCH /api/compliance-checks/:checkId/resolve

Mark a compliance finding as resolved.

| Field | Value |
|-------|-------|
| Method | `PATCH` |
| Path | `/api/compliance-checks/:checkId/resolve` |
| Auth Required | Yes |
| Required Permission | `compliance:write` |

**Request Body**
```json
{ "resolution": "Language revised to remove guarantee claim. Approved by compliance officer." }
```

**Response 200** — `{ check }` with `resolvedAt`

---

### GET /api/compliance/1071-export

Export Section 1071 small business lending data in CFPB format.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/compliance/1071-export` |
| Auth Required | Yes |
| Required Permission | `compliance:read` |

**Query Parameters:** `year` (required), `format` (`json` | `csv`)

**Response 200** — CFPB-formatted data file

---

## Documents

### POST /api/documents

Upload a document to the vault.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/documents` |
| Auth Required | Yes |
| Required Permission | `document:write` |
| Content-Type | `multipart/form-data` |

**Form Fields:** `file` (binary), `documentType`, `title`, `businessId` (optional)

**Response 201** — `{ document }` with `id`, `sha256Hash`, `storageKey`, `cryptoTimestamp`

---

### GET /api/documents/:id

Get document metadata and download URL.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/documents/:id` |
| Auth Required | Yes |
| Required Permission | `document:read` |

**Response 200** — `{ document, downloadUrl }`

---

### GET /api/businesses/:id/documents

List all documents for a business.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/businesses/:id/documents` |
| Auth Required | Yes |
| Required Permission | `document:read` |

**Query Parameters:** `documentType`

**Response 200** — `{ documents: [...] }`

---

### DELETE /api/documents/:id

Soft-delete a document (blocked if `legalHold: true`).

| Field | Value |
|-------|-------|
| Method | `DELETE` |
| Path | `/api/documents/:id` |
| Auth Required | Yes |
| Required Permission | `document:write` |

**Response 200** — `{ deleted: true }` or **403** if legal hold is active

---

## Audit Ledger

### GET /api/audit/events

Query the canonical ledger event log (paginated).

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/audit/events` |
| Auth Required | Yes |
| Required Permission | `compliance:read` |

**Query Parameters:** `eventType`, `aggregateType`, `aggregateId`, `from`, `to`, `page`, `pageSize`

**Response 200** — `{ events: [...], total, page, pageSize }`

---

### GET /api/audit/events/:aggregateType/:aggregateId

Get the full event history for a specific aggregate.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/audit/events/:aggregateType/:aggregateId` |
| Auth Required | Yes |
| Required Permission | `compliance:read` |

**Response 200** — `{ events: [...] }` in chronological order

---

## Client Detail

Client-scoped reads behind the advisor console's client tabs. Mounted at
`/api/v1/clients/:clientId`. Every one of these reads real records: where a
value cannot be derived it is returned as `null`, never as a zero or a sample.

### GET /api/v1/clients/:clientId/credit/personal

Personal-bureau credit profiles for the client's owners.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/v1/clients/:clientId/credit/personal` |
| Auth Required | Yes |

**Response 200**
```json
{
  "success": true,
  "data": {
    "scores": [
      {
        "id": "seed-cp-001",
        "businessId": "seed-biz-001",
        "profileType": "personal",
        "bureau": "experian",
        "score": 762,
        "scoreType": "fico",
        "utilization": "0.14",
        "inquiryCount": 2,
        "derogatoryCount": 0,
        "tradelines": { "avgAge": 9.4, "accounts": 18, "revolving": 6, "installment": 4 },
        "rawData": null,
        "pulledAt": "2026-03-01T00:00:00.000Z",
        "createdAt": "2026-07-30T23:14:57.493Z"
      }
    ]
  },
  "meta": { "total": 1 }
}
```

A client with no personal pull on record returns `scores: []` and `total: 0`.

---

### GET /api/v1/clients/:clientId/credit/history

Score movement over time, one scale at a time.

**`profileType` is required.** Personal FICO runs 300–850 and business PAYDEX
runs 0–100, so the two are never returned in one series — a response carrying
both would put 80 next to 762 under the same `month`, and a caller plotting it
on one axis would show a 682-point collapse that never happened.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/v1/clients/:clientId/credit/history?profileType=personal\|business` |
| Auth Required | Yes |
| `profileType` | Required. `personal` or `business`. |

**Response 400** — `PROFILE_TYPE_REQUIRED` when the parameter is absent,
`INVALID_PROFILE_TYPE` when it is not one of the two values. Neither reaches
the database.

The parameter is required rather than defaulted on purpose. It was previously
optional, and omitting it returned both scales together; defaulting to one of
them would have replaced a visibly odd chart with a confidently wrong one, and
a caller that has not said which scale it wants cannot read either answer
correctly.

**Response 200**
```json
{
  "success": true,
  "data": {
    "months": [ { "month": "2026-03", "experian": 762 } ],
    "bureaus": ["experian"],
    "pullCount": 1,
    "changeSinceFirstPull": 0,
    "latestPullAt": "2026-03-01T00:00:00.000Z"
  },
  "meta": { "total": 1 }
}
```

One key per bureau appears inside each month, so a month where only one bureau
reported does not imply the others held steady. `changeSinceFirstPull` is
latest minus first on record — with a single pull, first and latest are the
same row and it is genuinely `0`, which is a different statement from "no
movement observed over time". Read it alongside `pullCount`.

---

### GET /api/v1/clients/:clientId/repayment

The client's repayment position: plan, calendar, APR expiries and payoff order.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/v1/clients/:clientId/repayment` |
| Auth Required | Yes |

**Response 200**
```json
{
  "success": true,
  "data": {
    "hasPlan": false,
    "planId": null,
    "strategy": null,
    "totalBalance": null,
    "totalMonthlyObligations": null,
    "nextPayment": null,
    "autopayPct": null,
    "cardsAtRisk": 0,
    "paymentCalendar": [],
    "aprExpirySchedule": [
      {
        "applicationId": "seed-app-001",
        "issuer": "Chase",
        "cardProduct": "Ink Business Preferred",
        "expiryDate": "2026-10-12T00:00:00.000Z",
        "daysRemaining": 73,
        "currentApr": 0,
        "postExpiryApr": 0.2124,
        "creditLimit": 45000
      }
    ],
    "payoffWaterfall": [
      {
        "applicationId": "seed-app-001",
        "issuer": "Chase",
        "cardProduct": "Ink Business Preferred",
        "creditLimit": 45000,
        "priority": 1,
        "reason": "Intro APR lapses in 73 days"
      }
    ]
  }
}
```

`hasPlan: false` is the important field. When no repayment plan exists the plan
figures are `null` rather than `0` — a client who owes nothing and a client
whose balance was never captured are not the same client, and only one of them
is safe to advise. The APR schedule and payoff order are still returned, since
both derive from approved applications rather than from a plan.

---

### POST /api/v1/clients/:clientId/compliance/run

Run a compliance check and persist the result. The response is the stored
record, not a preview.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/v1/clients/:clientId/compliance/run` |
| Auth Required | Yes |

**Request Body**
```json
{ "checkType": "kyb" }
```

`checkType` defaults to `kyb`.

**Response 200**
```json
{
  "success": true,
  "data": {
    "checkId": "5272bde0-70a9-4294-9c89-7a2b0b7cc054",
    "businessId": "seed-biz-001",
    "tenantId": "9f82fae9-e92e-49a0-b21f-3c1ad5c0a17b",
    "checkType": "kyb",
    "riskScore": 0,
    "riskLevel": "low",
    "findings": [],
    "createdAt": "2026-07-31T15:29:12.339Z"
  }
}
```

`findings: []` means the check ran and found nothing. It does not mean the
check was skipped — `checkId` is the persisted row, and the same record appears
in the client's compliance history.

---

### POST /api/v1/clients/:clientId/consent/request

Send a re-consent request to the client.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/v1/clients/:clientId/consent/request` |
| Auth Required | Yes |

**Request Body**
```json
{ "recipientEmail": "owner@apexdigital.example", "channel": "email" }
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "clientId": "seed-biz-001",
    "channel": "email",
    "recipientEmail": "owner@apexdigital.example",
    "messageId": "console_1785511844301_ncdq52",
    "delivered": false,
    "transport": "console",
    "sentAt": "2026-07-31T15:30:44.301Z"
  }
}
```

**`delivered` is the field to read, not the 200.** `transport: "console"` with
`delivered: false` is the development fallback: the message was composed and
logged, and nothing left the building. Only `transport: "resend"` with
`delivered: true` means the client was actually contacted. A 200 here reports
that the request was processed, not that mail arrived.

**Response 422** — `RECIPIENT_EMAIL_REQUIRED`
```json
{
  "success": false,
  "error": {
    "code": "RECIPIENT_EMAIL_REQUIRED",
    "message": "recipientEmail is required: no client contact address is stored against a business or its owners."
  }
}
```

The schema holds no client contact address — `User.email` belongs to staff and
`BusinessOwner` has no email column — so the caller supplies one. Refusing is
deliberate: this endpoint previously reported a send it had no address for.

---

## Credit Builder

Vendor tradeline tracking and business-bureau scores, mounted at
`/api/credit-builder/:clientId`.

### GET /api/credit-builder/:clientId/scores

Latest business-bureau score per bureau.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/credit-builder/:clientId/scores` |
| Auth Required | Yes |

**Response 200**
```json
{
  "success": true,
  "data": {
    "clientId": "seed-biz-001",
    "asOf": "2026-07-31T15:28:45.418Z",
    "scores": [
      {
        "bureau": "dnb",
        "scoreType": "paydex",
        "score": 80,
        "range": "0-100",
        "rating": "Low risk",
        "utilization": 0.22,
        "pulledAt": "2026-03-01T00:00:00.000Z"
      }
    ]
  },
  "meta": { "total": 1 }
}
```

`pulledAt` is when the bureau reported; `asOf` is when this response was
assembled. They are usually months apart, and conflating them would make a
stale score look current.

Only bureaus with a pull on record appear. A bureau that has never been pulled
is absent rather than present with a `null` score.

---

### GET /api/credit-builder/:clientId/score-history

Score movement across the pulls on record.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/credit-builder/:clientId/score-history` |
| Auth Required | Yes |

**Response 200**
```json
{
  "success": true,
  "data": {
    "clientId": "seed-biz-001",
    "months": [ { "month": "2026-03", "paydex": 80 } ],
    "pullCount": 1
  },
  "meta": { "total": 1 }
}
```

`pullCount` is how many real pulls back the series. A one-point series is a
single pull, not a trend, and the count is what tells you so.

---

### GET /api/credit-builder/:clientId/tradelines

Vendor tradelines with their payment and dispute history.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/credit-builder/:clientId/tradelines` |
| Auth Required | Yes |

**Response 200**
```json
{
  "success": true,
  "data": {
    "clientId": "seed-biz-001",
    "tradelines": [
      {
        "id": "b036fdc5-7c53-4bc6-908c-29d8d70fab8c",
        "vendor": "Uline",
        "creditLimit": 5000,
        "balance": 0,
        "status": "open",
        "paymentTerms": "net_30",
        "reportsTo": ["D&B", "Experian Biz"],
        "openedDate": "2026-05-01T00:00:00.000Z",
        "payments": [
          {
            "id": "339b6648-58dd-4a72-9bd9-cd24f87e1e3e",
            "amount": 1200,
            "paidOn": "2026-05-20T00:00:00.000Z",
            "dueOn": "2026-05-31T00:00:00.000Z",
            "onTime": true,
            "method": "ACH"
          }
        ],
        "paymentCount": 1,
        "onTimeCount": 1,
        "latePaymentCount": 0,
        "disputes": [
          {
            "id": "be07701c-3341-4609-a805-67c8a6f78bae",
            "reason": "Not reporting to Experian Biz after 60 days",
            "status": "pending",
            "filedAt": "2026-07-31T15:28:45.400Z",
            "resolvedAt": null
          }
        ]
      }
    ]
  },
  "meta": { "total": 1 }
}
```

`paymentCount`, `onTimeCount` and `latePaymentCount` do not necessarily sum:
a payment with no known due date is counted in neither of the last two. See
the payment endpoint below.

---

### POST /api/credit-builder/:clientId/tradelines

Open a vendor tradeline.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/credit-builder/:clientId/tradelines` |
| Auth Required | Yes |

**Request Body**
```json
{
  "vendor": "Uline",
  "creditLimit": 5000,
  "paymentTerms": "net_30",
  "reportsTo": ["D&B", "Experian Biz"],
  "openedDate": "2026-05-01"
}
```

`vendor` is required. `paymentTerms` is one of `net_30`, `net_60`, `net_90`;
supplying it is what lets later payments be judged on time without a due date
per payment.

**Response 201**
```json
{
  "success": true,
  "data": {
    "id": "b036fdc5-7c53-4bc6-908c-29d8d70fab8c",
    "vendor": "Uline",
    "creditLimit": 5000,
    "balance": 0,
    "status": "open",
    "paymentTerms": "net_30",
    "reportsTo": ["D&B", "Experian Biz"],
    "openedDate": "2026-05-01T00:00:00.000Z"
  }
}
```

A new tradeline opens at `balance: 0` and `status: "open"`.

---

### POST /api/credit-builder/:clientId/tradeline-payments

Log a payment against a tradeline.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/credit-builder/:clientId/tradeline-payments` |
| Auth Required | Yes |

**Request Body**
```json
{
  "tradelineId": "b036fdc5-7c53-4bc6-908c-29d8d70fab8c",
  "amount": 1200,
  "paidOn": "2026-05-20",
  "method": "ACH"
}
```

`dueOn` may be supplied directly. When it is not, it is derived from the
tradeline's `paymentTerms` and opening date.

**Response 201**
```json
{
  "success": true,
  "data": {
    "id": "339b6648-58dd-4a72-9bd9-cd24f87e1e3e",
    "tradelineId": "b036fdc5-7c53-4bc6-908c-29d8d70fab8c",
    "amount": 1200,
    "paidOn": "2026-05-20T00:00:00.000Z",
    "dueOn": "2026-05-31T00:00:00.000Z",
    "onTime": true,
    "method": "ACH",
    "balanceAfter": 0
  }
}
```

**`onTime` is three-valued.** It is `true` or `false` only when a due date is
known, and `null` when neither a `dueOn` nor derivable terms were available. It
is never defaulted to `true`. `onTimeCount` counts payments confirmed on time,
and that number is what a lender is shown — so an unknown has to stay visibly
unknown rather than quietly improving the record.

Payment and balance are written in one transaction, so `balanceAfter` always
agrees with the payment that produced it.

---

### PATCH /api/credit-builder/:clientId/tradelines/:tradelineId

Update a tradeline's status.

| Field | Value |
|-------|-------|
| Method | `PATCH` |
| Path | `/api/credit-builder/:clientId/tradelines/:tradelineId` |
| Auth Required | Yes |

**Request Body**
```json
{ "status": "closed" }
```

`status` is one of `open`, `closed`, `delinquent`. It is the only updatable
field: balance follows from the payments logged against the tradeline, and
setting it directly would let the figure disagree with the history behind it.

**Response 200**
```json
{
  "success": true,
  "data": {
    "id": "b036fdc5-7c53-4bc6-908c-29d8d70fab8c",
    "vendor": "Uline",
    "previousStatus": "open",
    "status": "closed",
    "creditLimit": 5000,
    "balance": 0,
    "paymentTerms": "net_30",
    "reportsTo": ["D&B", "Experian Biz"],
    "paymentCount": 1,
    "onTimeCount": 1,
    "disputeCount": 1
  }
}
```

`previousStatus` is returned so the caller can log the transition. Closing a
line keeps its payment history — how it was paid is what it contributed to the
client's credit, and closing it does not undo that.

**Response 400** — `FIELD_NOT_UPDATABLE` naming the rejected fields.
**Response 422** — `VALIDATION_ERROR` when `status` is not one of the three.
**Response 404** — `TRADELINE_NOT_FOUND`, also when the tradeline belongs to
another client or tenant. The lookup is scoped by client and tenant, so a
tradeline cannot be closed by id alone.

---

### POST /api/credit-builder/:clientId/tradeline-disputes

File a dispute against a tradeline.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/credit-builder/:clientId/tradeline-disputes` |
| Auth Required | Yes |

**Request Body**
```json
{
  "tradelineId": "b036fdc5-7c53-4bc6-908c-29d8d70fab8c",
  "reason": "Not reporting to Experian Biz after 60 days"
}
```

**Response 201**
```json
{
  "success": true,
  "data": {
    "id": "be07701c-3341-4609-a805-67c8a6f78bae",
    "tradelineId": "b036fdc5-7c53-4bc6-908c-29d8d70fab8c",
    "reason": "Not reporting to Experian Biz after 60 days",
    "status": "pending",
    "filedAt": "2026-07-31T15:28:45.400Z"
  }
}
```

A dispute opens as `pending` with `resolvedAt: null`. Filing one does not alter
the tradeline: the disputed record stands until the dispute is resolved, which
is what makes the dispute meaningful.

---

## Client Portal

### GET /api/portal/:clientId/summary

Everything the client-facing portal shows on one screen.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/portal/:clientId/summary` |
| Auth Required | Yes |

**Response 200**
```json
{
  "success": true,
  "data": {
    "clientId": "seed-biz-001",
    "businessName": "Apex Digital Solutions LLC",
    "status": "active",
    "fundingStatus": {
      "totalFunded": 80000,
      "activeCards": 2,
      "nextPaymentDue": null,
      "nextPaymentAmount": null,
      "utilizationPct": null,
      "totalMonthlyObligations": null
    },
    "aprCountdowns": [
      {
        "applicationId": "seed-app-002",
        "cardName": "Blue Business Cash",
        "issuer": "American Express",
        "introAprExpiry": "2026-10-12T00:00:00.000Z",
        "daysRemaining": 73,
        "currentApr": 0,
        "regularApr": 0.1849,
        "creditLimit": 35000,
        "severity": "ok"
      }
    ],
    "upcomingPayments": [],
    "unsignedDocuments": [
      {
        "type": "personal_guarantee",
        "title": "Personal Guarantee Acknowledgment",
        "status": "not_signed"
      }
    ],
    "acknowledgmentsOnFile": [
      { "type": "product_reality", "signedAt": "2025-09-04T14:32:00.000Z", "version": "3.0" }
    ]
  }
}
```

`aprCountdowns` is sorted by urgency, `severity` escalating as the intro period
runs down. `utilizationPct` is `null` when no balance has been captured — the
portal is read by the client, and a fabricated zero there would read as
reassurance.

`unsignedDocuments` lists what is still outstanding, so an empty array means
nothing is owed rather than nothing being tracked.

---

## Payment Reminders and SMS

Outbound SMS and the webhooks that make it lawful to send. See
[`tcpa-compliance.md`](tcpa-compliance.md) for the obligations these implement.

### GET /api/v1/dashboard/payment-reminder-eligible

Who may be sent a payment reminder in the next seven days, and who may not.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/v1/dashboard/payment-reminder-eligible` |
| Auth Required | Yes |

**Response 200**
```json
{
  "success": true,
  "data": { "eligible": [], "ineligible": [] },
  "meta": { "windowDays": 7, "total": 0, "smsProviderConfigured": false }
}
```

Both lists are returned, and each entry carries `client_id`, `client_name`,
`amount_due`, `due_date` and `tcpa_sms_consent`. An `ineligible` entry adds a
`reason` — currently always `"No active TCPA SMS consent on record"`, since
consent is the one gate applied here. Returning the excluded clients rather
than dropping them means a short eligible list reads as a compliance outcome
instead of an empty schedule.

The remaining gates — do-not-call, quiet hours, a missing phone number — are
applied at dispatch, so a client on the eligible list can still be blocked when
the campaign runs.

`smsProviderConfigured` reports whether sending is actually wired up. When it
is `false`, nothing on the eligible list can be sent, however long the list.

---

### POST /api/v1/voiceforge/sms-campaign

Dispatch a templated SMS to a set of clients.

Each recipient passes four gates in order — phone number on file, do-not-call
list, TCPA consent, then quiet hours in the recipient's own timezone. The
response reports each recipient individually.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/v1/voiceforge/sms-campaign` |
| Auth Required | Yes |

**Request Body**
```json
{
  "client_ids": ["seed-biz-001"],
  "channel": "sms",
  "template": "payment_reminder"
}
```

`template` is one of `payment_reminder`, `apr_expiry`. The message body is not
caller-supplied: an arbitrary body would let any text be sent to consented
consumers under the product's name.

**Response 200** — dispatch attempted, per-recipient outcomes
```json
{
  "success": true,
  "data": {
    "campaign_ids": ["263489a8-1a70-4508-a1b6-25cbed5fc97d"],
    "sent_count": 0,
    "blocked_count": 1,
    "failed_count": 0,
    "results": [
      {
        "client_id": "seed-biz-001",
        "status": "blocked",
        "blocked_reason": "dnc",
        "detail": "Recipient is on the do-not-call list",
        "message_id": "8fa87188-ed8d-4c47-a7d2-981798546d5e",
        "timezone": null,
        "timezone_source": null
      }
    ]
  },
  "meta": { "requested": 1, "matched": 1 }
}
```

**A 200 does not mean anything was sent.** Read `sent_count`. Per recipient,
`status` is one of:

| Status | Meaning |
|--------|---------|
| `sent` | Accepted by the provider. Delivery is confirmed later, by the status webhook. |
| `blocked` | Withheld on purpose. `blocked_reason` says which gate stopped it. |
| `failed` | Attempted and the provider rejected it. `detail` carries the error. |

`blocked_reason` is one of `no_phone`, `dnc`, `no_consent`, `quiet_hours`,
`unknown_timezone`. A recipient with no timezone on record is never messaged:
quiet hours are judged in the recipient's own zone, so without one there is no
way to know whether it is 9pm where they are. `timezone_source` records whether
the zone used was stored on the business or inferred from the phone number's
area code.

Every outcome, including a blocked one, is written to the outreach audit trail
and given a `message_id` — the record of a message deliberately not sent is
exactly what demonstrates the do-not-call list was honoured.

**Response 503** — `SMS_PROVIDER_NOT_CONFIGURED`
```json
{
  "success": false,
  "error": {
    "code": "SMS_PROVIDER_NOT_CONFIGURED",
    "message": "SMS is not configured; nothing was sent. Missing: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER."
  },
  "meta": { "missing": ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"] }
}
```

Nothing can be sent, so nothing is claimed — the endpoint refuses rather than
reporting a queued campaign.

**Response 400** — `UNSUPPORTED_CHANNEL` for any `channel` other than `sms`.
**Response 422** — `UNKNOWN_TEMPLATE`, listing the templates that exist.
**Response 404** — `NO_MATCHING_CLIENTS` when no requested id belongs to the
tenant.

---

### POST /api/voiceforge/webhooks/sms-inbound

Inbound SMS from Twilio, including opt-out keywords. **Public.**

This endpoint is what makes outbound SMS defensible. A recipient who replies
STOP must stop receiving messages, and that only happens if this endpoint
exists, is reachable, and records the opt-out.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/voiceforge/webhooks/sms-inbound` |
| Auth Required | No — HMAC signature instead |
| Content-Type | `application/x-www-form-urlencoded` |

Twilio cannot present a bearer token, so the request authenticates by
signature. `X-Twilio-Signature` is verified against `TWILIO_AUTH_TOKEN` over the
request URL and sorted parameters, before anything is written.

**Request Body** (form-encoded, as Twilio sends it)
```
From=%2B13025550101&To=%2B15005550006&Body=STOP&MessageSid=SM...
```

**Response 200** — TwiML, `Content-Type: text/xml`
```xml
<Response></Response>
```

Twilio expects TwiML or an empty 200 and retries on anything else, so this is
returned even when the message could not be processed — the failure is logged
instead. A retry storm would not fix a malformed payload.

The sending number identifies the client, and the tenant is resolved from it. A
message from a number this deployment does not recognise is logged and
acknowledged rather than applied to an arbitrary tenant.

When the body is an opt-out keyword, the number is added to the do-not-call
list and any SMS-channel consent on record is revoked, both against the
resolved tenant.

**Response 403** — `INVALID_SIGNATURE`
```json
{
  "success": false,
  "error": { "code": "INVALID_SIGNATURE", "message": "Twilio signature verification failed." }
}
```

**Response 503** — `WEBHOOK_NOT_CONFIGURED` when `TWILIO_AUTH_TOKEN` is unset.
The endpoint refuses rather than accepting unverified requests: without it,
anyone could opt a number out or forge delivery receipts.

---

### POST /api/voiceforge/webhooks/sms-status

Delivery status callbacks from Twilio. **Public**, verified identically.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/voiceforge/webhooks/sms-status` |
| Auth Required | No — HMAC signature instead |
| Content-Type | `application/x-www-form-urlencoded` |

**Request Body**
```
MessageSid=SM...&MessageStatus=delivered
```

`SmsSid` and `SmsStatus` are accepted as aliases. A callback missing either the
SID or the status is acknowledged and ignored.

**Response 200** — TwiML, as above.

The status is recorded against the stored message. This matters for the audit
trail: `sent` only means the provider accepted the message, and `delivered` is
the only status that says it arrived. A callback for a SID with no matching
message is logged rather than creating one.

---

## Admin

### GET /api/admin/tenants

List all tenants (super_admin only).

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/admin/tenants` |
| Auth Required | Yes |
| Required Role | `super_admin` |
| Required Permission | `admin:tenant` |

**Response 200** — `{ tenants: [...] }`

---

### POST /api/admin/tenants

Create a new tenant.

| Field | Value |
|-------|-------|
| Method | `POST` |
| Path | `/api/admin/tenants` |
| Auth Required | Yes |
| Required Role | `super_admin` |
| Required Permission | `admin:tenant` |

**Request Body**
```json
{
  "name": "Premier Funding Advisors",
  "slug": "premier-funding",
  "plan": "professional",
  "brandConfig": { "primaryColor": "#1a56db", "logoUrl": "https://..." }
}
```

**Response 201** — `{ tenant }`

---

### GET /api/admin/tenants/:tenantId/users

List all users for a tenant.

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/admin/tenants/:tenantId/users` |
| Auth Required | Yes |
| Required Permission | `admin:users` |

**Response 200** — `{ users: [...] }`

---

### PATCH /api/admin/users/:userId

Update a user (role, active status).

| Field | Value |
|-------|-------|
| Method | `PATCH` |
| Path | `/api/admin/users/:userId` |
| Auth Required | Yes |
| Required Permission | `admin:users` |

**Response 200** — `{ user }`

---

### GET /api/admin/reports/overview

Tenant-level summary report (active businesses, total funding rounds, total approved credit).

| Field | Value |
|-------|-------|
| Method | `GET` |
| Path | `/api/admin/reports/overview` |
| Auth Required | Yes |
| Required Permission | `reports:view` |

**Response 200** — `{ summary }`
