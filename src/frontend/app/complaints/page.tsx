'use client';

// ============================================================
// /complaints — Complaints Management
// Complaints table, root cause analytics, evidence panel,
// regulator inquiry section with deadline countdown.
// ============================================================

import { useState, useEffect } from 'react';

// ─── Types & Mock data ────────────────────────────────────────────────────────

type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
type ComplaintStatus = 'Open' | 'In Review' | 'Escalated' | 'Resolved' | 'Closed';
type Category = 'Billing' | 'Disclosure' | 'Fair Lending' | 'Product Mismatch' | 'Advisor Conduct' | 'Data Privacy' | 'Approval Denial';

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

const COMPLAINTS: Complaint[] = [
  { id: 'CMP-001', clientName: 'Marcus Bell',         category: 'Billing',          severity: 'High',     status: 'Open',      submittedAt: '2026-03-28', description: 'Charged origination fee not disclosed in agreement.', evidence: ['contract_v2.pdf', 'statement_mar26.pdf'], rootCause: 'Fee disclosure gap in onboarding template v3.1.' },
  { id: 'CMP-002', clientName: 'Aisha Johnson',       category: 'Fair Lending',     severity: 'Critical', status: 'Escalated', submittedAt: '2026-03-25', description: 'Alleges denial was based on zip code, not creditworthiness.', evidence: ['denial_letter.pdf', 'fico_report.pdf', 'geo_analysis.csv'], rootCause: 'Geographic proxy variable in legacy model flagged by ECOA audit.' },
  { id: 'CMP-003', clientName: 'Derek Huang',         category: 'Disclosure',       severity: 'Medium',   status: 'In Review', submittedAt: '2026-03-22', description: 'APR not clearly stated in digital consent flow.', evidence: ['consent_screenshot.png'], rootCause: 'Mobile disclosure screen truncated APR on small viewports.' },
  { id: 'CMP-004', clientName: 'Priya Mehta',         category: 'Advisor Conduct',  severity: 'High',     status: 'In Review', submittedAt: '2026-03-20', description: 'Advisor recommended card without explaining terms.', evidence: ['call_recording_id_8821.mp3'], rootCause: 'Suitability checklist skipped during high-volume period.' },
  { id: 'CMP-005', clientName: 'James Osei',          category: 'Product Mismatch', severity: 'Low',      status: 'Resolved',  submittedAt: '2026-03-15', description: 'Recommended business card rejected by issuer.', evidence: ['application_pdf.pdf'], rootCause: 'Issuer eligibility data stale (24h lag).' },
  { id: 'CMP-006', clientName: 'Sandra Liu',          category: 'Data Privacy',     severity: 'Critical', status: 'Escalated', submittedAt: '2026-03-12', description: 'Personal data shared with third-party without consent.', evidence: ['data_sharing_log.csv', 'consent_audit.pdf'], rootCause: 'Consent flag misconfiguration in partner API v1.8.' },
  { id: 'CMP-007', clientName: 'Carlos Rivera',       category: 'Approval Denial',  severity: 'Medium',   status: 'Closed',    submittedAt: '2026-03-08', description: 'Adverse action notice not received within 30 days.', evidence: ['timeline_log.pdf'], rootCause: 'Email delivery failure; SMTP retry logic misconfigured.' },
  { id: 'CMP-008', clientName: 'Fatima Al-Hassan',    category: 'Billing',          severity: 'Low',      status: 'Open',      submittedAt: '2026-03-05', description: 'Double-charged for program fee in February.', evidence: ['invoice_feb26.pdf'], rootCause: 'Duplicate webhook event triggered billing system twice.' },
];

const REGULATORY_INQUIRIES: RegulatoryInquiry[] = [
  { id: 'REG-001', regulator: 'CFPB',  caseRef: 'CFPB-2026-00341', subject: 'Fair Lending Practices Review', deadlineDate: '2026-04-15', status: 'Pending Response', attachments: 4 },
  { id: 'REG-002', regulator: 'FTC',   caseRef: 'FTC-26-8812',      subject: 'Disclosure Adequacy — Digital Consent', deadlineDate: '2026-04-28', status: 'Under Review', attachments: 7 },
  { id: 'REG-003', regulator: 'FDIC',  caseRef: 'FDIC-EX-2026-19',  subject: 'Bank Partner Compliance Exam',  deadlineDate: '2026-05-10', status: 'Pending Response', attachments: 2 },
  { id: 'REG-004', regulator: 'State AG', caseRef: 'CA-AG-26-004',  subject: 'Data Privacy — CCPA Complaint', deadlineDate: '2026-04-08', status: 'Responded',      attachments: 9 },
];

const ROOT_CAUSE_ANALYTICS = [
  { category: 'Disclosure Gaps',       count: 14, pct: 32, color: '#ef4444' },
  { category: 'Model / Data Quality',  count: 9,  pct: 20, color: '#C9A84C' },
  { category: 'Advisor Process',       count: 8,  pct: 18, color: '#f97316' },
  { category: 'System / API Bug',      count: 7,  pct: 16, color: '#3b82f6' },
  { category: 'Partner Integration',   count: 6,  pct: 14, color: '#8b5cf6' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function regStatusBadge(s: RegulatoryInquiry['status']): string {
  if (s === 'Pending Response') return 'bg-red-900/50 text-red-300';
  if (s === 'Under Review')     return 'bg-yellow-900/50 text-yellow-300';
  if (s === 'Responded')        return 'bg-blue-900/50 text-blue-300';
  return 'bg-gray-800 text-gray-400';
}

function daysUntil(dateStr: string): number {
  const now = new Date('2026-03-31');
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function deadlineColor(days: number): string {
  if (days <= 7)  return 'text-red-400';
  if (days <= 14) return 'text-yellow-400';
  return 'text-emerald-400';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ComplaintsTable({ onSelect }: { onSelect: (c: Complaint) => void }) {
  const [filterSev, setFilterSev] = useState<Severity | 'All'>('All');
  const [filterStatus, setFilterStatus] = useState<ComplaintStatus | 'All'>('All');
  const [search, setSearch] = useState('');

  const filtered = COMPLAINTS.filter((c) => {
    const matchSev = filterSev === 'All' || c.severity === filterSev;
    const matchStatus = filterStatus === 'All' || c.status === filterStatus;
    const matchSearch = c.clientName.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase());
    return matchSev && matchStatus && matchSearch;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search ID, client, category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
        />
        <select
          value={filterSev}
          onChange={(e) => setFilterSev(e.target.value as typeof filterSev)}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
        >
          <option value="All">All Severities</option>
          {(['Critical','High','Medium','Low'] as Severity[]).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
        >
          <option value="All">All Statuses</option>
          {(['Open','In Review','Escalated','Resolved','Closed'] as ComplaintStatus[]).map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((c) => (
              <tr
                key={c.id}
                onClick={() => onSelect(c)}
                className="bg-gray-950 hover:bg-gray-900 transition-colors cursor-pointer"
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RootCauseAnalytics() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      {ROOT_CAUSE_ANALYTICS.map((item) => (
        <div key={item.category} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
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

function EvidencePanel({ complaint }: { complaint: Complaint | null }) {
  if (!complaint) {
    return (
      <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center text-gray-600 text-sm">
        Select a complaint to view evidence and root cause details.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#C9A84C]">{complaint.id}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${severityBadge(complaint.severity)}`}>{complaint.severity}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge(complaint.status)}`}>{complaint.status}</span>
          </div>
          <p className="text-sm font-semibold text-gray-100 mt-1">{complaint.clientName} — {complaint.category}</p>
        </div>
        <button className="text-xs px-3 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] font-semibold transition-colors">
          Escalate
        </button>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-gray-500 font-medium">Description</p>
        <p className="text-sm text-gray-300">{complaint.description}</p>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-gray-500 font-medium">Root Cause</p>
        <p className="text-sm text-amber-300">{complaint.rootCause}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-gray-500 font-medium">Evidence Files ({complaint.evidence.length})</p>
        <div className="space-y-1.5">
          {complaint.evidence.map((file) => (
            <div key={file} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer">
              <span className="text-xs font-mono text-gray-300">{file}</span>
              <button className="text-xs text-[#C9A84C] hover:underline">Download</button>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-gray-600">Placeholder — connect to /api/complaints/{complaint.id}</p>
    </div>
  );
}

function RegulatoryInquiries() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Regulator Inquiries</h3>
          <p className="text-xs text-gray-500 mt-0.5">Active regulatory matters requiring response.</p>
        </div>
        <button className="px-4 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-xs font-semibold transition-colors">
          + Log Inquiry
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {REGULATORY_INQUIRIES.map((inq) => {
          const days = daysUntil(inq.deadlineDate);
          return (
            <div key={inq.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-[#0A1628] border border-[#C9A84C]/40 text-[#C9A84C]">
                      {inq.regulator}
                    </span>
                    <span className="font-mono text-[10px] text-gray-500">{inq.caseRef}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-100 mt-1">{inq.subject}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${regStatusBadge(inq.status)}`}>
                  {inq.status}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-500">Deadline</p>
                  <p className="text-sm font-semibold text-gray-200 tabular-nums">{inq.deadlineDate}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500">Days remaining</p>
                  <p className={`text-xl font-black tabular-nums ${deadlineColor(days)}`}>{days}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{inq.attachments} attachments</span>
                <div className="flex gap-2">
                  <button className="text-[#C9A84C] hover:underline">Upload</button>
                  <button className="text-[#C9A84C] hover:underline">Respond</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-600">Placeholder — connect to /api/complaints/regulatory-inquiries</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComplaintsPage() {
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  const open       = COMPLAINTS.filter((c) => c.status === 'Open' || c.status === 'Escalated').length;
  const critical   = COMPLAINTS.filter((c) => c.severity === 'Critical').length;
  const regulatory = REGULATORY_INQUIRIES.filter((r) => r.status !== 'Closed').length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Complaints</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Track, investigate, and resolve client complaints and regulatory inquiries.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Export Report
          </button>
          <button className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
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
            <p className={`text-3xl font-black tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── Root Cause Analytics ────────────────────────────────── */}
      <section aria-label="Root Cause Analytics">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Root Cause Analytics (YTD)</h2>
        <RootCauseAnalytics />
      </section>

      {/* ── Complaints table + Evidence panel ──────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2" aria-label="Complaints Table">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">All Complaints</h2>
          <ComplaintsTable onSelect={setSelectedComplaint} />
        </section>

        <section aria-label="Evidence Panel">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Evidence & Detail</h2>
          <EvidencePanel complaint={selectedComplaint} />
        </section>
      </div>

      {/* ── Regulatory Inquiries ────────────────────────────────── */}
      <section aria-label="Regulatory Inquiries">
        <RegulatoryInquiries />
      </section>

    </div>
  );
}
