// ============================================================
// CapitalForge — Client roster, applications and rounds mapping
//
// /clients, /applications and /funding-rounds each held their own literals
// and called nothing, while three populated endpoints sat behind them:
//
//   GET /api/clients                        the roster
//   GET /api/businesses/:id/applications    a client's applications
//   GET /api/funding-rounds                 the rounds
//
// Everything here is what those return. Where a figure is absent it stays
// null — a readiness score of 0 is a client assessed as unready, and a
// credit limit of 0 is a card approved for nothing.
// ============================================================

export interface ClientRow {
  id: string;
  businessName: string;
  status: string;
  advisorName: string | null;
  /** Null when no assessment has been made. Not zero. */
  fundingReadinessScore: number | null;
  entityType: string | null;
  state: string | null;
  lastActivityAt: string | null;
  consentStatus: string | null;
}

export interface ApplicationRow {
  id: string;
  businessId: string;
  issuer: string;
  cardProduct: string;
  status: string;
  creditLimit: number | null;
  submittedAt: string | null;
  decidedAt: string | null;
  declineReason: string | null;
}

export interface RoundRow {
  id: string;
  businessId: string;
  roundNumber: number | null;
  targetCredit: number | null;
  targetCardCount: number | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Numbers arrive as numbers or as Decimal strings, depending on the route. */
function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function list(data: unknown): unknown[] {
  const d = asRecord(data);
  if (Array.isArray(data)) return data;
  if (Array.isArray(d['data'])) return d['data'] as unknown[];
  return [];
}

export function toClientRow(row: unknown): ClientRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  const businessName = str(r['businessName']) ?? str(r['legalName']);
  if (id === null || businessName === null) return null;

  return {
    id,
    businessName,
    status: str(r['status']) ?? 'unknown',
    advisorName: str(r['advisorName']),
    fundingReadinessScore: num(r['fundingReadinessScore']),
    entityType: str(r['entityType']),
    state: str(r['state']) ?? str(r['stateOfFormation']),
    lastActivityAt: str(r['lastActivityAt']),
    consentStatus: str(r['consentStatus']),
  };
}

export function toClientRows(data: unknown): ClientRow[] {
  return list(data)
    .map((row) => toClientRow(row))
    .filter((row): row is ClientRow => row !== null);
}

export function toApplicationRow(row: unknown): ApplicationRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === null) return null;

  return {
    id,
    businessId: str(r['businessId']) ?? '',
    issuer: str(r['issuer']) ?? 'Unknown issuer',
    cardProduct: str(r['cardProduct']) ?? '',
    status: str(r['status']) ?? 'draft',
    creditLimit: num(r['creditLimit']),
    submittedAt: str(r['submittedAt']),
    decidedAt: str(r['decidedAt']),
    declineReason: str(r['declineReason']),
  };
}

export function toApplicationRows(data: unknown): ApplicationRow[] {
  return list(data)
    .map((row) => toApplicationRow(row))
    .filter((row): row is ApplicationRow => row !== null);
}

export function toRoundRow(row: unknown): RoundRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === null) return null;

  return {
    id,
    businessId: str(r['businessId']) ?? '',
    roundNumber: num(r['roundNumber']),
    targetCredit: num(r['targetCredit']),
    targetCardCount: num(r['targetCardCount']),
    status: str(r['status']) ?? 'unknown',
    startedAt: str(r['startedAt']),
    completedAt: str(r['completedAt']),
  };
}

export function toRoundRows(data: unknown): RoundRow[] {
  return list(data)
    .map((row) => toRoundRow(row))
    .filter((row): row is RoundRow => row !== null);
}

export function formatMoney(value: number | null): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value);
}

export function humanise(key: string): string {
  const words = key.replace(/[._]/g, ' ').trim();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}
