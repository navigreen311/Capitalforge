// ============================================================
// CapitalForge — Complaint view mapping
//
// GET /api/complaints returns { complaints, total, page, pageSize }. The page
// rendered a fixed array of eight complaints instead, and its "Log Complaint"
// form pushed into local state that vanished on reload.
//
// The page's vocabulary was wider than the model's and could not round-trip:
//
//   * Eight categories (Fair Lending, Product Mismatch, Advisor Conduct …)
//     against the API's five. Mapping the extras onto `compliance` would have
//     silently changed a user's chosen category on save and lost it on read.
//     The API's five are authoritative here, and `subcategory` — which the API
//     accepts and stores — carries the finer label without inventing a mapping.
//
//   * Five statuses including "Escalated", which is not a status in the model
//     at all: escalation is a separate `escalatedTo` field. Treating it as a
//     status meant a change to it either failed or landed as something else.
//     Escalation is now read from `escalatedTo`, where it lives.
//
// Severity maps one to one, so it is passed through.
// ============================================================

export type ComplaintCategory =
  | 'billing'
  | 'service'
  | 'unauthorized_debit'
  | 'compliance'
  | 'other';

export type ComplaintSource =
  | 'portal'
  | 'email'
  | 'phone'
  | 'regulator_referral'
  | 'legal'
  | 'other';

export type ComplaintSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ComplaintStatus = 'open' | 'investigating' | 'resolved' | 'closed';

export interface ComplaintView {
  id: string;
  /** Null when the complaint is not tied to a client, or the client is gone. */
  clientName: string | null;
  businessId: string | null;
  category: ComplaintCategory;
  /** The finer label, when one was recorded. */
  subcategory: string | null;
  source: ComplaintSource;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  description: string;
  evidenceDocIds: string[];
  rootCause: string | null;
  resolution: string | null;
  assignedTo: string | null;
  /** Non-null when the complaint has been escalated to someone. */
  escalatedTo: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
}

const CATEGORIES = new Set<ComplaintCategory>([
  'billing',
  'service',
  'unauthorized_debit',
  'compliance',
  'other',
]);
const SOURCES = new Set<ComplaintSource>([
  'portal',
  'email',
  'phone',
  'regulator_referral',
  'legal',
  'other',
]);
const SEVERITIES = new Set<ComplaintSeverity>(['low', 'medium', 'high', 'critical']);
const STATUSES = new Set<ComplaintStatus>(['open', 'investigating', 'resolved', 'closed']);

export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  billing: 'Billing',
  service: 'Service',
  unauthorized_debit: 'Unauthorized Debit',
  compliance: 'Compliance',
  other: 'Other',
};

export const SOURCE_LABELS: Record<ComplaintSource, string> = {
  portal: 'Portal',
  email: 'Email',
  phone: 'Phone',
  regulator_referral: 'Regulator Referral',
  legal: 'Legal',
  other: 'Other',
};

export const SEVERITY_LABELS: Record<ComplaintSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Open',
  investigating: 'In Review',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** Response-time targets by severity, in days. */
export const SLA_DAYS: Record<ComplaintSeverity, number> = {
  critical: 5,
  high: 10,
  medium: 20,
  low: 30,
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function toComplaintView(row: unknown): ComplaintView | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === null) return null;

  const category = str(r['category']);
  const source = str(r['source']);
  const severity = str(r['severity']);
  const status = str(r['status']);

  return {
    id,
    clientName: str(r['businessName']),
    businessId: str(r['businessId']),
    // Unrecognised values land in 'other' rather than dropping the row: a
    // complaint missing from the register is worse than one filed loosely.
    category: category && CATEGORIES.has(category as ComplaintCategory)
      ? (category as ComplaintCategory)
      : 'other',
    subcategory: str(r['subcategory']),
    source: source && SOURCES.has(source as ComplaintSource)
      ? (source as ComplaintSource)
      : 'other',
    severity: severity && SEVERITIES.has(severity as ComplaintSeverity)
      ? (severity as ComplaintSeverity)
      : 'medium',
    status: status && STATUSES.has(status as ComplaintStatus)
      ? (status as ComplaintStatus)
      : 'open',
    description: str(r['description']) ?? '',
    evidenceDocIds: Array.isArray(r['evidenceDocIds'])
      ? r['evidenceDocIds'].filter((d): d is string => typeof d === 'string')
      : [],
    rootCause: str(r['rootCause']),
    resolution: str(r['resolution']),
    assignedTo: str(r['assignedTo']),
    escalatedTo: str(r['escalatedTo']),
    createdAt: str(r['createdAt']),
    resolvedAt: str(r['resolvedAt']),
  };
}

export function toComplaintViews(data: unknown): ComplaintView[] {
  const d = asRecord(data);
  const rows = Array.isArray(d['complaints'])
    ? d['complaints']
    : Array.isArray(data)
      ? data
      : [];
  return rows.map(toComplaintView).filter((c): c is ComplaintView => c !== null);
}

/** True once the complaint has been escalated to someone. */
export function isEscalated(complaint: ComplaintView): boolean {
  return complaint.escalatedTo !== null;
}

/**
 * The date a response is due, or null when the complaint carries no creation
 * date — an SLA counted from an unknown start is not a deadline.
 */
export function slaDueDate(complaint: ComplaintView): Date | null {
  if (complaint.createdAt === null) return null;
  const created = new Date(complaint.createdAt);
  if (Number.isNaN(created.getTime())) return null;

  const due = new Date(created);
  due.setDate(due.getDate() + SLA_DAYS[complaint.severity]);
  return due;
}

/**
 * Days until the response is due, measured from `now` so every row on one
 * render shares an instant. Null when there is no usable start date.
 */
export function slaDaysRemaining(complaint: ComplaintView, now: Date): number | null {
  const due = slaDueDate(complaint);
  if (due === null) return null;
  return Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
}

// ── Analytics ───────────────────────────────────────────────

export interface RootCauseSlice {
  category: string;
  count: number;
  pct: number;
}

export interface ComplaintAnalyticsView {
  totalComplaints: number;
  openCritical: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  /** Empty until complaints have a root cause recorded — not a fixed list. */
  topRootCauses: RootCauseSlice[];
  /** Null until at least one complaint has been resolved. */
  averageResolutionDays: number | null;
}

function counts(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(asRecord(value))) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
  }
  return out;
}

export function toAnalyticsView(data: unknown): ComplaintAnalyticsView {
  const d = asRecord(data);

  const rawCauses = Array.isArray(d['topRootCauses']) ? d['topRootCauses'] : [];
  const parsed = rawCauses
    .map(asRecord)
    .map((c) => ({
      category: str(c['rootCause']) ?? str(c['category']) ?? 'Unspecified',
      count: typeof c['count'] === 'number' ? c['count'] : 0,
    }))
    .filter((c) => c.count > 0);

  const causeTotal = parsed.reduce((sum, c) => sum + c.count, 0);

  return {
    totalComplaints: typeof d['totalComplaints'] === 'number' ? d['totalComplaints'] : 0,
    openCritical: typeof d['openCritical'] === 'number' ? d['openCritical'] : 0,
    byStatus: counts(d['byStatus']),
    bySeverity: counts(d['bySeverity']),
    // Percentages are computed from the counts returned, so a partial list
    // does not silently sum to 100.
    topRootCauses: parsed.map((c) => ({
      ...c,
      pct: causeTotal === 0 ? 0 : Math.round((c.count / causeTotal) * 100),
    })),
    averageResolutionDays:
      typeof d['averageResolutionDays'] === 'number' ? d['averageResolutionDays'] : null,
  };
}

/** Complaints still requiring work, by the API's own status vocabulary. */
export function openCount(analytics: ComplaintAnalyticsView): number {
  return (analytics.byStatus['open'] ?? 0) + (analytics.byStatus['investigating'] ?? 0);
}

/** Resolved within the trailing window, or null when nothing is resolved. */
export function resolvedWithin(complaints: ComplaintView[], days: number, now: Date): number {
  const cutoff = now.getTime() - days * 86_400_000;
  return complaints.filter((c) => {
    if (c.resolvedAt === null) return false;
    const at = new Date(c.resolvedAt).getTime();
    return !Number.isNaN(at) && at >= cutoff;
  }).length;
}
