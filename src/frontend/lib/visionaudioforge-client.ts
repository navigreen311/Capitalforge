// ============================================================
// VisionAudioForge API Client
// ============================================================
// Typed client for the VisionAudioForge document-intelligence
// service. When NEXT_PUBLIC_USE_MOCK_DATA=true, all methods
// return simulated parsed results after a 1.5 s delay.
// ============================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedField {
  key: string;
  value: string;
  confidence: number;
}

export interface DocumentParseResult {
  documentId: string;
  docType: string;
  status: 'parsed' | 'failed';
  fields: ParsedField[];
  rawTextPreview: string;
  parsedAt: string;
}

export interface StatementLineItem {
  date: string;
  description: string;
  amount: number;
  category: string;
}

export interface StatementParseResult {
  documentId: string;
  issuer: string;
  statementDate: string;
  totalBalance: number;
  minimumPayment: number;
  lineItems: StatementLineItem[];
  parsedAt: string;
}

export interface AdverseActionResult {
  documentId: string;
  applicantName: string;
  declineReasons: string[];
  bureau: string;
  noticeDate: string;
  parsedAt: string;
}

export interface IdentityVerificationResult {
  documentId: string;
  verified: boolean;
  fullName: string;
  dateOfBirth: string;
  documentType: 'drivers_license' | 'passport' | 'state_id';
  expirationDate: string;
  confidence: number;
  parsedAt: string;
}

export interface ContractClause {
  clauseId: string;
  title: string;
  text: string;
  riskLevel: 'high' | 'medium' | 'low';
  category: string;
}

export interface ContractClauseResult {
  documentId: string;
  clauses: ContractClause[];
  parsedAt: string;
}

export interface EvidenceBundleParams {
  clientId: string;
  documentIds: string[];
  bundleType: 'dispute' | 'compliance' | 'audit';
  notes?: string;
}

export interface EvidenceBundleResult {
  bundleId: string;
  clientId: string;
  bundleType: string;
  documentCount: number;
  assembledAt: string;
  downloadUrl: string;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.NEXT_PUBLIC_VISIONAUDIOFORGE_URL ?? 'http://localhost:3002';

const USE_MOCK =
  process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

// ─── Internal helpers ───────────────────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MOCK_DELAY = 1_500;

async function vafFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
    ...init,
  });
  if (!res.ok) {
    throw new Error(
      `VisionAudioForge API error ${res.status}: ${res.statusText}`,
    );
  }
  return (await res.json()) as T;
}

function buildFormData(file: File, extra?: Record<string, string>): FormData {
  const fd = new FormData();
  fd.append('file', file);
  if (extra) {
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  }
  return fd;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Generic document OCR/parse. */
export async function parseDocument(
  file: File,
  docType: string,
): Promise<DocumentParseResult> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY);
    return {
      documentId: `doc_mock_${Date.now()}`,
      docType,
      status: 'parsed',
      fields: [
        { key: 'account_number', value: '****-7890', confidence: 0.97 },
        { key: 'holder_name', value: 'Acme Corp', confidence: 0.99 },
        { key: 'effective_date', value: '2026-01-15', confidence: 0.95 },
      ],
      rawTextPreview:
        'This document certifies that Acme Corp holds account ****-7890...',
      parsedAt: new Date().toISOString(),
    };
  }
  const fd = buildFormData(file, { docType });
  return vafFetch<DocumentParseResult>('/api/documents/parse', {
    method: 'POST',
    body: fd,
  });
}

/** Credit-card statement extraction. */
export async function parseStatement(
  file: File,
): Promise<StatementParseResult> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY);
    return {
      documentId: `stmt_mock_${Date.now()}`,
      issuer: 'Chase Ink Business Preferred',
      statementDate: '2026-03-01',
      totalBalance: 14_327.45,
      minimumPayment: 287.0,
      lineItems: [
        {
          date: '2026-02-05',
          description: 'Office Depot — Supplies',
          amount: 234.56,
          category: 'Office Supplies',
        },
        {
          date: '2026-02-12',
          description: 'AWS — Cloud Services',
          amount: 1_892.0,
          category: 'Technology',
        },
        {
          date: '2026-02-20',
          description: 'Delta Airlines — Travel',
          amount: 567.89,
          category: 'Travel',
        },
      ],
      parsedAt: new Date().toISOString(),
    };
  }
  const fd = buildFormData(file);
  return vafFetch<StatementParseResult>('/api/documents/parse-statement', {
    method: 'POST',
    body: fd,
  });
}

/** Adverse action / decline-reasons extraction. */
export async function parseAdverseAction(
  file: File,
): Promise<AdverseActionResult> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY);
    return {
      documentId: `aa_mock_${Date.now()}`,
      applicantName: 'Jane Doe',
      declineReasons: [
        'Insufficient credit history (< 2 years)',
        'High debt-to-income ratio (> 45%)',
        'Recent derogatory marks on credit report',
      ],
      bureau: 'Experian',
      noticeDate: '2026-03-15',
      parsedAt: new Date().toISOString(),
    };
  }
  const fd = buildFormData(file);
  return vafFetch<AdverseActionResult>('/api/documents/parse-adverse-action', {
    method: 'POST',
    body: fd,
  });
}

/** Identity document verification. */
export async function verifyIdentity(
  file: File,
): Promise<IdentityVerificationResult> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY);
    return {
      documentId: `kyc_mock_${Date.now()}`,
      verified: true,
      fullName: 'Jane A. Doe',
      dateOfBirth: '1985-07-22',
      documentType: 'drivers_license',
      expirationDate: '2028-07-22',
      confidence: 0.96,
      parsedAt: new Date().toISOString(),
    };
  }
  const fd = buildFormData(file);
  return vafFetch<IdentityVerificationResult>('/api/kyc/verify', {
    method: 'POST',
    body: fd,
  });
}

/** Contract clause extraction. */
export async function extractContractClauses(
  file: File,
): Promise<ContractClauseResult> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY);
    return {
      documentId: `clause_mock_${Date.now()}`,
      clauses: [
        {
          clauseId: 'cl_01',
          title: 'Personal Guarantee',
          text: 'The undersigned personally guarantees all obligations...',
          riskLevel: 'high',
          category: 'Liability',
        },
        {
          clauseId: 'cl_02',
          title: 'Arbitration',
          text: 'All disputes shall be resolved through binding arbitration...',
          riskLevel: 'medium',
          category: 'Dispute Resolution',
        },
        {
          clauseId: 'cl_03',
          title: 'Confidentiality',
          text: 'Both parties agree to maintain strict confidentiality...',
          riskLevel: 'low',
          category: 'Privacy',
        },
      ],
      parsedAt: new Date().toISOString(),
    };
  }
  const fd = buildFormData(file);
  return vafFetch<ContractClauseResult>('/api/documents/extract-clauses', {
    method: 'POST',
    body: fd,
  });
}

/** Assemble an evidence bundle / dossier from multiple documents. */
export async function assembleEvidenceBundle(
  params: EvidenceBundleParams,
): Promise<EvidenceBundleResult> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY);
    return {
      bundleId: `bnd_mock_${Date.now()}`,
      clientId: params.clientId,
      bundleType: params.bundleType,
      documentCount: params.documentIds.length,
      assembledAt: new Date().toISOString(),
      downloadUrl: `https://bundles.visionaudioforge.local/bnd_mock_${Date.now()}.zip`,
    };
  }
  return vafFetch<EvidenceBundleResult>('/api/evidence/assemble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}
