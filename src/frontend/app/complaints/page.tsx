'use client';

// ============================================================
// /complaints — Complaints Management
// Complaints table, root cause analytics, evidence panel,
// regulator inquiry section with deadline countdown.
// ============================================================

import { useState, useEffect, useMemo, useCallback, type FormEvent } from 'react';
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

// ─── Types & Mock data ────────────────────────────────────────────────────────

type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
type ComplaintStatus = 'Open' | 'In Review' | 'Escalated' | 'Resolved' | 'Closed';
type Category = 'Billing' | 'Disclosure' | 'Fair Lending' | 'Product Mismatch' | 'Advisor Conduct' | 'Data Privacy' | 'Approval Denial' | 'Other';

interface Complaint {
  id: string;
  clientName: string;
  category: Category;
  severity: Severity;
  status: ComplaintStatus;
  submittedAt: string;
  description: string;
  evidence: string[];
  rootCause: string;
  assignee: string;
}

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

const CLIENTS = ['Marcus Bell', 'Aisha Johnson', 'Derek Huang', 'Priya Mehta', 'James Osei'] as const;
const ADVISORS = ['Sarah Chen', 'Michael Torres', 'Emily Park'] as const;
const CATEGORIES: Category[] = ['Billing', 'Fair Lending', 'Disclosure', 'Advisor Conduct', 'Product Mismatch', 'Data Privacy', 'Other'];
const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES: ComplaintStatus[] = ['Open', 'In Review', 'Escalated', 'Resolved', 'Closed'];

const SLA_DAYS: Record<Severity, number> = { Critical: 5, High: 10, Medium: 20, Low: 30 };

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

const INITIAL_COMPLAINTS: Complaint[] = [
  { id: 'CMP-001', clientName: 'Marcus Bell',         category: 'Billing',          severity: 'High',     status: 'Open',      submittedAt: '2026-03-28', description: 'Charged origination fee not disclosed in agreement.', evidence: ['contract_v2.pdf', 'statement_mar26.pdf'], rootCause: 'Fee disclosure gap in onboarding template v3.1.', assignee: 'Sarah Chen' },
  { id: 'CMP-002', clientName: 'Aisha Johnson',       category: 'Fair Lending',     severity: 'Critical', status: 'Escalated', submittedAt: '2026-03-25', description: 'Alleges denial was based on zip code, not creditworthiness.', evidence: ['denial_letter.pdf', 'fico_report.pdf', 'geo_analysis.csv'], rootCause: 'Geographic proxy variable in legacy model flagged by ECOA audit.', assignee: 'Michael Torres' },
  { id: 'CMP-003', clientName: 'Derek Huang',         category: 'Disclosure',       severity: 'Medium',   status: 'In Review', submittedAt: '2026-03-22', description: 'APR not clearly stated in digital consent flow.', evidence: ['consent_screenshot.png'], rootCause: 'Mobile disclosure screen truncated APR on small viewports.', assignee: 'Emily Park' },
  { id: 'CMP-004', clientName: 'Priya Mehta',         category: 'Advisor Conduct',  severity: 'High',     status: 'In Review', submittedAt: '2026-03-20', description: 'Advisor recommended card without explaining terms.', evidence: ['call_recording_id_8821.mp3'], rootCause: 'Suitability checklist skipped during high-volume period.', assignee: 'Sarah Chen' },
  { id: 'CMP-005', clientName: 'James Osei',          category: 'Product Mismatch', severity: 'Low',      status: 'Resolved',  submittedAt: '2026-03-15', description: 'Recommended business card rejected by issuer.', evidence: ['application_pdf.pdf'], rootCause: 'Issuer eligibility data stale (24h lag).', assignee: 'Michael Torres' },
  { id: 'CMP-006', clientName: 'Sandra Liu',          category: 'Data Privacy',     severity: 'Critical', status: 'Escalated', submittedAt: '2026-03-12', description: 'Personal data shared with third-party without consent.', evidence: ['data_sharing_log.csv', 'consent_audit.pdf'], rootCause: 'Consent flag misconfiguration in partner API v1.8.', assignee: 'Emily Park' },
  { id: 'CMP-007', clientName: 'Carlos Rivera',       category: 'Approval Denial',  severity: 'Medium',   status: 'Closed',    submittedAt: '2026-03-08', description: 'Adverse action notice not received within 30 days.', evidence: ['timeline_log.pdf'], rootCause: 'Email delivery failure; SMTP retry logic misconfigured.', assignee: 'Sarah Chen' },
  { id: 'CMP-008', clientName: 'Fatima Al-Hassan',    category: 'Billing',          severity: 'Low',      status: 'Open',      submittedAt: '2026-03-05', description: 'Double-charged for program fee in February.', evidence: ['invoice_feb26.pdf'], rootCause: 'Duplicate webhook event triggered billing system twice.', assignee: 'Michael Torres' },
];


const ROOT_CAUSE_ANALYTICS = [
  { category: 'Disclosure Gaps',       count: 14, pct: 32, color: '#ef4444' },
  { category: 'Model / Data Quality',  count: 9,  pct: 20, color: '#C9A84C' },
  { category: 'Advisor Process',       count: 8,  pct: 18, color: '#f97316' },
  { category: 'System / API Bug',      count: 7,  pct: 16, color: '#3b82f6' },
  { category: 'Partner Integration',   count: 6,  pct: 14, color: '#8b5cf6' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TODAY = new Date('2026-04-01');

function severityBadge(s: Severity): string {
  if (s === 'Critical') return 'bg-red-900/60 text-red-300 border border-red-700';
  if (s === 'High')     return 'bg-orange-900/50 text-orange-300 border border-orange-700';
  if (s === 'Medium')   return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
  return 'bg-gray-800 text-gray-400 border border-gray-700';
}

function statusBadge(s: ComplaintStatus): string {
  if (s === 'Escalated') return 'bg-red-900/40 text-red-300';
  if (s === 'Open')      return 'bg-orange-900/40 text-orange-300';
  if (s === 'In Review') return 'bg-blue-900/40 text-blue-300';
  if (s === 'Resolved')  return 'bg-emerald-900/40 text-emerald-300';
  return 'bg-gray-800 text-gray-400';
}

function regStatusBadge(status: InquiryStatus): string {
  if (status === 'open')               return 'bg-red-900/50 text-red-300';
  if (status === 'legal_hold')         return 'bg-orange-900/50 text-orange-300';
  if (status === 'response_drafted')   return 'bg-yellow-900/50 text-yellow-300';
  if (status === 'response_submitted') return 'bg-blue-900/50 text-blue-300';
  return 'bg-gray-800 text-gray-400';
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
}

function deadlineColor(days: number): string {
  if (days <= 7)  return 'text-red-400';
  if (days <= 14) return 'text-yellow-400';
  return 'text-emerald-400';
}

function getSLADueDate(submittedAt: string, severity: Severity): Date {
  const d = new Date(submittedAt);
  d.setDate(d.getDate() + SLA_DAYS[severity]);
  return d;
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
}

function LogComplaintModal({ open, onClose, onSubmit }: LogModalProps) {
  const [client, setClient] = useState<string>(CLIENTS[0]);
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [severity, setSeverity] = useState<Severity>('Medium');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState<string>(ADVISORS[0]);

  if (!open) return null;

  const handleSubmit = () => {
    if (!description.trim()) return;
    const nextId = `CMP-${String(Date.now()).slice(-3).padStart(3, '0')}`;
    const complaint: Complaint = {
      id: nextId,
      clientName: client,
      category,
      severity,
      status: 'Open',
      submittedAt: formatDate(TODAY),
      description: description.trim(),
      evidence: [],
      rootCause: '',
      assignee,
    };
    onSubmit(complaint);
    setDescription('');
    onClose();
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
            <select id="complaints-client" value={client} onChange={(e) => setClient(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
              {CLIENTS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-medium" htmlFor="complaints-category">Category</label>
              <select id="complaints-category" value={category} onChange={(e) => setCategory(e.target.value as Category)} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-medium" htmlFor="complaints-severity">Severity</label>
              <select id="complaints-severity" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
                {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium" htmlFor="complaints-description">Description</label>
            <textarea id="complaints-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe the complaint..." className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C] resize-none" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1 font-medium" htmlFor="complaints-assignee">Assignee</label>
            <select id="complaints-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
              {ADVISORS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-700 text-gray-400 text-sm hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={!description.trim()} className="px-5 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] disabled:opacity-40 disabled:cursor-not-allowed text-[#0A1628] text-sm font-semibold transition-colors">Log Complaint</button>
        </div>
      </div>
    </div>
  );
}

// ─── Regulatory Response Generator ───────────────────────────────────────────

function RegulatoryResponseGenerator({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
  const template = `Dear ${complaint.clientName},

We are writing to acknowledge receipt of your complaint (Reference: ${complaint.id}), filed on ${complaint.submittedAt}, regarding ${complaint.category.toLowerCase()} concerns.

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
      const matchSearch = c.clientName.toLowerCase().includes(search.toLowerCase()) ||
        c.category.toLowerCase().includes(search.toLowerCase()) ||
        c.id.toLowerCase().includes(search.toLowerCase());
      const matchRoot = !rootCauseFilter || c.rootCause.toLowerCase().includes(rootCauseFilter.toLowerCase());
      return matchSev && matchStatus && matchSearch && matchRoot;
    });
  }, [complaints, filterSev, filterStatus, search, rootCauseFilter]);

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
            {filtered.map((c) => {
              const dueDate = getSLADueDate(c.submittedAt, c.severity);
              const daysLeft = daysBetween(TODAY, dueDate);
              const overdue = daysLeft < 0;
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
                      {c.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge(c.status)}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">{c.submittedAt}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold tabular-nums ${overdue ? 'text-red-400' : daysLeft <= 2 ? 'text-red-400' : 'text-gray-400'}`}>
                      {formatDate(dueDate)}
                      {overdue && <span className="ml-1 text-[10px]">({Math.abs(daysLeft)}d late)</span>}
                      {!overdue && daysLeft <= 2 && <span className="ml-1 text-[10px]">({daysLeft}d)</span>}
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
      </div>
    </div>
  );
}

function RootCauseAnalytics({ onCategoryClick }: { onCategoryClick: (cat: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      {ROOT_CAUSE_ANALYTICS.map((item) => (
        <div
          key={item.category}
          onClick={() => onCategoryClick(item.category)}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2 cursor-pointer hover:border-gray-600 transition-colors"
        >
          <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{item.category}</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: item.color }}>{item.count}</p>
          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${item.pct}%`, backgroundColor: item.color }} />
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

interface EvidencePanelProps {
  complaint: Complaint | null;
  onUpdateComplaint: (updated: Complaint) => void;
  onShowToast: (msg: string) => void;
}

function EvidencePanel({ complaint, onUpdateComplaint, onShowToast }: EvidencePanelProps) {
  const [showResponseGen, setShowResponseGen] = useState(false);

  if (!complaint) {
    return (
      <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center text-gray-600 text-sm">
        Select a complaint to view evidence and root cause details.
      </div>
    );
  }

  const dueDate = getSLADueDate(complaint.submittedAt, complaint.severity);
  const daysLeft = daysBetween(TODAY, dueDate);
  const overdue = daysLeft < 0;
  const activities = MOCK_ACTIVITIES[complaint.id] || [{ date: complaint.submittedAt, action: 'Complaint logged', user: 'System' }];

  const handleStartInvestigation = () => {
    onUpdateComplaint({ ...complaint, status: 'In Review' });
    onShowToast(`${complaint.id} moved to In Review`);
  };

  const handleEscalate = () => {
    onUpdateComplaint({ ...complaint, status: 'Escalated' });
    onShowToast(`${complaint.id} escalated`);
  };

  const handleResolve = () => {
    onUpdateComplaint({ ...complaint, status: 'Resolved' });
    onShowToast(`${complaint.id} marked as Resolved`);
  };

  const handleRootCauseChange = (value: string) => {
    onUpdateComplaint({ ...complaint, rootCause: value });
  };

  const handleAttachEvidence = () => {
    const newFile = `evidence_${Date.now().toString(36)}.pdf`;
    onUpdateComplaint({ ...complaint, evidence: [...complaint.evidence, newFile] });
    onShowToast('Evidence file attached');
  };

  return (
    <>
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-[#C9A84C]">{complaint.id}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${severityBadge(complaint.severity)}`}>{complaint.severity}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge(complaint.status)}`}>{complaint.status}</span>
            </div>
            <p className="text-sm font-semibold text-gray-100 mt-1">{complaint.clientName} — {complaint.category}</p>
          </div>
        </div>

        {/* SLA Countdown */}
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${overdue ? 'bg-red-900/30 border border-red-800' : daysLeft <= 2 ? 'bg-red-900/20 border border-red-800/50' : 'bg-gray-800 border border-gray-700'}`}>
          <div className="flex-1">
            <p className="text-[10px] text-gray-400 uppercase font-medium">SLA Response Due</p>
            <p className="text-sm font-semibold text-gray-200 tabular-nums">{formatDate(dueDate)}</p>
          </div>
          <div className="text-right">
            <p className={`text-xl font-black tabular-nums ${overdue || daysLeft <= 2 ? 'text-red-400' : 'text-emerald-400'}`}>
              {overdue ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
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
            <p className="text-xs text-gray-500 font-medium">Evidence Files ({complaint.evidence.length})</p>
            <button onClick={handleAttachEvidence} className="text-[10px] px-2 py-1 rounded bg-[#C9A84C]/20 text-[#C9A84C] font-medium hover:bg-[#C9A84C]/30 transition-colors">
              + Attach Evidence
            </button>
          </div>
          <div className="space-y-1.5">
            {complaint.evidence.map((file) => (
              <div key={file} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer">
                <span className="text-xs font-mono text-gray-300">{file}</span>
                <button className="text-xs text-[#C9A84C] hover:underline">Download</button>
              </div>
            ))}
          </div>
        </div>

        {/* Root Cause Dropdown */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">Root Cause</p>
          <select aria-label="Root cause"
            value={complaint.rootCause}
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
          {complaint.status === 'Open' && (
            <button onClick={handleStartInvestigation} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors">
              Start Investigation
            </button>
          )}
          {complaint.status === 'In Review' && (
            <>
              <button onClick={handleEscalate} className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
                Escalate
              </button>
              <button onClick={handleResolve} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors">
                Mark Resolved
              </button>
            </>
          )}
          {(complaint.status === 'Escalated') && (
            <button onClick={handleResolve} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors">
              Mark Resolved
            </button>
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
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
      const res = await fetch('/api/regulator/inquiries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          matterType,
          agencyName: agencyName.trim(),
          description: description.trim(),
          severity,
          // Omitted rather than sent empty: the server treats these as absent,
          // and an empty string is a different claim from "not provided".
          ...(referenceNumber.trim() ? { referenceNumber: referenceNumber.trim() } : {}),
          ...(responseDueDate ? { responseDueDate } : {}),
          ...(assignedCounsel.trim() ? { assignedCounsel: assignedCounsel.trim() } : {}),
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: { message?: string };
      };

      if (!res.ok || json.success !== true) {
        setError(json.error?.message ?? `The inquiry was not saved (HTTP ${res.status}).`);
        return;
      }

      onCreated();
      onClose();
    } catch {
      // Not a success toast: nothing reached the server.
      setError('Could not reach the server; the inquiry was not saved.');
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
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
      const res = await fetch('/api/regulator/inquiries', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = (await res.json()) as { success?: boolean; data?: unknown };

      if (!res.ok || json.success !== true) {
        setState('error');
        return;
      }
      const loaded = toInquiryViews(json.data);
      setInquiries(loaded);
      onOpenCountChange?.(loaded.filter((i) => i.status !== 'closed').length);
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
  const [complaints, setComplaints] = useState<Complaint[]>(INITIAL_COMPLAINTS);
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

  const open       = clientFiltered.filter((c) => c.status === 'Open' || c.status === 'Escalated').length;
  const critical   = clientFiltered.filter((c) => c.severity === 'Critical').length;
  // Reported by the inquiries panel once it has loaded, rather than counted
  // from a constant. Null until then: "0 open matters" is a claim, and it was
  // previously a fixed 3 regardless of what the tenant actually had.
  const [regulatory, setRegulatory] = useState<number | null>(null);

  const handleExportCSV = () => {
    const headers = ['ID', 'Client', 'Category', 'Severity', 'Status', 'Submitted', 'SLA Due', 'Description', 'Root Cause', 'Assignee'];
    const rows = clientFiltered.map((c) => {
      const due = formatDate(getSLADueDate(c.submittedAt, c.severity));
      return [c.id, c.clientName, c.category, c.severity, c.status, c.submittedAt, due, `"${c.description.replace(/"/g, '""')}"`, `"${c.rootCause.replace(/"/g, '""')}"`, c.assignee];
    });
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadBlob(csv, `complaints_export_${formatDate(TODAY)}.csv`, 'text/csv');
    setToastMsg('CSV report downloaded');
  };

  const handleLogComplaint = (c: Complaint) => {
    setComplaints((prev) => [c, ...prev]);
    setToastMsg(`Complaint ${c.id} logged`);
  };

  const handleUpdateComplaint = (updated: Complaint) => {
    setComplaints((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    setSelectedComplaint(updated);
  };

  const handleRootCauseClick = (analyticsCategory: string) => {
    const pattern = ROOT_CAUSE_MAP[analyticsCategory];
    if (pattern) {
      setRootCauseFilter(pattern === rootCauseFilter ? null : pattern);
    }
  };

  const allClients = useMemo(() => {
    const names = new Set(complaints.map((c) => c.clientName));
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
          { label: 'Resolved (30d)',          value: 12,         color: 'text-emerald-400' },
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
        <RootCauseAnalytics onCategoryClick={handleRootCauseClick} />
      </section>

      {/* ── Complaints table + Evidence panel ──────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2" aria-label="Complaints Table">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">All Complaints</h2>
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
        </section>

        <section aria-label="Evidence Panel">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Evidence & Detail</h2>
          <EvidencePanel
            complaint={selectedComplaint}
            onUpdateComplaint={handleUpdateComplaint}
            onShowToast={setToastMsg}
          />
        </section>
      </div>

      {/* ── Regulatory Inquiries ────────────────────────────────── */}
      <section aria-label="Regulatory Inquiries">
        <RegulatoryInquiries onOpenCountChange={setRegulatory} />
      </section>

      {/* ── Log Complaint Modal ─────────────────────────────────── */}
      <LogComplaintModal open={showLogModal} onClose={() => setShowLogModal(false)} onSubmit={handleLogComplaint} />

      {/* ── Toast ───────────────────────────────────────────────── */}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}

    </div>
  );
}
