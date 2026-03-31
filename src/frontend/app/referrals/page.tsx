'use client';

// ============================================================
// /referrals — Referral & Affiliate Tracking
// Attribution table (source type, partner, channel, fee
// amount, fee status). Analytics cards (total referrals,
// conversion rate, total fees paid, pending fees).
// Agreement generation button.
// ============================================================

import { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SourceType = 'affiliate' | 'broker' | 'direct' | 'organic' | 'partner';
type Channel = 'email' | 'web' | 'phone' | 'social' | 'event' | 'api';
type FeeStatus = 'pending' | 'approved' | 'paid' | 'disputed' | 'voided';

interface ReferralRow {
  id: string;
  clientName: string;
  sourceType: SourceType;
  partnerName: string;
  channel: Channel;
  referredAt: string;        // ISO date
  converted: boolean;
  feeAmount: number;
  feeStatus: FeeStatus;
  applicationId?: string;
  fundingAmount?: number;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_REFERRALS: ReferralRow[] = [
  {
    id: 'ref_001',
    clientName: 'Apex Ventures LLC',
    sourceType: 'broker',
    partnerName: 'Meridian Capital Brokers',
    channel: 'email',
    referredAt: '2026-03-25T10:00:00Z',
    converted: true,
    feeAmount: 4200,
    feeStatus: 'paid',
    applicationId: 'app_101',
    fundingAmount: 210000,
  },
  {
    id: 'ref_002',
    clientName: 'NovaTech Solutions Inc.',
    sourceType: 'affiliate',
    partnerName: 'Atlas Referral Network',
    channel: 'web',
    referredAt: '2026-03-26T14:30:00Z',
    converted: true,
    feeAmount: 1800,
    feeStatus: 'approved',
    applicationId: 'app_102',
    fundingAmount: 90000,
  },
  {
    id: 'ref_003',
    clientName: 'Blue Ridge Consulting',
    sourceType: 'partner',
    partnerName: 'Westside Referral Group',
    channel: 'phone',
    referredAt: '2026-03-27T09:15:00Z',
    converted: false,
    feeAmount: 0,
    feeStatus: 'pending',
  },
  {
    id: 'ref_004',
    clientName: 'Summit Capital Group',
    sourceType: 'broker',
    partnerName: 'Meridian Capital Brokers',
    channel: 'api',
    referredAt: '2026-03-20T08:00:00Z',
    converted: true,
    feeAmount: 6750,
    feeStatus: 'paid',
    applicationId: 'app_095',
    fundingAmount: 450000,
  },
  {
    id: 'ref_005',
    clientName: 'Horizon Retail Partners',
    sourceType: 'direct',
    partnerName: '—',
    channel: 'web',
    referredAt: '2026-03-28T16:00:00Z',
    converted: false,
    feeAmount: 0,
    feeStatus: 'voided',
  },
  {
    id: 'ref_006',
    clientName: 'Crestline Medical LLC',
    sourceType: 'affiliate',
    partnerName: 'Atlas Referral Network',
    channel: 'email',
    referredAt: '2026-03-22T11:45:00Z',
    converted: true,
    feeAmount: 2400,
    feeStatus: 'pending',
    applicationId: 'app_098',
    fundingAmount: 120000,
  },
  {
    id: 'ref_007',
    clientName: 'Pinnacle Freight Corp',
    sourceType: 'partner',
    partnerName: 'Goldstein & Rowe LLP',
    channel: 'event',
    referredAt: '2026-03-15T13:00:00Z',
    converted: true,
    feeAmount: 3100,
    feeStatus: 'paid',
    applicationId: 'app_088',
    fundingAmount: 310000,
  },
  {
    id: 'ref_008',
    clientName: 'Redwood Digital',
    sourceType: 'organic',
    partnerName: '—',
    channel: 'web',
    referredAt: '2026-03-18T09:30:00Z',
    converted: true,
    feeAmount: 0,
    feeStatus: 'voided',
    applicationId: 'app_092',
    fundingAmount: 75000,
  },
  {
    id: 'ref_009',
    clientName: 'Lakefront Industries',
    sourceType: 'broker',
    partnerName: 'FastFund Brokers Inc.',
    channel: 'phone',
    referredAt: '2026-03-29T10:00:00Z',
    converted: false,
    feeAmount: 0,
    feeStatus: 'pending',
  },
  {
    id: 'ref_010',
    clientName: 'Copper Ridge Holdings',
    sourceType: 'affiliate',
    partnerName: 'Atlas Referral Network',
    channel: 'social',
    referredAt: '2026-03-30T14:00:00Z',
    converted: false,
    feeAmount: 1100,
    feeStatus: 'disputed',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOURCE_TYPE_CONFIG: Record<SourceType, { label: string; badgeClass: string }> = {
  affiliate: { label: 'Affiliate',  badgeClass: 'bg-purple-900 text-purple-300 border-purple-700' },
  broker:    { label: 'Broker',     badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  direct:    { label: 'Direct',     badgeClass: 'bg-gray-800 text-gray-300 border-gray-600' },
  organic:   { label: 'Organic',    badgeClass: 'bg-teal-900 text-teal-300 border-teal-700' },
  partner:   { label: 'Partner',    badgeClass: 'bg-amber-900 text-amber-300 border-amber-700' },
};

const CHANNEL_CONFIG: Record<Channel, { label: string }> = {
  email:  { label: 'Email' },
  web:    { label: 'Web' },
  phone:  { label: 'Phone' },
  social: { label: 'Social' },
  event:  { label: 'Event' },
  api:    { label: 'API' },
};

const FEE_STATUS_CONFIG: Record<FeeStatus, { label: string; badgeClass: string }> = {
  pending:  { label: 'Pending',  badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  approved: { label: 'Approved', badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  paid:     { label: 'Paid',     badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  disputed: { label: 'Disputed', badgeClass: 'bg-red-900 text-red-300 border-red-700' },
  voided:   { label: 'Voided',   badgeClass: 'bg-gray-800 text-gray-500 border-gray-600' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatCurrency(n: number): string {
  if (n === 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<ReferralRow[]>(PLACEHOLDER_REFERRALS);
  const [loading, setLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceType | ''>('');
  const [feeStatusFilter, setFeeStatusFilter] = useState<FeeStatus | ''>('');
  const [channelFilter, setChannelFilter] = useState<Channel | ''>('');
  const [search, setSearch] = useState('');
  const [showAgreementModal, setShowAgreementModal] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<{ referrals: ReferralRow[] }>('/referrals');
        if (res.success && res.data?.referrals) setReferrals(res.data.referrals);
      } catch { /* placeholder */ }
      finally { setLoading(false); }
    })();
  }, []);

  const displayed = referrals.filter((r) => {
    const matchSource = !sourceFilter || r.sourceType === sourceFilter;
    const matchFeeStatus = !feeStatusFilter || r.feeStatus === feeStatusFilter;
    const matchChannel = !channelFilter || r.channel === channelFilter;
    const matchSearch =
      !search ||
      r.clientName.toLowerCase().includes(search.toLowerCase()) ||
      r.partnerName.toLowerCase().includes(search.toLowerCase());
    return matchSource && matchFeeStatus && matchChannel && matchSearch;
  });

  // Analytics
  const totalReferrals = referrals.length;
  const converted = referrals.filter((r) => r.converted);
  const conversionRate = totalReferrals > 0 ? Math.round((converted.length / totalReferrals) * 100) : 0;
  const totalFeesPaid = referrals
    .filter((r) => r.feeStatus === 'paid')
    .reduce((s, r) => s + r.feeAmount, 0);
  const pendingFees = referrals
    .filter((r) => r.feeStatus === 'pending' || r.feeStatus === 'approved')
    .reduce((s, r) => s + r.feeAmount, 0);

  const SOURCE_TYPES: SourceType[] = ['affiliate', 'broker', 'direct', 'organic', 'partner'];
  const FEE_STATUSES: FeeStatus[] = ['pending', 'approved', 'paid', 'disputed', 'voided'];
  const CHANNELS: Channel[] = ['email', 'web', 'phone', 'social', 'event', 'api'];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Referral & Affiliate Tracking</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalReferrals} referrals · {converted.length} converted
          </p>
        </div>
        <button
          onClick={() => setShowAgreementModal(true)}
          className="px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors"
        >
          Generate Agreement
        </button>
      </div>

      {/* Analytics cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Referrals</p>
          <p className="text-4xl font-black text-gray-100">{totalReferrals}</p>
          <p className="text-xs text-gray-500 mt-1">{converted.length} converted</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Conversion Rate</p>
          <p className={`text-4xl font-black ${conversionRate >= 60 ? 'text-green-400' : conversionRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
            {conversionRate}%
          </p>
          <p className="text-xs text-gray-500 mt-1">of all referrals</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Fees Paid</p>
          <p className="text-2xl font-black text-yellow-400">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalFeesPaid)}
          </p>
          <p className="text-xs text-gray-500 mt-1">settled referral fees</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Pending Fees</p>
          <p className={`text-2xl font-black ${pendingFees > 0 ? 'text-orange-400' : 'text-gray-400'}`}>
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(pendingFees)}
          </p>
          <p className="text-xs text-gray-500 mt-1">pending + approved</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Search client or partner…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500"
        />

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceType | '')}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
        >
          <option value="">All Source Types</option>
          {SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>{SOURCE_TYPE_CONFIG[t].label}</option>
          ))}
        </select>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as Channel | '')}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
        >
          <option value="">All Channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>{CHANNEL_CONFIG[c].label}</option>
          ))}
        </select>

        <select
          value={feeStatusFilter}
          onChange={(e) => setFeeStatusFilter(e.target.value as FeeStatus | '')}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
        >
          <option value="">All Fee Statuses</option>
          {FEE_STATUSES.map((s) => (
            <option key={s} value={s}>{FEE_STATUS_CONFIG[s].label}</option>
          ))}
        </select>

        {(search || sourceFilter || channelFilter || feeStatusFilter) && (
          <button
            onClick={() => { setSearch(''); setSourceFilter(''); setChannelFilter(''); setFeeStatusFilter(''); }}
            className="px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Attribution table */}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-semibold">Client</th>
              <th className="text-left px-4 py-3 font-semibold">Source Type</th>
              <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Partner</th>
              <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Channel</th>
              <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Referred</th>
              <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Converted</th>
              <th className="text-right px-4 py-3 font-semibold">Fee Amount</th>
              <th className="text-left px-4 py-3 font-semibold">Fee Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-500">Loading…</td>
              </tr>
            )}
            {!loading && displayed.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-gray-500">No referrals match your filters.</td>
              </tr>
            )}
            {!loading && displayed.map((r) => (
              <tr key={r.id} className="bg-gray-950 hover:bg-gray-900 transition-colors group">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-100 group-hover:text-white text-sm">{r.clientName}</p>
                  {r.applicationId && (
                    <p className="text-xs text-gray-500">{r.applicationId}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SOURCE_TYPE_CONFIG[r.sourceType].badgeClass}`}>
                    {SOURCE_TYPE_CONFIG[r.sourceType].label}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-300 text-xs hidden md:table-cell">{r.partnerName}</td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                    {CHANNEL_CONFIG[r.channel].label}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">{formatDate(r.referredAt)}</td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className={`text-xs font-semibold ${r.converted ? 'text-green-400' : 'text-gray-500'}`}>
                    {r.converted ? '✓ Yes' : '— No'}
                  </span>
                  {r.converted && r.fundingAmount && (
                    <p className="text-xs text-gray-500">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(r.fundingAmount)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-semibold tabular-nums text-sm ${r.feeAmount > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                    {formatCurrency(r.feeAmount)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${FEE_STATUS_CONFIG[r.feeStatus].badgeClass}`}>
                    {FEE_STATUS_CONFIG[r.feeStatus].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer summary */}
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
        <span>Showing {displayed.length} of {totalReferrals} referrals</span>
        <span className="text-yellow-500 font-semibold">
          Filtered fees: {formatCurrency(displayed.filter((r) => r.feeStatus === 'paid').reduce((s, r) => s + r.feeAmount, 0))} paid
        </span>
      </div>

      {/* Agreement Generation Modal */}
      {showAgreementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Generate Referral Agreement</h2>
              <button
                onClick={() => setShowAgreementModal(false)}
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
                  placeholder="Select or type partner name"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Agreement Type</label>
                <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500">
                  <option>Referral Fee Agreement</option>
                  <option>Affiliate Marketing Agreement</option>
                  <option>Broker Compensation Agreement</option>
                  <option>Co-Marketing Agreement</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Fee Structure</label>
                  <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500">
                    <option>Flat Fee</option>
                    <option>% of Funded Amount</option>
                    <option>Tiered</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Fee Value</label>
                  <input
                    type="text"
                    placeholder="e.g. 2% or $1,500"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Effective Date</label>
                <input
                  type="date"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-500"
                  defaultValue="2026-04-01"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAgreementModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowAgreementModal(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 text-sm font-bold transition-colors"
              >
                Generate PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
