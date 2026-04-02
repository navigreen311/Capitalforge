# CapitalForge Integrations — VoiceForge & VisionAudioForge

## Overview

CapitalForge integrates with two companion micro-services for telephony and document intelligence:

| Service | Purpose | Default URL |
|---------|---------|-------------|
| **VoiceForge** | Outbound calls, call compliance, QA scoring, campaigns | `http://localhost:3001` |
| **VisionAudioForge** | OCR/document parsing, KYC verification, evidence bundles | `http://localhost:3002` |

Both clients support a **mock mode** (`NEXT_PUBLIC_USE_MOCK_DATA=true`) that returns deterministic sample data without requiring the external services to be running.

---

## Architecture

```
CapitalForge (Next.js)
  |
  |-- lib/voiceforge-client.ts       --> VoiceForge API (REST)
  |-- lib/visionaudioforge-client.ts --> VisionAudioForge API (REST)
  |-- lib/tcpa-consent-gate.ts       --> TCPA consent check (localStorage mock)
  |
  |-- app/api/webhooks/voiceforge/route.ts        <-- inbound webhooks
  |-- app/api/webhooks/visionaudioforge/route.ts  <-- inbound webhooks
  |
  |-- app/platform/voiceforge/page.tsx             (iframe dashboard)
  |-- app/platform/visionaudioforge/page.tsx       (iframe dashboard)
```

---

## Environment Variables

Add these to your `.env.local` (all optional — defaults shown):

```env
# VoiceForge service
NEXT_PUBLIC_VOICEFORGE_URL=http://localhost:3001

# VisionAudioForge service
NEXT_PUBLIC_VISIONAUDIOFORGE_URL=http://localhost:3002

# Enable mock mode (no external services required)
NEXT_PUBLIC_USE_MOCK_DATA=true
```

---

## VoiceForge Client

**File:** `src/frontend/lib/voiceforge-client.ts`

| Method | Description |
|--------|-------------|
| `getDashboardSummary()` | Call stats, active campaigns, avg QA score, compliance flags |
| `initiateCall(params)` | Initiate outbound call with TCPA consent pre-check |
| `getClientCalls(clientId)` | Call history for a specific client |
| `getCallDetail(callId)` | Full call detail with recording/transcript URLs |
| `getCampaigns()` | List active outreach campaigns |
| `getQAScores(advisorId?)` | QA scorecard data, optionally filtered by advisor |
| `getComplianceFlags()` | List compliance-flagged calls |

---

## VisionAudioForge Client

**File:** `src/frontend/lib/visionaudioforge-client.ts`

| Method | Description |
|--------|-------------|
| `parseDocument(file, docType)` | Generic OCR/parse with field extraction |
| `parseStatement(file)` | Credit card statement line-item extraction |
| `parseAdverseAction(file)` | Adverse action / decline reason extraction |
| `verifyIdentity(file)` | ID document verification (KYC) |
| `extractContractClauses(file)` | Contract clause extraction with risk levels |
| `assembleEvidenceBundle(params)` | Assemble a multi-document evidence dossier |

---

## TCPA Consent Gate

**File:** `src/frontend/lib/tcpa-consent-gate.ts`

Before initiating any outbound call, the `verifyTcpaConsent(clientId)` function checks that the client has an active voice-consent record. In the current implementation this reads from localStorage; in production it would call the backend consent-management API.

Helper functions `seedMockConsent()` and `revokeMockConsent()` are available for development.

---

## Webhook Endpoints

### VoiceForge Webhooks

**URL:** `POST /api/webhooks/voiceforge`

| Event | Description |
|-------|-------------|
| `call.completed` | Fired when a call ends; includes callId and duration |
| `call.recording_ready` | Fired when the call recording is available for download |
| `compliance.flag_raised` | Fired when the real-time compliance engine flags a call |

### VisionAudioForge Webhooks

**URL:** `POST /api/webhooks/visionaudioforge`

| Event | Description |
|-------|-------------|
| `document.parsed` | Fired when OCR/parsing completes for an uploaded document |
| `kyc.verified` | Fired when identity verification completes |

All webhook endpoints return `{ received: true }` on success. Unrecognized events receive a `422` response.

---

## Platform Pages

| Page | Path | Description |
|------|------|-------------|
| VoiceForge Dashboard | `/platform/voiceforge` | Iframe embed with health-check connection status |
| VisionAudioForge Dashboard | `/platform/visionaudioforge` | Iframe embed with health-check connection status |

Both pages poll the service `/health` endpoint every 30 seconds and display a connection indicator (green = connected, red = disconnected, amber = checking).
