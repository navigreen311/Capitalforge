# VoiceForge Integration — Architecture & Compliance Guide

**Module:** VoiceForge (Module 45)
**Pillar:** Orchestration / Compliance
**Last updated:** 2026-03-31

---

## Table of Contents

1. [Overview](#overview)
2. [TCPA Consent Gate Flow](#tcpa-consent-gate-flow)
3. [Call Compliance Pipeline](#call-compliance-pipeline)
4. [Outreach Campaigns](#outreach-campaigns)
5. [QA Scoring](#qa-scoring)
6. [Event Bus Integration](#event-bus-integration)
7. [Service Map](#service-map)
8. [Configuration Reference](#configuration-reference)
9. [Production Wiring (Twilio)](#production-wiring-twilio)
10. [Compliance Notes](#compliance-notes)

---

## Overview

VoiceForge is CapitalForge's telephony and call-compliance layer. It provides:

- **Outbound call initiation** gated by real-time TCPA consent verification
- **Live call compliance monitoring** — banned-claim scanning and risk scoring during and after calls
- **Automated outreach campaigns** — APR expiry, repayment reminders, re-stack consultations
- **Advisor QA scoring** — post-call rubric grading per completed call
- **Document Vault auto-filing** — all call records filed as immutable documents
- **Event Bus integration** — every call lifecycle event published to the canonical ledger

VoiceForge consists of three service files:

| File | Responsibility |
|------|---------------|
| `src/backend/services/voiceforge.service.ts` | Core telephony logic, campaign orchestration, call record management |
| `src/backend/services/voiceforge-compliance.ts` | Transcript scanning, risk scoring, disclosure insertion, QA scoring |
| `src/backend/services/comm-compliance.service.ts` | Shared banned-claims list and required-disclosures registry (single source of truth) |

---

## TCPA Consent Gate Flow

**This gate is non-negotiable.** No outbound call is ever placed without passing the consent gate.

```
Caller requests outbound dial
         │
         ▼
consentGate.check(tenantId, businessId, 'voice')
         │
    ┌────┴────┐
    │         │
  allowed   denied
    │         │
    │         ▼
    │    HARD STOP — call is never placed
    │    Reason logged: CONSENT_MISSING | CONSENT_REVOKED | CONSENT_EXPIRED | TCPA_HARD_BLOCK
    │    TcpaConsentError thrown to caller
    │
    ▼
Twilio client.calls.create(...)
         │
         ▼
Call record created in Document Vault
         │
         ▼
CALL_INITIATED event published to ledger
```

### Consent requirements by channel

| Channel | Required consent type |
|---------|-----------------------|
| `voice` | `tcpa` (active) |
| `sms` | `tcpa` (active) |
| `email` | `tcpa` or `data_sharing` (active) |
| `partner` | `referral` (active) |

Revoked consent is **immediately effective** — no grace period. If consent is revoked mid-campaign, subsequent calls for that business are blocked.

### Implementation reference

```typescript
// Before any outbound dial:
const gate = await consentGate.check(tenantId, businessId, 'voice', consentService);

if (!gate.allowed) {
  // HARD STOP — do not proceed
  throw new TcpaConsentError(gate.reason, gate.message);
}

// Only reach here if allowed === true
await twilioClient.calls.create({ ... });
```

---

## Call Compliance Pipeline

Every call passes through the compliance pipeline at two stages:

### 1. Real-time scanning (during call / after transcript received)

```
Transcript text
      │
      ▼
VoiceForgeComplianceService.scanTranscript(transcriptText)
      │
      ├── Scans against BANNED_CLAIMS registry from comm-compliance.service.ts
      │   Categories:
      │     - guaranteed_approval
      │     - government_affiliation
      │     - no_upfront_fee
      │     - income_projection
      │     - product_misrepresentation
      │     - coaching_claim
      │
      ├── Checks for REQUIRED_DISCLOSURES not yet delivered
      │   (e.g. SB 1235 APR disclosure, personal guarantee notice)
      │
      ├── Computes risk score (0–100)
      │   Each banned claim: severityWeight × 10, capped at 100
      │   riskLevel: low (0–25) / medium (26–50) / high (51–75) / critical (76–100)
      │
      └── Returns: violations[], disclosuresToInsert[], riskScore, riskLevel
```

### 2. Risk escalation

| Risk Level | Action |
|------------|--------|
| low (0–25) | Log only, no action required |
| medium (26–50) | Flag for supervisor review in next session |
| high (51–75) | Auto-insert required disclosures; flag for immediate review |
| critical (76–100) | Publish `CALL_COMPLIANCE_VIOLATION` event; lock advisor pending review |

### Banned claim categories (partial list)

| Category | Example prohibited phrase |
|----------|--------------------------|
| `guaranteed_approval` | "You are guaranteed to be approved" |
| `government_affiliation` | "This is a government-backed program" |
| `no_upfront_fee` | "There are absolutely no fees" |
| `income_projection` | "You will earn $X per month from points" |
| `product_misrepresentation` | "This is the same as a business loan" |
| `coaching_claim` | "We coach you on how to hide debt" |

Full registry: `src/backend/services/comm-compliance.service.ts` → `BANNED_CLAIMS`.

---

## Outreach Campaigns

Three automated campaign types run on BullMQ scheduled jobs:

### APR Expiry Campaign (`apr_expiry`)

**Trigger:** BullMQ job fired at T-60, T-30, T-15 days before intro APR expiry

**Flow:**
```
APR expiry job fires
    │
    ▼
Query funding rounds with expiry in window
    │
    ▼
For each business in round:
  ├── consentGate.check(businessId, 'voice')
  ├── if allowed → queue outbound call
  └── if denied  → log skip, increment denied_count metric
    │
    ▼
Call initiated (Twilio stub → real Twilio in production)
    │
    ▼
Call record filed to Document Vault
    │
    ▼
APR_EXPIRY_OUTREACH_COMPLETED event published
```

### Repayment Reminder Campaign (`repayment_reminder`)

**Trigger:** BullMQ job fired 3 days before ACH debit event

**Flow:** same consent gate → call → vault → event pattern as above.

### Re-Stack Consultation Campaign (`restack_consultation`)

**Trigger:** Auto-Restack service emits `restack.opportunity_detected` event

**Flow:** same consent gate → call → vault → event pattern, with re-stack context in call metadata.

---

## QA Scoring

Post-call QA scoring rates advisor calls against a compliance rubric:

```
scoreAdvisorCall(params: {
  callId, transcriptText, advisorId,
  disclosureDelivered, consentVerifiedOnCall
})

Returns: {
  advisorId,
  callId,
  score: 0–100,
  passed: boolean,          // score >= 70
  findings: string[],       // list of rubric failures
  requiredFollowUp: boolean // true if score < 50
}
```

### QA Rubric dimensions

| Dimension | Weight | Pass condition |
|-----------|--------|---------------|
| Disclosure delivered | 30 pts | SB 1235 / product disclosure confirmed |
| Consent verified on call | 20 pts | Advisor confirmed verbal consent |
| No banned claims | 30 pts | Zero violations in transcript scan |
| Product accurately described | 20 pts | No misrepresentation findings |

QA failures with score < 50 set `requiredFollowUp: true` and publish a `CALL_QA_FAILED` event to trigger supervisor review workflow.

---

## Event Bus Integration

| Event Type | Published when |
|------------|---------------|
| `call.initiated` | Outbound call queued with Twilio |
| `call.completed` | Call ends with status `completed` |
| `call.failed` | Call ends with status `failed`, `busy`, or `no-answer` |
| `call.compliance_violation` | Transcript scan produces critical or high risk |
| `call.qa_scored` | QA scoring completes for a call record |
| `campaign.completed` | An outreach campaign batch finishes |

All events include `tenantId`, `businessId`, `callId`, and are persisted to the `ledger_events` table.

---

## Service Map

```
┌──────────────────────────────────────────────────────────────────┐
│                         VoiceForge                               │
│                                                                  │
│  VoiceForgeService                                               │
│    initiateCall()         → consentGate → Twilio stub            │
│    runAprExpiryCampaign() → BullMQ schedule → consent → calls    │
│    getCallRecord()        → Document Vault                       │
│    getCallTranscript()    → Twilio Recordings API stub           │
│                                                                  │
│  VoiceForgeComplianceService                                     │
│    scanTranscript()       → comm-compliance BANNED_CLAIMS        │
│    scoreAdvisorCall()     → QA rubric + findings                 │
│    insertDisclosure()     → REQUIRED_DISCLOSURES registry        │
│                                                                  │
│  Dependencies                                                    │
│    consentGate            → ConsentService → PrismaClient        │
│    DocumentVaultService   → S3/local storage + PrismaClient      │
│    eventBus               → ledger_events table                  │
│    BANNED_CLAIMS          → comm-compliance.service.ts           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Configuration Reference

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | — | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | — | Twilio Auth Token |
| `TWILIO_FROM_NUMBER` | — | Default outbound caller ID |
| `TWILIO_RECORDING_ENABLED` | `false` | Enable call recording (requires consent) |
| `VOICEFORGE_QA_PASS_SCORE` | `70` | Minimum QA score to pass |
| `VOICEFORGE_CAMPAIGN_CONCURRENCY` | `5` | Max parallel outbound calls per campaign |

---

## Production Wiring (Twilio)

The current implementation uses a stub Twilio client. To wire production:

1. Install the Twilio SDK:
   ```bash
   npm install twilio
   ```

2. Replace the stub in `voiceforge.service.ts`:
   ```typescript
   import twilio from 'twilio';
   const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

   // In initiateCall():
   const call = await client.calls.create({
     to:  input.toPhoneNumber,
     from: input.fromPhoneNumber,
     url:  `${process.env.TWILIO_WEBHOOK_BASE_URL}/api/voiceforge/twiml`,
     record: process.env.TWILIO_RECORDING_ENABLED === 'true',
     statusCallback: `${process.env.TWILIO_WEBHOOK_BASE_URL}/api/voiceforge/status`,
     statusCallbackMethod: 'POST',
   });
   ```

3. Implement the TwiML webhook at `/api/voiceforge/twiml` to serve call scripts.
4. Implement the status webhook at `/api/voiceforge/status` to update call records.

---

## Compliance Notes

- **TCPA (47 U.S.C. § 227):** Prior express written consent required for all autodialed calls to cell phones. VoiceForge enforces this via the consent gate on every call.
- **FCC Mini-Miranda:** Not applicable to commercial credit programs, but advisors must not make false debt-collection representations.
- **State do-not-call lists:** In production, integrate a DNC list scrubber before queuing outbound calls.
- **Call recording disclosure:** Some states require two-party consent for recording (California, Florida, etc.). Enable recording only after confirming state-specific requirements and capturing consent.
- **Abandonment rate:** FTC regulations require live operators to answer within 2 seconds and limit abandoned calls to < 3% per campaign. Configure Twilio campaign settings accordingly.
