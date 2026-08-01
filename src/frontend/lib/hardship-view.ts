// ============================================================
// CapitalForge — Hardship mapping
//
// /financial-control/hardship carried two clients in workout — Carlos Mendez
// of Mendez Trucking LLC, $84,500 of debt, 3 missed payments, 92%
// utilisation, advisor Sarah Mitchell — plus an at-risk list, a card list
// and an activity feed, none of it read from anywhere.
//
// Its worst feature generated a workout proposal letter addressed to the
// client, from arbitrary multipliers of the invented balance:
//
//   reduced payment   totalDebt * 0.02
//   original payment  totalDebt * 0.035
//   settlement        55% or 65% of balance, "if paid within 90 days"
//   late fees waived  missedPayments * 39
//   rate reduction    "temporary reduction to 9.99% APR"
//
// signed "CapitalForge Hardship Resolution Team" and valid for 30 days. A
// debt settlement offer, computed from numbers nobody had.
//
//   GET /api/financial/hardship-cases — the cases, from hardship_cases
//
// The real service computes payment plans and settlements under stated rules
// — an APR cap, a share of revenue by severity, a settlement rate by
// severity — and persists them onto the case. What the record holds is what
// this maps.
// ============================================================

export type Severity = 'minor' | 'serious' | 'critical';

export interface HardshipRow {
  id: string;
  businessId: string;
  /** Null when the business could not be resolved. Never a person's name. */
  businessName: string | null;
  triggerType: string;
  severity: Severity | string;
  status: string;
  /** Whether a plan or an offer has been attached, not its contents. */
  hasPaymentPlan: boolean;
  hasSettlementOffer: boolean;
  counselorReferral: string | null;
  openedAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function toHardshipRow(row: unknown): HardshipRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  const businessId = str(r['businessId']);
  if (id === null || businessId === null) return null;

  return {
    id,
    businessId,
    businessName: str(r['businessName']),
    triggerType: str(r['triggerType']) ?? 'unknown',
    severity: str(r['severity']) ?? 'unknown',
    status: str(r['status']) ?? 'open',
    hasPaymentPlan: r['hasPaymentPlan'] === true,
    hasSettlementOffer: r['hasSettlementOffer'] === true,
    counselorReferral: str(r['counselorReferral']),
    openedAt: str(r['openedAt']),
    updatedAt: str(r['updatedAt']),
    resolvedAt: str(r['resolvedAt']),
  };
}

export function toHardshipRows(data: unknown): HardshipRow[] {
  const list = Array.isArray(data) ? data : asRecord(data)['data'];
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => toHardshipRow(row))
    .filter((row): row is HardshipRow => row !== null);
}

export interface HardshipSummary {
  total: number;
  open: number;
  resolved: number;
  critical: number;
  withPlan: number;
}

export function summarise(rows: HardshipRow[]): HardshipSummary {
  return {
    total: rows.length,
    open: rows.filter((r) => r.status === 'open' || r.status === 'in_negotiation').length,
    resolved: rows.filter((r) => r.status === 'resolved' || r.status === 'written_off').length,
    critical: rows.filter((r) => r.severity === 'critical').length,
    withPlan: rows.filter((r) => r.hasPaymentPlan).length,
  };
}

/** Snake case to words, for the enum keys the API sends. */
export function humanise(key: string): string {
  const words = key.replace(/[._]/g, ' ').trim();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}
