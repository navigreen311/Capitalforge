// ============================================================
// CapitalForge — Offboarding mapping
//
// The offboarding page called nothing. Four workflows were literals, each
// with its data steps ticked off:
//
//   Summit Capital Group   complete   PII anonymization ✓  Credit file purge ✓
//   Apex Ventures LLC      55%        PII anonymization running
//
// Those ticks are the answer to "did you erase my data". Beside them sat a
// retention schedule of seven data classes with legal bases and delete-after
// dates, and a set of exit interviews.
//
// The deletion behind this is real and irreversible. It nulls SSNs, dates of
// birth and addresses on every business owner, rewrites every user's email
// and password hash, and for a tenant offboarding deactivates the tenant. It
// then writes a signed proof hash. Nothing about it is a stub.
//
// What the record holds per workflow is coarser than the page pretended:
// whether the export is done, one deletion status, and a proof hash once a
// deletion has run. There are no per-step states — no separate "PII
// anonymization" and "credit file purge" — so those are not reconstructed.
//
//   GET /api/offboarding                        — the workflows
//   GET /api/offboarding/retention?jurisdiction — what a deletion keeps
//
// Neither existed before this repair.
// ============================================================

export type OffboardingType = 'client' | 'tenant';

export type DeletionStatus = 'pending' | 'in_progress' | 'completed' | 'unknown';

export interface OffboardingRow {
  id: string;
  businessId: string | null;
  offboardingType: OffboardingType | string;
  status: string;
  /** Whether the client's data has been packaged for them. */
  dataExportCompleted: boolean;
  deletionStatus: DeletionStatus;
  /**
   * Set once a deletion has run and been signed. Its absence is the only
   * evidence available that nothing was deleted.
   */
  deletionProofHash: string | null;
  refundAmount: number | null;
  exitReason: string | null;
  exitInterviewNotes: string | null;
  initiatedAt: string | null;
  completedAt: string | null;
}

export interface RetentionException {
  table: string;
  reason: string;
  retainUntil: string | null;
  legalBasis: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const DELETION_STATUSES = new Set<string>(['pending', 'in_progress', 'completed']);

/**
 * The deletion status.
 *
 * Anything unrecognised becomes 'unknown', never 'completed'. "Completed" is
 * the statement that somebody's personal data is gone, and it has to come
 * from the record rather than from a fallback.
 */
export function toDeletionStatus(raw: unknown): DeletionStatus {
  const s = (str(raw) ?? '').toLowerCase();
  return DELETION_STATUSES.has(s) ? (s as DeletionStatus) : 'unknown';
}

export function toOffboardingRow(row: unknown): OffboardingRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === null) return null;

  return {
    id,
    businessId: str(r['businessId']),
    offboardingType: str(r['offboardingType']) ?? 'client',
    status: str(r['status']) ?? 'initiated',
    dataExportCompleted: r['dataExportCompleted'] === true,
    deletionStatus: toDeletionStatus(r['dataDeletionStatus']),
    deletionProofHash: str(r['deletionProofHash']),
    refundAmount: num(r['refundAmount']),
    exitReason: str(r['exitReason']),
    exitInterviewNotes: str(r['exitInterviewNotes']),
    initiatedAt: str(r['initiatedAt']),
    completedAt: str(r['completedAt']),
  };
}

export function toOffboardingRows(data: unknown): OffboardingRow[] {
  const list = Array.isArray(data) ? data : asRecord(data)['data'];
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => toOffboardingRow(row))
    .filter((row): row is OffboardingRow => row !== null);
}

export function toRetentionExceptions(data: unknown): RetentionException[] {
  const d = asRecord(data);
  const list = Array.isArray(data) ? data : d['exceptions'];
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry) => {
    const e = asRecord(entry);
    const table = str(e['table']);
    const legalBasis = str(e['legalBasis']);
    // An exception with no statute behind it is not an exception, it is data
    // being kept for no stated reason.
    if (table === null || legalBasis === null) return [];
    return [
      {
        table,
        reason: str(e['reason']) ?? '',
        retainUntil: str(e['retainUntil']),
        legalBasis,
      },
    ];
  });
}

// ── Derived ─────────────────────────────────────────────────

/**
 * Whether this workflow's deletion has actually been carried out.
 *
 * Both conditions, because the proof hash is what makes the claim
 * checkable: a status of "completed" with no proof means the record says the
 * data is gone and nothing signs for it.
 */
export function deletionIsProven(row: OffboardingRow): boolean {
  return row.deletionStatus === 'completed' && row.deletionProofHash !== null;
}

export interface OffboardingSummary {
  total: number;
  open: number;
  awaitingDeletion: number;
  deleted: number;
  /** Marked completed with no proof hash to show for it. */
  completedWithoutProof: number;
}

export function summarise(rows: OffboardingRow[]): OffboardingSummary {
  const completed = rows.filter((r) => r.deletionStatus === 'completed');

  return {
    total: rows.length,
    open: rows.filter((r) => r.completedAt === null).length,
    awaitingDeletion: rows.filter(
      (r) => r.deletionStatus === 'pending' || r.deletionStatus === 'in_progress',
    ).length,
    deleted: completed.filter((r) => r.deletionProofHash !== null).length,
    completedWithoutProof: completed.filter((r) => r.deletionProofHash === null).length,
  };
}

/** Days since the workflow was opened, or null when undated. */
export function daysOpen(row: OffboardingRow, now: Date): number | null {
  if (row.initiatedAt === null) return null;
  const started = new Date(row.initiatedAt);
  if (Number.isNaN(started.getTime())) return null;
  const end = row.completedAt === null ? now : new Date(row.completedAt);
  if (Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.floor((end.getTime() - started.getTime()) / 86_400_000));
}

/** Snake case to words, for values the API sends as enum keys. */
export function humanise(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}

// ── Audit trail ─────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  action: string;
  /** Null when the action was not attributed to a user. */
  performedBy: string | null;
  timestamp: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * The audit trail for one workflow.
 *
 * These come from audit_logs, written when the workflow opens and when a
 * deletion runs. The endpoint used to build them at request time from a
 * counter held in memory — timestamps an hour apart, everything attributed
 * to "system" — which is a manufactured record of an erasure.
 */
export function toAuditEntries(data: unknown): AuditEntry[] {
  const list = Array.isArray(data) ? data : asRecord(data)['entries'];
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry) => {
    const e = asRecord(entry);
    const id = str(e['id']);
    const action = str(e['action']);
    // An entry with no action describes nothing that happened.
    if (id === null || action === null) return [];
    return [
      {
        id,
        action,
        performedBy: str(e['performedBy']),
        timestamp: str(e['timestamp']),
        metadata:
          typeof e['metadata'] === 'object' && e['metadata'] !== null
            ? (e['metadata'] as Record<string, unknown>)
            : null,
      },
    ];
  });
}
