// ============================================================
// CapitalForge — Client application mapping
//
// The applications tab never called the API: it rendered a constant,
// PLACEHOLDER_APPLICATIONS, so every client showed the same three cards —
// one approved with a balance and utilisation, one submitted, one declined
// with a reason — regardless of what they had actually applied for.
//
// Two facts drive this module:
//   - The list endpoint (/api/applications?businessId=…) carries no card
//     account detail. Balance, available credit, utilisation and APR are not
//     modelled, so they are reported as unknown rather than as zero.
//   - Consent and acknowledgment status are real, but live on the business,
//     not the application. They come from the compliance-gate endpoint.
// ============================================================

export type ApplicationStatus = 'approved' | 'draft' | 'submitted' | 'declined';

export interface ApiApplication {
  id: string;
  issuer: string | null;
  cardProduct: string | null;
  status: string | null;
  requestedLimit?: number | null;
  approvedLimit?: number | null;
  roundNumber?: number | null;
  submittedAt?: string | null;
  decidedAt?: string | null;
  createdAt?: string | null;
}

export interface ApplicationView {
  id: string;
  cardProduct: string;
  issuer: string;
  status: ApplicationStatus;
  requestedAmount: number | null;
  approvedAmount: number | null;
  /** null means "not known", which is distinct from "complete" or "missing". */
  consentComplete: boolean | null;
  ackSigned: boolean | null;
  roundNumber: number | null;
  submittedAt: string | null;
}

const STATUSES: ApplicationStatus[] = ['approved', 'draft', 'submitted', 'declined'];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function toApplicationStatus(raw: string | null | undefined): ApplicationStatus {
  const value = raw?.toLowerCase().trim() ?? '';
  if ((STATUSES as string[]).includes(value)) return value as ApplicationStatus;
  // Anything unrecognised is treated as a draft rather than as approved.
  return 'draft';
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// ── Compliance gates ────────────────────────────────────────────────────────

export interface ComplianceGate {
  id: string;
  label: string;
  status: string;
  critical?: boolean;
}

export interface GateSummary {
  consentComplete: boolean | null;
  ackSigned: boolean | null;
}

/**
 * Reduce the compliance-gate response to the two flags the cards show.
 *
 * Returns nulls when the gate data has not loaded or does not contain the
 * relevant gates. That matters: `false` renders as "consent incomplete", a
 * claim about the client's file that an absent response does not support.
 */
export function summariseGates(data: unknown): GateSummary {
  const gates = asRecord(data)['gates'];
  if (!Array.isArray(gates)) return { consentComplete: null, ackSigned: null };

  const rows = gates.filter((g): g is ComplianceGate => !!g && typeof g === 'object' && 'id' in g);
  const find = (id: string) => rows.find((g) => g.id === id);

  const tcpa = find('tcpa-consent');
  const application = find('application-consent');
  const productReality = find('product-reality');

  const consentGates = [tcpa, application].filter(Boolean) as ComplianceGate[];
  const consentComplete = consentGates.length
    ? consentGates.every((g) => g.status === 'pass')
    : null;

  return {
    consentComplete,
    ackSigned: productReality ? productReality.status === 'pass' : null,
  };
}

// ── Application rows ────────────────────────────────────────────────────────

export function toApplicationView(app: ApiApplication, gates: GateSummary): ApplicationView {
  return {
    id: app.id,
    cardProduct: app.cardProduct?.trim() || 'Unspecified card',
    issuer: app.issuer?.trim() || 'Unknown issuer',
    status: toApplicationStatus(app.status),
    requestedAmount: numberOrNull(app.requestedLimit),
    approvedAmount: numberOrNull(app.approvedLimit),
    consentComplete: gates.consentComplete,
    ackSigned: gates.ackSigned,
    roundNumber: numberOrNull(app.roundNumber),
    submittedAt: app.submittedAt ?? null,
  };
}

/** Accepts a bare array or an `{ applications: [] }` / `{ items: [] }` wrapper. */
export function toApplicationViews(data: unknown, gates: GateSummary): ApplicationView[] {
  const record = asRecord(data);
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(record['applications'])
      ? (record['applications'] as unknown[])
      : Array.isArray(record['items'])
        ? (record['items'] as unknown[])
        : [];

  return rows
    .filter((row): row is ApiApplication => !!row && typeof row === 'object' && 'id' in row)
    .map((row) => toApplicationView(row, gates));
}

/** Currency, or an explicit "not available" for values the API does not carry. */
export function formatAmount(value: number | null): string {
  if (value === null) return 'Not available';
  return `$${value.toLocaleString()}`;
}
