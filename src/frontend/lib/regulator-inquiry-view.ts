// ============================================================
// CapitalForge — Regulator inquiry view mapping
//
// GET /api/regulator/inquiries returns { inquiries, total, page, pageSize }.
// The complaints page rendered four hard-coded inquiries instead: CFPB-2026-00341,
// FTC-26-8812 and two others, with attachment counts that came from nowhere.
// They never changed, and "+ Log Inquiry" had no handler at all, so nothing a
// user did could add to or alter that list.
//
// The API carries a real deadline calculation (deadlineStatus), so urgency is
// read from the response rather than recomputed here from a date — two clocks
// disagreeing about whether a regulator response is overdue is worse than one.
// ============================================================

export type MatterType = 'FTC' | 'CFPB' | 'state_AG' | 'audit';
export type InquirySeverity = 'routine' | 'elevated' | 'critical';
export type InquiryStatus =
  | 'open'
  | 'legal_hold'
  | 'response_drafted'
  | 'response_submitted'
  | 'closed';

export interface InquiryView {
  id: string;
  matterType: MatterType;
  agencyName: string;
  /** Null when the agency has not issued one. */
  referenceNumber: string | null;
  description: string;
  severity: InquirySeverity;
  status: InquiryStatus;
  /** Null when no response deadline has been set. */
  responseDueDate: string | null;
  /** Null when there is no deadline to count against — not zero. */
  daysUntilDeadline: number | null;
  isOverdue: boolean;
  assignedCounsel: string | null;
  createdAt: string | null;
}

const MATTER_TYPES = new Set<MatterType>(['FTC', 'CFPB', 'state_AG', 'audit']);
const SEVERITIES = new Set<InquirySeverity>(['routine', 'elevated', 'critical']);
const STATUSES = new Set<InquiryStatus>([
  'open',
  'legal_hold',
  'response_drafted',
  'response_submitted',
  'closed',
]);

/** How each matter type and status reads on screen. */
export const MATTER_TYPE_LABELS: Record<MatterType, string> = {
  FTC: 'FTC',
  CFPB: 'CFPB',
  state_AG: 'State AG',
  audit: 'Audit',
};

export const STATUS_LABELS: Record<InquiryStatus, string> = {
  open: 'Open',
  legal_hold: 'Legal Hold',
  response_drafted: 'Response Drafted',
  response_submitted: 'Response Submitted',
  closed: 'Closed',
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toInquiryView(row: unknown): InquiryView | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === null) return null;

  const deadline = asRecord(r['deadlineStatus']);

  const matterType = str(r['matterType']);
  const severity = str(r['severity']);
  const status = str(r['status']);

  return {
    id,
    // An unrecognised value falls back to the least specific option rather
    // than dropping the row: an inquiry missing from the list is worse than
    // one shown under a general heading.
    matterType: matterType && MATTER_TYPES.has(matterType as MatterType)
      ? (matterType as MatterType)
      : 'audit',
    agencyName: str(r['agencyName']) ?? 'Unnamed agency',
    referenceNumber: str(r['referenceNumber']),
    description: str(r['description']) ?? '',
    severity: severity && SEVERITIES.has(severity as InquirySeverity)
      ? (severity as InquirySeverity)
      : 'routine',
    status: status && STATUSES.has(status as InquiryStatus) ? (status as InquiryStatus) : 'open',
    responseDueDate: str(r['responseDueDate']),
    // Taken from the API rather than derived from responseDueDate here.
    daysUntilDeadline: num(deadline['daysUntilDeadline']),
    isOverdue: deadline['isOverdue'] === true,
    assignedCounsel: str(r['assignedCounsel']),
    createdAt: str(r['createdAt']),
  };
}

export function toInquiryViews(data: unknown): InquiryView[] {
  const d = asRecord(data);
  const rows = Array.isArray(d['inquiries'])
    ? d['inquiries']
    : // The endpoint wraps its list; a bare array is accepted too so a caller
      // passing `data.inquiries` directly still works.
      Array.isArray(data)
      ? data
      : [];

  return rows.map(toInquiryView).filter((i): i is InquiryView => i !== null);
}

/** Deadline wording, or an explicit note that none was set. */
export function deadlineLabel(inquiry: InquiryView): string {
  if (inquiry.daysUntilDeadline === null) return 'No response deadline set';
  if (inquiry.isOverdue) {
    const overdueBy = Math.abs(inquiry.daysUntilDeadline);
    return `Overdue by ${overdueBy} day${overdueBy === 1 ? '' : 's'}`;
  }
  if (inquiry.daysUntilDeadline === 0) return 'Response due today';
  return `${inquiry.daysUntilDeadline} day${inquiry.daysUntilDeadline === 1 ? '' : 's'} to respond`;
}
