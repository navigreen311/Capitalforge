'use client';

// ============================================================
// /regulatory — Regulatory Intelligence
// Alerts table (FTC/CFPB/Visa/state AG), impact score,
// affected modules, status. Funds-flow classification panel.
// Licensing status summary. AML readiness gauge.
// ============================================================

import { useState } from 'react';

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
  { jurisdiction: 'TX', licenseType: 'Credit Access Business',             licenseNumber: 'CAB-TX-8821',    status: 'pending', expiresAt: '—'          },
  { jurisdiction: 'FL', licenseType: 'Consumer Finance Company',           licenseNumber: 'CFC-FL-1103',    status: 'active',  expiresAt: '2026-09-30' },
  { jurisdiction: 'IL', licenseType: 'Retail Installment Sales Act',       licenseNumber: 'RISA-IL-0772',   status: 'expired', expiresAt: '2025-12-31' },
  { jurisdiction: 'WA', licenseType: 'Commercial Lending Exemption',       licenseNumber: 'N/A',            status: 'exempt',  expiresAt: '—'          },
];

// AML readiness pillars: score 0–100 each
const AML_PILLARS = [
  { label: 'Customer Due Diligence',  score: 91 },
  { label: 'Transaction Monitoring',  score: 78 },
  { label: 'SAR Filing Readiness',    score: 84 },
  { label: 'Sanctions Screening',     score: 96 },
  { label: 'Record Retention',        score: 70 },
  { label: 'Training & Awareness',    score: 63 },
];

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
  const [alerts] = useState<RegulatoryAlert[]>(PLACEHOLDER_ALERTS);
  const [flows] = useState<FundsFlowItem[]>(PLACEHOLDER_FLOWS);
  const [licenses] = useState<LicenseRecord[]>(PLACEHOLDER_LICENSES);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');

  const newCount     = alerts.filter((a) => a.status === 'new').length;
  const criticalCount= alerts.filter((a) => a.impactLevel === 'critical').length;
  const flaggedFlows = flows.filter((f) => f.flagged).length;
  const expiredLicenses = licenses.filter((l) => l.status === 'expired').length;
  const amlScore     = amlOverall(AML_PILLARS);

  const visibleAlerts = statusFilter === 'all' ? alerts : alerts.filter((a) => a.status === statusFilter);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Regulatory Intelligence</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {alerts.length} alerts · {newCount} new
            {criticalCount > 0 && (
              <span className="ml-2 text-red-400 font-semibold">⚠ {criticalCount} critical</span>
            )}
          </p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-sm font-semibold text-black transition-colors">
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

        {/* ── Alerts table ──────────────────────────────── */}
        <div className="xl:col-span-2 rounded-xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              Regulatory Alerts
            </h2>
            {/* Status filter pills */}
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
                {visibleAlerts.map((alert) => {
                  const isExpanded = expandedAlert === alert.id;
                  return (
                    <>
                      <tr
                        key={alert.id}
                        className="border-b border-gray-800/50 cursor-pointer hover:bg-gray-800/40 transition-colors"
                        onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}
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
                      {isExpanded && (
                        <tr key={`${alert.id}-expanded`} className="bg-gray-900/80">
                          <td colSpan={5} className="px-4 pb-3 pt-2">
                            <p className="text-xs text-gray-300 leading-relaxed border-l-2 border-yellow-600 pl-3">
                              {alert.summary}
                            </p>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── AML Readiness Gauge ────────────────────────── */}
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
              return (
                <div key={p.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{p.label}</span>
                    <span className="font-semibold tabular-nums" style={{ color }}>{p.score}</span>
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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── Funds-Flow Classification ──────────────────── */}
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
                        <span className="text-xs font-bold text-orange-400">&#x26A0; Review</span>
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

        {/* ── Licensing Status Summary ───────────────────── */}
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
                  <th className="pb-2 text-left text-xs text-gray-400 font-semibold uppercase tracking-wide">Status</th>
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
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${cfg.cls}`}>
                            {cfg.label}
                          </span>
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
    </div>
  );
}
