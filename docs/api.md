# CapitalForge — API Reference

**Base URL:** `http://localhost:4000/api` (development)

**Authentication:** All endpoints except those marked `Public` require a valid Bearer JWT access token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

**Tenant Context:** All authenticated endpoints require the `X-Tenant-ID` header:

```
X-Tenant-ID: <tenant_uuid>
```

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
