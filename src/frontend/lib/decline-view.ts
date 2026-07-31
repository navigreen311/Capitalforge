// ============================================================
// CapitalForge — Decline Recovery mapping
//
// The recovery board carried its whole dataset in the page component: seven
// DeclineRecord literals, a six-row reapply calendar, a five-row analytics
// series and a list of client names, none of which existed in the database.
// Advancing a stage ran a setTimeout and mutated local state; logging a
// decline pushed onto an array. Everything looked like it worked, and a
// reload put it all back.
//
// Meanwhile eleven endpoints for exactly this were mounted and answering.
//
// This maps what those endpoints return. What they do not carry is null,
// including — especially — reapply eligibility: a decline with no cooldown
// date recorded is unknown, not eligible.
// ============================================================

/** Recovery stages, in the order the workflow moves through them. */
export const RECOVERY_STAGES = [
  'new',
  'letter_sent',
  'recon_call_scheduled',
  'recon_call_completed',
  'reapplication_ready',
  'reapplied',
  'won',
  'lost',
] as const;

export type RecoveryStage = (typeof RECOVERY_STAGES)[number];

/** Reconsideration status as the API records it. */
export type ReconStatus = 'pending' | 'letter_sent' | 'approved' | 'denied';

/**
 * Reason buckets, for the badge. Derived from the free text the issuer gave,
 * so 'unknown' is a real and common answer — an issuer that declines "per
 * internal policy" has told us nothing to classify.
 */
export type ReasonCategory =
  | 'too_many_inquiries'
  | 'insufficient_history'
  | 'high_utilization'
  | 'income_verification'
  | 'velocity'
  | 'internal_policy'
  | 'derogatory_marks'
  | 'unknown';

export interface DeclineRow {
  id: string;
  businessId: string;
  /** Null when the id resolves to no client, rather than a blank name. */
  businessName: string | null;
  applicationId: string | null;
  issuer: string;
  /** From declineReasons.card_name; null when not recorded. */
  cardProduct: string | null;
  /** ISO date of the decline itself, not of the record being written. */
  declinedAt: string | null;
  reasonText: string | null;
  reasonCategory: ReasonCategory;
  /** Null when the issuer gave no figure. */
  requestedLimit: number | null;
  reconStatus: ReconStatus;
  recoveryStage: RecoveryStage;
  /** Null means no cooldown has been recorded — not that there is none. */
  reapplyCooldownDate: string | null;
  resolvedAt: string | null;
  letterGenerated: boolean;
  reconsiderationNotes: string | null;
  adverseActionRaw: string | null;
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

/**
 * Bucket an issuer's free-text reason.
 *
 * Matching is on the text the issuer actually supplied. Anything that does
 * not clearly match stays 'unknown': a decline filed under the wrong reason
 * is worse than one filed under none, because the reason drives which
 * reconsideration argument an advisor makes.
 */
export function toReasonCategory(text: unknown): ReasonCategory {
  const s = (str(text) ?? '').toLowerCase();
  if (s === '') return 'unknown';

  if (/inquir/.test(s)) return 'too_many_inquiries';
  if (/5\/24|velocity|new accounts/.test(s)) return 'velocity';
  if (/utilization|utilisation|revolving/.test(s)) return 'high_utilization';
  if (/income|revenue verif|verif/.test(s)) return 'income_verification';
  if (/thin|insufficient|history|trade line|tradeline/.test(s)) return 'insufficient_history';
  if (/derogator|lien|judgment|judgement|bankrupt|collection|charge-?off/.test(s)) {
    return 'derogatory_marks';
  }
  if (/internal policy|risk policy|policy/.test(s)) return 'internal_policy';
  return 'unknown';
}

const STAGES = new Set<string>(RECOVERY_STAGES);

export function toRecoveryStage(raw: unknown): RecoveryStage {
  const s = (str(raw) ?? '').toLowerCase();
  return STAGES.has(s) ? (s as RecoveryStage) : 'new';
}

const RECON_STATUSES = new Set<string>(['pending', 'letter_sent', 'approved', 'denied']);

export function toReconStatus(raw: unknown): ReconStatus {
  const s = (str(raw) ?? '').toLowerCase();
  return RECON_STATUSES.has(s) ? (s as ReconStatus) : 'pending';
}

export function toDeclineRow(record: unknown): DeclineRow | null {
  const r = asRecord(record);
  const id = str(r['id']);
  if (id === null) return null;

  const reasons = asRecord(r['declineReasons']);
  const reasonText = str(reasons['primary']);

  return {
    id,
    businessId: str(r['businessId']) ?? '',
    businessName: str(r['businessName']),
    applicationId: str(r['applicationId']),
    issuer: str(r['issuer']) ?? 'Unknown issuer',
    cardProduct: str(reasons['card_name']),
    declinedAt: str(reasons['declined_at']),
    reasonText,
    reasonCategory: toReasonCategory(reasonText),
    requestedLimit: num(reasons['requested_limit']),
    reconStatus: toReconStatus(r['reconsiderationStatus']),
    recoveryStage: toRecoveryStage(r['recoveryStage']),
    reapplyCooldownDate: str(r['reapplyCooldownDate']),
    resolvedAt: str(r['resolvedAt']),
    letterGenerated: r['letterGenerated'] === true,
    reconsiderationNotes: str(r['reconsiderationNotes']),
    adverseActionRaw: str(r['adverseActionRaw']),
  };
}

export function toDeclineRows(data: unknown): DeclineRow[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => toDeclineRow(row))
    .filter((row): row is DeclineRow => row !== null);
}

// ── Reapply eligibility ─────────────────────────────────────

export type CooldownState =
  /** A cooldown is recorded and has passed. */
  | { status: 'eligible'; daysRemaining: 0; until: string }
  /** A cooldown is recorded and has not passed yet. */
  | { status: 'waiting'; daysRemaining: number; until: string }
  /** No cooldown date on file. We do not know when reapplying is safe. */
  | { status: 'unknown'; daysRemaining: null; until: null };

/**
 * Reapply eligibility for one decline.
 *
 * The board used to read a null cooldown date as "Eligible Now" — an
 * assertion that reapplying is safe, made from the absence of any record of
 * when it would be. Acting on it means a hard pull and, very likely, a second
 * decline inside the issuer's window. Absent is now its own state.
 *
 * `now` is injected so every row on one render is measured from the same
 * instant; the original compared against a hardcoded 2026-03-31.
 */
export function cooldownState(iso: string | null, now: Date): CooldownState {
  if (iso === null) return { status: 'unknown', daysRemaining: null, until: null };

  const until = new Date(iso);
  if (Number.isNaN(until.getTime())) {
    return { status: 'unknown', daysRemaining: null, until: null };
  }

  const days = Math.ceil((until.getTime() - now.getTime()) / 86_400_000);
  return days <= 0
    ? { status: 'eligible', daysRemaining: 0, until: iso }
    : { status: 'waiting', daysRemaining: days, until: iso };
}

/** Rows whose cooldown has demonstrably passed — never those with none on file. */
export function eligibleToReapply(rows: DeclineRow[], now: Date): DeclineRow[] {
  return rows.filter((r) => {
    if (r.recoveryStage === 'won' || r.recoveryStage === 'lost') return false;
    return cooldownState(r.reapplyCooldownDate, now).status === 'eligible';
  });
}

// ── Stats ───────────────────────────────────────────────────

export interface DeclineStats {
  totalDeclines: number;
  stageCounts: Record<RecoveryStage, number>;
  /** Null until something has been resolved. */
  winRate: number | null;
  wonCount: number;
  lostCount: number;
  /** Null when no resolved record carries usable dates. */
  avgRecoveryDays: number | null;
  avgRecoveryBasedOn: number;
}

export function toDeclineStats(data: unknown): DeclineStats | null {
  const d = asRecord(data);
  const total = num(d['totalDeclines']);
  if (total === null) return null;

  const rawCounts = asRecord(d['stageCounts']);
  const stageCounts = {} as Record<RecoveryStage, number>;
  for (const stage of RECOVERY_STAGES) {
    stageCounts[stage] = num(rawCounts[stage]) ?? 0;
  }

  const won = num(d['wonCount']) ?? 0;
  const lost = num(d['lostCount']) ?? 0;

  return {
    totalDeclines: total,
    stageCounts,
    // Guarded here as well as in the API: a rate over nothing is not 0%.
    winRate: won + lost === 0 ? null : num(d['winRate']),
    wonCount: won,
    lostCount: lost,
    avgRecoveryDays: num(d['avgRecoveryDays']),
    avgRecoveryBasedOn: num(d['avgRecoveryBasedOn']) ?? 0,
  };
}

// ── Analytics ───────────────────────────────────────────────

export interface BreakdownRow {
  label: string;
  total: number;
  won: number;
  lost: number;
  /** Null while nothing in this bucket has been resolved. */
  winRate: number | null;
  /** How many outcomes the rate is drawn from. */
  resolved: number;
}

export interface DeclineAnalytics {
  totalDeclines: number;
  byReason: BreakdownRow[];
  byIssuer: BreakdownRow[];
}

function toBreakdown(data: unknown, labelKey: string): BreakdownRow[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    const e = asRecord(entry);
    const label = str(e[labelKey]);
    if (label === null) return [];
    const won = num(e['won']) ?? 0;
    const lost = num(e['lost']) ?? 0;
    return [
      {
        label,
        total: num(e['total']) ?? 0,
        won,
        lost,
        winRate: won + lost === 0 ? null : num(e['winRate']),
        resolved: won + lost,
      },
    ];
  });
}

export function toDeclineAnalytics(data: unknown): DeclineAnalytics | null {
  const d = asRecord(data);
  const total = num(d['totalDeclines']);
  if (total === null) return null;

  return {
    totalDeclines: total,
    byReason: toBreakdown(d['reasonBreakdown'], 'reason'),
    byIssuer: toBreakdown(d['issuerBreakdown'], 'issuer'),
  };
}

// ── Stage transitions ───────────────────────────────────────

/**
 * The stages that can follow `current`.
 *
 * Won and lost are terminal: the API's resolve endpoint stamps resolvedAt and,
 * for a win, approves the underlying application. Offering a move out of them
 * would suggest that can be undone from here.
 */
export function nextStages(current: RecoveryStage): RecoveryStage[] {
  if (current === 'won' || current === 'lost') return [];

  const order = RECOVERY_STAGES.filter((s) => s !== 'won' && s !== 'lost');
  const idx = order.indexOf(current as (typeof order)[number]);
  const next = idx >= 0 && idx < order.length - 1 ? [order[idx + 1]] : [];
  return [...next, 'won', 'lost'];
}

/** Resolving is a different endpoint from advancing, and a different claim. */
export function isTerminal(stage: RecoveryStage): boolean {
  return stage === 'won' || stage === 'lost';
}
