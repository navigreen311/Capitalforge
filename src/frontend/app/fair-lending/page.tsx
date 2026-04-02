'use client';

// ============================================================
// /fair-lending — Section 1071 / Fair Lending Dashboard
// Coverage threshold gauge (deal volume vs 1071 trigger),
// approval rate by demographic bucket & entity/state,
// adverse action report table with AI reason matching,
// data completeness score with incomplete field drill-down,
// Section 1071 preparation checklist, client selector.
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivationStatus = 'inactive' | 'monitoring' | 'reporting';
type TabKey = 'overview' | 'demographics' | 'adverse' | 'completeness';
type ChecklistItemStatus = 'complete' | 'in_progress' | 'pending';

interface DemographicBucket {
  label:       string;
  group:       string;
  applications: number;
  approved:    number;
  approvalRate: number;
  color:       string;
}

interface AdverseActionRow {
  appId:          string;
  business:       string;
  date:           string;
  reasonStated:   string;
  aiReason:       string;
  match:          boolean;
  noticeDelivered: boolean;
}

interface CompletenessField {
  field:     string;
  pct:       number;
  required:  boolean;
  status:    'complete' | 'partial' | 'missing';
}

interface IncompleteField {
  field:   string;
  detail:  string;
  appIds:  string[];
}

interface ChecklistItem {
  id:     string;
  label:  string;
  status: ChecklistItemStatus;
}

interface EntityRate {
  entity: string;
  rate:   number;
}

interface StateRate {
  state: string;
  rate:  number;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const CLIENTS = [
  { id: 'cf-001', name: 'CapitalForge Primary Fund' },
  { id: 'cf-002', name: 'Midwest SMB Lending Pool' },
  { id: 'cf-003', name: 'SunBelt Growth Capital' },
];

const DEAL_VOLUME       = 87;
const TRIGGER_THRESHOLD = 100;

const ACTIVATION_STATUS: ActivationStatus = 'monitoring';

const DEMOGRAPHIC_BUCKETS: DemographicBucket[] = [
  { label: 'White (Non-Hispanic)',  group: 'race',   applications: 34, approved: 24, approvalRate: 71, color: 'bg-blue-500'    },
  { label: 'Black or Afr. American', group: 'race',  applications: 18, approved: 10, approvalRate: 56, color: 'bg-indigo-500'  },
  { label: 'Hispanic / Latino',     group: 'race',   applications: 15, approved:  9, approvalRate: 60, color: 'bg-violet-500'  },
  { label: 'Asian',                 group: 'race',   applications: 12, approved:  9, approvalRate: 75, color: 'bg-purple-500'  },
  { label: 'Other / Not Reported',  group: 'race',   applications:  8, approved:  5, approvalRate: 63, color: 'bg-gray-500'    },
  { label: 'Male',                  group: 'gender', applications: 52, approved: 35, approvalRate: 67, color: 'bg-sky-500'     },
  { label: 'Female',                group: 'gender', applications: 25, approved: 16, approvalRate: 64, color: 'bg-pink-500'    },
  { label: 'Not Provided',          group: 'gender', applications: 10, approved:  6, approvalRate: 60, color: 'bg-gray-500'    },
  { label: 'Women-Owned (WOSB)',    group: 'ownership', applications: 20, approved: 13, approvalRate: 65, color: 'bg-rose-500' },
  { label: 'Minority-Owned (MOSB)', group: 'ownership', applications: 22, approved: 13, approvalRate: 59, color: 'bg-amber-500' },
];

const ENTITY_RATES: EntityRate[] = [
  { entity: 'LLC',         rate: 68 },
  { entity: 'Corporation', rate: 72 },
  { entity: 'S-Corp',      rate: 58 },
  { entity: 'Partnership', rate: 0  },
];

const STATE_RATES: StateRate[] = [
  { state: 'TX', rate: 70 },
  { state: 'CA', rate: 62 },
  { state: 'NY', rate: 60 },
  { state: 'FL', rate: 69 },
];

const ADVERSE_ACTION_ROWS: AdverseActionRow[] = [
  { appId: 'APP-0071', business: 'Crestline Medical LLC',  date: '2026-03-28', reasonStated: 'Insufficient cash flow',           aiReason: 'Insufficient cash flow',      match: true,  noticeDelivered: true  },
  { appId: 'APP-0072', business: 'BlueStar Logistics',     date: '2026-03-25', reasonStated: 'Credit history derogatory marks',  aiReason: 'Credit history derogatory marks', match: true, noticeDelivered: true  },
  { appId: 'APP-0073', business: 'Keystone Retail Co.',    date: '2026-03-20', reasonStated: 'Business age < 2 years',           aiReason: 'Insufficient revenue',        match: false, noticeDelivered: true  },
  { appId: 'APP-0074', business: 'NovaGo',                 date: '2026-03-18', reasonStated: 'Collateral shortfall',             aiReason: 'Collateral shortfall',        match: true,  noticeDelivered: false },
  { appId: 'APP-0075', business: 'Harbor Street Foods',    date: '2026-03-12', reasonStated: 'KYB incomplete',                   aiReason: 'Unverifiable identity',       match: false, noticeDelivered: true  },
];

const COMPLETENESS_FIELDS: CompletenessField[] = [
  { field: 'Application date',            pct: 100, required: true,  status: 'complete' },
  { field: 'Applicant legal name',        pct: 100, required: true,  status: 'complete' },
  { field: 'Loan amount requested',       pct: 98,  required: true,  status: 'complete' },
  { field: 'NAICS code',                  pct: 94,  required: true,  status: 'complete' },
  { field: 'Credit purpose',              pct: 97,  required: true,  status: 'complete' },
  { field: 'Race / ethnicity (owner)',    pct: 74,  required: true,  status: 'partial'  },
  { field: 'Sex / gender (owner)',        pct: 68,  required: true,  status: 'partial'  },
  { field: 'Minority-owned indicator',    pct: 81,  required: true,  status: 'partial'  },
  { field: 'Women-owned indicator',       pct: 78,  required: true,  status: 'partial'  },
  { field: 'Annual revenue',             pct: 91,  required: true,  status: 'complete' },
  { field: 'Gross annual income',         pct: 55,  required: false, status: 'partial'  },
  { field: 'Number of workers',           pct: 88,  required: false, status: 'complete' },
  { field: 'Time in business',            pct: 96,  required: true,  status: 'complete' },
  { field: 'Census tract',               pct: 42,  required: false, status: 'missing'  },
];

const INCOMPLETE_FIELDS: IncompleteField[] = [
  { field: 'Gross Revenue',      detail: 'Missing for 1 application',  appIds: ['APP-0068'] },
  { field: 'Race / Ethnicity',   detail: 'Partial for 5 applications', appIds: ['APP-0051', 'APP-0057', 'APP-0063', 'APP-0071', 'APP-0074'] },
  { field: 'Business Age',       detail: 'Partial for 3 applications', appIds: ['APP-0059', 'APP-0066', 'APP-0073'] },
];

const SECTION_1071_CHECKLIST: ChecklistItem[] = [
  { id: 'ck-1', label: 'Firewall: loan officers cannot access demographic data',      status: 'complete'    },
  { id: 'ck-2', label: 'Adverse action notice templates approved by compliance',       status: 'complete'    },
  { id: 'ck-3', label: 'Demographic data collection forms deployed to origination UI', status: 'in_progress' },
  { id: 'ck-4', label: 'Annual LAR file export tested with CFPB validation tool',      status: 'pending'     },
  { id: 'ck-5', label: 'Staff training on 1071 data collection requirements',          status: 'pending'     },
  { id: 'ck-6', label: 'Third-party vendor DPA updated for demographic data handling', status: 'pending'     },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVATION_CONFIG: Record<ActivationStatus, { label: string; badge: string; dot: string; desc: string }> = {
  inactive:   { label: 'Inactive',   badge: 'bg-gray-800 text-gray-400 border-gray-700',            dot: 'bg-gray-600',           desc: 'Below monitoring threshold. No 1071 collection required.' },
  monitoring: { label: 'Monitoring', badge: 'bg-amber-900 text-amber-300 border-amber-700',          dot: 'bg-amber-400 animate-pulse', desc: 'Approaching coverage trigger. Demographic collection active in pre-collection mode.' },
  reporting:  { label: 'Reporting',  badge: 'bg-emerald-900 text-emerald-300 border-emerald-700',    dot: 'bg-emerald-400',        desc: 'Above threshold. Full 1071 data collection and annual reporting required.' },
};

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

function computeCompletenessScore(fields: CompletenessField[]) {
  return Math.round(fields.reduce((sum, f) => sum + f.pct, 0) / fields.length);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CoverageGauge({ current, threshold }: { current: number; threshold: number }) {
  const pct      = Math.min(current / threshold, 1);
  const size     = 160;
  const cx       = size / 2;
  const cy       = size / 2 + 16;
  const radius   = 58;
  const startAngle = -Math.PI;
  const endAngle   = 0;
  const arcLength  = Math.PI * radius;
  const filled     = arcLength * pct;

  const describeArc = (a1: number, a2: number) => {
    const x1 = cx + radius * Math.cos(a1);
    const y1 = cy + radius * Math.sin(a1);
    const x2 = cx + radius * Math.cos(a2);
    const y2 = cy + radius * Math.sin(a2);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  };

  const gaugeColor = pct >= 1 ? '#22c55e' : pct >= 0.8 ? '#f59e0b' : '#C9A84C';

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.65} aria-label={`Coverage ${current} of ${threshold}`}>
        <path d={describeArc(startAngle, endAngle)} fill="none" stroke="#1f2937" strokeWidth={14} strokeLinecap="round" />
        <path d={describeArc(startAngle, endAngle)} fill="none" stroke={gaugeColor} strokeWidth={14} strokeLinecap="round"
          strokeDasharray={`${filled} ${arcLength}`} style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={26} fontWeight="900" fill={gaugeColor}>{current}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="#6b7280">/ {threshold} trigger</text>
      </svg>
      <p className="text-xs font-semibold mt-1" style={{ color: gaugeColor }}>{Math.round(pct * 100)}% of threshold</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast notification
// ---------------------------------------------------------------------------

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-emerald-900 border border-emerald-700 text-emerald-200 px-5 py-3 rounded-xl shadow-2xl animate-fade-in">
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-emerald-400 hover:text-emerald-200 text-lg font-bold ml-2">&times;</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Undelivered Notices Modal
// ---------------------------------------------------------------------------

function UndeliveredModal({ onClose, onResend }: { onClose: () => void; onResend: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">Undelivered Adverse Action Notice</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl font-bold">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Urgency warning */}
          <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-red-300">Reg B Violation Risk</p>
            <p className="text-xs text-red-400 mt-1">
              ECOA Section 202.9 requires adverse action notices within 30 days. This notice is past the compliance window.
              Immediate action required to avoid regulatory penalty.
            </p>
          </div>

          {/* Detail */}
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Application ID</span>
              <span className="text-white font-mono font-semibold">APP-0074</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Business</span>
              <span className="text-white font-semibold">NovaGo</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Decision Date</span>
              <span className="text-white">{fmtDate('2026-03-18')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Reason</span>
              <span className="text-white">Collateral shortfall</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Delivery Status</span>
              <span className="text-red-400 font-semibold">Failed - Invalid email address</span>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between gap-3">
          <button className="text-sm text-[#C9A84C] hover:text-amber-300 underline underline-offset-2">
            Update Client Contact Info
          </button>
          <button
            onClick={onResend}
            className="bg-[#C9A84C] hover:bg-amber-500 text-gray-950 px-5 py-2 rounded-lg text-sm font-bold transition-colors"
          >
            Resend Notice
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FairLendingPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [demoGroup, setDemoGroup] = useState<'race' | 'gender' | 'ownership'>('race');
  const [selectedClient, setSelectedClient] = useState(CLIENTS[0].id);
  const [undeliveredModalOpen, setUndeliveredModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const ac             = ACTIVATION_CONFIG[ACTIVATION_STATUS];
  const overallScore   = computeCompletenessScore(COMPLETENESS_FIELDS);
  const filteredBuckets = DEMOGRAPHIC_BUCKETS.filter((b) => b.group === demoGroup);
  const maxRate        = Math.max(...DEMOGRAPHIC_BUCKETS.map((b) => b.approvalRate));

  const undelivered = ADVERSE_ACTION_ROWS.filter((a) => !a.noticeDelivered).length;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Find max entity/state rates for disparity flagging
  const maxEntityRate = Math.max(...ENTITY_RATES.map(e => e.rate));
  const maxStateRate  = Math.max(...STATE_RATES.map(s => s.rate));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

      {/* Undelivered Notices Modal */}
      {undeliveredModalOpen && (
        <UndeliveredModal
          onClose={() => setUndeliveredModalOpen(false)}
          onResend={() => {
            setUndeliveredModalOpen(false);
            showToast('Adverse action notice resent to NovaGo (APP-0074)');
          }}
        />
      )}

      {/* Client Selector */}
      <div className="mb-5">
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-4 py-2.5 focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C] appearance-none cursor-pointer min-w-[280px]"
        >
          {CLIENTS.map((c) => (
            <option key={c.id} value={c.id} className="bg-gray-900">{c.name}</option>
          ))}
        </select>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Fair Lending &amp; Section 1071</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            CFPB small-business lending data collection, demographic monitoring, and adverse action compliance
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${ac.badge}`}>
          <span className={`w-2 h-2 rounded-full ${ac.dot}`} />
          <span className="text-xs font-bold uppercase tracking-wide">{ac.label}</span>
        </div>
      </div>

      {/* Activation info banner */}
      <div className={`mb-6 px-4 py-3 rounded-xl border text-xs ${ac.badge} opacity-80`}>
        {ac.desc}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit flex-wrap">
        {(['overview', 'demographics', 'adverse', 'completeness'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === t ? 'bg-[#0A1628] text-[#C9A84C]' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            {t === 'overview' ? 'Overview' : t === 'demographics' ? 'Approval Rates' : t === 'adverse' ? 'Adverse Actions' : 'Data Completeness'}
          </button>
        ))}
      </div>

      {/* ================================================================== */}
      {/* OVERVIEW TAB                                                       */}
      {/* ================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Coverage gauge */}
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col items-center justify-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Coverage Threshold</p>
              <CoverageGauge current={DEAL_VOLUME} threshold={TRIGGER_THRESHOLD} />
              <p className="text-xs text-gray-500 mt-2 text-center">
                {TRIGGER_THRESHOLD - DEAL_VOLUME > 0
                  ? `${TRIGGER_THRESHOLD - DEAL_VOLUME} deals until 1071 reporting trigger`
                  : '1071 reporting required this period'}
              </p>
            </div>

            {/* KPI cards */}
            <div className="sm:col-span-2 grid grid-cols-2 gap-4">
              {[
                { label: 'YTD Applications', value: DEAL_VOLUME,      color: 'text-gray-100',  clickable: false },
                { label: 'Overall Approval Rate', value: '65%',        color: 'text-[#C9A84C]', clickable: false },
                { label: 'Adverse Actions Issued', value: ADVERSE_ACTION_ROWS.length, color: 'text-orange-400', clickable: false },
                { label: 'Undelivered Notices', value: undelivered,    color: undelivered > 0 ? 'text-red-400' : 'text-emerald-400', clickable: undelivered > 0 },
              ].map(({ label, value, color, clickable }) => (
                <div
                  key={label}
                  onClick={clickable ? () => setUndeliveredModalOpen(true) : undefined}
                  className={`rounded-xl border border-gray-800 bg-gray-900 p-5 ${
                    clickable ? 'cursor-pointer hover:border-red-700 hover:bg-gray-800/60 transition-colors group' : ''
                  }`}
                >
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                    {label}
                    {clickable && <span className="ml-1.5 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">Click to review</span>}
                  </p>
                  <p className={`text-4xl font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Completeness score preview */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-200">Data Completeness Score</p>
              <span className={`text-2xl font-black ${overallScore >= 85 ? 'text-emerald-400' : overallScore >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                {overallScore}%
              </span>
            </div>
            <div className="bg-gray-800 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${overallScore >= 85 ? 'bg-emerald-500' : overallScore >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${overallScore}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {COMPLETENESS_FIELDS.filter((f) => f.status === 'partial').length} fields partial &middot;{' '}
              {COMPLETENESS_FIELDS.filter((f) => f.status === 'missing').length} fields missing
            </p>
          </div>

          {/* Section 1071 Preparation Checklist */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-200">Section 1071 Preparation Checklist</p>
              <span className="text-xs text-gray-500">
                {SECTION_1071_CHECKLIST.filter(i => i.status === 'complete').length}/{SECTION_1071_CHECKLIST.length} complete
              </span>
            </div>
            <div className="space-y-3">
              {SECTION_1071_CHECKLIST.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  {/* Status icon */}
                  {item.status === 'complete' && (
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-900 border border-emerald-700 flex items-center justify-center text-emerald-400 text-xs flex-shrink-0">&#10003;</span>
                  )}
                  {item.status === 'in_progress' && (
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-amber-900 border border-amber-700 flex items-center justify-center text-amber-400 text-xs flex-shrink-0 animate-pulse">&#9679;</span>
                  )}
                  {item.status === 'pending' && (
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-600 text-xs flex-shrink-0">&#9675;</span>
                  )}
                  <div className="flex-1">
                    <p className={`text-sm ${item.status === 'complete' ? 'text-gray-500 line-through' : item.status === 'in_progress' ? 'text-amber-300' : 'text-gray-400'}`}>
                      {item.label}
                    </p>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                      item.status === 'complete' ? 'text-emerald-600' : item.status === 'in_progress' ? 'text-amber-600' : 'text-gray-600'
                    }`}>
                      {item.status === 'in_progress' ? 'In Progress' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <button
                onClick={() => showToast('LAR template generated and downloaded (Section1071_LAR_2026.csv)')}
                className="bg-[#0A1628] border border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C] hover:text-gray-950 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Generate LAR Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* APPROVAL RATES TAB                                                 */}
      {/* ================================================================== */}
      {activeTab === 'demographics' && (
        <div className="space-y-5">
          {/* Overall rate */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex items-center gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Overall Approval Rate</p>
              <p className="text-4xl font-black text-[#C9A84C]">65%</p>
            </div>
            <div className="flex-1 bg-gray-800 rounded-full h-3 ml-6">
              <div className="bg-[#C9A84C] h-3 rounded-full" style={{ width: '65%' }} />
            </div>
          </div>

          {/* By Entity Type */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <p className="text-sm font-semibold text-gray-200 mb-4">By Entity Type</p>
            <div className="space-y-4">
              {ENTITY_RATES.map((e) => {
                const disparity = maxEntityRate - e.rate > 20;
                return (
                  <div key={e.entity}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-300">{e.entity}</span>
                      <div className="flex items-center gap-2">
                        {disparity && (
                          <span className="text-[10px] bg-amber-900 text-amber-300 border border-amber-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                            &#9888; Potential disparity
                          </span>
                        )}
                        <span className="text-sm font-bold text-gray-200">{e.rate}%</span>
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${disparity ? 'bg-amber-500' : 'bg-blue-500'}`}
                        style={{ width: `${e.rate}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* By State */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <p className="text-sm font-semibold text-gray-200 mb-4">By State</p>
            <div className="space-y-4">
              {STATE_RATES.map((s) => {
                const disparity = maxStateRate - s.rate > 20;
                return (
                  <div key={s.state}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-gray-300">{s.state}</span>
                      <div className="flex items-center gap-2">
                        {disparity && (
                          <span className="text-[10px] bg-amber-900 text-amber-300 border border-amber-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                            &#9888; Potential disparity
                          </span>
                        )}
                        <span className="text-sm font-bold text-gray-200">{s.rate}%</span>
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${disparity ? 'bg-amber-500' : 'bg-indigo-500'}`}
                        style={{ width: `${s.rate}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Demographic group selector */}
          <div className="flex gap-2">
            {(['race', 'gender', 'ownership'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setDemoGroup(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  demoGroup === g
                    ? 'bg-[#0A1628] border-[#C9A84C] text-[#C9A84C]'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <p className="text-sm font-semibold text-gray-200 mb-1">By Demographic ({demoGroup})</p>
            <p className="text-xs text-gray-500 mb-4">
              Placeholder demographic data — categories self-reported per CFPB 1071 collection protocol.
            </p>
            <div className="space-y-4">
              {filteredBuckets.map((bucket) => (
                <div key={bucket.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-gray-300">{bucket.label}</span>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{bucket.approved}/{bucket.applications} approved</span>
                      <span className="font-bold text-gray-200">{bucket.approvalRate}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-800 rounded-full h-3">
                      <div
                        className={`${bucket.color} h-3 rounded-full transition-all duration-500`}
                        style={{ width: `${(bucket.approvalRate / maxRate) * 100}%` }}
                      />
                    </div>
                    {bucket.approvalRate < 60 && (
                      <span className="text-xs text-red-400 font-semibold whitespace-nowrap">Review</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 p-3 rounded-lg bg-amber-900/20 border border-amber-700/30 text-xs text-amber-300">
              Disparate impact analysis: approval rate gaps &gt;10 percentage points may trigger fair lending review under ECOA / Reg B.
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* ADVERSE ACTIONS TAB                                                */}
      {/* ================================================================== */}
      {activeTab === 'adverse' && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-200">Adverse Action Report</p>
            {undelivered > 0 && (
              <span className="text-xs bg-red-900 text-red-300 border border-red-700 px-2 py-0.5 rounded-full font-semibold">
                {undelivered} undelivered
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/80">
                  {['APP ID', 'Business', 'Date', 'Reason Stated', 'AI Reason', 'Match', 'Notice', 'Actions'].map((h) => (
                    <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ADVERSE_ACTION_ROWS.map((aa) => (
                  <tr key={aa.appId} className="border-b border-gray-800 hover:bg-gray-800/40">
                    <td className="py-3 px-4 text-sm font-mono text-gray-300">{aa.appId}</td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-100">{aa.business}</td>
                    <td className="py-3 px-4 text-xs text-gray-500">{fmtDate(aa.date)}</td>
                    <td className="py-3 px-4 text-xs text-gray-400">{aa.reasonStated}</td>
                    <td className="py-3 px-4 text-xs text-gray-400">{aa.aiReason}</td>
                    <td className="py-3 px-4">
                      {aa.match ? (
                        <span className="text-emerald-400 text-sm">&#10003;</span>
                      ) : (
                        <span className="text-xs bg-amber-900 text-amber-300 border border-amber-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                          &#9888;&#65039; Mismatch
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {aa.noticeDelivered ? (
                        <span className="text-emerald-400 text-sm">&#10003;</span>
                      ) : (
                        <span className="text-red-400 text-sm">&#10007;</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        {!aa.noticeDelivered && (
                          <button
                            onClick={() => showToast(`Notice resent to ${aa.business} (${aa.appId})`)}
                            className="text-xs bg-red-900/60 text-red-300 border border-red-700 px-2.5 py-1 rounded-lg hover:bg-red-800 transition-colors font-semibold"
                          >
                            Resend
                          </button>
                        )}
                        {!aa.match && (
                          <button
                            onClick={() => showToast(`Mismatch review opened for ${aa.appId}`)}
                            className="text-xs bg-amber-900/60 text-amber-300 border border-amber-700 px-2.5 py-1 rounded-lg hover:bg-amber-800 transition-colors font-semibold"
                          >
                            Review Mismatch
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
            Adverse action notices must be delivered within 30 days of credit decision (ECOA &sect;202.9). HMDA/1071 linkage tracked per application.
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* DATA COMPLETENESS TAB                                              */}
      {/* ================================================================== */}
      {activeTab === 'completeness' && (
        <div className="space-y-5">
          {/* Score card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col items-center justify-center sm:col-span-1">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Overall Score</p>
              <p className={`text-6xl font-black ${overallScore >= 85 ? 'text-emerald-400' : overallScore >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                {overallScore}
              </p>
              <p className="text-sm text-gray-500 mt-1">/ 100</p>
            </div>
            <div className="sm:col-span-2 grid grid-cols-3 gap-4">
              {[
                { label: 'Complete',  value: COMPLETENESS_FIELDS.filter((f) => f.status === 'complete').length, color: 'text-emerald-400' },
                { label: 'Partial',   value: COMPLETENESS_FIELDS.filter((f) => f.status === 'partial').length,  color: 'text-amber-400'   },
                { label: 'Missing',   value: COMPLETENESS_FIELDS.filter((f) => f.status === 'missing').length,  color: 'text-red-400'     },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                  <p className={`text-3xl font-black ${color}`}>{value}</p>
                  <p className="text-xs text-gray-600 mt-0.5">fields</p>
                </div>
              ))}
            </div>
          </div>

          {/* Incomplete fields with app IDs */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <p className="text-sm font-semibold text-gray-200 mb-4">Incomplete Fields</p>
            <div className="space-y-4">
              {INCOMPLETE_FIELDS.map((f) => (
                <div key={f.field} className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-200">{f.field}</p>
                      <p className="text-xs text-gray-500">{f.detail}</p>
                    </div>
                    <button className="text-xs text-[#C9A84C] hover:text-amber-300 font-semibold whitespace-nowrap">
                      Complete &rarr;
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {f.appIds.map((id) => (
                      <span key={id} className="text-[10px] font-mono bg-gray-700 text-gray-300 px-2 py-0.5 rounded-md border border-gray-600">
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => showToast('Missing data request emails sent to 9 applicants')}
                className="bg-[#0A1628] border border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C] hover:text-gray-950 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Request Missing Data
              </button>
              <button
                onClick={() => showToast('Data completeness report exported (FairLending_Completeness_2026.csv)')}
                className="bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-gray-100 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Export Report
              </button>
            </div>
          </div>

          {/* Field detail table */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/80">
                  {['Field', 'Required', 'Completeness', 'Status'].map((h) => (
                    <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPLETENESS_FIELDS.map((f) => (
                  <tr key={f.field} className="border-b border-gray-800 hover:bg-gray-800/40">
                    <td className="py-3 px-4 text-sm text-gray-100">{f.field}</td>
                    <td className="py-3 px-4">
                      {f.required ? (
                        <span className="text-xs bg-blue-900 text-blue-300 border border-blue-700 px-1.5 py-0.5 rounded-full font-semibold">Required</span>
                      ) : (
                        <span className="text-xs text-gray-600">Optional</span>
                      )}
                    </td>
                    <td className="py-3 px-4 w-44">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                          <div
                            className={`${
                              f.status === 'complete' ? 'bg-emerald-500' : f.status === 'partial' ? 'bg-amber-500' : 'bg-red-500'
                            } h-1.5 rounded-full transition-all duration-500`}
                            style={{ width: `${f.pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-8 text-right">{f.pct}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${
                        f.status === 'complete' ? 'bg-emerald-900 text-emerald-300 border-emerald-700' :
                        f.status === 'partial'  ? 'bg-amber-900 text-amber-300 border-amber-700' :
                                                   'bg-red-900 text-red-300 border-red-700'
                      }`}>
                        {f.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
