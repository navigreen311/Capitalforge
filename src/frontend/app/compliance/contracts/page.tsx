'use client';

// ============================================================
// /compliance/contracts — Contracts Management
// Contract list with expiry tracking, upload button,
// key clause summary, expiry countdown.
// ============================================================

import { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContractStatus = 'Active' | 'Expiring Soon' | 'Expired' | 'Under Review' | 'Draft';

interface KeyClause {
  label: string;
  summary: string;
}

interface Contract {
  id: string;
  businessName: string;
  contractType: string;
  fileName: string;
  startDate: string;
  expiryDate: string;
  status: ContractStatus;
  keyClauses: KeyClause[];
  riskScore: number;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_CONTRACTS: Contract[] = [
  {
    id: 'ctr_001', businessName: 'Apex Ventures LLC', contractType: 'MCA Agreement',
    fileName: 'apex_mca_agreement_2026.pdf', startDate: '2025-06-01', expiryDate: '2026-06-01',
    status: 'Active', riskScore: 72,
    keyClauses: [
      { label: 'Factor Rate', summary: '1.35 factor rate on $150K advance' },
      { label: 'Daily Remittance', summary: '15% of daily credit card receipts' },
      { label: 'Confession of Judgment', summary: 'COJ clause present — review required' },
    ],
  },
  {
    id: 'ctr_002', businessName: 'NovaTech Solutions Inc.', contractType: 'Line of Credit',
    fileName: 'novatech_loc_2025.pdf', startDate: '2025-01-15', expiryDate: '2026-04-15',
    status: 'Expiring Soon', riskScore: 45,
    keyClauses: [
      { label: 'Credit Limit', summary: '$250K revolving line at Prime + 4.5%' },
      { label: 'Draw Period', summary: '12-month draw period, 24-month repayment' },
    ],
  },
  {
    id: 'ctr_003', businessName: 'Horizon Retail Partners', contractType: 'Term Loan',
    fileName: 'horizon_term_loan.pdf', startDate: '2025-09-01', expiryDate: '2026-03-01',
    status: 'Expired', riskScore: 88,
    keyClauses: [
      { label: 'Principal', summary: '$500K term loan, 18-month maturity' },
      { label: 'Prepayment Penalty', summary: '3% prepayment penalty in first 12 months' },
      { label: 'Personal Guarantee', summary: 'Full personal guarantee from all owners >20%' },
    ],
  },
  {
    id: 'ctr_004', businessName: 'Summit Capital Group', contractType: 'Revenue Share',
    fileName: 'summit_rev_share_2026.pdf', startDate: '2026-01-01', expiryDate: '2027-01-01',
    status: 'Active', riskScore: 32,
    keyClauses: [
      { label: 'Revenue Share', summary: '8% of monthly gross revenue until $180K repaid' },
      { label: 'Cap', summary: 'Total repayment capped at 1.4x funded amount' },
    ],
  },
  {
    id: 'ctr_005', businessName: 'Blue Ridge Consulting', contractType: 'Advisor Agreement',
    fileName: 'blueridge_advisor_agmt.pdf', startDate: '2025-11-01', expiryDate: '2026-04-30',
    status: 'Expiring Soon', riskScore: 55,
    keyClauses: [
      { label: 'Compensation', summary: 'Fixed retainer + 2% of funded volume' },
      { label: 'Non-Compete', summary: '12-month non-compete within 50-mile radius' },
    ],
  },
  {
    id: 'ctr_006', businessName: 'Crestline Medical LLC', contractType: 'MCA Agreement',
    fileName: 'crestline_mca_2026.pdf', startDate: '2026-02-01', expiryDate: '2026-08-01',
    status: 'Under Review', riskScore: 65,
    keyClauses: [
      { label: 'Factor Rate', summary: '1.28 factor rate on $200K advance' },
      { label: 'UCC Filing', summary: 'UCC-1 filing on all business assets' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TODAY = new Date();

function daysUntilExpiry(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function statusBadge(s: ContractStatus): string {
  switch (s) {
    case 'Active':        return 'bg-green-900/50 text-green-300 border border-green-700';
    case 'Expiring Soon': return 'bg-amber-900/50 text-amber-300 border border-amber-700';
    case 'Expired':       return 'bg-red-900/50 text-red-300 border border-red-700';
    case 'Under Review':  return 'bg-blue-900/50 text-blue-300 border border-blue-700';
    case 'Draft':         return 'bg-gray-800 text-gray-400 border border-gray-700';
  }
}

function riskColor(score: number): string {
  if (score >= 75) return 'text-red-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-green-400';
}

function expiryCountdownColor(days: number): string {
  if (days < 0) return 'text-red-400';
  if (days <= 30) return 'text-amber-400';
  return 'text-green-400';
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>(PLACEHOLDER_CONTRACTS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [uploadForm, setUploadForm] = useState({ businessName: '', contractType: '', fileName: '' });

  const handleUpload = useCallback(() => {
    if (!uploadForm.fileName.trim()) return;
    const newContract: Contract = {
      id: `ctr_${Date.now()}`,
      businessName: uploadForm.businessName || 'Unknown Business',
      contractType: uploadForm.contractType || 'Other',
      fileName: uploadForm.fileName,
      startDate: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
      status: 'Draft',
      keyClauses: [],
      riskScore: 0,
    };
    setContracts((prev) => [newContract, ...prev]);
    setShowUploadModal(false);
    setUploadForm({ businessName: '', contractType: '', fileName: '' });
    setToast('Contract uploaded for analysis');
  }, [uploadForm]);

  // Summary
  const expiring = contracts.filter((c) => c.status === 'Expiring Soon').length;
  const expired = contracts.filter((c) => c.status === 'Expired').length;

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Contracts</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {contracts.length} contracts &middot;{' '}
            {expiring > 0 && <span className="text-amber-400">{expiring} expiring soon</span>}
            {expiring > 0 && expired > 0 && ' · '}
            {expired > 0 && <span className="text-red-400">{expired} expired</span>}
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-[#0A1628] text-sm font-semibold transition-colors"
        >
          Upload Contract
        </button>
      </div>

      {/* Contract Cards */}
      <div className="space-y-3">
        {contracts.map((c) => {
          const days = daysUntilExpiry(c.expiryDate);
          const isExpanded = expandedId === c.id;

          return (
            <div key={c.id} className="rounded-xl border border-gray-800 bg-[#0f1d32] overflow-hidden">
              {/* Row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-[#0A1628]/30 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge(c.status)}`}>
                        {c.status}
                      </span>
                      <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                        {c.contractType}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-100 truncate">{c.businessName}</p>
                    <p className="text-xs text-gray-500 truncate">{c.fileName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 flex-shrink-0">
                  {/* Risk Score */}
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Risk</p>
                    <p className={`text-lg font-black ${riskColor(c.riskScore)}`}>{c.riskScore}</p>
                  </div>

                  {/* Expiry Countdown */}
                  <div className="text-center min-w-[90px]">
                    <p className="text-xs text-gray-500 mb-0.5">Expiry</p>
                    <p className={`text-sm font-bold ${expiryCountdownColor(days)}`}>
                      {days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'Today' : `${days}d`}
                    </p>
                    <p className="text-xs text-gray-600">{formatDate(c.expiryDate)}</p>
                  </div>

                  {/* Expand icon */}
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded — Key Clauses */}
              {isExpanded && (
                <div className="px-5 pb-4 border-t border-gray-800">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mt-3 mb-2">Key Clauses</p>
                  {c.keyClauses.length === 0 ? (
                    <p className="text-xs text-gray-600">No clauses extracted yet. Upload for AI analysis.</p>
                  ) : (
                    <div className="space-y-2">
                      {c.keyClauses.map((clause, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-2.5 rounded-lg bg-[#0A1628] border border-gray-800">
                          <span className="flex-shrink-0 h-5 w-5 flex items-center justify-center rounded-full bg-[#C9A84C]/20 text-[#C9A84C] text-xs font-bold">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-xs font-semibold text-gray-200">{clause.label}</p>
                            <p className="text-xs text-gray-400">{clause.summary}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
                    <span>Start: {formatDate(c.startDate)}</span>
                    <span className="text-gray-700">|</span>
                    <span>Expiry: {formatDate(c.expiryDate)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f1d32] border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Upload Contract</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Business Name</label>
                <input
                  type="text"
                  value={uploadForm.businessName}
                  onChange={(e) => setUploadForm((f) => ({ ...f, businessName: e.target.value }))}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  placeholder="Enter business name"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Contract Type</label>
                <select
                  value={uploadForm.contractType}
                  onChange={(e) => setUploadForm((f) => ({ ...f, contractType: e.target.value }))}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                >
                  <option value="">Select type...</option>
                  {['MCA Agreement', 'Revenue Share', 'Line of Credit', 'Term Loan', 'Advisor Agreement', 'Other'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">File Name</label>
                <input
                  type="text"
                  value={uploadForm.fileName}
                  onChange={(e) => setUploadForm((f) => ({ ...f, fileName: e.target.value }))}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  placeholder="contract.pdf"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-5">
              <button onClick={() => setShowUploadModal(false)} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-gray-300 transition-colors">
                Cancel
              </button>
              <button onClick={handleUpload} className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-sm font-semibold text-[#0A1628] transition-colors">
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-[#0A1628] border border-[#C9A84C]/30 text-gray-100 text-sm rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
      )}
    </div>
  );
}
