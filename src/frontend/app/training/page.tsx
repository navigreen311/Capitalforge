'use client';

// ============================================================
// /training — Training & Certification
// Certification tracks (onboarding / annual / advanced),
// progress bars, completion status, expiry dates.
// Training gaps panel with recommended actions.
// Banned claims library — searchable list with enforcement
// case examples.
// ============================================================

import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TrackType = 'onboarding' | 'annual' | 'advanced';
type CertStatus = 'complete' | 'in_progress' | 'not_started' | 'expired';

interface Module {
  id: string;
  title: string;
  durationMin: number;
  completed: boolean;
  completedAt?: string;
}

interface AdvisorProgress {
  name: string;
  completedModules: number;
  totalModules: number;
  overdue: boolean;
}

interface CertTrack {
  id: string;
  type: TrackType;
  title: string;
  description: string;
  modules: Module[];
  status: CertStatus;
  completedAt?: string;
  expiresAt?: string;
  assignedTo: string[];
  advisorProgress?: AdvisorProgress[];
}

interface TrainingGap {
  id: string;
  advisorName: string;
  missingTrack: string;
  daysOverdue: number;
  riskLevel: 'critical' | 'high' | 'medium';
  recommendedAction: string;
}

interface BannedClaim {
  id: string;
  claim: string;
  category: string;
  rule: string;
  enforcementCases: EnforcementCase[];
  severity: 'critical' | 'high' | 'medium';
  prohibition: string;
  compliantAlternative: string;
}

interface EnforcementCase {
  authority: string;
  year: number;
  entity: string;
  penalty: string;
  summary: string;
  source?: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const ADVISORS = ['Jordan M.', 'Casey R.', 'Alex T.', 'Morgan P.'];

const CLIENTS = [
  { id: 'cl_all', name: 'All Clients' },
  { id: 'cl_001', name: 'Apex Commercial Group' },
  { id: 'cl_002', name: 'BrightPath Enterprises' },
  { id: 'cl_003', name: 'Summit Capital Holdings' },
  { id: 'cl_004', name: 'Vanguard Merchant Solutions' },
];

const PLACEHOLDER_TRACKS: CertTrack[] = [
  {
    id: 'track_001',
    type: 'onboarding',
    title: 'New Advisor Onboarding',
    description: 'Foundational compliance, UDAP principles, and CapitalForge platform certification. Required within 30 days of hire.',
    modules: [
      { id: 'm_001a', title: 'Introduction to Commercial Lending Compliance', durationMin: 45, completed: true, completedAt: '2026-01-10' },
      { id: 'm_001b', title: 'UDAP & FTC Guidelines for Financial Products', durationMin: 60, completed: true, completedAt: '2026-01-11' },
      { id: 'm_001c', title: 'KYB / KYC Procedures', durationMin: 30, completed: true, completedAt: '2026-01-12' },
      { id: 'm_001d', title: 'Banned Claims & Approved Language', durationMin: 40, completed: true, completedAt: '2026-01-13' },
      { id: 'm_001e', title: 'Platform Tools & Workflow Certification', durationMin: 25, completed: true, completedAt: '2026-01-15' },
    ],
    status: 'complete',
    completedAt: '2026-01-15',
    expiresAt: '2027-01-15',
    assignedTo: ['Jordan M.', 'Casey R.', 'Alex T.'],
    advisorProgress: [
      { name: 'Jordan M.', completedModules: 5, totalModules: 5, overdue: false },
      { name: 'Casey R.', completedModules: 5, totalModules: 5, overdue: false },
      { name: 'Alex T.', completedModules: 5, totalModules: 5, overdue: false },
    ],
  },
  {
    id: 'track_002',
    type: 'annual',
    title: 'Annual Compliance Recertification',
    description: 'Mandatory yearly recertification covering regulatory updates, state law changes, and refreshed banned claims library.',
    modules: [
      { id: 'm_002a', title: '2026 Regulatory Updates — SB 1235 & CFDL', durationMin: 50, completed: true, completedAt: '2026-02-20' },
      { id: 'm_002b', title: 'State Law Changes: CA, NY, TX, FL', durationMin: 40, completed: true, completedAt: '2026-03-01' },
      { id: 'm_002c', title: 'Banned Claims Library — Annual Refresh', durationMin: 35, completed: false },
      { id: 'm_002d', title: 'TCPA & Consent Management Updates', durationMin: 30, completed: false },
      { id: 'm_002e', title: 'Assessment & Certification Exam', durationMin: 20, completed: false },
    ],
    status: 'in_progress',
    expiresAt: '2026-06-30',
    assignedTo: ['Jordan M.', 'Casey R.', 'Alex T.', 'Morgan P.'],
    advisorProgress: [
      { name: 'Jordan M.', completedModules: 3, totalModules: 5, overdue: false },
      { name: 'Casey R.', completedModules: 2, totalModules: 5, overdue: false },
      { name: 'Alex T.', completedModules: 2, totalModules: 5, overdue: false },
      { name: 'Morgan P.', completedModules: 0, totalModules: 5, overdue: true },
    ],
  },
  {
    id: 'track_003',
    type: 'advanced',
    title: 'Advanced: Commercial Credit Structuring',
    description: 'Deep-dive into complex funding stack compliance, multi-product disclosures, and APR accuracy requirements.',
    modules: [
      { id: 'm_003a', title: 'Multi-Product Funding Stack Compliance', durationMin: 75, completed: false },
      { id: 'm_003b', title: 'APR Calculation & Disclosure Accuracy', durationMin: 60, completed: false },
      { id: 'm_003c', title: 'Suitability Assessment for Commercial Credit', durationMin: 55, completed: false },
      { id: 'm_003d', title: 'Complex Deal Case Studies', durationMin: 90, completed: false },
    ],
    status: 'not_started',
    assignedTo: ['Jordan M.'],
    advisorProgress: [
      { name: 'Jordan M.', completedModules: 0, totalModules: 4, overdue: false },
    ],
  },
  {
    id: 'track_004',
    type: 'annual',
    title: 'Annual Compliance Recertification — 2025',
    description: 'Prior year annual recertification. Now expired — renewal required.',
    modules: [
      { id: 'm_004a', title: '2025 Regulatory Updates', durationMin: 45, completed: true, completedAt: '2025-03-15' },
      { id: 'm_004b', title: 'Banned Claims Refresh 2025', durationMin: 30, completed: true, completedAt: '2025-03-28' },
      { id: 'm_004c', title: 'Assessment & Certification Exam', durationMin: 20, completed: true, completedAt: '2025-04-10' },
    ],
    status: 'expired',
    completedAt: '2025-04-10',
    expiresAt: '2026-03-01',
    assignedTo: ['Morgan P.'],
    advisorProgress: [
      { name: 'Morgan P.', completedModules: 3, totalModules: 3, overdue: true },
    ],
  },
];

const PLACEHOLDER_GAPS: TrainingGap[] = [
  {
    id: 'gap_001',
    advisorName: 'Morgan P.',
    missingTrack: 'Annual Compliance Recertification 2026',
    daysOverdue: 31,
    riskLevel: 'critical',
    recommendedAction: 'Suspend client-facing activities until recertification is complete. Immediate enrollment required.',
  },
  {
    id: 'gap_002',
    advisorName: 'Casey R.',
    missingTrack: 'Banned Claims Library — Annual Refresh',
    daysOverdue: 0,
    riskLevel: 'high',
    recommendedAction: 'Assign module within 5 business days. Block script submission access until module is complete.',
  },
  {
    id: 'gap_003',
    advisorName: 'Alex T.',
    missingTrack: 'TCPA & Consent Management Updates',
    daysOverdue: 0,
    riskLevel: 'medium',
    recommendedAction: 'Schedule before next outbound campaign. Review consent logs for recent activity.',
  },
];

const PLACEHOLDER_BANNED_CLAIMS: BannedClaim[] = [
  {
    id: 'bc_001',
    claim: 'Guaranteed approval / guaranteed funding',
    category: 'Approval Language',
    rule: 'UDAP §5 — FTC Act',
    severity: 'critical',
    prohibition: 'No financial product may be advertised with absolute certainty of approval. The term "guaranteed" implies a binding promise that the lender cannot substantiate, as all funding decisions involve underwriting criteria, credit assessment, and risk evaluation that may result in denial.',
    compliantAlternative: 'We offer competitive funding options with high approval rates for qualified businesses. Subject to underwriting review and approval.',
    enforcementCases: [
      { authority: 'CFPB', year: 2023, entity: 'Fast Capital LLC', penalty: '$1.2M', summary: 'Consent order for advertising "guaranteed funding in 24 hours" without substantiation.', source: 'https://www.consumerfinance.gov/enforcement' },
      { authority: 'FTC', year: 2022, entity: 'EasyFund Partners', penalty: '$870K', summary: 'Civil penalty for deceptive guarantee claims targeting small business borrowers.', source: 'https://www.ftc.gov/enforcement' },
    ],
  },
  {
    id: 'bc_002',
    claim: '0% APR / Zero interest offers without full disclosure',
    category: 'Rate & APR Claims',
    rule: 'Reg Z / SB 1235 (CA)',
    severity: 'critical',
    prohibition: 'Advertising 0% APR without clearly disclosing the qualifying conditions, revert rate, promotional period length, and all applicable fees violates Truth in Lending Act requirements and state disclosure laws. All rate claims must include the full cost of credit.',
    compliantAlternative: 'Introductory rate of 0% APR for the first 6 months for qualified applicants. Standard rate of X.XX% APR applies after the introductory period. See full terms and conditions.',
    enforcementCases: [
      { authority: 'CFPB', year: 2024, entity: 'NovaBridge Capital', penalty: '$2.1M', summary: 'Advertised 0% APR without disclosing revert rate or qualifying conditions. Consent order issued.', source: 'https://www.consumerfinance.gov/enforcement' },
    ],
  },
  {
    id: 'bc_003',
    claim: 'No credit check / No hard pull',
    category: 'Credit Inquiry Claims',
    rule: 'FCRA §604',
    severity: 'high',
    prohibition: 'Claiming "no credit check" when the lender performs hard credit inquiries is a material misrepresentation. Under FCRA, consumers must be informed of the nature of credit inquiries. Soft pulls may be accurately described but must be distinguished from hard inquiries.',
    compliantAlternative: 'Initial pre-qualification uses a soft credit inquiry that does not affect your credit score. A full credit review may be required for final approval.',
    enforcementCases: [
      { authority: 'CFPB', year: 2023, entity: 'QuickStack Pro', penalty: '$450K', summary: '"No credit check required" used when hard pulls were being performed. FCRA violation.', source: 'https://www.consumerfinance.gov/enforcement' },
    ],
  },
  {
    id: 'bc_004',
    claim: 'Lowest rates in the market / Best rates guaranteed',
    category: 'Superlative Claims',
    rule: 'FTC Advertising Guides',
    severity: 'high',
    prohibition: 'Superlative claims such as "lowest," "best," or "cheapest" require objective substantiation through comparative market data. Without such evidence, these claims are considered deceptive under FTC advertising guidelines.',
    compliantAlternative: 'We offer competitive rates tailored to your business profile. Request a personalized quote to compare your options.',
    enforcementCases: [
      { authority: 'FTC', year: 2021, entity: 'PrimeRate Connect', penalty: '$330K', summary: 'Unsubstantiated "lowest rates" claim in digital advertising. Warning and fine issued.', source: 'https://www.ftc.gov/enforcement' },
    ],
  },
  {
    id: 'bc_005',
    claim: 'Pre-approved — you have been selected',
    category: 'Pre-Approval Language',
    rule: 'FCRA §615 — Firm Offer of Credit',
    severity: 'high',
    prohibition: 'Using "pre-approved" language without meeting the FCRA firm offer of credit requirements is prohibited. A firm offer must be based on prescreened consumer data and must include required disclosures, opt-out notices, and cannot be conditioned on criteria not used in the prescreening.',
    compliantAlternative: 'Based on your business profile, you may qualify for funding options up to $X. Final terms subject to full application review and approval.',
    enforcementCases: [
      { authority: 'CFPB', year: 2022, entity: 'DirectFund Advisors', penalty: '$780K', summary: 'Mass-mailed "pre-approved" offers without a firm offer of credit. FCRA enforcement action.', source: 'https://www.consumerfinance.gov/enforcement' },
    ],
  },
  {
    id: 'bc_006',
    claim: 'Instant approval / Instant cash',
    category: 'Timing Representations',
    rule: 'UDAP — Materially Misleading Representations',
    severity: 'medium',
    prohibition: 'Claims of "instant" approval or funding are materially misleading when the actual process involves review periods, verification steps, or processing delays. The actual timeline must be accurately represented in all marketing materials.',
    compliantAlternative: 'Fast application process with decisions typically within 1-2 business days. Funding timeline varies based on product type and verification requirements.',
    enforcementCases: [
      { authority: 'NY AG', year: 2023, entity: 'SpeedFund Corp.', penalty: '$190K', summary: 'Settlement for "instant approval" claims when average review took 2–3 business days.', source: 'https://ag.ny.gov/enforcement' },
    ],
  },
  {
    id: 'bc_007',
    claim: 'Risk-free investment / No-risk funding',
    category: 'Risk Disclosures',
    rule: 'UDAP / SEC Advertising Rules',
    severity: 'medium',
    prohibition: 'All financial products carry inherent risk. Describing any funding product as "risk-free" is materially misleading. Accurate risk disclosures are required under both UDAP principles and SEC advertising regulations for investment-related products.',
    compliantAlternative: 'Our funding products are designed to support business growth. All financial products carry risk — please review the full terms, conditions, and risk disclosures before proceeding.',
    enforcementCases: [
      { authority: 'FTC', year: 2020, entity: 'SafeCapital Group', penalty: '$210K', summary: '"Risk-free" used to describe MCA products. Corrective advertising required.', source: 'https://www.ftc.gov/enforcement' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso?: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const TRACK_TYPE_CONFIG: Record<TrackType, { label: string; color: string }> = {
  onboarding: { label: 'Onboarding',  color: 'bg-blue-900 text-blue-300 border-blue-700' },
  annual:     { label: 'Annual',      color: 'bg-purple-900 text-purple-300 border-purple-700' },
  advanced:   { label: 'Advanced',    color: 'bg-amber-900 text-amber-300 border-amber-700' },
};

const STATUS_CONFIG: Record<CertStatus, { label: string; badge: string; dot: string }> = {
  complete:    { label: 'Complete',     badge: 'bg-green-900 text-green-300 border-green-700',   dot: 'bg-green-400' },
  in_progress: { label: 'In Progress',  badge: 'bg-blue-900 text-blue-300 border-blue-700',      dot: 'bg-blue-400' },
  not_started: { label: 'Not Started',  badge: 'bg-gray-800 text-gray-400 border-gray-600',      dot: 'bg-gray-500' },
  expired:     { label: 'Expired',      badge: 'bg-red-900 text-red-300 border-red-700',          dot: 'bg-red-400' },
};

const GAP_RISK_CONFIG = {
  critical: { badge: 'bg-red-900 text-red-300 border-red-700',        bg: 'bg-red-950/40 border-red-800' },
  high:     { badge: 'bg-orange-900 text-orange-300 border-orange-700', bg: 'bg-orange-950/40 border-orange-800' },
  medium:   { badge: 'bg-yellow-900 text-yellow-300 border-yellow-700', bg: 'bg-yellow-950/40 border-yellow-800' },
};

const CLAIM_SEV_CONFIG = {
  critical: { badge: 'bg-red-900 text-red-300 border-red-700' },
  high:     { badge: 'bg-orange-900 text-orange-300 border-orange-700' },
  medium:   { badge: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
};

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'warning'; onClose: () => void }) {
  const colors = {
    success: 'bg-green-900 border-green-700 text-green-300',
    error: 'bg-red-900 border-red-700 text-red-300',
    warning: 'bg-yellow-900 border-yellow-700 text-yellow-300',
  };
  return (
    <div className={`fixed top-6 right-6 z-[100] px-5 py-3 rounded-xl border shadow-2xl ${colors[type]} flex items-center gap-3 animate-in fade-in slide-in-from-top-2`}>
      <span className="text-sm font-semibold">{message}</span>
      <button onClick={onClose} className="text-xs opacity-70 hover:opacity-100 ml-2">✕</button>
    </div>
  );
}

function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const show = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };
  return { toast, show, clear: () => setToast(null) };
}

// ---------------------------------------------------------------------------
// Assign Training Modal
// ---------------------------------------------------------------------------

function AssignTrainingModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: AssignFormData) => void }) {
  const [selectedAdvisors, setSelectedAdvisors] = useState<Set<string>>(new Set());
  const [track, setTrack] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'Normal' | 'High' | 'Critical'>('Normal');
  const [note, setNote] = useState('');

  const trackOptions = PLACEHOLDER_TRACKS.flatMap((t) =>
    t.modules.map((m) => ({ trackTitle: t.title, moduleTitle: m.title, value: `${t.id}::${m.id}` }))
  );

  const toggleAdvisor = (name: string) => {
    setSelectedAdvisors((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const canSubmit = selectedAdvisors.size > 0 && track && dueDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Assign Training</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-lg">✕</button>
        </div>

        {/* Advisors */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Select Advisors</label>
          <div className="space-y-2">
            {ADVISORS.map((name) => (
              <label key={name} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={selectedAdvisors.has(name)}
                  onChange={() => toggleAdvisor(name)}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-gold focus:ring-brand-gold/50 accent-[#C9A84C]"
                />
                <span className="text-sm text-gray-200 group-hover:text-white">{name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Track / Module */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Track / Module</label>
          <select
            value={track}
            onChange={(e) => setTrack(e.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-gray-800 text-gray-100 text-sm px-3 py-2.5 focus:outline-none focus:border-brand-gold/60"
          >
            <option value="">Select a track or module...</option>
            {trackOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.trackTitle} — {opt.moduleTitle}
              </option>
            ))}
          </select>
        </div>

        {/* Due Date */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-gray-800 text-gray-100 text-sm px-3 py-2.5 focus:outline-none focus:border-brand-gold/60"
          />
        </div>

        {/* Priority */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'Normal' | 'High' | 'Critical')}
            className="w-full rounded-xl border border-gray-700 bg-gray-800 text-gray-100 text-sm px-3 py-2.5 focus:outline-none focus:border-brand-gold/60"
          >
            <option value="Normal">Normal</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>

        {/* Note */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add context or instructions for the assigned advisors..."
            className="w-full rounded-xl border border-gray-700 bg-gray-800 text-gray-100 text-sm px-3 py-2.5 placeholder:text-gray-600 focus:outline-none focus:border-brand-gold/60 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-400 text-sm font-semibold hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onSubmit({ advisors: Array.from(selectedAdvisors), track, dueDate, priority, note });
            }}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-opacity ${
              canSubmit
                ? 'bg-brand-gold text-brand-navy hover:opacity-90 cursor-pointer'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            Assign Training
          </button>
        </div>
      </div>
    </div>
  );
}

interface AssignFormData {
  advisors: string[];
  track: string;
  dueDate: string;
  priority: 'Normal' | 'High' | 'Critical';
  note: string;
}

// ---------------------------------------------------------------------------
// Suspend Client Access Confirmation Modal
// ---------------------------------------------------------------------------

function SuspendAccessModal({ advisorName, onClose, onConfirm }: { advisorName: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-red-800 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <span className="h-10 w-10 rounded-full bg-red-900 border border-red-700 flex items-center justify-center text-red-400 text-lg">!</span>
          <div>
            <h2 className="text-lg font-bold text-white">Suspend Client Access</h2>
            <p className="text-xs text-red-400">Destructive action — cannot be undone without admin approval</p>
          </div>
        </div>
        <p className="text-sm text-gray-300 mb-5">
          This will immediately suspend <span className="font-bold text-white">{advisorName}</span>&apos;s access to all client-facing activities, including deal submissions, client communications, and document signing. A compliance hold will be placed on their account until recertification is complete.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-400 text-sm font-semibold hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-lg bg-red-700 text-white text-sm font-bold hover:bg-red-600 transition-colors"
          >
            Suspend Access
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({ pct, color = '#C9A84C' }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function TrackCard({ track, onModuleAction }: { track: CertTrack; onModuleAction: (trackId: string, moduleId: string, action: 'start' | 'resume') => void }) {
  const [expanded, setExpanded] = useState(false);
  const completed = track.modules.filter((m) => m.completed).length;
  const total = track.modules.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const status = STATUS_CONFIG[track.status];
  const typeTag = TRACK_TYPE_CONFIG[track.type];
  const expiryDays = daysUntil(track.expiresAt);
  const expiryWarning = expiryDays !== null && expiryDays <= 30 && expiryDays >= 0;
  const barColor = track.status === 'complete' ? '#22c55e' : track.status === 'expired' ? '#ef4444' : '#C9A84C';

  // Determine module status for action buttons
  const getModuleStatus = (mod: Module, index: number): 'complete' | 'in_progress' | 'not_started' => {
    if (mod.completed) return 'complete';
    // First incomplete module is "in_progress" if track is in_progress
    const firstIncompleteIdx = track.modules.findIndex((m) => !m.completed);
    if (track.status === 'in_progress' && index === firstIncompleteIdx) return 'in_progress';
    return 'not_started';
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900">
      {/* Deadline countdown banner for annual tracks */}
      {track.type === 'annual' && expiryDays !== null && expiryDays > 0 && expiryDays <= 90 && track.status !== 'complete' && track.status !== 'expired' && (
        <div className={`px-5 py-2 text-xs font-bold flex items-center gap-2 rounded-t-xl border-b ${
          expiryDays <= 14
            ? 'bg-red-950/60 border-red-800 text-red-400'
            : expiryDays <= 30
              ? 'bg-yellow-950/60 border-yellow-800 text-yellow-400'
              : 'bg-blue-950/40 border-blue-800 text-blue-400'
        }`}>
          <span>&#9201;</span>
          <span>{expiryDays} day{expiryDays !== 1 ? 's' : ''} until deadline</span>
          {expiryDays <= 14 && <span className="ml-1">— Immediate action required</span>}
          {expiryDays > 14 && expiryDays <= 30 && <span className="ml-1">— Deadline approaching</span>}
        </div>
      )}

      {/* Header */}
      <button
        className="w-full text-left px-5 py-4"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${typeTag.color}`}>{typeTag.label}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${status.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            </div>
            <h3 className="font-semibold text-gray-100 text-sm">{track.title}</h3>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{track.description}</p>
          </div>
          <span className="text-gray-500 text-sm flex-shrink-0 mt-1">{expanded ? '▲' : '▼'}</span>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{completed} / {total} modules</span>
            <span className="text-xs font-bold" style={{ color: barColor }}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} color={barColor} />
        </div>

        {/* Dates */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
          {track.completedAt && <span>Completed {formatDate(track.completedAt)}</span>}
          {track.expiresAt && (
            <span className={expiryWarning ? 'text-yellow-400 font-semibold' : ''}>
              Expires {formatDate(track.expiresAt)}
              {expiryWarning && ` · ${expiryDays}d`}
              {expiryDays !== null && expiryDays < 0 && (
                <span className="text-red-400 font-semibold"> · Expired</span>
              )}
            </span>
          )}
          <span className="text-gray-600">Assigned: {track.assignedTo.join(', ')}</span>
        </div>
      </button>

      {/* Expanded content: Module list + Advisor Completion */}
      {expanded && (
        <div className="border-t border-gray-800 px-5 py-3 space-y-4">
          {/* Modules */}
          <div className="space-y-2">
            {track.modules.map((mod, idx) => {
              const modStatus = getModuleStatus(mod, idx);
              return (
                <div key={mod.id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-5 text-right flex-shrink-0">{idx + 1}.</span>
                  <span className={`flex-shrink-0 h-5 w-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                    mod.completed
                      ? 'border-green-600 bg-green-900/60 text-green-400'
                      : 'border-gray-700 bg-gray-800 text-gray-600'
                  }`}>
                    {mod.completed ? '✓' : '○'}
                  </span>
                  <span className={`flex-1 text-sm ${mod.completed ? 'text-gray-400' : 'text-gray-200'}`}>
                    {mod.title}
                  </span>
                  <span className="text-xs text-gray-600 flex-shrink-0">{mod.durationMin}m</span>
                  {mod.completed && mod.completedAt && (
                    <span className="text-xs text-green-600 flex-shrink-0">&#10003; {formatDate(mod.completedAt)}</span>
                  )}
                  {modStatus === 'not_started' && !mod.completed && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onModuleAction(track.id, mod.id, 'start'); }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-brand-gold/20 text-brand-gold border border-brand-gold/30 font-semibold hover:bg-brand-gold/30 transition-colors flex-shrink-0"
                    >
                      Start
                    </button>
                  )}
                  {modStatus === 'in_progress' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onModuleAction(track.id, mod.id, 'resume'); }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-blue-900/60 text-blue-300 border border-blue-700 font-semibold hover:bg-blue-900 transition-colors flex-shrink-0"
                    >
                      Resume
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Advisor Completion */}
          {track.advisorProgress && track.advisorProgress.length > 0 && (
            <div className="border-t border-gray-800 pt-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Advisor Completion</p>
              <div className="space-y-2.5">
                {track.advisorProgress.map((ap) => {
                  const apPct = ap.totalModules > 0 ? Math.round((ap.completedModules / ap.totalModules) * 100) : 0;
                  return (
                    <div key={ap.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-200">{ap.name}</span>
                          {ap.overdue && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-900 text-red-300 border border-red-700">
                              OVERDUE
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">{ap.completedModules}/{ap.totalModules} — {apPct}%</span>
                      </div>
                      <ProgressBar
                        pct={apPct}
                        color={ap.overdue ? '#ef4444' : apPct === 100 ? '#22c55e' : '#C9A84C'}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GapsPanel({ gaps, onAssignNow, onSuspendAccess }: {
  gaps: TrainingGap[];
  onAssignNow: (gap: TrainingGap) => void;
  onSuspendAccess: (gap: TrainingGap) => void;
}) {
  if (gaps.length === 0) {
    return (
      <div className="rounded-xl border border-green-800 bg-green-950/30 p-5">
        <p className="text-sm font-semibold text-green-400">No training gaps detected</p>
        <p className="text-xs text-green-600 mt-1">All advisors are current on required certifications.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {gaps.map((gap) => {
        const cfg = GAP_RISK_CONFIG[gap.riskLevel];
        return (
          <div key={gap.id} className={`rounded-xl border p-4 ${cfg.bg}`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-100 text-sm">{gap.advisorName}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${cfg.badge}`}>
                  {gap.riskLevel.charAt(0).toUpperCase() + gap.riskLevel.slice(1)}
                </span>
              </div>
              {gap.daysOverdue > 0 && (
                <span className="text-xs text-red-400 font-semibold flex-shrink-0">
                  {gap.daysOverdue}d overdue
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-2">
              Missing: <span className="text-gray-200 font-medium">{gap.missingTrack}</span>
            </p>
            <div className="flex items-start gap-2 mb-3">
              <span className="text-xs text-brand-gold flex-shrink-0 mt-0.5">→</span>
              <p className="text-xs text-gray-300">{gap.recommendedAction}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onAssignNow(gap)}
                className="text-xs px-3 py-1.5 rounded-lg bg-brand-gold text-brand-navy font-bold hover:opacity-90 transition-opacity"
              >
                Assign Now
              </button>
              {gap.riskLevel === 'critical' && (
                <button
                  onClick={() => onSuspendAccess(gap)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-900 text-red-300 border border-red-700 font-bold hover:bg-red-800 transition-colors"
                >
                  Suspend Client Access
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BannedClaimsLibrary({ claims }: { claims: BannedClaim[] }) {
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return claims;
    return claims.filter(
      (c) =>
        c.claim.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.rule.toLowerCase().includes(q) ||
        c.enforcementCases.some((e) => e.summary.toLowerCase().includes(q) || e.entity.toLowerCase().includes(q)),
    );
  }, [claims, query]);

  const toggleClaim = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyToClipboard = (text: string, claimId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(claimId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search banned claims, rules, enforcement cases..."
          className="w-full rounded-xl border border-gray-700 bg-gray-900 text-gray-100 text-sm
                     placeholder:text-gray-600 pl-9 pr-4 py-2.5 focus:outline-none
                     focus:border-brand-gold/60 transition-colors"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none">&#8981;</span>
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-sm"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-3">{filtered.length} of {claims.length} entries</p>

      <div className="space-y-2">
        {filtered.map((claim) => {
          const sev = CLAIM_SEV_CONFIG[claim.severity];
          const isOpen = expandedIds.has(claim.id);

          return (
            <div key={claim.id} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
              <button
                className="w-full text-left px-4 py-3"
                onClick={() => toggleClaim(claim.id)}
                aria-expanded={isOpen}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${sev.badge}`}>
                        {claim.severity.charAt(0).toUpperCase() + claim.severity.slice(1)}
                      </span>
                      <span className="text-xs text-gray-500 border border-gray-700 bg-gray-800 px-1.5 py-0.5 rounded">
                        {claim.category}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-100">{claim.claim}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{claim.rule}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500">
                      {claim.enforcementCases.length} case{claim.enforcementCases.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-800 px-4 py-4 space-y-4">
                  {/* Why This Is Prohibited */}
                  <div>
                    <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1.5">Why This Is Prohibited</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{claim.prohibition}</p>
                    <p className="text-xs text-gray-500 mt-1">Regulation: <span className="text-gray-300 font-medium">{claim.rule}</span></p>
                  </div>

                  {/* Compliant Alternative Phrasing */}
                  <div>
                    <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-1.5">Compliant Alternative Phrasing</p>
                    <div className="bg-green-950/30 border border-green-800 rounded-lg p-3 flex items-start gap-3">
                      <p className="text-xs text-green-300 leading-relaxed flex-1">&ldquo;{claim.compliantAlternative}&rdquo;</p>
                      <button
                        onClick={() => copyToClipboard(claim.compliantAlternative, claim.id)}
                        className="text-xs px-2 py-1 rounded bg-green-900 text-green-300 border border-green-700 font-semibold hover:bg-green-800 transition-colors flex-shrink-0"
                      >
                        {copiedId === claim.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {/* Enforcement History */}
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Enforcement History
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left py-2 pr-3 text-gray-500 font-semibold">Date</th>
                            <th className="text-left py-2 pr-3 text-gray-500 font-semibold">Regulator</th>
                            <th className="text-left py-2 pr-3 text-gray-500 font-semibold">Entity</th>
                            <th className="text-left py-2 pr-3 text-gray-500 font-semibold">Action</th>
                            <th className="text-left py-2 pr-3 text-gray-500 font-semibold">Penalty</th>
                            <th className="text-left py-2 text-gray-500 font-semibold">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {claim.enforcementCases.map((ec, i) => (
                            <tr key={i} className="border-b border-gray-800 last:border-b-0">
                              <td className="py-2 pr-3 text-gray-400">{ec.year}</td>
                              <td className="py-2 pr-3 text-brand-gold font-bold">{ec.authority}</td>
                              <td className="py-2 pr-3 text-gray-300 font-semibold">{ec.entity}</td>
                              <td className="py-2 pr-3 text-gray-400">{ec.summary.length > 60 ? ec.summary.substring(0, 60) + '...' : ec.summary}</td>
                              <td className="py-2 pr-3 text-red-400 font-bold">{ec.penalty}</td>
                              <td className="py-2">
                                {ec.source ? (
                                  <a href={ec.source} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                                    View
                                  </a>
                                ) : (
                                  <span className="text-gray-600">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <p className="text-sm text-gray-500">No claims match &ldquo;{query}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = 'tracks' | 'gaps' | 'library';

export default function TrainingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('tracks');
  const [trackFilter, setTrackFilter] = useState<TrackType | 'all'>('all');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<TrainingGap | null>(null);
  const [selectedClient, setSelectedClient] = useState('cl_all');
  const { toast, show: showToast, clear: clearToast } = useToast();

  const filteredTracks = useMemo(() => {
    if (trackFilter === 'all') return PLACEHOLDER_TRACKS;
    return PLACEHOLDER_TRACKS.filter((t) => t.type === trackFilter);
  }, [trackFilter]);

  const totalModules = PLACEHOLDER_TRACKS.reduce((a, t) => a + t.modules.length, 0);
  const completedModules = PLACEHOLDER_TRACKS.reduce((a, t) => a + t.modules.filter((m) => m.completed).length, 0);
  const expiredCount = PLACEHOLDER_TRACKS.filter((t) => t.status === 'expired').length;
  const gapsCritical = PLACEHOLDER_GAPS.filter((g) => g.riskLevel === 'critical').length;

  const handleAssignSubmit = (data: AssignFormData) => {
    setShowAssignModal(false);
    showToast(`Training assigned to ${data.advisors.length} advisor${data.advisors.length !== 1 ? 's' : ''} (${data.priority} priority, due ${formatDate(data.dueDate)})`, 'success');
  };

  const handleAssignNow = (gap: TrainingGap) => {
    showToast(`Training "${gap.missingTrack}" assigned to ${gap.advisorName}`, 'success');
  };

  const handleSuspendAccess = (gap: TrainingGap) => {
    setSuspendTarget(gap);
  };

  const handleSuspendConfirm = () => {
    if (suspendTarget) {
      showToast(`Client access suspended for ${suspendTarget.advisorName}. Compliance hold activated.`, 'warning');
      setSuspendTarget(null);
    }
  };

  const handleModuleAction = (trackId: string, moduleId: string, action: 'start' | 'resume') => {
    const track = PLACEHOLDER_TRACKS.find((t) => t.id === trackId);
    const mod = track?.modules.find((m) => m.id === moduleId);
    if (mod) {
      showToast(`${action === 'start' ? 'Started' : 'Resumed'}: ${mod.title}`, 'success');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}

      {/* Assign Training Modal */}
      {showAssignModal && (
        <AssignTrainingModal onClose={() => setShowAssignModal(false)} onSubmit={handleAssignSubmit} />
      )}

      {/* Suspend Access Confirmation Modal */}
      {suspendTarget && (
        <SuspendAccessModal
          advisorName={suspendTarget.advisorName}
          onClose={() => setSuspendTarget(null)}
          onConfirm={handleSuspendConfirm}
        />
      )}

      {/* Client selector */}
      <div className="mb-5">
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="rounded-xl border border-gray-700 bg-gray-900 text-gray-100 text-sm px-4 py-2.5 focus:outline-none focus:border-brand-gold/60 transition-colors min-w-[260px]"
        >
          {CLIENTS.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Training &amp; Certification</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {PLACEHOLDER_TRACKS.length} tracks · {completedModules}/{totalModules} modules complete
            {gapsCritical > 0 && (
              <span className="ml-2 text-red-400 font-semibold">&#9888; {gapsCritical} critical gap{gapsCritical !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAssignModal(true)}
          className="px-4 py-2 rounded-lg bg-brand-gold text-brand-navy text-sm font-bold hover:opacity-90 transition-opacity"
        >
          Assign Training
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Tracks',          value: PLACEHOLDER_TRACKS.length,  color: 'text-gray-100' },
          { label: 'Modules Done',    value: `${completedModules}/${totalModules}`, color: 'text-green-400' },
          { label: 'Expired Certs',   value: expiredCount,               color: expiredCount > 0 ? 'text-red-400' : 'text-gray-400' },
          { label: 'Training Gaps',   value: PLACEHOLDER_GAPS.length,    color: PLACEHOLDER_GAPS.length > 0 ? 'text-yellow-400' : 'text-gray-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
            <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-800">
        {([
          { key: 'tracks',  label: 'Certification Tracks' },
          { key: 'gaps',    label: `Training Gaps${PLACEHOLDER_GAPS.length > 0 ? ` (${PLACEHOLDER_GAPS.length})` : ''}` },
          { key: 'library', label: 'Banned Claims Library' },
        ] as { key: Tab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-brand-gold text-brand-gold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Certification Tracks */}
      {activeTab === 'tracks' && (
        <div>
          {/* Filter pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {(['all', 'onboarding', 'annual', 'advanced'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTrackFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  trackFilter === f
                    ? 'bg-brand-navy-700 border-brand-gold text-brand-gold'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                {f === 'all' ? 'All Tracks' : TRACK_TYPE_CONFIG[f].label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredTracks.map((track) => (
              <TrackCard key={track.id} track={track} onModuleAction={handleModuleAction} />
            ))}
          </div>
        </div>
      )}

      {/* Tab: Training Gaps */}
      {activeTab === 'gaps' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-400">
              {PLACEHOLDER_GAPS.length} gap{PLACEHOLDER_GAPS.length !== 1 ? 's' : ''} identified across {new Set(PLACEHOLDER_GAPS.map((g) => g.advisorName)).size} advisor{new Set(PLACEHOLDER_GAPS.map((g) => g.advisorName)).size !== 1 ? 's' : ''}
            </p>
          </div>
          <GapsPanel gaps={PLACEHOLDER_GAPS} onAssignNow={handleAssignNow} onSuspendAccess={handleSuspendAccess} />
        </div>
      )}

      {/* Tab: Banned Claims Library */}
      {activeTab === 'library' && (
        <div>
          <div className="mb-4">
            <p className="text-sm text-gray-400">
              {PLACEHOLDER_BANNED_CLAIMS.length} banned claims with enforcement case history.
              Click any entry to expand enforcement details.
            </p>
          </div>
          <BannedClaimsLibrary claims={PLACEHOLDER_BANNED_CLAIMS} />
        </div>
      )}
    </div>
  );
}
