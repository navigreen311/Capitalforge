'use client';

// ============================================================
// /platform/issuers — Issuer Directory & Intelligence
// Issuer table, velocity rules, approval stats, DNA flags,
// expandable detail rows
// ============================================================

import { useState, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────

interface Issuer {
  id: string;
  name: string;
  logo: string;
  velocityRules: string;
  approvalCriteria: string;
  totalApps: number;
  approved: number;
  declined: number;
  pending: number;
  approvalRate: number;
  avgCreditLimit: number;
  doNotApply: boolean;
  doNotApplyReason: string | null;
}

// ── Formatting helpers ───────────────────────────────────────

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ── Approval Rate Badge ──────────────────────────────────────

function ApprovalBadge({ rate }: { rate: number }) {
  const color = rate >= 70 ? 'text-emerald-400 bg-emerald-900/40' : rate >= 60 ? 'text-yellow-400 bg-yellow-900/40' : 'text-red-400 bg-red-900/40';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {rate.toFixed(1)}%
    </span>
  );
}

// ── Expandable Issuer Row ────────────────────────────────────

function IssuerRow({ issuer }: { issuer: Issuer }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-t border-gray-800 hover:bg-gray-800/40 transition cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">{issuer.logo}</span>
            <div>
              <span className="text-gray-200 font-medium">{issuer.name}</span>
              {issuer.doNotApply && (
                <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/60 text-red-300 uppercase">
                  DNA
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-right"><ApprovalBadge rate={issuer.approvalRate} /></td>
        <td className="px-4 py-3 text-right text-gray-400">{issuer.totalApps}</td>
        <td className="px-4 py-3 text-right text-emerald-400">{issuer.approved}</td>
        <td className="px-4 py-3 text-right text-red-400">{issuer.declined}</td>
        <td className="px-4 py-3 text-right text-gray-300">{money(issuer.avgCreditLimit)}</td>
        <td className="px-4 py-3 text-center">
          <span className={`text-gray-500 transition-transform inline-block ${expanded ? 'rotate-180' : ''}`}>
            &#9662;
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-900/40">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-1">Velocity Rules</h4>
                <p className="text-gray-300">{issuer.velocityRules}</p>
              </div>
              <div>
                <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-1">Approval Criteria</h4>
                <p className="text-gray-300">{issuer.approvalCriteria}</p>
              </div>
              <div>
                <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-1">Application Stats</h4>
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>Total: <strong className="text-white">{issuer.totalApps}</strong></span>
                  <span>Approved: <strong className="text-emerald-400">{issuer.approved}</strong></span>
                  <span>Declined: <strong className="text-red-400">{issuer.declined}</strong></span>
                  <span>Pending: <strong className="text-yellow-400">{issuer.pending}</strong></span>
                </div>
              </div>
              {issuer.doNotApply && issuer.doNotApplyReason && (
                <div>
                  <h4 className="text-xs text-red-400 uppercase tracking-wider mb-1">Do Not Apply Reason</h4>
                  <p className="text-red-300 text-sm">{issuer.doNotApplyReason}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function PlatformIssuersPage() {
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDnaOnly, setShowDnaOnly] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/platform/issuers');
        const json = await res.json();
        if (json.success) setIssuers(json.data);
      } catch {
        // fallback
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = showDnaOnly ? issuers.filter(i => i.doNotApply) : issuers;
  const dnaCount = issuers.filter(i => i.doNotApply).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <div className="animate-pulse text-gray-500 text-sm">Loading issuer data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-200 px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Issuer Directory</h1>
          <p className="text-sm text-gray-500 mt-1">Velocity rules, approval criteria, and application history by issuer</p>
        </div>
        <div className="flex items-center gap-3">
          {dnaCount > 0 && (
            <button
              onClick={() => setShowDnaOnly(!showDnaOnly)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                showDnaOnly
                  ? 'bg-red-900/40 border-red-700 text-red-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              {showDnaOnly ? 'Show All' : `DNA Flags (${dnaCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
          <p className="text-xs text-gray-500 uppercase">Total Issuers</p>
          <p className="text-2xl font-bold text-white mt-1">{issuers.length}</p>
        </div>
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
          <p className="text-xs text-gray-500 uppercase">Total Applications</p>
          <p className="text-2xl font-bold text-white mt-1">
            {issuers.reduce((s, i) => s + i.totalApps, 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-[#C9A84C]/40 bg-[#C9A84C]/5 p-4">
          <p className="text-xs text-gray-500 uppercase">Avg Approval Rate</p>
          <p className="text-2xl font-bold text-[#C9A84C] mt-1">
            {issuers.length > 0
              ? (issuers.reduce((s, i) => s + i.approvalRate, 0) / issuers.length).toFixed(1)
              : '0'}%
          </p>
        </div>
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
          <p className="text-xs text-gray-500 uppercase">DNA Flags</p>
          <p className={`text-2xl font-bold mt-1 ${dnaCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {dnaCount}
          </p>
        </div>
      </div>

      {/* Issuer Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-700/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900/80 text-gray-400 text-xs uppercase">
              <th className="text-left px-4 py-3">Issuer</th>
              <th className="text-right px-4 py-3">Approval Rate</th>
              <th className="text-right px-4 py-3">Total Apps</th>
              <th className="text-right px-4 py-3">Approved</th>
              <th className="text-right px-4 py-3">Declined</th>
              <th className="text-right px-4 py-3">Avg Limit</th>
              <th className="text-center px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((issuer) => (
              <IssuerRow key={issuer.id} issuer={issuer} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">No issuers match the current filter.</div>
        )}
      </div>
    </div>
  );
}
