// ============================================================
// CapitalForge — Document row mapping
//
// /api/v1/clients/:id/documents returns Document rows. The tab previously did
// not call it at all: it seeded its state from a hardcoded PLACEHOLDER_DOCUMENTS
// array, so every client displayed the same four documents — including a
// signed contract and a legal hold — regardless of what was in the vault.
// ============================================================

export type SignatureStatus = 'signed' | 'pending' | 'not_required' | 'sent' | 'delivered';
export type DocumentType = 'consent' | 'contract' | 'bank_statement' | 'id' | 'compliance' | 'other';

export interface ApiDocument {
  id: string;
  documentType: string | null;
  title: string | null;
  storageKey?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  legalHold?: boolean | null;
  metadata?: unknown;
  createdAt: string | null;
}

export interface DocumentRecord {
  id: string;
  name: string;
  type: DocumentType;
  typeLabel: string;
  size: string;
  uploadedAt: string;
  signatureStatus: SignatureStatus;
  legalHold: boolean;
  docusignEnvelopeId?: string | null;
}

const TYPE_ALIASES: Record<string, DocumentType> = {
  consent: 'consent',
  tcpa_consent: 'consent',
  contract: 'contract',
  agreement: 'contract',
  bank_statement: 'bank_statement',
  statement: 'bank_statement',
  id: 'id',
  identification: 'id',
  drivers_license: 'id',
  passport: 'id',
  compliance: 'compliance',
  disclosure: 'compliance',
  articles_of_incorporation: 'compliance',
  tax_return: 'compliance',
};

const TYPE_LABELS: Record<DocumentType, string> = {
  consent: 'Consent',
  contract: 'Contract',
  bank_statement: 'Bank Statement',
  id: 'Identification',
  compliance: 'Compliance',
  other: 'Other',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function toDocumentType(raw: string | null | undefined): DocumentType {
  const key = raw?.toLowerCase().trim() ?? '';
  return TYPE_ALIASES[key] ?? 'other';
}

export function typeLabel(type: DocumentType): string {
  return TYPE_LABELS[type];
}

/** Human-readable size, or an explicit dash when the row has no byte count. */
export function formatSize(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Signature state, only when a signing flow recorded one in metadata.
 *
 * Documents carry no signature column, so anything not explicitly recorded is
 * 'not_required' rather than 'pending' — the latter would assert an
 * outstanding signature request that nothing in the record supports.
 */
const SIGNATURE_STATUSES: SignatureStatus[] = ['signed', 'pending', 'sent', 'delivered'];

export function signatureStatusFrom(metadata: unknown): SignatureStatus {
  const m = asRecord(metadata);
  const raw = m['signatureStatus'] ?? m['docusignStatus'];
  const value = typeof raw === 'string' ? raw.toLowerCase() : '';
  return (SIGNATURE_STATUSES as string[]).includes(value)
    ? (value as SignatureStatus)
    : 'not_required';
}

export function envelopeIdFrom(metadata: unknown): string | null {
  const m = asRecord(metadata);
  const id = m['docusignEnvelopeId'] ?? m['envelopeId'];
  return typeof id === 'string' && id.trim() ? id : null;
}

export function toDocumentRecord(doc: ApiDocument): DocumentRecord {
  const type = toDocumentType(doc.documentType);
  return {
    id: doc.id,
    name: doc.title?.trim() || 'Untitled document',
    type,
    typeLabel: TYPE_LABELS[type],
    size: formatSize(doc.sizeBytes),
    uploadedAt: doc.createdAt ?? '',
    signatureStatus: signatureStatusFrom(doc.metadata),
    legalHold: doc.legalHold === true,
    docusignEnvelopeId: envelopeIdFrom(doc.metadata),
  };
}

/** Accepts a bare array or a `{ documents: [] }` wrapper. */
export function toDocumentRecords(data: unknown): DocumentRecord[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)['documents'])
      ? (asRecord(data)['documents'] as unknown[])
      : [];

  return rows
    .filter((row): row is ApiDocument => !!row && typeof row === 'object' && 'id' in row)
    .map(toDocumentRecord);
}

// ── Required-document checklist ─────────────────────────────────────────────

export interface RequiredDoc {
  label: string;
  uploaded: boolean;
  fileName?: string;
}

/** Document types a client must have on file before a funding application. */
const REQUIRED_SPECS: { label: string; type: DocumentType }[] = [
  { label: 'Bank Statement (3 months)', type: 'bank_statement' },
  { label: 'Advisor Agreement', type: 'contract' },
  { label: 'TCPA Consent Record', type: 'consent' },
  { label: 'Compliance Disclosures', type: 'compliance' },
  { label: 'Government ID (Owner)', type: 'id' },
];

/**
 * The checklist, with each item marked uploaded only when a matching document
 * is actually in the vault.
 *
 * This was previously a constant with three items hardcoded to uploaded, with
 * invented filenames, so every client appeared to have satisfied most of the
 * requirement regardless of what had been provided.
 */
export function buildRequiredChecklist(documents: DocumentRecord[]): RequiredDoc[] {
  return REQUIRED_SPECS.map((spec) => {
    const match = documents.find((d) => d.type === spec.type);
    return match
      ? { label: spec.label, uploaded: true, fileName: match.name }
      : { label: spec.label, uploaded: false };
  });
}
