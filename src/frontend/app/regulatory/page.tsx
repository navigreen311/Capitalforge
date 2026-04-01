'use client';

// ============================================================
// /regulatory — Regulatory Intelligence
// Alerts table (FTC/CFPB/Visa/state AG), impact score,
// affected modules, status. Funds-flow classification panel.
// Licensing status summary. AML readiness gauge.
// ============================================================

import { useState, useMemo, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AlertSource = 'FTC' | 'CFPB' | 'Visa' | 'State AG' | 'FinCEN' | 'OCC';
type AlertStatus = 'new' | 'reviewed' | 'actioned';
type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';
type LicenseStatus = 'active' | 'pending' | 'expired' | 'exempt';
type FlowClass = 'pass-through' | 'merchant-advance' | 'credit-facility' | 'factoring' | 'sweep';

interface RegulatoryAlert {
  id: string;
  title: string;
  source: AlertSource;
  impactScore: number;        // 0–100
  impactLevel: ImpactLevel;
  affectedModules: string[];
  status: AlertStatus;
  issuedDate: string;
  summary: string;
}

interface FundsFlowItem {
  id: string;
  name: string;
  classification: FlowClass;
  volume: string;
  regRef: string;
  flagged: boolean;
}

interface LicenseRecord {
  jurisdiction: string;
  licenseType: string;
  licenseNumber: string;
  status: LicenseStatus;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const CLIENTS = [
  { id: 'cl_001', name: 'Apex Capital Partners' },
  { id: 'cl_002', name: 'BlueVine Merchant Services' },
  { id: 'cl_003', name: 'Cedar Financial Group' },
  { id: 'cl_004', name: 'Delta Funding Corp' },
];

const PLACEHOLDER_ALERTS: RegulatoryAlert[] = [
  {
    id: 'ra_001',
    title: 'Updated UDAP Enforcement Guidance – Small Business Credit',
    source: 'CFPB',
    impactScore: 88,
    impactLevel: 'critical',
    affectedModules: ['Underwriting', 'Disclosures', 'Onboarding'],
    status: 'new',
    issuedDate: '2026-03-28',
    summary: 'New supervisory guidance expands UDAP applicability to AI-assisted credit decisions for businesses under $5M revenue.',
  },
  {
    id: 'ra_002',
    title: 'Visa Rule Revision – Commercial Prepaid Card Float Limits',
    source: 'Visa',
    impactScore: 62,
    impactLevel: 'high',
    affectedModules: ['Card Issuance', 'Treasury'],
    status: 'reviewed',
    issuedDate: '2026-03-21',
    summary: 'Visa network rules revised to cap overnight float balances on commercial prepaid products at $250K per merchant.',
  },
  {
    id: 'ra_003',
    title: 'FTC Rule: Business Opportunity Disclosure Amendments',
    source: 'FTC',
    impactScore: 47,
    impactLevel: 'medium',
    affectedModules: ['Marketing', 'Onboarding'],
    status: 'reviewed',
    issuedDate: '2026-03-15',
    summary: 'Amended rule requires upfront earnings disclosures in any business opportunity offer bundled with a credit product.',
  },
  {
    id: 'ra_004',
    title: 'NY AG – Merchant Cash Advance Broker Fee Inquiry',
    source: 'State AG',
    impactScore: 74,
    impactLevel: 'high',
    affectedModules: ['MCA Workflow', 'Broker Portal', 'Reporting'],
    status: 'actioned',
    issuedDate: '2026-03-10',
    summary: 'NY AG issued CID to five MCA providers re broker compensation transparency. Internal records review completed.',
  },
  {
    id: 'ra_005',
    title: 'FinCEN AML/CFT Program Rule – Non-Bank Lenders',
    source: 'FinCEN',
    impactScore: 91,
    impactLevel: 'critical',
    affectedModules: ['AML Engine', 'KYB', 'Reporting'],
    status: 'new',
    issuedDate: '2026-03-05',
    summary: 'Proposed rule would impose formal AML program requirements on non-bank commercial lenders above $10M in annual originations.',
  },
  {
    id: 'ra_006',
    title: 'OCC Guidance – Third-Party Fintech Risk Management',
    source: 'OCC',
    impactScore: 38,
    impactLevel: 'low',
    affectedModules: ['Vendor Management'],
    status: 'actioned',
    issuedDate: '2026-02-28',
    summary: 'Updated third-party risk management bulletin requires annual vendor compliance audits for bank-fintech partnerships.',
  },
];

const PLACEHOLDER_FLOWS: FundsFlowItem[] = [
  { id: 'ff_001', name: 'MCA Daily Remittance – ACH Pull',        classification: 'merchant-advance',  volume: '$2.4M/day',  regRef: 'UCC Art. 9 / NACHA',          flagged: false },
  { id: 'ff_002', name: 'Revolving Credit Facility Draw',          classification: 'credit-facility',   volume: '$800K/draw', regRef: 'Reg Z / TILA',                flagged: false },
  { id: 'ff_003', name: 'Invoice Factoring Settlement',            classification: 'factoring',          volume: '$1.1M/batch',regRef: 'UCC Art. 9',                  flagged: true  },
  { id: 'ff_004', name: 'Operating Account Sweep',                 classification: 'sweep',              volume: '$500K/night',regRef: 'FDIC Part 370 / Reg E',       flagged: true  },
  { id: 'ff_005', name: 'Pass-Through Payment Rails',              classification: 'pass-through',       volume: '$3.7M/day',  regRef: 'NACHA / Visa / Mastercard',   flagged: false },
];

const PLACEHOLDER_LICENSES: LicenseRecord[] = [
  { jurisdiction: 'CA', licenseType: 'Commercial Financing License',      licenseNumber: 'CFL-60DX-2024',  status: 'active',  expiresAt: '2027-06-30' },
  { jurisdiction: 'NY', licenseType: 'Premium Finance Agency',             licenseNumber: 'PFA-NY-0441',    status: 'active',  expiresAt: '2026-12-31' },
  { jurisdiction: 'TX', licenseType: 'Credit Access Business',             licenseNumber: 'CAB-TX-8821',    status: 'pending', expiresAt: '\u2014'          },
  { jurisdiction: 'FL', licenseType: 'Consumer Finance Company',           licenseNumber: 'CFC-FL-1103',    status: 'active',  expiresAt: '2026-09-30' },
  { jurisdiction: 'IL', licenseType: 'Retail Installment Sales Act',       licenseNumber: 'RISA-IL-0772',   status: 'expired', expiresAt: '2025-12-31' },
  { jurisdiction: 'WA', licenseType: 'Commercial Lending Exemption',       licenseNumber: 'N/A',            status: 'exempt',  expiresAt: '\u2014'          },
];

// AML readiness pillars: score 0–100 each
const AML_PILLARS = [
  { label: 'Customer Due Diligence',  score: 91, improvePath: '/compliance/training' },
  { label: 'Transaction Monitoring',  score: 78, improvePath: '/compliance/training' },
  { label: 'SAR Filing Readiness',    score: 84, improvePath: '/documents' },
  { label: 'Sanctions Screening',     score: 96, improvePath: '/compliance/training' },
  { label: 'Record Retention',        score: 70, improvePath: '/documents' },
  { label: 'Training & Awareness',    score: 63, improvePath: '/compliance/training' },
];

// ---------------------------------------------------------------------------
// AML module path mapping for "Improve" links
// ---------------------------------------------------------------------------
const AML_IMPROVE_MAP: Record<string, string> = {
  'Customer Due Diligence': '/compliance/training',
  'Transaction Monitoring': '/compliance/training',
  'SAR Filing Readiness': '/documents',
  'Sanctions Screening': '/compliance/training',
  'Record Retention': '/documents',
  'Training & Awareness': '/compliance/training',
};

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

const IMPACT_CONFIG: Record<ImpactLevel, { badgeClass: string; barColor: string; dotClass: string }> = {
  low:      { badgeClass: 'bg-green-900 text-green-300 border-green-700',   barColor: '#22c55e', dotClass: 'bg-green-400' },
  medium:   { badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700',barColor: '#eab308', dotClass: 'bg-yellow-400' },
  high:     { badgeClass: 'bg-orange-900 text-orange-300 border-orange-700',barColor: '#f97316', dotClass: 'bg-orange-400' },
  critical: { badgeClass: 'bg-red-900 text-red-300 border-red-700',         barColor: '#ef4444', dotClass: 'bg-red-400' },
};

const STATUS_CONFIG: Record<AlertStatus, { label: string; cls: string }> = {
  new:      { label: 'New',      cls: 'bg-blue-900 text-blue-300 border-blue-700' },
  reviewed: { label: 'Reviewed', cls: 'bg-gray-800 text-gray-300 border-gray-600' },
  actioned: { label: 'Actioned', cls: 'bg-green-900 text-green-300 border-green-700' },
};

const FLOW_CLASS_CONFIG: Record<FlowClass, { label: string; cls: string }> = {
  'pass-through':    { label: 'Pass-Through',     cls: 'bg-sky-900 text-sky-300 border-sky-700' },
  'merchant-advance':{ label: 'Merchant Advance',  cls: 'bg-violet-900 text-violet-300 border-violet-700' },
  'credit-facility': { label: 'Credit Facility',   cls: 'bg-indigo-900 text-indigo-300 border-indigo-700' },
  'factoring':       { label: 'Factoring',          cls: 'bg-amber-900 text-amber-300 border-amber-700' },
  'sweep':           { label: 'Sweep',              cls: 'bg-teal-900 text-teal-300 border-teal-700' },
};

const LICENSE_STATUS_CONFIG: Record<LicenseStatus, { label: string; cls: string; dotClass: string }> = {
  active:  { label: 'Active',  cls: 'bg-green-900 text-green-300 border-green-700',   dotClass: 'bg-green-400' },
  pending: { label: 'Pending', cls: 'bg-yellow-900 text-yellow-300 border-yellow-700',dotClass: 'bg-yellow-400' },
  expired: { label: 'Expired', cls: 'bg-red-900 text-red-300 border-red-700',         dotClass: 'bg-red-400' },
  exempt:  { label: 'Exempt',  cls: 'bg-gray-800 text-gray-300 border-gray-600',      dotClass: 'bg-gray-400' },
};

const SOURCE_CONFIG: Record<AlertSource, { cls: string }> = {
  FTC:      { cls: 'bg-red-950 text-red-300 border-red-800' },
  CFPB:     { cls: 'bg-blue-950 text-blue-300 border-blue-800' },
  Visa:     { cls: 'bg-indigo-950 text-indigo-300 border-indigo-800' },
  'State AG':{ cls: 'bg-amber-950 text-amber-300 border-amber-800' },
  FinCEN:   { cls: 'bg-orange-950 text-orange-300 border-orange-800' },
  OCC:      { cls: 'bg-teal-950 text-teal-300 border-teal-800' },
};

// Module -> route mapping for "Go to Affected Module"
const MODULE_ROUTES: Record<string, string> = {
  'Underwriting': '/underwriting',
  'Disclosures': '/disclosures',
  'Onboarding': '/onboarding',
  'Card Issuance': '/card-issuance',
  'Treasury': '/treasury',
  'Marketing': '/marketing',
  'MCA Workflow': '/mca',
  'Broker Portal': '/broker-portal',
  'Reporting': '/reporting',
  'AML Engine': '/aml',
  'KYB': '/kyb',
  'Vendor Management': '/vendor-management',
};

function formatDate(s: string) {
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
}

function amlOverall(pillars: typeof AML_PILLARS) {
  return Math.round(pillars.reduce((acc, p) => acc + p.score, 0) / pillars.length);
}

function amlColor(score: number) {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#eab308';
  return '#ef4444';
}

function daysBetween(dateStr: string, now: Date): number {
  const d = new Date(dateStr);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-gray-800 border border-gray-700 text-gray-100 px-5 py-3 rounded-xl shadow-2xl animate-fade-in">
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ImpactBar({ score, level }: { score: number; level: ImpactLevel }) {
  const { barColor } = IMPACT_CONFIG[level];
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${score}%`, backgroundColor: barColor, transition: 'width 0.4s ease' }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color: barColor }}>{score}</span>
    </div>
  );
}

function AmlGauge({ score }: { score: number }) {
  const size = 128;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);
  const cx = size / 2;
  const cy = size / 2;
  const color = amlColor(score);
  const label = score >= 80 ? 'Ready' : score >= 60 ? 'Developing' : 'At Risk';

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} aria-label={`AML readiness ${score}`}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1f2937" strokeWidth={11} />
        <circle
          cx={cx} cy={cy} r={radius} fill="none"
          stroke={color} strokeWidth={11} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize={24} fontWeight="900" fill={color}>{score}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={10} fill="#9ca3af">/ 100</text>
      </svg>
      <p className="text-xs font-semibold mt-1" style={{ color }}>{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RegulatoryPage() {
  const [alerts, setAlerts] = useState<RegulatoryAlert[]>(PLACEHOLDER_ALERTS);
  const [flows] = useState<FundsFlowItem[]>(PLACEHOLDER_FLOWS);
  const [licenses] = useState<LicenseRecord[]>(PLACEHOLDER_LICENSES);
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');
  const [selectedClient, setSelectedClient] = useState(CLIENTS[0].id);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Alert action modal
  const [selectedAlert, setSelectedAlert] = useState<RegulatoryAlert | null>(null);
  const [alertNotes, setAlertNotes] = useState('');

  // Flow review modal
  const [flowReviewModal, setFlowReviewModal] = useState<FundsFlowItem | null>(null);
  const [flowRationale, setFlowRationale] = useState('');

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }, []);

  const newCount      = alerts.filter((a) => a.status === 'new').length;
  const reviewedCount = alerts.filter((a) => a.status === 'reviewed').length;
  const actionedCount = alerts.filter((a) => a.status === 'actioned').length;
  const criticalCount = alerts.filter((a) => a.impactLevel === 'critical').length;
  const flaggedFlows  = flows.filter((f) => f.flagged).length;
  const expiredLicenses = licenses.filter((l) => l.status === 'expired').length;
  const amlScore      = amlOverall(AML_PILLARS);

  const visibleAlerts = statusFilter === 'all' ? alerts : alerts.filter((a) => a.status === statusFilter);

  // Tab counts
  const tabCounts: Record<string, number> = {
    all: alerts.length,
    new: newCount,
    reviewed: reviewedCount,
    actioned: actionedCount,
  };

  // License renewal calendar: licenses expiring within 120 days
  const now = new Date();
  const renewalCalendar = useMemo(() => {
    return licenses
      .filter((l) => {
        if (l.expiresAt === '\u2014' || l.expiresAt === '—') return false;
        const days = daysBetween(l.expiresAt, now);
        return days <= 120; // includes already-expired (negative days)
      })
      .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenses]);

  // Export CSV handler
  const handleExportReport = useCallback(() => {
    const headers = ['ID', 'Title', 'Source', 'Impact Score', 'Impact Level', 'Affected Modules', 'Status', 'Issued Date', 'Summary'];
    const rows = alerts.map((a) => [
      a.id,
      `"${a.title.replace(/"/g, '""')}"`,
      a.source,
      String(a.impactScore),
      a.impactLevel,
      `"${a.affectedModules.join(', ')}"`,
      a.status,
      a.issuedDate,
      `"${a.summary.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `regulatory-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Regulatory alerts CSV exported successfully');
  }, [alerts, showToast]);

  // Alert status advancement
  const advanceAlertStatus = useCallback((alertId: string, newStatus: AlertStatus) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, status: newStatus } : a))
    );
    const statusLabel = STATUS_CONFIG[newStatus].label;
    showToast(`Alert marked as ${statusLabel}`);
    setSelectedAlert(null);
  }, [showToast]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}

      {/* ── Alert Action Modal ─────────────────────────────── */}
      {selectedAlert && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedAlert(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white leading-snug">{selectedAlert.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${SOURCE_CONFIG[selectedAlert.source].cls}`}>
                    {selectedAlert.source}
                  </span>
                  <span className="text-xs text-gray-400">{formatDate(selectedAlert.issuedDate)}</span>
                </div>
              </div>
              <button onClick={() => setSelectedAlert(null)} className="text-gray-400 hover:text-white text-xl leading-none ml-3">&times;</button>
            </div>

            <p className="text-sm text-gray-300 mb-4 leading-relaxed">{selectedAlert.summary}</p>

            {/* Impact */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs text-gray-400 uppercase font-semibold">Impact</span>
              <ImpactBar score={selectedAlert.impactScore} level={selectedAlert.impactLevel} />
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${IMPACT_CONFIG[selectedAlert.impactLevel].badgeClass}`}>
                {selectedAlert.impactLevel}
              </span>
            </div>

            {/* Affected Modules */}
            <div className="mb-4">
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1.5">Affected Modules</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedAlert.affectedModules.map((m) => (
                  <a
                    key={m}
                    href={MODULE_ROUTES[m] || '#'}
                    className="text-xs bg-gray-800 text-blue-300 border border-gray-700 px-2 py-1 rounded hover:bg-gray-700 hover:text-blue-200 transition-colors"
                  >
                    {m} &rarr;
                  </a>
                ))}
              </div>
            </div>

            {/* Current Status */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-gray-400 uppercase font-semibold">Status</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_CONFIG[selectedAlert.status].cls}`}>
                {STATUS_CONFIG[selectedAlert.status].label}
              </span>
            </div>

            {/* Notes */}
            <div className="mb-4">
              <label className="block text-xs text-gray-400 uppercase font-semibold mb-1.5">Notes</label>
              <textarea
                value={alertNotes}
                onChange={(e) => setAlertNotes(e.target.value)}
                placeholder="Add internal notes..."
                className="w-full h-20 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 px-3 py-2 placeholder-gray-500 focus:outline-none focus:border-yellow-600 resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {selectedAlert.status === 'new' && (
                <button
                  onClick={() => advanceAlertStatus(selectedAlert.id, 'reviewed')}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-colors"
                >
                  Mark as Reviewed
                </button>
              )}
              {selectedAlert.status === 'reviewed' && (
                <button
                  onClick={() => advanceAlertStatus(selectedAlert.id, 'actioned')}
                  className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-semibold text-white transition-colors"
                >
                  Mark as Actioned
                </button>
              )}
              <button
                onClick={() => {
                  showToast(`Alert assigned to advisor`);
                  setSelectedAlert(null);
                }}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold text-gray-200 transition-colors"
              >
                Assign to Advisor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Flow Review Modal ──────────────────────────────── */}
      {flowReviewModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setFlowReviewModal(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Review Classification</h3>
              <button onClick={() => setFlowReviewModal(null)} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold">Flow Name</p>
                <p className="text-sm text-gray-100 font-medium">{flowReviewModal.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold">Regulation</p>
                <p className="text-sm text-gray-300">{flowReviewModal.regRef}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold">Current Classification</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${FLOW_CLASS_CONFIG[flowReviewModal.classification].cls}`}>
                  {FLOW_CLASS_CONFIG[flowReviewModal.classification].label}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-semibold">Volume</p>
                <p className="text-sm text-gray-200 font-semibold tabular-nums">{flowReviewModal.volume}</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-gray-400 uppercase font-semibold mb-1.5">Rationale</label>
              <textarea
                value={flowRationale}
                onChange={(e) => setFlowRationale(e.target.value)}
                placeholder="Explain classification rationale..."
                className="w-full h-20 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 px-3 py-2 placeholder-gray-500 focus:outline-none focus:border-yellow-600 resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  showToast(`Classification approved for "${flowReviewModal.name}"`);
                  setFlowReviewModal(null);
                  setFlowRationale('');
                }}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-semibold text-white transition-colors"
              >
                Approve Classification
              </button>
              <button
                onClick={() => {
                  showToast(`"${flowReviewModal.name}" escalated to Legal`);
                  setFlowReviewModal(null);
                  setFlowRationale('');
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-semibold text-white transition-colors"
              >
                Escalate to Legal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Client Selector ───────────────────────────────── */}
      <div className="mb-6">
        <label className="block text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1.5">Client</label>
        <select
          value={selectedClient}
          onChange={(e) => {
            setSelectedClient(e.target.value);
            const client = CLIENTS.find((c) => c.id === e.target.value);
            showToast(`Switched to ${client?.name}`);
          }}
          className="bg-gray-900 border border-gray-700 text-gray-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-yellow-600 min-w-[260px] appearance-none cursor-pointer"
        >
          {CLIENTS.map((c) => (
            <option key={c.id} value={c.id} className="bg-gray-900 text-gray-100">{c.name}</option>
          ))}
        </select>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Regulatory Intelligence</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {alerts.length} alerts &middot; {newCount} new
            {criticalCount > 0 && (
              <span className="ml-2 text-red-400 font-semibold">{'\u26A0'} {criticalCount} critical</span>
            )}
          </p>
        </div>
        <button
          onClick={handleExportReport}
          className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-sm font-semibold text-black transition-colors"
        >
          Export Report
        </button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'New Alerts',       value: newCount,        color: 'text-blue-400' },
          { label: 'Critical Impact',  value: criticalCount,   color: criticalCount > 0 ? 'text-red-400' : 'text-gray-400' },
          { label: 'Flagged Flows',    value: flaggedFlows,    color: flaggedFlows > 0 ? 'text-orange-400' : 'text-gray-400' },
          { label: 'Expired Licenses', value: expiredLicenses, color: expiredLicenses > 0 ? 'text-red-400' : 'text-gray-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-4xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Main grid: alerts table (left) + AML gauge (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">

        {/* -- Alerts table -------------------------------- */}
        <div className="xl:col-span-2 rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              Regulatory Alerts
            </h2>
            {/* Status filter pills with counts */}
            <div className="flex gap-1">
              {(['all', 'new', 'reviewed', 'actioned'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    statusFilter === f
                      ? 'bg-yellow-600 text-black border-yellow-500'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
                  }`}
                >
                  {f === 'all' ? 'All' : STATUS_CONFIG[f].label}
                  <span className="ml-1 opacity-70">({tabCounts[f]})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-4">Source</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-4">Alert</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-4 whitespace-nowrap">Impact</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-4">Modules</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleAlerts.map((alert) => (
                  <tr
                    key={alert.id}
                    className="border-b border-gray-800/50 cursor-pointer hover:bg-gray-800/40 transition-colors"
                    onClick={() => {
                      setSelectedAlert(alert);
                      setAlertNotes('');
                    }}
                  >
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${SOURCE_CONFIG[alert.source].cls}`}>
                        {alert.source}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-gray-100 text-xs leading-snug max-w-[220px]">{alert.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(alert.issuedDate)}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <ImpactBar score={alert.impactScore} level={alert.impactLevel} />
                      <span className={`mt-1 inline-block text-xs font-semibold px-1.5 py-0.5 rounded border ${IMPACT_CONFIG[alert.impactLevel].badgeClass}`}>
                        {alert.impactLevel}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {alert.affectedModules.map((m) => (
                          <span key={m} className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_CONFIG[alert.status].cls}`}>
                        {STATUS_CONFIG[alert.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* -- AML Readiness Gauge -------------------------------- */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
            AML Readiness
          </h2>
          <div className="flex justify-center mb-5">
            <AmlGauge score={amlScore} />
          </div>
          <div className="space-y-3">
            {AML_PILLARS.map((p) => {
              const color = amlColor(p.score);
              const needsImprove = p.score < 75;
              return (
                <div key={p.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{p.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums" style={{ color }}>{p.score}</span>
                      {needsImprove && (
                        <a
                          href={AML_IMPROVE_MAP[p.label] || '/compliance/training'}
                          className="text-yellow-400 hover:text-yellow-300 font-semibold transition-colors"
                        >
                          Improve &rarr;
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.score}%`, backgroundColor: color, transition: 'width 0.4s ease' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Funds-flow classification + Licensing */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

        {/* -- Funds-Flow Classification -------------------------------- */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              Funds-Flow Classification
            </h2>
            {flaggedFlows > 0 && (
              <span className="text-xs font-semibold text-orange-400 bg-orange-950 border border-orange-800 px-2 py-0.5 rounded-full">
                {flaggedFlows} flagged
              </span>
            )}
          </div>
          <div className="space-y-3">
            {flows.map((f) => {
              const cls = FLOW_CLASS_CONFIG[f.classification];
              return (
                <div
                  key={f.id}
                  className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                    f.flagged ? 'border-orange-800 bg-orange-950/30' : 'border-gray-800 bg-gray-800/40'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cls.cls}`}>
                        {cls.label}
                      </span>
                      {f.flagged && (
                        <button
                          onClick={() => {
                            setFlowReviewModal(f);
                            setFlowRationale('');
                          }}
                          className="text-xs font-bold text-orange-400 bg-orange-950 border border-orange-700 px-2 py-0.5 rounded hover:bg-orange-900 transition-colors"
                        >
                          {'\u26A0'} Review Classification
                        </button>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-100 truncate">{f.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{f.regRef}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-200 tabular-nums">{f.volume}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* -- Licensing Status Summary -------------------------------- */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              Licensing Status
            </h2>
            <div className="flex gap-2 text-xs">
              {(['active', 'pending', 'expired', 'exempt'] as LicenseStatus[]).map((s) => {
                const cnt = licenses.filter((l) => l.status === s).length;
                if (!cnt) return null;
                const cfg = LICENSE_STATUS_CONFIG[s];
                return (
                  <span key={s} className={`px-2 py-0.5 rounded-full border font-semibold ${cfg.cls}`}>
                    {cnt} {cfg.label}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-3">State</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-3">License Type</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-3">Number</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-3">Expires</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-3">Status</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((l, i) => {
                  const cfg = LICENSE_STATUS_CONFIG[l.status];
                  return (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="py-2.5 pr-3">
                        <span className="text-xs font-bold bg-gray-800 text-gray-200 border border-gray-700 px-2 py-0.5 rounded">
                          {l.jurisdiction}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-gray-300 max-w-[160px]">{l.licenseType}</td>
                      <td className="py-2.5 pr-3 text-xs text-gray-400 font-mono">{l.licenseNumber}</td>
                      <td className="py-2.5 pr-3 text-xs text-gray-400 tabular-nums">{l.expiresAt}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-1.5 flex-wrap">
                          {l.status === 'expired' && (
                            <>
                              <button
                                onClick={() => showToast(`Renewal initiated for ${l.jurisdiction} ${l.licenseType}`)}
                                className="text-xs font-bold px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                              >
                                Initiate Renewal
                              </button>
                              <button
                                onClick={() => showToast(`Contacting ${l.jurisdiction} regulator...`)}
                                className="text-xs font-semibold px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                              >
                                Contact Regulator
                              </button>
                            </>
                          )}
                          {l.status === 'pending' && (
                            <button
                              onClick={() => showToast(`Tracking application for ${l.jurisdiction} ${l.licenseType}`)}
                              className="text-xs font-semibold px-2.5 py-1 rounded bg-yellow-700 hover:bg-yellow-600 text-yellow-100 transition-colors"
                            >
                              Track Application
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── License Renewal Calendar ─────────────────────────── */}
      {renewalCalendar.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
            License Renewal Calendar
            <span className="ml-2 text-xs text-gray-500 normal-case font-normal">Expiring within 120 days</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-4">State</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-4">License Type</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-4">Expiry Date</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide pr-4">Days Remaining</th>
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody>
                {renewalCalendar.map((l, i) => {
                  const days = daysBetween(l.expiresAt, now);
                  const isExpired = days <= 0;
                  return (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="py-2.5 pr-4">
                        <span className="text-xs font-bold bg-gray-800 text-gray-200 border border-gray-700 px-2 py-0.5 rounded">
                          {l.jurisdiction}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-300">{l.licenseType}</td>
                      <td className="py-2.5 pr-4 text-xs text-gray-400 tabular-nums">{formatDate(l.expiresAt)}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`text-xs font-bold tabular-nums ${isExpired ? 'text-red-400' : days <= 30 ? 'text-orange-400' : 'text-yellow-400'}`}>
                          {isExpired ? `${Math.abs(days)} days overdue` : `${days} days`}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {isExpired ? (
                          <button
                            onClick={() => showToast(`Urgent renewal initiated for ${l.jurisdiction} ${l.licenseType}`)}
                            className="text-xs font-bold px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                          >
                            Renew Now
                          </button>
                        ) : (
                          <button
                            onClick={() => showToast(`Renewal planned for ${l.jurisdiction} ${l.licenseType}`)}
                            className="text-xs font-semibold px-3 py-1 rounded bg-yellow-700 hover:bg-yellow-600 text-yellow-100 transition-colors"
                          >
                            Plan Renewal
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
