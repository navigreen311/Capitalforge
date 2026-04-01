# CapitalForge — Security Architecture

**Last updated:** 2026-03-31

> **Legal Disclaimer:** This document describes technical controls implemented in the platform. It does not constitute legal or compliance advice. Operators must engage qualified legal and security counsel for their specific deployment.

---

## Table of Contents

1. [Security Design Principles](#security-design-principles)
2. [Authentication & Session Management](#authentication--session-management)
3. [Authorization & RBAC](#authorization--rbac)
4. [Encryption](#encryption)
5. [Tenant Isolation](#tenant-isolation)
6. [PII Handling](#pii-handling)
7. [Audit Logging](#audit-logging)
8. [Network Security](#network-security)
9. [Secrets Management](#secrets-management)
10. [Incident Response](#incident-response)
11. [Security Controls Summary](#security-controls-summary)

---

## Security Design Principles

CapitalForge applies defense-in-depth across every layer of the stack:

1. **Authentication before everything** — No business logic executes before a valid JWT is verified and a tenant context is established.
2. **Least privilege by default** — Every role has the minimum permissions required for its function. Elevation requires explicit configuration.
3. **All state changes are events** — The canonical ledger provides a complete, tamper-evident audit trail. No mutation is unrecorded.
4. **PII is encrypted at the field level** — Sensitive data (SSN, DOB, EIN) is encrypted before storage. The decryption key is never stored in the database.
5. **Compliance gates are code, not policy** — TCPA consent gates, suitability no-go thresholds, and ACH authorization checks block workflows in code. They cannot be bypassed without an audited override.
6. **Secrets never touch source control** — All secrets are managed via environment variables. `.env.example` contains only placeholders.

---

## Authentication & Session Management

### JWT Architecture

CapitalForge uses a dual-token scheme:

| Token | TTL | Storage | Purpose |
|-------|-----|---------|---------|
| Access token | 15 minutes | Client memory (not localStorage) | Authenticate API requests |
| Refresh token | 7 days | Secure HTTP-only cookie or client storage | Obtain new access tokens |

### Token Rotation

- Every call to `POST /api/auth/refresh` issues a **new refresh token** and immediately invalidates the old one.
- Old refresh tokens cannot be reused — replay attacks are rejected.

### Token Revocation

- On logout, the refresh token's JTI (JWT ID) is written to the Redis blocklist with a TTL matching the token's remaining lifetime.
- Access tokens cannot be revoked early (by design — 15-minute window minimizes impact).
- All token operations are logged to `AuditLog`.

### Password Security

- Passwords are hashed with **bcrypt** (cost factor 12) before storage.
- Plaintext passwords are never logged, stored, or transmitted after receipt.
- Minimum complexity requirements are enforced at registration.

### Session Hijacking Mitigations

- Access tokens are short-lived (15 min).
- Refresh tokens are rotated on every use.
- JTI blocklist prevents replay of stolen refresh tokens.
- `X-Tenant-ID` header is validated server-side — a token from tenant A cannot access tenant B's resources.

---

## Authorization & RBAC

### Roles

| Role | Description |
|------|-------------|
| `super_admin` | Platform-level administration. Access to all tenants. |
| `tenant_admin` | Full access within their tenant. Can manage users and settings. |
| `advisor` | Standard advisor access — create businesses, submit funding rounds. |
| `compliance_officer` | Read access across all tenant data + write to compliance workflows. |
| `client` | Limited read access to their own business records. |
| `readonly` | Read-only access for auditors and observers. |

### Permissions

Thirteen fine-grained permissions are mapped to roles:

| Permission | Description |
|-----------|-------------|
| `business:read` | Read business records |
| `business:write` | Create/update business records |
| `application:submit` | Create and submit card applications |
| `compliance:read` | Read compliance checks and audit data |
| `compliance:write` | Create compliance checks, run UDAP scans, override no-go |
| `consent:manage` | Capture, read, and revoke consent records |
| `ach:manage` | Create and revoke ACH authorizations |
| `document:read` | Read documents and download URLs |
| `document:write` | Upload and soft-delete documents |
| `reports:view` | Access reporting and analytics endpoints |
| `admin:tenant` | Create and manage tenants (super_admin only) |
| `admin:users` | Manage users within a tenant |
| `admin:system` | System-level configuration (super_admin only) |

### Enforcement

RBAC is enforced at the **route middleware layer** via `rbacMiddleware(permission)`. No business logic layer code needs to perform its own permission check — the middleware rejects requests with 403 before they reach route handlers.

---

## Encryption

### Data in Transit

- **TLS 1.2+** is enforced on all connections.
- **HSTS** (HTTP Strict Transport Security) header is set via `helmet()` with `max-age=31536000`.
- Development traffic on `localhost` is unencrypted by design; TLS is enforced in staging and production via nginx.

### Data at Rest — Field-Level Encryption

Sensitive PII fields are encrypted with **AES-256-GCM** before storage:

| Field | Model | Encryption Applied |
|-------|-------|--------------------|
| SSN | `BusinessOwner` | AES-256-GCM |
| Date of Birth | `BusinessOwner` | AES-256-GCM |
| EIN | `Business` | AES-256-GCM |

The encryption key is supplied via the `ENCRYPTION_KEY` environment variable. It is never stored in the database, source code, or logs.

### Database Encryption at Rest

PostgreSQL data-at-rest encryption is handled at the infrastructure layer:
- **Managed deployments:** Use AWS RDS with storage encryption enabled (AES-256).
- **Self-hosted:** Enable OS-level or filesystem encryption (LUKS, eCryptfs).

### Document Vault

Every document stored in the vault receives:
- **SHA-256 content hash** — computed on upload and stored; any tamper attempt changes the hash.
- **Crypto-timestamp** — UTC timestamp anchored at upload time.
- Legal-hold flag blocks deletion of evidentiary documents.

---

## Tenant Isolation

Tenant data is isolated at three independent layers:

```
Layer 1: HTTP Middleware
  ├── X-Tenant-ID header validated on every authenticated request
  ├── Tenant record loaded from Redis cache (60s TTL) or DB
  └── req.tenant injected into request context

Layer 2: Prisma Middleware (Tenant Extension)
  ├── All findMany / findFirst queries append WHERE tenantId = :tenantId
  ├── All create mutations inject tenantId from request context
  ├── All update / delete mutations validate tenantId matches context
  └── Cross-tenant access rejected with 403 before hitting the DB

Layer 3: PostgreSQL Row-Level Security (RLS)
  ├── RLS policies enabled on all tenant-scoped tables
  ├── app.current_tenant_id session variable set per connection
  └── Defense-in-depth: catches any middleware bypass at the DB layer
```

A compromised application layer cannot read or write another tenant's data because the database itself enforces the boundary.

---

## PII Handling

### Classification

| Data Class | Examples | Controls |
|-----------|---------|---------|
| Highly Sensitive PII | SSN, DOB, EIN | AES-256-GCM field encryption + access logging |
| Sensitive PII | Name, address, email, phone | Tenant-scoped access + role-based read |
| Financial Data | Credit scores, tradelines, bank balances | Tenant-scoped + compliance role required |
| Public Business Data | MCC, legal name, state of formation | Tenant-scoped access |

### Access Logging

All reads of highly sensitive PII fields are logged to `AuditLog` with:
- User ID and role
- Tenant ID
- Resource type and ID
- Timestamp
- Action

### Data Minimization

- Only collect PII fields required for the specific compliance or underwriting purpose.
- Beneficial owner SSN is required for KYC and sanctions screening; it is not surfaced in list responses — only accessible via direct owner lookup.
- Credit bureau data is scoped to the minimum fields needed for funding readiness scoring.

### Retention

- Consent records are retained indefinitely (regulatory requirement — never hard-deleted).
- Audit log entries are append-only and never deleted.
- Other records: follow tenant's data retention policy; soft-delete is available, hard-delete is blocked if legal hold is active.

---

## Audit Logging

### Two-Layer Audit System

**Layer 1 — `AuditLog` table:** Captures all authentication events (login, logout, register, refresh, failed attempts) and administrative actions (user role changes, tenant modifications).

**Layer 2 — `ledger_events` table:** Captures all domain state transitions as immutable events. Every funding round status change, consent grant/revoke, application decision, compliance check, and ACH authorization is a permanent ledger record.

### Event Envelope

```typescript
interface LedgerEnvelope {
  tenantId:      string;   // Tenant scope
  eventType:     string;   // e.g. "consent.captured"
  aggregateType: string;   // e.g. "consent"
  aggregateId:   string;   // UUID of the root entity
  payload:       Record<string, unknown>;
  metadata?:     Record<string, unknown>;
  version?:      number;   // Monotonic per aggregate
  createdAt:     Date;     // Server timestamp (never client-supplied)
}
```

### Immutability Guarantees

- `ledger_events` has no `UPDATE` or `DELETE` paths in the application layer.
- Row-level security policies on the `ledger_events` table prevent deletion.
- For compliance holds: the `documents` table has a `legalHold` boolean that blocks soft-delete at the API layer.

### Querying the Audit Trail

```
GET /api/audit/events                            — paginated ledger query
GET /api/audit/events/:aggregateType/:aggregateId — full history of one entity
```

---

## Network Security

### HTTP Security Headers

`helmet()` middleware applies the following headers on every response:

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | Configured per environment |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-XSS-Protection` | `0` (modern browsers use CSP instead) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

### CORS

CORS is configured explicitly — wildcard origins (`*`) are never used in production. Allowed origins are specified via the `CORS_ORIGINS` environment variable.

### Rate Limiting

Express rate-limit middleware is applied at the API gateway layer:
- Authentication endpoints: 10 requests / minute per IP
- General API: 300 requests / minute per authenticated user

### Request ID Tracing

Every request receives a unique `X-Request-ID` header (UUID v4, generated server-side if not supplied). This ID is included in all log entries for end-to-end request tracing.

### Production Network Architecture

```
Internet
    │
    ▼
CDN / WAF (DDoS protection, geo-blocking, bot mitigation)
    │
    ▼
Load Balancer (TLS termination)
    │
    ▼
nginx reverse proxy (rate limiting, security headers)
    │
    ├── /          → Next.js frontend (port 3000)
    └── /api       → Express API (port 4000)
                        │
                        ├── PostgreSQL 16 (private subnet)
                        ├── Redis 7 (private subnet)
                        └── S3 (VPC endpoint or private link)
```

Application servers have no public ingress except through the load balancer. Database and cache servers are in a private subnet with no public IP.

---

## Secrets Management

### Principles

1. **Never in source control** — `.gitignore` excludes all `.env` variants. CI/CD uses environment-injected secrets only.
2. **Never in logs** — Winston log format explicitly omits `Authorization` headers and any field matching `secret`, `password`, `key`, `token`.
3. **Never in error messages** — Error responses return codes and human-readable messages; internal errors are logged server-side only.

### Secret Categories

| Category | Storage | Rotation |
|----------|---------|----------|
| JWT secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) | Environment variable | Rotate every 90 days; triggers token re-login |
| Encryption key (`ENCRYPTION_KEY`) | Environment variable + KMS-backed secret | Rotate with key migration script; old key retained for decryption during transition |
| Database credentials (`DATABASE_URL`) | Environment variable | Rotate quarterly; use managed IAM auth on AWS RDS |
| Redis credentials (`REDIS_URL`) | Environment variable | Rotate quarterly |
| Third-party API keys (bureau, sanctions, Twilio, Stripe) | Environment variable | Rotate per provider policy; revoke immediately on suspected compromise |

### Recommended Secret Store

For production deployments:
- **AWS Secrets Manager** with automatic rotation
- **HashiCorp Vault** for self-hosted deployments
- **GitHub Actions Secrets** for CI/CD pipelines (never log secrets even in debug steps)

### Secret Rotation Procedure

1. Generate new secret value
2. Update secret store (Secrets Manager / Vault)
3. Perform rolling restart of API servers (zero-downtime)
4. Verify health checks pass
5. Invalidate old secret (for JWT secrets: existing refresh tokens expire naturally within 7 days; for encryption key: run migration script)

---

## Incident Response

### Severity Classification

| Severity | Definition | Response Time |
|----------|-----------|---------------|
| P0 — Critical | Active data breach, cross-tenant data leak, credential compromise | Immediate (< 15 min) |
| P1 — High | Authentication bypass, RBAC failure, mass unauthorized access | < 1 hour |
| P2 — Medium | Single unauthorized access event, compliance gate bypassed | < 4 hours |
| P3 — Low | Failed attack attempt, anomalous pattern detected | < 24 hours |

### P0/P1 Response Playbook

```
1. CONTAIN
   a. Revoke affected user credentials (PATCH /api/admin/users/:userId → active: false)
   b. Rotate JWT secrets (triggers full re-login for all users)
   c. If DB credentials compromised: rotate and restart all app servers
   d. If tenant data leaked: isolate affected tenant (suspend tenant record)

2. ASSESS
   a. Query ledger_events for affected aggregateId / tenantId / time window
   b. Query audit_logs for affected userId / IP
   c. Determine scope: which tenants, which data classes, which time window

3. NOTIFY
   a. Inform affected tenants within 72 hours (GDPR / state law requirement)
   b. Notify regulators if NPI involved (GLBA breach notification rules)
   c. Engage legal counsel before external communications

4. REMEDIATE
   a. Patch the vulnerability
   b. Deploy via hotfix branch: hotfix/<description>
   c. Re-verify all compliance gates in affected module

5. POST-INCIDENT
   a. Document timeline, root cause, and remediation in incident log
   b. Add regression test covering the vulnerability
   c. Update this document with new controls if applicable
```

### Key Contacts

Security incidents must be reported immediately to the Green Companies LLC security team. Do not use public issue trackers for security vulnerabilities — use the private security disclosure channel.

### Audit Evidence Preservation

During an incident:
- Do not delete or modify any `ledger_events` or `audit_logs` records
- Export the relevant event window before any schema changes
- Preserve server logs (Winston output) for the incident time window
- If documents are involved, ensure `legalHold: true` is set on all relevant vault entries

---

## Security Controls Summary

| Control | Implementation | Status |
|---------|---------------|--------|
| Authentication | JWT (JOSE) — 15m access / 7d refresh | Implemented |
| Token rotation | Refresh token rotated on every use | Implemented |
| Token revocation | JTI blocklist in Redis | Implemented |
| Password hashing | bcrypt (cost 12) | Implemented |
| Transport security | TLS 1.2+ + HSTS via helmet | Implemented |
| Input validation | Zod schemas on every route | Implemented |
| Tenant isolation | Middleware + Prisma extension + PostgreSQL RLS | Implemented |
| RBAC | 6 roles, 13 permissions, enforced at middleware | Implemented |
| PII encryption | AES-256-GCM field-level (SSN, DOB, EIN) | Implemented |
| Audit trail | Immutable ledger_events + audit_logs | Implemented |
| Secret management | Environment variables; never committed | Implemented |
| Security headers | helmet() — CSP, X-Frame-Options, HSTS, etc. | Implemented |
| Rate limiting | Express rate-limit (auth: 10/min, API: 300/min) | Implemented |
| CORS | Explicit allow-list; no wildcard in production | Implemented |
| Document integrity | SHA-256 hash + crypto-timestamp on upload | Implemented |
| Legal hold | legalHold flag blocks document deletion | Implemented |
| Compliance gates | Code-level enforcement (no UI-only guards) | Implemented |
| DDoS protection | CDN / WAF layer (deployment-time configuration) | Infrastructure |
| Managed secret store | AWS Secrets Manager / HashiCorp Vault | Deployment-time |
| DB encryption at rest | AWS RDS storage encryption | Infrastructure |
| VPN / private subnet | Production database/cache in private subnet | Infrastructure |
