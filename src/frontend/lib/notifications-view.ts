// ============================================================
// CapitalForge — Notification mapping
//
// The bell in the header showed "4 unread" on every page, and the panel
// behind it held five literals:
//
//   APR Expiry — Thornwood Capital     Chase ****4821 expires in 5 days
//   Compliance flag — James Park call  Disclosure Missing detected
//   Deal committee review needed       Apex Ventures $250K awaiting decision
//
// with relative timestamps written in as strings — "2h ago", "3h ago" — so
// they said the same thing whenever you looked. Clicking one navigated to a
// client that does not exist. The endpoint behind it was a second set of ten
// invented items held in the API process, unscoped and shared by every
// tenant.
//
//   GET /api/notifications        — what needs attention now
//   GET /api/notifications/count  — how many
//
// Both are derived from records that exist. There is no read state anywhere
// in the schema, so there is none here: the count is of things outstanding,
// not of things unseen.
// ============================================================

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

export interface NotificationRow {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  description: string;
  /** From the record. Null when the row carries no date. */
  occurredAt: string | null;
  /** Null when the item names no page that exists. */
  href: string | null;
}

const SEVERITIES = new Set<string>(['CRITICAL', 'HIGH', 'MEDIUM', 'INFO']);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Severity as the API stated it.
 *
 * Anything unrecognised becomes INFO rather than being guessed upward. An
 * item styled CRITICAL because its severity could not be read is a false
 * alarm, and a panel that cries wolf gets ignored when it is right.
 */
export function toSeverity(raw: unknown): Severity {
  const s = (str(raw) ?? '').toUpperCase();
  return SEVERITIES.has(s) ? (s as Severity) : 'INFO';
}

export function toNotificationRow(row: unknown): NotificationRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  const title = str(r['title']);
  // No id or no title is not something anyone can act on.
  if (id === null || title === null) return null;

  return {
    id,
    type: str(r['type']) ?? 'unknown',
    severity: toSeverity(r['severity']),
    title,
    description: str(r['description']) ?? '',
    occurredAt: str(r['occurredAt']),
    href: str(r['href']),
  };
}

export function toNotificationRows(data: unknown): NotificationRow[] {
  const d = asRecord(data);
  const list = Array.isArray(data) ? data : d['notifications'];
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => toNotificationRow(row))
    .filter((row): row is NotificationRow => row !== null);
}

/**
 * The number on the bell.
 *
 * Null rather than 0 when it cannot be read: a zero says "nothing needs your
 * attention", which is a claim, and the badge is hidden on null instead of
 * showing a reassuring number nobody computed.
 */
export function toOutstandingCount(data: unknown): number | null {
  const value = asRecord(data)['outstanding'];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

const RANK: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, INFO: 3 };

/** Worst first, then most recent. Undated last rather than treated as old. */
export function sortForDisplay(rows: NotificationRow[]): NotificationRow[] {
  return [...rows].sort((a, b) => {
    if (RANK[a.severity] !== RANK[b.severity]) return RANK[a.severity] - RANK[b.severity];
    if (a.occurredAt === null) return b.occurredAt === null ? 0 : 1;
    if (b.occurredAt === null) return -1;
    return b.occurredAt.localeCompare(a.occurredAt);
  });
}

/**
 * How long ago, from the record's own date.
 *
 * Returns null when there is no date, so the panel can say nothing rather
 * than print a relative time that was typed in by hand — which is what "2h
 * ago" was.
 */
export function relativeTime(iso: string | null, now: Date): string | null {
  if (iso === null) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  const future = seconds < 0;
  const abs = Math.abs(seconds);

  const say = (n: number, unit: string): string => {
    const plural = `${n} ${unit}${n === 1 ? '' : 's'}`;
    return future ? `in ${plural}` : `${plural} ago`;
  };

  if (abs < 60) return future ? 'shortly' : 'just now';
  if (abs < 3600) return say(Math.round(abs / 60), 'minute');
  if (abs < 86_400) return say(Math.round(abs / 3600), 'hour');
  if (abs < 2_592_000) return say(Math.round(abs / 86_400), 'day');
  return say(Math.round(abs / 2_592_000), 'month');
}

export interface SeverityTally {
  critical: number;
  high: number;
  other: number;
}

export function tally(rows: NotificationRow[]): SeverityTally {
  return {
    critical: rows.filter((r) => r.severity === 'CRITICAL').length,
    high: rows.filter((r) => r.severity === 'HIGH').length,
    other: rows.filter((r) => r.severity !== 'CRITICAL' && r.severity !== 'HIGH').length,
  };
}
