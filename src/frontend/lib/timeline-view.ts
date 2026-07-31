// ============================================================
// CapitalForge — Ledger event → timeline row mapping
//
// /api/v1/clients/:id/timeline returns raw LedgerEvent rows: an eventType, a
// JSON payload, and a publishedAt. The timeline UI needs a title, a detail
// line, an actor and a category.
//
// This module is that translation, kept pure so it can be tested under the
// repo's node-environment vitest setup. It exists because the tab previously
// expected a shape the API has never returned ({ events: [...] } with
// title/detail/actor fields), so its `?? buildPlaceholderEvents()` fallback
// was not a fallback — it was the only branch that ever ran.
// ============================================================

export type EventCategory =
  | 'all'
  | 'application'
  | 'payment'
  | 'consent'
  | 'call'
  | 'compliance'
  | 'document'
  | 'credit'
  | 'note';

/** A LedgerEvent row as returned by the API. */
export interface ApiLedgerEvent {
  id: string;
  eventType: string | null;
  aggregateType?: string | null;
  aggregateId?: string | null;
  payload?: unknown;
  metadata?: unknown;
  publishedAt: string | null;
}

export interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  detail: string;
  actor: string;
  timestamp: string;
  link?: string;
}

export interface EventTypeConfig {
  monogram: string;
  bgClass: string;
  textClass: string;
  category: EventCategory;
}

// ── Category/appearance per real event type ─────────────────────────────────
// Keyed on the values in shared/constants EVENT_TYPES. The previous map was
// keyed on `client.*` names that the backend never emits, so every real event
// fell through to the default and no category filter matched anything.

const APPLICATION: EventTypeConfig = { monogram: 'AP', bgClass: 'bg-blue-100', textClass: 'text-blue-700', category: 'application' };
const PAYMENT: EventTypeConfig = { monogram: 'PY', bgClass: 'bg-emerald-100', textClass: 'text-emerald-700', category: 'payment' };
const CONSENT: EventTypeConfig = { monogram: 'CN', bgClass: 'bg-amber-100', textClass: 'text-amber-700', category: 'consent' };
const CALL: EventTypeConfig = { monogram: 'CL', bgClass: 'bg-purple-100', textClass: 'text-purple-700', category: 'call' };
const COMPLIANCE: EventTypeConfig = { monogram: 'CO', bgClass: 'bg-rose-100', textClass: 'text-rose-700', category: 'compliance' };
const DOCUMENT: EventTypeConfig = { monogram: 'DC', bgClass: 'bg-indigo-100', textClass: 'text-indigo-700', category: 'document' };
const CREDIT: EventTypeConfig = { monogram: 'CR', bgClass: 'bg-teal-100', textClass: 'text-teal-700', category: 'credit' };
const NOTE: EventTypeConfig = { monogram: 'NT', bgClass: 'bg-gray-100', textClass: 'text-gray-700', category: 'note' };

export const EVENT_TYPE_MAP: Record<string, EventTypeConfig> = {
  'application.created': APPLICATION,
  'application.submitted': APPLICATION,
  'application.approved': APPLICATION,
  'card.declined': APPLICATION,
  'apr.expiry.approaching': APPLICATION,
  'round.started': APPLICATION,
  'funding_round.completed': APPLICATION,
  'restack.trigger.fired': APPLICATION,

  'debit.authorized': PAYMENT,
  'debit.revoked': PAYMENT,
  'debit.unauthorized.detected': PAYMENT,

  'consent.captured': CONSENT,
  'consent.revoked': CONSENT,
  'product.reality.acknowledged': CONSENT,

  'call.completed': CALL,
  'call.compliance.violation': CALL,

  'compliance.check.completed': COMPLIANCE,
  'risk.alert.raised': COMPLIANCE,
  'suitability.assessed': COMPLIANCE,
  'nogo.triggered': COMPLIANCE,
  'kyb.verified': COMPLIANCE,
  'kyc.verified': COMPLIANCE,
  'policy.evaluated': COMPLIANCE,
  'workflow.evaluated': COMPLIANCE,

  'document.uploaded': DOCUMENT,
  'document.processed': DOCUMENT,

  'business.created': NOTE,
  'business.onboarded': NOTE,
  'offboarding.initiated': NOTE,
  'offboarding.completed': NOTE,
  'rule.created': NOTE,
  'rule.updated': NOTE,
  'rule.version.deployed': NOTE,
  'rule.version.rolled_back': NOTE,
};

export const DEFAULT_EVENT_CONFIG: EventTypeConfig = {
  monogram: '••',
  bgClass: 'bg-gray-100',
  textClass: 'text-gray-700',
  category: 'all',
};

export function getEventConfig(eventType: string): EventTypeConfig {
  return EVENT_TYPE_MAP[eventType] ?? DEFAULT_EVENT_CONFIG;
}

// ── Field derivation ────────────────────────────────────────────────────────

/** `application.submitted` → `Application Submitted`. */
export function titleFromEventType(eventType: string | null | undefined): string {
  if (!eventType) return 'Unknown Event';
  return eventType
    .split(/[._]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * A one-line summary drawn from whichever descriptive fields the payload has.
 *
 * Payload shape varies per event type, so this reads the fields the emitters
 * actually set rather than assuming one schema.
 */
export function detailFromPayload(payload: unknown): string {
  const p = asRecord(payload);

  const parts: string[] = [];
  const push = (label: string, key: string) => {
    const value = p[key];
    if (typeof value === 'string' && value.trim()) parts.push(`${label}: ${value}`);
    else if (typeof value === 'number') parts.push(`${label}: ${value}`);
  };

  push('Business', 'businessName');
  push('Issuer', 'issuer');
  push('Card', 'cardProduct');
  push('Status', 'status');
  push('Channel', 'channel');
  push('Type', 'consentType');
  push('Document', 'documentType');
  push('Reason', 'reason');

  if (parts.length) return parts.join(' · ');

  // Nothing recognised — say so rather than rendering an empty line or dumping
  // the whole payload into the UI.
  return Object.keys(p).length ? 'See event payload for details.' : 'No further detail recorded.';
}

/** The acting user, when the emitter recorded one. */
export function actorFromEvent(payload: unknown, metadata: unknown): string {
  const p = asRecord(payload);
  const m = asRecord(metadata);

  for (const source of [p, m]) {
    for (const key of ['actorName', 'createdBy', 'actorId', 'userId', 'submittedBy']) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }

  // Events emitted by background processing have no user behind them.
  const source = m['source'];
  if (typeof source === 'string' && source.trim()) return source;

  return 'System';
}

export function toTimelineEvent(event: ApiLedgerEvent): TimelineEvent {
  const eventType = event.eventType ?? 'unknown';
  return {
    id: event.id,
    event_type: eventType,
    title: titleFromEventType(eventType),
    detail: detailFromPayload(event.payload),
    actor: actorFromEvent(event.payload, event.metadata),
    timestamp: event.publishedAt ?? '',
  };
}

/**
 * The API returns a bare array. Accept the `{ events: [] }` wrapper too, so a
 * shape change on either side degrades to an empty timeline rather than a
 * crash.
 */
export function toTimelineEvents(data: unknown): TimelineEvent[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)['events'])
      ? (asRecord(data)['events'] as unknown[])
      : [];

  return rows
    .filter((row): row is ApiLedgerEvent => !!row && typeof row === 'object' && 'id' in row)
    .map(toTimelineEvent);
}

export function formatRelativeTime(isoDate: string): string {
  if (!isoDate) return 'unknown time';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'unknown time';

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
}
