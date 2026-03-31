// ============================================================
// CapitalForge — VisionAudioForge Document Intelligence Hub
//
// Responsibilities:
//   1. processDocument — accepts PDF/image Buffers, returns
//      extracted text + structured data
//   2. OCR pipeline stubs:
//      - Statement ingestion
//      - Adverse action letter parsing
//      - Contract clause extraction
//      - KYB document verification
//      - Receipt / invoice matching
//   3. ID liveness detection stub
//   4. Auto-filing of all processed documents to Document Vault
//      with full metadata tagging
//   5. Agent orchestration: multi-step sequences gated by
//      Policy Orchestration approval chains (maker-checker)
//
// STUB NOTICE:
//   OCR calls are stubs. In production wire to:
//     - AWS Textract (extractDocument / analyzeDocument)
//     - Google Document AI
//     - Azure Form Recognizer
//   Liveness calls are stubs. In production wire to:
//     - AWS Rekognition (CompareFaces / DetectFaces)
//     - Onfido / Jumio / Persona
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { EventBus } from '../events/event-bus.js';
import logger from '../config/logger.js';
import {
  DocumentVaultService,
  type DocumentRecord,
  type DocumentType,
} from './document-vault.service.js';

// ── OCR Result Types ───────────────────────────────────────────

export type DocumentCategory =
  | 'bank_statement'
  | 'adverse_action_letter'
  | 'contract'
  | 'kyb_document'
  | 'receipt_invoice'
  | 'id_document'
  | 'unknown';

export interface OcrPage {
  pageNumber: number;
  rawText:    string;
  confidence: number; // 0–1
  blocks:     OcrBlock[];
}

export interface OcrBlock {
  id:         string;
  blockType:  'LINE' | 'WORD' | 'TABLE' | 'CELL' | 'KEY_VALUE_SET' | 'SIGNATURE';
  text:       string;
  confidence: number;
  boundingBox?: {
    left: number; top: number; width: number; height: number;
  };
}

export interface ExtractedTable {
  tableId:  string;
  headers:  string[];
  rows:     Record<string, string>[];
}

export interface KeyValuePair {
  key:        string;
  value:      string;
  confidence: number;
}

// ── Structured Data Shapes ─────────────────────────────────────

export interface StatementData {
  accountHolder:    string | null;
  accountNumber:    string | null;  // masked
  routingNumber:    string | null;  // masked
  statementPeriod:  { start: string; end: string } | null;
  openingBalance:   number | null;
  closingBalance:   number | null;
  transactions:     StatementTransaction[];
  averageDailyBalance: number | null;
  institutionName:  string | null;
}

export interface StatementTransaction {
  date:        string;
  description: string;
  amount:      number;
  type:        'credit' | 'debit' | 'fee' | 'transfer' | 'unknown';
  balance:     number | null;
  category:    string | null;
}

export interface AdverseActionData {
  applicantName:  string | null;
  applicantId:    string | null;
  actionDate:     string | null;
  actionType:     'denial' | 'counter_offer' | 'partial_approval' | 'unknown';
  reasons:        string[];
  creditBureau:   string | null;
  disputeRights:  boolean;
  reguratoryRef:  string | null;
}

export interface ContractClauseData {
  totalClauses:   number;
  clauses:        ExtractedContractClause[];
  redFlags:       ContractRedFlag[];
  missingProtections: string[];
}

export interface ExtractedContractClause {
  id:         string;
  type:       string;
  text:       string;
  confidence: number;
  pageRef:    number | null;
}

export interface ContractRedFlag {
  clauseId:   string;
  severity:   'critical' | 'high' | 'medium' | 'low';
  pattern:    string;
  description: string;
}

export interface KybDocumentData {
  documentType:     'articles_of_incorporation' | 'ein_letter' | 'operating_agreement' |
                    'state_registration' | 'beneficial_ownership' | 'unknown';
  entityName:       string | null;
  ein:              string | null;  // masked
  stateOfFormation: string | null;
  formationDate:    string | null;
  officers:         string[];
  verificationStatus: 'extracted' | 'partial' | 'unreadable';
  fieldsExtracted:  string[];
}

export interface ReceiptInvoiceData {
  vendor:         string | null;
  invoiceNumber:  string | null;
  invoiceDate:    string | null;
  dueDate:        string | null;
  lineItems:      InvoiceLineItem[];
  subtotal:       number | null;
  taxAmount:      number | null;
  totalAmount:    number | null;
  currency:       string;
  paymentTerms:   string | null;
}

export interface InvoiceLineItem {
  description: string;
  quantity:    number | null;
  unitPrice:   number | null;
  totalPrice:  number | null;
}

export interface IdLivenessData {
  livenessScore:    number;        // 0–1
  facialMatchScore: number | null; // 0–1, null when no reference photo
  documentType:     'drivers_license' | 'passport' | 'national_id' | 'unknown';
  idNumber:         string | null; // masked
  firstName:        string | null;
  lastName:         string | null;
  dateOfBirth:      string | null;
  expiryDate:       string | null;
  issuingCountry:   string | null;
  issuingState:     string | null;
  livenessVerdict:  'pass' | 'fail' | 'review';
  tamperIndicators: string[];
}

// ── Core processDocument Result ────────────────────────────────

export interface ProcessDocumentInput {
  tenantId:       string;
  businessId?:    string;
  uploadedBy?:    string;
  fileBuffer:     Buffer;
  mimeType:       string;
  fileName:       string;
  category?:      DocumentCategory;
  /**
   * When true, the processed document is auto-filed to Document Vault.
   * Defaults to true.
   */
  autoFile?:      boolean;
  /** Additional metadata tags to attach on vault filing */
  metadata?:      Record<string, unknown>;
}

export interface ProcessDocumentResult {
  processingId:   string;
  category:       DocumentCategory;
  pages:          OcrPage[];
  fullText:       string;
  keyValuePairs:  KeyValuePair[];
  tables:         ExtractedTable[];
  structuredData: StatementData | AdverseActionData | ContractClauseData |
                  KybDocumentData | ReceiptInvoiceData | IdLivenessData | null;
  confidence:     number;
  processingMs:   number;
  vaultDocumentId: string | null;
  warnings:       string[];
}

// ── Agent Orchestration Types ──────────────────────────────────

export type AgentType =
  | 'statement'
  | 'kyb'
  | 'contract'
  | 'acknowledgment'
  | 'evidence_bundle';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved';

export interface MakerCheckerEntry {
  actionId:     string;
  agentType:    AgentType;
  actorId:      string;
  action:       string;
  inputSummary: Record<string, unknown>;
  timestamp:    string;
  role:         'maker' | 'checker';
  approved?:    boolean;
  approvedBy?:  string;
  approvedAt?:  string;
  rejectedBy?:  string;
  rejectedAt?:  string;
  rejectionReason?: string;
}

export interface AgentRunInput {
  tenantId:    string;
  businessId?: string;
  triggeredBy: string;
  agentType:   AgentType;
  payload:     Record<string, unknown>;
  /** Require checker approval before execution (default: true) */
  requireApproval?: boolean;
}

export interface AgentRunResult {
  runId:          string;
  agentType:      AgentType;
  status:         'queued' | 'awaiting_approval' | 'running' | 'completed' | 'failed';
  approvalStatus: ApprovalStatus;
  makerEntry:     MakerCheckerEntry;
  output:         Record<string, unknown> | null;
  errors:         string[];
  completedAt:    string | null;
}

// ── In-Memory State (replaced by DB in production) ─────────────

const processingResults = new Map<string, ProcessDocumentResult>();
const agentRuns         = new Map<string, AgentRunResult>();
const makerCheckerLog:  MakerCheckerEntry[] = [];

// ── OCR Stubs ──────────────────────────────────────────────────

/**
 * STUB: Simulate OCR extraction from a buffer.
 * In production replace with AWS Textract or Google Document AI calls.
 */
async function stubOcrExtract(
  buffer: Buffer,
  mimeType: string,
): Promise<{ pages: OcrPage[]; keyValuePairs: KeyValuePair[]; tables: ExtractedTable[] }> {
  // Simulate processing latency
  await new Promise((r) => setTimeout(r, 20));

  const pageText = `[OCR STUB] Extracted text from ${mimeType} document (${buffer.length} bytes). ` +
    `In production this would contain actual extracted text from the document.`;

  const page: OcrPage = {
    pageNumber: 1,
    rawText:    pageText,
    confidence: 0.95,
    blocks: [
      {
        id:        uuidv4(),
        blockType: 'LINE',
        text:      pageText,
        confidence: 0.95,
      },
    ],
  };

  const keyValuePairs: KeyValuePair[] = [
    { key: 'Document Type', value: mimeType, confidence: 0.99 },
    { key: 'Size (bytes)',  value: String(buffer.length), confidence: 1.0 },
  ];

  return { pages: [page], keyValuePairs, tables: [] };
}

/**
 * Auto-detect document category from MIME type and filename hints.
 */
function detectCategory(
  mimeType:  string,
  fileName:  string,
  hint?:     DocumentCategory,
): DocumentCategory {
  if (hint) return hint;

  const lower = fileName.toLowerCase();
  if (lower.includes('statement') || lower.includes('bank')) return 'bank_statement';
  if (lower.includes('adverse') || lower.includes('denial')) return 'adverse_action_letter';
  if (lower.includes('contract') || lower.includes('agreement')) return 'contract';
  if (lower.includes('ein') || lower.includes('articles') || lower.includes('kyb')) return 'kyb_document';
  if (lower.includes('receipt') || lower.includes('invoice')) return 'receipt_invoice';
  if (lower.includes('passport') || lower.includes('license') || lower.includes('id_')) return 'id_document';

  return 'unknown';
}

/**
 * Map DocumentCategory to vault DocumentType.
 */
function categoryToVaultType(category: DocumentCategory): DocumentType {
  const map: Record<DocumentCategory, DocumentType> = {
    bank_statement:       'statement',
    adverse_action_letter: 'adverse_action',
    contract:             'contract',
    kyb_document:         'application',
    receipt_invoice:      'receipt',
    id_document:          'application',
    unknown:              'application',
  };
  return map[category];
}

// ── Structured Data Builders (stubs) ───────────────────────────

function buildStatementData(_text: string): StatementData {
  return {
    accountHolder:    null,
    accountNumber:    '****1234',
    routingNumber:    '****5678',
    statementPeriod:  { start: '2026-02-01', end: '2026-02-28' },
    openingBalance:   null,
    closingBalance:   null,
    transactions:     [],
    averageDailyBalance: null,
    institutionName:  null,
  };
}

function buildAdverseActionData(_text: string): AdverseActionData {
  return {
    applicantName:  null,
    applicantId:    null,
    actionDate:     null,
    actionType:     'unknown',
    reasons:        [],
    creditBureau:   null,
    disputeRights:  true,
    reguratoryRef:  'ECOA / Reg B',
  };
}

function buildContractClauseData(_text: string): ContractClauseData {
  return {
    totalClauses:       0,
    clauses:            [],
    redFlags:           [],
    missingProtections: [],
  };
}

function buildKybDocumentData(_text: string): KybDocumentData {
  return {
    documentType:     'unknown',
    entityName:       null,
    ein:              null,
    stateOfFormation: null,
    formationDate:    null,
    officers:         [],
    verificationStatus: 'extracted',
    fieldsExtracted:  [],
  };
}

function buildReceiptInvoiceData(_text: string): ReceiptInvoiceData {
  return {
    vendor:        null,
    invoiceNumber: null,
    invoiceDate:   null,
    dueDate:       null,
    lineItems:     [],
    subtotal:      null,
    taxAmount:     null,
    totalAmount:   null,
    currency:      'USD',
    paymentTerms:  null,
  };
}

function buildIdLivenessData(_buffer: Buffer): IdLivenessData {
  return {
    livenessScore:    0.97,
    facialMatchScore: null,
    documentType:     'unknown',
    idNumber:         null,
    firstName:        null,
    lastName:         null,
    dateOfBirth:      null,
    expiryDate:       null,
    issuingCountry:   null,
    issuingState:     null,
    livenessVerdict:  'review',
    tamperIndicators: [],
  };
}

// ── VisionAudioForgeService ────────────────────────────────────

export class VisionAudioForgeService {
  private readonly eventBus:   EventBus;
  private readonly vaultSvc:   DocumentVaultService;

  constructor(
    eventBus?:  EventBus,
    vaultSvc?:  DocumentVaultService,
  ) {
    this.eventBus = eventBus ?? EventBus.getInstance();
    this.vaultSvc = vaultSvc ?? new DocumentVaultService();
  }

  // ── processDocument ───────────────────────────────────────

  /**
   * Central entry point for all document intelligence tasks.
   *
   * Steps:
   *   1. Run OCR extraction (stub)
   *   2. Detect / confirm document category
   *   3. Build structured data for the detected category
   *   4. Auto-file to Document Vault if autoFile !== false
   *   5. Publish VAF_DOCUMENT_PROCESSED event
   *   6. Return full result
   */
  async processDocument(input: ProcessDocumentInput): Promise<ProcessDocumentResult> {
    const start       = Date.now();
    const processingId = uuidv4();
    const warnings:    string[] = [];

    const svcLog = logger.child({
      service:      'VisionAudioForgeService',
      processingId,
      tenantId:     input.tenantId,
    });

    svcLog.debug('[processDocument] Starting', {
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.fileBuffer.length,
    });

    // 1. OCR extraction
    const { pages, keyValuePairs, tables } = await stubOcrExtract(
      input.fileBuffer,
      input.mimeType,
    );

    const fullText = pages.map((p) => p.rawText).join('\n\n');
    const avgConf  = pages.length > 0
      ? pages.reduce((s, p) => s + p.confidence, 0) / pages.length
      : 0;

    // 2. Detect category
    const category = detectCategory(input.mimeType, input.fileName, input.category);

    // 3. Build structured data
    let structuredData: ProcessDocumentResult['structuredData'] = null;
    switch (category) {
      case 'bank_statement':
        structuredData = buildStatementData(fullText);
        break;
      case 'adverse_action_letter':
        structuredData = buildAdverseActionData(fullText);
        break;
      case 'contract':
        structuredData = buildContractClauseData(fullText);
        break;
      case 'kyb_document':
        structuredData = buildKybDocumentData(fullText);
        break;
      case 'receipt_invoice':
        structuredData = buildReceiptInvoiceData(fullText);
        break;
      case 'id_document':
        structuredData = buildIdLivenessData(input.fileBuffer);
        break;
      default:
        warnings.push('Category could not be determined; no structured data extracted.');
    }

    // 4. Auto-file to Document Vault
    let vaultDocumentId: string | null = null;
    const shouldAutoFile = input.autoFile !== false;

    if (shouldAutoFile) {
      try {
        const vaultRecord = await this.vaultSvc.autoFile({
          tenantId:     input.tenantId,
          businessId:   input.businessId,
          uploadedBy:   input.uploadedBy,
          documentType: categoryToVaultType(category),
          title:        input.fileName,
          mimeType:     input.mimeType,
          content:      input.fileBuffer,
          metadata: {
            ...(input.metadata ?? {}),
            processingId,
            vafCategory:   category,
            ocrConfidence: avgConf,
            pageCount:     pages.length,
          },
          sourceModule: 'visionaudioforge',
          sourceId:     processingId,
        });
        vaultDocumentId = vaultRecord.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Auto-file to Document Vault failed: ${msg}`);
        svcLog.warn('[processDocument] Vault auto-file error', { error: msg });
      }
    }

    const processingMs = Date.now() - start;

    const result: ProcessDocumentResult = {
      processingId,
      category,
      pages,
      fullText,
      keyValuePairs,
      tables,
      structuredData,
      confidence:       avgConf,
      processingMs,
      vaultDocumentId,
      warnings,
    };

    processingResults.set(processingId, result);

    // 5. Publish event
    await this.eventBus.publishAndPersist(input.tenantId, {
      eventType:     'vaf.document.processed',
      aggregateType: 'vaf_document',
      aggregateId:   processingId,
      payload: {
        processingId,
        category,
        vaultDocumentId,
        pageCount:   pages.length,
        confidence:  avgConf,
        processingMs,
        businessId:  input.businessId ?? null,
      },
    });

    svcLog.info('[processDocument] Completed', {
      processingId,
      category,
      processingMs,
      vaultDocumentId,
      warnings: warnings.length,
    });

    return result;
  }

  // ── getResult ─────────────────────────────────────────────

  getResult(processingId: string): ProcessDocumentResult | null {
    return processingResults.get(processingId) ?? null;
  }

  // ── OCR Pipeline Stubs ────────────────────────────────────

  /**
   * STATEMENT INGESTION
   * Ingest a bank/credit statement buffer. Extracts transaction data,
   * balances, and account metadata. Returns structured StatementData.
   */
  async ingestStatement(
    tenantId:    string,
    businessId:  string,
    buffer:      Buffer,
    mimeType:    string,
    fileName:    string,
    uploadedBy?: string,
  ): Promise<{ processingId: string; statement: StatementData }> {
    const result = await this.processDocument({
      tenantId,
      businessId,
      uploadedBy,
      fileBuffer: buffer,
      mimeType,
      fileName,
      category: 'bank_statement',
    });
    return {
      processingId: result.processingId,
      statement:    result.structuredData as StatementData,
    };
  }

  /**
   * ADVERSE ACTION LETTER PARSING
   * Parse a denial/counter-offer letter. Extracts reasons, regulatory
   * references, and dispute rights.
   */
  async parseAdverseActionLetter(
    tenantId:    string,
    businessId:  string,
    buffer:      Buffer,
    mimeType:    string,
    fileName:    string,
    uploadedBy?: string,
  ): Promise<{ processingId: string; adverseAction: AdverseActionData }> {
    const result = await this.processDocument({
      tenantId,
      businessId,
      uploadedBy,
      fileBuffer: buffer,
      mimeType,
      fileName,
      category: 'adverse_action_letter',
    });
    return {
      processingId:  result.processingId,
      adverseAction: result.structuredData as AdverseActionData,
    };
  }

  /**
   * CONTRACT CLAUSE EXTRACTION
   * Extract and classify all clauses in a contract. Detect FTC red flags.
   */
  async extractContractClauses(
    tenantId:    string,
    businessId:  string,
    buffer:      Buffer,
    mimeType:    string,
    fileName:    string,
    uploadedBy?: string,
  ): Promise<{ processingId: string; contractData: ContractClauseData }> {
    const result = await this.processDocument({
      tenantId,
      businessId,
      uploadedBy,
      fileBuffer: buffer,
      mimeType,
      fileName,
      category: 'contract',
    });
    return {
      processingId:  result.processingId,
      contractData:  result.structuredData as ContractClauseData,
    };
  }

  /**
   * KYB DOCUMENT VERIFICATION
   * Extract fields from EIN letters, articles of incorporation, and
   * state registrations for KYB verification flows.
   */
  async verifyKybDocument(
    tenantId:    string,
    businessId:  string,
    buffer:      Buffer,
    mimeType:    string,
    fileName:    string,
    uploadedBy?: string,
  ): Promise<{ processingId: string; kybData: KybDocumentData }> {
    const result = await this.processDocument({
      tenantId,
      businessId,
      uploadedBy,
      fileBuffer: buffer,
      mimeType,
      fileName,
      category: 'kyb_document',
    });
    return {
      processingId: result.processingId,
      kybData:      result.structuredData as KybDocumentData,
    };
  }

  /**
   * RECEIPT / INVOICE MATCHING
   * Extract vendor, line items, and totals from receipts and invoices
   * for expense reconciliation.
   */
  async matchReceiptInvoice(
    tenantId:    string,
    businessId:  string,
    buffer:      Buffer,
    mimeType:    string,
    fileName:    string,
    uploadedBy?: string,
  ): Promise<{ processingId: string; invoiceData: ReceiptInvoiceData }> {
    const result = await this.processDocument({
      tenantId,
      businessId,
      uploadedBy,
      fileBuffer: buffer,
      mimeType,
      fileName,
      category: 'receipt_invoice',
    });
    return {
      processingId: result.processingId,
      invoiceData:  result.structuredData as ReceiptInvoiceData,
    };
  }

  // ── ID Liveness Detection ─────────────────────────────────

  /**
   * ID LIVENESS DETECTION
   * Stub for biometric liveness + document authenticity checks.
   *
   * STUB: In production wire to AWS Rekognition, Onfido, Jumio, or Persona.
   *
   * Returns liveness score, facial match score (when referencePhoto provided),
   * extracted ID fields, and tamper indicators.
   */
  async detectIdLiveness(input: {
    tenantId:       string;
    businessId?:    string;
    uploadedBy?:    string;
    idImageBuffer:  Buffer;
    mimeType:       string;
    fileName:       string;
    referencePhotoBuffer?: Buffer;
  }): Promise<{ processingId: string; livenessData: IdLivenessData }> {
    const result = await this.processDocument({
      tenantId:   input.tenantId,
      businessId: input.businessId,
      uploadedBy: input.uploadedBy,
      fileBuffer: input.idImageBuffer,
      mimeType:   input.mimeType,
      fileName:   input.fileName,
      category:   'id_document',
      metadata:   {
        hasReferencePhoto: !!input.referencePhotoBuffer,
      },
    });

    const livenessData = result.structuredData as IdLivenessData;

    // If a reference photo is provided, simulate a facial match score
    if (input.referencePhotoBuffer) {
      livenessData.facialMatchScore = 0.94; // stub value
    }

    return {
      processingId: result.processingId,
      livenessData,
    };
  }

  // ── Agent Orchestration ───────────────────────────────────

  /**
   * Trigger an agent run with maker-checker logging.
   * All agent runs are recorded in the maker-checker log before execution.
   * When requireApproval is true the run is held in 'awaiting_approval' state
   * until a checker approves via approveAgentRun().
   */
  async triggerAgentRun(input: AgentRunInput): Promise<AgentRunResult> {
    const runId   = uuidv4();
    const actionId = uuidv4();
    const now     = new Date().toISOString();

    const makerEntry: MakerCheckerEntry = {
      actionId,
      agentType:    input.agentType,
      actorId:      input.triggeredBy,
      action:       `trigger_${input.agentType}_agent`,
      inputSummary: {
        tenantId:   input.tenantId,
        businessId: input.businessId ?? null,
        payloadKeys: Object.keys(input.payload),
      },
      timestamp: now,
      role:      'maker',
    };

    makerCheckerLog.push(makerEntry);

    const requireApproval = input.requireApproval !== false;
    const approvalStatus: ApprovalStatus = requireApproval ? 'pending' : 'auto_approved';
    const status = requireApproval ? 'awaiting_approval' : 'queued';

    const run: AgentRunResult = {
      runId,
      agentType:      input.agentType,
      status,
      approvalStatus,
      makerEntry,
      output:         null,
      errors:         [],
      completedAt:    null,
    };

    agentRuns.set(runId, run);

    logger.info('[VisionAudioForge] Agent run triggered', {
      runId,
      agentType:      input.agentType,
      tenantId:       input.tenantId,
      requireApproval,
    });

    await this.eventBus.publishAndPersist(input.tenantId, {
      eventType:     'vaf.agent.triggered',
      aggregateType: 'vaf_agent_run',
      aggregateId:   runId,
      payload: {
        runId,
        agentType:      input.agentType,
        approvalStatus,
        triggeredBy:    input.triggeredBy,
        businessId:     input.businessId ?? null,
      },
    });

    return run;
  }

  /**
   * Approve a pending agent run (checker role in maker-checker pattern).
   * The run is advanced to 'queued' and the checker entry is logged.
   */
  approveAgentRun(
    runId:     string,
    checkerId: string,
  ): AgentRunResult {
    const run = agentRuns.get(runId);
    if (!run) {
      throw new AgentRunNotFoundError(runId);
    }
    if (run.approvalStatus !== 'pending') {
      throw new AgentApprovalError(runId, `Cannot approve run in state: ${run.approvalStatus}`);
    }

    const checkerEntry: MakerCheckerEntry = {
      actionId:   uuidv4(),
      agentType:  run.agentType,
      actorId:    checkerId,
      action:     `approve_${run.agentType}_agent`,
      inputSummary: { runId },
      timestamp:  new Date().toISOString(),
      role:       'checker',
      approved:   true,
      approvedBy: checkerId,
      approvedAt: new Date().toISOString(),
    };

    makerCheckerLog.push(checkerEntry);

    run.approvalStatus = 'approved';
    run.status         = 'queued';
    agentRuns.set(runId, run);

    logger.info('[VisionAudioForge] Agent run approved', { runId, checkerId });

    return run;
  }

  /**
   * Reject a pending agent run.
   */
  rejectAgentRun(
    runId:    string,
    checkerId: string,
    reason:   string,
  ): AgentRunResult {
    const run = agentRuns.get(runId);
    if (!run) throw new AgentRunNotFoundError(runId);
    if (run.approvalStatus !== 'pending') {
      throw new AgentApprovalError(runId, `Cannot reject run in state: ${run.approvalStatus}`);
    }

    const checkerEntry: MakerCheckerEntry = {
      actionId:        uuidv4(),
      agentType:       run.agentType,
      actorId:         checkerId,
      action:          `reject_${run.agentType}_agent`,
      inputSummary:    { runId, reason },
      timestamp:       new Date().toISOString(),
      role:            'checker',
      approved:        false,
      rejectedBy:      checkerId,
      rejectedAt:      new Date().toISOString(),
      rejectionReason: reason,
    };

    makerCheckerLog.push(checkerEntry);

    run.approvalStatus = 'rejected';
    run.status         = 'failed';
    run.errors         = [`Rejected by ${checkerId}: ${reason}`];
    run.completedAt    = new Date().toISOString();
    agentRuns.set(runId, run);

    return run;
  }

  /** Get a single agent run by ID. */
  getAgentRun(runId: string): AgentRunResult | null {
    return agentRuns.get(runId) ?? null;
  }

  /** List all agent runs (optionally filter by agentType). */
  listAgentRuns(agentType?: AgentType): AgentRunResult[] {
    const all = Array.from(agentRuns.values());
    return agentType ? all.filter((r) => r.agentType === agentType) : all;
  }

  /** Retrieve the full maker-checker audit log. */
  getMakerCheckerLog(agentType?: AgentType): MakerCheckerEntry[] {
    return agentType
      ? makerCheckerLog.filter((e) => e.agentType === agentType)
      : [...makerCheckerLog];
  }

  // ── Test utilities ────────────────────────────────────────

  /** Reset in-memory state. Test use only. */
  static _reset(): void {
    processingResults.clear();
    agentRuns.clear();
    makerCheckerLog.splice(0);
  }
}

// ── Domain Errors ──────────────────────────────────────────────

export class AgentRunNotFoundError extends Error {
  public readonly code = 'AGENT_RUN_NOT_FOUND';
  constructor(runId: string) {
    super(`Agent run not found: ${runId}`);
    this.name = 'AgentRunNotFoundError';
  }
}

export class AgentApprovalError extends Error {
  public readonly code = 'AGENT_APPROVAL_ERROR';
  constructor(runId: string, detail: string) {
    super(`Agent run approval error for ${runId}: ${detail}`);
    this.name = 'AgentApprovalError';
  }
}

export class DocumentProcessingError extends Error {
  public readonly code = 'DOCUMENT_PROCESSING_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'DocumentProcessingError';
  }
}
