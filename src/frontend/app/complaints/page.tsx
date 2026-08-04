'use client';

// ============================================================
// /complaints — Complaints Management
// Complaints table, root cause analytics, evidence panel,
// regulator inquiry section with deadline countdown.
// ============================================================

import { useState, useEffect, useMemo, useCallback, type FormEvent } from 'react';
import { fetchAllPages } from '@/lib/fetch-all-pages';
import {
  toComplaintView,
  toComplaintViews,
  toAnalyticsView,
  resolvedWithin,
  slaDueDate,
  CATEGORY_LABELS,
  SOURCE_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS as COMPLAINT_STATUS_LABELS,
  type ComplaintView,
  type ComplaintAnalyticsView,
  type ComplaintCategory,
  type ComplaintSource,
  type ComplaintSeverity,
  type RootCauseSlice,
  toAttachableDocuments,
  formatFileSize,
  type AttachableDocument,
  type ComplaintStatus as ComplaintStatusValue,
} from '@/lib/complaint-view';

/** Slice colours by rank, since the analytics endpoint returns no colour. */
const SLICE_COLORS = ['#ef4444', '#C9A84C', '#f97316', '#3b82f6', '#8b5cf6'];

/** The list endpoint's own maximum. */
const SERVER_PAGE_SIZE = 100;

/**
 * How many pages the register will pull before it stops.
 *
 * The figures above the table count every row loaded, so the whole register
 * has to be here for them to mean anything — but not at the cost of an
 * unbounded burst of requests. Past this the page says what it is showing
 * rather than implying it has everything.
 */
const MAX_PAGES = 20;

/** Rows per page in the table itself. */
const ROWS_PER_PAGE = 25;
import {
  toInquiryViews,
  deadlineLabel,
  MATTER_TYPE_LABELS,
  STATUS_LABELS,
  type InquiryView,
  type InquiryStatus,
  type InquirySeverity,
  type MatterType,
} from '@/lib/regulator-inquiry-view';
import { loadJson, toLoadError } from '@/lib/load-json';

// ─── Types & Mock data ────────────────────────────────────────────────────────

// The page used a wider vocabulary than the model — eight categories against
// the API's five, and an "Escalated" status the model does not have. See
// lib/complaint-view for why those could not round-trip.
type Severity = ComplaintSeverity;
type ComplaintStatus = ComplaintStatusValue;
type Category = ComplaintCategory;
type Complaint = ComplaintView;


interface RegulatoryInquiry {
  id: string;
  regulator: string;
  caseRef: string;
  subject: string;
  deadlineDate: string;
  status: 'Pending Response' | 'Under Review' | 'Responded' | 'Closed';
  attachments: number;
}

interface ActivityEvent {
  date: string;
  action: string;
  user: string;
}

const CATEGORIES: Category[] = ['billing', 'service', 'unauthorized_debit', 'compliance', 'other'];
const SOURCES: ComplaintSource[] = ['portal', 'email', 'phone', 'regulator_referral', 'legal', 'other'];
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];
const STATUSES: ComplaintStatus[] = ['open', 'investigating', 'resolved', 'closed'];


const ROOT_CAUSE_OPTIONS = [
  'Fee disclosure gap',
  'Geographic proxy variable',
  'Mobile disclosure truncation',
  'Suitability checklist skipped',
  'Stale eligibility data',
  'Consent flag misconfiguration',
  'Email delivery failure',
  'Duplicate webhook event',
  'Other',
];

const MOCK_ACTIVITIES: Record<string, ActivityEvent[]> = {
  'CMP-001': [
    { date: '2026-03-28', action: 'Complaint logged', user: 'System' },
    { date: '2026-03-29', action: 'Assigned to Sarah Chen', user: 'Admin' },
  ],
  'CMP-002': [
    { date: '2026-03-25', action: 'Complaint logged', user: 'System' },
    { date: '2026-03-25', action: 'Escalated to compliance team', user: 'Sarah Chen' },
    { date: '2026-03-26', action: 'ECOA audit initiated', user: 'Michael Torres' },
    { date: '2026-03-28', action: 'Regulatory notification sent', user: 'Emily Park' },
  ],
  'CMP-003': [
    { date: '2026-03-22', action: 'Complaint logged', user: 'System' },
    { date: '2026-03-23', action: 'Under review by product team', user: 'Emily Park' },
  ],
  'CMP-004': [
    { date: '2026-03-20', action: 'Complaint logged', user: 'System' },
    { date: '2026-03-21', action: 'Call recording retrieved', user: 'Michael Torres' },
    { date: '2026-03-22', action: 'Advisor interview scheduled', user: 'Sarah Chen' },
  ],
};




// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The current time, read per render.
 *
 * This was `new Date('2026-04-01')` — a fixed date chosen to make the sample
 * complaints' SLA countdowns look sensible. Once the register showed real
 * rows it meant every deadline was measured from four months ago, and
 * "Resolved (30d)" counted a window that had already closed: a complaint
 * resolved last week fell outside it, so the figure sat at zero while
 * resolutions were happening.
 *
 * Called at the top of each render rather than captured at module load, so a
 * tab left open overnight does not keep yesterday's date. Each caller takes a
 * single instant and uses it for every row, so a table cannot straddle two.
 */
function currentTime(): Date {
  return new Date();
}

function severityBadge(s: Severity): string {
  if (s === 'critical') return 'bg-red-900/60 text-red-300 border border-red-700';
  if (s === 'high')     return 'bg-orange-900/50 text-orange-300 border border-orange-700';
  if (s === 'medium')   return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
  return 'bg-gray-800 text-gray-400 border border-gray-700';
}

function statusBadge(s: ComplaintStatus): string {
  if (s === 'open')          return 'bg-orange-900/40 text-orange-300';
  if (s === 'investigating') return 'bg-blue-900/40 text-blue-300';
  if (s === 'resolved')      return 'bg-emerald-900/40 text-emerald-300';
  return 'bg-gray-800 text-gray-400';
}

function regStatusBadge(status: InquiryStatus): string {
  if (status === 'open')               return 'bg-red-900/50 text-red-300';
  if (status === 'legal_hold')         return 'bg-orange-900/50 text-orange-300';
  if (status === 'response_drafted')   return 'bg-yellow-900/50 text-yellow-300';
  if (status === 'response_submitted') return 'bg-blue-900/50 text-blue-300';
  return 'bg-gray-800 text-gray-400';
}

function deadlineColor(days: number): string {
  if (days <= 7)  return 'text-red-400';
  if (days <= 14) return 'text-yellow-400';
  return 'text-emerald-400';
}

// Kept as a thin wrapper so the existing call sites read the same; the rule
// itself lives in lib/complaint-view alongside the rest of the mapping.
function getSLADueDate(complaint: Complaint): Date | null {
  return slaDueDate(complaint);
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl bg-emerald-900/90 border border-emerald-700 text-emerald-200 text-sm font-medium shadow-2xl animate-in slide-in-from-bottom-4">
      {message}
    </div>
  );
}

// ─── Log Complaint Modal ──────────────────────────────────────────────────────

interface LogModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (c: Complaint) => void;
  /** Real businesses, so a complaint can be attached to one that exists. */
  clients: { id: string; name: string }[];
}

function LogComplaintModal({ open, onClose, onSubmit, clients }: LogModalProps) {
  const [businessId, setBusinessId] = useState<string>('');
  const [category, setCategory] = useState<Category>('billing');
  const [source, setSource] = useState<ComplaintSource>('portal');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  // The API requires 10+ characters; the form mirrors that rather than
  // sending a request already known to fail.
  const descriptionOk = description.trim().length >= 10;

  const handleSubmit = async () => {
    if (!descriptionOk || saving) return;

    setSaving(true);
    setError(null);
    try {
      const data = await loadJson<unknown>('/api/complaints', {
        method: 'POST',
        body: {
          category,
          source,
          severity,
          description: description.trim(),
          ...(assignee ? { assignedTo: assignee } : {}),
          ...(businessId ? { businessId } : {}),
        },
      });

      const saved = toComplaintView(data);
      if (saved) onSubmit(saved);
      setDescription('');
      onClose();
    } catch (e) {
      // Nothing is claimed to have been logged unless the server said so.
      setError(`The complaint was not saved. ${toLoadError(e).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Log New Complaint</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium" htmlFor="complaints-client">Client</label>
            <select
              id="complaints-client"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
            >
              {/* Optional on the API, so "not attributed" is a real choice
                  rather than forcing an arbitrary client onto the record. */}
              <option value="">Not attributed to a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-medium" htmlFor="complaints-category">Category</label>
              <select id="complaints-category" value={category} onChange={(e) => setCategory(e.target.value as Category)} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
                {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
              ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-medium" htmlFor="complaints-severity">Severity</label>
              <select id="complaints-severity" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
                {SEVERITIES.map((sev) => (
                  <option key={sev} value={sev}>{SEVERITY_LABELS[sev]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium" htmlFor="complaints-source">
              How was it received?
            </label>
            <select
              id="complaints-source"
              value={source}
              onChange={(e) => setSource(e.target.value as ComplaintSource)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
            >
              {SOURCES.map((src) => (
                <option key={src} value={src}>{SOURCE_LABELS[src]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium" htmlFor="complaints-description">Description</label>
            <textarea id="complaints-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe the complaint..." className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C] resize-none" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium" htmlFor="complaints-assignee">Assignee</label>
            {/* Free text: the three names offered here before — Sarah Chen,
                Michael Torres, Emily Park — are not users of this system, and
                picking one wrote a name that matched nobody. */}
            <input
              id="complaints-assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="Who owns this complaint?"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-700 text-gray-400 text-sm hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={!descriptionOk || saving} className="px-5 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] disabled:opacity-40 disabled:cursor-not-allowed text-[#0A1628] text-sm font-semibold transition-colors">
            {saving ? 'Saving...' : 'Log Complaint'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Regulatory Response Generator ───────────────────────────────────────────

function RegulatoryResponseGenerator({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
  const filedOn = complaint.createdAt ? formatDate(new Date(complaint.createdAt)) : 'an unrecorded date';
  const template = `Dear ${complaint.clientName ?? 'Client'},

We are writing to acknowledge receipt of your complaint (Reference: ${complaint.id}), filed on ${filedOn}, regarding ${CATEGORY_LABELS[complaint.category].toLowerCase()} concerns.

We take all client complaints seriously and are committed to resolving this matter in a fair and timely manner.

Summary of Complaint:
${complaint.description}

Investigation Timeline:
We have initiated a formal investigation into your complaint. In accordance with our regulatory obligations, we will complete our investigation and provide you with a final response within 30 calendar days from the date of this letter. If additional time is required, we will notify you of the extension and the reasons for it.

Remediation Steps:
1. Your complaint has been assigned to our compliance team for thorough review.
2. All relevant documentation and records are being gathered and analyzed.
3. We will conduct interviews with relevant personnel as necessary.
4. A root cause analysis will be performed to prevent recurrence.
5. Any corrective actions identified will be implemented promptly.

During this process, your account and services will not be adversely affected.

If you have any questions or additional information to provide, please contact our Client Relations team:
- Email: complaints@capitalforge.com
- Phone: 1-800-555-0199
- Reference: ${complaint.id}

Sincerely,
CapitalForge Compliance Department`;

  const [text, setText] = useState(template);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    downloadBlob(text, `response_${complaint.id}.txt`, 'text/plain');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Regulatory Response — {complaint.id}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>
        <textarea aria-label="Letter text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={20}
          className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm font-mono leading-relaxed focus:outline-none focus:border-[#C9A84C] resize-y"
        />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-700 text-gray-400 text-sm hover:bg-gray-800 transition-colors">Close</button>
          <button onClick={handleCopy} className="px-4 py-2 rounded-lg border border-[#C9A84C]/50 text-[#C9A84C] text-sm font-medium hover:bg-[#C9A84C]/10 transition-colors">Copy</button>
          <button onClick={handleDownload} className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">Download</button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ComplaintsTableProps {
  complaints: Complaint[];
  onSelect: (c: Complaint) => void;
  selectedId: string | null;
  filterSev: Severity | 'All';
  setFilterSev: (v: Severity | 'All') => void;
  filterStatus: ComplaintStatus | 'All';
  setFilterStatus: (v: ComplaintStatus | 'All') => void;
  rootCauseFilter: string | null;
  clearRootCauseFilter: () => void;
}

function ComplaintsTable({ complaints, onSelect, selectedId, filterSev, setFilterSev, filterStatus, setFilterStatus, rootCauseFilter, clearRootCauseFilter }: ComplaintsTableProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return complaints.filter((c) => {
      const matchSev = filterSev === 'All' || c.severity === filterSev;
      const matchStatus = filterStatus === 'All' || c.status === filterStatus;
      const haystack = `${c.clientName ?? ''} ${CATEGORY_LABELS[c.category]} ${c.id}`.toLowerCase();
      const matchSearch = haystack.includes(search.toLowerCase());
      // A complaint with no root cause recorded does not match a root-cause
      // filter, rather than matching everything.
      const matchRoot =
        !rootCauseFilter ||
        (c.rootCause ?? '').toLowerCase().includes(rootCauseFilter.toLowerCase());
      return matchSev && matchStatus && matchSearch && matchRoot;
    });
  }, [complaints, filterSev, filterStatus, search, rootCauseFilter]);

  const [page, setPage] = useState(1);

  // Any change to the filters can shrink the list under the current page, so
  // the view returns to the first — otherwise a filter that matches three
  // rows while on page 4 renders as an empty table.
  useEffect(() => {
    setPage(1);
  }, [filterSev, filterStatus, search, rootCauseFilter, complaints.length]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE,
  );

  // One instant for the whole table, so two rows cannot be measured against
  // different "nows".
  const now = currentTime();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <input aria-label="Search ID, client, category"
          type="text"
          placeholder="Search ID, client, category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
        />
        <select aria-label="Filter by severity"
          value={filterSev}
          onChange={(e) => setFilterSev(e.target.value as Severity | 'All')}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
        >
          <option value="All">All Severities</option>
          {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Filter by status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as ComplaintStatus | 'All')}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
        >
          <option value="All">All Statuses</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {rootCauseFilter && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400">Filtered by root cause:</span>
          <span className="px-2 py-0.5 rounded bg-[#C9A84C]/20 text-[#C9A84C] font-medium">{rootCauseFilter}</span>
          <button onClick={clearRootCauseFilter} className="text-gray-500 hover:text-gray-300">&times; Clear</button>
        </div>
      )}

      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-semibold">ID</th>
              <th className="px-4 py-3 text-left font-semibold">Client</th>
              <th className="px-4 py-3 text-left font-semibold">Category</th>
              <th className="px-4 py-3 text-left font-semibold">Severity</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Submitted</th>
              <th className="px-4 py-3 text-left font-semibold">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {visible.map((c) => {
              const dueDate = getSLADueDate(c);
              const daysLeft = dueDate ? daysBetween(now, dueDate) : null;
              const overdue = daysLeft !== null && daysLeft < 0;
              const isSelected = selectedId === c.id;
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className={`transition-colors cursor-pointer ${isSelected ? 'bg-gray-800 ring-1 ring-[#C9A84C]/30' : 'bg-gray-950 hover:bg-gray-900'}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-[#C9A84C]">{c.id}</td>
                  <td className="px-4 py-3 font-medium text-gray-100">{c.clientName}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{c.category}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${severityBadge(c.severity)}`}>
                      {SEVERITY_LABELS[c.severity]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge(c.status)}`}>
                      {COMPLAINT_STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">
                    {c.createdAt ? formatDate(new Date(c.createdAt)) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold tabular-nums ${
                      overdue || (daysLeft !== null && daysLeft <= 2) ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {/* No filing date means no deadline to state. */}
                      {dueDate === null ? '—' : formatDate(dueDate)}
                      {overdue && daysLeft !== null && (
                        <span className="ml-1 text-[10px]">({Math.abs(daysLeft)}d late)</span>
                      )}
                      {!overdue && daysLeft !== null && daysLeft <= 2 && (
                        <span className="ml-1 text-[10px]">({daysLeft}d)</span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600 text-sm">No complaints match current filters.</td></tr>
            )}
          </tbody>
        </table>

        {/* Counts describe the filtered set, not the page, so the table never
            implies the register is smaller than it is. */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-500">
            {filtered.length === 0
              ? 'No complaints match these filters.'
              : `Showing ${(currentPage - 1) * ROWS_PER_PAGE + 1}\u2013${
                  (currentPage - 1) * ROWS_PER_PAGE + visible.length
                } of ${filtered.length}`}
          </p>

          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-300
                  hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500 tabular-nums">
                Page {currentPage} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage === pageCount}
                className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-300
                  hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RootCauseAnalytics({
  slices,
  onCategoryClick,
}: {
  slices: RootCauseSlice[];
  onCategoryClick: (cat: string) => void;
}) {
  // Empty until complaints have a root cause recorded. The five fixed
  // categories shown here before — "Disclosure Gaps 32%" and so on — were a
  // constant, and no investigation could change them.
  if (slices.length === 0) {
    return (
      <p className="text-xs text-gray-500 py-4">
        No root causes recorded yet. They appear here once complaints are
        investigated and a cause is set.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      {slices.map((item) => (
        <div
          key={item.category}
          onClick={() => onCategoryClick(item.category)}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2 cursor-pointer hover:border-gray-600 transition-colors"
        >
          <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{item.category}</p>
          <p
            className="text-2xl font-bold tabular-nums"
            style={{ color: SLICE_COLORS[slices.indexOf(item) % SLICE_COLORS.length] }}
          >
            {item.count}
          </p>
          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${item.pct}%`,
                backgroundColor: SLICE_COLORS[slices.indexOf(item) % SLICE_COLORS.length],
              }}
            />
          </div>
          <p className="text-[10px] text-gray-600">{item.pct}% of total</p>
        </div>
      ))}
    </div>
  );
}

// Mapping root cause analytics categories to complaint rootCause text fragments
const ROOT_CAUSE_MAP: Record<string, string> = {
  'Disclosure Gaps': 'disclosure',
  'Model / Data Quality': 'model|data|proxy|stale|eligibility',
  'Advisor Process': 'advisor|suitability|checklist',
  'System / API Bug': 'system|api|smtp|webhook|email|bug|misconfigured',
  'Partner Integration': 'partner|consent flag|integration',
};

/**
 * Choose one of the client's documents to attach as evidence.
 *
 * Evidence is attached by reference, so this offers what exists rather than
 * letting a name be typed. The panel used to mint one — evidence_lx8f2k.pdf —
 * and add it to the list, naming a file that was nowhere and could never be
 * retrieved.
 */
function AttachEvidenceModal({
  complaint,
  onClose,
  onAttached,
}: {
  complaint: ComplaintView;
  onClose: () => void;
  onAttached: () => void;
}) {
  const [documents, setDocuments] = useState<AttachableDocument[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A complaint not tied to a client has no document library to draw on.
    if (complaint.businessId === null) {
      setDocuments([]);
      setState('ready');
      return;
    }

    // Every page: documents come back 20 at a time, so a client with more
    // than that had the rest simply absent from the picker.
    fetchAllPages(`/api/businesses/${complaint.businessId}/documents`, (json) => {
      const body = json as { success?: boolean; data?: unknown };
      return body.success === true ? toAttachableDocuments(body.data) : [];
    })
      .then(({ rows }) => {
        setDocuments(rows);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [complaint.businessId]);

  // Already-attached documents are shown as attached rather than offered
  // again, so the same reference is not added twice.
  const attached = new Set(complaint.evidenceDocIds);
  const selectable = documents.filter((d) => !attached.has(d.id));

  async function handleAttach() {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    setError(null);

    try {
      await loadJson(`/api/complaints/${complaint.id}/evidence`, {
        method: 'POST',
        body: {
          evidenceItems: selected.map((id) => {
            const doc = documents.find((d) => d.id === id);
            return {
              type: 'document',
              referenceId: id,
              // The endpoint requires a title; it is the document's own.
              title: doc?.title ?? id,
            };
          }),
        },
      });

      onAttached();
      onClose();
    } catch (e) {
      setError(`Nothing was attached. ${toLoadError(e).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Attach Evidence"
        className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-white">Attach Evidence</h3>

        {state === 'loading' && (
          <p className="text-xs text-gray-500 py-6 text-center">Loading documents...</p>
        )}

        {state === 'error' && (
          <p role="alert" className="text-xs text-red-300 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
            Could not load this client&apos;s documents.
          </p>
        )}

        {state === 'ready' && complaint.businessId === null && (
          <p className="text-xs text-gray-500 py-4">
            This complaint is not attributed to a client, so there are no client
            documents to attach.
          </p>
        )}

        {state === 'ready' && complaint.businessId !== null && selectable.length === 0 && (
          <p className="text-xs text-gray-500 py-4">
            {documents.length === 0
              ? 'This client has no documents on file.'
              : 'Every document on file is already attached to this complaint.'}
          </p>
        )}

        {state === 'ready' && selectable.length > 0 && (
          <ul className="space-y-2">
            {selectable.map((doc) => (
              <li key={doc.id}>
                <label className="flex items-start gap-3 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-750 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(doc.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, doc.id] : prev.filter((x) => x !== doc.id),
                      )
                    }
                    className="mt-0.5 rounded border-gray-600 bg-gray-800 text-[#C9A84C]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-100 truncate">{doc.title}</span>
                    <span className="block text-[11px] text-gray-500">
                      {doc.documentType}
                      {formatFileSize(doc.sizeBytes) && ` · ${formatFileSize(doc.sizeBytes)}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAttach}
            disabled={selected.length === 0 || saving}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] text-[#0A1628] text-sm font-semibold
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Attaching...' : `Attach ${selected.length || ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}

interface EvidencePanelProps {
  complaint: Complaint | null;
  onUpdateComplaint: (updated: Complaint) => void;
  onShowToast: (msg: string) => void;
  /** Reloads the register so the attached ids come back from the server. */
  onEvidenceAttached: () => void;
}

function EvidencePanel({ complaint, onUpdateComplaint, onShowToast, onEvidenceAttached }: EvidencePanelProps) {
  const [showResponseGen, setShowResponseGen] = useState(false);
  const [showAttach, setShowAttach] = useState(false);

  if (!complaint) {
    return (
      <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center text-gray-600 text-sm">
        Select a complaint to view evidence and root cause details.
      </div>
    );
  }

  const dueDate = getSLADueDate(complaint);
  const daysLeft = dueDate ? daysBetween(currentTime(), dueDate) : null;
  const overdue = daysLeft !== null && daysLeft < 0;
  const filedOnLabel = complaint.createdAt ? formatDate(new Date(complaint.createdAt)) : '—';
  const activities = MOCK_ACTIVITIES[complaint.id] || [
    { date: filedOnLabel, action: 'Complaint logged', user: 'System' },
  ];

  const handleStartInvestigation = () => {
    onUpdateComplaint({ ...complaint, status: 'investigating' });
    onShowToast('Moved to in review');
  };

  // Escalation is a field on the record, not a status. Treating it as a
  // status meant the change either failed against the API's four values or
  // landed as a different one.
  const handleEscalate = () => {
    onUpdateComplaint({ ...complaint, status: 'investigating', escalatedTo: 'Compliance' });
    onShowToast('Escalated to compliance');
  };

  const handleResolve = () => {
    onUpdateComplaint({ ...complaint, status: 'resolved' });
    onShowToast('Marked as resolved');
  };

  const handleRootCauseChange = (value: string) => {
    onUpdateComplaint({ ...complaint, rootCause: value === '' ? null : value });
  };

  return (
    <>
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-[#C9A84C]">{complaint.id}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${severityBadge(complaint.severity)}`}>{SEVERITY_LABELS[complaint.severity]}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge(complaint.status)}`}>{COMPLAINT_STATUS_LABELS[complaint.status]}</span>
            </div>
            <p className="text-sm font-semibold text-gray-100 mt-1">{complaint.clientName} — {complaint.category}</p>
          </div>
        </div>

        {/* SLA Countdown */}
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
          overdue
            ? 'bg-red-900/30 border border-red-800'
            : daysLeft !== null && daysLeft <= 2
              ? 'bg-red-900/20 border border-red-800/50'
              : 'bg-gray-800 border border-gray-700'
        }`}>
          <div className="flex-1">
            <p className="text-[10px] text-gray-400 uppercase font-medium">SLA Response Due</p>
            <p className="text-sm font-semibold text-gray-200 tabular-nums">
              {dueDate === null ? '—' : formatDate(dueDate)}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-xl font-black tabular-nums ${
              overdue || (daysLeft !== null && daysLeft <= 2) ? 'text-red-400' : 'text-emerald-400'
            }`}>
              {/* No filing date, so no countdown to state. */}
              {daysLeft === null
                ? 'No filing date'
                : overdue
                  ? `${Math.abs(daysLeft)}d overdue`
                  : `${daysLeft}d left`}
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">Description</p>
          <p className="text-sm text-gray-300">{complaint.description}</p>
        </div>

        {/* Evidence Files */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium">
              Evidence Files ({complaint.evidenceDocIds.length})
            </p>
            <button
              type="button"
              onClick={() => setShowAttach(true)}
              className="text-[10px] px-2 py-1 rounded bg-[#C9A84C]/20 text-[#C9A84C] font-medium hover:bg-[#C9A84C]/30 transition-colors"
            >
              + Attach Evidence
            </button>
          </div>
          <div className="space-y-1.5">
            {complaint.evidenceDocIds.length === 0 && (
              <p className="text-[11px] text-gray-600 px-1">No evidence attached.</p>
            )}
            {complaint.evidenceDocIds.map((docId) => (
              <div key={docId} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800">
                <span className="text-xs font-mono text-gray-300">{docId}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Root Cause Dropdown */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">Root Cause</p>
          <select aria-label="Root cause"
            value={complaint.rootCause ?? ''}
            onChange={(e) => handleRootCauseChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-amber-300 text-sm focus:outline-none focus:border-[#C9A84C]"
          >
            <option value="">-- Select root cause --</option>
            {ROOT_CAUSE_OPTIONS.map((rc) => (
              <option key={rc} value={rc}>{rc}</option>
            ))}
            {complaint.rootCause && !ROOT_CAUSE_OPTIONS.includes(complaint.rootCause) && (
              <option value={complaint.rootCause}>{complaint.rootCause}</option>
            )}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {complaint.status === 'open' && (
            <button onClick={handleStartInvestigation} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors">
              Start Investigation
            </button>
          )}
          {complaint.status === 'investigating' && (
            <>
              <button onClick={handleEscalate} className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
                Escalate
              </button>
              <button onClick={handleResolve} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors">
                Mark Resolved
              </button>
            </>
          )}
          <button onClick={() => setShowResponseGen(true)} className="px-3 py-1.5 rounded-lg border border-[#C9A84C]/50 text-[#C9A84C] text-xs font-semibold hover:bg-[#C9A84C]/10 transition-colors">
            Generate Response
          </button>
        </div>

        {/* Activity Timeline */}
        <div className="space-y-2 pt-1">
          <p className="text-xs text-gray-500 font-medium">Activity Timeline</p>
          <div className="space-y-0">
            {activities.map((evt, i) => (
              <div key={i} className="flex gap-3 relative pl-4 py-1.5">
                <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-700" />
                <div className="absolute left-[-2.5px] top-[10px] w-[6px] h-[6px] rounded-full bg-[#C9A84C]" />
                <div className="flex-1">
                  <p className="text-xs text-gray-300">{evt.action}</p>
                  <p className="text-[10px] text-gray-600">{evt.date} &middot; {evt.user}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showResponseGen && (
        <RegulatoryResponseGenerator complaint={complaint} onClose={() => setShowResponseGen(false)} />
      )}

      {showAttach && (
        <AttachEvidenceModal
          complaint={complaint}
          onClose={() => setShowAttach(false)}
          onAttached={() => {
            onShowToast('Evidence attached');
            onEvidenceAttached();
          }}
        />
      )}
    </>
  );
}

function LogInquiryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [matterType, setMatterType] = useState<MatterType>('CFPB');
  const [agencyName, setAgencyName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<InquirySeverity>('routine');
  const [responseDueDate, setResponseDueDate] = useState('');
  const [assignedCounsel, setAssignedCounsel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors the server's own validation, so the form does not let a request
  // leave that is already known to fail.
  const agencyOk = agencyName.trim().length >= 2;
  const descriptionOk = description.trim().length >= 10;
  const canSubmit = agencyOk && descriptionOk && !saving;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    try {
      await loadJson('/api/regulator/inquiries', {
        method: 'POST',
        body: {
          matterType,
          agencyName: agencyName.trim(),
          description: description.trim(),
          severity,
          // Omitted rather than sent empty: the server treats these as absent,
          // and an empty string is a different claim from "not provided".
          ...(referenceNumber.trim() ? { referenceNumber: referenceNumber.trim() } : {}),
          ...(responseDueDate ? { responseDueDate } : {}),
          ...(assignedCounsel.trim() ? { assignedCounsel: assignedCounsel.trim() } : {}),
        },
      });

      onCreated();
      onClose();
    } catch (e) {
      // Not a success toast: the inquiry is only claimed saved if it was.
      setError(`The inquiry was not saved. ${toLoadError(e).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Log Regulator Inquiry"
        className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-white mb-4">Log Regulator Inquiry</h3>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="inquiry-matter-type" className="block text-xs text-gray-400 mb-1">
                Matter type
              </label>
              <select
                id="inquiry-matter-type"
                value={matterType}
                onChange={(e) => setMatterType(e.target.value as MatterType)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              >
                {(Object.keys(MATTER_TYPE_LABELS) as MatterType[]).map((t) => (
                  <option key={t} value={t}>{MATTER_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="inquiry-severity" className="block text-xs text-gray-400 mb-1">
                Severity
              </label>
              <select
                id="inquiry-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as InquirySeverity)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              >
                <option value="routine">Routine</option>
                <option value="elevated">Elevated</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="inquiry-agency" className="block text-xs text-gray-400 mb-1">
              Agency name
            </label>
            <input
              id="inquiry-agency"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              aria-required="true"
              aria-invalid={agencyName !== '' && !agencyOk ? true : undefined}
              placeholder="Consumer Financial Protection Bureau"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="inquiry-reference" className="block text-xs text-gray-400 mb-1">
                Reference number
              </label>
              <input
                id="inquiry-reference"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="CFPB-2026-00341"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              />
            </div>

            <div>
              <label htmlFor="inquiry-due" className="block text-xs text-gray-400 mb-1">
                Response due
              </label>
              <input
                id="inquiry-due"
                type="date"
                value={responseDueDate}
                onChange={(e) => setResponseDueDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="inquiry-counsel" className="block text-xs text-gray-400 mb-1">
              Assigned counsel
            </label>
            <input
              id="inquiry-counsel"
              value={assignedCounsel}
              onChange={(e) => setAssignedCounsel(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
            />
          </div>

          <div>
            <label htmlFor="inquiry-description" className="block text-xs text-gray-400 mb-1">
              What is the agency asking for?
            </label>
            <textarea
              id="inquiry-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              aria-required="true"
              aria-invalid={description !== '' && !descriptionOk ? true : undefined}
              aria-describedby="inquiry-description-hint"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
            />
            <p id="inquiry-description-hint" className="text-[11px] text-gray-500 mt-1">
              At least 10 characters. This is the record of what was asked, so keep it specific.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 rounded-lg bg-[#C9A84C] text-[#0A1628] text-sm font-semibold
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Log inquiry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RegulatoryInquiries({
  onOpenCountChange,
}: {
  onOpenCountChange?: (count: number) => void;
}) {
  const [inquiries, setInquiries] = useState<InquiryView[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      // Every page: this endpoint returns 20 at a time, and the open count
      // below feeds the "Active Reg. Inquiries" figure on the page — so a
      // tenant with more than 20 matters had that figure capped at 20.
      const { rows } = await fetchAllPages('/api/regulator/inquiries', (json) => {
        const body = json as { success?: boolean; data?: unknown };
        return body.success === true ? toInquiryViews(body.data) : [];
      });

      setInquiries(rows);
      onOpenCountChange?.(rows.filter((i) => i.status !== 'closed').length);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [onOpenCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Regulator Inquiries</h3>
          <p className="text-xs text-gray-500 mt-0.5">Active regulatory matters requiring response.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowLog(true)}
          className="px-4 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-xs font-semibold transition-colors"
        >
          + Log Inquiry
        </button>
      </div>

      {state === 'loading' && (
        <p className="text-xs text-gray-500 py-6 text-center">Loading regulator inquiries...</p>
      )}

      {state === 'error' && (
        <div className="rounded-xl border border-red-900 bg-red-950/30 px-4 py-5 text-center">
          <p className="text-xs text-red-300">Could not load regulator inquiries.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 px-3 py-1.5 rounded-lg border border-red-800 text-xs text-red-200 hover:bg-red-900/40"
          >
            Retry
          </button>
        </div>
      )}

      {state === 'ready' && inquiries.length === 0 && (
        <p className="text-xs text-gray-500 py-6 text-center">
          No regulator inquiries on record.
        </p>
      )}

      {state === 'ready' && inquiries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {inquiries.map((inq) => (
            <div key={inq.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#0A1628] border border-[#C9A84C]/40 text-[#C9A84C]">
                      {MATTER_TYPE_LABELS[inq.matterType]}
                    </span>
                    {/* Absent rather than faked when the agency issued none. */}
                    <span className="font-mono text-[10px] text-gray-500">
                      {inq.referenceNumber ?? 'No reference number'}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-100 mt-1">{inq.agencyName}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${regStatusBadge(inq.status)}`}>
                  {STATUS_LABELS[inq.status]}
                </span>
              </div>

              <p className="text-xs text-gray-400 line-clamp-2">{inq.description}</p>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-500">Deadline</p>
                  <p className="text-sm font-semibold text-gray-200 tabular-nums">
                    {inq.responseDueDate ? inq.responseDueDate.slice(0, 10) : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500">Status</p>
                  <p
                    className={`text-xs font-bold ${
                      inq.isOverdue
                        ? 'text-red-400'
                        : inq.daysUntilDeadline === null
                          ? 'text-gray-500'
                          : deadlineColor(inq.daysUntilDeadline)
                    }`}
                  >
                    {deadlineLabel(inq)}
                  </p>
                </div>
              </div>

              {inq.assignedCounsel && (
                <p className="text-[11px] text-gray-500">Counsel: {inq.assignedCounsel}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showLog && (
        <LogInquiryModal onClose={() => setShowLog(false)} onCreated={() => void load()} />
      )}
    </div>
  );
}

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [analytics, setAnalytics] = useState<ComplaintAnalyticsView | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [totalOnServer, setTotalOnServer] = useState<number | null>(null);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>('All Clients');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'All'>('All');
  const [rootCauseFilter, setRootCauseFilter] = useState<string | null>(null);

  const clientFiltered = useMemo(() => {
    if (selectedClient === 'All Clients') return complaints;
    return complaints.filter((c) => c.clientName === selectedClient);
  }, [complaints, selectedClient]);

  // Counted from the rows on screen, so the figures agree with the table
  // beneath them. Null while loading rather than 0, which would be a claim.
  const open =
    loadState === 'ready'
      ? clientFiltered.filter((c) => c.status === 'open' || c.status === 'investigating').length
      : null;
  const critical =
    loadState === 'ready' ? clientFiltered.filter((c) => c.severity === 'critical').length : null;
  // Resolved in the trailing 30 days, from resolvedAt. This was a hard-coded
  // 12 that never moved.
  const resolved30d =
    loadState === 'ready' ? resolvedWithin(clientFiltered, 30, currentTime()) : null;
  // Reported by the inquiries panel once it has loaded, rather than counted
  // from a constant. Null until then: "0 open matters" is a claim, and it was
  // previously a fixed 3 regardless of what the tenant actually had.
  const [regulatory, setRegulatory] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      // The walk that was inline here now lives in lib/fetch-all-pages,
      // because every list endpoint in this app has the same shape of problem.
      const [listed, analytics] = await Promise.all([
        fetchAllPages(
          '/api/complaints',
          (json) => {
            const body = json as { success?: boolean; data?: unknown };
            return body.success === true ? toComplaintViews(body.data) : [];
          },
          { pageSize: SERVER_PAGE_SIZE, maxPages: MAX_PAGES },
        ),
        // Analytics failing on its own leaves the register usable rather than
        // taking the whole page down with it, so it is caught here rather than
        // thrown into the handler below.
        loadJson<unknown>('/api/complaints/analytics')
          .then(toAnalyticsView)
          .catch(() => null),
      ]);

      setTotalOnServer(listed.total);
      setComplaints(listed.rows);
      setAnalytics(analytics);

      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Real businesses for the log form, so a complaint attaches to one that
  // exists rather than to a name typed into a list.
  useEffect(() => {
    // Every page: 25 at a time, so the log form offered the first 25 clients
    // and a complaint could not be filed against any of the others.
    fetchAllPages('/api/v1/clients', (json) => {
      const body = json as { success?: boolean; data?: unknown };
      if (body.success !== true || !Array.isArray(body.data)) return [];
      return body.data
        .map((row) => row as Record<string, unknown>)
        .filter((row) => typeof row['id'] === 'string')
        .map((row) => ({
          id: row['id'] as string,
          name:
            (typeof row['businessName'] === 'string' && row['businessName']) ||
            (typeof row['legalName'] === 'string' && row['legalName']) ||
            'Unnamed business',
        }));
    })
      .then(({ rows }) => setClients(rows))
      .catch(() => undefined);
  }, []);

  const handleExportCSV = () => {
    const headers = ['ID', 'Client', 'Category', 'Severity', 'Status', 'Submitted', 'SLA Due', 'Description', 'Root Cause', 'Assignee'];
    const rows = clientFiltered.map((c) => {
      const due = slaDueDate(c);
      // Blank where the record carries nothing, rather than "undefined" or an
      // invented date landing in an exported compliance report.
      return [
        c.id,
        c.clientName ?? '',
        CATEGORY_LABELS[c.category],
        SEVERITY_LABELS[c.severity],
        COMPLAINT_STATUS_LABELS[c.status],
        c.createdAt ? formatDate(new Date(c.createdAt)) : '',
        due ? formatDate(due) : '',
        `"${c.description.replace(/"/g, '""')}"`,
        `"${(c.rootCause ?? '').replace(/"/g, '""')}"`,
        c.assignedTo ?? '',
      ];
    });
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadBlob(csv, `complaints_export_${formatDate(currentTime())}.csv`, 'text/csv');
    setToastMsg('CSV report downloaded');
  };

  const handleLogComplaint = (c: Complaint) => {
    // Already persisted by the modal; reloading keeps the analytics and the
    // register in step rather than diverging from the server.
    setComplaints((prev) => [c, ...prev]);
    setToastMsg('Complaint logged');
    void load();
  };

  const handleUpdateComplaint = async (updated: Complaint) => {
    const previous = complaints.find((c) => c.id === updated.id) ?? null;

    // Optimistic, then reconciled: the panel stays responsive, but a rejected
    // write is rolled back rather than left on screen looking saved.
    setComplaints((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setSelectedComplaint(updated);

    try {
      await loadJson(`/api/complaints/${updated.id}`, {
        method: 'PUT',
        // Only what changed. The API validates status transitions, so
        // resending the current status on an unrelated edit — changing a root
        // cause, say — puts a no-op transition through that validator for no
        // reason. It also keeps the audit trail to the fields actually touched.
        body: {
          ...(previous && updated.status !== previous.status ? { status: updated.status } : {}),
          ...(previous && updated.severity !== previous.severity
            ? { severity: updated.severity }
            : {}),
          ...(previous && updated.rootCause !== previous.rootCause && updated.rootCause
            ? { rootCause: updated.rootCause }
            : {}),
          ...(previous && updated.resolution !== previous.resolution && updated.resolution
            ? { resolution: updated.resolution }
            : {}),
          ...(previous && updated.assignedTo !== previous.assignedTo && updated.assignedTo
            ? { assignedTo: updated.assignedTo }
            : {}),
          ...(previous && updated.escalatedTo !== previous.escalatedTo && updated.escalatedTo
            ? { escalatedTo: updated.escalatedTo }
            : {}),
        },
      });

      void load();
    } catch (e) {
      // Rolled back: an optimistic update that the server refused must not be
      // left on screen looking saved.
      if (previous) {
        setComplaints((prev) => prev.map((c) => (c.id === previous.id ? previous : c)));
        setSelectedComplaint(previous);
      }
      setToastMsg(`That change was not saved. ${toLoadError(e).message}`);
    }
  };

  const handleRootCauseClick = (analyticsCategory: string) => {
    const pattern = ROOT_CAUSE_MAP[analyticsCategory];
    if (pattern) {
      setRootCauseFilter(pattern === rootCauseFilter ? null : pattern);
    }
  };

  const allClients = useMemo(() => {
    const names = new Set(
      complaints.map((c) => c.clientName).filter((n): n is string => n !== null),
    );
    return ['All Clients', ...Array.from(names).sort()];
  }, [complaints]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* ── Client Selector ─────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold" htmlFor="complaints-client-2">Client</label>
        <select id="complaints-client-2"
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm font-medium focus:outline-none focus:border-[#C9A84C] min-w-[200px]"
        >
          {allClients.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Complaints</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Track, investigate, and resolve client complaints and regulatory inquiries.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Export Report
          </button>
          <button onClick={() => setShowLogModal(true)} className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
            + Log Complaint
          </button>
        </div>
      </div>

      {/* ── KPI row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Open / Escalated',       value: open,       color: 'text-red-400'     },
          { label: 'Critical Severity',       value: critical,   color: 'text-orange-400'  },
          { label: 'Active Reg. Inquiries',   value: regulatory, color: 'text-yellow-400'  },
          { label: 'Resolved (30d)',          value: resolved30d, color: 'text-emerald-400' },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{c.label}</p>
            {/* A null count renders as an em dash, not as blank space: the
                inquiries panel reports its figure once loaded, and an empty
                slot where a number belongs reads as a rendering fault. */}
            <p className={`text-3xl font-black tabular-nums ${c.color}`}>
              {c.value === null ? '—' : c.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Root Cause Analytics ────────────────────────────────── */}
      <section aria-label="Root Cause Analytics">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Root Cause Analytics (YTD) — click to filter</h2>
        <RootCauseAnalytics slices={analytics?.topRootCauses ?? []} onCategoryClick={handleRootCauseClick} />
      </section>

      {/* ── Complaints table + Evidence panel ──────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2" aria-label="Complaints Table">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">All Complaints</h2>

          {/* Only when the register is larger than the fetch cap. Every page
              up to that is loaded, so below it the figures cover everything. */}
          {loadState === 'ready' && totalOnServer !== null && totalOnServer > complaints.length && (
            <p className="mb-3 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Showing the {complaints.length} most recent of {totalOnServer} complaints — the
              register is larger than this page loads. The figures above count the
              {' '}{complaints.length} shown.
            </p>
          )}

          {loadState === 'loading' && (
            <p className="text-xs text-gray-500 py-10 text-center">Loading complaints...</p>
          )}

          {/* A failed load must not look like a clean register. */}
          {loadState === 'error' && (
            <div className="rounded-xl border border-red-900 bg-red-950/30 px-4 py-6 text-center">
              <p className="text-xs text-red-300">Could not load complaints.</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 px-3 py-1.5 rounded-lg border border-red-800 text-xs text-red-200 hover:bg-red-900/40"
              >
                Retry
              </button>
            </div>
          )}

          {loadState === 'ready' && (
          <ComplaintsTable
            complaints={clientFiltered}
            onSelect={setSelectedComplaint}
            selectedId={selectedComplaint?.id ?? null}
            filterSev={severityFilter}
            setFilterSev={setSeverityFilter}
            filterStatus={statusFilter}
            setFilterStatus={setStatusFilter}
            rootCauseFilter={rootCauseFilter}
            clearRootCauseFilter={() => setRootCauseFilter(null)}
          />
          )}
        </section>

        <section aria-label="Evidence Panel">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Evidence & Detail</h2>
          <EvidencePanel
            complaint={selectedComplaint}
            onUpdateComplaint={handleUpdateComplaint}
            onEvidenceAttached={() => void load()}
            onShowToast={setToastMsg}
          />
        </section>
      </div>

      {/* ── Regulatory Inquiries ────────────────────────────────── */}
      <section aria-label="Regulatory Inquiries">
        <RegulatoryInquiries onOpenCountChange={setRegulatory} />
      </section>

      {/* ── Log Complaint Modal ─────────────────────────────────── */}
      <LogComplaintModal
        open={showLogModal}
        onClose={() => setShowLogModal(false)}
        onSubmit={handleLogComplaint}
        clients={clients}
      />

      {/* ── Toast ───────────────────────────────────────────────── */}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}

    </div>
  );
}
