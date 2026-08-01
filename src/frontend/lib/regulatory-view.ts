// ============================================================
// CapitalForge — Regulatory intelligence mapping
//
// The regulatory page called nothing. It held six regulatory alerts with
// impact scores, five funds-flow rows with daily volumes ("$2.4M/day"), six
// AML readiness pillar scores, and — the part that matters most — a table of
// state lending licences with numbers and expiry dates:
//
//   CA  Commercial Financing License   CFL-60DX-2024   active   2027-06-30
//   NY  Premium Finance Agency         PFA-NY-0441     active   2026-12-31
//   IL  Retail Installment Sales Act   RISA-IL-0772    expired  2025-12-31
//
// None of those licences exist. Nothing in the schema records a licence held,
// its number or its expiry, and no endpoint returns one. Lending into a state
// without the licence it requires is not a reporting problem, so a register
// that says you hold one is the worst thing on the page.
//
// What the API does have, now that its router is mounted:
//   GET  /api/regulatory/alerts              — rule changes and their impact
//   POST /api/regulatory/alerts/:id/review   — record a review decision
//   GET  /api/regulatory/impact/:ruleId      — assessment for one rule
//   GET  /api/funds-flow/classifications     — how money moves, per workflow
//   GET  /api/funds-flow/licensing-status    — workflows escalated for review
//
// Licensing here means "which workflows need a licensing question answered",
// which is a different claim from "which licences we hold", and is the one
// the system can actually make.
// ============================================================

export type AlertStatus = 'new' | 'under_review' | 'resolved' | 'dismissed';

export type AlertSource =
  | 'FTC'
  | 'CFPB'
  | 'State_AG'
  | 'Visa'
  | 'Mastercard'
  | 'OCC'
  | 'FDIC'
  | 'FRB'
  | 'FinCEN'
  | 'State_DFS';

export type Urgency = 'low' | 'medium' | 'high' | 'critical';

export interface RegulatoryAlertRow {
  id: string;
  source: AlertSource | string;
  ruleType: string;
  title: string;
  summary: string;
  /** Null when the source published no score — not 0, which sorts as harmless. */
  impactScore: number | null;
  affectedModules: string[];
  status: AlertStatus;
  effectiveDate: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
}

export interface FundsFlowRow {
  id: string;
  workflowName: string;
  classification: string;
  riskBasis: string | null;
  regulatoryFramework: string | null;
  legalOpinionRef: string | null;
  status: string;
  /** Derived by the classifier, not stored input. */
  processorRole: string | null;
  licensingStatus: string | null;
  moneyTransmissionAlert: boolean;
  updatedAt: string | null;
}

export interface LicensingEscalationRow {
  workflowId: string;
  workflowName: string;
  classification: string;
  licensingStatus: string;
  affectedStates: string[];
  urgency: Urgency;
  escalationReason: string;
  counselReferralRequired: boolean;
}

export interface ImpactAssessment {
  ruleId: string;
  impactScore: number | null;
  affectedModules: string[];
  rationale: string;
  urgency: Urgency;
  recommendedActions: string[];
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
 * A Json column read as a list of strings.
 *
 * `affectedModules` is a Json column, so it holds whatever was written to it.
 * Casting it and mapping over it is how the credit roadmap came to answer 500
 * with "tradelines is not iterable"; this checks instead.
 */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

const STATUSES = new Set<string>(['new', 'under_review', 'resolved', 'dismissed']);

export function toAlertStatus(raw: unknown): AlertStatus {
  const s = (str(raw) ?? '').toLowerCase();
  // Unrecognised becomes 'new' — needing attention — rather than 'resolved',
  // which would quietly clear an alert nobody has looked at.
  return STATUSES.has(s) ? (s as AlertStatus) : 'new';
}

const URGENCIES = new Set<string>(['low', 'medium', 'high', 'critical']);

export function toUrgency(raw: unknown): Urgency {
  const s = (str(raw) ?? '').toLowerCase();
  return URGENCIES.has(s) ? (s as Urgency) : 'low';
}

export function toRegulatoryAlert(row: unknown): RegulatoryAlertRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === null) return null;

  return {
    id,
    source: str(r['source']) ?? 'Unknown source',
    ruleType: str(r['ruleType']) ?? 'unspecified',
    title: str(r['title']) ?? 'Untitled rule change',
    summary: str(r['summary']) ?? '',
    impactScore: num(r['impactScore']),
    affectedModules: stringList(r['affectedModules']),
    status: toAlertStatus(r['status']),
    effectiveDate: str(r['effectiveDate']),
    reviewedBy: str(r['reviewedBy']),
    reviewedAt: str(r['reviewedAt']),
    createdAt: str(r['createdAt']),
  };
}

export function toRegulatoryAlerts(data: unknown): RegulatoryAlertRow[] {
  const list = Array.isArray(data) ? data : asRecord(data)['alerts'];
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => toRegulatoryAlert(row))
    .filter((row): row is RegulatoryAlertRow => row !== null);
}

export function toFundsFlowRow(row: unknown): FundsFlowRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === null) return null;

  return {
    id,
    workflowName: str(r['workflowName']) ?? 'Unnamed workflow',
    classification: str(r['classification']) ?? 'unclassified',
    riskBasis: str(r['riskBasis']),
    regulatoryFramework: str(r['regulatoryFramework']),
    legalOpinionRef: str(r['legalOpinionRef']),
    status: str(r['status']) ?? 'active',
    processorRole: str(r['processorRole']),
    licensingStatus: str(r['licensingStatus']),
    moneyTransmissionAlert: r['moneyTransmissionAlert'] === true,
    updatedAt: str(r['updatedAt']),
  };
}

export function toFundsFlowRows(data: unknown): FundsFlowRow[] {
  const list = Array.isArray(data) ? data : asRecord(data)['classifications'];
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => toFundsFlowRow(row))
    .filter((row): row is FundsFlowRow => row !== null);
}

export function toLicensingEscalations(data: unknown): LicensingEscalationRow[] {
  const list = Array.isArray(data) ? data : asRecord(data)['escalations'];
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry) => {
    const e = asRecord(entry);
    const id = str(e['workflowId']);
    if (id === null) return [];
    return [
      {
        workflowId: id,
        workflowName: str(e['workflowName']) ?? 'Unnamed workflow',
        classification: str(e['classification']) ?? 'unclassified',
        licensingStatus: str(e['licensingStatus']) ?? 'unknown',
        affectedStates: stringList(e['affectedStates']),
        urgency: toUrgency(e['urgency']),
        escalationReason: str(e['escalationReason']) ?? '',
        counselReferralRequired: e['counselReferralRequired'] === true,
      },
    ];
  });
}

export function toImpactAssessment(data: unknown): ImpactAssessment | null {
  const d = asRecord(data);
  const ruleId = str(d['ruleId']);
  if (ruleId === null) return null;

  return {
    ruleId,
    impactScore: num(d['impactScore']),
    affectedModules: stringList(d['affectedModules']),
    rationale: str(d['rationale']) ?? '',
    urgency: toUrgency(d['urgency']),
    recommendedActions: stringList(d['recommendedActions']),
  };
}

// ── Derived ─────────────────────────────────────────────────

/**
 * Impact band from the score.
 *
 * Null in, null out. The page used to colour an alert by a score it always
 * had, because the score was written into the page; a real alert can arrive
 * without one, and rendering that as 0/low says the regulator's change is
 * harmless when nobody has assessed it.
 */
export function impactBand(score: number | null): Urgency | null {
  if (score === null) return null;
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export interface AlertSummary {
  total: number;
  needingReview: number;
  /** Highest impact score among alerts not yet resolved or dismissed. */
  highestOpenScore: number | null;
  /** How many open alerts carry no score, so the highest is known to be partial. */
  openWithoutScore: number;
}

export function summariseAlerts(alerts: RegulatoryAlertRow[]): AlertSummary {
  const open = alerts.filter((a) => a.status === 'new' || a.status === 'under_review');
  const scored = open.filter((a) => a.impactScore !== null);

  return {
    total: alerts.length,
    needingReview: open.filter((a) => a.status === 'new').length,
    highestOpenScore:
      scored.length === 0 ? null : Math.max(...scored.map((a) => a.impactScore as number)),
    openWithoutScore: open.length - scored.length,
  };
}

/** Workflows whose money movement has not been settled yet. */
export function unresolvedFlows(rows: FundsFlowRow[]): FundsFlowRow[] {
  return rows.filter((r) => r.status !== 'active' || r.moneyTransmissionAlert);
}

/** Snake case and SCREAMING_CASE to words, for values the API sends as keys. */
export function humanise(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}

// ── Feed helpers ────────────────────────────────────────────

/**
 * The distinct values present, for building filter controls.
 *
 * Derived from the alerts actually loaded rather than from a fixed list. The
 * compliance feed hardcoded its filters — six states and seven rule types —
 * so a filter could offer a value no alert had, and an alert could arrive
 * with a value no filter could reach.
 */
export function facetsOf(alerts: RegulatoryAlertRow[]): {
  sources: string[];
  ruleTypes: string[];
} {
  const sources = new Set<string>();
  const ruleTypes = new Set<string>();

  for (const a of alerts) {
    if (a.source.trim() !== '') sources.add(a.source);
    if (a.ruleType.trim() !== '') ruleTypes.add(a.ruleType);
  }

  return {
    sources: [...sources].sort(),
    ruleTypes: [...ruleTypes].sort(),
  };
}

/**
 * Newest first, by the date the rule takes effect.
 *
 * Alerts with no effective date sort last rather than being treated as very
 * old or very new — an undated rule change is not a stale one.
 */
export function byEffectiveDateDesc(alerts: RegulatoryAlertRow[]): RegulatoryAlertRow[] {
  const time = (row: RegulatoryAlertRow): number | null => {
    if (row.effectiveDate === null) return null;
    const t = new Date(row.effectiveDate).getTime();
    return Number.isNaN(t) ? null : t;
  };

  return [...alerts].sort((a, b) => {
    const ta = time(a);
    const tb = time(b);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });
}
