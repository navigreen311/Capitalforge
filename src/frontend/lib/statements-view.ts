// ============================================================
// CapitalForge — Statements mapping
//
// /statements held 1763 lines of literals: statements per client with
// closing balances and minimum payments, and — worst — a list of detected
// anomalies:
//
//   "Annual fee charged twice on Amex Business Platinum in the same billing
//    cycle", $1,390.00 against an expected $695.00, with the instruction
//    "Contact Amex commercial servicing to request reversal of duplicate
//    annual fee charge (ref: stmt_002). Escalate if unresolved within 5
//    business days."
//
//   "Closing balance on imported PDF does not match issuer portal balance
//    by $340.00."
//
// Nobody detected any of it. An advisor acting on that calls an issuer about
// a charge that was never made, on behalf of a client who was never billed.
//
//   GET /api/statements?client_id=              — the statements
//   GET /api/businesses/:id/statements/anomalies — what the detector found
//
// The detector is real: it compares the imported statement against what the
// system holds and records what it finds on the statement row. This maps
// what it produces, and nothing else.
// ============================================================

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface StatementRow {
  id: string;
  issuer: string;
  statementDate: string | null;
  /** Null where the record carries no figure. Never zero as a stand-in. */
  closingBalance: number | null;
  minimumPayment: number | null;
  dueDate: string | null;
  feesCharged: number | null;
  interestCharged: number | null;
  reconciled: boolean;
  anomalyCount: number;
}

export interface AnomalyRow {
  type: string;
  severity: AnomalySeverity;
  description: string;
  amount: number | null;
  transactionRef: string | null;
}

const SEVERITIES = new Set<string>(['low', 'medium', 'high', 'critical']);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toStatementRow(row: unknown): StatementRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === null) return null;

  return {
    id,
    issuer: str(r['issuer']) ?? 'Unknown issuer',
    statementDate: str(r['statementDate']),
    closingBalance: num(r['closingBalance']),
    minimumPayment: num(r['minimumPayment']),
    dueDate: str(r['dueDate']),
    feesCharged: num(r['feesCharged']),
    interestCharged: num(r['interestCharged']),
    reconciled: r['reconciled'] === true,
    anomalyCount: num(r['anomalyCount']) ?? 0,
  };
}

export function toStatementRows(data: unknown): StatementRow[] {
  const d = asRecord(data);
  const list = Array.isArray(data) ? data : d['statements'];
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => toStatementRow(row))
    .filter((row): row is StatementRow => row !== null);
}

/**
 * Severity as the detector recorded it.
 *
 * Anything unreadable is 'low', never escalated. An anomaly shown critical
 * because its severity could not be parsed sends an advisor to an issuer.
 */
export function toSeverity(raw: unknown): AnomalySeverity {
  const v = (str(raw) ?? '').toLowerCase();
  return SEVERITIES.has(v) ? (v as AnomalySeverity) : 'low';
}

export function toAnomalyRow(row: unknown): AnomalyRow | null {
  const r = asRecord(row);
  const description = str(r['description']);
  // An anomaly with no description is not actionable, and a blank line in a
  // list of findings reads as one more finding.
  if (description === null) return null;

  return {
    type: str(r['type']) ?? 'unknown',
    severity: toSeverity(r['severity']),
    description,
    amount: num(r['amount']),
    transactionRef: str(r['transactionRef']),
  };
}

/**
 * Flattens the per-statement reports the API returns.
 *
 * Shape: { reports: [{ statementId, anomalies: [...] }], totalAnomalies }
 */
export function toAnomalyRows(data: unknown): { statementId: string; anomaly: AnomalyRow }[] {
  const reports = asRecord(data)['reports'];
  if (!Array.isArray(reports)) return [];

  return reports.flatMap((report) => {
    const rec = asRecord(report);
    const statementId = str(rec['statementId']) ?? str(rec['id']) ?? '';
    const list = Array.isArray(rec['anomalies']) ? rec['anomalies'] : [];
    return list
      .map((a) => toAnomalyRow(a))
      .filter((a): a is AnomalyRow => a !== null)
      .map((anomaly) => ({ statementId, anomaly }));
  });
}

export interface StatementSummary {
  statements: number;
  reconciled: number;
  withAnomalies: number;
  /** Null when no statement carries a balance, rather than a total of zero. */
  totalClosingBalance: number | null;
}

export function summarise(rows: StatementRow[]): StatementSummary {
  const withBalance = rows.filter((r) => r.closingBalance !== null);
  return {
    statements: rows.length,
    reconciled: rows.filter((r) => r.reconciled).length,
    withAnomalies: rows.filter((r) => r.anomalyCount > 0).length,
    totalClosingBalance:
      withBalance.length === 0
        ? null
        : withBalance.reduce((sum, r) => sum + (r.closingBalance ?? 0), 0),
  };
}

export function formatMoney(value: number | null): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}
