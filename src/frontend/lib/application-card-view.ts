// ============================================================
// CapitalForge — Applications pipeline board mapping
//
// The board used to seed its state with ten sample applications and then do
// `setApps(res.data as ApplicationCard[])` on load. The cast was unchecked and
// wrong: real rows carry no advisor, no consent status and no daysInStatus, so
// the first real render threw on `advisor.split(' ')` and the whole page fell
// over to the error boundary. Signed out, the fetch failed, the catch kept the
// samples, and the board looked healthy — which is why it went unnoticed.
//
// Everything here is derived from fields the API actually returns, and what it
// does not return is null rather than invented.
// ============================================================

// Relative, matching the other lib modules: the backend's tsconfig compiles
// this file too and does not resolve the `@/` alias.
import type { ApplicationStatus } from '../../shared/types';

export type { ApplicationStatus };

/** Consent is a compliance signal, so "not recorded" is its own state. */
export type ConsentStatus = 'complete' | 'missing' | 'unknown';

export interface ApplicationCardView {
  id: string;
  businessId: string;
  businessName: string;
  issuer: string;
  cardProduct: string;
  status: ApplicationStatus;
  requestedLimit: number | null;
  approvedLimit: number | null;
  roundNumber: number | null;
  /** Days since the application last changed state; null with no timestamp. */
  daysInStatus: number | null;
  consentStatus: ConsentStatus;
  /** Null when no advisor is assigned to the client. */
  advisor: string | null;
  /** ISO timestamp the application was created. */
  createdAt: string | null;
  /**
   * Classified from the issuer name, which is the only signal the list
   * endpoint carries. Deterministic and explainable rather than guessed: the
   * board shows a CU badge, and issuers are stored under their full legal
   * names ("Navy Federal Credit Union").
   */
  issuer_type: 'bank' | 'credit_union';
}

/** Credit unions are identifiable from their name; nothing else distinguishes them here. */
function classifyIssuer(issuer: string): 'bank' | 'credit_union' {
  return /credit union/i.test(issuer) ? 'credit_union' : 'bank';
}

const STATUSES = new Set<ApplicationStatus>([
  'draft',
  'pending_consent',
  'submitted',
  'approved',
  'declined',
  'reconsideration',
]);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * An unrecognised status becomes 'draft' — the least consequential column —
 * rather than being dropped, so a row never disappears from the board silently.
 */
export function toStatus(raw: unknown): ApplicationStatus {
  const value = str(raw).toLowerCase();
  return STATUSES.has(value as ApplicationStatus) ? (value as ApplicationStatus) : 'draft';
}

/**
 * Whole days since `iso`, or null if there is no usable date.
 *
 * `now` is injected so the value is testable and so every card on one render
 * is measured from the same instant.
 */
export function daysSince(iso: unknown, now: Date): number | null {
  const raw = str(iso);
  if (raw === '') return null;

  const then = new Date(raw);
  if (Number.isNaN(then.getTime())) return null;

  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  // A future timestamp is bad data, not "-3 days in status".
  return days < 0 ? null : days;
}

export function toApplicationCard(row: unknown, now: Date): ApplicationCardView | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === '') return null;

  const status = toStatus(r['status']);

  // The date the card entered its current state, best available.
  const enteredStatusAt =
    status === 'approved' || status === 'declined'
      ? (r['decidedAt'] ?? r['updatedAt'])
      : status === 'submitted' || status === 'reconsideration'
        ? (r['submittedAt'] ?? r['updatedAt'])
        : (r['updatedAt'] ?? r['createdAt']);

  const approved = num(r['approvedLimit']);

  return {
    id,
    businessId: str(r['businessId']),
    businessName: str(r['businessName'], 'Unknown client'),
    issuer: str(r['issuer'], 'Unknown issuer'),
    cardProduct: str(r['cardProduct'], 'Unspecified card'),
    status,
    requestedLimit: num(r['requestedLimit']),
    // Only approved applications have an approved limit; anything else would
    // be reporting a decision that has not been made.
    approvedLimit: status === 'approved' ? approved : null,
    roundNumber: num(r['roundNumber']),
    daysInStatus: daysSince(enteredStatusAt, now),
    // No field at all means unknown. Absence of a consent record and a consent
    // that was never checked are different claims, and only one is safe.
    consentStatus:
      r['consentCapturedAt'] === undefined
        ? 'unknown'
        : str(r['consentCapturedAt']) !== ''
          ? 'complete'
          : 'missing',
    advisor: str(r['advisorName']) === '' ? null : str(r['advisorName']),
    createdAt: str(r['createdAt']) === '' ? null : str(r['createdAt']),
    issuer_type: classifyIssuer(str(r['issuer'])),
  };
}

export function toApplicationCards(data: unknown, now: Date = new Date()): ApplicationCardView[] {
  const rows = Array.isArray(data)
    ? data
    : // The list endpoint can group by status for the kanban view.
      Object.values(asRecord(data)).flatMap((v) => (Array.isArray(v) ? v : []));

  return rows
    .map((row) => toApplicationCard(row, now))
    .filter((card): card is ApplicationCardView => card !== null);
}

/** Initials for an avatar, or null when nobody is assigned. */
export function advisorInitials(name: string | null): string | null {
  if (name === null) return null;
  const initials = name
    .split(' ')
    .filter((part) => part !== '')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return initials === '' ? null : initials;
}

// ── Pipeline figures ────────────────────────────────────────

export interface PipelineSummary {
  total: number;
  /**
   * Credit still in play. Declined applications are excluded: refused credit
   * is not pipeline, and counting it overstated the board by the value of
   * every application an issuer had already turned down.
   */
  pipelineValue: number;
  /** How many applications contributed an amount to pipelineValue. */
  pipelineBasedOn: number;
  /**
   * Applications still open — the pool pipelineValue is drawn from. The
   * comparison that matters is pipelineBasedOn against this, not against
   * total: a declined application is left out because it was declined, not
   * because it carries no amount.
   */
  liveCount: number;
  /**
   * Credit actually approved — from approvedLimit alone. This used to fall
   * back to the requested limit, which reported what was asked for as what
   * was granted.
   */
  approvedValue: number;
  approvedBasedOn: number;
  /** Approved as a share of decided. Null until something has been decided. */
  approvalRate: number | null;
  decidedCount: number;
  /** Mean days in status, over the applications whose age is known. */
  avgDaysInStatus: number | null;
  agedCount: number;
}

/** Applications an issuer has finished with, one way or the other. */
const DECIDED = new Set<ApplicationStatus>(['approved', 'declined']);

export function summarisePipeline(cards: ApplicationCardView[]): PipelineSummary {
  const live = cards.filter((c) => c.status !== 'declined');
  const withAmount = live.filter((c) => c.requestedLimit !== null || c.approvedLimit !== null);

  const approvedCards = cards.filter((c) => c.status === 'approved');
  const approvedWithLimit = approvedCards.filter((c) => c.approvedLimit !== null);

  const decided = cards.filter((c) => DECIDED.has(c.status));
  const aged = cards.filter((c) => c.daysInStatus !== null);

  return {
    total: cards.length,
    pipelineValue: withAmount.reduce(
      (sum, c) => sum + (c.approvedLimit ?? c.requestedLimit ?? 0),
      0,
    ),
    pipelineBasedOn: withAmount.length,
    liveCount: live.length,
    approvedValue: approvedWithLimit.reduce((sum, c) => sum + (c.approvedLimit ?? 0), 0),
    approvedBasedOn: approvedWithLimit.length,
    // Null, not 0. A board where nothing has been decided has no approval
    // rate; "0%" reads as "we approve nothing".
    approvalRate:
      decided.length === 0
        ? null
        : (approvedCards.length / decided.length) * 100,
    decidedCount: decided.length,
    // Null for the same reason: counting an unknown age as zero pulls the
    // average towards "same day" for records that carry no timestamp.
    avgDaysInStatus:
      aged.length === 0
        ? null
        : aged.reduce((sum, c) => sum + (c.daysInStatus ?? 0), 0) / aged.length,
    agedCount: aged.length,
  };
}
