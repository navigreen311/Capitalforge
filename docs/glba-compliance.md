# CapitalForge — GLBA Compliance Documentation

**Platform:** CapitalForge
**Regulation:** Gramm-Leach-Bliley Act (15 U.S.C. § 6801 et seq.)
**Key Rule:** FTC Safeguards Rule (16 C.F.R. Part 314), effective 2023 amended version
**Version:** 1.0
**Last Updated:** 2026-03-31
**Owner:** Chief Compliance Officer

> **Legal Disclaimer:** This document describes technical and operational controls implemented in the CapitalForge platform mapped to GLBA requirements. It does not constitute legal advice. Operator entities must engage qualified legal counsel to confirm their GLBA obligations based on their specific business activities, structure, and state of operation.

---

## Contents

1. [Regulatory Overview](#1-regulatory-overview)
2. [Applicability Determination](#2-applicability-determination)
3. [FTC Safeguards Rule — Information Security Program](#3-ftc-safeguards-rule--information-security-program)
4. [Privacy Notice Requirements (Regulation P)](#4-privacy-notice-requirements-regulation-p)
5. [Platform Controls Mapped to Safeguards Rule Elements](#5-platform-controls-mapped-to-safeguards-rule-elements)
6. [NPI Inventory and Data Flow](#6-npi-inventory-and-data-flow)
7. [Operator Responsibilities](#7-operator-responsibilities)
8. [Annual Review Checklist](#8-annual-review-checklist)

---

## 1. Regulatory Overview

### 1.1 Gramm-Leach-Bliley Act (GLBA)

The Gramm-Leach-Bliley Act (15 U.S.C. § 6801 et seq.) imposes obligations on "financial institutions" to:

1. **Protect the security and confidentiality** of customer nonpublic personal information (NPI).
2. **Protect against anticipated threats** to NPI security or integrity.
3. **Protect against unauthorized access** to NPI that could result in substantial harm or inconvenience to customers.

### 1.2 FTC Safeguards Rule (16 C.F.R. Part 314)

The FTC Safeguards Rule implements GLBA for non-bank financial institutions under FTC jurisdiction. The 2023 amended rule (effective June 9, 2023) requires a written Information Security Program containing specific administrative, technical, and physical safeguards.

The amended rule applies to financial institutions with 5,000 or more customer records. Institutions below the threshold have a simplified requirement but must still maintain a basic information security program.

### 1.3 GLBA Privacy Rule (Regulation P / 16 C.F.R. Part 313)

The GLBA Privacy Rule requires financial institutions to:
- Provide initial and annual privacy notices to customers explaining NPI collection and sharing practices.
- Give customers the right to opt out of certain NPI sharing with non-affiliated third parties.
- Limit NPI disclosure to non-affiliated third parties who are not service providers.

### 1.4 Breach Notification Rule (16 C.F.R. § 314.15)

Added to the FTC Safeguards Rule in 2023: financial institutions must notify the FTC within **30 days** of discovering a data breach affecting **500 or more customers**. Affected customers must also be notified.

---

## 2. Applicability Determination

### 2.1 Is CapitalForge a Financial Institution Under GLBA?

GLBA applies to "financial institutions" — companies that are significantly engaged in financial activities. The FTC's Safeguards Rule applies to non-bank financial institutions.

**CapitalForge qualifies as a financial institution subject to GLBA because it:**
- Facilitates the origination and processing of credit card applications for business funding purposes (credit activities)
- Processes personal credit data (consumer credit reports) for beneficial owners
- Stores and processes NPI including SSNs, DOBs, and financial account information
- Provides financial advisory and funding orchestration services to business clients

### 2.2 Tenant-Operator Classification

Tenant-operators using the CapitalForge platform (funding advisors, brokers) are independently subject to GLBA based on their own activities. CapitalForge serves as a **service provider** to these operators within the meaning of the Safeguards Rule.

**Implication:**
- CapitalForge must maintain an Information Security Program meeting Safeguards Rule standards.
- Tenant-operators must execute service provider agreements with CapitalForge confirming CapitalForge's security obligations.
- Tenant-operators bear independent responsibility for their own GLBA compliance program.

### 2.3 NPI Definition

NPI includes any personally identifiable financial information that a customer provides to obtain a financial product or service, that results from any transaction involving a financial product or service, or that is otherwise obtained in connection with providing a financial product or service.

**NPI processed by CapitalForge includes:**

| Category | Examples | Platform Location |
|----------|----------|------------------|
| Identity information | Full name, SSN, DOB, address | `business_owners` table |
| Business identity | EIN, legal entity name | `businesses` table |
| Financial information | Annual revenue, monthly revenue, banking info | `businesses` table |
| Credit information | Credit scores, tradelines, inquiry history, utilization | `credit_profiles` table |
| Account application information | Card applications, approval/denial | `card_applications` table |
| Financial calculations | APR, total cost of capital, leverage ratios | `cost_calculations` table |

---

## 3. FTC Safeguards Rule — Information Security Program

The amended FTC Safeguards Rule (16 C.F.R. § 314.4) requires the following 9 elements in the Information Security Program. CapitalForge's implementation status for each is mapped below.

### Element 1: Qualified Individual (§ 314.4(a))

> *Designate a qualified individual responsible for overseeing, implementing, and enforcing your information security program.*

**CapitalForge Implementation:**
- The `compliance_officer` role is designated as the qualified individual for tenant-level oversight.
- At the company level, a CISO must be designated.
- The qualified individual must report to the board or senior management at least annually.

**Status:** Partial — `compliance_officer` role exists in platform; formal designation document needed.

**Evidence:** `users` table with `role='compliance_officer'`; annual board/executive report (to be documented).

---

### Element 2: Risk Assessment (§ 314.4(b))

> *Conduct a risk assessment to identify reasonably foreseeable internal and external risks to the security, confidentiality, and integrity of customer information.*

**CapitalForge Implementation:**

| Risk Domain | Existing Control | Platform Location |
|-------------|-----------------|------------------|
| Unauthorized access to NPI | Triple-layer tenant isolation; RBAC | Middleware + Prisma + PostgreSQL RLS |
| Credential compromise | bcrypt + MFA + JTI blocklist | `users` table; Redis blocklist |
| SQL injection | Prisma parameterized queries; Zod validation | All API routes |
| Cross-tenant data leakage | Prisma extension enforcing tenantId on all queries | `src/backend/middleware/` |
| Insider threat | Audit logging of all NPI access; RBAC least privilege | `audit_logs` table |
| Third-party breach | Vendor assessment framework | `docs/soc2/vendor-assessment.md` |
| Ransomware / malware | Container-based isolation; no direct OS access | Docker / ECS |
| Fraud and identity spoofing | Fraud Detection module; KYB/KYC verification | Fraud Detection service |

**Formal Risk Assessment:** Annual documented risk assessment required (currently a gap — see GAP-003 in `soc2-overview.md`).

**Status:** Partial — technical controls in place; formal documented annual risk assessment not yet established.

---

### Element 3: Design and Implement Safeguards (§ 314.4(c))

> *Design and implement safeguards to control risks identified through your risk assessment.*

**Access Controls (§ 314.4(c)(1)):**

| Safeguard | Implementation | Evidence |
|-----------|---------------|---------|
| Authentication | JWT (JOSE); bcrypt cost factor 12; 15-min access token TTL | Auth service; `users.passwordHash` |
| MFA | `User.mfaEnabled` flag; TOTP implementation | `users` table `mfaEnabled` field |
| Least privilege | 6 RBAC roles; 13 fine-grained permissions | RBAC config; role-permission matrix |
| Access revocation | `isActive` flag + JTI blocklist | `users.isActive`; Redis `jti:*` keys |
| Privileged access | `super_admin` cannot self-register; requires dual authorization | Registration validation |
| Third-party access | API key-based vendor access; documented in vendor registry | Vendor inventory |

**Encryption (§ 314.4(c)(2)):**

| Safeguard | Implementation | Evidence |
|-----------|---------------|---------|
| NPI encryption at rest | AES-256-GCM for SSN, DOB, EIN | `src/backend/utils/encryption.ts` |
| Encryption in transit | TLS 1.2+; HSTS via helmet() | nginx SSL config; HTTP headers |
| Key management | `ENCRYPTION_KEY` env var; rotation schedule needed | `.env.example`; key rotation log |

**Monitoring and Testing (§ 314.4(c)(3) and (4)):**

| Safeguard | Implementation | Evidence |
|-----------|---------------|---------|
| Audit logging | Immutable `audit_logs` and `ledger_events` tables | Database tables; `GET /api/audit/events` |
| NPI access logging | All reads of NPI-containing resources logged | `audit_logs` with `resource` field |
| Anomaly detection | Fraud Detection module; velocity rules | `compliance_checks` table |
| Vulnerability scanning | To be added to CI/CD pipeline | CI/CD configuration (Gap) |
| Penetration testing | Annual engagement required | Document Vault (to be scheduled) |
| Change testing | CI Vitest suite; staging deployment | CI/CD pipeline; test reports |

---

### Element 4: Training (§ 314.4(d))

> *Provide your staff with security awareness training that is updated as necessary.*

**Required Training:**
- Annual security awareness training for all personnel
- Role-specific training for `compliance_officer` and `super_admin` roles
- Training acknowledgment captured and retained for [3] years

**Status:** Gap — formal training program not yet documented or implemented.

**Implementation Needed:** Annual training curriculum covering phishing, data handling, incident reporting, acceptable use.

---

### Element 5: Third-Party Service Providers (§ 314.4(f))

> *Oversee service providers by selecting and retaining those that maintain appropriate safeguards and requiring those providers by contract to implement and maintain appropriate safeguards.*

**CapitalForge Implementation:**
- Vendor Assessment Framework: `docs/soc2/vendor-assessment.md`
- DPA requirement for all Critical and High-tier vendors
- Annual vendor review including SOC 2 Type II collection
- GLBA-specific DPA provisions in vendor agreement template

**Current critical service providers requiring GLBA service provider agreements:**
- AWS (infrastructure and data hosting)
- Twilio (call recording storage, telephony)
- Credit bureaus (data recipients in permissible purpose pulls)
- KYB provider (NPI processing)

**Status:** Partial — framework documented; all DPAs must be executed and filed.

---

### Element 6: Evaluate and Adjust (§ 314.4(g))

> *Periodically evaluate and adjust your information security program in light of the results of testing, any material changes to operations or business arrangements, and any other circumstances that may have a material impact on your information security program.*

**CapitalForge Implementation:**
- SOC 2 controls matrix reviewed annually (this document set)
- Incident post-mortems feed control improvements
- `CHANGELOG.md` tracks system changes
- Annual vendor reviews identify third-party risk changes

**Status:** Partial — process documented; formal annual program review procedure needed.

---

### Element 7: Incident Response Plan (§ 314.4(h))

> *Establish a written incident response plan to respond to and recover from any security event materially affecting the confidentiality, integrity, or availability of customer information.*

**CapitalForge Implementation:** `docs/soc2/incident-response.md`

| Required Element | Implementation |
|-----------------|---------------|
| Goals of the plan | Contained in IRP Section 3 (Response Phases) |
| Internal processes for responding | IRP Sections 3 and 4 (Response Procedures + Platform Actions) |
| Defined roles and decision-making authority | IRP Section 2 (Escalation Matrix) |
| External and internal communications | IRP Section 5 (Communication Templates) |
| Remediation and incident documentation | IRP Sections 4, 6, and 7 |
| Documentation and reporting | IRP Section 7 (Incident Log) |
| Evaluation and revision of plan | Annual review cycle; post-incident review |

**Breach Notification (§ 314.15):**
- 30-day FTC notification window for breaches affecting 500+ customers
- FTC Safeguards notification form template included in IRP Section 5.3
- Customer notification template included in IRP Section 5.2

**Status:** Implemented — IRP documented and covers all required elements.

---

### Element 8: Annual Reporting (§ 314.4(i))

> *Require your qualified individual to report in writing to your board of directors (or equivalent governing body) on your information security program at least annually.*

**Required Annual Report Contents:**
- Status of the Information Security Program against the 9 Safeguards Rule elements
- Material matters related to the program (incidents, significant changes, test results)
- Results of risk assessment
- Proposed changes to the program

**Status:** Gap — template for annual board report needed; not yet established.

---

### Element 9: Encryption and Secure Development (§ 314.4(c)(2) and (5))

> *Encrypt all customer information held or transmitted by your financial institution, both in transit and at rest. Develop, test, and monitor applications.*

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| NPI encryption at rest | AES-256-GCM field-level encryption | Implemented |
| Encryption in transit | TLS 1.2+; HSTS | Implemented |
| Secure development practices | Zod input validation; Prisma parameterized queries; RBAC | Implemented |
| Application testing | Vitest test suite; staging deployment | Partial |
| SAST/DAST | Not yet in CI/CD pipeline | Gap |

---

## 4. Privacy Notice Requirements (Regulation P)

### 4.1 Initial Privacy Notice

**Requirement:** Provide a clear and conspicuous privacy notice to customers at the time of establishing a customer relationship.

**CapitalForge Implementation:**
- GLBA privacy notice delivered via the Product Acknowledgment Engine (Module 11)
- `acknowledgmentType: 'glba_privacy_notice'` captures delivery and signature
- Signed acknowledgment stored in Document Vault with SHA-256 hash and crypto-timestamp
- `product.reality.acknowledged` event logged to canonical ledger

**Required Privacy Notice Contents (per Regulation P):**
- Categories of NPI collected
- Categories of NPI disclosed to affiliates and non-affiliates
- Customer's right to opt out of disclosure to non-affiliated third parties
- Information security practices protecting NPI
- Contact information for questions

### 4.2 Annual Privacy Notice

**Requirement:** Provide annual privacy notice to customers during the continuation of the customer relationship.

**Status:** Partial — platform can deliver annual notices via Product Acknowledgment Engine; no automated annual delivery scheduler is currently implemented.

**Implementation Needed:** BullMQ job to trigger annual privacy notice re-delivery and acknowledgment recapture.

### 4.3 Opt-Out Rights

**Requirement:** Provide customers the right to opt out of disclosure of NPI to non-affiliated third parties.

**CapitalForge Implementation:**
- NPI is shared only with service providers (credit bureaus, KYB provider) under service provider exception — no opt-out required for service provider relationships.
- Tenant-to-tenant data sharing does not occur (triple-layer isolation).
- TCPA Consent Vault (`DELETE /api/consent/:consentId`) provides opt-out for communications.

**For any marketing-related data sharing:** Opt-out mechanism must be provided and honored within [30] days.

### 4.4 Model Privacy Form

The FTC provides a model privacy form under Regulation P. Operators are encouraged to use the model form to ensure compliance. The GLBA privacy notice template in the Product Acknowledgment Engine should be reviewed against the current model form.

---

## 5. Platform Controls Mapped to Safeguards Rule Elements

| Safeguards Rule Element | Control ID(s) | Implementation Module | Evidence Location |
|------------------------|--------------|----------------------|------------------|
| Qualified Individual | CC1.2 | `compliance_officer` RBAC role | `users` table |
| Risk Assessment | CC3.1, CC3.2, CC3.3 | Fraud Detection; Sanctions Screening | `compliance_checks` |
| Access Controls | CC6.1–CC6.8 | Auth middleware; RBAC; JTI blocklist | `audit_logs`; Redis |
| Encryption | C1.2–C1.4 | `encryption.ts`; TLS | Field ciphertext; nginx config |
| Monitoring | CC4.1, CC7.2 | Canonical Audit Ledger; Fraud Detection | `ledger_events`; `audit_logs` |
| Vulnerability Management | CC7.1 | CI/CD scanning (to implement) | CI/CD scan reports |
| Training | CC2.1 | Policy documents + acknowledgment | Policy ack records |
| Third-Party Management | CC9.2 | Vendor Assessment Framework | Vendor DPAs; Document Vault |
| Incident Response | CC7.3–CC7.5 | IRP (`incident-response.md`) | Incident log; post-mortems |
| Program Review | CC4.2 | Annual compliance review cycle | Annual review records |

---

## 6. NPI Inventory and Data Flow

### 6.1 NPI Collection Points

| NPI Type | Collection Point | API Endpoint | Processing Purpose |
|----------|-----------------|-------------|-------------------|
| SSN (beneficial owner) | Business onboarding — beneficial owner intake | `POST /api/businesses/:id/owners` | KYC verification; credit inquiry |
| DOB (beneficial owner) | Business onboarding — beneficial owner intake | `POST /api/businesses/:id/owners` | KYC verification; age verification |
| EIN (business) | Business onboarding — business intake | `POST /api/businesses` | KYB verification; tax records |
| Personal credit data | Credit bureau pull via Integration (Module 16) | `POST /api/businesses/:id/credit-profiles` | Funding readiness assessment; suitability |
| Personal address | Business onboarding — beneficial owner intake | `POST /api/businesses/:id/owners` | KYC; adverse action notice delivery |
| Financial account data | KYB; ACH authorization | `POST /api/businesses/:id/ach-authorizations` | ACH debit authorization |
| Phone numbers | Consent capture; VoiceForge | `POST /api/consent` | TCPA consent; communications |

### 6.2 NPI Sharing

| Recipient | NPI Types Shared | Legal Basis | DPA Required |
|-----------|-----------------|-------------|-------------|
| Credit bureaus (inquiry) | Name, SSN, DOB, address of beneficial owner | FCRA permissible purpose (account review / application) | Yes — FCRA data use agreement |
| KYB provider | Business legal name, EIN, address; owner name, DOB | Service provider (necessary for service delivery) | Yes |
| Twilio | Phone numbers only; call recordings (encrypted) | Service provider | Yes |
| AWS | All data (encrypted at rest and in transit) | Infrastructure service provider | Yes (AWS DPA included in AWS agreement) |
| Tenant-operators | No cross-tenant sharing — triple-layer isolation | N/A — no sharing | N/A |

### 6.3 NPI NOT Shared

- CapitalForge does not sell NPI to third parties.
- CapitalForge does not share NPI with data brokers or marketing companies.
- CapitalForge does not share NPI between tenants.

---

## 7. Operator Responsibilities

Tenant-operators using CapitalForge are independently responsible for:

1. **Executing a service provider agreement** with CapitalForge (as their GLBA service provider) confirming CapitalForge's security obligations and requiring CapitalForge to protect NPI.

2. **Maintaining their own GLBA Information Security Program** covering their own systems and personnel beyond the CapitalForge platform.

3. **Delivering annual privacy notices** to their customers using the GLBA privacy notice template in the Product Acknowledgment Engine (operators must configure the template with their specific NPI sharing practices).

4. **Conducting their own risk assessments** covering their full operational environment.

5. **Training their personnel** on GLBA requirements, NPI handling, and platform security controls.

6. **Reporting security incidents** to CapitalForge that may affect CapitalForge systems or data.

7. **Confirming their GLBA status** with qualified legal counsel — the Safeguards Rule applies to "financial institutions" and operators must determine if that classification applies to them.

---

## 8. Annual Review Checklist

Complete this checklist annually to confirm GLBA compliance program is current.

### Information Security Program

- [ ] All 9 Safeguards Rule elements reviewed and gaps documented
- [ ] Qualified Individual designation current and documented
- [ ] Annual risk assessment completed and documented
- [ ] Board/executive annual report on Information Security Program completed
- [ ] Employee security awareness training completed and acknowledgments retained

### Privacy Notices

- [ ] Annual privacy notices delivered to all active customers
- [ ] Privacy notice content reviewed and updated for any changes to NPI sharing practices
- [ ] Opt-out requests honored within 30 days
- [ ] Privacy notice acknowledgments stored in Document Vault

### Third-Party Service Providers

- [ ] All Critical and High-tier vendors have current DPAs with GLBA service provider agreement provisions
- [ ] Annual vendor reviews completed
- [ ] SOC 2 Type II reports collected for all Critical vendors

### Incident Response

- [ ] Incident Response Plan reviewed and tested
- [ ] Breach notification thresholds understood (500 customers = FTC notification)
- [ ] Legal counsel contact information current for breach notification
- [ ] Post-mortems completed for all P1/P2 incidents in the past year

### Data Retention

- [ ] Data retention schedule reviewed against current regulatory requirements
- [ ] Legal holds reviewed and status confirmed
- [ ] Disposal certificates filed for any records disposed of in the past year

---

**Document Control**

| Version | Date | Author | Summary of Changes |
|---------|------|--------|-------------------|
| 1.0 | 2026-03-31 | Engineering / Compliance Team | Initial version |

**Next Review Date:** 2027-03-31
