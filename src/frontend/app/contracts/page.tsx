'use client';

// ============================================================
// /contracts — Contract Intelligence
// Analyzed contracts table with risk score gauge, red flag count badge,
// missing protections count. Upload contract for analysis button.
// Contract comparison lab (side-by-side clause matrix).
// Red-flag detail expandable panel with FTC pattern citations.
// ============================================================

import { useState, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface RedFlag {
  id: string;
  clause: string;
  description: string;
  ftcPattern: string;
  excerpt: string;
  severity: RiskLevel;
}

interface MissingProtection {
  label: string;
  description: string;
}

interface AnalyzedContract {
  id: string;
  fileName: string;
  businessName: string;
  contractType: string;
  uploadedAt: string;
  riskScore: number;           // 0–100 (higher = more risk)
  redFlags: RedFlag[];
  missingProtections: MissingProtection[];
  status: 'analyzed' | 'analyzing' | 'pending';
}

interface ClauseRow {
  clauseType: string;
  contractA: string | null;
  contractB: string | null;
  risk: RiskLevel | null;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_CONTRACTS: AnalyzedContract[] = [
  {
    id: 'ctr_001',
    fileName: 'apex_mca_agreement_2026.pdf',
    businessName: 'Apex Ventures LLC',
    contractType: 'MCA Agreement',
    uploadedAt: '2026-03-28T09:00:00Z',
    riskScore: 72,
    redFlags: [
      {
        id: 'rf_001',
        clause: 'Section 4.2 – Confession of Judgment',
        description: 'Authorizes unilateral entry of judgment without court proceeding.',
        ftcPattern: 'FTC Business Guidance: Confession of Judgment Clauses (2019) — Identified as predatory in commercial lending context.',
        excerpt: '"Merchant hereby irrevocably authorizes and empowers any attorney designated by Purchaser to appear in any court of competent jurisdiction and confess a judgment against Merchant..."',
        severity: 'critical',
      },
      {
        id: 'rf_002',
        clause: 'Section 7.1 – Stacking Restriction',
        description: 'Prohibits additional financing without written consent; no time limit specified.',
        ftcPattern: 'FTC Pattern: Exclusivity terms without sunset clauses restrict small business market access (FTC Report 2022).',
        excerpt: '"Merchant shall not obtain any additional merchant cash advances, loans, or financing from any other source without prior written approval of Purchaser."',
        severity: 'high',
      },
      {
        id: 'rf_003',
        clause: 'Section 12.4 – Unilateral Amendment',
        description: 'Funder may amend agreement terms with 3-day notice, no merchant consent required.',
        ftcPattern: 'UDAP concern: Deceptive because material contract terms can change post-execution (FTC Act Section 5).',
        excerpt: '"Purchaser reserves the right to modify any term of this Agreement upon 3 business days written notice to Merchant."',
        severity: 'high',
      },
    ],
    missingProtections: [
      { label: 'APR Equivalent Disclosure', description: 'No annualized cost of capital stated; required under CA SB 1235.' },
      { label: 'Default Cure Period', description: 'No right-to-cure window before acceleration of full balance.' },
      { label: 'Payoff Calculation Formula', description: 'Method for calculating early payoff amount is undefined.' },
    ],
    status: 'analyzed',
  },
  {
    id: 'ctr_002',
    fileName: 'novatech_revenue_share_2026.pdf',
    businessName: 'NovaTech Solutions Inc.',
    contractType: 'Revenue Share Agreement',
    uploadedAt: '2026-03-25T14:00:00Z',
    riskScore: 38,
    redFlags: [
      {
        id: 'rf_004',
        clause: 'Section 3.1 – Minimum Daily Remittance',
        description: 'Fixed minimum daily remittance regardless of actual revenue collected.',
        ftcPattern: 'FTC Guidance: Fixed remittances may recharacterize revenue share as a loan (FTC Staff Opinion 2021).',
        excerpt: '"Notwithstanding actual daily receipts, Merchant shall remit a minimum of $1,200 per business day."',
        severity: 'medium',
      },
    ],
    missingProtections: [
      { label: 'Reconciliation Process', description: 'No process defined for adjusting remittances during low-revenue periods.' },
    ],
    status: 'analyzed',
  },
  {
    id: 'ctr_003',
    fileName: 'horizon_term_loan_2026.pdf',
    businessName: 'Horizon Retail Partners',
    contractType: 'Term Loan',
    uploadedAt: '2026-03-22T11:00:00Z',
    riskScore: 18,
    redFlags: [],
    missingProtections: [
      { label: 'Prepayment Penalty Disclosure', description: 'Prepayment terms referenced but penalty calculation formula absent.' },
    ],
    status: 'analyzed',
  },
  {
    id: 'ctr_004',
    fileName: 'summit_loc_agreement_draft.pdf',
    businessName: 'Summit Capital Group',
    contractType: 'Line of Credit',
    uploadedAt: '2026-03-30T16:30:00Z',
    riskScore: 0,
    redFlags: [],
    missingProtections: [],
    status: 'analyzing',
  },
];

const CLAUSE_MATRIX: ClauseRow[] = [
  { clauseType: 'Confession of Judgment',   contractA: 'Present – irrevocable',      contractB: 'Absent',                           risk: 'critical' },
  { clauseType: 'APR Equivalent Disclosure', contractA: 'Absent',                     contractB: '42.8% APR disclosed',              risk: 'high' },
  { clauseType: 'Stacking Restriction',      contractA: 'Full restriction, no sunset', contractB: '90-day restriction with consent',  risk: 'high' },
  { clauseType: 'Default Cure Period',       contractA: 'No cure period',              contractB: '10-day cure window',               risk: 'medium' },
  { clauseType: 'Governing Law',             contractA: 'Delaware (favorable to funder)', contractB: 'Merchant home state',          risk: 'medium' },
  { clauseType: 'Reconciliation Process',    contractA: 'Absent',                     contractB: 'Monthly reconciliation defined',   risk: 'medium' },
  { clauseType: 'Arbitration Clause',        contractA: 'Class waiver included',      contractB: 'Class waiver included',            risk: 'low' },
  { clauseType: 'Prepayment Penalty',        contractA: '5% flat fee',                contractB: 'No prepayment penalty',            risk: 'low' },
  { clauseType: 'Personal Guarantee',        contractA: 'Unlimited, joint & several', contractB: 'Limited to funded amount',         risk: 'high' },
  { clauseType: 'Unilateral Amendment',      contractA: '3-day notice, no consent',   contractB: 'Mutual written consent required',  risk: 'critical' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_CONFIG: Record<RiskLevel, { label: string; badgeClass: string; dotClass: string; bgClass: string; borderClass: string }> = {
  low:      { label: 'Low',      badgeClass: 'bg-green-900 text-green-300 border-green-700',   dotClass: 'bg-green-400',  bgClass: 'bg-green-950',  borderClass: 'border-green-800' },
  medium:   { label: 'Medium',   badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700', dotClass: 'bg-yellow-400', bgClass: 'bg-yellow-950', borderClass: 'border-yellow-800' },
  high:     { label: 'High',     badgeClass: 'bg-orange-900 text-orange-300 border-orange-700', dotClass: 'bg-orange-400', bgClass: 'bg-orange-950', borderClass: 'border-orange-800' },
  critical: { label: 'Critical', badgeClass: 'bg-red-900 text-red-300 border-red-700',          dotClass: 'bg-red-400',    bgClass: 'bg-red-950',    borderClass: 'border-red-800' },
};

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function scoreColor(score: number): string {
  if (score >= 70) return '#ef4444';
  if (score >= 40) return '#f97316';
  if (score >= 20) return '#eab308';
  return '#22c55e';
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'High Risk';
  if (score >= 40) return 'Elevated';
  if (score >= 20) return 'Moderate';
  return 'Low Risk';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RiskScoreGauge({ score }: { score: number }) {
  const size = 88;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);
  const cx = size / 2;
  const cy = size / 2;
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} aria-label={`Risk score ${score}`}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1f2937" strokeWidth={8} />
        <circle
          cx={cx} cy={cy} r={radius} fill="none"
          stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x={cx} y={cy + 1} textAnchor="middle" fontSize={16} fontWeight="900" fill={color}>{score}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={8} fill="#6b7280">/100</text>
      </svg>
      <p className="text-2xs font-semibold mt-0.5" style={{ color }}>{scoreLabel(score)}</p>
    </div>
  );
}

function RedFlagPanel({ flags, expanded, onToggle }: {
  flags: RedFlag[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (flags.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        View {flags.length} Red Flag{flags.length !== 1 ? 's' : ''}
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {flags.map((flag) => (
            <div key={flag.id} className={`rounded-lg border p-3 ${RISK_CONFIG[flag.severity].bgClass} ${RISK_CONFIG[flag.severity].borderClass}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-xs font-bold text-gray-200">{flag.clause}</p>
                <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${RISK_CONFIG[flag.severity].badgeClass}`}>
                  {RISK_CONFIG[flag.severity].label}
                </span>
              </div>
              <p className="text-xs text-gray-300 mb-2">{flag.description}</p>
              <blockquote className="text-2xs text-gray-400 border-l-2 border-gray-600 pl-2 italic mb-2 leading-relaxed">
                {flag.excerpt}
              </blockquote>
              <div className="flex items-start gap-1.5">
                <span className="text-2xs font-bold text-orange-400 shrink-0 mt-0.5">FTC:</span>
                <p className="text-2xs text-orange-300 leading-relaxed">{flag.ftcPattern}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ContractsPage() {
  const [contracts] = useState<AnalyzedContract[]>(PLACEHOLDER_CONTRACTS);
  const [activeTab, setActiveTab] = useState<'table' | 'comparison'>('table');
  const [expandedFlags, setExpandedFlags] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [compareA, setCompareA] = useState<string>(PLACEHOLDER_CONTRACTS[0].id);
  const [compareB, setCompareB] = useState<string>(PLACEHOLDER_CONTRACTS[1].id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleFlags = (id: string) =>
    setExpandedFlags((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Simulated upload — real impl would POST to /api/contracts/analyze
      await new Promise((r) => setTimeout(r, 1200));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const analyzedContracts = contracts.filter((c) => c.status === 'analyzed');
  const totalRedFlags = analyzedContracts.reduce((n, c) => n + c.redFlags.length, 0);
  const totalMissing = analyzedContracts.reduce((n, c) => n + c.missingProtections.length, 0);
  const criticalFlagCount = analyzedContracts.reduce(
    (n, c) => n + c.redFlags.filter((f) => f.severity === 'critical').length, 0
  );

  const contractA = contracts.find((c) => c.id === compareA);
  const contractB = contracts.find((c) => c.id === compareB);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Contract Intelligence</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {analyzedContracts.length} analyzed &middot;{' '}
            <span className="text-red-400 font-semibold">{totalRedFlags} red flags</span>
            {criticalFlagCount > 0 && (
              <span className="ml-2 text-red-500 font-bold">({criticalFlagCount} critical)</span>
            )}
            {' '}&middot; {totalMissing} missing protections
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc"
            onChange={handleUpload}
            className="hidden"
            id="contract-upload"
          />
          <label
            htmlFor="contract-upload"
            className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors border ${
              uploading
                ? 'bg-gray-800 border-gray-700 text-gray-500'
                : 'bg-brand-gold text-brand-navy border-brand-gold hover:bg-yellow-400'
            }`}
            style={uploading ? {} : { backgroundColor: '#C9A84C', color: '#0A1628', borderColor: '#C9A84C' }}
          >
            {uploading ? 'Analyzing…' : '+ Upload Contract for Analysis'}
          </label>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Contracts Analyzed', value: analyzedContracts.length, color: 'text-gray-100' },
          { label: 'Total Red Flags', value: totalRedFlags, color: totalRedFlags > 0 ? 'text-red-400' : 'text-gray-400' },
          { label: 'Critical Flags', value: criticalFlagCount, color: criticalFlagCount > 0 ? 'text-red-500' : 'text-gray-400' },
          { label: 'Missing Protections', value: totalMissing, color: 'text-orange-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-2xs text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
            <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {(['table', 'comparison'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-yellow-500 text-yellow-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab === 'table' ? 'Analyzed Contracts' : 'Comparison Lab'}
          </button>
        ))}
      </div>

      {/* Tab: Analyzed Contracts */}
      {activeTab === 'table' && (
        <div className="space-y-4">
          {contracts.map((contract) => (
            <div
              key={contract.id}
              className="rounded-xl border border-gray-800 bg-gray-900 p-5"
            >
              {/* Contract header row */}
              <div className="flex items-start gap-4">
                {/* Gauge */}
                <div className="shrink-0">
                  {contract.status === 'analyzed' ? (
                    <RiskScoreGauge score={contract.riskScore} />
                  ) : (
                    <div className="w-[88px] h-[88px] rounded-full border-4 border-gray-700 flex items-center justify-center">
                      <span className="text-gray-500 text-xs text-center leading-tight">Ana-<br />lyzing</span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="font-bold text-gray-100 text-sm">{contract.fileName}</p>
                      <p className="text-xs text-gray-400">{contract.businessName} &middot; {contract.contractType}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Red flag count badge */}
                      {contract.status === 'analyzed' && (
                        <>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                            contract.redFlags.length > 0
                              ? 'bg-red-900 text-red-300 border-red-700'
                              : 'bg-gray-800 text-gray-500 border-gray-700'
                          }`}>
                            {contract.redFlags.length} flag{contract.redFlags.length !== 1 ? 's' : ''}
                          </span>
                          {/* Missing protections badge */}
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                            contract.missingProtections.length > 0
                              ? 'bg-orange-900 text-orange-300 border-orange-700'
                              : 'bg-gray-800 text-gray-500 border-gray-700'
                          }`}>
                            {contract.missingProtections.length} missing
                          </span>
                        </>
                      )}
                      {contract.status === 'analyzing' && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-blue-900 text-blue-300 border-blue-700 animate-pulse">
                          Analyzing...
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-2xs text-gray-500">Uploaded {formatDate(contract.uploadedAt)}</p>

                  {/* Missing protections */}
                  {contract.status === 'analyzed' && contract.missingProtections.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {contract.missingProtections.map((mp, i) => (
                        <span
                          key={i}
                          title={mp.description}
                          className="text-2xs bg-orange-950 text-orange-400 border border-orange-800 px-2 py-0.5 rounded cursor-help"
                        >
                          Missing: {mp.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Red flag expandable panel */}
                  {contract.status === 'analyzed' && (
                    <RedFlagPanel
                      flags={contract.redFlags}
                      expanded={!!expandedFlags[contract.id]}
                      onToggle={() => toggleFlags(contract.id)}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Comparison Lab */}
      {activeTab === 'comparison' && (
        <div>
          {/* Contract selectors */}
          <div className="flex flex-wrap gap-4 mb-5 p-4 rounded-xl border border-gray-800 bg-gray-900">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-2xs text-gray-400 uppercase tracking-wide mb-1 font-semibold">Contract A</label>
              <select
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
              >
                {contracts.filter((c) => c.status === 'analyzed').map((c) => (
                  <option key={c.id} value={c.id}>{c.fileName}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-2xs text-gray-400 uppercase tracking-wide mb-1 font-semibold">Contract B</label>
              <select
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
              >
                {contracts.filter((c) => c.status === 'analyzed').map((c) => (
                  <option key={c.id} value={c.id}>{c.fileName}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Contract name headers */}
          {contractA && contractB && (
            <div className="rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-900">
                    <th className="text-left px-4 py-3 text-gray-400 font-semibold uppercase tracking-wide w-[200px]">
                      Clause Type
                    </th>
                    <th className="px-4 py-3 text-center font-semibold uppercase tracking-wide text-yellow-400">
                      {contractA.fileName}
                    </th>
                    <th className="px-4 py-3 text-center font-semibold uppercase tracking-wide text-blue-400">
                      {contractB.fileName}
                    </th>
                    <th className="px-4 py-3 text-center text-gray-400 font-semibold uppercase tracking-wide w-[90px]">
                      Risk
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {CLAUSE_MATRIX.map((row, i) => (
                    <tr key={i} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                      <td className="px-4 py-3 text-gray-300 font-semibold">{row.clauseType}</td>
                      <td className={`px-4 py-3 text-center ${
                        row.contractA
                          ? row.risk === 'critical' || row.risk === 'high' ? 'text-red-300' : 'text-gray-300'
                          : 'text-gray-600'
                      }`}>
                        {row.contractA ?? '—'}
                      </td>
                      <td className={`px-4 py-3 text-center ${
                        row.contractB
                          ? 'text-green-300'
                          : 'text-gray-600'
                      }`}>
                        {row.contractB ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.risk && (
                          <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${RISK_CONFIG[row.risk].badgeClass}`}>
                            {RISK_CONFIG[row.risk].label}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
