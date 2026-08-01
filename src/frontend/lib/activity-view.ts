// ============================================================
// CapitalForge — Activity mapping
//
// The dashboard's "Recent Activity" card held five literals:
//
//   APP-0091 moved to underwriting review                    12 min ago
//   Credit pull completed — Brightline Corp (Equifax)        1 hr ago
//   Compliance flag: Illinois disclosure deadline in 3 days  2 hr ago
//   Dossier exported for Apex Ventures Inc.                  4 hr ago
//   Funding Round #FR-018 created — $1.2M target             Yesterday
//
// The times were written in as strings, so the feed said "12 min ago"
// whenever it was opened. A "Mark all read" button faded them and raised a
// toast reading "All activity marked as read", while setting a Set in
// component state that a refresh discarded.
//
//   GET /api/activity?limit= — the audit log, most recent first
//
// That endpoint did not exist before this repair, which is why the card had
// nothing to read. Each line is now an audit_logs row: an action, a
// resource, who did it and when.
// ============================================================

import { relativeTime } from './notifications-view';

// Re-exported so a caller formatting an activity time does not have to know
// it is shared with the notification panel.
export { relativeTime };

export interface ActivityRow {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  /** Null when the record names no user. Not "system". */
  actor: string | null;
  occurredAt: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function toActivityRow(row: unknown): ActivityRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  const action = str(r['action']);
  const occurredAt = str(r['occurredAt']);
  // An entry with no action or no time describes nothing that happened.
  if (id === null || action === null || occurredAt === null) return null;

  return {
    id,
    action,
    resource: str(r['resource']) ?? '',
    resourceId: str(r['resourceId']),
    actor: str(r['actor']),
    occurredAt,
  };
}

export function toActivityRows(data: unknown): ActivityRow[] {
  const list = Array.isArray(data) ? data : asRecord(data)['entries'];
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => toActivityRow(row))
    .filter((row): row is ActivityRow => row !== null);
}

/**
 * The action, in words.
 *
 * "application.submitted" becomes "Application submitted". Nothing beyond
 * that: the fixtures read like sentences somebody wrote — "APP-0091 moved to
 * underwriting review" — and the record does not say that. It says an
 * action name and a resource.
 */
export function describeAction(action: string): string {
  const words = action.replace(/[._]/g, ' ').trim();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}

/** The resource, and its id when there is one, for tracing the line back. */
export function describeTarget(row: ActivityRow): string {
  if (row.resource === '') return row.resourceId ?? '';
  return row.resourceId === null ? row.resource : `${row.resource} ${row.resourceId}`;
}

/**
 * The two-letter badge.
 *
 * Derived from the action's first word so a new action type gets a sensible
 * badge without anyone adding a case. Unknown is not an error here.
 */
export function initials(action: string): string {
  const first = action.split(/[._\s]/)[0] ?? '';
  return (first.slice(0, 2) || '??').toUpperCase();
}

export interface ActivityGroup {
  label: string;
  rows: ActivityRow[];
}

/**
 * Grouped by day, using the record's own timestamps.
 *
 * Days with nothing in them are absent rather than shown empty, and the
 * labels come from the dates rather than from words like "Yesterday" that
 * were typed into a fixture.
 */
export function groupByDay(rows: ActivityRow[], now: Date): ActivityGroup[] {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const groups: ActivityGroup[] = [];
  for (const row of rows) {
    const day = row.occurredAt.slice(0, 10);
    const label = day === today ? 'Today' : day === yesterday ? 'Yesterday' : day;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}
