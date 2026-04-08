'use client';

// ============================================================
// /platform/referrals — Referral Link Generator & Tracking
// Referral link per advisor, tracking table, commission tiers,
// leaderboard
// ============================================================

import { useState, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────

interface Referral {
  id: string;
  advisorId: string;
  advisorName: string;
  referralLink: string;
  source: string;
  referredDate: string;
  status: 'pending' | 'converted' | 'expired' | 'active';
  conversionDate?: string;
  commission: number;
}

interface CommissionTier {
  tier: string;
  rate: string;
  minReferrals: number;
  maxReferrals: number | null;
}

interface LeaderboardEntry {
  advisorName: string;
  totalReferrals: number;
  conversions: number;
  totalCommission: number;
}

// ── Formatting helpers ───────────────────────────────────────

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function statusBadge(status: Referral['status']) {
  const map: Record<string, string> = {
    converted: 'bg-emerald-900/40 text-emerald-400',
    pending: 'bg-yellow-900/40 text-yellow-400',
    active: 'bg-blue-900/40 text-blue-400',
    expired: 'bg-gray-800 text-gray-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${map[status] ?? ''}`}>
      {status}
    </span>
  );
}

// ── Fallback mock data ──────────────────────────────────────

const FALLBACK_REFERRALS: Referral[] = [
  { id: 'ref_001', advisorId: 'adv_001', advisorName: 'Sarah Chen', referralLink: 'https://capitalforge.io/r/sarah-chen', source: 'LinkedIn', referredDate: '2026-03-15', status: 'converted', conversionDate: '2026-03-22', commission: 1500 },
  { id: 'ref_002', advisorId: 'adv_002', advisorName: 'Marcus Williams', referralLink: 'https://capitalforge.io/r/marcus-w', source: 'Email Campaign', referredDate: '2026-03-18', status: 'pending', commission: 0 },
  { id: 'ref_003', advisorId: 'adv_001', advisorName: 'Sarah Chen', referralLink: 'https://capitalforge.io/r/sarah-chen', source: 'Conference', referredDate: '2026-03-20', status: 'active', commission: 0 },
  { id: 'ref_004', advisorId: 'adv_003', advisorName: 'Olivia Torres', referralLink: 'https://capitalforge.io/r/olivia-t', source: 'Website', referredDate: '2026-02-28', status: 'converted', conversionDate: '2026-03-10', commission: 1200 },
  { id: 'ref_005', advisorId: 'adv_002', advisorName: 'Marcus Williams', referralLink: 'https://capitalforge.io/r/marcus-w', source: 'Partner', referredDate: '2026-03-25', status: 'pending', commission: 0 },
];

const FALLBACK_TIERS: CommissionTier[] = [
  { tier: 'Bronze', rate: '10%', minReferrals: 1, maxReferrals: 5 },
  { tier: 'Silver', rate: '15%', minReferrals: 6, maxReferrals: 15 },
  { tier: 'Gold', rate: '20%', minReferrals: 16, maxReferrals: null },
];

const FALLBACK_LEADERBOARD: LeaderboardEntry[] = [
  { advisorName: 'Sarah Chen', totalReferrals: 12, conversions: 8, totalCommission: 9600 },
  { advisorName: 'Olivia Torres', totalReferrals: 9, conversions: 6, totalCommission: 7200 },
  { advisorName: 'Marcus Williams', totalReferrals: 7, conversions: 4, totalCommission: 4800 },
];

// ── Toast ────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-emerald-900 border border-emerald-700 text-emerald-200 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in">
      <span className="text-sm">{message}</span>
      <button onClick={onClose} className="text-emerald-400 hover:text-emerald-200 text-lg leading-none">&times;</button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function PlatformReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [commissionTiers, setCommissionTiers] = useState<CommissionTier[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Add referral form state
  const [showForm, setShowForm] = useState(false);
  const [formAdvisor, setFormAdvisor] = useState('');
  const [formSource, setFormSource] = useState('');

  const loadData = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
        const _h: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) _h['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/platform/referrals', { headers: _h });
      const json = await res.json();
      if (json.success && json.data?.referrals) {
        setReferrals(json.data.referrals);
        setCommissionTiers(json.data.commissionStructure || FALLBACK_TIERS);
        setLeaderboard(json.data.leaderboard || FALLBACK_LEADERBOARD);
      } else {
        setReferrals(FALLBACK_REFERRALS);
        setCommissionTiers(FALLBACK_TIERS);
        setLeaderboard(FALLBACK_LEADERBOARD);
      }
    } catch {
      setReferrals(FALLBACK_REFERRALS);
      setCommissionTiers(FALLBACK_TIERS);
      setLeaderboard(FALLBACK_LEADERBOARD);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCopy = async (link: string) => {
    await navigator.clipboard.writeText(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleCreateReferral = async () => {
    if (!formAdvisor.trim() || !formSource.trim()) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
        const _h: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) _h['Authorization'] = `Bearer ${token}`;
        const res = await fetch('/api/platform/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advisorId: 'adv_new', advisorName: formAdvisor, source: formSource }),
      });
      const json = await res.json();
      if (json.success) {
        setReferrals(prev => [...prev, json.data]);
        setShowForm(false);
        setFormAdvisor('');
        setFormSource('');
        setToast('Referral created successfully');
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      // ignore
    }
  };

  // Unique referral links by advisor
  const advisorLinks = Array.from(new Map(referrals.map(r => [r.advisorName, r.referralLink])).entries());

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <div className="animate-pulse text-gray-500 text-sm">Loading referral data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-200 px-6 py-8 max-w-7xl mx-auto space-y-8">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Referral Program</h1>
          <p className="text-sm text-gray-500 mt-1">Generate referral links, track conversions, and view commissions</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-[#C9A84C] text-[#0A1628] rounded-lg text-sm font-semibold hover:bg-[#d4b45c] transition"
        >
          + Add Referral
        </button>
      </div>

      {/* Add Referral Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">New Referral</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Advisor Name</label>
              <input
                value={formAdvisor}
                onChange={(e) => setFormAdvisor(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                placeholder="e.g. Sarah Chen"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Source</label>
              <input
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
                placeholder="e.g. LinkedIn, Webinar"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreateReferral}
              className="px-4 py-2 bg-[#C9A84C] text-[#0A1628] rounded-lg text-sm font-semibold hover:bg-[#d4b45c] transition"
            >
              Create
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm hover:text-white transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Referral Links per Advisor */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Advisor Referral Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {advisorLinks.map(([name, link]) => (
            <div key={name} className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4 flex flex-col gap-2">
              <p className="text-sm font-medium text-gray-200">{name}</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-[#C9A84C] bg-gray-800 px-2 py-1 rounded flex-1 truncate">{link}</code>
                <button
                  onClick={() => handleCopy(link)}
                  className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded hover:border-[#C9A84C] text-gray-400 hover:text-[#C9A84C] transition"
                >
                  {copiedLink === link ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Referral Tracking Table */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Referral Tracking</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-700/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/80 text-gray-400 text-xs uppercase">
                <th className="text-left px-4 py-3">Advisor</th>
                <th className="text-left px-4 py-3">Source</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Conversion</th>
                <th className="text-right px-4 py-3">Commission</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id} className="border-t border-gray-800 hover:bg-gray-800/40 transition">
                  <td className="px-4 py-3 text-gray-200 font-medium">{r.advisorName}</td>
                  <td className="px-4 py-3 text-gray-400">{r.source}</td>
                  <td className="px-4 py-3 text-gray-400">{r.referredDate}</td>
                  <td className="px-4 py-3 text-center">{statusBadge(r.status)}</td>
                  <td className="px-4 py-3 text-gray-400">{r.conversionDate ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-[#C9A84C] font-semibold">
                    {r.commission > 0 ? money(r.commission) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Commission Structure & Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Commission Tiers */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Commission Structure</h2>
          <div className="rounded-xl border border-gray-700/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/80 text-gray-400 text-xs uppercase">
                  <th className="text-left px-4 py-3">Tier</th>
                  <th className="text-right px-4 py-3">Rate</th>
                  <th className="text-right px-4 py-3">Referrals Required</th>
                </tr>
              </thead>
              <tbody>
                {commissionTiers.map((t) => (
                  <tr key={t.tier} className="border-t border-gray-800">
                    <td className="px-4 py-3 text-[#C9A84C] font-medium">{t.tier}</td>
                    <td className="px-4 py-3 text-right text-white font-semibold">{t.rate}</td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {t.maxReferrals ? `${t.minReferrals}–${t.maxReferrals}` : `${t.minReferrals}+`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Leaderboard */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Referral Leaderboard</h2>
          <div className="rounded-xl border border-gray-700/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/80 text-gray-400 text-xs uppercase">
                  <th className="text-center px-4 py-3 w-10">#</th>
                  <th className="text-left px-4 py-3">Advisor</th>
                  <th className="text-right px-4 py-3">Referrals</th>
                  <th className="text-right px-4 py-3">Conversions</th>
                  <th className="text-right px-4 py-3">Commission</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((e, i) => (
                  <tr key={e.advisorName} className="border-t border-gray-800">
                    <td className="px-4 py-3 text-center">
                      <span className={`${i === 0 ? 'text-[#C9A84C]' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-gray-500'} font-bold`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-200 font-medium">{e.advisorName}</td>
                    <td className="px-4 py-3 text-right text-white">{e.totalReferrals}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">{e.conversions}</td>
                    <td className="px-4 py-3 text-right text-[#C9A84C] font-semibold">{money(e.totalCommission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
