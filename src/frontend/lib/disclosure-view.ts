// ============================================================
// CapitalForge — Disclosure CMS mapping
//
// The disclosures page held nine templates as literals, each with a version
// number, an author, and an approvedBy of "CCO" or "GC":
//
//   Adverse Action Notice   v1.5   Approved   approvedBy: GC
//   ECOA Rights — English   v2.1   Approved   approvedBy: CCO
//   FCRA Summary of Rights  v2.0   Approved   approvedBy: CCO
//
// Those are approval records. A disclosure is the text a client is handed to
// satisfy a legal obligation, and "approved by the CCO" is the assertion that
// somebody accountable signed it off. Nobody had. It also offered "Send to N
// Clients" with delivery-channel checkboxes and no endpoint behind it, on
// text whose delivery is itself the compliance act.
//
// The CMS behind this exists and is mounted:
//   GET  /api/disclosures/templates              — list, filterable
//   POST /api/disclosures/templates              — create a draft
//   GET  /api/disclosures/templates/:id/history  — versions of one template
//   POST /api/disclosures/templates/:id/submit   — draft → pending review
//   POST /api/disclosures/templates/:id/approve  — records who approved it
//   POST /api/disclosures/render                 — fill a template's variables
//
// Its vocabulary is not the page's. The page invented seven categories — APR
// & Fees, ECOA Rights, FCRA Summary, Privacy Notice, Adverse Action, Truth in
// Lending, UDAAP Statement — and the API has nine different ones. None
// overlap. The API's are used here.
// ============================================================

/** Categories the API defines. The page's seven were its own. */
export const DISCLOSURE_CATEGORIES = [
  'funding_agreement',
  'credit_stacking',
  'fee_schedule',
  'risk_acknowledgment',
  'personal_guarantee',
  'arbitration_notice',
  'state_specific',
  'federal',
  'cu_membership',
] as const;

export type DisclosureCategory = (typeof DISCLOSURE_CATEGORIES)[number];

/**
 * Lifecycle as the API reports it.
 *
 * The page had four — Draft, Pending Approval, Approved, Deprecated — which
 * is nearly this but collapses rejected and superseded into one, so a
 * template rejected at review and one replaced by a newer version looked the
 * same. They are different facts about whether the text may be used.
 */
export const TEMPLATE_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'superseded',
] as const;

export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
}

export interface DisclosureTemplateRow {
  id: string;
  name: string;
  /** 'FEDERAL' or a two-letter state. */
  state: string;
  category: DisclosureCategory | string;
  version: string;
  content: string;
  status: TemplateStatus;
  /**
   * Whether this template may be rendered and issued. The render endpoint
   * refuses anything else, which is the control the old page rendered around.
   */
  isActive: boolean;
  effectiveDate: string | null;
  /** Null until somebody approves it. Never a role name standing in for one. */
  approvedBy: string | null;
  approvedAt: string | null;
  variables: TemplateVariable[];
  updatedAt: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

const STATUSES = new Set<string>(TEMPLATE_STATUSES);

/**
 * An unrecognised status becomes 'draft'.
 *
 * Never 'approved': that is the one value which says the text may be issued
 * to a client, and it must come from a recorded approval, not from a fallback.
 */
export function toTemplateStatus(raw: unknown): TemplateStatus {
  const s = (str(raw) ?? '').toLowerCase();
  return STATUSES.has(s) ? (s as TemplateStatus) : 'draft';
}

function toVariables(value: unknown): TemplateVariable[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const e = asRecord(entry);
    const name = str(e['name']);
    if (name === null) return [];
    return [
      {
        name,
        description: str(e['description']) ?? '',
        // Absent means not required — the safer reading, since marking a
        // variable required blocks rendering a template that is fine.
        required: e['required'] === true,
      },
    ];
  });
}

export function toDisclosureTemplate(row: unknown): DisclosureTemplateRow | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === null) return null;

  return {
    id,
    name: str(r['name']) ?? 'Untitled disclosure',
    state: str(r['state']) ?? 'UNKNOWN',
    category: str(r['category']) ?? 'unspecified',
    version: str(r['version']) ?? '—',
    content: str(r['content']) ?? '',
    status: toTemplateStatus(r['status']),
    isActive: r['isActive'] === true,
    effectiveDate: str(r['effectiveDate']),
    approvedBy: str(r['approvedBy']),
    approvedAt: str(r['approvedAt']),
    variables: toVariables(r['variables']),
    updatedAt: str(r['updatedAt']),
  };
}

export function toDisclosureTemplates(data: unknown): DisclosureTemplateRow[] {
  const list = Array.isArray(data) ? data : asRecord(data)['data'];
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => toDisclosureTemplate(row))
    .filter((row): row is DisclosureTemplateRow => row !== null);
}

// ── Derived ─────────────────────────────────────────────────

/**
 * Whether this template can be rendered for a client.
 *
 * Both conditions, because the API requires both: a template can be approved
 * and later deactivated. Returning a reason rather than a boolean so the page
 * can say why the action is unavailable instead of just disabling it.
 */
export function renderability(
  template: DisclosureTemplateRow,
): { canRender: true } | { canRender: false; reason: string } {
  if (template.status !== 'approved') {
    return {
      canRender: false,
      reason:
        template.status === 'rejected'
          ? 'This version was rejected at review and cannot be issued.'
          : template.status === 'superseded'
            ? 'This version has been superseded. Use the current one.'
            : 'Not approved yet. A disclosure has to be approved before it can be issued.',
    };
  }
  if (!template.isActive) {
    return { canRender: false, reason: 'Approved, but not currently active.' };
  }
  return { canRender: true };
}

/** Which variables a caller still has to supply before rendering. */
export function missingVariables(
  template: DisclosureTemplateRow,
  context: Record<string, string>,
): string[] {
  return template.variables
    .filter((v) => v.required)
    .filter((v) => (context[v.name] ?? '').trim() === '')
    .map((v) => v.name);
}

export interface DisclosureSummary {
  total: number;
  approved: number;
  awaitingReview: number;
  drafts: number;
  /** Approved templates that are not active, so cannot actually be issued. */
  approvedButInactive: number;
}

export function summariseTemplates(rows: DisclosureTemplateRow[]): DisclosureSummary {
  const approved = rows.filter((r) => r.status === 'approved');
  return {
    total: rows.length,
    approved: approved.length,
    awaitingReview: rows.filter((r) => r.status === 'pending_review').length,
    drafts: rows.filter((r) => r.status === 'draft').length,
    approvedButInactive: approved.filter((r) => !r.isActive).length,
  };
}

/** The distinct states and categories present, for filter controls. */
export function templateFacets(rows: DisclosureTemplateRow[]): {
  states: string[];
  categories: string[];
} {
  const states = new Set<string>();
  const categories = new Set<string>();
  for (const r of rows) {
    if (r.state.trim() !== '') states.add(r.state);
    if (String(r.category).trim() !== '') categories.add(String(r.category));
  }
  return { states: [...states].sort(), categories: [...categories].sort() };
}

/** Words in the template body. Counted, not recorded — the page stored a figure. */
export function wordCount(content: string): number {
  const trimmed = content.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

/** Snake case to words, for values the API sends as enum keys. */
export function humanise(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}
