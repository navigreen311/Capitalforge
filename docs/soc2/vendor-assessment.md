# CapitalForge — Third-Party Vendor Assessment Framework

**Platform:** CapitalForge
**Version:** 1.0
**Effective Date:** 2026-03-31
**Review Cycle:** Annual for Critical and High-tier vendors
**Owner:** Chief Compliance Officer / CISO
**Approved By:** [CISO — signature required before activation]

> **Purpose:** This framework satisfies SOC 2 CC9.2 (third-party risk management) and GLBA Safeguards Rule 16 C.F.R. § 314.4(f) (oversight of service provider arrangements). All vendors with access to CapitalForge data or systems must be assessed using this framework before engagement and reviewed annually.

---

## Contents

1. [Vendor Risk Tiers](#1-vendor-risk-tiers)
2. [Current Vendor Inventory](#2-current-vendor-inventory)
3. [Vendor Security Questionnaire](#3-vendor-security-questionnaire)
4. [Data Processing Agreement Requirements](#4-data-processing-agreement-requirements)
5. [Annual Review Checklist](#5-annual-review-checklist)
6. [Vendor Onboarding Procedure](#6-vendor-onboarding-procedure)
7. [Vendor Offboarding Procedure](#7-vendor-offboarding-procedure)
8. [Compliance Requirements by Tier](#8-compliance-requirements-by-tier)

---

## 1. Vendor Risk Tiers

| Tier | Definition | Examples | Review Frequency |
|------|------------|----------|-----------------|
| **Critical** | Vendor processes or stores NPI; or is a core infrastructure dependency whose failure causes complete platform outage | AWS (infrastructure), PostgreSQL (database), Redis (session store) | Annual + triggered review on vendor incident |
| **High** | Vendor accesses NPI, financial data, or call recordings; or provides a critical compliance function | Twilio (telephony), credit bureaus (Experian/TransUnion/Equifax), KYB provider | Annual |
| **Medium** | Vendor accesses non-NPI operational data; or provides a significant supporting service | CI/CD platform (GitHub Actions), monitoring tools, email delivery | Every 2 years |
| **Low** | Vendor provides software or tools with no access to production data | Development tools, design tools, non-production SaaS | At onboarding; re-assess if tier changes |

**Tier Escalation:** If a Low or Medium vendor's scope expands to include production data access, re-tier immediately and conduct a full assessment.

---

## 2. Current Vendor Inventory

| Vendor | Service | Data Shared | Risk Tier | Last Assessed | DPA Signed | SOC 2 Report | Next Review |
|--------|---------|-------------|-----------|--------------|-----------|--------------|-------------|
| Amazon Web Services (AWS) | Infrastructure: ECS, RDS, ElastiCache, S3, KMS, CloudWatch | All platform data (encrypted) | Critical | [DATE] | [Y/N] | AWS SOC 2 Type II (annual) | [DATE] |
| Twilio | Telephony / VoiceForge: outbound calls, call recordings, SMS | Phone numbers, call recordings, TCPA consent confirmation | High | [DATE] | [Y/N] | Twilio SOC 2 Type II | [DATE] |
| Experian | Credit bureau data pull | Business/owner identifiers, credit inquiry | High | [DATE] | [Y/N] | [Report type] | [DATE] |
| TransUnion | Credit bureau data pull | Business/owner identifiers, credit inquiry | High | [DATE] | [Y/N] | [Report type] | [DATE] |
| Equifax | Credit bureau data pull | Business/owner identifiers, credit inquiry | High | [DATE] | [Y/N] | [Report type] | [DATE] |
| D&B | Business credit data | Business identifiers, D-U-N-S | High | [DATE] | [Y/N] | [Report type] | [DATE] |
| [KYB Provider] | Identity and entity verification (KYB/KYC) | Owner PII, business entity data | High | [DATE] | [Y/N] | [Report type] | [DATE] |
| GitHub | Source code repository, CI/CD | Source code (no production data) | Medium | [DATE] | [Y/N] | GitHub SOC 2 | [DATE] |
| [Monitoring Tool] | Application performance monitoring | Application logs (PII minimized) | Medium | [DATE] | [Y/N] | [Report type] | [DATE] |

---

## 3. Vendor Security Questionnaire

This questionnaire must be completed by all Critical and High-tier vendors before engagement. Responses must be provided in writing and retained in the Document Vault for the duration of the vendor relationship plus [3] years.

---

### Section A — Organization Information

**A1.** Legal name of organization and primary point of contact for this assessment:

**A2.** Geographic locations where CapitalForge data will be processed or stored:

**A3.** Subcontractors / sub-processors who will process CapitalForge data:

**A4.** Does your organization have a dedicated information security team? How large?

**A5.** Does your organization have a Chief Information Security Officer (CISO) or equivalent?

**A6.** Describe your organization's information security governance structure (board-level oversight, committee, etc.):

---

### Section B — Certifications and Compliance

**B1.** Does your organization have a current SOC 2 Type II report? If yes, provide the report period and auditor name. If no, explain the alternative assurance mechanism:

**B2.** Does your organization have an ISO 27001 certification? If yes, provide certificate and scope:

**B3.** List all applicable regulatory compliance certifications (PCI DSS, HIPAA, FedRAMP, etc.) relevant to the services provided to CapitalForge:

**B4.** Has your organization been subject to a material regulatory finding, enforcement action, or consent order in the past [3] years? If yes, describe:

**B5.** Does your organization maintain cyber liability insurance? Coverage amount:

---

### Section C — Access Control

**C1.** How are user accounts provisioned and deprovisioned for personnel with access to CapitalForge data?

**C2.** Is multi-factor authentication (MFA) required for systems that process CapitalForge data?

**C3.** Describe your privileged access management (PAM) approach for systems containing CapitalForge data:

**C4.** How frequently is user access reviewed and certified?

**C5.** Are background checks performed for employees with access to CapitalForge data?

**C6.** Describe segregation of duties controls relevant to CapitalForge data processing:

---

### Section D — Data Protection and Encryption

**D1.** Describe how CapitalForge data is encrypted at rest (algorithm, key length, key management):

**D2.** Describe how CapitalForge data is encrypted in transit (TLS version, certificate management):

**D3.** How are encryption keys managed? Where are keys stored? How often are keys rotated?

**D4.** Describe your data classification policy and how CapitalForge's NPI would be classified:

**D5.** Are CapitalForge data and other customers' data logically separated? How?

**D6.** Describe any data masking or tokenization used for NPI in non-production environments:

---

### Section E — Incident Response

**E1.** Do you have a documented incident response plan? When was it last tested?

**E2.** Describe your security incident notification process. How quickly would CapitalForge be notified of an incident affecting our data?

**E3.** What is your defined SLA for notifying customers of a data breach?

**E4.** Have you experienced a confirmed data breach in the past [3] years involving customer NPI? If yes, describe:

**E5.** Provide contact information for your security incident notification team:

---

### Section F — Network and Infrastructure Security

**F1.** Describe your network segmentation approach for systems processing CapitalForge data:

**F2.** Do you use a Web Application Firewall (WAF)? DDoS protection?

**F3.** Describe your vulnerability management program (scanning frequency, patch SLAs):

**F4.** Do you conduct annual penetration testing? Provide the date of last test and whether findings are available for review:

**F5.** Describe your logging and monitoring approach for systems containing CapitalForge data:

---

### Section G — Data Handling and Retention

**G1.** Describe how CapitalForge data is isolated from your other customers' data:

**G2.** What are your data retention periods for CapitalForge data? Do they align with CapitalForge's retention schedule?

**G3.** Describe your data deletion / disposal procedure. How is secure deletion verified?

**G4.** Do you retain CapitalForge data in backup tapes or archives? How long? How is this included in the deletion process?

**G5.** Upon contract termination, describe your data return and/or deletion process and timeline:

---

### Section H — Physical Security

**H1.** Where are data centers used to process CapitalForge data located (city/country)?

**H2.** Are data centers owned by your organization or by a third party (e.g., AWS, Azure, GCP)?

**H3.** If third-party data centers: provide their SOC 2 Type II report or equivalent assurance:

**H4.** Describe physical access controls for facilities where CapitalForge data is processed:

---

### Section I — Business Continuity

**I1.** What are your defined RTO (Recovery Time Objective) and RPO (Recovery Point Objective) for services provided to CapitalForge?

**I2.** Describe your backup and disaster recovery approach for systems containing CapitalForge data:

**I3.** When was your last disaster recovery test? What was the outcome?

**I4.** Do you have a business continuity plan? When was it last tested?

---

### Section J — Regulatory and Compliance-Specific

**J1.** Are you subject to GLBA, FCRA, or state-level financial privacy regulations? If yes, describe your compliance program:

**J2.** For telephony vendors (Twilio equivalent): Describe your TCPA compliance controls including consent management, DNC list integration, and call recording storage security:

**J3.** For credit bureau vendors: Describe FCRA permissible purpose controls and how impermissible purpose inquiries are blocked:

**J4.** Do you have a formal vendor management program for your own sub-processors?

---

### Certification

> I certify that the responses above are accurate and complete to the best of my knowledge.

**Completed by:** _______________
**Title:** _______________
**Date:** _______________
**Signature:** _______________

---

## 4. Data Processing Agreement Requirements

A Data Processing Agreement (DPA) is required with all Critical and High-tier vendors before any data exchange. The DPA must include the following provisions at minimum:

### 4.1 Required DPA Provisions

| Provision | Requirement |
|-----------|-------------|
| **Purpose limitation** | Vendor may only process CapitalForge data for the specific services described in the agreement. No secondary use for vendor's own analytics or marketing. |
| **Data subject categories** | Explicit enumeration of personal data categories shared (SSN, DOB, EIN, credit data, call recordings, etc.) |
| **Sub-processor authorization** | Vendor must list sub-processors and obtain written approval from CapitalForge before engaging new sub-processors |
| **Security measures** | Vendor must maintain security measures at least as protective as those described in their SOC 2 Type II report or equivalent |
| **Breach notification** | Vendor must notify CapitalForge within [48 hours] of discovering a breach involving CapitalForge data |
| **Audit rights** | CapitalForge has the right to request audit reports (SOC 2) and to conduct security assessments with [30 days] notice |
| **Data return / deletion** | Upon termination, vendor must return or securely delete all CapitalForge data within [30 days] and provide written certification |
| **Retention limits** | Vendor may not retain CapitalForge data longer than CapitalForge's retention schedule requires |
| **Data location** | Vendor must disclose and limit data processing to approved jurisdictions |
| **Personnel training** | Vendor personnel with data access must receive annual security awareness training |
| **Incident cooperation** | Vendor must cooperate with CapitalForge's incident response investigation |
| **Regulatory cooperation** | Vendor must cooperate with regulatory examinations or investigations involving CapitalForge data |
| **Governing law** | Agreement governed by applicable US law; GDPR provisions as applicable for EU data subjects |

### 4.2 GLBA Service Provider Agreement Requirements (16 C.F.R. § 314.4(f))

Per the FTC Safeguards Rule, service providers that maintain, process, or transmit customer information must contractually agree to:
- Implement appropriate safeguards for customer information
- Report security incidents involving customer information to CapitalForge
- Not use customer information for any purpose other than performing services for CapitalForge

---

## 5. Annual Review Checklist

Complete this checklist for each Critical and High-tier vendor annually. Results must be documented in the vendor record in the Document Vault.

### 5.1 Documentation Review

- [ ] Obtain current SOC 2 Type II report (must cover period ending within last 12 months)
- [ ] Review SOC 2 report for qualified opinions, exceptions, or user entity control considerations relevant to CapitalForge
- [ ] Confirm current DPA is in effect and covers current scope of services
- [ ] Confirm sub-processor list is current and all sub-processors are approved
- [ ] Review vendor's publicly disclosed security incidents or trust center updates from the past year
- [ ] Confirm vendor cyber liability insurance is current (request certificate)

### 5.2 Access Review

- [ ] Review list of vendor personnel with access to CapitalForge systems or data
- [ ] Confirm access is limited to minimum necessary for service delivery
- [ ] Verify any terminated vendor personnel have been removed from access
- [ ] Confirm API keys / OAuth tokens / credentials issued to vendor are current and rotated per policy

### 5.3 Data Flow Review

- [ ] Confirm data flows between CapitalForge and vendor match documented scope
- [ ] Verify no unapproved data flows identified (e.g., via network monitoring or vendor disclosure)
- [ ] Confirm vendor is not retaining data longer than allowed by DPA and retention schedule
- [ ] Review any new data types that may have been inadvertently shared with vendor

### 5.4 Incident and Issue Review

- [ ] Review any security incidents involving vendor in the past year
- [ ] Confirm CapitalForge was notified per DPA SLA for any incidents
- [ ] Review open issues or remediation items from prior year assessment
- [ ] Confirm critical/high findings from prior year are resolved

### 5.5 Contract Review

- [ ] Confirm contract term and renewal date
- [ ] Review any contract amendments that changed scope or security obligations
- [ ] Confirm pricing and SLA terms align with current usage
- [ ] Flag any upcoming contract renewals (> 90 days advance) for legal review

### 5.6 Re-Assessment Decision

Based on the annual review, determine:
- [ ] Vendor risk tier is unchanged — annual review sufficient
- [ ] Vendor risk tier has changed — conduct full assessment update
- [ ] New sub-processors require approval — obtain approval
- [ ] DPA requires update — initiate DPA amendment
- [ ] Vendor fails review — escalate to CISO for remediation plan or vendor replacement

### 5.7 Sign-Off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Compliance Officer | | | Approved / Escalated |
| CISO | | | Approved / Escalated |

---

## 6. Vendor Onboarding Procedure

1. **Request:** Business owner submits vendor onboarding request with service description, data scope, and tier assessment.
2. **Tier Assignment:** CISO assigns vendor risk tier.
3. **Questionnaire:** Send Section 3 questionnaire to vendor. Allow [10] business days for response.
4. **DPA Negotiation:** Legal reviews vendor's DPA (or CapitalForge template DPA). Negotiate required provisions.
5. **SOC 2 Review:** Security Engineer reviews vendor's SOC 2 Type II report for gaps relevant to CapitalForge.
6. **CISO Approval:** CISO approves vendor based on questionnaire, DPA, and SOC 2 review.
7. **Vendor Registry:** Add vendor to inventory (Section 2) with assessment date and DPA status.
8. **Credential Provisioning:** Issue minimum-necessary API keys or credentials. Log in Document Vault.
9. **Document Vault Filing:** File signed DPA, SOC 2 report, and completed questionnaire under legal hold.
10. **Calendar Reminder:** Set annual review reminder in vendor registry.

---

## 7. Vendor Offboarding Procedure

1. **Notice:** Provide vendor with contract termination notice per agreement terms.
2. **Data Inventory:** Compile inventory of all CapitalForge data held by vendor.
3. **Data Return / Deletion Request:** Formally request data return or certified deletion per DPA terms.
4. **Credential Revocation:** Revoke all API keys, OAuth tokens, and credentials issued to vendor. Log revocations.
5. **Deletion Certification:** Obtain written data deletion certificate from vendor within [30] days of termination.
6. **Confirmation:** Security Engineer confirms data is no longer accessible via vendor APIs or portals.
7. **Document Vault Filing:** File deletion certificate and offboarding records.
8. **Registry Update:** Mark vendor as `offboarded` in vendor inventory with offboarding date.

---

## 8. Compliance Requirements by Tier

| Requirement | Critical | High | Medium | Low |
|-------------|----------|------|--------|-----|
| Full security questionnaire | Required | Required | Abbreviated | Not required |
| SOC 2 Type II (or equivalent) | Required | Required | Preferred | Not required |
| DPA signed before data sharing | Required | Required | Required (if any data shared) | Required (if any data shared) |
| Annual review | Required | Required | Every 2 years | At onboarding |
| CISO approval for onboarding | Required | Required | CISO or designee | Engineering Lead |
| Penetration test evidence | Required | Preferred | Optional | Not required |
| Cyber liability insurance certificate | Required | Required | Preferred | Not required |
| Sub-processor disclosure and approval | Required | Required | Recommended | Not required |
| GLBA service provider agreement | Required | Required | If applicable | If applicable |

---

**Document Control**

| Version | Date | Author | Summary of Changes |
|---------|------|--------|-------------------|
| 1.0 | 2026-03-31 | Engineering / Compliance Team | Initial version |

**Next Review Date:** 2027-03-31
