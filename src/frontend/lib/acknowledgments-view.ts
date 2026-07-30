// ============================================================
// CapitalForge — Product acknowledgment mapping
//
// /api/v1/clients/:id/acknowledgments returns ProductAcknowledgment rows.
// That table only holds acknowledgments that were actually signed — signedAt
// is non-nullable — so an unsigned obligation has no row at all.
//
// The UI must still show the required set, otherwise a client who has signed
// nothing renders as an empty, reassuring list. Missing entries are therefore
// derived from absence against the required catalogue, and labelled as having
// no signed record rather than as "pending", which would imply a request is
// already in flight.
// ============================================================

export type AckStatus = 'signed' | 'missing';

/**
 * DocuSign envelope state, when a signing flow recorded one in metadata.
 *
 * Nothing writes this today, so it resolves to 'none' and the badge is
 * omitted. It used to be hardcoded per row in the placeholder data, which
 * showed envelopes as "Delivered to Signer" for envelopes that never existed.
 */
export type DocuSignStatus = 'none' | 'sent' | 'delivered' | 'signed' | 'declined';

export interface ApiAcknowledgment {
  id: string;
  acknowledgmentType: string | null;
  version: string | null;
  signedAt: string | null;
  signatureRef: string | null;
  documentVaultId: string | null;
  metadata?: unknown;
}

export interface AcknowledgmentItem {
  id: string;
  type: string;
  name: string;
  description: string;
  status: AckStatus;
  signed_date: string | null;
  signed_by: string | null;
  document_url: string | null;
  version: string | null;
  docusign_envelope_id: string | null;
  docusign_status: DocuSignStatus;
}

/** The acknowledgments a funded client is required to have on file. */
export const REQUIRED_ACKNOWLEDGMENTS: { type: string; name: string; description: string }[] = [
  {
    type: 'product_reality',
    name: 'Product-Reality Acknowledgment',
    description: 'Confirms the client understands they are receiving credit-card-based funding.',
  },
  {
    type: 'fee_schedule',
    name: 'Fee & Refund Acknowledgment',
    description: 'Itemised origination, servicing and early-termination fees.',
  },
  {
    type: 'personal_guarantee',
    name: 'Personal Guarantee Acknowledgment',
    description: 'Personal guarantee obligations and liability scope.',
  },
  {
    type: 'cash_advance_risk',
    name: 'Cash-Advance Restriction Acknowledgment',
    description: 'Restrictions on cash-advance usage and prohibited transactions.',
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function humanise(type: string): string {
  return type
    .split(/[._]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const DOCUSIGN_STATUSES: DocuSignStatus[] = ['sent', 'delivered', 'signed', 'declined'];

/** Envelope state from metadata, or 'none' when no signing flow recorded one. */
export function docuSignFrom(metadata: unknown): {
  docusign_envelope_id: string | null;
  docusign_status: DocuSignStatus;
} {
  const m = asRecord(metadata);
  const envelopeId = m['docusignEnvelopeId'] ?? m['docusign_envelope_id'];
  const rawStatus = m['docusignStatus'] ?? m['docusign_status'];
  const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : '';

  return {
    docusign_envelope_id: typeof envelopeId === 'string' && envelopeId.trim() ? envelopeId : null,
    docusign_status: (DOCUSIGN_STATUSES as string[]).includes(status)
      ? (status as DocuSignStatus)
      : 'none',
  };
}

/** Signer name, when the emitter recorded one in metadata. */
export function signerFrom(metadata: unknown, signatureRef: string | null): string | null {
  const m = asRecord(metadata);
  for (const key of ['signedBy', 'signerName', 'signer']) {
    const value = m[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return signatureRef?.trim() ? signatureRef : null;
}

/** The API may return a bare array or a `{ acknowledgments: [] }` wrapper. */
export function extractAcknowledgments(data: unknown): ApiAcknowledgment[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)['acknowledgments'])
      ? (asRecord(data)['acknowledgments'] as unknown[])
      : [];

  return rows.filter(
    (row): row is ApiAcknowledgment => !!row && typeof row === 'object' && 'id' in row,
  );
}

/**
 * The required catalogue, each entry either signed or missing, followed by any
 * signed acknowledgment outside the required set.
 */
export function buildAcknowledgmentList(data: unknown): AcknowledgmentItem[] {
  const rows = extractAcknowledgments(data);
  const byType = new Map<string, ApiAcknowledgment>();
  for (const row of rows) {
    if (row.acknowledgmentType) byType.set(row.acknowledgmentType, row);
  }

  const required: AcknowledgmentItem[] = REQUIRED_ACKNOWLEDGMENTS.map((spec) => {
    const row = byType.get(spec.type);
    if (!row) {
      return {
        id: `missing:${spec.type}`,
        type: spec.type,
        name: spec.name,
        description: spec.description,
        status: 'missing',
        signed_date: null,
        signed_by: null,
        document_url: null,
        version: null,
        docusign_envelope_id: null,
        docusign_status: 'none',
      };
    }
    return {
      id: row.id,
      type: spec.type,
      name: spec.name,
      description: spec.description,
      status: 'signed',
      signed_date: row.signedAt,
      signed_by: signerFrom(row.metadata, row.signatureRef),
      document_url: row.documentVaultId ? `/api/documents/${row.documentVaultId}` : null,
      version: row.version,
      ...docuSignFrom(row.metadata),
    };
  });

  const requiredTypes = new Set(REQUIRED_ACKNOWLEDGMENTS.map((s) => s.type));
  const extra: AcknowledgmentItem[] = rows
    .filter((row) => row.acknowledgmentType && !requiredTypes.has(row.acknowledgmentType))
    .map((row) => ({
      id: row.id,
      type: row.acknowledgmentType as string,
      name: humanise(row.acknowledgmentType as string),
      description: 'Additional acknowledgment on file.',
      status: 'signed' as const,
      signed_date: row.signedAt,
      signed_by: signerFrom(row.metadata, row.signatureRef),
      document_url: row.documentVaultId ? `/api/documents/${row.documentVaultId}` : null,
      version: row.version,
      ...docuSignFrom(row.metadata),
    }));

  return [...required, ...extra];
}

/** Count of required acknowledgments with no signed record. */
export function missingCount(items: AcknowledgmentItem[]): number {
  return items.filter((i) => i.status === 'missing').length;
}
