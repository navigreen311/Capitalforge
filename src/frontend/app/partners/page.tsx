'use client';

// ============================================================
// /partners — Partner & Vendor Governance
// Partner list with type badges, compliance score gauge,
// due diligence status, next review date.
// Subprocessor registry tab. Add partner button.
// ============================================================

import { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api-client';
import PartnerScorecard from '../../components/modules/partner-scorecard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PartnerType = 'referral' | 'broker' | 'processor' | 'attorney';
type DueDiligenceStatus = 'pending' | 'in_review' | 'approved' | 'flagged' | 'expired';

interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  complianceScore: number;         // 0–100
  complaintsScore: number;         // 0–100
  dueDiligenceScore: number;       // 0–100
  contractScore: number;           // 0–100
  dueDiligenceStatus: DueDiligenceStatus;
  nextReviewDate: string;          // ISO date
  contactName: string;
  contactEmail: string;
  jurisdiction: string;
  activeContracts: number;
  totalFeesPaid: number;
}

interface Subprocessor {
  id: string;
  name: string;
  serviceType: string;
  dataCategories: string[];
  jurisdiction: string;
  certifications: string[];
  lastAuditDate: string;
  status: 'active' | 'under_review' | 'terminated';
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_PARTNERS: Partner[] = [
  {
    id: 'prt_001',
    name: 'Meridian Capital Brokers',
    type: 'broker',
    complianceScore: 94,
    complaintsScore: 88,
    dueDiligenceScore: 91,
    contractScore: 96,
    dueDiligenceStatus: 'approved',
    nextReviewDate: '2026-09-15',
    contactName: 'Daniel Torres',
    contactEmail: 'dtorres@meridiancap.com',
    jurisdiction: 'TX',
    activeContracts: 3,
    totalFeesPaid: 142500,
  },
  {
    id: 'prt_002',
    name: 'Westside Referral Group',
    type: 'referral',
    complianceScore: 78,
    complaintsScore: 82,
    dueDiligenceScore: 70,
    contractScore: 85,
    dueDiligenceStatus: 'in_review',
    nextReviewDate: '2026-05-01',
    contactName: 'Patricia Lee',
    contactEmail: 'plee@westsideref.com',
    jurisdiction: 'CA',
    activeContracts: 1,
    totalFeesPaid: 38200,
  },
  {
    id: 'prt_003',
    name: 'CorePay Processing LLC',
    type: 'processor',
    complianceScore: 87,
    complaintsScore: 75,
    dueDiligenceScore: 92,
    contractScore: 90,
    dueDiligenceStatus: 'approved',
    nextReviewDate: '2026-12-01',
    contactName: 'Marcus Huang',
    contactEmail: 'mhuang@corepay.io',
    jurisdiction: 'DE',
    activeContracts: 2,
    totalFeesPaid: 215000,
  },
  {
    id: 'prt_004',
    name: 'Goldstein & Rowe LLP',
    type: 'attorney',
    complianceScore: 98,
    complaintsScore: 95,
    dueDiligenceScore: 99,
    contractScore: 97,
    dueDiligenceStatus: 'approved',
    nextReviewDate: '2027-01-10',
    contactName: 'Rachel Goldstein',
    contactEmail: 'rgoldstein@gr-law.com',
    jurisdiction: 'NY',
    activeContracts: 4,
    totalFeesPaid: 89000,
  },
  {
    id: 'prt_005',
    name: 'FastFund Brokers Inc.',
    type: 'broker',
    complianceScore: 54,
    complaintsScore: 48,
    dueDiligenceScore: 61,
    contractScore: 70,
    dueDiligenceStatus: 'flagged',
    nextReviewDate: '2026-04-20',
    contactName: 'Steve Marino',
    contactEmail: 'smarino@fastfund.biz',
    jurisdiction: 'FL',
    activeContracts: 1,
    totalFeesPaid: 12400,
  },
  {
    id: 'prt_006',
    name: 'Atlas Referral Network',
    type: 'referral',
    complianceScore: 81,
    complaintsScore: 90,
    dueDiligenceScore: 77,
    contractScore: 83,
    dueDiligenceStatus: 'approved',
    nextReviewDate: '2026-08-30',
    contactName: 'Kezia Obi',
    contactEmail: 'kobi@atlasreferrals.net',
    jurisdiction: 'GA',
    activeContracts: 2,
    totalFeesPaid: 67300,
  },
];

const PLACEHOLDER_SUBPROCESSORS: Subprocessor[] = [
  {
    id: 'sp_001',
    name: 'Plaid Technologies Inc.',
    serviceType: 'Bank Verification / Open Banking',
    dataCategories: ['Bank account data', 'Transaction history', 'Balance information'],
    jurisdiction: 'US',
    certifications: ['SOC 2 Type II', 'PCI DSS'],
    lastAuditDate: '2025-11-15',
    status: 'active',
  },
  {
    id: 'sp_002',
    name: 'Equifax Information Services',
    serviceType: 'Credit Bureau Reporting',
    dataCategories: ['Credit history', 'Identity data', 'Payment history'],
    jurisdiction: 'US',
    certifications: ['SOC 2 Type II', 'ISO 27001'],
    lastAuditDate: '2025-10-01',
    status: 'active',
  },
  {
    id: 'sp_003',
    name: 'Stripe Payments LLC',
    serviceType: 'Payment Processing',
    dataCategories: ['Payment card data', 'Bank routing info', 'Transaction metadata'],
    jurisdiction: 'US',
    certifications: ['PCI DSS Level 1', 'SOC 2 Type II'],
    lastAuditDate: '2025-12-01',
    status: 'active',
  },
  {
    id: 'sp_004',
    name: 'DocuSign Inc.',
    serviceType: 'Electronic Signature',
    dataCategories: ['Document content', 'Signatory identity', 'Audit trails'],
    jurisdiction: 'US',
    certifications: ['SOC 2 Type II', 'ISO 27001', 'FedRAMP'],
    lastAuditDate: '2026-01-10',
    status: 'active',
  },
  {
    id: 'sp_005',
    name: 'TrueLayer Ltd.',
    serviceType: 'Open Banking API',
    dataCategories: ['Bank account data', 'Payment initiation'],
    jurisdiction: 'UK / EU',
    certifications: ['PSD2', 'ISO 27001'],
    lastAuditDate: '2025-09-20',
    status: 'under_review',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PARTNER_TYPE_CONFIG: Record<PartnerType, { label: string; badgeClass: string }> = {
  referral:  { label: 'Referral',  badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  broker:    { label: 'Broker',    badgeClass: 'bg-purple-900 text-purple-300 border-purple-700' },
  processor: { label: 'Processor', badgeClass: 'bg-amber-900 text-amber-300 border-amber-700' },
  attorney:  { label: 'Attorney',  badgeClass: 'bg-teal-900 text-teal-300 border-teal-700' },
};

const DD_STATUS_CONFIG: Record<DueDiligenceStatus, { label: string; badgeClass: string }> = {
  pending:    { label: 'Pending',    badgeClass: 'bg-gray-800 text-gray-400 border-gray-600' },
  in_review:  { label: 'In Review',  badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  approved:   { label: 'Approved',   badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  flagged:    { label: 'Flagged',    badgeClass: 'bg-red-900 text-red-300 border-red-700' },
  expired:    { label: 'Expired',    badgeClass: 'bg-orange-900 text-orange-300 border-orange-700' },
};

const SP_STATUS_CONFIG: Record<Subprocessor['status'], { label: string; badgeClass: string }> = {
  active:       { label: 'Active',       badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  under_review: { label: 'Under Review', badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  terminated:   { label: 'Terminated',   badgeClass: 'bg-red-900 text-red-300 border-red-700' },
};

function overallScore(p: Partner): number {
  return Math.round((p.complianceScore + p.complaintsScore + p.dueDiligenceScore + p.contractScore) / 4);
}

function gradeFromAvg(avg: number): { grade: string; color: string } {
  if (avg >= 90) return { grade: 'A', color: '#22c55e' };
  if (avg >= 80) return { grade: 'B', color: '#84cc16' };
  if (avg >= 70) return { grade: 'C', color: '#eab308' };
  if (avg >= 60) return { grade: 'D', color: '#f97316' };
  return               { grade: 'F', color: '#ef4444' };
}

function ComplianceGauge({ score }: { score: number }) {
  const size = 56;
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width={size} height={size} aria-label={`Compliance score ${score}`}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1f2937" strokeWidth={6} />
      <circle
        cx={cx} cy={cy} r={radius} fill="none"
        stroke={color} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fontWeight="700" fill={color}>
        {score}
      </text>
    </svg>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>(PLACEHOLDER_PARTNERS);
  const [subprocessors] = useState<Subprocessor[]>(PLACEHOLDER_SUBPROCESSORS);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'partners' | 'subprocessors'>('partners');
  const [typeFilter, setTypeFilter] = useState<PartnerType | ''>('');
  const [ddFilter, setDdFilter] = useState<DueDiligenceStatus | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<{ partners: Partner[] }>('/partners');
        if (res.success && res.data?.partners) setPartners(res.data.partners);
      } catch { /* placeholder */ }
      finally { setLoading(false); }
    })();
  }, []);

  const displayed = partners.filter((p) => {
    const matchType = !typeFilter || p.type === typeFilter;
    const matchDd = !ddFilter || p.dueDiligenceStatus === ddFilter;
    return matchType && matchDd;
  });

  const totalFeesPaid = partners.reduce((s, p) => s + p.totalFeesPaid, 0);
  const flaggedCount = partners.filter((p) => p.dueDiligenceStatus === 'flagged').length;
  const avgCompliance = Math.round(partners.reduce((s, p) => s + p.complianceScore, 0) / (partners.length || 1));

  const PARTNER_TYPES: PartnerType[] = ['referral', 'broker', 'processor', 'attorney'];
  const DD_STATUSES: DueDiligenceStatus[] = ['pending', 'in_review', 'approved', 'flagged', 'expired'];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Partner & Vendor Governance</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {partners.length} partners registered
            {flaggedCount > 0 && (
              <span className="ml-2 text-red-400 font-semibold">{flaggedCount} flagged</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors"
        >
          + Add Partner
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Partners',    value: partners.length,             color: 'text-gray-100' },
          { label: 'Avg Compliance',    value: `${avgCompliance}%`,         color: avgCompliance >= 80 ? 'text-green-400' : avgCompliance >= 60 ? 'text-yellow-400' : 'text-red-400' },
          { label: 'Flagged Reviews',   value: flaggedCount,                color: flaggedCount > 0 ? 'text-red-400' : 'text-gray-400' },
          { label: 'Total Fees Paid',   value: formatCurrency(totalFeesPaid), color: 'text-yellow-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{stat.label}</p>
            <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {(['partners', 'subprocessors'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px capitalize ${
              activeTab === tab
                ? 'border-yellow-500 text-yellow-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab === 'partners' ? 'Partner Registry' : 'Subprocessor Registry'}
          </button>
        ))}
      </div>

      {/* Partners tab */}
      {activeTab === 'partners' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-5">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as PartnerType | '')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
            >
              <option value="">All Types</option>
              {PARTNER_TYPES.map((t) => (
                <option key={t} value={t}>{PARTNER_TYPE_CONFIG[t].label}</option>
              ))}
            </select>

            <select
              value={ddFilter}
              onChange={(e) => setDdFilter(e.target.value as DueDiligenceStatus | '')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
            >
              <option value="">All DD Statuses</option>
              {DD_STATUSES.map((s) => (
                <option key={s} value={s}>{DD_STATUS_CONFIG[s].label}</option>
              ))}
            </select>

            {(typeFilter || ddFilter) && (
              <button
                onClick={() => { setTypeFilter(''); setDdFilter(''); }}
                className="px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Partner list */}
          {loading ? (
            <p className="text-gray-500 text-sm py-8 text-center">Loading…</p>
          ) : (
            <div className="space-y-3">
              {displayed.map((partner) => {
                const avg = overallScore(partner);
                const { grade, color } = gradeFromAvg(avg);
                const isExpanded = expandedId === partner.id;

                return (
                  <div
                    key={partner.id}
                    className={`rounded-xl border transition-colors ${
                      partner.dueDiligenceStatus === 'flagged'
                        ? 'border-red-700 bg-red-950'
                        : 'border-gray-800 bg-gray-900'
                    }`}
                  >
                    {/* Row header */}
                    <div
                      className="flex items-center gap-4 p-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : partner.id)}
                    >
                      {/* Compliance gauge */}
                      <ComplianceGauge score={partner.complianceScore} />

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-gray-100 text-sm">{partner.name}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PARTNER_TYPE_CONFIG[partner.type].badgeClass}`}>
                            {PARTNER_TYPE_CONFIG[partner.type].label}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DD_STATUS_CONFIG[partner.dueDiligenceStatus].badgeClass}`}>
                            {DD_STATUS_CONFIG[partner.dueDiligenceStatus].label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                          <span>{partner.contactName}</span>
                          <span>{partner.jurisdiction}</span>
                          <span>{partner.activeContracts} contract{partner.activeContracts !== 1 ? 's' : ''}</span>
                          <span>Review: {formatDate(partner.nextReviewDate)}</span>
                        </div>
                      </div>

                      {/* Overall grade */}
                      <div className="flex flex-col items-center flex-shrink-0 w-10">
                        <span className="text-xl font-black" style={{ color }}>{grade}</span>
                        <span className="text-xs text-gray-500">{avg}</span>
                      </div>

                      {/* Expand arrow */}
                      <span className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                        →
                      </span>
                    </div>

                    {/* Expanded scorecard */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-gray-800 pt-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <PartnerScorecard
                            compliance={partner.complianceScore}
                            complaints={partner.complaintsScore}
                            dueDiligence={partner.dueDiligenceScore}
                            contract={partner.contractScore}
                            partnerName={partner.name}
                          />
                          <div className="space-y-3 text-sm">
                            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4 space-y-2">
                              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Details</p>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Contact</span>
                                <span className="text-gray-200">{partner.contactName}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Email</span>
                                <span className="text-gray-200 truncate ml-2">{partner.contactEmail}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Jurisdiction</span>
                                <span className="text-gray-200">{partner.jurisdiction}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Active Contracts</span>
                                <span className="text-gray-200">{partner.activeContracts}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Total Fees Paid</span>
                                <span className="text-yellow-400 font-semibold">{formatCurrency(partner.totalFeesPaid)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Next Review</span>
                                <span className="text-gray-200">{formatDate(partner.nextReviewDate)}</span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button className="flex-1 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-300 transition-colors border border-gray-700">
                                View Contracts
                              </button>
                              <button className="flex-1 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-300 transition-colors border border-gray-700">
                                Run Review
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {displayed.length === 0 && (
                <p className="text-center text-gray-500 py-8 text-sm">No partners match the current filters.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Subprocessors tab */}
      {activeTab === 'subprocessors' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-semibold">Name</th>
                  <th className="text-left px-4 py-3 font-semibold">Service</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Data Categories</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Certifications</th>
                  <th className="text-left px-4 py-3 font-semibold">Jurisdiction</th>
                  <th className="text-left px-4 py-3 font-semibold">Last Audit</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {subprocessors.map((sp) => (
                  <tr key={sp.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-100">{sp.name}</td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{sp.serviceType}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {sp.dataCategories.map((dc) => (
                          <span key={dc} className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                            {dc}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {sp.certifications.map((c) => (
                          <span key={c} className="text-xs bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded">
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{sp.jurisdiction}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(sp.lastAuditDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SP_STATUS_CONFIG[sp.status].badgeClass}`}>
                        {SP_STATUS_CONFIG[sp.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Partner Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Add New Partner</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-500 hover:text-gray-300 text-xl font-bold transition-colors"
              >
                &times;
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Partner Name</label>
                <input
                  type="text"
                  placeholder="Acme Capital Brokers"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Partner Type</label>
                <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500">
                  {PARTNER_TYPES.map((t) => (
                    <option key={t} value={t}>{PARTNER_TYPE_CONFIG[t].label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Contact Name</label>
                  <input
                    type="text"
                    placeholder="Jane Smith"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Jurisdiction</label>
                  <input
                    type="text"
                    placeholder="TX"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Email</label>
                <input
                  type="email"
                  placeholder="contact@partner.com"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors"
              >
                Add Partner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
