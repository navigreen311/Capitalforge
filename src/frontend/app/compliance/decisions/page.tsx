'use client';

// ============================================================
// /compliance/decisions — Application Decisions
// Decision log (approved/declined) with reasoning, adverse
// action notice status, detail view, filter, and export.
// ============================================================

import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DecisionOutcome = 'approved' | 'declined';
type AdverseActionStatus = 'sent' | 'pending' | 'not_required';
type FilterMode = 'all' | 'approved' | 'declined';

interface AdverseAction {
  status: 'sent' | 'pending';
  sentDate: string | null;
  content: string;
}

interface Decision {
  id: string;
  applicationId: string;
  businessName: string;
  decision: DecisionOutcome;
  decisionDate: string;
  advisor: string;
  reasoning: string;
  factors: string[];
  adverseAction: AdverseAction | null;
  productType: string;
  amount: string;
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const DECISIONS: Decision[] = [
  {
    id: 'dec_001', applicationId: 'APP-2026-0142', businessName: 'Apex Ventures LLC', decision: 'approved',
    decisionDate: '2026-04-03', advisor: 'Sarah Chen',
    reasoning: 'Strong credit profile (Dun & Bradstreet PAYDEX 80+), 5+ years in business, annual revenue $2.4M. All KYB/KYC checks passed. Product suitability score 94/100.',
    factors: ['Credit Score: 780', 'Years in Business: 7', 'Annual Revenue: $2.4M', 'Industry Risk: Low', 'PAYDEX: 82'],
    adverseAction: null, productType: 'Business Credit Card', amount: '$150,000',
  },
  {
    id: 'dec_002', applicationId: 'APP-2026-0143', businessName: 'QuickStart Ventures', decision: 'declined',
    decisionDate: '2026-04-03', advisor: 'Marcus Johnson',
    reasoning: 'Business operational for less than 12 months. Personal credit score below minimum threshold (620). Insufficient revenue history for requested credit amount.',
    factors: ['Credit Score: 580', 'Years in Business: 0.8', 'Annual Revenue: $180K', 'Industry Risk: High', 'PAYDEX: N/A'],
    adverseAction: {
      status: 'sent', sentDate: '2026-04-04',
      content: 'Your application for a Business Credit Card has been declined based on the following factors: (1) Insufficient time in business — minimum 12 months required; (2) Personal credit score below minimum threshold; (3) Insufficient annual revenue for requested credit amount. You have the right to request a copy of your credit report and dispute any inaccuracies.',
    },
    productType: 'Business Credit Card', amount: '$75,000',
  },
  {
    id: 'dec_003', applicationId: 'APP-2026-0144', businessName: 'NovaTech Solutions Inc.', decision: 'approved',
    decisionDate: '2026-04-02', advisor: 'Emily Rodriguez',
    reasoning: 'Established tech company, 3 years in business. Good credit profile. Revenue growth of 40% YoY. Product suitability for credit line expansion confirmed.',
    factors: ['Credit Score: 720', 'Years in Business: 3', 'Annual Revenue: $1.8M', 'Industry Risk: Medium', 'PAYDEX: 75'],
    adverseAction: null, productType: 'Credit Line Increase', amount: '$250,000',
  },
  {
    id: 'dec_004', applicationId: 'APP-2026-0145', businessName: 'Harbor Marine Supply', decision: 'declined',
    decisionDate: '2026-04-01', advisor: 'David Kim',
    reasoning: 'Multiple tax liens on record. Existing debt-to-income ratio exceeds threshold. Industry sector flagged for elevated risk (seasonal marine supply).',
    factors: ['Credit Score: 640', 'Years in Business: 12', 'Annual Revenue: $900K', 'Industry Risk: High', 'Tax Liens: 2 active'],
    adverseAction: {
      status: 'pending', sentDate: null,
      content: 'Your application for a Merchant Cash Advance has been declined based on the following factors: (1) Active tax liens on business record; (2) Debt-to-income ratio exceeds maximum threshold; (3) Elevated industry risk classification. You have the right to request a copy of your credit report and dispute any inaccuracies.',
    },
    productType: 'Merchant Cash Advance', amount: '$200,000',
  },
  {
    id: 'dec_005', applicationId: 'APP-2026-0146', businessName: 'Summit Capital Group', decision: 'approved',
    decisionDate: '2026-03-30', advisor: 'Sarah Chen',
    reasoning: 'Well-capitalized investment firm. Excellent credit history. Low industry risk. Multiple successful prior funding rounds on platform.',
    factors: ['Credit Score: 810', 'Years in Business: 15', 'Annual Revenue: $5.2M', 'Industry Risk: Low', 'PAYDEX: 90'],
    adverseAction: null, productType: 'Business Line of Credit', amount: '$500,000',
  },
  {
    id: 'dec_006', applicationId: 'APP-2026-0147', businessName: 'GreenLeaf Organics', decision: 'declined',
    decisionDate: '2026-03-29', advisor: 'Marcus Johnson',
    reasoning: 'Cannabis-adjacent industry classification triggers enhanced due diligence. Incomplete beneficial ownership documentation. Unable to verify primary bank relationship.',
    factors: ['Credit Score: 700', 'Years in Business: 2', 'Annual Revenue: $600K', 'Industry Risk: Critical', 'BSA/AML: EDD Required'],
    adverseAction: {
      status: 'sent', sentDate: '2026-03-30',
      content: 'Your application for a Business Credit Card has been declined based on the following factors: (1) Industry classification requires enhanced due diligence that could not be completed; (2) Incomplete beneficial ownership documentation; (3) Unable to verify primary banking relationship. You have the right to request a copy of your credit report and dispute any inaccuracies.',
    },
    productType: 'Business Credit Card', amount: '$50,000',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DecisionsPage() {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return DECISIONS;
    return DECISIONS.filter(d => d.decision === filter);
  }, [filter]);

  const approvedCount = DECISIONS.filter(d => d.decision === 'approved').length;
  const declinedCount = DECISIONS.filter(d => d.decision === 'declined').length;
  const pendingAdverse = DECISIONS.filter(d => d.adverseAction?.status === 'pending').length;

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const handleExport = () => {
    // Generate CSV-like output
    const headers = ['Application ID', 'Business', 'Decision', 'Date', 'Product', 'Amount', 'Advisor', 'Adverse Action Status'];
    const rows = filtered.map(d => [
      d.applicationId, d.businessName, d.decision, d.decisionDate, d.productType, d.amount, d.advisor,
      d.adverseAction ? d.adverseAction.status : 'N/A',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decisions-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast('Decisions exported as CSV.');
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Application Decisions</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {DECISIONS.length} total · {approvedCount} approved · {declinedCount} declined
            {pendingAdverse > 0 && (
              <span className="ml-2 text-orange-400 font-semibold">· {pendingAdverse} adverse action pending</span>
            )}
          </p>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#d4b65e] text-[#0A1628] text-sm font-bold transition-colors"
        >
          Export for Review
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Decisions', value: DECISIONS.length, color: 'text-gray-100' },
          { label: 'Approved', value: approvedCount, color: 'text-green-400' },
          { label: 'Declined', value: declinedCount, color: 'text-red-400' },
          { label: 'Adverse Pending', value: pendingAdverse, color: pendingAdverse > 0 ? 'text-orange-400' : 'text-gray-400' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
            <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {(['all', 'approved', 'declined'] as FilterMode[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px capitalize ${
              filter === f
                ? 'border-[#C9A84C] text-[#C9A84C]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Decision list */}
      <div className="space-y-4">
        {filtered.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-8">No decisions match the current filter.</p>
        )}

        {filtered.map(dec => (
          <div
            key={dec.id}
            className={`rounded-xl border p-5 transition-colors ${
              dec.decision === 'approved'
                ? 'border-green-800/40 bg-gray-900'
                : 'border-red-800/40 bg-gray-900'
            }`}
          >
            {/* Top row */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                    dec.decision === 'approved'
                      ? 'bg-green-900 text-green-300 border-green-700'
                      : 'bg-red-900 text-red-300 border-red-700'
                  }`}>
                    {dec.decision.toUpperCase()}
                  </span>
                  <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                    {dec.applicationId}
                  </span>
                  <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                    {dec.productType}
                  </span>
                  <span className="text-xs text-gray-500">{dec.amount}</span>
                  {dec.adverseAction && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                      dec.adverseAction.status === 'sent'
                        ? 'bg-blue-900 text-blue-300 border-blue-700'
                        : 'bg-orange-900 text-orange-300 border-orange-700 animate-pulse'
                    }`}>
                      AA: {dec.adverseAction.status === 'sent' ? 'Sent' : 'Pending'}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-gray-100 text-sm">{dec.businessName}</p>
                <p className="text-xs text-gray-400 mt-0.5">{dec.reasoning}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                  <span>Advisor: {dec.advisor}</span>
                  <span>{formatDate(dec.decisionDate)}</span>
                </div>
              </div>
              <button
                onClick={() => toggleExpand(dec.id)}
                className="text-xs font-semibold text-[#C9A84C] hover:text-[#d4b65e] transition-colors flex-shrink-0"
              >
                {expandedId === dec.id ? 'Hide Details' : 'View Details'}
              </button>
            </div>

            {/* Expanded detail */}
            {expandedId === dec.id && (
              <div className="mt-4 space-y-4">
                {/* Factors */}
                <div className="p-3 rounded-lg bg-[#0A1628] border border-gray-700">
                  <p className="text-xs text-[#C9A84C] font-semibold uppercase mb-2">Decision Factors</p>
                  <div className="flex flex-wrap gap-2">
                    {dec.factors.map((f, i) => (
                      <span key={i} className="text-xs bg-gray-800 text-gray-300 border border-gray-700 px-2 py-1 rounded-lg">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Full reasoning */}
                <div className="p-3 rounded-lg bg-[#0A1628] border border-gray-700">
                  <p className="text-xs text-[#C9A84C] font-semibold uppercase mb-2">Full Reasoning</p>
                  <p className="text-sm text-gray-300">{dec.reasoning}</p>
                </div>

                {/* Adverse action */}
                {dec.adverseAction && (
                  <div className="p-3 rounded-lg bg-red-950/30 border border-red-800/50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-red-400 font-semibold uppercase">Adverse Action Notice</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                        dec.adverseAction.status === 'sent'
                          ? 'bg-blue-900 text-blue-300 border-blue-700'
                          : 'bg-orange-900 text-orange-300 border-orange-700'
                      }`}>
                        {dec.adverseAction.status === 'sent'
                          ? `Sent ${dec.adverseAction.sentDate ? formatDate(dec.adverseAction.sentDate) : ''}`
                          : 'Pending Send'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{dec.adverseAction.content}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-gray-800 border border-gray-600 text-gray-100 text-sm rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
      )}
    </div>
  );
}
