# CapitalForge — TCPA Compliance Documentation

**Platform:** CapitalForge
**Regulation:** Telephone Consumer Protection Act (47 U.S.C. § 227)
**Key Rules:** FCC Implementing Rules (47 C.F.R. Part 64); 2024 FCC 1:1 Consent Rule
**Version:** 1.0
**Last Updated:** 2026-03-31
**Owner:** Chief Compliance Officer

> **Legal Disclaimer:** This document describes technical controls implemented in the CapitalForge platform mapped to TCPA requirements. TCPA compliance is highly fact-specific and subject to ongoing FCC rulemaking and private litigation. Statutory damages of $500–$1,500 per violation make TCPA one of the highest-litigation-risk statutes in the US. Operators must engage qualified legal counsel for their specific program design, dialer configurations, and communication practices. This document does not constitute legal advice.

---

## Contents

1. [Regulatory Overview](#1-regulatory-overview)
2. [TCPA Applicability to CapitalForge Programs](#2-tcpa-applicability-to-capitalforge-programs)
3. [Consent Requirements by Channel](#3-consent-requirements-by-channel)
4. [Platform Consent Architecture](#4-platform-consent-architecture)
5. [Revocation Procedures](#5-revocation-procedures)
6. [Do-Not-Call List Management](#6-do-not-call-list-management)
7. [Call Recording Disclosure Requirements](#7-call-recording-disclosure-requirements)
8. [AI Voice and Synthetic Voice Requirements](#8-ai-voice-and-synthetic-voice-requirements)
9. [VoiceForge TCPA Integration](#9-voiceforge-tcpa-integration)
10. [State Law Overlay](#10-state-law-overlay)
11. [Operator Responsibilities](#11-operator-responsibilities)
12. [Compliance Evidence Guide](#12-compliance-evidence-guide)
13. [TCPA Audit Procedures](#13-tcpa-audit-procedures)

---

## 1. Regulatory Overview

### 1.1 The TCPA and Its Prohibition

The Telephone Consumer Protection Act (47 U.S.C. § 227) prohibits, without prior express consent:
- Using an **automatic telephone dialing system (ATDS)** to call any telephone number assigned to a paging service, cellular telephone service, or other service where the called party is charged.
- Using an **artificial or prerecorded voice** to make any call to a residential telephone line.
- Sending any **commercial text message (SMS)** to a wireless number using an ATDS.
- Making **telemarketing calls** to residential telephone numbers on the National Do-Not-Call (DNC) Registry.

**Private Right of Action:** TCPA creates a private right of action for $500 per violation, or up to $1,500 per willful violation. Class action suits are common and can result in multi-million dollar settlements.

### 1.2 Key FCC Rules

The FCC implements the TCPA through 47 C.F.R. Part 64, Subpart L. Key provisions:

- **Express consent** required for non-marketing, non-emergency calls to wireless numbers.
- **Express written consent** required for telemarketing calls to wireless numbers and residential lines.
- **1:1 Consent Rule (2024):** Effective January 27, 2025, prior express written consent for marketing calls must be obtained from **one seller at a time** — a single blanket consent covering multiple companies is no longer sufficient.
- **Opt-out must be honored within 10 business days** for National DNC Registry.
- **Wireless number portability:** Numbers may be ported from landline to wireless — callers are responsible for maintaining up-to-date wireless number status.

### 1.3 Statutory Damages

| Violation Type | Damages Per Violation |
|---------------|----------------------|
| Standard TCPA violation | $500 |
| Willful TCPA violation | Up to $1,500 |
| State TCPA analog (e.g., California CIPA) | Varies — can be higher than federal |

---

## 2. TCPA Applicability to CapitalForge Programs

### 2.1 Covered Communications

CapitalForge and its tenant-operators engage in the following communication activities that are subject to TCPA:

| Activity | TCPA Risk | Consent Type Required |
|----------|-----------|----------------------|
| Outbound advisor calls to business owners (qualification, follow-up) | High — if ATDS used or if calls are to wireless numbers | Prior express consent (non-marketing) or prior express written consent (marketing/telemarketing) |
| Outbound robocalls / IVR for appointment reminders | High — prerecorded voice | Prior express consent |
| SMS status notifications (application updates) | High — ATDS presumed for mass SMS | Prior express written consent |
| SMS marketing messages | High — telemarketing | Prior express written consent + 1:1 consent rule |
| AI-generated voice calls (VoiceForge with synthetic voice) | Critical — FCC 2024 AI voice rule requires separate disclosure | Prior express consent + separate AI voice disclosure |
| Manual one-off advisor calls | Lower risk — manual human-initiated calls from landline or non-ATDS | Best practice: prior consent |

### 2.2 ATDS Analysis

The Supreme Court's Facebook v. Duguid (2021) decision narrowed the ATDS definition to systems that use a random or sequential number generator to store or produce telephone numbers. However:
- Many predictive dialers, progressive dialers, and API-based calling platforms may still qualify as ATDSs under some state laws and FCC rules.
- VoiceForge (Twilio-based) should be analyzed by legal counsel for ATDS classification.
- **Best practice:** Treat all non-manual calls as potentially subject to TCPA consent requirements.

---

## 3. Consent Requirements by Channel

### 3.1 Voice Calls — Non-Marketing (Informational)

**Examples:** Application status updates, document requests, repayment reminders, APR expiry alerts.

**Required Consent:** Prior express consent (oral or written — no written requirement for informational calls).

**Minimum Consent Standards:**
- Consumer must clearly agree to receive calls from the specific caller on the specific telephone number.
- Consent cannot be buried in general terms and conditions without clear disclosure.
- Consent must be obtained before the first outbound call.

**Platform Implementation:** `ConsentRecord` with `channel='voice'`, `consentType='tcpa'`

---

### 3.2 Voice Calls — Marketing/Telemarketing

**Examples:** Outbound calls promoting credit card stacking programs, soliciting new funding rounds, marketing services.

**Required Consent:** **Prior express written consent** — must meet 3-part test:

1. **Agreement:** Consumer has signed a written agreement (electronic or physical) that clearly authorizes calls using ATDS or prerecorded voice.
2. **Disclosure:** The agreement clearly discloses that consent is not a condition of purchase.
3. **1:1 Rule (effective Jan 27, 2025):** Consent must name the specific company that will call — not a category of companies, not a group, not a network.

**Platform Implementation:** `ConsentRecord` with `channel='voice'`, `consentType='tcpa_marketing'`, with `evidenceRef` pointing to signed consent document in Document Vault.

---

### 3.3 SMS / Text Messages

**Examples:** Application status SMS, document submission reminders, marketing texts, two-factor authentication codes.

**Required Consent:**
- **Informational SMS:** Prior express consent.
- **Marketing SMS:** Prior express written consent + 1:1 Consent Rule.
- **2FA / OTP SMS:** Generally exempt from TCPA consent requirements as emergency/non-commercial.

**CTIA Guidelines:** Although not law, CTIA's Messaging Principles and Best Practices are used by mobile carriers to enforce anti-spam rules. Key requirements:
- Opt-in must be explicit and not bundled with unrelated consents.
- Double opt-in is recommended for marketing SMS.
- Every marketing text must include `STOP` opt-out instructions.
- Response to `STOP` must be sent within a timely manner; further messages must cease.

**Platform Implementation:** `ConsentRecord` with `channel='sms'`, `consentType='tcpa'` or `'tcpa_marketing'`.

---

### 3.4 Email

**Note:** Email is not covered by TCPA — it is governed by the CAN-SPAM Act (15 U.S.C. § 7701 et seq.) and Canadian CASL for Canadian recipients.

**CAN-SPAM Key Requirements:**
- Commercial emails must include a valid physical postal address.
- Clear identification as advertisement (for unsolicited commercial email).
- Opt-out mechanism must be honored within **10 business days**.
- Subject line must not be deceptive.

**Platform Implementation:** `ConsentRecord` with `channel='email'` documents email consent; CAN-SPAM compliance is an operator responsibility for email content and opt-out management.

---

### 3.5 Consent Validity Matrix

| Channel | Marketing? | Consent Type | Written Required? | 1:1 Rule (2025+)? | Minimum Evidence |
|---------|-----------|-------------|------------------|------------------|-----------------|
| Voice (informational) | No | Prior express consent | No | No | Script confirmation, form submission, call recording |
| Voice (marketing) | Yes | Prior express written consent | Yes | Yes | Signed consent form in Document Vault |
| SMS (informational) | No | Prior express consent | No | No | Opt-in confirmation (inbound text, web form) |
| SMS (marketing) | Yes | Prior express written consent | Yes | Yes | Signed opt-in form; carrier-compliant campaign registration |
| Prerecorded voice (any) | Either | Prior express consent | Depends on marketing | Yes (if marketing) | Written agreement strongly recommended |
| AI-generated voice | Either | Prior express consent + AI disclosure | Depends on marketing | Yes (if marketing) | Written consent + explicit AI voice disclosure |

---

## 4. Platform Consent Architecture

### 4.1 TCPA Consent Vault (Module 10)

CapitalForge's TCPA Consent Vault is the authoritative system of record for all communication consent. Key design principles:

**Immutability of Grant:** A consent grant (`status: 'active'`) can only change state via an explicit revocation action. No background process, data migration, or application logic may change a consent record's status except through the designated revocation endpoint.

**Evidence-First Design:** Every consent record requires an `evidenceRef` — a reference to the specific evidence of consent (call recording ID, signed form Document Vault ID, web form submission ID). A consent record without evidence is incomplete.

**Blocking Gate:** `consentService.verifyConsent()` is called before any outbound communication is initiated. It returns `false` (blocking execution) if no active consent record exists for the requested `businessId`, `channel`, and `consentType`.

### 4.2 Consent Record Schema

```typescript
// ConsentRecord model (Prisma)
model ConsentRecord {
  id              String    // UUID
  tenantId        String    // Tenant scope
  businessId      String    // Associated business
  channel         String    // 'voice' | 'sms' | 'email'
  consentType     String    // 'tcpa' | 'tcpa_marketing' | 'tcpa_1x1' | 'glba_privacy' | 'ach_debit'
  status          String    // 'active' | 'revoked'
  grantedAt       DateTime  // UTC timestamp of consent grant
  ipAddress       String?   // IP address at time of grant (digital consent)
  evidenceRef     String    // Document Vault ID or call recording ID
  revokedAt       DateTime? // UTC timestamp of revocation (null if not revoked)
  revocationReason String?  // Required on revocation
  metadata        Json?     // Channel-specific metadata (phone number, carrier, etc.)
}
```

### 4.3 Consent Capture Workflow

```
Step 1: Advisor / system identifies need to communicate with business owner
         │
Step 2: CHECK CONSENT — consentService.verifyConsent({ businessId, channel, consentType })
         │
         ├── ACTIVE CONSENT FOUND → Proceed to communication
         │
         └── NO ACTIVE CONSENT → HALT — consent must be captured first
                   │
Step 3: CAPTURE CONSENT — One of:
         ├── Verbal consent during inbound call → captured as voice recording (evidenceRef = recording ID)
         ├── Web form submission → captured with IP address + timestamp (evidenceRef = form submission ID)
         ├── Signed consent document → captured with DocVault ID (evidenceRef = document UUID)
         └── Inbound SMS opt-in → captured with carrier message ID (evidenceRef = message ID)
         │
Step 4: POST /api/consent — Create ConsentRecord with evidenceRef
         │
Step 5: consent.captured event → canonical ledger
         │
Step 6: Communication proceeds
```

### 4.4 1:1 Consent Compliance (2025+ Rule)

For marketing calls subject to the 2025 1:1 Consent Rule:

The consent form must name CapitalForge (or the specific tenant-operator) explicitly. A generic consent to "receive calls from our partners" is no longer sufficient.

**Required consent form language (example — must be reviewed by legal counsel):**

> "By checking this box, I authorize [COMPANY NAME], a credit card funding advisor, to contact me at the phone number provided above using an automatic telephone dialing system or artificial/prerecorded messages for marketing purposes. I understand that my consent is not a condition of any purchase and that I may revoke this consent at any time by calling [NUMBER] or texting STOP to [SHORT CODE]."

**Platform Configuration:** The `consentType` field supports `'tcpa_1x1'` to tag consents that meet the 1:1 standard. The `evidenceRef` must point to a Document Vault record containing the specific consent form presented to the consumer.

---

## 5. Revocation Procedures

### 5.1 Revocation Rights

Under TCPA and FCC rules, consumers have the right to revoke consent at any time through any reasonable means. The FCC has confirmed that revocation may be made:
- Verbally during a call
- Via text message (e.g., "STOP", "UNSUBSCRIBE", "CANCEL", "QUIT")
- Via written request
- Via email
- Via online opt-out form
- Via any other reasonable method

**Revocation must be effective immediately.** Callers may not continue contacting a consumer after revocation except to confirm the revocation itself.

### 5.2 Platform Revocation (API)

```http
DELETE /api/consent/:consentId
Authorization: Bearer <token>
X-Tenant-ID: <tenant-uuid>
Content-Type: application/json

{
  "revocationReason": "Client requested opt-out via phone — recorded in call [CALL_ID]"
}
```

**Effect:**
- `ConsentRecord.status` set to `'revoked'`
- `ConsentRecord.revokedAt` set to current UTC timestamp
- `consent.revoked` event published to canonical ledger
- `consentService.verifyConsent()` immediately returns `false` for this business/channel combination
- No outbound communication permitted for this channel until fresh consent is captured

### 5.3 Verbal Revocation During a Call

**Procedure for advisors:**
1. If a business owner says "stop calling", "remove me from your list", "unsubscribe", or equivalent:
   a. Acknowledge the request verbally: "I'll remove you from our contact list right now."
   b. Immediately enter the revocation in the platform: `DELETE /api/consent/:consentId`
   c. Confirm in the call recording that revocation was processed.
2. The call recording becomes the evidence of revocation — `revocationReason` should reference the call recording ID.
3. No further outbound calls on the revoked channel may be initiated.

### 5.4 SMS STOP Revocation

**Procedure:**
1. Configure the SMS platform (Twilio) to auto-respond to STOP, UNSUBSCRIBE, CANCEL, END, QUIT with a confirmation message.
2. Twilio STOP event webhook triggers consent revocation: `DELETE /api/consent/:consentId` with `revocationReason: 'STOP received via SMS'`
3. Document Vault records the STOP message receipt as evidence.
4. No further SMS may be sent to the number.

**Re-opt-in:** A consumer who texts STOP may re-opt-in by texting START or by completing a fresh consent form. A new ConsentRecord must be created — the old revoked record must not be reactivated.

### 5.5 Revocation Grace Period

TCPA regulations and FCC guidance do not provide a grace period for revocation. However, certain federal courts have recognized a single additional communication to confirm revocation as not violating TCPA. **Operators should not rely on any grace period.** Revocation must be treated as immediate.

**Exception for debt collection:** The Fair Debt Collection Practices Act (FDCPA) and related regulations may limit some revocation rights in the debt collection context — consult legal counsel.

---

## 6. Do-Not-Call List Management

### 6.1 National DNC Registry

The FTC's National Do-Not-Call Registry (donotcall.gov) contains numbers of consumers who have requested no telemarketing calls. The registry applies to **telemarketing** calls — not purely informational calls.

**Platform Operator Obligations:**
1. Register with the National DNC Registry (required — pay fee if applicable).
2. Download DNC list updates at minimum every 31 days before initiating telemarketing campaigns.
3. Scrub call lists against current DNC registry before dialing.
4. Honor DNC registration within 10 business days of consumer registration.
5. Maintain records of DNC scrubs for 5 years.

**CapitalForge Integration (Current Status):** DNC list scrubbing is an operator responsibility. CapitalForge does not currently offer automated DNC registry integration.

**Recommended Implementation:**
- Integrate DNC scrubbing into the outreach campaign pre-launch checks (VoiceForge Module 45 outreach campaigns).
- Add a `dncCheck` field to the `ConsentRecord` or campaign metadata to document scrub date.
- Reject or flag numbers found on DNC registry before campaign launch.

### 6.2 Internal DNC / Opt-Out List

In addition to the national registry, operators must maintain their own internal DNC list for:
- Consumers who have requested not to be called (regardless of national registry)
- Numbers of consumers who have been called under an established business relationship (EBR) that has since lapsed

**Platform Implementation:**
- Consent revocations (`status='revoked'`) in `consent_records` function as the internal DNC record.
- `GET /api/businesses/:id/consent?channel=voice&status=revoked` retrieves all revoked voice consents for a business.
- Operators should export revoked consent records before initiating any new campaigns.

### 6.3 State DNC Registries

Several states maintain their own DNC registries in addition to the national registry:

| State | State DNC Registry | Notes |
|-------|------------------|-------|
| California | California DNC — donotcall.ca.gov | Broader than federal |
| Indiana | Indiana DNC — in.gov/atg | Separate registration required |
| Texas | Texas DNC — texasattorneygeneral.gov | Separate registration required |
| Wyoming | Wyoming DNC | Separate registration |
| Florida | Florida DNC | Integrated with national |

Operators contacting consumers in these states must scrub against state DNC registries in addition to the national registry.

### 6.4 Established Business Relationship (EBR) Exemption

The EBR exemption allows telemarketing calls to consumers who have had a transaction or business relationship with the caller within the past **18 months**, or who have made an inquiry within the past **3 months** — even if on the DNC registry.

**Important limitation:** EBR is a narrow exemption. If a consumer makes a DNC request directly to the caller, the EBR exemption no longer applies and calls must stop within 10 business days.

---

## 7. Call Recording Disclosure Requirements

### 7.1 Federal "One Party Consent" Rule

Federal law (18 U.S.C. § 2511) permits recording of telephone conversations with the consent of **at least one party** to the conversation. In most cases, the party initiating recording (the advisor) is one of the parties, satisfying the federal requirement.

**However:** Many states require **all-party consent** for call recording, and federal law does not preempt more restrictive state laws.

### 7.2 All-Party Consent States

The following states require all parties' consent to record a telephone conversation:

| State | Statute | Notes |
|-------|---------|-------|
| California | Cal. Penal Code § 632 | Violations include civil liability; CIPA provides $5,000 per violation |
| Connecticut | Conn. Gen. Stat. § 52-570d | |
| Delaware | Del. Code tit. 11, § 1335 | |
| Florida | Fla. Stat. § 934.03 | |
| Illinois | 720 ILCS 5/14-1 et seq. | Illinois Eavesdropping Act |
| Maryland | Md. Code Ann., Cts. & Jud. Proc. § 10-402 | |
| Massachusetts | Mass. Gen. Laws ch. 272, § 99 | |
| Michigan | Mich. Comp. Laws § 750.539c | |
| Montana | Mont. Code Ann. § 45-8-213 | |
| Nevada | Nev. Rev. Stat. § 200.620 | |
| New Hampshire | N.H. Rev. Stat. Ann. § 570-A:2 | |
| Oregon | Or. Rev. Stat. § 165.540 | |
| Pennsylvania | 18 Pa. Cons. Stat. § 5703 | |
| Washington | Wash. Rev. Code § 9.73.030 | |

**Highest Risk: California** — California's Invasion of Privacy Act (CIPA) is frequently used as the basis for TCPA-style class action lawsuits. Any call with a California-based recipient that is recorded without disclosure carries significant litigation risk.

### 7.3 Required Call Recording Disclosure

**Best Practice (Operators calling any state):** Provide an explicit verbal recording disclosure at the start of every recorded call:

> "This call may be recorded for quality assurance and compliance purposes."

**For all-party consent states, include:**

> "By continuing this call, you consent to its recording."

**VoiceForge Implementation:**
- The `commComplianceService.getRequiredDisclosures()` function returns required disclosures by jurisdiction.
- Recording disclosure must be injected before the substantive call begins.
- The disclosure play/read event must be logged to the canonical ledger.
- Document Vault auto-files call recording with `documentType: 'call_recording'`.

### 7.4 Written Call Recording Consent

For the highest-risk calls (California recipients; marketing calls), written consent to recording is recommended and can be captured via:
- Web form with explicit recording consent checkbox
- `ConsentRecord` with `consentType: 'call_recording'` and written evidence ref

---

## 8. AI Voice and Synthetic Voice Requirements

### 8.1 FCC 2024 AI Voice Rule

In February 2024, the FCC ruled that AI-generated voices are "artificial or prerecorded voices" under the TCPA. This means:
- Calls using AI-generated or cloned voices require **prior express consent** (same as prerecorded voice calls).
- For marketing calls with AI voice: **prior express written consent** required.
- For informational calls with AI voice: **prior express consent** required.

### 8.2 Required Disclosure for AI Voice Calls

FCC guidance and best practice require that AI voice calls include a disclosure at the start of the call:

> "This call uses an AI-generated voice. If you prefer to speak with a human, press [KEY] or say 'agent'."

### 8.3 VoiceForge AI Voice Compliance

The VoiceForge integration (`src/backend/services/voiceforge.service.ts`) must:
1. Check the `consentRecord` for a specific `consentType: 'ai_voice'` before initiating AI voice calls.
2. Play the required AI voice disclosure before substantive content.
3. Log disclosure confirmation to canonical ledger.
4. Allow call transfer to human agent on request.

**Additional consent capture for AI voice:**

```typescript
// Required: separate ConsentRecord for AI voice
// consentType: 'ai_voice' + evidenceRef to consent form
POST /api/consent
{
  "businessId": "uuid",
  "channel": "voice",
  "consentType": "ai_voice",
  "evidenceRef": "docvault-uuid-of-ai-voice-consent-form",
  "metadata": { "callerPhone": "+15125550100", "aiVoiceDisclosureVersion": "1.0" }
}
```

---

## 9. VoiceForge TCPA Integration

### 9.1 Consent Gate Architecture

VoiceForge's outbound call flow includes a non-bypassable TCPA consent gate:

```
1. Outbound call requested (advisor or campaign trigger)
         │
2. consentService.verifyConsent({ businessId, channel: 'voice', consentType: 'tcpa' })
         │
         ├── false → BLOCK CALL — log attempted call without consent to audit ledger
         │
         └── true → PROCEED
                   │
3. Check DNC list (internal revocations) — confirm no revoked consent
         │
4. Initiate call via Twilio
         │
5. Play required disclosures (recording notice, AI voice notice if applicable)
         │
6. Log call.started event to canonical ledger
         │
7. Call proceeds
         │
8. call.completed event → canonical ledger with compliance check results
```

### 9.2 Call Compliance Monitoring

VoiceForge's compliance service (`src/backend/services/voiceforge-compliance.ts`) performs:
- **Banned-claim scanning:** Transcript analyzed for prohibited claims (guaranteed funding, no credit impact, etc.)
- **Required disclosure verification:** Confirms required disclosures were delivered during the call
- **Risk scoring:** Composite risk score per call based on compliance violations detected
- **Event publishing:** `call.compliance.violation` events published to canonical ledger for compliance officer review

### 9.3 TCPA Evidence Package

For each outbound call, the VoiceForge integration assembles a TCPA evidence package:
- Active consent record at time of call (`ConsentRecord` with `status='active'`)
- Call recording stored in Document Vault
- Required disclosure delivery confirmation
- Compliance scan results
- Call duration and completion status

This evidence package is critical for defending TCPA litigation — it demonstrates that consent was verified before the call, disclosures were made, and the call was compliant.

---

## 10. State Law Overlay

In addition to federal TCPA, many states have enacted laws that are more restrictive:

### 10.1 California (CIPA — Cal. Penal Code § 632)

- All-party consent for recording (see Section 7.2)
- $5,000 per violation private right of action under CIPA (in addition to TCPA)
- Class action risk is extremely high for California calls
- **Recommended practice:** Treat all California calls as requiring written consent and explicit recording disclosure

### 10.2 Florida (FCCPA + Recording Law)

- Florida's mini-TCPA (Florida Telephone Solicitation Act) may be broader than federal TCPA
- All-party consent for recording
- Florida TCPA plaintiffs' bar is very active — high litigation risk

### 10.3 Washington (Mini-TCPA)

- Washington's Commercial Electronic Mail Act (CEMA) covers email
- Washington recording statute requires all-party consent

### 10.4 Texas (TDTSA)

- Texas follows federal one-party consent for recording
- Texas Debt Collection Act has additional call restrictions
- Texas DNC registry (supplement to national registry)

### 10.5 Illinois (Biometric Information Privacy Act — BIPA)

- While not TCPA, BIPA is relevant for AI voice systems that may process voice biometrics
- BIPA requires informed consent before capturing biometric data including voiceprints
- VoiceForge AI voice features should be reviewed for BIPA applicability

### 10.6 State Law Compliance Matrix (Summary)

| State | Federal TCPA | State Mini-TCPA | All-Party Recording | Special Notes |
|-------|-------------|----------------|--------------------|-|
| California | Apply | CIPA + Rosenthal | Yes | Highest risk; written recording consent recommended |
| Florida | Apply | FTSA | Yes | Very active plaintiffs' bar |
| Texas | Apply | TDTSA | No (one-party) | State DNC registry |
| Illinois | Apply | None specific | No (one-party) | BIPA for AI voice biometrics |
| New York | Apply | None specific | No (one-party) | NY AG active enforcement |
| Washington | Apply | None specific | Yes | CEMA for email |

---

## 11. Operator Responsibilities

Tenant-operators are responsible for the following TCPA compliance obligations that extend beyond CapitalForge's technical controls:

1. **Consent form drafting:** Drafting TCPA-compliant consent forms that name the specific entity, satisfy the 1:1 consent rule, and meet written consent standards. Legal counsel review required.

2. **DNC registry scrubbing:** Subscribing to the National DNC Registry, downloading updates at least every 31 days, and scrubbing call lists before campaigns. State DNC registries where applicable.

3. **Internal DNC list maintenance:** Maintaining a company-specific DNC list covering all opt-out requests. Exporting revoked consent records from CapitalForge before initiating campaigns.

4. **SMS short code / long code registration:** Registering 10-digit long codes (10DLC) with The Campaign Registry (TCR) for all business messaging to comply with carrier requirements. Failure to register results in message blocking.

5. **Carrier A2P compliance:** Ensuring all SMS campaigns are registered and comply with CTIA and carrier guidelines for Application-to-Person (A2P) messaging.

6. **Call recording disclosures:** Training advisors to deliver appropriate recording disclosures for all-party consent states. Configuring VoiceForge to automatically play required disclosures.

7. **Opt-out monitoring:** Monitoring all revocation channels (verbal, STOP text, unsubscribe web, email) and ensuring revocations are processed in the platform within the call.

8. **ATDS analysis:** Obtaining legal counsel analysis of whether the dialing technology used constitutes an ATDS under current FCC rules and applicable circuit court precedent.

9. **Litigation hold:** In the event of a TCPA lawsuit or demand letter, immediately applying legal hold to all relevant consent records, call recordings, and DNC scrub records.

10. **State law compliance:** Confirming applicable state recording consent and mini-TCPA requirements with legal counsel before initiating campaigns in states with more restrictive laws.

---

## 12. Compliance Evidence Guide

For TCPA litigation defense, the following evidence from CapitalForge must be readily accessible and producible:

| Evidence Type | Platform Source | API Endpoint | Retention Period |
|--------------|----------------|-------------|-----------------|
| Consent record at time of call | `consent_records` table with `status='active'` at call time | `GET /api/businesses/:id/consent` | 5 years from revocation |
| Evidence of consent (form, recording) | Document Vault `evidenceRef` document | `GET /api/documents/:id` | 5 years |
| Call recording | Document Vault `documentType='call_recording'` | `GET /api/businesses/:id/documents?documentType=call_recording` | 5 years from call |
| Call compliance scan | `ledger_events` with `eventType='call.completed'` | `GET /api/audit/events?eventType=call.completed` | 5 years |
| Revocation record | `consent_records` with `status='revoked'` | `GET /api/consent/:consentId` | 5 years from revocation |
| DNC scrub records | Operator-maintained (outside platform) | N/A | 5 years |
| Disclosure delivery confirmation | `ledger_events` with disclosure payload | `GET /api/audit/events` | 5 years |
| Audit log of all consent changes | `audit_logs` table | N/A (compliance officer direct access) | 7 years |
| Canonical event ledger | `ledger_events` table | `GET /api/audit/events` | 7 years |

---

## 13. TCPA Audit Procedures

### 13.1 Monthly Consent Audit

Run monthly to verify consent vault integrity:

```sql
-- Calls initiated without active consent at time of call (should be zero)
-- [Cross-reference call records with consent records by timestamp]

-- Revoked consents with subsequent outbound calls (critical violation)
SELECT cr.businessId, cr.channel, cr.revokedAt, le.createdAt AS callInitiatedAt
FROM consent_records cr
JOIN ledger_events le ON le.payload->>'businessId' = cr.businessId
  AND le.eventType = 'call.started'
  AND le.createdAt > cr.revokedAt
WHERE cr.status = 'revoked'
  AND cr.channel = 'voice';
-- Expected result: 0 rows
```

### 13.2 Quarterly Consent Record Completeness Check

```sql
-- Consent records missing evidenceRef (incomplete — must be remediated)
SELECT id, tenantId, businessId, channel, consentType, grantedAt
FROM consent_records
WHERE status = 'active'
  AND (evidenceRef IS NULL OR evidenceRef = '');
-- Expected result: 0 rows
```

### 13.3 Annual Compliance Review

- Review all TCPA consent form templates with legal counsel against current FCC rules.
- Confirm 1:1 consent forms name specific entities (post-January 2025).
- Review any TCPA demands or lawsuits received; update templates accordingly.
- Confirm DNC registry subscription is current and scrub processes are functioning.
- Review call recording disclosure language for all-party consent states.
- Confirm VoiceForge AI voice disclosures are current and logged.

---

**Document Control**

| Version | Date | Author | Summary of Changes |
|---------|------|--------|-------------------|
| 1.0 | 2026-03-31 | Engineering / Compliance Team | Initial version — covers TCPA federal + state overlay + AI voice |

**Next Review Date:** 2027-03-31 (or upon material FCC rulemaking or significant TCPA litigation development)
