'use client';

// ============================================================
// /fair-lending — Section 1071 / Fair Lending Dashboard
// Coverage threshold gauge (deal volume vs 1071 trigger),
// approval rate by demographic bucket, adverse action report
// table, data completeness score, activation status indicator.
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivationStatus = 'inactive' | 'monitoring' | 'reporting';

interface DemographicBucket {
  label:       string;
  group:       string;
  applications: number;
  approved:    number;
  approvalRate: number;
  color:       string;
}

interface AdverseAction {
  id:         string;
  applicant:  string;
  date:       string;
  reasons:    string[];
  noticeType: 'written' | 'electronic';
  delivered:  boolean;
  demographic: string;
}

interface CompletenessField {
  field:     string;
  pct:       number;
  required:  boolean;
  status:    'complete' | 'partial' | 'missing';
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const DEAL_VOLUME       = 87;   // current YTD deal count
const TRIGGER_THRESHOLD = 100;  // CFPB 1071 small-entity threshold (illustrative)

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

const ADVERSE_ACTIONS: AdverseAction[] = [
  {
    id: 'aa_001', applicant: 'Crestline Medical LLC', date: '2026-03-28',
    reasons: ['Insufficient cash flow', 'High debt-to-income'],
    noticeType: 'electronic', delivered: true, demographic: 'Not Reported',
  },
  {
    id: 'aa_002', applicant: 'BlueStar Logistics', date: '2026-03-25',
    reasons: ['Credit history — derogatory marks'],
    noticeType: 'written', delivered: true, demographic: 'Hispanic / Latino',
  },
  {
    id: 'aa_003', applicant: 'Keystone Retail Co.', date: '2026-03-20',
    reasons: ['Business age < 2 years', 'Insufficient revenue documentation'],
    noticeType: 'electronic', delivered: false, demographic: 'Black or Afr. American',
  },
  {
    id: 'aa_004', applicant: 'Alpine Tech Partners', date: '2026-03-18',
    reasons: ['Collateral shortfall'],
    noticeType: 'written', delivered: true, demographic: 'White (Non-Hispanic)',
  },
  {
    id: 'aa_005', applicant: 'Harbor Street Foods', date: '2026-03-12',
    reasons: ['Unverifiable identity documents', 'KYB incomplete'],
    noticeType: 'electronic', delivered: true, demographic: 'Asian',
  },
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
  { field: 'Annual revenue',              pct: 91,  required: true,  status: 'complete' },
  { field: 'Gross annual income',         pct: 55,  required: false, status: 'partial'  },
  { field: 'Number of workers',           pct: 88,  required: false, status: 'complete' },
  { field: 'Time in business',            pct: 96,  required: true,  status: 'complete' },
  { field: 'Census tract',               pct: 42,  required: false, status: 'missing'  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVATION_CONFIG: Record<ActivationStatus, { label: string; badge: string; dot: string; desc: string }> = {
  inactive:   { label: 'Inactive',   badge: 'bg-gray-800 text-gray-400 border-gray-700',            dot: 'bg-gray-600',           desc: 'Below monitoring threshold. No 1071 collection required.' },
  monitoring: { label: 'Monitoring', badge: 'bg-amber-900 text-amber-300 border-amber-700',          dot: 'bg-amber-400 animate-pulse', desc: 'Approaching coverage trigger. Demographic collection active in pre-collection mode.' },
  reporting:  { label: 'Reporting',  badge: 'bg-emerald-900 text-emerald-300 border-emerald-700',    dot: 'bg-emerald-400',        desc: 'Above threshold. Full 1071 data collection and annual reporting required.' },
};

const COMPLETENESS_STATUS_STYLE: Record<CompletenessField['status'], string> = {
  complete: 'bg-emerald-500',
  partial:  'bg-amber-500',
  missing:  'bg-red-500',
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

// Coverage threshold gauge (SVG arc)
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
        {/* Track */}
        <path
          d={describeArc(startAngle, endAngle)}
          fill="none" stroke="#1f2937" strokeWidth={14} strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={describeArc(startAngle, endAngle)}
          fill="none" stroke={gaugeColor} strokeWidth={14} strokeLinecap="round"
          strokeDasharray={`${filled} ${arcLength}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        {/* Label */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={26} fontWeight="900" fill={gaugeColor}>
          {current}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="#6b7280">
          / {threshold} trigger
        </text>
      </svg>
      <p className="text-xs font-semibold mt-1" style={{ color: gaugeColor }}>
        {Math.round(pct * 100)}% of threshold
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FairLendingPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'demographics' | 'adverse' | 'completeness'>('overview');
  const [demoGroup, setDemoGroup] = useState<'race' | 'gender' | 'ownership'>('race');

  const ac             = ACTIVATION_CONFIG[ACTIVATION_STATUS];
  const overallScore   = computeCompletenessScore(COMPLETENESS_FIELDS);
  const filteredBuckets = DEMOGRAPHIC_BUCKETS.filter((b) => b.group === demoGroup);
  const maxRate        = Math.max(...DEMOGRAPHIC_BUCKETS.map((b) => b.approvalRate));

  const undelivered = ADVERSE_ACTIONS.filter((a) => !a.delivered).length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Fair Lending &amp; Section 1071</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            CFPB small-business lending data collection, demographic monitoring, and adverse action compliance
          </p>
        </div>
        {/* Activation status */}
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

      {/* ── Overview ────────────────────────────────────────── */}
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

            {/* Stats */}
            <div className="sm:col-span-2 grid grid-cols-2 gap-4">
              {[
                { label: 'YTD Applications', value: DEAL_VOLUME,      color: 'text-gray-100' },
                { label: 'Overall Approval Rate', value: '65%',        color: 'text-[#C9A84C]' },
                { label: 'Adverse Actions Issued', value: ADVERSE_ACTIONS.length, color: 'text-orange-400' },
                { label: 'Undelivered Notices', value: undelivered,    color: undelivered > 0 ? 'text-red-400' : 'text-emerald-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
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
        </div>
      )}

      {/* ── Demographics / Approval Rates ───────────────────── */}
      {activeTab === 'demographics' && (
        <div className="space-y-5">
          {/* Group selector */}
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
            <p className="text-xs text-gray-500 mb-1">
              Placeholder demographic data — categories self-reported per CFPB 1071 collection protocol.
            </p>
            <div className="mt-4 space-y-4">
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
                    {/* Disparity indicator */}
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

      {/* ── Adverse Actions ─────────────────────────────────── */}
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
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80">
                {['Applicant', 'Date', 'Reasons', 'Notice Type', 'Delivered', 'Demographic'].map((h) => (
                  <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ADVERSE_ACTIONS.map((aa) => (
                <tr key={aa.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                  <td className="py-3 px-4 text-sm font-medium text-gray-100">{aa.applicant}</td>
                  <td className="py-3 px-4 text-xs text-gray-500">{fmtDate(aa.date)}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1">
                      {aa.reasons.map((r) => (
                        <span key={r} className="text-xs text-gray-400">&bull; {r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full capitalize">
                      {aa.noticeType}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-xs font-semibold ${aa.delivered ? 'text-emerald-400' : 'text-red-400'}`}>
                      {aa.delivered ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-gray-500">{aa.demographic}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
            Adverse action notices must be delivered within 30 days of credit decision (ECOA §202.9). HMDA/1071 linkage tracked per application.
          </div>
        </div>
      )}

      {/* ── Data Completeness ───────────────────────────────── */}
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
                            className={`${COMPLETENESS_STATUS_STYLE[f.status]} h-1.5 rounded-full transition-all duration-500`}
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
