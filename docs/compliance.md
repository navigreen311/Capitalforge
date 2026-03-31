# CapitalForge — Compliance Architecture

This document describes how CapitalForge enforces each applicable federal and state regulatory framework at the platform layer.

> **Legal Disclaimer:** This document describes technical controls implemented in the platform. It does not constitute legal advice. Operators must engage qualified legal counsel to ensure their specific program design, marketing materials, and operational procedures satisfy all applicable requirements.

---

## Contents

1. [Compliance Design Philosophy](#compliance-design-philosophy)
2. [GLBA — Gramm-Leach-Bliley Act](#glba--gramm-leach-bliley-act)
3. [TCPA — Telephone Consumer Protection Act](#tcpa--telephone-consumer-protection-act)
4. [UDAP/UDAAP — Unfair, Deceptive, or Abusive Acts or Practices](#udapudaap)
5. [California SB 1235 — Small Business Lending Disclosure](#california-sb-1235)
6. [Section 1071 — Small Business Lending Data Collection](#section-1071)
7. [Compliance Roles & Permissions](#compliance-roles--permissions)
8. [Audit & Reporting](#audit--reporting)

---

## Compliance Design Philosophy

CapitalForge embeds compliance controls at the **platform layer**, not as post-hoc overlays. This means:

1. **Consent is a gate, not a checkbox** — The system will not allow a card application to be submitted until a valid, active consent record exists for the applicable channel and consent type.
2. **Disclosures are versioned and acknowledged** — Every material disclosure has a version number. A version bump invalidates prior acknowledgments and requires fresh client sign-off before proceeding.
3. **Every state change is an event** — The canonical ledger provides a complete, tamper-evident chain of custody for any regulatory inquiry or litigation hold.
4. **No-go is enforced, not advisory** — The Suitability Engine's no-go threshold blocks the funding workflow in code, not just as a UI warning. Overrides require a supervisor, a documented reason, and are permanently logged.
5. **Compliance officer is a first-class role** — The `compliance_officer` role has read access across all tenant data and write access to compliance-specific workflows, without requiring elevated privileges elsewhere.

---

## GLBA — Gramm-Leach-Bliley Act

### Regulatory Summary

The Gramm-Leach-Bliley Act (15 U.S.C. § 6801 et seq.) requires financial institutions that collect nonpublic personal information (NPI) about individuals to protect that information and disclose their data sharing practices.

### Applicable Scenarios

CapitalForge handles NPI including: SSNs of beneficial owners, dates of birth, personal credit data, personal addresses, and financial account information.

### Platform Controls

| Control | Implementation |
|---------|---------------|
| **NPI Encryption at Rest** | SSN, DOB, and other NPI fields encrypted with AES-256-GCM at the field level before storage. Encryption key managed via `ENCRYPTION_KEY` environment variable (never stored in the database). |
| **NPI Encryption in Transit** | TLS 1.2+ enforced on all connections; HSTS header set via helmet. |
| **Data Access Logging** | All reads of NPI fields logged to `audit_logs` with user ID, tenant, resource, and timestamp. |
| **Tenant Isolation** | NPI accessible only within the tenant that owns the record. Cross-tenant data access is architecturally impossible (triple-layer isolation: middleware + Prisma extension + PostgreSQL RLS). |
| **Minimum Necessary Access** | RBAC permissions scoped to least privilege. The `readonly` and `client` roles cannot access other businesses' NPI. |
| **Data Retention** | Document vault legal-hold capability supports operator retention schedules. Records are never deleted without explicit authorized action. |
| **Privacy Notice Delivery** | Product Acknowledgment Engine used to deliver GLBA privacy notices and capture client acknowledgment with timestamp and signature. |

### Operator Responsibilities

- Maintain and deliver an annual GLBA Privacy Notice to all customers.
- Execute Data Processing Agreements with CapitalForge (as a service provider) per Safeguards Rule requirements.
- Implement an Information Security Program meeting FTC Safeguards Rule standards (16 C.F.R. Part 314).

---

## TCPA — Telephone Consumer Protection Act

### Regulatory Summary

The Telephone Consumer Protection Act (47 U.S.C. § 227) restricts calls, texts, and faxes made using autodialers or artificial/prerecorded voices without prior express consent. Violations carry statutory damages of $500-$1,500 per call/text.

### Applicable Scenarios

- Outbound advisor calls to business owners for qualification or follow-up
- SMS marketing or application status notifications
- Automated dialing for appointment reminders
- Robocall or IVR-based outreach

### Platform Controls

| Control | Implementation |
|---------|---------------|
| **TCPA Consent Vault** | Module 10 captures a `ConsentRecord` for each channel (voice, SMS, email) before any outbound communication is permitted. Consent records are immutable at the grant level — only a revocation can change status. |
| **Consent Gate on Communication** | Communication services must call `consentService.verifyConsent({ businessId, channel: 'voice', consentType: 'tcpa' })` before initiating outreach. Returns `false` (blocking) if no active consent exists. |
| **Evidence Capture** | `evidenceRef` field stores a reference to the recorded consent (call recording ID, signed form document vault ID, or web form submission ID). |
| **IP Address Logging** | `ipAddress` captured on digital consent captures for opt-in provenance. |
| **Revocation Workflow** | Any consent can be revoked in real-time via `DELETE /api/consent/:consentId`. Revocation is immediate and permanent — re-consent requires a fresh capture with new evidence. |
| **Revocation Reason** | Required field on revocation — captures the reason for the record (client request, compliance officer action, regulatory demand). |
| **Compliance Reporting** | `GET /api/businesses/:id/consent` returns full consent history with grant and revocation timestamps for auditor review. |
| **VoiceForge Integration** | Call compliance events (`call.completed`, `call.compliance.violation`) emitted to the canonical ledger with TCPA check results embedded in the payload. |

### Operator Responsibilities

- Maintain a Do-Not-Call (DNC) registry and honor opt-outs within the required window.
- Ensure consent capture scripts and web forms meet express written consent standards for marketing calls.
- Retain consent records for a minimum of 5 years (longer in some states).
- For calls using AI or synthetic voice, obtain separate, explicit disclosure acknowledgment.

---

## UDAP/UDAAP

### Regulatory Summary

**UDAP** (Unfair or Deceptive Acts or Practices) is prohibited under Section 5 of the FTC Act (15 U.S.C. § 45) and parallel state statutes. **UDAAP** (adding "Abusive") is the CFPB's broader standard under Dodd-Frank (12 U.S.C. § 5531), applicable to covered persons offering financial products or services.

An act or practice is:
- **Unfair** if it causes substantial injury, consumers cannot reasonably avoid it, and the harm is not outweighed by benefits.
- **Deceptive** if it involves a material misrepresentation likely to mislead reasonable consumers.
- **Abusive** if it materially interferes with consumers' ability to understand a product, or takes unreasonable advantage of lack of understanding, inability to protect their interests, or reasonable reliance.

### Applicable Scenarios

- Marketing copy describing funding program benefits
- Fee disclosures and APR representations
- Product descriptions for credit card stacking programs
- Advisor communications with business owners
- Claim that personal credit will not be impacted (when it will)

### Platform Controls

| Control | Implementation |
|---------|---------------|
| **UDAP/UDAAP Compliance Monitor** | Module 13 scans all disclosure templates, acknowledgment templates, and marketing content against a curated rule library before activation. Risk scores (low / medium / high / critical) are assigned with per-finding explanations. |
| **Template Version Gate** | New or revised templates cannot be marked active until a UDAP/UDAAP scan has completed with no high or critical findings. Scan results stored in `ComplianceCheck` with `checkType: 'udap'`. |
| **Product Reality Acknowledgment** | The "product reality" acknowledgment template is required before any application. It explicitly states: (1) personal credit will be pulled and impacted; (2) the owner may be personally liable for the debt; (3) the business must service the debt; (4) credit card balances should not be held long-term. |
| **Fee Schedule Disclosure** | Separate `fee_schedule` acknowledgment type covers all fees: program fee, annual card fee, cash advance fee, processor fee. Effective APR disclosed before signing. |
| **Personal Guarantee Disclosure** | Separate `personal_guarantee` acknowledgment covers joint and several liability for the business owner. |
| **Cash Advance Risk Disclosure** | Separate `cash_advance_risk` acknowledgment covers the high cost of cash advances and the no-go rule for using business credit card cash advances for program fees. |
| **Jurisdiction-Aware Rules** | `ComplianceCheck.stateJurisdiction` field used to apply state-specific UDAP rules (e.g., California, New York, Illinois have more expansive state UDAP laws). |
| **Findings Remediation Workflow** | High/critical findings create a compliance officer review task. Resolution (acknowledged, remediated, escalated) is logged with timestamp and responsible officer. |

### Operator Responsibilities

- Review and approve all client-facing content with qualified legal counsel before deployment.
- Do not represent credit card stacking as a loan, investment, or guaranteed funding mechanism.
- Disclose all fees, total cost of capital, and APR using the Leverage Calculator outputs.
- Do not make claims about impacts on personal credit that are inaccurate.

---

## California SB 1235

### Regulatory Summary

California Senate Bill 1235 (Cal. Fin. Code §§ 22800-22805), effective January 1, 2022, requires commercial financing providers offering $500,000 or less to small businesses to disclose specific cost information before consummation of any commercial financing transaction. It applies to factoring, asset-based lending, commercial open-end credit plans, lease financing, and "any other form of commercial financing."

Credit card stacking programs marketed to small businesses as a funding mechanism fall within the SB 1235 disclosure scope in California when the advisor or broker is arranging the financing and receiving compensation.

### Required Disclosures

1. Total amount of funds provided
2. Total dollar cost of financing
3. Term or estimated term
4. Method, frequency, and amount of payment
5. Prepayment penalties (if applicable)
6. Annual percentage rate (APR) or estimated APR
7. Description of any collateral

### Platform Controls

| Control | Implementation |
|---------|---------------|
| **Leverage Calculator Integration** | Module 5 computes all required SB 1235 disclosure elements: total cost, effective APR, fee schedule, payment terms. Output is the source of truth for disclosures. |
| **SB 1235 Disclosure Template** | Versioned disclosure template in the Product Acknowledgment Engine containing all seven required fields, pre-populated from the Leverage Calculator output for the specific program. |
| **Pre-Consummation Gate** | SB 1235 disclosure acknowledgment required before any application is submitted for California-domiciled businesses. `business.stateOfFormation === 'CA'` triggers the gate. |
| **Disclosure Receipt Record** | Acknowledgment record with signature reference and timestamp stored in Document Vault. Accessible for the required record retention period. |
| **Broker Registration Check** | Compliance check for whether the advisor/broker is registered under the California Financing Law (CFL) as required for commercial financing brokers. |
| **Cost Calculation Persistence** | `CostCalculation` records linked to business — the exact figures used in the disclosure are retained for audit. |

### Operator Responsibilities

- Determine whether your specific program structure is subject to SB 1235 with legal counsel.
- Register as a commercial financing provider or broker under the California Financing Law if required.
- Provide disclosures in a form substantially similar to the Department of Financial Protection and Innovation (DFPI) model form.
- Retain disclosure records for the period required by California law.

---

## Section 1071

### Regulatory Summary

Section 1071 of the Dodd-Frank Act (15 U.S.C. § 1691c-2) amended the Equal Credit Opportunity Act (ECOA) to require financial institutions that originate covered credit transactions for small businesses to collect and report certain data points. The CFPB finalized its implementing rule in 2023 (effective with tiered compliance dates beginning 2025).

Section 1071 applies to covered applications for credit, including credit card applications where the applicant is a small business. It requires collection of data including business demographics, credit type requested, action taken, and — on a voluntary basis from principals — race, sex, and ethnicity.

### Data Points Required (CFPB Final Rule)

- Application date and unique application identifier
- Credit type, purpose, amount applied for, and amount approved
- Action taken and date of action
- Census tract of principal place of business
- Gross annual revenue
- NAICS code
- Number of principal owners
- Whether the applicant is a minority-owned, women-owned, or LGBTQI+-owned business (voluntary)
- Ethnicity, race, and sex of principal owners (voluntary)

### Platform Controls

| Control | Implementation |
|---------|---------------|
| **Section 1071 Data Model** | `CardApplication` model captures action taken, dates, amount applied for, and amount approved. `Business` model captures NAICS/MCC, annual revenue, state, and census tract. |
| **Principal Owner Demographics** | `BusinessOwner` model extended with voluntary demographic fields (race, ethnicity, sex) captured under the firewall provisions of the rule. |
| **Firewall Provisions** | Demographic data collected under Section 1071 is stored separately from underwriting data and access is restricted to users with `section_1071_access` permission. Underwriters and advisors cannot access demographic fields. |
| **Voluntary Collection UI** | Demographic fields presented with explicit "prefer not to say" and "information not provided" options per CFPB requirements. |
| **Data Export for Reporting** | `GET /api/compliance/1071-export` produces a CFPB-conforming CSV/JSON data file for annual submission. |
| **Application Coverage Determination** | Platform flags applications as "covered" or "excluded" based on business size (gross annual revenue ≤ $5M threshold) and credit type. |

### Operator Responsibilities

- Determine your institution's compliance date tier based on origination volume.
- Submit annual Section 1071 data to the CFPB via the HMDA Platform (or successor system).
- Implement the required firewall between demographic data and underwriting decisions.
- Train staff on collection procedures and prohibited use of demographic information.
- Retain Section 1071 data for the required retention period (currently 3 years for the underlying application data).

---

## Compliance Roles & Permissions

| Role | Compliance Capabilities |
|------|------------------------|
| `super_admin` | Full access to all compliance data across all tenants |
| `tenant_admin` | Full access to compliance data within tenant |
| `compliance_officer` | Read all data within tenant; write compliance checks; resolve findings; export audit reports |
| `advisor` | Read compliance status for assigned businesses; cannot modify compliance records |
| `client` | Read own consent and acknowledgment status only |
| `readonly` | Read-only access to non-sensitive compliance summaries |

### Permission Details

| Permission | Compliance Relevance |
|-----------|---------------------|
| `compliance:read` | View compliance checks, consent records, suitability scores |
| `compliance:write` | Create/resolve compliance checks, manage UDAP findings |
| `consent:manage` | Capture and revoke consent records |
| `document:write` | Upload compliance documents to vault |
| `business:read` | Required for any compliance assessment |

---

## Audit & Reporting

### Immutable Event Ledger

Every compliance-relevant action produces a `LedgerEvent`:

| Action | Event Type |
|--------|-----------|
| Consent captured | `consent.captured` |
| Consent revoked | `consent.revoked` |
| Suitability assessed | `suitability.assessed` |
| No-go triggered | `nogo.triggered` |
| UDAP check completed | `compliance.check.completed` |
| Risk alert raised | `risk.alert.raised` |
| Unauthorized debit detected | `debit.unauthorized.detected` |
| Product acknowledged | `product.reality.acknowledged` |

### Compliance Reports

| Report | Endpoint | Description |
|--------|----------|-------------|
| Consent Audit | `GET /api/businesses/:id/consent` | Full consent history with evidence references |
| Acknowledgment Audit | `GET /api/businesses/:id/acknowledgments` | All acknowledgments with signature refs |
| Suitability History | `GET /api/businesses/:id/suitability` | All suitability checks with override audit |
| Compliance Findings | `GET /api/businesses/:id/compliance-checks` | UDAP/KYB/state law findings and resolutions |
| ACH Debit Audit | `GET /api/businesses/:id/ach-authorizations` | Authorization and debit event history |
| Event Ledger | `GET /api/audit/events` | Full tenant event history (paginated, filterable) |
| Section 1071 Export | `GET /api/compliance/1071-export` | CFPB-format data export |
