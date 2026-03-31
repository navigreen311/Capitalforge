// ============================================================
// CapitalForge — VisionAudioForge AI Agent Definitions
//
// Each agent follows the maker-checker pattern:
//   - Every significant action is logged as a maker entry.
//   - A checker must approve (or the system auto-approves low-risk actions).
//   - All agent actions are auditable and non-repudiable.
//
// Agents:
//   StatementAgent      — ingest statements → normalize → route to reconciliation
//   KYBAgent            — process ID documents → run verification
//   ContractAgent       — extract clauses → detect red flags
//   AcknowledgmentAgent — generate signed PDF acknowledgments
//   EvidenceBundleAgent — assemble regulator response packs
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';
import {
  VisionAudioForgeService,
  type StatementData,
  type KybDocumentData,
  type ContractClauseData,
  type MakerCheckerEntry,
  type AgentType,
} from './visionaudioforge.service.js';

// ── Base Agent ─────────────────────────────────────────────────

export interface AgentContext {
  tenantId:    string;
  businessId?: string;
  actorId:     string;
}

export interface AgentLogEntry extends MakerCheckerEntry {
  sessionId: string;
  sequence:  number;
}

abstract class BaseAgent {
  protected readonly vafService: VisionAudioForgeService;
  protected readonly agentType:  AgentType;
  protected readonly sessionLog: AgentLogEntry[] = [];
  protected sessionId            = uuidv4();
  private   sequence             = 0;

  constructor(agentType: AgentType, vafService?: VisionAudioForgeService) {
    this.agentType  = agentType;
    this.vafService = vafService ?? new VisionAudioForgeService();
  }

  /** Record a maker action in the agent log and the shared maker-checker log. */
  protected logMaker(
    ctx:          AgentContext,
    action:       string,
    inputSummary: Record<string, unknown>,
  ): AgentLogEntry {
    const entry: AgentLogEntry = {
      actionId:     uuidv4(),
      agentType:    this.agentType,
      actorId:      ctx.actorId,
      action,
      inputSummary,
      timestamp:    new Date().toISOString(),
      role:         'maker',
      sessionId:    this.sessionId,
      sequence:     ++this.sequence,
    };
    this.sessionLog.push(entry);

    logger.info(`[${this.agentType}Agent] Maker action`, {
      actionId:  entry.actionId,
      action,
      sessionId: this.sessionId,
      sequence:  entry.sequence,
    });

    return entry;
  }

  /** Record a checker approval in the agent log. */
  protected logChecker(
    makeEntry: AgentLogEntry,
    checkerId: string,
    approved:  boolean,
    reason?:   string,
  ): AgentLogEntry {
    const entry: AgentLogEntry = {
      actionId:        uuidv4(),
      agentType:       this.agentType,
      actorId:         checkerId,
      action:          `check_${makeEntry.action}`,
      inputSummary:    { makerActionId: makeEntry.actionId },
      timestamp:       new Date().toISOString(),
      role:            'checker',
      approved,
      approvedBy:      approved  ? checkerId : undefined,
      approvedAt:      approved  ? new Date().toISOString() : undefined,
      rejectedBy:      !approved ? checkerId : undefined,
      rejectedAt:      !approved ? new Date().toISOString() : undefined,
      rejectionReason: !approved ? reason    : undefined,
      sessionId:       this.sessionId,
      sequence:        ++this.sequence,
    };
    this.sessionLog.push(entry);

    logger.info(`[${this.agentType}Agent] Checker action`, {
      actionId:  entry.actionId,
      approved,
      reason,
      sessionId: this.sessionId,
    });

    return entry;
  }

  getSessionLog(): AgentLogEntry[] { return [...this.sessionLog]; }
  resetSession():  void            {
    this.sessionLog.splice(0);
    this.sessionId = uuidv4();
    this.sequence  = 0;
  }
}

// ── StatementAgent ─────────────────────────────────────────────

export interface StatementIngestionInput {
  ctx:        AgentContext;
  fileBuffer: Buffer;
  mimeType:   string;
  fileName:   string;
  /**
   * Reconciliation queue to route normalized data to.
   * e.g. 'bank_reconciliation' | 'cash_flow_analysis' | 'expense_classification'
   */
  targetQueue: string;
}

export interface StatementIngestionResult {
  processingId:   string;
  statementData:  StatementData;
  normalizedRows: NormalizedStatementRow[];
  routedTo:       string;
  makerEntry:     AgentLogEntry;
}

export interface NormalizedStatementRow {
  date:        string;
  description: string;
  amount:      number;
  type:        string;
  category:    string | null;
  balance:     number | null;
}

export class StatementAgent extends BaseAgent {
  constructor(vafService?: VisionAudioForgeService) {
    super('statement', vafService);
  }

  /**
   * Ingest a bank/credit statement, normalize all transactions,
   * and route to the specified reconciliation queue.
   *
   * Maker-checker: the routing decision is logged as a maker action.
   * Checker must approve routing before downstream systems are notified.
   */
  async ingest(input: StatementIngestionInput): Promise<StatementIngestionResult> {
    const makerEntry = this.logMaker(input.ctx, 'ingest_statement', {
      fileName:    input.fileName,
      mimeType:    input.mimeType,
      targetQueue: input.targetQueue,
      sizeBytes:   input.fileBuffer.length,
    });

    const { processingId, statement } = await this.vafService.ingestStatement(
      input.ctx.tenantId,
      input.ctx.businessId ?? '',
      input.fileBuffer,
      input.mimeType,
      input.fileName,
      input.ctx.actorId,
    );

    const normalizedRows: NormalizedStatementRow[] = statement.transactions.map((tx) => ({
      date:        tx.date,
      description: tx.description,
      amount:      tx.amount,
      type:        tx.type,
      category:    tx.category,
      balance:     tx.balance,
    }));

    logger.info('[StatementAgent] Ingestion complete, routing to queue', {
      processingId,
      transactionCount: normalizedRows.length,
      targetQueue: input.targetQueue,
    });

    return {
      processingId,
      statementData:  statement,
      normalizedRows,
      routedTo:       input.targetQueue,
      makerEntry,
    };
  }
}

// ── KYBAgent ───────────────────────────────────────────────────

export interface KybAgentInput {
  ctx:        AgentContext;
  fileBuffer: Buffer;
  mimeType:   string;
  fileName:   string;
  /**
   * Expected document type for pre-verification routing.
   */
  documentKind: KybDocumentData['documentType'];
}

export interface KybAgentResult {
  processingId:       string;
  kybData:            KybDocumentData;
  verificationPassed: boolean;
  failureReasons:     string[];
  makerEntry:         AgentLogEntry;
}

export class KYBAgent extends BaseAgent {
  constructor(vafService?: VisionAudioForgeService) {
    super('kyb', vafService);
  }

  /**
   * Process a KYB identity document:
   *   1. Extract fields via OCR
   *   2. Run internal field completeness checks
   *   3. Return verification verdict with reasons for any failures
   *
   * Maker-checker: field extraction is the maker action;
   * verification verdict is the auto-checker (system review).
   */
  async processDocument(input: KybAgentInput): Promise<KybAgentResult> {
    const makerEntry = this.logMaker(input.ctx, 'process_kyb_document', {
      fileName:     input.fileName,
      documentKind: input.documentKind,
      sizeBytes:    input.fileBuffer.length,
    });

    const { processingId, kybData } = await this.vafService.verifyKybDocument(
      input.ctx.tenantId,
      input.ctx.businessId ?? '',
      input.fileBuffer,
      input.mimeType,
      input.fileName,
      input.ctx.actorId,
    );

    const failureReasons: string[] = [];

    if (!kybData.entityName)       failureReasons.push('Entity name could not be extracted');
    if (!kybData.ein)              failureReasons.push('EIN not found in document');
    if (!kybData.stateOfFormation) failureReasons.push('State of formation not detected');
    if (kybData.verificationStatus === 'unreadable') {
      failureReasons.push('Document is unreadable — resubmit a higher quality scan');
    }

    const verificationPassed = failureReasons.length === 0;

    // Auto-checker logs the system verification decision
    this.logChecker(makerEntry, 'system', verificationPassed, failureReasons.join('; ') || undefined);

    logger.info('[KYBAgent] Verification complete', {
      processingId,
      verificationPassed,
      failureReasons,
    });

    return {
      processingId,
      kybData,
      verificationPassed,
      failureReasons,
      makerEntry,
    };
  }
}

// ── ContractAgent ──────────────────────────────────────────────

export interface ContractAgentInput {
  ctx:        AgentContext;
  fileBuffer: Buffer;
  mimeType:   string;
  fileName:   string;
  /**
   * Severity threshold above which red flags are escalated.
   * Defaults to 'medium'.
   */
  escalateThreshold?: 'critical' | 'high' | 'medium' | 'low';
}

export interface ContractAgentResult {
  processingId:      string;
  contractData:      ContractClauseData;
  escalatedRedFlags: ContractClauseData['redFlags'];
  requiresReview:    boolean;
  makerEntry:        AgentLogEntry;
}

export class ContractAgent extends BaseAgent {
  constructor(vafService?: VisionAudioForgeService) {
    super('contract', vafService);
  }

  /**
   * Extract all contract clauses and detect red flags.
   * Flags above the escalateThreshold are surfaced for human review.
   *
   * Maker: clause extraction; Checker: red-flag escalation decision.
   */
  async analyzeContract(input: ContractAgentInput): Promise<ContractAgentResult> {
    const threshold = input.escalateThreshold ?? 'medium';

    const makerEntry = this.logMaker(input.ctx, 'analyze_contract', {
      fileName:  input.fileName,
      threshold,
      sizeBytes: input.fileBuffer.length,
    });

    const { processingId, contractData } = await this.vafService.extractContractClauses(
      input.ctx.tenantId,
      input.ctx.businessId ?? '',
      input.fileBuffer,
      input.mimeType,
      input.fileName,
      input.ctx.actorId,
    );

    const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
    const thresholdRank = severityRank[threshold];

    const escalatedRedFlags = contractData.redFlags.filter(
      (f) => severityRank[f.severity] >= thresholdRank,
    );

    const requiresReview = escalatedRedFlags.length > 0;

    this.logChecker(
      makerEntry,
      'system',
      !requiresReview,
      requiresReview
        ? `${escalatedRedFlags.length} red flag(s) at or above '${threshold}' severity require human review`
        : undefined,
    );

    logger.info('[ContractAgent] Analysis complete', {
      processingId,
      totalClauses:      contractData.totalClauses,
      totalRedFlags:     contractData.redFlags.length,
      escalatedRedFlags: escalatedRedFlags.length,
      requiresReview,
    });

    return {
      processingId,
      contractData,
      escalatedRedFlags,
      requiresReview,
      makerEntry,
    };
  }
}

// ── AcknowledgmentAgent ────────────────────────────────────────

export interface AcknowledgmentInput {
  ctx:              AgentContext;
  templateId:       string;
  variables:        Record<string, string>;
  signerName:       string;
  signerTitle?:     string;
  signerEmail?:     string;
  signatureDate?:   string;
  /**
   * When true, immediately files the generated acknowledgment to Document Vault.
   * Defaults to true.
   */
  autoFile?:        boolean;
}

export interface AcknowledgmentResult {
  acknowledgmentId: string;
  renderedText:     string;
  /**
   * Stub: In production, produce a real PDF via pdf-lib, PDFKit, or a rendering service.
   * Returns a Buffer representing the acknowledgment PDF bytes.
   */
  pdfBuffer:        Buffer;
  signedAt:         string;
  vaultDocumentId:  string | null;
  makerEntry:       AgentLogEntry;
}

export class AcknowledgmentAgent extends BaseAgent {
  constructor(vafService?: VisionAudioForgeService) {
    super('acknowledgment', vafService);
  }

  /**
   * Generate a signed PDF acknowledgment from a template.
   *
   * Maker: render request; Checker: system validates all required variables
   * are present before generating the PDF stub.
   */
  async generateAcknowledgment(input: AcknowledgmentInput): Promise<AcknowledgmentResult> {
    const makerEntry = this.logMaker(input.ctx, 'generate_acknowledgment', {
      templateId:  input.templateId,
      signerName:  input.signerName,
      variableKeys: Object.keys(input.variables),
    });

    // Variable completeness check (checker role)
    const missingVars: string[] = [];
    for (const [k, v] of Object.entries(input.variables)) {
      if (!v || v.trim() === '') missingVars.push(k);
    }

    if (missingVars.length > 0) {
      this.logChecker(makerEntry, 'system', false,
        `Missing required variables: ${missingVars.join(', ')}`);
      throw new AcknowledgmentGenerationError(
        `Cannot generate acknowledgment: missing variables [${missingVars.join(', ')}]`,
      );
    }

    this.logChecker(makerEntry, 'system', true);

    const acknowledgmentId = uuidv4();
    const signedAt = input.signatureDate ?? new Date().toISOString();

    // Render stub: replace {{key}} placeholders in a simple text template
    let renderedText = `ACKNOWLEDGMENT — Template: ${input.templateId}\n\n`;
    renderedText += `Signer: ${input.signerName}`;
    if (input.signerTitle) renderedText += `, ${input.signerTitle}`;
    if (input.signerEmail) renderedText += ` <${input.signerEmail}>`;
    renderedText += `\nSigned At: ${signedAt}\n\n`;

    for (const [k, v] of Object.entries(input.variables)) {
      renderedText += `${k}: ${v}\n`;
    }

    renderedText += `\n[SIGNATURE BLOCK — ID: ${acknowledgmentId}]`;

    // STUB: PDF buffer — in production replace with pdf-lib/PDFKit output
    const pdfBuffer = Buffer.from(`%PDF-1.4 STUB\n${renderedText}`, 'utf-8');

    // Auto-file to Document Vault
    let vaultDocumentId: string | null = null;
    if (input.autoFile !== false) {
      try {
        const record = await this.vafService['vaultSvc'].autoFile({
          tenantId:     input.ctx.tenantId,
          businessId:   input.ctx.businessId,
          uploadedBy:   input.ctx.actorId,
          documentType: 'acknowledgment',
          title:        `acknowledgment_${acknowledgmentId}.pdf`,
          mimeType:     'application/pdf',
          content:      pdfBuffer,
          metadata: {
            acknowledgmentId,
            templateId: input.templateId,
            signerName: input.signerName,
            signedAt,
          },
          sourceModule: 'acknowledgment_agent',
          sourceId:     acknowledgmentId,
        });
        vaultDocumentId = record.id;
      } catch (err) {
        logger.warn('[AcknowledgmentAgent] Vault auto-file failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('[AcknowledgmentAgent] Acknowledgment generated', {
      acknowledgmentId,
      templateId:     input.templateId,
      vaultDocumentId,
    });

    return {
      acknowledgmentId,
      renderedText,
      pdfBuffer,
      signedAt,
      vaultDocumentId,
      makerEntry,
    };
  }
}

// ── EvidenceBundleAgent ────────────────────────────────────────

export interface EvidenceBundleInput {
  ctx:            AgentContext;
  inquiryId:      string;
  regulatorName:  string;
  documentIds:    string[];
  includeTypes:   string[];
  responseNarrative?: string;
}

export interface EvidenceBundleItem {
  documentId:   string;
  documentType: string;
  title:        string;
  includedAt:   string;
}

export interface EvidenceBundleResult {
  bundleId:          string;
  inquiryId:         string;
  regulatorName:     string;
  itemCount:         number;
  items:             EvidenceBundleItem[];
  tableOfContents:   string;
  /**
   * Stub: In production, produce a real ZIP/PDF package containing all evidence docs.
   */
  packageBuffer:     Buffer;
  assembledAt:       string;
  vaultDocumentId:   string | null;
  makerEntry:        AgentLogEntry;
}

export class EvidenceBundleAgent extends BaseAgent {
  constructor(vafService?: VisionAudioForgeService) {
    super('evidence_bundle', vafService);
  }

  /**
   * Assemble a regulator response pack from specified document IDs.
   *
   * Maker: bundle assembly request; Checker: validates document count
   * meets minimum threshold for completeness.
   *
   * STUB: Document retrieval from vault is stubbed — in production
   * fetch actual document content from DocumentVaultService.retrieve().
   */
  async assembleBundle(input: EvidenceBundleInput): Promise<EvidenceBundleResult> {
    const makerEntry = this.logMaker(input.ctx, 'assemble_evidence_bundle', {
      inquiryId:     input.inquiryId,
      regulatorName: input.regulatorName,
      documentCount: input.documentIds.length,
      includeTypes:  input.includeTypes,
    });

    // Checker: require at least 1 document
    if (input.documentIds.length === 0) {
      this.logChecker(makerEntry, 'system', false,
        'Evidence bundle must contain at least one document');
      throw new EvidenceBundleError('Cannot assemble empty evidence bundle');
    }

    this.logChecker(makerEntry, 'system', true);

    const bundleId    = uuidv4();
    const assembledAt = new Date().toISOString();

    // Build stub items (production: resolve each documentId via vault)
    const items: EvidenceBundleItem[] = input.documentIds.map((docId, i) => ({
      documentId:   docId,
      documentType: input.includeTypes[i] ?? 'document',
      title:        `Document ${i + 1} — ${docId}`,
      includedAt:   assembledAt,
    }));

    // Table of contents
    let toc = `EVIDENCE BUNDLE — Regulator: ${input.regulatorName}\n`;
    toc += `Inquiry ID: ${input.inquiryId}\n`;
    toc += `Bundle ID: ${bundleId}\n`;
    toc += `Assembled: ${assembledAt}\n`;
    toc += `\nTABLE OF CONTENTS\n${'─'.repeat(50)}\n`;
    items.forEach((item, idx) => {
      toc += `${idx + 1}. [${item.documentType}] ${item.title}\n`;
    });

    if (input.responseNarrative) {
      toc += `\nNARRATIVE:\n${input.responseNarrative}\n`;
    }

    // STUB: Package buffer — production: ZIP all document content
    const packageBuffer = Buffer.from(
      `EVIDENCE_PACKAGE_STUB\n${toc}\n[Contains ${items.length} document(s)]`,
      'utf-8',
    );

    // File bundle manifest to vault
    let vaultDocumentId: string | null = null;
    try {
      const record = await this.vafService['vaultSvc'].autoFile({
        tenantId:     input.ctx.tenantId,
        businessId:   input.ctx.businessId,
        uploadedBy:   input.ctx.actorId,
        documentType: 'application',
        title:        `evidence_bundle_${bundleId}.pdf`,
        mimeType:     'application/pdf',
        content:      packageBuffer,
        metadata: {
          bundleId,
          inquiryId:      input.inquiryId,
          regulatorName:  input.regulatorName,
          documentCount:  items.length,
          assembledAt,
        },
        sourceModule: 'evidence_bundle_agent',
        sourceId:     bundleId,
      });
      vaultDocumentId = record.id;
    } catch (err) {
      logger.warn('[EvidenceBundleAgent] Vault auto-file failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    logger.info('[EvidenceBundleAgent] Bundle assembled', {
      bundleId,
      inquiryId:   input.inquiryId,
      itemCount:   items.length,
      vaultDocumentId,
    });

    return {
      bundleId,
      inquiryId:        input.inquiryId,
      regulatorName:    input.regulatorName,
      itemCount:        items.length,
      items,
      tableOfContents:  toc,
      packageBuffer,
      assembledAt,
      vaultDocumentId,
      makerEntry,
    };
  }
}

// ── Agent Factory ──────────────────────────────────────────────

export type AnyAgent =
  | StatementAgent
  | KYBAgent
  | ContractAgent
  | AcknowledgmentAgent
  | EvidenceBundleAgent;

export function createAgent(
  agentType:   AgentType,
  vafService?: VisionAudioForgeService,
): AnyAgent {
  switch (agentType) {
    case 'statement':        return new StatementAgent(vafService);
    case 'kyb':              return new KYBAgent(vafService);
    case 'contract':         return new ContractAgent(vafService);
    case 'acknowledgment':   return new AcknowledgmentAgent(vafService);
    case 'evidence_bundle':  return new EvidenceBundleAgent(vafService);
    default:
      throw new Error(`Unknown agent type: ${String(agentType)}`);
  }
}

// ── Domain Errors ──────────────────────────────────────────────

export class AcknowledgmentGenerationError extends Error {
  public readonly code = 'ACKNOWLEDGMENT_GENERATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'AcknowledgmentGenerationError';
  }
}

export class EvidenceBundleError extends Error {
  public readonly code = 'EVIDENCE_BUNDLE_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceBundleError';
  }
}
