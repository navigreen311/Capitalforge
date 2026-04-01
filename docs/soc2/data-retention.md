# CapitalForge — Data Retention Schedule

**Platform:** CapitalForge
**Version:** 1.0
**Effective Date:** 2026-03-31
**Review Cycle:** Annual + upon regulatory change
**Owner:** Chief Compliance Officer
**Approved By:** [CCO / General Counsel — signature required before activation]

> **Legal Disclaimer:** Retention periods below reflect generally applicable regulatory minimums as of the effective date. Applicable periods vary by jurisdiction, industry, and specific transaction type. Operators must engage qualified legal counsel to confirm retention requirements for their specific program. This schedule does not constitute legal advice.

---

## Contents

1. [Retention Principles](#1-retention-principles)
2. [Retention Schedule by Data Type](#2-retention-schedule-by-data-type)
3. [Legal Hold Exceptions](#3-legal-hold-exceptions)
4. [Deletion Procedures](#4-deletion-procedures)
5. [Retention Enforcement Implementation](#5-retention-enforcement-implementation)
6. [Regulatory Basis Reference](#6-regulatory-basis-reference)

---

## 1. Retention Principles

### 1.1 Minimum Necessary Retention

Data must be retained for the minimum period necessary to satisfy legal, regulatory, and legitimate business purposes. Retaining data longer than required increases risk exposure without business benefit.

### 1.2 Retention Clock Start

Unless specified otherwise, the retention period clock starts on the **date of last transaction or activity** associated with the record — not the date of creation. For example, a 7-year retention on a funding round begins when the funding round is closed, not when it was opened.

### 1.3 Legal Hold Supersedes Schedule

A legal hold (active litigation, regulatory investigation, government inquiry, or anticipated legal proceeding) supersedes all retention schedules. Records under legal hold must not be deleted regardless of age. See Section 3.

### 1.4 Deletion Irreversibility

Once a record is deleted per this schedule, it cannot be recovered except from backup tapes within the backup retention window. Deletion decisions are final. All deletions are logged in `audit_logs`.

### 1.5 Tenant-Operator Responsibility

CapitalForge provides the technical infrastructure for retention and deletion. Tenant-operators bear responsibility for confirming that the retention periods configured for their tenant comply with applicable law for their jurisdiction and program type. Operators may configure longer retention periods within the platform.

---

## 2. Retention Schedule by Data Type

### 2.1 Financial Records

| Data Type | Description | Platform Location | Retention Period | Basis | Deletion Trigger |
|-----------|-------------|-------------------|-----------------|-------|-----------------|
| Funding round records | `FundingRound` records including target credit, APR expiry, status | `funding_rounds` table | **7 years** from round closure | FTC Safeguards Rule; IRS recordkeeping; general financial records | Round status = `closed` + 7 years |
| Card application records | `CardApplication` records including issuer, APR, action taken | `card_applications` table | **7 years** from decision date | ECOA adverse action record requirements; Section 1071 | `decidedAt` + 7 years |
| Cost calculations | `CostCalculation` records (APR, total cost, IRC §163j) | `cost_calculations` table | **7 years** from business offboarding | IRS recordkeeping; UDAP evidence | Business `offboardedAt` + 7 years |
| ACH authorizations | `AchAuthorization` and `DebitEvent` records | `ach_authorizations`, `debit_events` tables | **7 years** from authorization revocation | NACHA rules; bank recordkeeping requirements | Authorization `revokedAt` + 7 years |
| Business financial data | Annual revenue, monthly revenue, banking info | `businesses` table fields | **7 years** from business offboarding | IRS; general financial recordkeeping | Business `offboardedAt` + 7 years |

### 2.2 Personally Identifiable Information (PII) / NPI

| Data Type | Description | Platform Location | Retention Period | Basis | Deletion Trigger | Encryption at Deletion |
|-----------|-------------|-------------------|-----------------|-------|-----------------|------------------------|
| Social Security Numbers (SSN) | Encrypted `businessOwners.ssn` | `business_owners` table (AES-256-GCM) | **7 years** from business offboarding | GLBA Safeguards Rule; credit underwriting records | Business `offboardedAt` + 7 years | Re-encrypt with retired key; delete ciphertext |
| Dates of Birth (DOB) | Encrypted `businessOwners.dateOfBirth` | `business_owners` table (AES-256-GCM) | **7 years** from business offboarding | GLBA Safeguards Rule | Business `offboardedAt` + 7 years | Re-encrypt with retired key; delete ciphertext |
| Employer Identification Numbers (EIN) | Encrypted `businesses.ein` | `businesses` table (AES-256-GCM) | **7 years** from business offboarding | IRS recordkeeping | Business `offboardedAt` + 7 years | Re-encrypt with retired key; delete ciphertext |
| Personal addresses | `businessOwners.address` | `business_owners` table | **7 years** from business offboarding | Credit underwriting records | Business `offboardedAt` + 7 years | Standard deletion |
| Personal credit profiles | Credit scores, tradeline data, inquiries | `credit_profiles` table | **7 years** from profile pull date | FCRA consumer file records; adverse action basis | `pulledAt` + 7 years | Standard deletion |
| Beneficial owner demographics (Section 1071) | Race, ethnicity, sex (voluntary) | `business_owners` table (Section 1071 fields) | **3 years** from application date | CFPB Section 1071 final rule (12 C.F.R. § 1002.111) | Card application `decidedAt` + 3 years | Standard deletion with firewall audit |

### 2.3 Consent Records

| Data Type | Description | Platform Location | Retention Period | Basis | Deletion Trigger |
|-----------|-------------|-------------------|-----------------|-------|-----------------|
| TCPA voice consent | `ConsentRecord` with `channel='voice'`, `consentType='tcpa'` | `consent_records` table | **5 years** from consent revocation | TCPA; FCC rules; state TCPA statutes (some require longer) | `revokedAt` + 5 years (or `grantedAt` + 5 years if never revoked) |
| TCPA SMS consent | `ConsentRecord` with `channel='sms'` | `consent_records` table | **5 years** from consent revocation | TCPA; CTIA guidelines | Same as voice |
| TCPA email consent | `ConsentRecord` with `channel='email'` | `consent_records` table | **3 years** from revocation | CAN-SPAM; CASL (if applicable) | `revokedAt` + 3 years |
| ACH debit authorization consent | `AchAuthorization` signed document reference | `ach_authorizations` table + Document Vault | **7 years** from revocation | NACHA Operating Rules | `revokedAt` + 7 years |
| Product acknowledgments (all types) | `product_reality`, `fee_schedule`, `personal_guarantee`, `cash_advance_risk` | `acknowledgments` table | **7 years** from business offboarding | UDAP/UDAAP evidence; general contract records | Business `offboardedAt` + 7 years |
| GLBA privacy notice acknowledgments | `acknowledgments` with `type='glba_privacy_notice'` | `acknowledgments` table | **7 years** from acknowledgment date | GLBA Safeguards Rule | `signedAt` + 7 years |
| California SB 1235 disclosure receipts | `acknowledgments` with `type='sb1235_disclosure'` | `acknowledgments` table + Document Vault | **4 years** from acknowledgment | Cal. Fin. Code § 22805 | `signedAt` + 4 years |

### 2.4 Audit Logs

| Data Type | Description | Platform Location | Retention Period | Basis | Deletion Trigger |
|-----------|-------------|-------------------|-----------------|-------|-----------------|
| Application audit logs | `AuditLog` records (login, access, changes) | `audit_logs` table | **7 years** | SOC 2 audit evidence; GLBA Safeguards Rule; general compliance | `timestamp` + 7 years |
| Canonical ledger events | `LedgerEvent` records (all state mutations) | `ledger_events` table | **7 years** | SOC 2 evidence; GLBA; ECOA; Section 1071 | `createdAt` + 7 years |
| Compliance check records | `ComplianceCheck` records (UDAP scans, suitability, KYB) | `compliance_checks` table | **7 years** | UDAP/UDAAP evidence; suitability override audit trail | `createdAt` + 7 years |
| Suitability checks and overrides | `SuitabilityCheck` with override reason | `suitability_checks` table | **7 years** | UDAP/UDAAP; fiduciary duty evidence | `checkedAt` + 7 years |
| Section 1071 application data | Covered application data for CFPB reporting | `card_applications` + `businesses` tables | **3 years** for underlying records; **indefinite** for submitted CFPB reports | CFPB Section 1071 final rule | Application `decidedAt` + 3 years (submissions permanent) |

### 2.5 Call Recordings and VoiceForge Data

| Data Type | Description | Platform Location | Retention Period | Basis | Deletion Trigger |
|-----------|-------------|-------------------|-----------------|-------|-----------------|
| Call recordings (compliance calls) | Audio recordings of advisor-client calls | Document Vault (`documentType: 'call_recording'`) | **5 years** from call date | TCPA evidence; UDAP defense; state eavesdropping notice records | `callCompletedAt` + 5 years |
| Call recordings (marketing/sales) | Audio of outbound marketing calls | Document Vault (`documentType: 'call_recording_marketing'`) | **5 years** from call date | TCPA defense | `callCompletedAt` + 5 years |
| Call compliance scan results | Transcript analysis, risk scores, banned-claim flags | Document Vault + `ledger_events` | **5 years** from call date | TCPA defense; UDAP defense | `callCompletedAt` + 5 years |
| VoiceForge QA scores | Advisor quality rubric scores per call | `ledger_events` with `eventType='call.completed'` payload | **3 years** from call date | Employment records; performance management | `callCompletedAt` + 3 years |
| Call disclosure recordings | Required disclosures played/read during calls | Document Vault (`documentType: 'call_disclosure'`) | **5 years** | TCPA disclosure compliance | Same as call recording |

### 2.6 KYB / KYC and Identity Documents

| Data Type | Description | Platform Location | Retention Period | Basis | Deletion Trigger |
|-----------|-------------|-------------------|-----------------|-------|-----------------|
| KYB verification records | Business entity verification results | `businesses` table `kybStatus`; `kyb.verified` ledger events | **7 years** from business offboarding | FinCEN BSA; GLBA | Business `offboardedAt` + 7 years |
| KYC verification records | Individual identity verification results | `business_owners` table `kycStatus`; `kyc.verified` events | **7 years** from business offboarding | FinCEN BSA; GLBA | Business `offboardedAt` + 7 years |
| KYB/KYC source documents | Articles of incorporation, passport copies, ID documents | Document Vault (`documentType: 'kyb'` or `'kyc'`) | **7 years** from business offboarding | FinCEN BSA record retention (31 C.F.R. § 1020.430) | Business `offboardedAt` + 7 years |
| Adverse action notices | Written adverse action notices for declined applications | Document Vault (`documentType: 'adverse_action_notice'`) | **25 months** from notice date | ECOA / Regulation B (12 C.F.R. § 202.12(b)) | `noticeSentAt` + 25 months |
| OFAC / sanctions screening results | Screening against SDN, PEP, adverse media | `compliance_checks` with `checkType='sanctions'` | **5 years** | OFAC; FinCEN guidance | `createdAt` + 5 years |

### 2.7 Platform and Infrastructure Logs

| Data Type | Description | Platform Location | Retention Period | Deletion Trigger |
|-----------|-------------|-------------------|-----------------|-----------------|
| Application server logs | Express API access logs, error logs | CloudWatch Logs / log aggregation | **1 year** | Log date + 1 year |
| Database query logs (slow query / error) | PostgreSQL slow query and error logs | RDS CloudWatch | **1 year** | Log date + 1 year |
| Infrastructure security logs (VPC Flow, CloudTrail) | Network flow and AWS API call logs | CloudWatch / S3 | **1 year** (CloudTrail: **7 years** for security events) | Log date + applicable period |
| Backup snapshots | RDS automated backups | AWS RDS Backup | **35 days** (daily); **1 year** (monthly snapshots) | Snapshot date + retention window |
| Encryption key rotation logs | Key rotation events | Document Vault (legal hold) | **Permanent** | Legal hold — never delete |
| CI/CD pipeline logs | Build, test, and deployment records | CI/CD artifact store | **3 years** | Build date + 3 years |

---

## 3. Legal Hold Exceptions

### 3.1 What Triggers Legal Hold

Legal hold must be applied when any of the following occurs:
- Receipt of litigation hold notice from legal counsel
- Service of a subpoena, court order, or government demand
- Receipt of a regulatory investigation notice (CFPB, FTC, state AG)
- Internal decision to preserve records in anticipation of litigation
- Regulatory examination by a federal or state financial regulator

### 3.2 How Legal Hold Is Applied

In CapitalForge, legal hold is applied via:
1. **Document Vault:** Set `Document.legalHold = true`. All affected documents should be identified and flagged.
2. **Database records:** While database tables do not have a native `legalHold` flag outside the Document Vault, a legal hold notice in the `audit_logs` with action `legal.hold.applied` documents the hold for affected aggregate IDs.
3. **Automatic protection:** `DELETE /api/documents/:id` returns HTTP 403 if `legalHold = true`.

### 3.3 Legal Hold Procedure

1. General Counsel or CCO authorizes legal hold in writing.
2. Compliance Officer identifies all affected data types and record IDs.
3. `Document.legalHold = true` set for all affected Document Vault records.
4. `legal.hold.applied` event logged to `audit_logs` with list of affected aggregate IDs.
5. Legal hold record stored in Document Vault with authorization document.
6. Legal hold reviewed quarterly — maintained until litigation or investigation resolves.

### 3.4 Legal Hold Release

1. General Counsel confirms in writing that the litigation or investigation is resolved.
2. CCO reviews all held records and confirms normal retention schedule applies.
3. Records past their retention period are flagged for deletion.
4. `Document.legalHold = false` set for released records.
5. `legal.hold.released` event logged to `audit_logs`.

---

## 4. Deletion Procedures

### 4.1 Automated Retention Job (Target Implementation)

CapitalForge's target state is an automated retention scheduler (BullMQ job) that:
1. Runs weekly on a configurable schedule.
2. Queries each data type against its retention trigger condition.
3. Checks for active legal hold before scheduling deletion.
4. Creates a deletion manifest (list of records to be deleted) for compliance officer review.
5. After review approval, executes deletion and logs to `audit_logs`.
6. Generates a disposal certificate stored in Document Vault.

> **Current Status:** Automated retention job is not yet implemented. Manual review is required until this job is deployed.

### 4.2 Manual Deletion Procedure

Until the automated job is implemented:

1. **Identify:** Run SQL queries to identify records past their retention trigger date.
2. **Check legal hold:** Confirm no active legal hold on affected records.
3. **Approval:** Compliance officer reviews and approves deletion manifest.
4. **Execute:** DevOps executes deletion via authorized change management process (not ad-hoc queries).
5. **Log:** All deletions logged in `audit_logs`.
6. **Certify:** Disposal certificate generated (document listing deleted record IDs, counts, and types).

### 4.3 NPI-Specific Deletion (Hard Delete with Encryption Retirement)

For records containing NPI (SSN, DOB, EIN):
1. Standard soft-delete alone is insufficient.
2. Encrypted field ciphertext must be overwritten with null/empty.
3. If key rotation has been performed, previous key retirement effectively cryptographically destroys data encrypted with the retired key.
4. Document all steps in the disposal certificate.

### 4.4 Document Vault Deletion

1. `DELETE /api/documents/:id` performs a soft-delete (sets `deletedAt`).
2. After soft-delete, the file is removed from S3 storage on a scheduled cleanup job.
3. Documents under `legalHold = true` will return 403 on deletion attempts.
4. Disposal certificate stored as a new Document Vault entry.

### 4.5 Third-Party Deletion Requests

When a tenant operator or individual requests deletion of their data:
1. Verify identity of requestor.
2. Confirm applicable legal basis for deletion (e.g., right to erasure, program termination).
3. Confirm no active legal hold.
4. Confirm deletion does not violate mandatory retention periods.
5. Execute deletion procedure above.
6. Respond to requestor with confirmation within [30] days.

---

## 5. Retention Enforcement Implementation

### 5.1 Database Fields Supporting Retention

| Table | Retention-Relevant Fields |
|-------|--------------------------|
| `businesses` | `createdAt`, `offboardedAt`, `deletedAt` |
| `business_owners` | `createdAt`, `deletedAt` |
| `card_applications` | `submittedAt`, `decidedAt`, `deletedAt` |
| `funding_rounds` | `createdAt`, `closedAt` |
| `ach_authorizations` | `authorizedAt`, `revokedAt` |
| `consent_records` | `grantedAt`, `revokedAt` |
| `acknowledgments` | `signedAt` |
| `documents` | `createdAt`, `deletedAt`, `legalHold` |
| `audit_logs` | `timestamp` |
| `ledger_events` | `createdAt` |
| `compliance_checks` | `createdAt`, `resolvedAt` |
| `credit_profiles` | `pulledAt`, `deletedAt` |

### 5.2 Retention Trigger Reference

```sql
-- Example: Find funding rounds eligible for deletion (7 years after closure)
SELECT id, tenantId, closedAt
FROM funding_rounds
WHERE closedAt IS NOT NULL
  AND closedAt < NOW() - INTERVAL '7 years'
  AND deletedAt IS NULL;

-- Example: Find TCPA consent records eligible for deletion (5 years after revocation)
SELECT id, tenantId, businessId, grantedAt, revokedAt
FROM consent_records
WHERE channel IN ('voice', 'sms')
  AND (
    (revokedAt IS NOT NULL AND revokedAt < NOW() - INTERVAL '5 years')
    OR (revokedAt IS NULL AND grantedAt < NOW() - INTERVAL '5 years')
  )
  AND deletedAt IS NULL;

-- Example: Find call recording documents eligible for deletion (5 years)
SELECT id, tenantId, businessId, createdAt
FROM documents
WHERE documentType IN ('call_recording', 'call_recording_marketing')
  AND createdAt < NOW() - INTERVAL '5 years'
  AND deletedAt IS NULL
  AND legalHold = false;
```

---

## 6. Regulatory Basis Reference

| Regulation | Data Type | Minimum Retention | Citation |
|------------|-----------|------------------|----------|
| GLBA Safeguards Rule | NPI, security records, audit logs | 7 years (no explicit period — derived from FTC enforcement pattern) | 16 C.F.R. Part 314 |
| ECOA / Regulation B | Credit application records | 25 months (adverse action); 12 months (approvals) | 12 C.F.R. § 202.12(b) |
| Section 1071 (CFPB) | Small business lending data | 3 years (underlying application data) | 12 C.F.R. § 1002.111 |
| TCPA | Consent records | No explicit federal period — 5 years is industry best practice | 47 U.S.C. § 227; FCC rules |
| California SB 1235 | Disclosure records | No explicit period stated in Cal. Fin. Code — 4 years per general CA commercial statute | Cal. Fin. Code § 22800 et seq. |
| FinCEN / BSA | CIP / KYB / KYC records | 5 years from account closure | 31 C.F.R. § 1020.430 |
| NACHA | ACH authorization records | 7 years | NACHA Operating Rules |
| IRS | Business financial records | 7 years (business records with potential tax impact) | IRS Publication 583 |
| SOC 2 (AICPA) | Audit evidence | Auditor determined — typically 1 audit period beyond current | AICPA TSP 100 |

---

**Document Control**

| Version | Date | Author | Summary of Changes |
|---------|------|--------|-------------------|
| 1.0 | 2026-03-31 | Engineering / Compliance Team | Initial version |

**Next Review Date:** 2027-03-31
