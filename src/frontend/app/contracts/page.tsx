'use client';

// ============================================================
// /contracts — Contract Intelligence
// Analyzed contracts table with risk score gauge, red flag count badge,
// missing protections count. Upload contract for analysis button/modal.
// Contract comparison lab (side-by-side clause matrix).
// Red-flag detail slide-over panel with FTC pattern citations.
// Full contract analysis view. Critical action banners.
// ============================================================

import { useState, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type Importance = 'required' | 'recommended';

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
  importance: Importance;
  suggestedLanguage: string;
}

interface AnalyzedContract {
  id: string;
  fileName: string;
  businessName: string;
  contractType: string;
  uploadedAt: string;
  riskScore: number;
  redFlags: RedFlag[];
  missingProtections: MissingProtection[];
  status: 'analyzed' | 'analyzing' | 'pending';
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const CLIENTS = [
  { id: 'all', name: 'All Clients' },
  { id: 'apex', name: 'Apex Ventures LLC' },
  { id: 'nova', name: 'NovaTech Solutions Inc.' },
  { id: 'horizon', name: 'Horizon Retail Partners' },
  { id: 'summit', name: 'Summit Capital Group' },
];

const CONTRACT_TYPES = [
  'MCA Agreement',
  'Revenue Share',
  'Line of Credit',
  'Term Loan',
  'Advisor Agreement',
  'Other',
];

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
        clause: 'Section 4.2 — Confession of Judgment',
        description: 'Authorizes unilateral entry of judgment without court proceeding.',
        ftcPattern: 'FTC Business Guidance: Confession of Judgment Clauses (2019) — Identified as predatory in commercial lending context.',
        excerpt: '"Merchant hereby irrevocably authorizes and empowers any attorney designated by Purchaser to appear in any court of competent jurisdiction and confess a judgment against Merchant..."',
        severity: 'critical',
      },
      {
        id: 'rf_002',
        clause: 'Section 7.1 — Stacking Restriction',
        description: 'Prohibits additional financing without written consent; no time limit specified.',
        ftcPattern: 'FTC Pattern: Exclusivity terms without sunset clauses restrict small business market access (FTC Report 2022).',
        excerpt: '"Merchant shall not obtain any additional merchant cash advances, loans, or financing from any other source without prior written approval of Purchaser."',
        severity: 'high',
      },
      {
        id: 'rf_003',
        clause: 'Section 12.4 — Unilateral Amendment',
        description: 'Funder may amend agreement terms with 3-day notice, no merchant consent required.',
        ftcPattern: 'UDAP concern: Deceptive because material contract terms can change post-execution (FTC Act Section 5).',
        excerpt: '"Purchaser reserves the right to modify any term of this Agreement upon 3 business days written notice to Merchant."',
        severity: 'high',
      },
    ],
    missingProtections: [
      { label: 'APR Equivalent Disclosure', description: 'No annualized cost of capital stated; required under CA SB 1235.', importance: 'required', suggestedLanguage: 'The total annualized cost of this financing, expressed as an Annual Percentage Rate (APR), is [X]%. This calculation includes all fees, charges, and amounts to be paid by Merchant over the expected term of this agreement.' },
      { label: 'Default Cure Period', description: 'No right-to-cure window before acceleration of full balance.', importance: 'required', suggestedLanguage: 'In the event of a default, Purchaser shall provide Merchant with written notice specifying the nature of the default and a cure period of no less than ten (10) business days before exercising any acceleration or collection remedies.' },
      { label: 'Payoff Calculation Formula', description: 'Method for calculating early payoff amount is undefined.', importance: 'recommended', suggestedLanguage: 'The early payoff amount shall be calculated as the remaining purchased amount less a pro-rata reduction of the purchase premium based on the percentage of the total purchased amount already remitted.' },
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
        clause: 'Section 3.1 — Minimum Daily Remittance',
        description: 'Fixed minimum daily remittance regardless of actual revenue collected.',
        ftcPattern: 'FTC Guidance: Fixed remittances may recharacterize revenue share as a loan (FTC Staff Opinion 2021).',
        excerpt: '"Notwithstanding actual daily receipts, Merchant shall remit a minimum of $1,200 per business day."',
        severity: 'medium',
      },
    ],
    missingProtections: [
      { label: 'Reconciliation Process', description: 'No process defined for adjusting remittances during low-revenue periods.', importance: 'recommended', suggestedLanguage: 'On a monthly basis, Purchaser and Merchant shall reconcile actual receipts against remittances made. Any overpayment shall be credited to future remittances or refunded within five (5) business days of reconciliation.' },
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
      { label: 'Prepayment Penalty Disclosure', description: 'Prepayment terms referenced but penalty calculation formula absent.', importance: 'recommended', suggestedLanguage: 'Any prepayment penalty shall be clearly stated as a percentage of the outstanding principal balance and shall not exceed [X]% of the remaining principal at the time of prepayment.' },
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

// Standard protections for Comparison Lab
const STANDARD_PROTECTIONS = [
  'APR Disclosure',
  'Personal Guarantee Cap',
  'Prepayment Penalty',
  'Cooling-Off Period',
  'Fee Transparency',
  'Dispute Resolution',
  'Data Privacy',
  'Termination Rights',
];

// Map contract data to protection presence
function getProtectionStatus(contract: AnalyzedContract): Record<string, boolean> {
  const missing = new Set(contract.missingProtections.map((mp) => mp.label.toLowerCase()));
  const redFlagClauses = contract.redFlags.map((rf) => rf.clause.toLowerCase()).join(' ');

  return {
    'APR Disclosure': !missing.has('apr equivalent disclosure') && !redFlagClauses.includes('apr'),
    'Personal Guarantee Cap': !redFlagClauses.includes('personal guarantee') && !redFlagClauses.includes('confession of judgment'),
    'Prepayment Penalty': !missing.has('prepayment penalty disclosure') && !redFlagClauses.includes('prepayment'),
    'Cooling-Off Period': contract.riskScore < 40,
    'Fee Transparency': contract.riskScore < 50,
    'Dispute Resolution': !redFlagClauses.includes('arbitration') || contract.riskScore < 30,
    'Data Privacy': contract.riskScore < 60,
    'Termination Rights': !missing.has('default cure period') && !redFlagClauses.includes('unilateral'),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_CONFIG: Record<RiskLevel, { label: string; badgeClass: string; dotClass: string; bgClass: string; borderClass: string }> = {
  low:      { label: 'Low',      badgeClass: 'bg-green-900 text-green-300 border-green-700',   dotClass: 'bg-green-400',  bgClass: 'bg-green-950',  borderClass: 'border-green-800' },
  medium:   { label: 'Medium',   badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700', dotClass: 'bg-yellow-400', bgClass: 'bg-yellow-950', borderClass: 'border-yellow-800' },
  high:     { label: 'High',     badgeClass: 'bg-orange-900 text-orange-300 border-orange-700', dotClass: 'bg-orange-400', bgClass: 'bg-orange-950', borderClass: 'border-orange-800' },
  critical: { label: 'Critical', badgeClass: 'bg-red-900 text-red-300 border-red-700',          dotClass: 'bg-red-400',    bgClass: 'bg-red-950',    borderClass: 'border-red-800' },
};

const IMPORTANCE_CONFIG: Record<Importance, { label: string; badgeClass: string }> = {
  required:    { label: 'Required',    badgeClass: 'bg-red-900 text-red-300 border-red-700' },
  recommended: { label: 'Recommended', badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
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

function showToast(message: string) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1f2937;color:#e5e7eb;border:1px solid #374151;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.4);transition:opacity 0.3s;';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RiskScoreGauge({ score, size = 88 }: { score: number; size?: number }) {
  const radius = size * 0.364;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);
  const cx = size / 2;
  const cy = size / 2;
  const color = scoreColor(score);
  const strokeW = size * 0.09;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} aria-label={`Risk score ${score}`}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1f2937" strokeWidth={strokeW} />
        <circle
          cx={cx} cy={cy} r={radius} fill="none"
          stroke={color} strokeWidth={strokeW} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x={cx} y={cy + 1} textAnchor="middle" fontSize={size * 0.18} fontWeight="900" fill={color}>{score}</text>
        <text x={cx} y={cy + size * 0.16} textAnchor="middle" fontSize={size * 0.09} fill="#6b7280">/100</text>
      </svg>
      <p className="text-2xs font-semibold mt-0.5" style={{ color }}>{scoreLabel(score)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload Modal
// ---------------------------------------------------------------------------

function UploadModal({ open, onClose, onUpload }: {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File, client: string, contractType: string) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [client, setClient] = useState(CLIENTS[1].name);
  const [contractType, setContractType] = useState(CONTRACT_TYPES[0]);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleSubmit = () => {
    if (!selectedFile) return;
    onUpload(selectedFile, client, contractType);
    setSelectedFile(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg mx-4 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Upload Contract for Analysis</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 ${
            dragActive ? 'border-yellow-500 bg-yellow-950/30' : 'border-gray-700 bg-gray-800 hover:border-gray-500'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]); }}
          />
          {selectedFile ? (
            <div>
              <p className="text-sm text-yellow-400 font-semibold">{selectedFile.name}</p>
              <p className="text-xs text-gray-400 mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-400 text-sm mb-1">Drop contract file here or click to browse</p>
              <p className="text-gray-500 text-xs">Supports PDF, DOCX, DOC</p>
            </div>
          )}
        </div>

        {/* Client selector */}
        <div className="mb-3">
          <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1 font-semibold">Client</label>
          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
          >
            {CLIENTS.filter((c) => c.id !== 'all').map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Contract type */}
        <div className="mb-5">
          <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1 font-semibold">Contract Type</label>
          <select
            value={contractType}
            onChange={(e) => setContractType(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
          >
            {CONTRACT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!selectedFile}
          className={`w-full py-2.5 rounded-lg text-sm font-bold transition-colors ${
            selectedFile
              ? 'text-gray-900 hover:brightness-110'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
          style={selectedFile ? { backgroundColor: '#C9A84C', color: '#0A1628' } : {}}
        >
          Upload &amp; Analyze
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Red Flags Slide-over Panel
// ---------------------------------------------------------------------------

function RedFlagsSlideOver({ contract, open, onClose }: {
  contract: AnalyzedContract | null;
  open: boolean;
  onClose: () => void;
}) {
  const [expandedSuggestions, setExpandedSuggestions] = useState<Record<string, boolean>>({});

  if (!open || !contract) return null;

  const toggleSuggestion = (label: string) =>
    setExpandedSuggestions((prev) => ({ ...prev, [label]: !prev[label] }));

  const copySuggested = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Suggested language copied to clipboard');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />
      {/* Panel */}
      <div
        className="relative w-[480px] max-w-full h-full bg-gray-900 border-l border-gray-700 overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-5 py-4 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Red Flags &amp; Missing Protections</h2>
              <p className="text-xs text-gray-400 mt-0.5">{contract.fileName}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Red Flags */}
          {contract.redFlags.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-red-400 mb-3">Red Flags ({contract.redFlags.length})</h3>
              <div className="space-y-3">
                {contract.redFlags.map((flag) => (
                  <div key={flag.id} className={`rounded-lg border p-4 ${RISK_CONFIG[flag.severity].bgClass} ${RISK_CONFIG[flag.severity].borderClass}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${RISK_CONFIG[flag.severity].badgeClass}`}>
                        {RISK_CONFIG[flag.severity].label}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-gray-200 mb-1">{flag.clause}</p>
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
            </div>
          )}

          {/* Missing Protections */}
          {contract.missingProtections.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-orange-400 mb-3">Missing Protections ({contract.missingProtections.length})</h3>
              <div className="space-y-3">
                {contract.missingProtections.map((mp) => (
                  <div key={mp.label} className="rounded-lg border border-orange-800 bg-orange-950 p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-xs font-bold text-gray-200">{mp.label}</p>
                      <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${IMPORTANCE_CONFIG[mp.importance].badgeClass}`}>
                        {IMPORTANCE_CONFIG[mp.importance].label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 mb-2">{mp.description}</p>
                    <button
                      onClick={() => toggleSuggestion(mp.label)}
                      className="text-2xs text-yellow-400 hover:text-yellow-300 font-semibold flex items-center gap-1"
                    >
                      <span className={`transition-transform inline-block ${expandedSuggestions[mp.label] ? 'rotate-90' : ''}`}>&#9654;</span>
                      Suggested Language
                    </button>
                    {expandedSuggestions[mp.label] && (
                      <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg p-3">
                        <p className="text-2xs text-gray-300 leading-relaxed mb-2">{mp.suggestedLanguage}</p>
                        <button
                          onClick={() => copySuggested(mp.suggestedLanguage)}
                          className="text-2xs font-semibold px-2.5 py-1 rounded border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full Contract Analysis View
// ---------------------------------------------------------------------------

function ContractAnalysisView({ contract, onClose }: {
  contract: AnalyzedContract;
  onClose: () => void;
}) {
  const [expandedSuggestions, setExpandedSuggestions] = useState<Record<string, boolean>>({});

  const toggleSuggestion = (label: string) =>
    setExpandedSuggestions((prev) => ({ ...prev, [label]: !prev[label] }));

  const copySuggested = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Suggested language copied to clipboard');
  };

  const hasCritical = contract.redFlags.some((f) => f.severity === 'critical');

  // Risk factor breakdown
  const factors = [
    { name: 'Predatory Clauses', score: contract.redFlags.filter((f) => f.severity === 'critical').length > 0 ? 85 : 20 },
    { name: 'Missing Disclosures', score: contract.missingProtections.length * 25 },
    { name: 'Unfair Terms', score: contract.redFlags.filter((f) => f.severity === 'high').length * 30 },
    { name: 'Transparency', score: 100 - contract.riskScore },
    { name: 'Regulatory Compliance', score: hasCritical ? 15 : 80 },
  ].map((f) => ({ ...f, score: Math.min(100, Math.max(0, f.score)) }));

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
            <span>&larr;</span> Back to Contracts
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => showToast('Revision request sent to counterparty')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-yellow-700 bg-yellow-900 text-yellow-300 hover:bg-yellow-800 transition-colors"
            >
              Request Revision
            </button>
            <button
              onClick={() => showToast('Analysis exported as PDF')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Export Analysis
            </button>
            <button
              onClick={() => showToast('Contract archived successfully')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Archive
            </button>
          </div>
        </div>

        {/* Critical action banner */}
        {hasCritical && (
          <div className="mb-6 p-4 rounded-xl border-2 border-red-700 bg-red-950 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm font-bold text-red-300">
              &#9888; Regulatory violation — action required
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => showToast('APR disclosure document generated')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-600 bg-red-900 text-red-200 hover:bg-red-800 transition-colors"
              >
                Generate APR Disclosure
              </button>
              <button
                onClick={() => showToast('Contract flagged for legal review')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-600 bg-red-900 text-red-200 hover:bg-red-800 transition-colors"
              >
                Flag for Legal Review
              </button>
            </div>
          </div>
        )}

        {/* Contract header */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 mb-6">
          <div className="flex items-start gap-6">
            <RiskScoreGauge score={contract.riskScore} size={120} />
            <div className="flex-1">
              <h1 className="text-xl font-bold text-white mb-1">{contract.fileName}</h1>
              <p className="text-sm text-gray-400 mb-3">{contract.businessName} &middot; {contract.contractType} &middot; Uploaded {formatDate(contract.uploadedAt)}</p>
              <div className="flex gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                  contract.redFlags.length > 0 ? 'bg-red-900 text-red-300 border-red-700' : 'bg-gray-800 text-gray-500 border-gray-700'
                }`}>{contract.redFlags.length} red flag{contract.redFlags.length !== 1 ? 's' : ''}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                  contract.missingProtections.length > 0 ? 'bg-orange-900 text-orange-300 border-orange-700' : 'bg-gray-800 text-gray-500 border-gray-700'
                }`}>{contract.missingProtections.length} missing protection{contract.missingProtections.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Factor breakdown */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 mb-6">
          <h3 className="text-sm font-bold text-white mb-4">Risk Factor Breakdown</h3>
          <div className="space-y-3">
            {factors.map((f) => (
              <div key={f.name} className="flex items-center gap-3">
                <p className="text-xs text-gray-300 w-[160px] shrink-0">{f.name}</p>
                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${f.score}%`, backgroundColor: scoreColor(f.score) }}
                  />
                </div>
                <p className="text-xs font-bold w-[36px] text-right" style={{ color: scoreColor(f.score) }}>{f.score}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Red Flags */}
        {contract.redFlags.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-red-400 mb-3">Red Flags ({contract.redFlags.length})</h3>
            <div className="space-y-3">
              {contract.redFlags.map((flag) => (
                <div key={flag.id} className={`rounded-xl border p-4 ${RISK_CONFIG[flag.severity].bgClass} ${RISK_CONFIG[flag.severity].borderClass}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
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
          </div>
        )}

        {/* Missing Protections */}
        {contract.missingProtections.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-orange-400 mb-3">Missing Protections ({contract.missingProtections.length})</h3>
            <div className="space-y-3">
              {contract.missingProtections.map((mp) => (
                <div key={mp.label} className="rounded-xl border border-orange-800 bg-orange-950 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs font-bold text-gray-200">{mp.label}</p>
                    <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${IMPORTANCE_CONFIG[mp.importance].badgeClass}`}>
                      {IMPORTANCE_CONFIG[mp.importance].label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 mb-2">{mp.description}</p>
                  <button
                    onClick={() => toggleSuggestion(mp.label)}
                    className="text-2xs text-yellow-400 hover:text-yellow-300 font-semibold flex items-center gap-1"
                  >
                    <span className={`transition-transform inline-block ${expandedSuggestions[mp.label] ? 'rotate-90' : ''}`}>&#9654;</span>
                    Suggested Language
                  </button>
                  {expandedSuggestions[mp.label] && (
                    <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg p-3">
                      <p className="text-2xs text-gray-300 leading-relaxed mb-2">{mp.suggestedLanguage}</p>
                      <button
                        onClick={() => copySuggested(mp.suggestedLanguage)}
                        className="text-2xs font-semibold px-2.5 py-1 rounded border border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ContractsPage() {
  const [contracts, setContracts] = useState<AnalyzedContract[]>(PLACEHOLDER_CONTRACTS);
  const [activeTab, setActiveTab] = useState<'table' | 'comparison'>('table');
  const [contractUploadOpen, setContractUploadOpen] = useState(false);
  const [redFlagsPanel, setRedFlagsPanel] = useState<AnalyzedContract | null>(null);
  const [selectedContract, setSelectedContract] = useState<AnalyzedContract | null>(null);
  const [selectedClient, setSelectedClient] = useState('all');
  const [compareA, setCompareA] = useState<string>(PLACEHOLDER_CONTRACTS[0].id);
  const [compareB, setCompareB] = useState<string>(PLACEHOLDER_CONTRACTS[1].id);
  const [comparisonActive, setComparisonActive] = useState(false);

  const handleUpload = useCallback((file: File, client: string, contractType: string) => {
    const newId = `ctr_${Date.now()}`;
    const newContract: AnalyzedContract = {
      id: newId,
      fileName: file.name,
      businessName: client,
      contractType,
      uploadedAt: new Date().toISOString(),
      riskScore: 0,
      redFlags: [],
      missingProtections: [],
      status: 'analyzing',
    };
    setContracts((prev) => [newContract, ...prev]);

    // Simulate analysis completing after 2s
    setTimeout(() => {
      setContracts((prev) =>
        prev.map((c) =>
          c.id === newId
            ? {
                ...c,
                status: 'analyzed' as const,
                riskScore: 55,
                redFlags: [
                  {
                    id: `rf_${Date.now()}_1`,
                    clause: 'Section 5.3 — Late Payment Penalties',
                    description: 'Excessive late payment penalties compounding daily without cap.',
                    ftcPattern: 'FTC Guidance: Uncapped penalty provisions may constitute unfair practice under FTC Act Section 5.',
                    excerpt: '"In the event of late payment, a penalty of 2% per day shall accrue on the outstanding balance without limit."',
                    severity: 'high' as RiskLevel,
                  },
                  {
                    id: `rf_${Date.now()}_2`,
                    clause: 'Section 9.1 — Venue Selection',
                    description: 'Mandatory venue in distant jurisdiction increases merchant litigation burden.',
                    ftcPattern: 'FTC Pattern: Distant forum clauses restrict access to justice for small businesses (FTC Report 2020).',
                    excerpt: '"All disputes shall be resolved exclusively in the courts of New York County, New York."',
                    severity: 'medium' as RiskLevel,
                  },
                ],
                missingProtections: [
                  { label: 'Fee Schedule Disclosure', description: 'No itemized fee schedule provided to merchant.', importance: 'required' as Importance, suggestedLanguage: 'A complete schedule of all fees, charges, and costs associated with this agreement shall be provided to Merchant as Exhibit A, including but not limited to origination fees, processing fees, late fees, and any other charges that may be assessed.' },
                  { label: 'Early Termination Terms', description: 'Conditions and costs for early termination not specified.', importance: 'recommended' as Importance, suggestedLanguage: 'Either party may terminate this agreement with thirty (30) days written notice. Early termination fees, if any, shall not exceed [X]% of the remaining balance and shall be clearly disclosed at the time of execution.' },
                ],
              }
            : c
        )
      );
    }, 2000);
  }, []);

  // Filter by client
  const filteredContracts = selectedClient === 'all'
    ? contracts
    : contracts.filter((c) => c.businessName === CLIENTS.find((cl) => cl.id === selectedClient)?.name);

  const analyzedContracts = filteredContracts.filter((c) => c.status === 'analyzed');
  const totalRedFlags = analyzedContracts.reduce((n, c) => n + c.redFlags.length, 0);
  const totalMissing = analyzedContracts.reduce((n, c) => n + c.missingProtections.length, 0);
  const criticalFlagCount = analyzedContracts.reduce(
    (n, c) => n + c.redFlags.filter((f) => f.severity === 'critical').length, 0
  );

  const analyzedAll = contracts.filter((c) => c.status === 'analyzed');
  const contractAData = analyzedAll.find((c) => c.id === compareA);
  const contractBData = analyzedAll.find((c) => c.id === compareB);

  // If showing full analysis view
  if (selectedContract) {
    return <ContractAnalysisView contract={selectedContract} onClose={() => setSelectedContract(null)} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Upload modal */}
      <UploadModal
        open={contractUploadOpen}
        onClose={() => setContractUploadOpen(false)}
        onUpload={handleUpload}
      />

      {/* Red flags slide-over */}
      <RedFlagsSlideOver
        contract={redFlagsPanel}
        open={redFlagsPanel !== null}
        onClose={() => setRedFlagsPanel(null)}
      />

      {/* Client selector */}
      <div className="mb-4">
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
        >
          {CLIENTS.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

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
        <button
          onClick={() => setContractUploadOpen(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors border"
          style={{ backgroundColor: '#C9A84C', color: '#0A1628', borderColor: '#C9A84C' }}
        >
          + Upload Contract for Analysis
        </button>
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
          {filteredContracts.map((contract) => {
            const hasCritical = contract.redFlags.some((f) => f.severity === 'critical');

            return (
              <div key={contract.id}>
                {/* Critical action banner */}
                {contract.status === 'analyzed' && hasCritical && (
                  <div className="mb-1 p-3 rounded-t-xl border-2 border-b-0 border-red-700 bg-red-950 flex items-center justify-between flex-wrap gap-2">
                    <p className="text-xs font-bold text-red-300">
                      &#9888; Regulatory violation — action required
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => showToast('APR disclosure document generated')}
                        className="px-2.5 py-1 rounded-lg text-2xs font-bold border border-red-600 bg-red-900 text-red-200 hover:bg-red-800 transition-colors"
                      >
                        Generate APR Disclosure
                      </button>
                      <button
                        onClick={() => showToast('Contract flagged for legal review')}
                        className="px-2.5 py-1 rounded-lg text-2xs font-bold border border-red-600 bg-red-900 text-red-200 hover:bg-red-800 transition-colors"
                      >
                        Flag for Legal Review
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className={`rounded-xl border border-gray-800 bg-gray-900 p-5 cursor-pointer hover:border-gray-600 transition-colors ${
                    hasCritical && contract.status === 'analyzed' ? 'rounded-t-none border-t-0' : ''
                  }`}
                  onClick={() => { if (contract.status === 'analyzed') setSelectedContract(contract); }}
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
                          {contract.status === 'analyzed' && (
                            <>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                                contract.redFlags.length > 0
                                  ? 'bg-red-900 text-red-300 border-red-700'
                                  : 'bg-gray-800 text-gray-500 border-gray-700'
                              }`}>
                                {contract.redFlags.length} flag{contract.redFlags.length !== 1 ? 's' : ''}
                              </span>
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

                      {/* View Red Flags link */}
                      {contract.status === 'analyzed' && contract.redFlags.length > 0 && (
                        <div className="mt-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); setRedFlagsPanel(contract); }}
                            className="flex items-center gap-2 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
                          >
                            <span>&#9654;</span>
                            View {contract.redFlags.length} Red Flag{contract.redFlags.length !== 1 ? 's' : ''}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Comparison Lab */}
      {activeTab === 'comparison' && (
        <div>
          {/* Contract selectors + Compare button */}
          <div className="flex flex-wrap gap-4 mb-5 p-4 rounded-xl border border-gray-800 bg-gray-900 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-2xs text-gray-400 uppercase tracking-wide mb-1 font-semibold">Contract A</label>
              <select
                value={compareA}
                onChange={(e) => { setCompareA(e.target.value); setComparisonActive(false); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
              >
                {analyzedAll.map((c) => (
                  <option key={c.id} value={c.id}>{c.fileName}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-2xs text-gray-400 uppercase tracking-wide mb-1 font-semibold">Contract B</label>
              <select
                value={compareB}
                onChange={(e) => { setCompareB(e.target.value); setComparisonActive(false); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
              >
                {analyzedAll.map((c) => (
                  <option key={c.id} value={c.id}>{c.fileName}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setComparisonActive(true)}
              disabled={compareA === compareB}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
                compareA === compareB
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                  : 'border border-transparent hover:brightness-110'
              }`}
              style={compareA !== compareB ? { backgroundColor: '#C9A84C', color: '#0A1628' } : {}}
            >
              Compare
            </button>
          </div>

          {/* Comparison table */}
          {comparisonActive && contractAData && contractBData && (
            <div>
              {/* Summary row */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-center gap-4">
                  <RiskScoreGauge score={contractAData.riskScore} size={72} />
                  <div>
                    <p className="text-sm font-bold text-yellow-400 truncate">{contractAData.fileName}</p>
                    <p className="text-xs text-gray-400">{contractAData.businessName}</p>
                    {(() => {
                      const statusA = getProtectionStatus(contractAData);
                      const presentA = STANDARD_PROTECTIONS.filter((p) => statusA[p]).length;
                      return <p className="text-xs text-gray-500 mt-1">{presentA}/{STANDARD_PROTECTIONS.length} protections present</p>;
                    })()}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-center gap-4">
                  <RiskScoreGauge score={contractBData.riskScore} size={72} />
                  <div>
                    <p className="text-sm font-bold text-blue-400 truncate">{contractBData.fileName}</p>
                    <p className="text-xs text-gray-400">{contractBData.businessName}</p>
                    {(() => {
                      const statusB = getProtectionStatus(contractBData);
                      const presentB = STANDARD_PROTECTIONS.filter((p) => statusB[p]).length;
                      return <p className="text-xs text-gray-500 mt-1">{presentB}/{STANDARD_PROTECTIONS.length} protections present</p>;
                    })()}
                  </div>
                </div>
              </div>

              {/* Better protected indicator */}
              {(() => {
                const statusA = getProtectionStatus(contractAData);
                const statusB = getProtectionStatus(contractBData);
                const countA = STANDARD_PROTECTIONS.filter((p) => statusA[p]).length;
                const countB = STANDARD_PROTECTIONS.filter((p) => statusB[p]).length;
                const better = countA > countB ? contractAData : countB > countA ? contractBData : null;
                if (!better) return null;
                return (
                  <div className="mb-4 p-3 rounded-lg border border-green-800 bg-green-950 text-center">
                    <p className="text-sm font-semibold text-green-400">
                      &#10003; {better.fileName} is better protected ({Math.max(countA, countB)}/{STANDARD_PROTECTIONS.length} protections)
                    </p>
                  </div>
                );
              })()}

              {/* Protection matrix table */}
              <div className="rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-900">
                      <th className="text-left px-4 py-3 text-gray-400 font-semibold uppercase tracking-wide w-[200px]">
                        Protection
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wide text-yellow-400">
                        {contractAData.fileName}
                      </th>
                      <th className="px-4 py-3 text-center font-semibold uppercase tracking-wide text-blue-400">
                        {contractBData.fileName}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {STANDARD_PROTECTIONS.map((protection) => {
                      const statusA = getProtectionStatus(contractAData);
                      const statusB = getProtectionStatus(contractBData);
                      return (
                        <tr key={protection} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                          <td className="px-4 py-3 text-gray-300 font-semibold">{protection}</td>
                          <td className="px-4 py-3 text-center text-lg">
                            {statusA[protection]
                              ? <span className="text-green-400" title="Present">&#10003; Present</span>
                              : <span className="text-red-400" title="Missing">&#10007; Missing</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-center text-lg">
                            {statusB[protection]
                              ? <span className="text-green-400" title="Present">&#10003; Present</span>
                              : <span className="text-red-400" title="Missing">&#10007; Missing</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Risk score comparison */}
              <div className="mt-5 p-4 rounded-xl border border-gray-800 bg-gray-900">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Risk Score Comparison</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-yellow-400 font-semibold mb-1">{contractAData.fileName}</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${contractAData.riskScore}%`, backgroundColor: scoreColor(contractAData.riskScore) }} />
                      </div>
                      <span className="text-sm font-bold" style={{ color: scoreColor(contractAData.riskScore) }}>{contractAData.riskScore}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-blue-400 font-semibold mb-1">{contractBData.fileName}</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${contractBData.riskScore}%`, backgroundColor: scoreColor(contractBData.riskScore) }} />
                      </div>
                      <span className="text-sm font-bold" style={{ color: scoreColor(contractBData.riskScore) }}>{contractBData.riskScore}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!comparisonActive && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-sm">Select two contracts above and click <span className="font-bold text-gray-400">Compare</span> to see a side-by-side protection analysis.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
