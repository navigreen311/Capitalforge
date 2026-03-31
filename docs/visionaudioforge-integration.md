# VisionAudioForge Integration — Architecture & Processing Guide

**Module:** VisionAudioForge Document Intelligence Hub (Module 46)
**Pillar:** Intelligence / Platform
**Last updated:** 2026-03-31

---

## Table of Contents

1. [Overview](#overview)
2. [OCR Pipeline](#ocr-pipeline)
3. [Agent Orchestration](#agent-orchestration)
4. [Maker-Checker Pattern](#maker-checker-pattern)
5. [Document Processing Flows](#document-processing-flows)
6. [Service Map](#service-map)
7. [Event Bus Integration](#event-bus-integration)
8. [Configuration Reference](#configuration-reference)
9. [Production Wiring](#production-wiring)

---

## Overview

VisionAudioForge (VAF) is CapitalForge's document intelligence hub. It transforms raw PDFs, images, and binary files into structured data using OCR pipelines and AI agents, then files all processed documents to the Document Vault with full metadata tagging.

**Core capabilities:**

| Capability | Description |
|------------|-------------|
| OCR extraction | Text and structured data from PDFs, scanned images, bank statements |
| Adverse action parsing | Structured extraction from issuer decline letters |
| Contract intelligence | Clause detection, red-flag scoring, obligation mapping |
| KYB document verification | Business registration, EIN letters, SOS filings |
| Receipt / invoice matching | Line-item extraction and GL code suggestion |
| ID liveness detection | Selfie + ID matching (stub → Onfido / Rekognition in production) |
| Agent orchestration | Multi-step pipelines with maker-checker approval chains |
| Document Vault auto-filing | All processed documents stored with crypto-timestamps |

VisionAudioForge consists of two service files:

| File | Responsibility |
|------|---------------|
| `src/backend/services/visionaudioforge.service.ts` | Core OCR pipelines, liveness detection, maker-checker log, vault auto-filing |
| `src/backend/services/visionaudioforge-agents.ts` | Typed agent classes with session logging and approval chains |

---

## OCR Pipeline

### Input / Output model

```
processDocument(input: {
  tenantId:     string,
  businessId:   string,
  actorId:      string,
  fileBuffer:   Buffer,
  mimeType:     string,      // 'application/pdf' | 'image/jpeg' | 'image/png'
  documentType: DocumentCategory,
  autoFile?:    boolean,     // auto-save to Document Vault (default: true)
})

Returns: ProcessDocumentResult {
  documentId:     string,       // vault document ID if autoFile = true
  category:       DocumentCategory,
  pages:          OcrPage[],    // raw OCR page data
  structuredData: StatementData | AdverseActionData | ContractClauseData | ...,
  confidence:     number,       // 0–1 aggregate confidence
  makerEntry:     MakerCheckerEntry,
  processingMs:   number,
}
```

### OCR pipeline stages

```
File Buffer (PDF / image)
        │
        ▼
Stage 1: Pre-processing
  ├── MIME type validation
  ├── File size check (max 50 MB)
  └── Orientation correction (stub)
        │
        ▼
Stage 2: OCR extraction (stub → AWS Textract / Google Document AI)
  ├── Raw text extraction per page
  ├── Table detection and structure extraction
  ├── Key-value pair detection
  └── Signature block detection
        │
        ▼
Stage 3: Structured data extraction (per document category)
  ├── bank_statement    → StatementData (account info, transactions, balances)
  ├── adverse_action    → AdverseActionData (issuer, reasons, date, ECOA rights)
  ├── contract          → ContractClauseData (clauses[], redFlags[], obligations[])
  ├── kyb_document      → KybDocumentData (entityName, ein, sosFilingNumber, state)
  ├── receipt_invoice   → ReceiptData (vendor, lineItems[], total, glSuggestions)
  └── id_document       → IdDocumentData (name, dob, idNumber, expiry, issuer)
        │
        ▼
Stage 4: Confidence scoring
  ├── Per-page confidence from OCR engine
  ├── Structured data completeness check
  └── Aggregate confidence = avg(page confidences) × completeness factor
        │
        ▼
Stage 5: Auto-filing to Document Vault
  ├── SHA-256 hash of original buffer
  ├── Crypto-timestamp anchoring
  ├── Metadata tagging (documentType, category, confidence, processingMs)
  └── DOCUMENT_UPLOADED event published
        │
        ▼
Stage 6: Maker entry logged
  └── MakerCheckerEntry persisted in agent session log
```

### Confidence thresholds

| Confidence | Status | Action |
|------------|--------|--------|
| ≥ 0.85 | High confidence | Auto-approve |
| 0.60–0.84 | Medium confidence | Route to checker review |
| < 0.60 | Low confidence | Flag for manual re-scan |

---

## Agent Orchestration

VAF uses typed agent classes for multi-step document processing pipelines. Each agent maintains a session log and integrates with the maker-checker approval chain.

### Available agents

| Agent | Class | Purpose |
|-------|-------|---------|
| `StatementAgent` | `StatementAgent` | Ingest statements → normalize → route to reconciliation |
| `KYBAgent` | `KYBAgent` | Process ID documents → run entity verification |
| `ContractAgent` | `ContractAgent` | Extract clauses → detect red flags → obligation mapping |
| `AcknowledgmentAgent` | `AcknowledgmentAgent` | Generate signed PDF acknowledgments |
| `EvidenceBundleAgent` | `EvidenceBundleAgent` | Assemble regulator response packs |

### Agent lifecycle

```
Agent instantiated (session ID generated)
         │
         ▼
agent.run(context, input)
         │
         ▼
Step 1: logMaker(ctx, action, inputSummary)
  └── MakerCheckerEntry created with actionId, actorId, sessionId
         │
         ▼
Step 2: Process document (VAF service call)
         │
         ▼
Step 3: Determine approval need
  ├── Low risk / high confidence → auto-approve
  └── Medium/high risk or low confidence → require checker
         │
         ▼
Step 4: logChecker(ctx, actionId, decision, notes)
  └── Checker entry appended to maker entry
         │
         ▼
Step 5: Return result with full session log
```

---

## Maker-Checker Pattern

Every significant agent action follows the maker-checker (four-eyes) principle:

```
MakerCheckerEntry {
  actionId:      uuid,          // unique per action
  sessionId:     uuid,          // shared across agent session
  sequence:      number,        // order within session
  agentType:     AgentType,     // 'statement' | 'kyb' | 'contract' | 'acknowledgment' | 'evidence_bundle'
  action:        string,        // human-readable description
  actorId:       string,        // user or system actor
  inputSummary:  object,        // sanitized (no PII) input summary
  outputSummary: object | null, // sanitized output summary
  checkerUserId: string | null, // null until checked
  checkerDecision: 'approved' | 'rejected' | 'auto_approved' | null,
  checkerNotes:  string | null,
  checkedAt:     Date | null,
  timestamp:     Date,
}
```

**Auto-approval criteria:**

| Condition | Auto-approve |
|-----------|-------------|
| OCR confidence ≥ 0.85 AND document type = `receipt_invoice` | Yes |
| Document type = `acknowledgment` AND signer verified | Yes |
| Evidence bundle with all vault references resolved | Yes |

All other actions require a human checker (compliance officer or supervisor).

**Maker-checker invariant:** The maker actor and checker actor must be different users. System auto-approvals are recorded with `checkerUserId = 'system'`.

---

## Document Processing Flows

### Bank Statement Ingestion

```
StatementAgent.processStatements(ctx, { fileBuffers[], accountId })
    │
    ├── For each buffer:
    │     processDocument() → StatementData
    │     ├── accountNumber, routingNumber
    │     ├── statementPeriod (startDate, endDate)
    │     ├── openingBalance, closingBalance
    │     └── transactions[]: { date, description, amount, type, balance }
    │
    ├── Maker entry logged per statement
    │
    ├── High confidence (≥ 0.85) → auto-approve → route to reconciliation
    └── Low confidence → checker review required
```

### Adverse Action Letter Parsing

```
VisionAudioForgeService.processDocument({ documentType: 'adverse_action_letter' })
    │
    ├── Extract: issuer, applicationId, decisionDate, denialReasons[]
    ├── Extract: ECOA rights notice text, appeal deadline
    ├── Structured: AdverseActionData
    │
    └── Auto-file to vault with type 'adverse_action'
        └── Linked to CardApplication record via applicationId
```

### KYB Document Verification

```
KYBAgent.processDocument(ctx, { fileBuffer, documentSubtype })
    │
    ├── OCR extracts: entityName, EIN, SOSFilingNumber, state, status
    ├── Cross-reference against business record in Prisma
    ├── Maker entry logged
    │
    ├── Match confidence ≥ 0.85 → auto-approve
    └── Match confidence < 0.85 → checker review → manual SOS lookup
```

### Regulator Evidence Bundle

```
EvidenceBundleAgent.buildBundle(ctx, {
  businessId, requestedBy, since?, until?
})
    │
    ├── Pull all vault documents for businessId
    ├── Pull consent records, acknowledgments, compliance checks
    ├── Verify all crypto-timestamps valid
    ├── Generate manifest JSON
    ├── Maker entry logged
    │
    └── Bundle filed to vault as 'evidence_bundle' document type
        └── Returns manifest + list of included document IDs
```

---

## Service Map

```
┌──────────────────────────────────────────────────────────────────┐
│                    VisionAudioForge                              │
│                                                                  │
│  VisionAudioForgeService                                         │
│    processDocument()       → OCR stub → structured data          │
│    processStatement()      → StatementData                       │
│    parseAdverseAction()    → AdverseActionData                   │
│    extractContractClauses()→ ContractClauseData                  │
│    verifyKybDocument()     → KybDocumentData                     │
│    detectLiveness()        → LivenessResult (stub)               │
│    logMakerEntry()         → in-memory + event log               │
│    logCheckerDecision()    → maker entry update                  │
│                                                                  │
│  Agent Classes (visionaudioforge-agents.ts)                      │
│    StatementAgent          → processStatements()                 │
│    KYBAgent                → processDocument()                   │
│    ContractAgent           → analyzeContract()                   │
│    AcknowledgmentAgent     → generateAcknowledgment()            │
│    EvidenceBundleAgent     → buildBundle()                       │
│                                                                  │
│  Dependencies                                                    │
│    DocumentVaultService    → auto-file all outputs               │
│    EventBus                → publish processing events           │
│    PolicyOrchestrationSvc  → approval chain enforcement          │
└──────────────────────────────────────────────────────────────────┘
```

---

## Event Bus Integration

| Event Type | Published when |
|------------|---------------|
| `document.ocr_completed` | OCR extraction finishes for a document |
| `document.structured_extracted` | Structured data extraction completes |
| `document.uploaded` | Auto-filing to Document Vault succeeds |
| `agent.maker_action` | Agent logs a maker entry |
| `agent.checker_approved` | Checker approves a maker entry |
| `agent.checker_rejected` | Checker rejects a maker entry |
| `evidence_bundle.assembled` | Evidence bundle fully assembled |

All events include `tenantId`, `businessId`, `documentId`, and are persisted to `ledger_events`.

---

## Configuration Reference

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `OCR_PROVIDER` | `stub` | `aws_textract`, `google_documentai`, `azure_form_recognizer`, or `stub` |
| `AWS_TEXTRACT_REGION` | `us-east-1` | AWS region for Textract |
| `LIVENESS_PROVIDER` | `stub` | `aws_rekognition`, `onfido`, `jumio`, or `stub` |
| `VAF_MAX_FILE_SIZE_MB` | `50` | Maximum accepted file size in MB |
| `VAF_AUTO_APPROVE_THRESHOLD` | `0.85` | OCR confidence threshold for auto-approval |
| `VAF_CHECKER_TIMEOUT_HOURS` | `24` | SLA for human checker review |

---

## Production Wiring

### AWS Textract

```typescript
import { TextractClient, AnalyzeDocumentCommand } from '@aws-sdk/client-textract';

const client = new TextractClient({ region: process.env.AWS_TEXTRACT_REGION });

const command = new AnalyzeDocumentCommand({
  Document: { Bytes: fileBuffer },
  FeatureTypes: ['TABLES', 'FORMS', 'SIGNATURES'],
});

const response = await client.send(command);
// Map response.Blocks to OcrPage[] and ExtractedTable[]
```

### Google Document AI

```typescript
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

const client = new DocumentProcessorServiceClient();
const [result] = await client.processDocument({
  name: `projects/${projectId}/locations/${location}/processors/${processorId}`,
  rawDocument: { content: fileBuffer.toString('base64'), mimeType },
});
// Map result.document to OcrPage[]
```

### AWS Rekognition (ID liveness)

```typescript
import { RekognitionClient, CompareFacesCommand } from '@aws-sdk/client-rekognition';

const rekognition = new RekognitionClient({ region: process.env.AWS_REGION });
const command = new CompareFacesCommand({
  SourceImage: { Bytes: selfieBuffer },
  TargetImage: { Bytes: idPhotoBuffer },
  SimilarityThreshold: 90,
});
const { FaceMatches } = await rekognition.send(command);
// liveness = FaceMatches[0]?.Similarity >= 90
```

### Stub replacement checklist

- [ ] Replace `_stubOcr()` in `visionaudioforge.service.ts` with Textract / Document AI call
- [ ] Replace `_stubLiveness()` with Rekognition / Onfido call
- [ ] Set `OCR_PROVIDER` environment variable to the chosen provider
- [ ] Configure IAM roles / service account with least-privilege OCR permissions
- [ ] Add S3 pre-processing bucket for large document staging (> 5 MB Textract limit for bytes mode)
- [ ] Enable Textract async mode (`StartDocumentAnalysis`) for PDFs > 3 pages
