# CapitalForge — SOC 2 Controls Matrix

**Platform:** CapitalForge
**Version:** 1.0
**Last Updated:** 2026-03-31
**Owner:** Compliance Officer

> This matrix maps 54 controls to AICPA Trust Service Criteria. Each control includes its implementation source, evidence location, testing procedure, and responsible owner. This document is the primary artifact for SOC 2 Type II audit preparation.

---

## How to Read This Matrix

| Column | Description |
|--------|-------------|
| **Control ID** | Unique identifier (CC=Common Criteria/Security, A=Availability, PI=Processing Integrity, C=Confidentiality, P=Privacy) |
| **TSC Reference** | AICPA TSP 100 criterion mapped |
| **Control Description** | What the control does |
| **Implementation** | Which module, file, or service implements the control |
| **Evidence Location** | Where auditors find evidence (database table, log file, API endpoint, document) |
| **Testing Procedure** | How to verify the control is operating effectively |
| **Owner** | Responsible role for maintaining the control |
| **Status** | Implemented / Partial / Gap |

---

## Security Controls (CC)

### CC1 — Control Environment

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| CC1.1 | CC1.1 | Information security policy defines management's commitment to security | `docs/soc2/security-policies.md` | Policy document version history; acknowledgment records in Document Vault | Review policy document; verify annual review date; confirm executive sign-off | CISO / CEO | Partial |
| CC1.2 | CC1.2 | Organizational accountability for security — compliance officer role with defined responsibilities | `compliance_officer` RBAC role; `src/backend/middleware/rbac.middleware.ts` | User records in `users` table with `role = 'compliance_officer'`; permission matrix in RBAC config | Query `SELECT * FROM users WHERE role='compliance_officer'`; verify permissions match policy | Tenant Admin | Implemented |
| CC1.3 | CC1.3 | Code of conduct and acceptable use policy established and communicated | `docs/soc2/security-policies.md` (Section: Acceptable Use) | Policy document; employee acknowledgment records | Review policy; verify staff acknowledgment signatures | HR / Compliance Officer | Gap |

### CC2 — Communication & Information

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| CC2.1 | CC2.1 | Security policies communicated to all personnel | `docs/compliance.md`; `docs/soc2/security-policies.md` | Policy documents; training records | Verify policy published; confirm staff have read/acknowledged | Compliance Officer | Partial |
| CC2.2 | CC2.2 | Internal communication of security incidents and control deficiencies | `incident-response.md`; compliance findings workflow | `compliance_checks` table; `ledger_events` with `risk.alert.raised` | Query open findings; verify escalation path exists; review sample incidents | Compliance Officer | Partial |
| CC2.3 | CC2.3 | External communication of privacy practices to data subjects | Product Acknowledgment Engine (Module 11); GLBA privacy notice template | `acknowledgments` table; `product.reality.acknowledged` ledger events; Document Vault | Query acknowledgments by `acknowledgmentType='glba_privacy_notice'`; verify timestamps and signature refs | Compliance Officer | Implemented |

### CC3 — Risk Assessment

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| CC3.1 | CC3.1 | Annual risk assessment process identifies threats and vulnerabilities | Risk assessment procedure (to be documented) | Risk register document; annual review records | Review risk register; verify date of last assessment; confirm findings have remediation owners | CISO | Gap |
| CC3.2 | CC3.2 | Fraud risk identification and assessment | Fraud Detection module; `src/backend/services/fraud-detection.service.ts` | `compliance_checks` table with `checkType='fraud'`; `risk.alert.raised` ledger events | Run `POST /api/businesses/:id/fraud-check`; verify scoring logic; review flagged cases | Security Engineer | Implemented |
| CC3.3 | CC3.3 | Sanctions and adverse media screening | Sanctions Screening module; `src/backend/services/sanctions.service.ts` | `compliance_checks` table with `checkType='sanctions'`; OFAC/PEP results in payload | Run sanctions check on test business; verify OFAC SDN query; confirm PEP logic | Compliance Officer | Implemented |
| CC3.4 | CC3.4 | Risk assessment includes third-party and vendor risks | Vendor Assessment Template (`docs/soc2/vendor-assessment.md`) | Vendor assessment records; DPA agreements in Document Vault | Review vendor list; verify DPAs exist; confirm annual review dates | Compliance Officer | Partial |

### CC4 — Monitoring Activities

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| CC4.1 | CC4.1 | Controls monitored on an ongoing basis | Canonical Audit Ledger (Module 4); `src/backend/services/event-bus.ts` | `ledger_events` table (append-only); `audit_logs` table | Query `SELECT COUNT(*) FROM ledger_events WHERE createdAt > NOW()-INTERVAL '24 hours'`; verify events are being written | DevOps / Compliance Officer | Implemented |
| CC4.2 | CC4.2 | Deficiencies identified and communicated to responsible parties | UDAP/UDAAP Compliance Monitor findings workflow | `compliance_checks` table with unresolved `findings`; `risk.alert.raised` events | Query open compliance checks with `resolvedAt IS NULL`; verify responsible owner assigned | Compliance Officer | Partial |

### CC5 — Control Activities

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| CC5.1 | CC5.1 | Controls mitigate identified risks | `docs/soc2/controls-matrix.md` (this document); security policies | This controls matrix; gap analysis in `soc2-overview.md` | Review matrix for completeness; verify each identified risk maps to at least one control | CISO / Compliance Officer | Partial |
| CC5.2 | CC5.2 | Segregation of duties prevents single person from controlling end-to-end process | RBAC middleware; `src/backend/config/rbac.config.ts` | `users` table role assignments; RBAC permission matrix | Verify `advisor` cannot access `compliance:write`; verify `client` cannot access `application:submit`; test permission matrix | Security Engineer | Implemented |
| CC5.3 | CC5.3 | Technology controls deployed to enforce policies | Input validation (Zod); tenant isolation (triple-layer); token management | All API route handlers; `src/backend/middleware/`; Prisma schema with RLS | Attempt cross-tenant request; verify 403; submit invalid Zod payload; verify rejection | Security Engineer | Implemented |

### CC6 — Logical and Physical Access

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| CC6.1 | CC6.1 | Logical access controls protect system components | JWT auth (`requireAuth()` middleware); RBAC (`rbacMiddleware()`) | `audit_logs` for login/logout events; JWT config (15min/7day TTL) | Attempt unauthenticated API call; verify 401; attempt wrong-role action; verify 403 | Security Engineer | Implemented |
| CC6.2 | CC6.2 | New user access provisioned based on least privilege | `POST /api/auth/register` with role assignment; admin approval flow | `users` table; `audit_logs` for registration events | Register test user; verify default role `advisor`; confirm `super_admin` cannot self-register | Security Engineer | Implemented |
| CC6.3 | CC6.3 | Privileged access reviewed and restricted | `super_admin` role restricted; cannot self-register; `admin:tenant` permission required | `users` table with `role='super_admin'`; admin endpoint access logs | Query count of `super_admin` users; verify none self-registered; confirm admin routes require permission | Tenant Admin | Implemented |
| CC6.4 | CC6.4 | Access revoked promptly upon termination or role change | `isActive` flag; JTI token blocklist in Redis; `PATCH /api/admin/users/:userId` | `users` table `isActive=false` records; Redis JTI blocklist | Deactivate test user; attempt token use; verify blocked; confirm Redis JTI entry | Security Engineer | Implemented |
| CC6.5 | CC6.5 | Identification and authentication required for system access | JWT with bcrypt password auth; `bcrypt` cost factor 12 | `users.passwordHash`; `audit_logs` for auth events | Attempt login with wrong password; verify failure; confirm bcrypt cost factor via code review | Security Engineer | Implemented |
| CC6.6 | CC6.6 | External users (tenants) authenticated before access granted | JWT Bearer token requirement on all `/api/*` routes; `X-Tenant-ID` header validation | `audit_logs`; tenant middleware validation logs | Attempt API call without JWT; verify 401; attempt with wrong tenant ID; verify 403 | Security Engineer | Implemented |
| CC6.7 | CC6.7 | Information transmitted over networks is encrypted | TLS 1.2+ enforced; HSTS via `helmet()`; `Dockerfile` / nginx configuration | nginx SSL config; HSTS header in HTTP responses; TLS certificate records | Run `curl -I https://api.capitalforge.io`; verify HSTS header; run SSL Labs test | DevOps | Implemented |
| CC6.8 | CC6.8 | Unauthorized access attempts detected and responded to | Fraud Detection velocity rules; rate limiting (planned); audit log monitoring | `compliance_checks` with `checkType='fraud'`; `audit_logs` for failed auth | Query failed login events in `audit_logs`; verify velocity rules fire on repeated failures | Security Engineer | Partial |

### CC7 — System Operations

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| CC7.1 | CC7.1 | Vulnerability management — systems patched and scanned | Dependency scanning (to be added to CI/CD); `package.json` | Dependabot / Snyk scan results; npm audit output | Run `npm audit`; review output; verify critical/high CVEs have remediation plan | DevOps | Gap |
| CC7.2 | CC7.2 | Security monitoring — anomalies and threats detected | `risk.alert.raised` events; Fraud Detection module | `ledger_events` with `eventType='risk.alert.raised'`; `compliance_checks` | Query risk alerts in last 30 days; verify alerts generated for anomalous behavior | Security Engineer | Partial |
| CC7.3 | CC7.3 | Security incidents evaluated and responded to | Incident Response Plan (`docs/soc2/incident-response.md`) | Incident log; post-mortem records; `risk.alert.raised` events | Tabletop exercise against incident scenario; verify P1 response < 1 hour | Compliance Officer | Partial |
| CC7.4 | CC7.4 | Identified security incidents contained and recovered from | Incident Response Plan; token revocation; tenant suspension | JTI blocklist entries; `users.isActive=false` records; `tenants.isActive=false` | Review incident response plan for containment steps; verify token revocation works | Compliance Officer | Partial |
| CC7.5 | CC7.5 | Identified security incidents disclosed and communicated | Incident Response communication templates (`docs/soc2/incident-response.md`) | Communication records; notification timestamps | Review incident communication templates; verify notification matrix covers regulators and affected parties | Compliance Officer | Partial |

### CC8 — Change Management

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| CC8.1 | CC8.1 | Changes to infrastructure and software authorized, tested, and approved | Git PR review process; Conventional Commits; CI test suite | GitHub PR history; `CHANGELOG.md`; Vitest test results | Review 5 sample PRs; verify code review approval; verify CI tests passed before merge | Engineering Lead | Partial |

### CC9 — Risk Mitigation

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| CC9.1 | CC9.1 | Risks from business disruptions identified and mitigated | BCP (to be documented); architecture redundancy | `docker-compose.prod.yml`; AWS architecture diagram | Review BCP document; confirm failover procedures are tested | DevOps | Gap |
| CC9.2 | CC9.2 | Third-party risks assessed and managed | Vendor Assessment Template (`docs/soc2/vendor-assessment.md`) | Vendor assessment records; signed DPAs in Document Vault | Review vendor list (Twilio, AWS, bureau providers); confirm DPAs signed; confirm annual review dates | Compliance Officer | Partial |

---

## Availability Controls (A)

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| A1.1 | A1.1 | Availability commitments and SLAs defined | SLA document (to be created) | SLA document; operator agreements | Review SLA document; confirm uptime target specified; confirm measurement methodology | Product / Legal | Gap |
| A1.2 | A1.2 | System performance monitored against commitments | `/api/health` endpoint; application monitoring | Health check responses; uptime monitoring logs | Call `GET /api/health`; verify `database: ok` and `redis: ok`; confirm monitoring alerts configured | DevOps | Partial |
| A1.3 | A1.3 | Backup and recovery procedures | AWS RDS automated backups; Redis persistence | RDS backup logs; RPO/RTO documentation | Verify RDS backup retention period; confirm last successful backup; test restore procedure | DevOps | Partial |
| A1.4 | A1.4 | Disaster recovery plan exists and is tested | DR plan (to be documented) | DR plan document; tabletop exercise records | Review DR plan; confirm last test date; verify RTO/RPO targets met in test | DevOps | Gap |
| A1.5 | A1.5 | Capacity planning prevents availability failures | Horizontal scaling architecture (ECS) | Architecture documentation; auto-scaling config | Review ECS auto-scaling config; confirm load testing results exist | DevOps | Partial |

---

## Processing Integrity Controls (PI)

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| PI1.1 | PI1.1 | All inputs validated before processing | Zod schemas on all API routes; `src/backend/api/**/*.ts` | Route handler Zod schemas; validation error logs | Submit malformed payloads to 5 API endpoints; verify 400 with schema error; review Zod schemas | Security Engineer | Implemented |
| PI1.2 | PI1.2 | Processing completeness — all transactions captured | Event-sourced ledger; atomic `INSERT INTO ledger_events` before side effects | `ledger_events` table row count consistency; event sequence numbers | Verify event written before external call in `event-bus.ts`; check for orphaned transactions | Security Engineer | Implemented |
| PI1.3 | PI1.3 | Financial calculations accurate and verifiable | Leverage Calculator (Module 5); `CostCalculation` records | `cost_calculations` table; deterministic APR formula in `leverage.service.ts` | Run calculation with known inputs; verify APR matches expected formula; compare stored vs. recalculated | Engineering Lead | Implemented |
| PI1.4 | PI1.4 | Errors detected and corrected | `ApiResponse` error envelope; typed error codes; rollback on ledger failure | API error response logs; `ledger_events` for failed transactions | Inject DB failure; verify rollback; confirm error response includes error code | Engineering Lead | Implemented |
| PI1.5 | PI1.5 | Output integrity — outputs match intended processing | Typed API responses (`ApiResponse` envelope); Prisma typed queries | API response schemas; test suite assertions | Review 5 API endpoints for typed responses; run integration tests | Engineering Lead | Implemented |
| PI1.6 | PI1.6 | Processing authorized before execution | Auth + RBAC on all routes; consent gate; no-go enforcement | `audit_logs`; `suitability_checks` with `noGoTriggered`; `consent_records` | Test no-go block: submit business that triggers no-go; verify workflow blocks; verify override requires supervisor | Compliance Officer | Implemented |

---

## Confidentiality Controls (C)

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| C1.1 | C1.1 | Confidential information identified and classified | Data classification policy (to be documented); NPI field tagging | Schema field comments; encryption applied to NPI fields | Review `schema.prisma` for SSN/DOB/EIN fields; verify encryption middleware; confirm classification policy | Compliance Officer | Partial |
| C1.2 | C1.2 | Confidential information protected during processing | AES-256-GCM field-level encryption; `src/backend/utils/encryption.ts` | Encrypted `businessOwners.ssn`; encrypted `businessOwners.dateOfBirth`; encrypted `businesses.ein` | Read SSN from DB directly; verify ciphertext not plaintext; verify only decrypted in service layer | Security Engineer | Implemented |
| C1.3 | C1.3 | Confidential information protected in transit | TLS 1.2+; HSTS; no plaintext channels | nginx SSL configuration; HSTS header | Run SSL Labs scan; verify TLS 1.2+ only; verify HSTS header with 1-year max-age | DevOps | Implemented |
| C1.4 | C1.4 | Confidential information protected at rest | PostgreSQL encrypted storage; AES-256-GCM for NPI fields; S3 server-side encryption | AWS RDS encryption-at-rest setting; `ENCRYPTION_KEY` environment variable usage | Verify RDS encryption enabled; verify S3 bucket SSE-S3 or SSE-KMS; review `encryption.ts` | DevOps | Implemented |
| C1.5 | C1.5 | Confidential information access restricted to authorized users | Triple-layer tenant isolation; RBAC `business:read` permission | Prisma RLS policies; `audit_logs` for NPI access | Attempt cross-tenant read; verify 403; verify NPI access logged in `audit_logs` | Security Engineer | Implemented |
| C1.6 | C1.6 | Confidential information disposed of securely | Document Vault legal hold; soft-delete with hold check; `DELETE /api/documents/:id` | `documents.legalHold` flag; deletion audit events | Attempt delete of legal-hold document; verify 403; confirm deletion events in `audit_logs` | Compliance Officer | Partial |
| C1.7 | C1.7 | Encryption key management | `ENCRYPTION_KEY` env var; key rotation procedure (to be documented) | Key management procedure document; key rotation log | Review key management procedure; confirm rotation schedule; verify key not stored in database | DevOps / CISO | Partial |

---

## Privacy Controls (P)

| Control ID | TSC Ref | Control Description | Implementation | Evidence Location | Testing Procedure | Owner | Status |
|------------|---------|---------------------|----------------|-------------------|-------------------|-------|--------|
| P1.1 | P1.1 | Privacy notice provided to data subjects | Product Acknowledgment Engine (Module 11); GLBA privacy notice template | `acknowledgments` table; `ledger_events` with `product.reality.acknowledged`; Document Vault | Query acknowledgments with `type='glba_privacy_notice'`; verify signature ref present; confirm version current | Compliance Officer | Implemented |
| P2.1 | P2.1 | Consent obtained before collecting or using personal information | TCPA Consent Vault (Module 10); `consentService.verifyConsent()` | `consent_records` table; `consent.captured` ledger events | Attempt communication without consent record; verify gate blocks; query consent records | Compliance Officer | Implemented |
| P2.2 | P2.2 | Consent revocation honored promptly | `DELETE /api/consent/:consentId`; immediate effect; `consent.revoked` event | `consent_records.status='revoked'`; `consent.revoked` ledger events | Revoke consent; attempt communication; verify gate blocks; confirm event written | Compliance Officer | Implemented |
| P3.1 | P3.1 | Collection limited to information necessary for purpose | Business onboarding form fields mapped to regulatory requirements | `schema.prisma` Business/BusinessOwner models; field-to-purpose mapping | Review each collected field against stated purpose; confirm no extraneous PII collected | Compliance Officer | Implemented |
| P3.2 | P3.2 | Sensitive personal information (SPI) collected with explicit consent | SSN/DOB collected in KYB workflow with explicit purpose disclosure | Beneficial owner intake form acknowledgment; `kyc.verified` events | Review onboarding UX for explicit purpose disclosure; confirm SSN not collected without KYB consent | Compliance Officer | Implemented |
| P4.1 | P4.1 | Personal information retained only as long as necessary | Data Retention Schedule (`docs/soc2/data-retention.md`) | Retention schedule document; `documents.legalHold` flag | Review retention schedule; verify deletion procedures exist; confirm legal hold prevents premature deletion | Compliance Officer | Partial |
| P4.2 | P4.2 | Personal information disposal documented and verified | Document Vault deletion with audit; legal hold enforcement | `audit_logs` for deletion events; `documents.deletedAt` | Query deletion audit events; verify legal hold prevents deletion; confirm disposal certification procedure | Compliance Officer | Partial |
| P5.1 | P5.1 | Data subject access requests fulfilled | DSR workflow (to be documented) | DSR request log; fulfillment records | Verify DSR procedure exists; test fulfillment against sample request | Compliance Officer | Gap |
| P6.1 | P6.1 | Personal information not disclosed without consent or legal basis | Tenant isolation prevents cross-tenant disclosure; webhook delivery controls | Tenant isolation test results; webhook configuration audit | Attempt cross-tenant API call; verify 403; review webhook payloads for PII minimization | Security Engineer | Implemented |
| P6.2 | P6.2 | Government / legal requests handled per documented procedure | Legal request procedure (to be documented) | Legal request log; response records | Verify legal request procedure exists; confirm legal counsel contact chain | Legal / Compliance Officer | Gap |
| P7.1 | P7.1 | Personal information accuracy maintained | `PATCH /api/businesses/:id`; KYB/KYC re-verification | Business update audit logs; KYB verification records | Verify business update capability; confirm updates logged; review data quality checks | Engineering Lead | Implemented |
| P8.1 | P8.1 | Privacy complaints received and addressed | Privacy complaint procedure (to be documented) | Complaint intake log; resolution records | Verify complaint procedure exists; confirm compliance officer contact point | Compliance Officer | Gap |

---

## Control Summary Statistics

| Category | Implemented | Partial | Gap | Total |
|----------|-------------|---------|-----|-------|
| Security (CC) | 18 | 10 | 6 | 34 |
| Availability (A) | 0 | 3 | 2 | 5 |
| Processing Integrity (PI) | 6 | 0 | 0 | 6 |
| Confidentiality (C) | 4 | 3 | 0 | 7 |
| Privacy (P) | 6 | 2 | 4 | 12 |
| **Total** | **34** | **18** | **12** | **54** |

---

## Evidence Collection Schedule

| Evidence Type | Collection Frequency | Responsible | Storage Location |
|--------------|---------------------|-------------|-----------------|
| Ledger event count (daily) | Daily automated | DevOps | Monitoring dashboard |
| User access review | Quarterly | Tenant Admin | HR records + Document Vault |
| Vendor assessment reviews | Annual | Compliance Officer | Document Vault |
| Vulnerability scan results | Weekly | DevOps | CI/CD artifact store |
| Penetration test report | Annual | CISO | Document Vault (legal hold) |
| Risk assessment | Annual | CISO | Document Vault |
| DR test results | Semi-annual | DevOps | Document Vault |
| Policy acknowledgments | On hire + annual | HR | Document Vault |
| Audit log exports | Monthly | Compliance Officer | Document Vault |
| Key rotation log | Per rotation event | DevOps | Document Vault (legal hold) |
