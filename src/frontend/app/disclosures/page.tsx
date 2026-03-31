'use client';

// ============================================================
// /disclosures — Disclosure CMS
// Template library table, create/approve workflow,
// preview panel, version history.
// ============================================================

import { useState } from 'react';

// ─── Types & Mock data ────────────────────────────────────────────────────────

type DisclosureStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Deprecated';
type DisclosureCategory = 'APR & Fees' | 'ECOA Rights' | 'FCRA Summary' | 'Privacy Notice' | 'Adverse Action' | 'Truth in Lending' | 'UDAAP Statement';

interface DisclosureTemplate {
  id: string;
  name: string;
  state: string;
  category: DisclosureCategory;
  version: string;
  status: DisclosureStatus;
  lastModified: string;
  author: string;
  approvedBy: string | null;
  wordCount: number;
  content: string;
}

interface VersionHistoryEntry {
  version: string;
  modifiedAt: string;
  author: string;
  changeSummary: string;
  status: DisclosureStatus;
}

const TEMPLATES: DisclosureTemplate[] = [
  { id: 'dis-001', name: 'Standard APR Disclosure',        state: 'Federal',    category: 'APR & Fees',        version: '3.2', status: 'Approved',          lastModified: '2026-02-14', author: 'Legal Team',    approvedBy: 'CCO',        wordCount: 480,  content: 'Annual Percentage Rate (APR) for purchases is 18.99%. This APR will vary with the market based on the Prime Rate. See terms for details on penalty APR and minimum interest charge.' },
  { id: 'dis-002', name: 'ECOA Rights — English',          state: 'Federal',    category: 'ECOA Rights',       version: '2.1', status: 'Approved',          lastModified: '2026-01-08', author: 'Compliance',    approvedBy: 'CCO',        wordCount: 320,  content: 'The Equal Credit Opportunity Act prohibits creditors from discriminating against credit applicants on the basis of race, color, religion, national origin, sex, marital status, age...' },
  { id: 'dis-003', name: 'California Privacy Notice',      state: 'CA',         category: 'Privacy Notice',    version: '4.0', status: 'Pending Approval',  lastModified: '2026-03-28', author: 'Sarah Chen',    approvedBy: null,         wordCount: 1240, content: 'Under the California Consumer Privacy Act (CCPA), you have the right to know about the personal information a business collects about you and how it is used and shared...' },
  { id: 'dis-004', name: 'Adverse Action Notice',          state: 'Federal',    category: 'Adverse Action',    version: '1.5', status: 'Approved',          lastModified: '2025-11-12', author: 'Legal Team',    approvedBy: 'GC',         wordCount: 560,  content: 'We have taken an adverse action on your credit application. The primary reasons for this decision include: insufficient credit history, high utilization ratio...' },
  { id: 'dis-005', name: 'Texas APR & Fees Addendum',      state: 'TX',         category: 'APR & Fees',        version: '1.0', status: 'Draft',             lastModified: '2026-03-30', author: 'Marcus Williams', approvedBy: null,       wordCount: 210,  content: 'Texas residents: additional fee disclosures required by the Texas Finance Code apply to this account. See Schedule A for itemized fee listing.' },
  { id: 'dis-006', name: 'FCRA Summary of Rights',         state: 'Federal',    category: 'FCRA Summary',      version: '2.0', status: 'Approved',          lastModified: '2025-09-01', author: 'Legal Team',    approvedBy: 'CCO',        wordCount: 890,  content: 'A summary of your rights under the Fair Credit Reporting Act: You have the right to know what is in your file. You may request and obtain all the information about you...' },
  { id: 'dis-007', name: 'NY Truth in Lending',            state: 'NY',         category: 'Truth in Lending',  version: '2.3', status: 'Pending Approval',  lastModified: '2026-03-25', author: 'Priya Nair',    approvedBy: null,         wordCount: 720,  content: 'New York disclosure: The Annual Percentage Rate shown reflects New York state usury law compliance. The maximum APR permitted in New York for this product type is...' },
  { id: 'dis-008', name: 'UDAAP Policy Statement',         state: 'Federal',    category: 'UDAAP Statement',   version: '1.1', status: 'Deprecated',        lastModified: '2025-06-15', author: 'Compliance',    approvedBy: 'CCO',        wordCount: 640,  content: '[DEPRECATED] This version has been superseded by v1.2. Unfair, Deceptive, or Abusive Acts or Practices policy statement — see updated version.' },
  { id: 'dis-009', name: 'Florida Privacy Addendum',       state: 'FL',         category: 'Privacy Notice',    version: '1.0', status: 'Draft',             lastModified: '2026-03-31', author: 'James Okafor',  approvedBy: null,         wordCount: 380,  content: 'Florida residents have the following privacy rights under state law in addition to federal protections. This notice applies to all personal information collected through...' },
];

const VERSION_HISTORY: Record<string, VersionHistoryEntry[]> = {
  'dis-001': [
    { version: '3.2', modifiedAt: '2026-02-14', author: 'Legal Team',    changeSummary: 'Updated Prime Rate reference language.',       status: 'Approved' },
    { version: '3.1', modifiedAt: '2025-11-02', author: 'Compliance',    changeSummary: 'Added penalty APR disclosure per CFPB guidance.', status: 'Approved' },
    { version: '3.0', modifiedAt: '2025-06-18', author: 'Legal Team',    changeSummary: 'Major rewrite for clarity and TILA alignment.',   status: 'Approved' },
    { version: '2.4', modifiedAt: '2025-01-10', author: 'CCO',           changeSummary: 'Minor language cleanup.',                       status: 'Deprecated' },
  ],
  'dis-003': [
    { version: '4.0', modifiedAt: '2026-03-28', author: 'Sarah Chen',    changeSummary: 'Updated for CPRA amendments effective Jan 2026.', status: 'Pending Approval' },
    { version: '3.2', modifiedAt: '2025-08-14', author: 'Legal Team',    changeSummary: 'Added data broker opt-out language.',            status: 'Approved' },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(s: DisclosureStatus): string {
  if (s === 'Approved')         return 'bg-emerald-900/50 text-emerald-300 border border-emerald-700';
  if (s === 'Pending Approval') return 'bg-yellow-900/50 text-yellow-300 border border-yellow-700';
  if (s === 'Draft')            return 'bg-blue-900/50 text-blue-300 border border-blue-700';
  return 'bg-gray-800 text-gray-500 border border-gray-700';
}

function stateBadge(state: string): string {
  if (state === 'Federal') return 'bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40';
  return 'bg-gray-800 text-gray-300 border border-gray-700';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TemplateLibraryTable({
  onSelect,
  selected,
}: {
  onSelect: (t: DisclosureTemplate) => void;
  selected: string | null;
}) {
  const [filterStatus, setFilterStatus] = useState<DisclosureStatus | 'All'>('All');
  const [filterCategory, setFilterCategory] = useState<DisclosureCategory | 'All'>('All');
  const [search, setSearch] = useState('');

  const filtered = TEMPLATES.filter((t) => {
    const matchStatus   = filterStatus === 'All' || t.status === filterStatus;
    const matchCategory = filterCategory === 'All' || t.category === filterCategory;
    const matchSearch   = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.state.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchCategory && matchSearch;
  });

  const categories: DisclosureCategory[] = ['APR & Fees', 'ECOA Rights', 'FCRA Summary', 'Privacy Notice', 'Adverse Action', 'Truth in Lending', 'UDAAP Statement'];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
        >
          <option value="All">All Statuses</option>
          {(['Draft','Pending Approval','Approved','Deprecated'] as DisclosureStatus[]).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as typeof filterCategory)}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
        >
          <option value="All">All Categories</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-semibold">Template Name</th>
              <th className="px-4 py-3 text-left font-semibold">State</th>
              <th className="px-4 py-3 text-left font-semibold">Category</th>
              <th className="px-4 py-3 text-right font-semibold">Version</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Last Modified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((t) => (
              <tr
                key={t.id}
                onClick={() => onSelect(t)}
                className={`transition-colors cursor-pointer ${
                  selected === t.id ? 'bg-[#C9A84C]/5' : 'bg-gray-950 hover:bg-gray-900'
                }`}
              >
                <td className="px-4 py-3 font-medium text-gray-100">{t.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${stateBadge(t.state)}`}>{t.state}</span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{t.category}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-gray-300">v{t.version}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge(t.status)}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">{t.lastModified}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateApproveWorkflow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const STEPS = ['Compose', 'Review', 'Submit'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">New Disclosure Template</h2>
            <p className="text-xs text-gray-500 mt-0.5">Step {step} of 3: {STEPS[step - 1]}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                i + 1 < step ? 'bg-emerald-600 text-white' : i + 1 === step ? 'bg-[#C9A84C] text-[#0A1628]' : 'bg-gray-700 text-gray-500'
              }`}>{i + 1 < step ? '✓' : i + 1}</div>
              <span className={`text-xs ${i + 1 === step ? 'text-gray-200 font-semibold' : 'text-gray-500'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-gray-700" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-gray-400 font-medium">Template Name</label>
                <input className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]" placeholder="e.g. Arizona APR Disclosure" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">State / Jurisdiction</label>
                <input className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]" placeholder="AZ" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Category</label>
                <select className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]">
                  <option>APR & Fees</option>
                  <option>ECOA Rights</option>
                  <option>Privacy Notice</option>
                  <option>Adverse Action</option>
                  <option>Truth in Lending</option>
                </select>
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-gray-400 font-medium">Disclosure Content</label>
                <textarea rows={5} className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C] resize-none" placeholder="Enter disclosure language…" />
              </div>
            </div>
            <button onClick={() => setStep(2)} className="w-full px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
              Continue to Review
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="rounded-lg bg-gray-800 border border-gray-700 p-4">
              <p className="text-xs text-gray-500 mb-2 font-medium">Preview — Draft v1.0</p>
              <p className="text-sm text-gray-300">Your disclosure content will appear here for final review before submission to the approval queue.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
                Back
              </button>
              <button onClick={() => setStep(3)} className="flex-1 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
                Submit for Approval
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-900/30 border border-emerald-700 p-4 text-emerald-300 text-sm space-y-1">
              <p className="font-semibold">Submitted for Approval</p>
              <p className="text-xs">Template queued for CCO review. You will be notified when approved.</p>
            </div>
            <button onClick={onClose} className="w-full px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium transition-colors">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewPanel({ template }: { template: DisclosureTemplate | null }) {
  if (!template) {
    return (
      <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center text-gray-600 text-sm">
        Select a template to preview content and version history.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-100">{template.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{template.state} · {template.category} · v{template.version}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge(template.status)}`}>
              {template.status}
            </span>
            {template.status === 'Pending Approval' && (
              <button className="text-xs px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold transition-colors">
                Approve
              </button>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-gray-800 border border-gray-700 p-4">
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Content Preview</p>
          <p className="text-sm text-gray-300 leading-relaxed">{template.content}</p>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{template.wordCount} words · Last modified {template.lastModified} by {template.author}</span>
          {template.approvedBy && <span>Approved by {template.approvedBy}</span>}
        </div>

        <div className="flex gap-2">
          <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
            Edit Draft
          </button>
          <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
            Export PDF
          </button>
          <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
            Clone
          </button>
        </div>
      </div>

      {/* Version history */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Version History</h4>
        {(VERSION_HISTORY[template.id] ?? [{ version: template.version, modifiedAt: template.lastModified, author: template.author, changeSummary: 'Initial version.', status: template.status }]).map((v) => (
          <div key={v.version} className="flex items-start gap-3 text-xs">
            <span className="font-mono text-[#C9A84C] flex-shrink-0 w-8">v{v.version}</span>
            <div className="flex-1 space-y-0.5">
              <p className="text-gray-300">{v.changeSummary}</p>
              <p className="text-gray-600">{v.modifiedAt} · {v.author}</p>
            </div>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${statusBadge(v.status)}`}>
              {v.status}
            </span>
          </div>
        ))}
        <p className="text-[10px] text-gray-600">Placeholder — connect to /api/disclosures/{template.id}/versions</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DisclosuresPage() {
  const [selected, setSelected] = useState<DisclosureTemplate | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const pending = TEMPLATES.filter((t) => t.status === 'Pending Approval').length;
  const approved = TEMPLATES.filter((t) => t.status === 'Approved').length;
  const drafts = TEMPLATES.filter((t) => t.status === 'Draft').length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {showCreate && <CreateApproveWorkflow onClose={() => setShowCreate(false)} />}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Disclosure CMS</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Manage regulatory disclosure templates, approval workflows, and version control.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Export All
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
          >
            + New Template
          </button>
        </div>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Templates',     value: TEMPLATES.length, color: 'text-white'        },
          { label: 'Approved',            value: approved,         color: 'text-emerald-400'  },
          { label: 'Pending Approval',    value: pending,          color: 'text-yellow-400'   },
          { label: 'Drafts',             value: drafts,           color: 'text-blue-400'     },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{c.label}</p>
            <p className={`text-3xl font-black tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── Main grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Template library table — 3 cols */}
        <section className="xl:col-span-3" aria-label="Template Library">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Template Library</h2>
          <TemplateLibraryTable onSelect={setSelected} selected={selected?.id ?? null} />
        </section>

        {/* Preview + Version history — 2 cols */}
        <section className="xl:col-span-2" aria-label="Preview and Version History">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Preview & History</h2>
          <PreviewPanel template={selected} />
        </section>

      </div>

    </div>
  );
}
