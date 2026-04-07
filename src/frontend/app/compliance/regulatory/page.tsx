'use client';

// ============================================================
// /compliance/regulatory — Regulatory Intelligence
// Feed of regulatory updates relevant to commercial financing.
// Filter by state, regulation type. Bookmark/pin. Expandable
// client-impact section per item.
// ============================================================

import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RelevanceBadge = 'critical' | 'high' | 'medium' | 'low';

interface RegulatoryItem {
  id: string;
  title: string;
  source: string;
  date: string;
  summary: string;
  relevance: RelevanceBadge;
  state: string;
  regulationType: string;
  clientImpact: string;
  bookmarked: boolean;
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_ITEMS: RegulatoryItem[] = [
  {
    id: 'reg_001', title: 'CFPB Issues Updated Guidance on Commercial Credit Disclosures', source: 'CFPB', date: '2026-04-01',
    summary: 'New guidance requires enhanced APR-equivalent disclosures for all commercial credit products above $100K. Affects all lending and card-stacking advisory workflows.',
    relevance: 'high', state: 'Federal', regulationType: 'disclosure',
    clientImpact: 'All clients receiving commercial credit offers must now see standardized APR-equivalent disclosures. Update disclosure templates and review all active offers for compliance.',
    bookmarked: false,
  },
  {
    id: 'reg_002', title: 'FTC Enforcement Action Against Deceptive Business Credit Marketing', source: 'FTC', date: '2026-03-28',
    summary: 'FTC settled with a business credit broker for $2.3M over misleading "guaranteed approval" claims. Reinforces need for truthful marketing of credit products.',
    relevance: 'critical', state: 'Federal', regulationType: 'enforcement',
    clientImpact: 'Review all outbound marketing materials for any guarantee language. Ensure advisors are trained on compliant sales scripts. Audit email and SMS templates.',
    bookmarked: false,
  },
  {
    id: 'reg_003', title: 'California SB 1235 Amendment Expands Disclosure Requirements', source: 'State AG', date: '2026-03-25',
    summary: 'Amendment extends commercial finance disclosure requirements to include factoring and merchant cash advance products under $500K.',
    relevance: 'high', state: 'CA', regulationType: 'disclosure',
    clientImpact: 'California-based clients with MCA or factoring products need updated disclosure documents. Ensure all CA offers include the new mandated fields.',
    bookmarked: false,
  },
  {
    id: 'reg_004', title: 'New York DFS Proposes Commercial Lending Transparency Rule', source: 'State AG', date: '2026-03-20',
    summary: 'Proposed rule would require commercial lenders to provide standardized cost comparison documents similar to residential mortgage disclosures.',
    relevance: 'medium', state: 'NY', regulationType: 'proposed_rule',
    clientImpact: 'If finalized, NY-based clients will need cost comparison documents for each product offered. Begin preparing templates now to avoid delays.',
    bookmarked: false,
  },
  {
    id: 'reg_005', title: 'FinCEN Updates BSA/AML Requirements for Non-Bank Lenders', source: 'CFPB', date: '2026-03-15',
    summary: 'New FinCEN guidance clarifies BSA/AML obligations for non-bank commercial lenders including enhanced due diligence requirements for high-risk business categories.',
    relevance: 'high', state: 'Federal', regulationType: 'aml',
    clientImpact: 'High-risk industry clients (cannabis-adjacent, crypto, money services) require enhanced due diligence. Update KYB workflows for affected businesses.',
    bookmarked: false,
  },
  {
    id: 'reg_006', title: 'Texas HB 1442 Business Lending Transparency Act Signed', source: 'State AG', date: '2026-03-10',
    summary: 'New Texas law requires broker compensation disclosure on all commercial finance transactions. Effective September 1, 2026.',
    relevance: 'medium', state: 'TX', regulationType: 'disclosure',
    clientImpact: 'Texas clients must receive broker compensation disclosures starting Q3. Update contract templates and advisory fee disclosures for TX transactions.',
    bookmarked: false,
  },
  {
    id: 'reg_007', title: 'TCPA Litigation Surge: Auto-Dialer Definition Narrowed', source: 'FTC', date: '2026-03-05',
    summary: 'Recent circuit court rulings have narrowed the TCPA auto-dialer definition but expanded consent revocation rights. Mixed impact for outbound campaigns.',
    relevance: 'medium', state: 'Federal', regulationType: 'tcpa',
    clientImpact: 'Outbound call/SMS campaigns may have slightly relaxed dialer rules but must respect any consent revocation immediately. Update consent management workflows.',
    bookmarked: false,
  },
  {
    id: 'reg_008', title: 'Florida UDAP Provisions Now Cover Digital Credit Applications', source: 'State AG', date: '2026-02-28',
    summary: 'Florida expanded its deceptive trade practices statute to explicitly cover AI-assisted and digital credit application flows for commercial products.',
    relevance: 'high', state: 'FL', regulationType: 'udap',
    clientImpact: 'Florida-based digital application flows must be audited for UDAP compliance. Ensure AI-driven recommendations include clear disclosures about automated decision-making.',
    bookmarked: false,
  },
];

const STATES = ['all', 'Federal', 'CA', 'NY', 'TX', 'FL'];
const REG_TYPES = ['all', 'disclosure', 'enforcement', 'proposed_rule', 'aml', 'tcpa', 'udap'];

const RELEVANCE_CONFIG: Record<RelevanceBadge, { label: string; cls: string }> = {
  critical: { label: 'Critical', cls: 'bg-red-900 text-red-300 border-red-700' },
  high:     { label: 'High',     cls: 'bg-orange-900 text-orange-300 border-orange-700' },
  medium:   { label: 'Medium',   cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  low:      { label: 'Low',      cls: 'bg-green-900 text-green-300 border-green-700' },
};

const SOURCE_COLORS: Record<string, string> = {
  CFPB:      'bg-blue-900 text-blue-300 border-blue-700',
  FTC:       'bg-purple-900 text-purple-300 border-purple-700',
  'State AG': 'bg-teal-900 text-teal-300 border-teal-700',
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function formatRegType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RegulatoryIntelligencePage() {
  const [items, setItems] = useState<RegulatoryItem[]>(MOCK_ITEMS);
  const [stateFilter, setStateFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = items;
    if (stateFilter !== 'all') result = result.filter(i => i.state === stateFilter);
    if (typeFilter !== 'all') result = result.filter(i => i.regulationType === typeFilter);
    return result;
  }, [items, stateFilter, typeFilter]);

  const toggleBookmark = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, bookmarked: !i.bookmarked } : i));
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const bookmarkedCount = items.filter(i => i.bookmarked).length;

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Regulatory Intelligence</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {filtered.length} update{filtered.length !== 1 ? 's' : ''} · {bookmarkedCount} bookmarked
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Last synced: {formatDate('2026-04-07')}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold mr-2">State</label>
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
            className="rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
          >
            {STATES.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All States' : s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold mr-2">Type</label>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
          >
            {REG_TYPES.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All Types' : formatRegType(t)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-4">
        {filtered.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-8">No regulatory updates match the current filters.</p>
        )}

        {filtered.map(item => (
          <div
            key={item.id}
            className={`rounded-xl border p-5 transition-colors ${
              item.bookmarked
                ? 'border-[#C9A84C]/50 bg-[#0A1628]/80'
                : 'border-gray-800 bg-gray-900'
            }`}
          >
            {/* Top row: badges + date + bookmark */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${RELEVANCE_CONFIG[item.relevance].cls}`}>
                  {RELEVANCE_CONFIG[item.relevance].label}
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${SOURCE_COLORS[item.source] || 'bg-gray-800 text-gray-300 border-gray-600'}`}>
                  {item.source}
                </span>
                <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                  {formatRegType(item.regulationType)}
                </span>
                {item.state !== 'Federal' && (
                  <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                    {item.state}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-gray-500">{formatDate(item.date)}</span>
                <button
                  onClick={() => toggleBookmark(item.id)}
                  className={`text-lg leading-none transition-colors ${
                    item.bookmarked ? 'text-[#C9A84C]' : 'text-gray-600 hover:text-[#C9A84C]'
                  }`}
                  title={item.bookmarked ? 'Remove bookmark' : 'Bookmark'}
                >
                  {item.bookmarked ? '\u2605' : '\u2606'}
                </button>
              </div>
            </div>

            {/* Title + summary */}
            <h3 className="font-semibold text-gray-100 text-sm mb-1">{item.title}</h3>
            <p className="text-xs text-gray-400 mb-3">{item.summary}</p>

            {/* Expand toggle */}
            <button
              onClick={() => toggleExpand(item.id)}
              className="text-xs font-semibold text-[#C9A84C] hover:text-[#d4b65e] transition-colors"
            >
              {expandedId === item.id ? 'Hide client impact' : 'How does this affect my clients?'} {expandedId === item.id ? '\u25B2' : '\u25BC'}
            </button>

            {/* Expanded section */}
            {expandedId === item.id && (
              <div className="mt-3 p-3 rounded-lg bg-[#0A1628] border border-gray-700">
                <p className="text-xs text-[#C9A84C] font-semibold uppercase mb-1">Client Impact Assessment</p>
                <p className="text-sm text-gray-300">{item.clientImpact}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
