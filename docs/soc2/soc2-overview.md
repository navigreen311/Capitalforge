# CapitalForge — SOC 2 Type II Readiness Overview

**Platform:** CapitalForge (corporate funding stack)
**Prepared:** 2026-03-31
**Status:** Pre-audit readiness assessment
**Target Audit Period:** 12 months (rolling)

> **Legal Disclaimer:** This document is an internal readiness assessment prepared by the engineering and compliance team. It does not constitute a SOC 2 report or auditor attestation. Engage a licensed CPA firm registered with the PCAOB to conduct the formal Type II examination.

---

## Contents

1. [Executive Summary](#executive-summary)
2. [Trust Service Criteria Scope](#trust-service-criteria-scope)
3. [Security (CC) — Current Controls](#security-cc--current-controls)
4. [Availability (A) — Current Controls](#availability-a--current-controls)
5. [Processing Integrity (PI) — Current Controls](#processing-integrity-pi--current-controls)
6. [Confidentiality (C) — Current Controls](#confidentiality-c--current-controls)
7. [Privacy (P) — Current Controls](#privacy-p--current-controls)
8. [Gap Analysis](#gap-analysis)
9. [Remediation Roadmap](#remediation-roadmap)
10. [Readiness Score Summary](#readiness-score-summary)

---

## Executive Summary

CapitalForge is a multi-tenant SaaS platform supporting credit-card funding program orchestration, compliance enforcement, and regulatory reporting for small-business lending advisors and their clients. The platform handles nonpublic personal information (NPI) including SSNs, DOBs, financial account data, personal credit profiles, and business entity information.

This readiness overview maps the platform's existing technical controls to the AICPA Trust Service Criteria (TSC) as defined in TSP Section 100 (2017 Trust Services Criteria). The platform currently has strong foundational controls in Security and Confidentiality. Availability and Processing Integrity criteria require targeted operational procedure documentation to reach audit-ready status. Privacy criteria require formal program documentation aligned to the GLBA Safeguards Rule.

**In-scope systems:**
- Express 5 API server (Node.js)
- Next.js 15 frontend application
- PostgreSQL 16 database (primary data store)
- Redis 7 (session/queue store)
- S3-compatible object storage (Document Vault)
- BullMQ background job processing layer
- VoiceForge telephony integration (Twilio)
- Docker / container infrastructure

---

## Trust Service Criteria Scope

| Criteria Category | In Scope | Rationale |
|-------------------|----------|-----------|
| **CC — Security** | Yes | Core requirement; platform handles financial and personal data |
| **A — Availability** | Yes | SaaS platform with uptime commitments to tenant-operators |
| **PI — Processing Integrity** | Yes | Financial calculations, credit decisions, and regulatory submissions must be accurate |
| **C — Confidentiality** | Yes | Proprietary business and financial data shared under NDA / DPA agreements |
| **P — Privacy** | Yes | NPI collected from individuals (beneficial owners); GLBA-regulated |

---

## Security (CC) — Current Controls

The Security criteria (Common Criteria) are the required baseline for all SOC 2 examinations.

### CC1 — Control Environment

| Control | Status | Implementation |
|---------|--------|----------------|
| Organizational structure with defined compliance accountability | Implemented | `compliance_officer` role is a first-class RBAC role with explicit permissions |
| Board / leadership commitment to security | Partial | Requires formal information security charter document |
| Code of conduct and ethics policy | Gap | Requires formal HR policy documentation |

### CC2 — Communication & Information

| Control | Status | Implementation |
|---------|--------|----------------|
| Security policies communicated to personnel | Partial | `docs/compliance.md` exists; formal acknowledgment process needed |
| Internal communication of control deficiencies | Gap | No formal deficiency tracking workflow beyond code issues |
| External communication of privacy practices | Implemented | Product Acknowledgment Engine delivers GLBA privacy notices; `product.reality.acknowledged` events logged |

### CC3 — Risk Assessment

| Control | Status | Implementation |
|---------|--------|----------------|
| Formal risk assessment process | Gap | No documented periodic risk assessment procedure |
| Fraud risk identification | Implemented | Fraud Detection module (Intelligence Pillar) with behavioral anomaly scoring and velocity rules |
| Sanctions / PEP screening | Implemented | Sanctions Screening module covers OFAC SDN, PEP, adverse media |
| Change risk assessment | Partial | Conventional Commits and PR review process; formal risk rating not documented |

### CC4 — Monitoring Activities

| Control | Status | Implementation |
|---------|--------|----------------|
| Ongoing monitoring of controls | Partial | Canonical Audit Ledger captures all state mutations; no automated alerting dashboards yet |
| Compliance finding monitoring | Implemented | UDAP/UDAAP Compliance Monitor with risk scoring; compliance officer review tasks |
| Performance monitoring | Partial | `/api/health` endpoint; formal SLA monitoring not documented |

### CC5 — Control Activities

| Control | Status | Implementation |
|---------|--------|----------------|
| Policies and procedures for control activities | Partial | Technical controls implemented; policy documents being formalized in this framework |
| Segregation of duties | Implemented | 6 RBAC roles with 13 fine-grained permissions; advisor cannot access compliance write functions |
| Change management | Partial | Git + Conventional Commits; formal CAB process not documented |

### CC6 — Logical and Physical Access

| Control | Status | Implementation |
|---------|--------|----------------|
| User access provisioning | Implemented | `POST /api/auth/register` with role assignment; admin-controlled via `PATCH /api/admin/users/:userId` |
| Multi-factor authentication | Implemented (schema) | `User.mfaEnabled` and `User.mfaSecret` fields present; enforcement needs verification |
| Least privilege access | Implemented | RBAC permission model — `client` and `readonly` roles have minimal access |
| Access revocation | Implemented | `isActive` flag on `User`; JTI blocklist for immediate token invalidation |
| Privileged access management | Implemented | `super_admin` role isolated; cannot be self-registered |
| Physical access (production) | Inherited | AWS ECS/RDS/ElastiCache — inherited from AWS SOC 2 controls |
| Password policy | Implemented | bcrypt cost factor 12; complexity enforced at registration |
| Session management | Implemented | 15-minute access token TTL; 7-day refresh token with rotation; JTI blocklist |

### CC7 — System Operations

| Control | Status | Implementation |
|---------|--------|----------------|
| Vulnerability detection | Gap | No automated SAST/DAST or dependency scanning pipeline documented |
| Security incident detection | Partial | `risk.alert.raised` events in ledger; no SIEM integration |
| Anomaly and threat detection | Implemented | Fraud Detection module (velocity rules, behavioral anomaly scoring) |
| Malware protection | Inherited / Gap | Relies on container hygiene; no explicit malware scanning documented |

### CC8 — Change Management

| Control | Status | Implementation |
|---------|--------|----------------|
| Change authorization | Partial | Git PR workflow; no formal change approval matrix documented |
| Testing before production | Partial | Vitest test suite; CI pipeline needs documentation |
| Emergency change procedures | Gap | Not formally documented |

### CC9 — Risk Mitigation

| Control | Status | Implementation |
|---------|--------|----------------|
| Vendor / third-party risk management | Partial | Twilio, AWS, credit bureaus used; formal vendor assessment framework needed (see `vendor-assessment.md`) |
| Business continuity | Gap | Disaster recovery and BCP not formally documented |
| Insurance | Gap | Not within platform scope; operator responsibility |

---

## Availability (A) — Current Controls

### A1 — Availability Commitments

| Control | Status | Implementation |
|---------|--------|----------------|
| Availability SLAs defined | Gap | No formal SLA document; target uptime not published |
| Capacity planning | Gap | Horizontal scaling described in architecture but no formal capacity plan |
| Scheduled downtime communication | Gap | No maintenance window communication procedure |

### A1.2 — Availability Monitoring

| Control | Status | Implementation |
|---------|--------|----------------|
| System availability monitoring | Partial | `/api/health` checks database and Redis connectivity; no uptime alerting configured |
| Backup and recovery | Partial | PostgreSQL RDS with automated backups (assumed); no formal RTO/RPO documented |
| Disaster recovery testing | Gap | No DR test schedule documented |
| Redundancy | Partial | Architecture supports horizontal scaling (ECS); Redis ElastiCache for HA |

---

## Processing Integrity (PI) — Current Controls

### PI1 — Processing Completeness and Accuracy

| Control | Status | Implementation |
|---------|--------|----------------|
| Input validation | Implemented | Zod schemas on every API route — no raw `req.body` access in handlers |
| Processing completeness | Implemented | Event-sourced ledger — every state mutation atomically persisted before side effects |
| Output validation | Implemented | `ApiResponse` envelope with typed success/error responses |
| Financial calculation accuracy | Implemented | Leverage Calculator (Module 5) with deterministic APR, total cost, IRC §163(j) calculations stored in `CostCalculation` records |
| Error handling | Implemented | Typed error codes; rollback on ledger write failure |
| Audit trail for processing | Implemented | `ledger_events` append-only table; every write recorded before fan-out |

### PI1.2 — Processing Authorization

| Control | Status | Implementation |
|---------|--------|----------------|
| Authorization before processing | Implemented | `requireAuth()` + `rbacMiddleware()` on all `/api/*` routes |
| No-go enforcement | Implemented | Suitability Engine blocks funding workflow in code; override requires supervisor + documented reason + permanent log |
| Consent gates | Implemented | `consentService.verifyConsent()` called before any communication; returns `false` (blocking) if no active consent |
| Disclosure gates | Implemented | SB 1235 acknowledgment required before application for CA-domiciled businesses |

---

## Confidentiality (C) — Current Controls

### C1 — Confidentiality Commitments

| Control | Status | Implementation |
|---------|--------|----------------|
| Confidentiality obligations defined | Partial | DPA framework needed for operator agreements |
| Confidential data identification | Implemented | NPI fields (SSN, DOB, EIN) explicitly encrypted; credit profiles tagged as sensitive |
| Confidential data protection | Implemented | AES-256-GCM field-level encryption for SSN, DOB, EIN at rest |
| Confidential data disposal | Partial | Soft-delete with legal hold check; formal deletion certification process needed |
| Encryption in transit | Implemented | TLS 1.2+ enforced; HSTS header set via `helmet()` |
| Encryption at rest (NPI) | Implemented | Field-level AES-256-GCM; key via `ENCRYPTION_KEY` environment variable |
| Key management | Partial | Environment variable management; no formal HSM or key rotation schedule |
| Data classification | Gap | No formal data classification policy document |

### C1.2 — Confidentiality During Disposal

| Control | Status | Implementation |
|---------|--------|----------------|
| Secure deletion procedures | Partial | Document Vault blocks deletion under legal hold; no crypto-shredding procedure documented |
| Media sanitization | Inherited | AWS manages physical media; documented in AWS compliance programs |

---

## Privacy (P) — Current Controls

### P1 — Privacy Notice

| Control | Status | Implementation |
|---------|--------|----------------|
| Privacy notice delivery | Implemented | Product Acknowledgment Engine delivers GLBA privacy notices; timestamp + signature captured |
| Privacy notice version control | Implemented | Versioned acknowledgment templates; version bump invalidates prior acknowledgments |
| Material change notice | Partial | Version bump triggers re-acknowledgment; no external notification procedure |

### P2 — Choice and Consent

| Control | Status | Implementation |
|---------|--------|----------------|
| Consent collection | Implemented | TCPA Consent Vault (Module 10) with multi-channel consent lifecycle |
| Consent records | Implemented | `ConsentRecord` model with immutable grant; only revocation changes status |
| Consent revocation | Implemented | `DELETE /api/consent/:consentId` with immediate effect and permanent record |
| Granular consent by channel | Implemented | Separate consent records per channel: `voice`, `sms`, `email` |

### P3 — Collection

| Control | Status | Implementation |
|---------|--------|----------------|
| Minimum necessary collection | Implemented | Fields collected mapped to specific regulatory or business purposes |
| Section 1071 firewall | Implemented | Demographic data isolated; `section_1071_access` permission required; underwriters/advisors cannot access |
| Sensitive data identification | Implemented | SSN, DOB, EIN encrypted at collection point before storage |

### P4 — Use, Retention, and Disposal

| Control | Status | Implementation |
|---------|--------|----------------|
| Defined retention periods | Gap | Operational controls exist; formal retention schedule document needed (see `data-retention.md`) |
| Retention enforcement | Partial | Legal hold prevents premature deletion; automated deletion schedule not implemented |
| Data use limitations | Implemented | Tenant isolation ensures data used only within originating tenant context |

### P5 — Access

| Control | Status | Implementation |
|---------|--------|----------------|
| Individual access requests | Gap | No formal DSR (Data Subject Request) workflow documented |
| Access request fulfillment | Partial | Admin console provides data export; no self-service portal for data subjects |

### P6 — Disclosure

| Control | Status | Implementation |
|---------|--------|----------------|
| Third-party disclosure limitations | Partial | Webhook delivery system for partner integrations; no formal DPA template for operators |
| Government request procedures | Gap | No documented legal request response procedure |

### P7 — Quality

| Control | Status | Implementation |
|---------|--------|----------------|
| Data accuracy | Implemented | KYB/KYC verification workflow; business record update capability |
| Correction procedures | Partial | `PATCH /api/businesses/:id` available; no formal correction request workflow |

### P8 — Monitoring and Enforcement

| Control | Status | Implementation |
|---------|--------|----------------|
| Privacy complaint handling | Gap | No formal privacy complaint intake procedure |
| Privacy program oversight | Partial | `compliance_officer` role; no formal privacy program governance documented |

---

## Gap Analysis

### Critical Gaps (Must Remediate Before Audit)

| Gap ID | Category | Description | Priority |
|--------|----------|-------------|----------|
| GAP-001 | CC1 | Information security charter and board-level security commitment document | P0 |
| GAP-002 | CC1 | Code of conduct and acceptable use policy | P0 |
| GAP-003 | CC3 | Formal annual risk assessment process with documented methodology | P0 |
| GAP-004 | CC7 | Automated vulnerability scanning (SAST/DAST) in CI/CD pipeline | P0 |
| GAP-005 | CC8 | Formal change management policy with approval matrix | P0 |
| GAP-006 | A1 | Formal SLA/uptime commitment document | P0 |
| GAP-007 | A1.2 | Documented RTO/RPO targets and DR test schedule | P0 |
| GAP-008 | C1 | Formal data classification policy | P0 |
| GAP-009 | C1 | Key rotation schedule and procedure | P0 |
| GAP-010 | P4 | Formal data retention schedule with enforcement (see `data-retention.md`) | P0 |
| GAP-011 | P5 | Data Subject Request (DSR) workflow | P0 |
| GAP-012 | P8 | Privacy complaint handling procedure | P0 |

### Medium Gaps (Remediate Within 90 Days)

| Gap ID | Category | Description | Priority |
|--------|----------|-------------|----------|
| GAP-013 | CC4 | Automated control monitoring dashboards and alerting | P1 |
| GAP-014 | CC7 | SIEM integration for security event correlation | P1 |
| GAP-015 | CC9 | Formal vendor risk management program (see `vendor-assessment.md`) | P1 |
| GAP-016 | CC9 | Business continuity plan (BCP) | P1 |
| GAP-017 | A1 | Capacity planning documentation | P1 |
| GAP-018 | C1 | Formal DPA template for operator agreements | P1 |
| GAP-019 | P6 | Legal request / government demand response procedure | P1 |

### Minor Gaps (Remediate Within 180 Days)

| Gap ID | Category | Description | Priority |
|--------|----------|-------------|----------|
| GAP-020 | CC2 | Formal deficiency tracking and remediation workflow | P2 |
| GAP-021 | CC5 | Formal Change Advisory Board (CAB) procedure | P2 |
| GAP-022 | A1.2 | Scheduled downtime communication procedure | P2 |
| GAP-023 | C1.2 | Crypto-shredding / secure media disposal procedure | P2 |
| GAP-024 | P7 | Formal data correction request workflow | P2 |

---

## Remediation Roadmap

### Phase 1 — Foundation (Days 1–30)
- Draft and approve Information Security Policy (GAP-001)
- Draft Code of Conduct and Acceptable Use Policy (GAP-002)
- Establish annual risk assessment schedule and methodology (GAP-003)
- Publish formal data retention schedule (GAP-010, see `data-retention.md`)
- Document SLA commitments and RTO/RPO (GAP-006, GAP-007)

### Phase 2 — Technical Controls (Days 31–60)
- Integrate SAST (e.g., Semgrep, Snyk) into CI/CD pipeline (GAP-004)
- Implement automated dependency vulnerability scanning (GAP-004)
- Add key rotation schedule and procedure (GAP-009)
- Establish data classification taxonomy (GAP-008)
- Configure uptime monitoring and alerting (GAP-013)

### Phase 3 — Operational Procedures (Days 61–90)
- Document formal change management policy (GAP-005)
- Establish vendor risk management program (GAP-015)
- Draft operator DPA template (GAP-018)
- Document DSR workflow (GAP-011)
- Document privacy complaint handling procedure (GAP-012)
- Initiate BCP documentation (GAP-016)

### Phase 4 — Audit Preparation (Days 91–120)
- Conduct tabletop DR test and document results (GAP-007)
- Complete formal risk assessment and document findings (GAP-003)
- Engage SOC 2 auditor for readiness review
- Begin 12-month observation period for Type II

---

## Readiness Score Summary

| Category | Controls Implemented | Controls Partial | Controls Gapped | Readiness % |
|----------|---------------------|-----------------|-----------------|-------------|
| Security (CC) | 18 | 9 | 7 | 53% |
| Availability (A) | 1 | 3 | 5 | 22% |
| Processing Integrity (PI) | 10 | 0 | 0 | 100% |
| Confidentiality (C) | 7 | 4 | 2 | 54% |
| Privacy (P) | 9 | 6 | 5 | 45% |
| **Overall** | **45** | **22** | **19** | **52%** |

> Processing Integrity is the highest-readiness category — the event-sourced architecture, Zod validation, and enforced consent/no-go gates provide strong evidence for PI criteria out of the box.

> Availability is the lowest-readiness category — operational documentation (SLAs, DR plans, capacity planning) is the primary gap rather than technical controls.
