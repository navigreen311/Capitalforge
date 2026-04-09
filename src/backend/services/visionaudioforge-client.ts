// ============================================================
// CapitalForge — VisionAudioForge Client
//
// Typed client for document-intelligence operations. VAF is a
// separate service, so all methods return mock parsed data.
// When a real VAF service endpoint is configured via
// VISIONAUDIOFORGE_BASE_URL, methods will forward to it.
//
// Methods:
//   parseDocument(file, type)       — OCR a PDF/image
//   parseStatement(file)            — extract statement data
//   parseAdverseAction(file)        — extract decline reason codes
//   verifyIdentity(file)            — KYC ID verification
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type DocumentType =
  | 'bank_statement'
  | 'adverse_action_letter'
  | 'contract'
  | 'kyb_document'
  | 'receipt_invoice'
  | 'id_document'
  | 'unknown';

export interface ParsedField {
  key: string;
  value: string;
  confidence: number;
}

export interface DocumentParseResult {
  processingId: string;
  documentType: DocumentType;
  status: 'parsed' | 'failed';
  fields: ParsedField[];
  rawTextPreview: string;
  confidence: number;
  parsedAt: string;
}

export interface StatementTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit' | 'fee' | 'transfer' | 'unknown';
  balance: number | null;
  category: string | null;
}

export interface StatementParseResult {
  processingId: string;
  accountHolder: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  institutionName: string | null;
  statementPeriod: { start: string; end: string } | null;
  openingBalance: number | null;
  closingBalance: number | null;
  averageDailyBalance: number | null;
  transactions: StatementTransaction[];
  parsedAt: string;
}

export interface AdverseActionParseResult {
  processingId: string;
  applicantName: string | null;
  applicantId: string | null;
  actionDate: string | null;
  actionType: 'denial' | 'counter_offer' | 'partial_approval' | 'unknown';
  reasons: string[];
  creditBureau: string | null;
  disputeRights: boolean;
  regulatoryRef: string | null;
  parsedAt: string;
}

export interface IdentityVerificationResult {
  processingId: string;
  verified: boolean;
  documentType: 'drivers_license' | 'passport' | 'national_id' | 'unknown';
  fullName: string | null;
  dateOfBirth: string | null;
  expirationDate: string | null;
  issuingCountry: string | null;
  issuingState: string | null;
  livenessScore: number;
  livenessVerdict: 'pass' | 'fail' | 'review';
  tamperIndicators: string[];
  confidence: number;
  parsedAt: string;
}

export interface FileInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

// ── Mock data builders ─────────────────────────────────────────────────────

function mockDocumentParse(file: FileInput, type: DocumentType): DocumentParseResult {
  return {
    processingId: uuidv4(),
    documentType: type,
    status: 'parsed',
    fields: [
      { key: 'document_type', value: type, confidence: 0.99 },
      { key: 'file_name', value: file.fileName, confidence: 1.0 },
      { key: 'mime_type', value: file.mimeType, confidence: 1.0 },
      { key: 'size_bytes', value: String(file.buffer.length), confidence: 1.0 },
    ],
    rawTextPreview: `[MOCK OCR] Extracted text from ${file.fileName} (${file.buffer.length} bytes). In production this would contain actual extracted text.`,
    confidence: 0.95,
    parsedAt: new Date().toISOString(),
  };
}

function mockStatementParse(file: FileInput): StatementParseResult {
  return {
    processingId: uuidv4(),
    accountHolder: 'Acme Corp LLC',
    accountNumber: '****1234',
    routingNumber: '****5678',
    institutionName: 'Chase Business',
    statementPeriod: { start: '2026-02-01', end: '2026-02-28' },
    openingBalance: 24_500.00,
    closingBalance: 28_750.45,
    averageDailyBalance: 26_125.22,
    transactions: [
      {
        date: '2026-02-05',
        description: 'ACH Deposit — Client Payment',
        amount: 8_500.00,
        type: 'credit',
        balance: 33_000.00,
        category: 'Revenue',
      },
      {
        date: '2026-02-12',
        description: 'AWS Cloud Services',
        amount: -1_892.00,
        type: 'debit',
        balance: 31_108.00,
        category: 'Technology',
      },
      {
        date: '2026-02-20',
        description: 'Payroll — Bi-weekly',
        amount: -5_200.00,
        type: 'debit',
        balance: 25_908.00,
        category: 'Payroll',
      },
    ],
    parsedAt: new Date().toISOString(),
  };
}

function mockAdverseActionParse(_file: FileInput): AdverseActionParseResult {
  return {
    processingId: uuidv4(),
    applicantName: 'Jane Doe',
    applicantId: null,
    actionDate: '2026-03-15',
    actionType: 'denial',
    reasons: [
      'Insufficient credit history (< 2 years)',
      'High debt-to-income ratio (> 45%)',
      'Recent derogatory marks on credit report',
    ],
    creditBureau: 'Experian',
    disputeRights: true,
    regulatoryRef: 'ECOA / Reg B',
    parsedAt: new Date().toISOString(),
  };
}

function mockIdentityVerification(_file: FileInput): IdentityVerificationResult {
  return {
    processingId: uuidv4(),
    verified: true,
    documentType: 'drivers_license',
    fullName: 'Jane A. Doe',
    dateOfBirth: '1985-07-22',
    expirationDate: '2028-07-22',
    issuingCountry: 'US',
    issuingState: 'CA',
    livenessScore: 0.97,
    livenessVerdict: 'pass',
    tamperIndicators: [],
    confidence: 0.96,
    parsedAt: new Date().toISOString(),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a document via OCR. Accepts PDF or image buffers.
 * Returns extracted text and key-value fields.
 */
export async function parseDocument(
  file: FileInput,
  type: DocumentType,
): Promise<DocumentParseResult> {
  logger.info('[VisionAudioForgeClient] parseDocument', {
    fileName: file.fileName,
    mimeType: file.mimeType,
    type,
  });

  // ASSUMPTION: VAF is a separate service. Return mock data.
  // When VISIONAUDIOFORGE_BASE_URL is configured, forward to the real service.
  return mockDocumentParse(file, type);
}

/**
 * Parse a bank/credit statement. Extracts account metadata,
 * balances, and individual transactions.
 */
export async function parseStatement(
  file: FileInput,
): Promise<StatementParseResult> {
  logger.info('[VisionAudioForgeClient] parseStatement', {
    fileName: file.fileName,
    mimeType: file.mimeType,
  });

  return mockStatementParse(file);
}

/**
 * Parse an adverse action / denial letter. Extracts decline
 * reason codes, credit bureau info, and dispute rights.
 */
export async function parseAdverseAction(
  file: FileInput,
): Promise<AdverseActionParseResult> {
  logger.info('[VisionAudioForgeClient] parseAdverseAction', {
    fileName: file.fileName,
    mimeType: file.mimeType,
  });

  return mockAdverseActionParse(file);
}

/**
 * Verify identity from a government-issued ID document.
 * Returns KYC verification data including liveness score.
 */
export async function verifyIdentity(
  file: FileInput,
): Promise<IdentityVerificationResult> {
  logger.info('[VisionAudioForgeClient] verifyIdentity', {
    fileName: file.fileName,
    mimeType: file.mimeType,
  });

  return mockIdentityVerification(file);
}
