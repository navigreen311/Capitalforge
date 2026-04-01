# CapitalForge — Security Policy Templates

**Platform:** CapitalForge
**Version:** 1.0
**Effective Date:** 2026-03-31
**Review Cycle:** Annual
**Policy Owner:** Chief Information Security Officer (CISO)
**Approved By:** [CEO / Board — signature required before activation]

> **Instructions:** Each policy section below is a template. Before this document becomes effective, all `[BRACKETED PLACEHOLDERS]` must be completed, and the document must be reviewed by qualified legal counsel and approved by executive leadership. Annual review and re-approval is required to maintain SOC 2 audit readiness.

---

## Contents

1. [Access Control Policy](#1-access-control-policy)
2. [Encryption Policy](#2-encryption-policy)
3. [Incident Response Policy](#3-incident-response-policy)
4. [Change Management Policy](#4-change-management-policy)
5. [Data Retention Policy](#5-data-retention-policy)
6. [Vendor Management Policy](#6-vendor-management-policy)
7. [Acceptable Use Policy](#7-acceptable-use-policy)
8. [Policy Acknowledgment](#8-policy-acknowledgment)

---

## 1. Access Control Policy

### 1.1 Purpose

This policy establishes requirements for controlling access to CapitalForge's systems, applications, and data. It ensures that access is granted based on the principle of least privilege, access is promptly revoked when no longer needed, and all access activities are logged and reviewable.

### 1.2 Scope

This policy applies to all users of the CapitalForge platform including employees, contractors, advisors, and third-party integrations. It covers:
- The CapitalForge API (Express 5 backend)
- The CapitalForge web application (Next.js 15 frontend)
- The PostgreSQL database
- Redis session store
- S3 Document Vault
- Administrative consoles and infrastructure (AWS, CI/CD pipelines)

### 1.3 Roles and Permissions

CapitalForge enforces a role-based access control (RBAC) model with the following defined roles:

| Role | Description | Provisioning Authority |
|------|-------------|----------------------|
| `super_admin` | Full platform access across all tenants | [CEO / CTO only — cannot self-register] |
| `tenant_admin` | Full access within a single tenant | `super_admin` |
| `compliance_officer` | Read all tenant data; write compliance checks; export audit reports | `tenant_admin` |
| `advisor` | Read/write assigned business data; submit applications | `tenant_admin` |
| `client` | Read own consent and acknowledgment status only | `advisor` or `tenant_admin` |
| `readonly` | Read-only access to non-sensitive summaries | `tenant_admin` |

No user may be assigned the `super_admin` role through self-registration. Provisioning of `super_admin` accounts requires dual authorization from [CEO] and [CTO] and must be documented in the access log.

### 1.4 Access Provisioning

1. All access requests must be submitted via [HR ticketing system / access request form].
2. Access must be approved by the requestor's direct manager and the system owner.
3. Accounts are provisioned with the minimum permissions necessary for job function.
4. Access provisioning must be completed within [2] business days of approval.
5. All provisioned accounts are logged in the `audit_logs` table with action `user.registered`.

### 1.5 Multi-Factor Authentication (MFA)

1. MFA is required for all `super_admin` and `tenant_admin` accounts.
2. MFA is strongly recommended for all `compliance_officer` accounts.
3. MFA is configured via the `User.mfaEnabled` and `User.mfaSecret` fields.
4. Acceptable MFA methods: TOTP authenticator apps (Google Authenticator, Authy, 1Password). SMS-based OTP is not an acceptable substitute for privileged accounts.

### 1.6 Authentication Requirements

1. Passwords must meet the following minimum complexity:
   - Minimum 12 characters
   - At least one uppercase letter, one lowercase letter, one digit, one special character
   - May not contain the user's name or email address
2. Passwords are stored as bcrypt hashes with cost factor 12. Plaintext passwords are never stored.
3. Access tokens expire after 15 minutes. Refresh tokens expire after 7 days and are rotated on every use.
4. Token revocation: logout invalidates the refresh token via the JTI blocklist in Redis.

### 1.7 Access Review

1. A full user access review must be conducted quarterly by each `tenant_admin`.
2. The review must confirm that all active users have appropriate roles for their current job function.
3. Inactive accounts (no login in [90] days) must be reviewed and deactivated if not justified.
4. Access review results must be documented and retained in the Document Vault for [3] years.

### 1.8 Access Revocation

1. Access must be revoked within [4] hours of termination or role change.
2. Revocation procedure:
   a. Set `User.isActive = false` via `PATCH /api/admin/users/:userId`
   b. The JTI blocklist automatically invalidates any active tokens on next use
   c. Confirm revocation in the access log
3. For immediate security threats, the `isActive` flag disables all future authentication instantly.

### 1.9 Privileged Access Management

1. Production database and infrastructure access is restricted to [DevOps / SRE team].
2. Production access must use individual named accounts — shared credentials are prohibited.
3. All production access sessions must be logged.
4. Direct database modifications in production are prohibited except during approved incident response or maintenance windows.
5. SSH access to production servers requires key-based authentication; password SSH is disabled.

### 1.10 Physical Access

Physical access to production infrastructure is inherited from AWS data center controls (AWS SOC 2 Type II report). CapitalForge does not operate physical data center infrastructure. A copy of the current AWS SOC 2 Type II report must be obtained annually and retained in the Document Vault.

---

## 2. Encryption Policy

### 2.1 Purpose

This policy establishes requirements for encrypting data at rest and in transit to protect the confidentiality and integrity of sensitive information handled by CapitalForge.

### 2.2 Scope

This policy applies to all data processed, stored, or transmitted by the CapitalForge platform, with particular emphasis on:
- Nonpublic Personal Information (NPI): SSNs, dates of birth, EINs
- Financial account data: bank account numbers, routing numbers
- Personal credit data: credit scores, tradeline details
- Authentication credentials and tokens
- Encryption keys themselves

### 2.3 Encryption at Rest

#### 2.3.1 Application-Level Field Encryption (NPI)

The following fields are encrypted using AES-256-GCM before being written to the database:

| Field | Model | Encryption Method |
|-------|-------|------------------|
| `ssn` | `BusinessOwner` | AES-256-GCM via `src/backend/utils/encryption.ts` |
| `dateOfBirth` | `BusinessOwner` | AES-256-GCM via `src/backend/utils/encryption.ts` |
| `ein` | `Business` | AES-256-GCM via `src/backend/utils/encryption.ts` |

Encryption keys are managed via the `ENCRYPTION_KEY` environment variable. The key is never stored in the database, code repository, or application logs.

#### 2.3.2 Database Encryption

PostgreSQL RDS instances must have encryption at rest enabled using AWS KMS. The KMS key must be a customer-managed key (CMK) for compliance documentation purposes. S3 buckets used for the Document Vault must have server-side encryption enabled (SSE-S3 or SSE-KMS).

#### 2.3.3 Prohibited Storage

The following must never be stored unencrypted:
- SSNs in any form (masked or partial SSNs may be stored in display fields only)
- Full dates of birth for individuals
- EINs
- Authentication credentials (passwords, API keys, OAuth tokens)
- Encryption keys

### 2.4 Encryption in Transit

1. All connections to and from the CapitalForge API must use TLS 1.2 or higher. TLS 1.0 and 1.1 are explicitly disabled.
2. The HSTS (HTTP Strict Transport Security) header must be set with `max-age=31536000; includeSubDomains`.
3. HTTP connections must redirect to HTTPS — no plaintext HTTP may be served.
4. Internal service-to-service communication (API to PostgreSQL, API to Redis) must use encrypted connections where supported.
5. The `helmet()` middleware enforces security headers including CSP, X-Frame-Options, and HSTS on all API responses.

### 2.5 Key Management

#### 2.5.1 Key Generation

Encryption keys must be generated using a cryptographically secure random number generator. Key length: AES-256 (256-bit keys).

#### 2.5.2 Key Storage

- Application encryption keys (`ENCRYPTION_KEY`): stored in [AWS Secrets Manager / HashiCorp Vault — operator to specify].
- Keys must never be committed to source code repositories.
- Keys must never appear in application logs.
- The `.env` file must be included in `.gitignore` and never committed.

#### 2.5.3 Key Rotation

- `ENCRYPTION_KEY` must be rotated at least every [12] months.
- Key rotation events must be logged in the key rotation log and retained in the Document Vault under legal hold.
- After rotation, previously encrypted data must be re-encrypted with the new key using a migration script before the old key is retired.
- During the rotation window, both old and new keys must be available to decrypt data (key versioning).

#### 2.5.4 Key Compromise

In the event of key compromise, the Incident Response Plan (`docs/soc2/incident-response.md`) must be activated immediately. Key compromise is classified as a P1 security incident.

### 2.6 Certificate Management

1. TLS certificates must be obtained from a trusted Certificate Authority (CA).
2. Certificates must be renewed before expiration. Certificate expiry monitoring must be configured.
3. Certificate private keys must be stored securely and access-controlled.
4. Wildcard certificates must not be used unless justified and approved by the CISO.

---

## 3. Incident Response Policy

### 3.1 Purpose

This policy establishes the framework for detecting, responding to, and recovering from security incidents affecting the CapitalForge platform. It defines roles, responsibilities, severity classifications, and communication requirements.

### 3.2 Scope

This policy applies to all security incidents involving CapitalForge systems, data, or operations, including:
- Unauthorized access to systems or data
- Data breaches affecting NPI or financial data
- Availability incidents (outages, DDoS)
- Malware or ransomware incidents
- Insider threat events
- Third-party / vendor incidents affecting CapitalForge data

> Detailed response procedures, communication templates, and post-mortem structure are documented in `docs/soc2/incident-response.md`.

### 3.3 Incident Severity and Response Times

| Severity | Definition | Initial Response SLA | Resolution SLA |
|----------|------------|---------------------|----------------|
| P1 — Critical | NPI/financial data breach; complete platform outage; active exploitation | 1 hour | 4 hours |
| P2 — High | Partial data exposure; significant performance degradation; key compromise | 4 hours | 24 hours |
| P3 — Medium | Limited availability impact; suspicious activity requiring investigation | 8 hours | 72 hours |
| P4 — Low | Non-critical anomalies; policy violations without data impact | 24 hours | 7 days |

### 3.4 Incident Commander

For P1 and P2 incidents, an Incident Commander must be designated within 30 minutes of incident declaration. The Incident Commander is responsible for coordinating response, making containment decisions, and authorizing communications.

### 3.5 Regulatory Notification Obligations

In the event of a data breach involving NPI:
- **GLBA Safeguards Rule (16 C.F.R. § 314.15):** Notify the FTC within 30 days of discovery of a breach affecting 500 or more customers.
- **State breach notification laws:** Most states require notification to affected individuals within [30–60] days. Legal counsel must be engaged immediately on any breach involving NPI.
- **Tenant notification:** Affected tenants must be notified within [72] hours of confirmed breach discovery.

### 3.6 Post-Incident Review

All P1 and P2 incidents must have a post-mortem completed within [5] business days of incident closure. Post-mortems are blameless and focused on systemic improvements. The post-mortem document must be retained in the Document Vault.

---

## 4. Change Management Policy

### 4.1 Purpose

This policy establishes procedures for managing changes to the CapitalForge platform to minimize risk of unauthorized changes, unintended service disruptions, or introduction of security vulnerabilities.

### 4.2 Scope

This policy applies to all changes to:
- Application code (backend API, frontend, shared libraries)
- Database schema (Prisma migrations)
- Infrastructure configuration (Docker, ECS, RDS, Redis)
- Security configurations (JWT TTLs, RBAC permissions, encryption settings)
- Third-party integrations (Twilio, credit bureaus, AWS services)

### 4.3 Change Types

| Change Type | Definition | Approval Required | Testing Required |
|-------------|------------|------------------|-----------------|
| Standard | Pre-approved, low-risk, routine changes (dependency patches, minor UI updates) | Engineering Lead | Unit + integration tests |
| Normal | Planned changes requiring review (new features, schema migrations, config changes) | Engineering Lead + one peer reviewer | Full test suite + staging deployment |
| Emergency | Urgent changes to restore service or address security vulnerability | Engineering Lead + CISO (concurrent notification) | Minimal viable test; full regression post-deployment |
| Security | Changes specifically to security controls (RBAC, encryption, auth) | CISO + Engineering Lead | Security-focused review + full regression |

### 4.4 Change Procedure

1. **Request:** All changes submitted as a Git branch following naming convention `ai-feature/<slug>` or `fix/<slug>`.
2. **Review:** Pull request opened; at minimum one peer code review required for Normal changes.
3. **Testing:** CI pipeline must pass (Vitest tests, linting). Test results must be attached to the PR.
4. **Staging Deployment:** Normal and Security changes must be deployed to staging and verified before production.
5. **Approval:** PR approved by Engineering Lead (and CISO for Security changes).
6. **Deployment:** Merge to main triggers deployment pipeline. Deployment time logged.
7. **Verification:** Post-deployment smoke test and health check verification.
8. **Rollback Plan:** Every production deployment must have a documented rollback procedure. For schema migrations, a rollback migration must exist.

### 4.5 Commit Standards

All commits must follow Conventional Commits specification:
- `feat:` — new feature
- `fix:` — bug fix
- `security:` — security fix (treated as Security change type)
- `chore:` — maintenance
- `docs:` — documentation
- `refactor:` — code refactor without behavior change
- `test:` — test additions/updates

Changes to compliance-critical modules (RBAC config, encryption utilities, consent vault, audit ledger) require a `security:` or explicit compliance flag in the commit message.

### 4.6 Emergency Change Procedures

1. Emergency changes may bypass the staging requirement but not the code review requirement.
2. The CISO must be notified within [30] minutes of emergency change initiation.
3. A Normal change post-deployment review must be conducted within [24] hours.
4. Emergency changes are flagged in the deployment log for quarterly review.

### 4.7 Database Migration Policy

1. All schema changes must be implemented as Prisma migrations (`prisma migrate dev`).
2. Migrations must be reversible where possible. Non-reversible migrations require CISO sign-off.
3. Migrations affecting columns containing NPI must include a data migration to re-encrypt with current encryption key.
4. Migrations are applied to staging before production.

---

## 5. Data Retention Policy

### 5.1 Purpose

This policy establishes the required retention periods for data processed by the CapitalForge platform, the procedures for secure data disposal, and the legal hold exception process.

> Detailed retention schedules by data type are documented in `docs/soc2/data-retention.md`.

### 5.2 Retention Principles

1. Data is retained for the minimum period necessary to satisfy legal, regulatory, and business requirements.
2. Retention periods are defined per data type in `docs/soc2/data-retention.md`.
3. Data subject to legal hold must not be deleted regardless of retention schedule.
4. Personal data must not be retained beyond its applicable retention period without documented justification.

### 5.3 Legal Hold

1. Legal hold is applied via the `Document.legalHold = true` flag in the Document Vault.
2. Legal hold requests must be documented and approved by the General Counsel or Chief Compliance Officer.
3. Documents under legal hold cannot be deleted via any system action (`DELETE /api/documents/:id` returns 403).
4. Legal hold status must be reviewed quarterly to determine if hold remains necessary.
5. Legal hold events are logged in the `audit_logs` table.

### 5.4 Data Disposal Procedure

1. Expired records must be identified via automated retention schedule job (to be implemented).
2. Deletion must be performed by an authorized system process, not manual ad-hoc queries.
3. All deletions are logged in `audit_logs` with actor, timestamp, and resource ID.
4. Encrypted fields do not need additional scrubbing if the encryption key is rotated/destroyed.
5. Deletion of records containing NPI should be preceded by confirming no active legal hold.
6. Disposal certificate: for bulk deletions of NPI, a disposal certificate must be generated and retained.

---

## 6. Vendor Management Policy

### 6.1 Purpose

This policy establishes requirements for assessing, onboarding, and monitoring third-party vendors that provide services to or access data from the CapitalForge platform.

> The detailed vendor assessment questionnaire and DPA framework are documented in `docs/soc2/vendor-assessment.md`.

### 6.2 Critical Vendors

CapitalForge's current critical vendors include:

| Vendor | Service | Data Shared | Risk Tier |
|--------|---------|-------------|-----------|
| Amazon Web Services (AWS) | Infrastructure (ECS, RDS, ElastiCache, S3) | All platform data | Critical |
| Twilio | Telephony / VoiceForge | Phone numbers, call records, TCPA consent | High |
| [Credit Bureau 1] | Credit data (Experian) | Business/owner identifiers | High |
| [Credit Bureau 2] | Credit data (TransUnion) | Business/owner identifiers | High |
| [Credit Bureau 3] | Credit data (Equifax) | Business/owner identifiers | High |
| [KYB Provider] | KYB/KYC verification | Business and owner PII | High |

### 6.3 Vendor Onboarding Requirements

All Critical and High-tier vendors must:
1. Complete the vendor security questionnaire (`docs/soc2/vendor-assessment.md`)
2. Provide evidence of SOC 2 Type II report (or equivalent) not older than 12 months
3. Execute a Data Processing Agreement (DPA) before any data is shared
4. Provide privacy policy and data retention schedule
5. Be approved by the CISO

### 6.4 Ongoing Vendor Monitoring

1. Annual review for all Critical and High-tier vendors.
2. Collect updated SOC 2 Type II report annually.
3. Review any vendor security incidents disclosed in their trust center or notifications.
4. Re-assess DPA terms when vendor materially changes data processing practices.
5. Maintain vendor inventory with last review date in the Document Vault.

### 6.5 Vendor Offboarding

1. Upon vendor termination, confirm data deletion or return per DPA requirements.
2. Obtain written data deletion certification from vendor.
3. Revoke all API keys, OAuth tokens, and credentials provided to the vendor.
4. Remove vendor from authorized access lists.

---

## 7. Acceptable Use Policy

### 7.1 Purpose

This policy defines acceptable use of CapitalForge systems and data by employees, contractors, and advisors to prevent misuse and protect platform integrity.

### 7.2 Permitted Uses

Users may access CapitalForge systems solely for:
- Performing authorized job functions within their assigned role
- Processing client and business data as required by their role
- Compliance monitoring and reporting activities

### 7.3 Prohibited Uses

The following activities are strictly prohibited:

1. **Unauthorized access:** Attempting to access data, systems, or accounts beyond your assigned permissions.
2. **Data exfiltration:** Copying, downloading, or transmitting platform data to unauthorized locations.
3. **Credential sharing:** Sharing usernames, passwords, or API tokens with any other person.
4. **Bypassing controls:** Circumventing authentication, authorization, or audit logging controls.
5. **Personal use:** Using platform systems for personal business or non-work purposes.
6. **Sensitive data mishandling:** Discussing or transmitting NPI (SSNs, DOBs, credit data) via unencrypted channels (email, Slack, SMS).
7. **Direct database access:** Querying production databases directly without change management approval.
8. **Unauthorized integrations:** Connecting third-party applications or services to CapitalForge without CISO approval.

### 7.4 Monitoring and Enforcement

Users should have no expectation of privacy on CapitalForge systems. All access is logged via `audit_logs` and `ledger_events`. Violations of this policy may result in:
- Immediate access revocation
- Disciplinary action up to and including termination
- Legal action if applicable

---

## 8. Policy Acknowledgment

All users with access to CapitalForge systems must acknowledge receipt and understanding of these policies upon:
- Initial access provisioning
- Annual policy review (re-acknowledgment required)
- Material policy changes

Acknowledgment is captured via [HR system / Document Vault signature workflow]. Records are retained for [3] years.

---

**Document Control**

| Version | Date | Author | Summary of Changes |
|---------|------|--------|-------------------|
| 1.0 | 2026-03-31 | Engineering / Compliance Team | Initial version |

**Next Review Date:** 2027-03-31
