'use client';

// ============================================================
// /disclosures — Disclosure CMS
// Template library table, create/approve workflow,
// preview panel, version history, send-to-client, filters.
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

const INITIAL_TEMPLATES: DisclosureTemplate[] = [
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

const MOCK_CLIENTS = [
  { id: 'cli-001', name: 'Meridian Capital Group' },
  { id: 'cli-002', name: 'Apex Financial Services' },
  { id: 'cli-003', name: 'Silverline Credit Union' },
  { id: 'cli-004', name: 'Northstar Lending Corp' },
  { id: 'cli-005', name: 'Coastal Bank & Trust' },
];

const CATEGORIES: DisclosureCategory[] = ['APR & Fees', 'ECOA Rights', 'FCRA Summary', 'Privacy Notice', 'Adverse Action', 'Truth in Lending', 'UDAAP Statement'];

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

// ─── Toast component ─────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-900/90 border border-emerald-700 text-emerald-200 text-sm shadow-2xl animate-in">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 text-emerald-400 hover:text-emerald-200">x</button>
    </div>
  );
}

// ─── Send to Client Modal ────────────────────────────────────────────────────

function SendToClientModal({
  template,
  onClose,
  onSend,
}: {
  template: DisclosureTemplate;
  onClose: () => void;
  onSend: () => void;
}) {
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [channel, setChannel] = useState<'Email' | 'Portal'>('Email');

  const toggleClient = (id: string) => {
    setSelectedClients((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Send to Client</h2>
            <p className="text-xs text-gray-500 mt-0.5">Send "{template.name}" v{template.version}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">x</button>
        </div>

        {/* Client multi-select */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 font-medium">Select Clients</label>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {MOCK_CLIENTS.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 cursor-pointer hover:bg-gray-750 transition-colors">
                <input
                  type="checkbox"
                  checked={selectedClients.includes(c.id)}
                  onChange={() => toggleClient(c.id)}
                  className="accent-[#C9A84C] w-4 h-4"
                />
                <span className="text-sm text-gray-200">{c.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Channel radio */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 font-medium">Delivery Channel</label>
          <div className="flex gap-3">
            {(['Email', 'Portal'] as const).map((ch) => (
              <label key={ch} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="channel"
                  checked={channel === ch}
                  onChange={() => setChannel(ch)}
                  className="accent-[#C9A84C] w-4 h-4"
                />
                <span className="text-sm text-gray-200">{ch}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            if (selectedClients.length === 0) return;
            onSend();
          }}
          disabled={selectedClients.length === 0}
          className={`w-full px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            selectedClients.length === 0
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628]'
          }`}
        >
          Send to {selectedClients.length || 0} Client{selectedClients.length !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
}

// ─── Reject Reason Modal ────────────────────────────────────────────────────

function RejectModal({
  onClose,
  onReject,
}: {
  onClose: () => void;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">Reject Template</h2>
            <p className="text-xs text-gray-500 mt-0.5">Provide a reason for rejection</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">x</button>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400 font-medium">Rejection Reason</label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C] resize-none"
            placeholder="Describe why this template is being rejected..."
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { if (reason.trim()) onReject(reason.trim()); }}
            disabled={!reason.trim()}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              !reason.trim() ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-red-700 hover:bg-red-600 text-white'
            }`}
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TemplateLibraryTable({
  templates,
  onSelect,
  selected,
  onReplace,
}: {
  templates: DisclosureTemplate[];
  onSelect: (t: DisclosureTemplate) => void;
  selected: string | null;
  onReplace: (t: DisclosureTemplate) => void;
}) {
  const [filterStatus, setFilterStatus] = useState<DisclosureStatus | 'All'>('All');
  const [filterCategory, setFilterCategory] = useState<DisclosureCategory | 'All'>('All');
  const [search, setSearch] = useState('');

  const filtered = templates.filter((t) => {
    const matchStatus   = filterStatus === 'All' || t.status === filterStatus;
    const matchCategory = filterCategory === 'All' || t.category === filterCategory;
    const matchSearch   = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.state.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchCategory && matchSearch;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search templates..."
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
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
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
              <th className="px-4 py-3 text-left font-semibold">Actions</th>
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
                <td className="px-4 py-3">
                  {t.status === 'Deprecated' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onReplace(t); }}
                      className="text-[10px] px-2 py-1 rounded-lg bg-yellow-900/50 text-yellow-300 border border-yellow-700 font-semibold hover:bg-yellow-800/50 transition-colors"
                    >
                      Replace
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600 text-sm">No templates match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateApproveWorkflow({
  onClose,
  onSubmit,
  prefill,
}: {
  onClose: () => void;
  onSubmit: (data: { name: string; state: string; category: DisclosureCategory; content: string }) => void;
  prefill?: { name: string; state: string; category: DisclosureCategory; content: string } | null;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(prefill?.name ?? '');
  const [templateState, setTemplateState] = useState(prefill?.state ?? '');
  const [category, setCategory] = useState<DisclosureCategory>(prefill?.category ?? 'APR & Fees');
  const [content, setContent] = useState(prefill?.content ?? '');
  const [errors, setErrors] = useState<string[]>([]);

  const STEPS = ['Compose', 'Review', 'Submit'];

  const validate = (): boolean => {
    const errs: string[] = [];
    if (!name.trim()) errs.push('Template name is required.');
    if (!templateState.trim()) errs.push('State / Jurisdiction is required.');
    if (!content.trim()) errs.push('Disclosure content is required.');
    setErrors(errs);
    return errs.length === 0;
  };

  const handleContinue = () => {
    if (validate()) setStep(2);
  };

  const handleSubmit = () => {
    onSubmit({ name: name.trim(), state: templateState.trim(), category, content: content.trim() });
    setStep(3);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-100">{prefill ? 'Replace Deprecated Template' : 'New Disclosure Template'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Step {step} of 3: {STEPS[step - 1]}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">x</button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                i + 1 < step ? 'bg-emerald-600 text-white' : i + 1 === step ? 'bg-[#C9A84C] text-[#0A1628]' : 'bg-gray-700 text-gray-500'
              }`}>{i + 1 < step ? '\u2713' : i + 1}</div>
              <span className={`text-xs ${i + 1 === step ? 'text-gray-200 font-semibold' : 'text-gray-500'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-gray-700" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            {errors.length > 0 && (
              <div className="rounded-lg bg-red-900/30 border border-red-700 p-3">
                {errors.map((e, i) => <p key={i} className="text-xs text-red-300">{e}</p>)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-gray-400 font-medium">Template Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
                  placeholder="e.g. Arizona APR Disclosure"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">State / Jurisdiction</label>
                <input
                  value={templateState}
                  onChange={(e) => setTemplateState(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C]"
                  placeholder="AZ"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DisclosureCategory)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C]"
                >
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-gray-400 font-medium">Disclosure Content</label>
                <textarea
                  rows={5}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-[#C9A84C] resize-none"
                  placeholder="Enter disclosure language..."
                />
              </div>
            </div>
            <button onClick={handleContinue} className="w-full px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
              Continue to Review
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="rounded-lg bg-gray-800 border border-gray-700 p-4 space-y-3">
              <p className="text-xs text-gray-500 mb-2 font-medium">Review Summary</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-500">Name:</span> <span className="text-gray-200">{name}</span></div>
                <div><span className="text-gray-500">State:</span> <span className="text-gray-200">{templateState}</span></div>
                <div><span className="text-gray-500">Category:</span> <span className="text-gray-200">{category}</span></div>
                <div><span className="text-gray-500">Version:</span> <span className="text-gray-200">v1.0 (Draft)</span></div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-700">
                <p className="text-xs text-gray-500 mb-1 font-medium">Content Preview</p>
                <p className="text-sm text-gray-300 leading-relaxed">{content}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors">
                Back
              </button>
              <button onClick={handleSubmit} className="flex-1 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors">
                Submit for Approval
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-900/30 border border-emerald-700 p-4 text-emerald-300 text-sm space-y-1">
              <p className="font-semibold">Submitted for Approval</p>
              <p className="text-xs">Template &quot;{name}&quot; queued for CCO review. You will be notified when approved.</p>
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

function PreviewPanel({
  template,
  onApprove,
  onReject,
  onSendToClient,
  onNewVersion,
}: {
  template: DisclosureTemplate | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSendToClient: (t: DisclosureTemplate) => void;
  onNewVersion: (t: DisclosureTemplate) => void;
}) {
  if (!template) {
    return (
      <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center text-gray-600 text-sm">
        Select a template to preview content and version history.
      </div>
    );
  }

  const history = VERSION_HISTORY[template.id] ?? [
    { version: template.version, modifiedAt: template.lastModified, author: template.author, changeSummary: 'Initial version.', status: template.status },
  ];

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-100">{template.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{template.state} &middot; {template.category} &middot; v{template.version}</p>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusBadge(template.status)}`}>
            {template.status}
          </span>
        </div>

        <div className="rounded-lg bg-gray-800 border border-gray-700 p-4">
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Content Preview</p>
          <p className="text-sm text-gray-300 leading-relaxed">{template.content}</p>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{template.wordCount} words &middot; Last modified {template.lastModified} by {template.author}</span>
          {template.approvedBy && <span>Approved by {template.approvedBy}</span>}
        </div>

        {/* Version history table */}
        <div className="rounded-lg border border-gray-700 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-800 text-gray-400 uppercase tracking-wide">
                <th className="px-3 py-2 text-left font-semibold">Version</th>
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Author</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {history.map((v) => (
                <tr key={v.version} className="bg-gray-900">
                  <td className="px-3 py-2 font-mono text-[#C9A84C]">v{v.version}</td>
                  <td className="px-3 py-2 text-gray-400 tabular-nums">{v.modifiedAt}</td>
                  <td className="px-3 py-2 text-gray-300">{v.author}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusBadge(v.status)}`}>{v.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {template.status === 'Approved' && (
            <button
              onClick={() => onSendToClient(template)}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] font-semibold transition-colors"
            >
              Send to Client
            </button>
          )}
          {template.status === 'Pending Approval' && (
            <>
              <button
                onClick={() => onApprove(template.id)}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => onReject(template.id)}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-red-200 font-semibold transition-colors"
              >
                Reject
              </button>
            </>
          )}
          <button
            onClick={() => onNewVersion(template)}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
          >
            New Version
          </button>
          <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DisclosuresPage() {
  const [templates, setTemplates] = useState<DisclosureTemplate[]>(INITIAL_TEMPLATES);
  const [selected, setSelected] = useState<DisclosureTemplate | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<{ name: string; state: string; category: DisclosureCategory; content: string } | null>(null);
  const [showSendModal, setShowSendModal] = useState<DisclosureTemplate | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>('all');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  // Recompute KPIs from live templates state
  const pending  = templates.filter((t) => t.status === 'Pending Approval').length;
  const approved = templates.filter((t) => t.status === 'Approved').length;
  const drafts   = templates.filter((t) => t.status === 'Draft').length;

  // ── Export All as CSV ──
  const handleExportAll = () => {
    const header = 'Name,State,Category,Version,Status';
    const rows = templates.map((t) =>
      `"${t.name}","${t.state}","${t.category}","${t.version}","${t.status}"`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `disclosure-templates-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported successfully.');
  };

  // ── Approve handler ──
  const handleApprove = (id: string) => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: 'Approved' as DisclosureStatus, approvedBy: 'CCO', lastModified: new Date().toISOString().slice(0, 10) } : t
      )
    );
    setSelected((prev) => prev && prev.id === id ? { ...prev, status: 'Approved', approvedBy: 'CCO', lastModified: new Date().toISOString().slice(0, 10) } : prev);
    showToast('Template approved successfully.');
  };

  // ── Reject handler ──
  const handleReject = (id: string, _reason: string) => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: 'Draft' as DisclosureStatus, lastModified: new Date().toISOString().slice(0, 10) } : t
      )
    );
    setSelected((prev) => prev && prev.id === id ? { ...prev, status: 'Draft', lastModified: new Date().toISOString().slice(0, 10) } : prev);
    setShowRejectModal(null);
    showToast('Template rejected and returned to Draft.');
  };

  // ── New template submit ──
  const handleNewTemplate = (data: { name: string; state: string; category: DisclosureCategory; content: string }) => {
    const newId = `dis-${String(templates.length + 1).padStart(3, '0')}`;
    const newTemplate: DisclosureTemplate = {
      id: newId,
      name: data.name,
      state: data.state,
      category: data.category,
      version: '1.0',
      status: 'Pending Approval',
      lastModified: new Date().toISOString().slice(0, 10),
      author: 'Current User',
      approvedBy: null,
      wordCount: data.content.split(/\s+/).length,
      content: data.content,
    };
    setTemplates((prev) => [...prev, newTemplate]);
    showToast(`Template "${data.name}" submitted for approval.`);
  };

  // ── Replace deprecated ──
  const handleReplace = (t: DisclosureTemplate) => {
    setWizardPrefill({
      name: t.name + ' (Replacement)',
      state: t.state,
      category: t.category,
      content: t.content.replace('[DEPRECATED] ', ''),
    });
    setShowCreate(true);
  };

  // ── New version ──
  const handleNewVersion = (t: DisclosureTemplate) => {
    setWizardPrefill({
      name: t.name,
      state: t.state,
      category: t.category,
      content: t.content,
    });
    setShowCreate(true);
  };

  // ── Send to client ──
  const handleSendToClient = () => {
    setShowSendModal(null);
    showToast('Disclosure sent to selected clients successfully.');
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8">

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {showCreate && (
        <CreateApproveWorkflow
          onClose={() => { setShowCreate(false); setWizardPrefill(null); }}
          onSubmit={handleNewTemplate}
          prefill={wizardPrefill}
        />
      )}

      {showSendModal && (
        <SendToClientModal
          template={showSendModal}
          onClose={() => setShowSendModal(null)}
          onSend={handleSendToClient}
        />
      )}

      {showRejectModal && (
        <RejectModal
          onClose={() => setShowRejectModal(null)}
          onReject={(reason) => handleReject(showRejectModal, reason)}
        />
      )}

      {/* ── Client Selector ────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">Client</label>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#C9A84C] min-w-[220px]"
        >
          <option value="all">All Clients</option>
          {MOCK_CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Disclosure CMS</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Manage regulatory disclosure templates, approval workflows, and version control.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportAll}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Export All
          </button>
          <button
            onClick={() => { setWizardPrefill(null); setShowCreate(true); }}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold transition-colors"
          >
            + New Template
          </button>
        </div>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Templates',     value: templates.length, color: 'text-white'        },
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
          <TemplateLibraryTable
            templates={templates}
            onSelect={setSelected}
            selected={selected?.id ?? null}
            onReplace={handleReplace}
          />
        </section>

        {/* Preview + Version history — 2 cols */}
        <section className="xl:col-span-2" aria-label="Preview and Version History">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Preview & History</h2>
          <PreviewPanel
            template={selected}
            onApprove={handleApprove}
            onReject={(id) => setShowRejectModal(id)}
            onSendToClient={(t) => setShowSendModal(t)}
            onNewVersion={handleNewVersion}
          />
        </section>

      </div>

    </div>
  );
}
