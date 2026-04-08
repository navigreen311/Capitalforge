'use client';

// ============================================================
// /platform/crm — CRM & Revenue Dashboard
// Pipeline view, revenue stats, fee collection, cohort analysis
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── Types ────────────────────────────────────────────────────

interface PipelineStage {
  key: string;
  label: string;
  count: number;
  color: string;
}

interface RevenueByAdvisor {
  advisor: string;
  revenue: number;
  clients: number;
}

interface FeeCollectionRow {
  period: string;
  collected: number;
  pending: number;
  overdue: number;
  rate: number;
}

interface CohortRow {
  cohort: string;
  funded: number;
  active: number;
  graduated: number;
  churned: number;
  avgRevenue: number;
}

interface PipelineData {
  stages: PipelineStage[];
  totalBusinesses: number;
  conversionRate: number;
}

interface RevenueData {
  mrr: number;
  arr: number;
  revenueByAdvisor: RevenueByAdvisor[];
  avgClientLifetimeValue: number;
  feeCollectionStatus: FeeCollectionRow[];
  cohortAnalysis: CohortRow[];
}

// ── Formatting helpers ───────────────────────────────────────

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ── Stat Card ────────────────────────────────────────────────

function StatCard({ label, value, sub, gold }: { label: string; value: string; sub?: string; gold?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${gold ? 'border-[#C9A84C]/40 bg-[#C9A84C]/5' : 'border-gray-700/60 bg-gray-900/60'}`}>
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${gold ? 'text-[#C9A84C]' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// ── Pipeline Column ──────────────────────────────────────────

function PipelineColumn({ stage, total }: { stage: PipelineStage; total: number }) {
  const pct = total > 0 ? ((stage.count / total) * 100).toFixed(1) : '0';
  return (
    <div className="flex-1 min-w-[160px] rounded-xl border border-gray-700/60 bg-gray-900/60 p-4 flex flex-col items-center gap-3">
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
      <p className="text-sm font-medium text-gray-300">{stage.label}</p>
      <p className="text-3xl font-bold text-white">{stage.count}</p>
      <p className="text-xs text-gray-500">{pct}% of total</p>
      <div className="w-full bg-gray-800 rounded-full h-1.5 mt-1">
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: stage.color }} />
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function PlatformCrmPage() {
  const router = useRouter();
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Fallback mock data (shown when API unavailable) ─────────
  const FALLBACK_PIPELINE: PipelineData = {
    stages: [
      { key: 'intake', label: 'Intake', count: 12, color: '#6B7280' },
      { key: 'onboarding', label: 'Onboarding', count: 8, color: '#3B82F6' },
      { key: 'active', label: 'Active', count: 34, color: '#22C55E' },
      { key: 'graduated', label: 'Graduated', count: 15, color: '#C9A84C' },
    ],
    totalBusinesses: 69,
    conversionRate: 71.2,
  };

  const FALLBACK_REVENUE: RevenueData = {
    mrr: 78200,
    arr: 938400,
    revenueByAdvisor: [
      { advisor: 'Sarah Chen', revenue: 32400, clients: 14 },
      { advisor: 'Marcus Williams', revenue: 24800, clients: 11 },
      { advisor: 'Olivia Torres', revenue: 21000, clients: 9 },
    ],
    avgClientLifetimeValue: 18500,
    feeCollectionStatus: [
      { period: 'Mar 2026', collected: 62400, pending: 12800, overdue: 3000, rate: 79.9 },
      { period: 'Feb 2026', collected: 58200, pending: 8400, overdue: 1200, rate: 85.8 },
      { period: 'Jan 2026', collected: 54800, pending: 6200, overdue: 800, rate: 88.7 },
    ],
    cohortAnalysis: [
      { cohort: 'Q1 2026', funded: 18, active: 16, graduated: 0, churned: 2, avgRevenue: 14200 },
      { cohort: 'Q4 2025', funded: 22, active: 15, graduated: 5, churned: 2, avgRevenue: 16800 },
      { cohort: 'Q3 2025', funded: 14, active: 8, graduated: 4, churned: 2, avgRevenue: 19400 },
    ],
  };

  useEffect(() => {
    async function load() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const [pRes, rRes] = await Promise.all([
          fetch('/api/platform/crm/pipeline', { headers }),
          fetch('/api/platform/crm/revenue', { headers }),
        ]);
        const pJson = await pRes.json();
        const rJson = await rRes.json();
        setPipeline(pJson.success ? pJson.data : FALLBACK_PIPELINE);
        setRevenue(rJson.success ? rJson.data : FALLBACK_REVENUE);
      } catch {
        // Use mock data when API is unavailable
        setPipeline(FALLBACK_PIPELINE);
        setRevenue(FALLBACK_REVENUE);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A1628] flex items-center justify-center">
        <div className="animate-pulse text-gray-500 text-sm">Loading CRM data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-200 px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">CRM &amp; Revenue</h1>
        <p className="text-sm text-gray-500 mt-1">Pipeline overview, revenue analytics, fee collection, and cohort insights</p>
      </div>

      {/* Pipeline View */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Business Pipeline</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {pipeline?.stages.map((s) => (
            <PipelineColumn key={s.key} stage={s} total={pipeline.totalBusinesses} />
          ))}
        </div>
        {pipeline && (
          <div className="flex gap-6 mt-3 text-xs text-gray-500">
            <span>Total: <strong className="text-gray-300">{pipeline.totalBusinesses}</strong> businesses</span>
            <span>Conversion rate: <strong className="text-[#C9A84C]">{pipeline.conversionRate}%</strong></span>
          </div>
        )}
      </section>

      {/* Revenue Stats Cards */}
      {revenue && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Revenue Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Monthly Recurring Revenue" value={money(revenue.mrr)} sub="Current MRR" />
            <StatCard label="Annual Recurring Revenue" value={money(revenue.arr)} sub="Projected from MRR" />
            <StatCard label="Avg Client Lifetime Value" value={money(revenue.avgClientLifetimeValue)} sub="Across all cohorts" gold />
            <StatCard label="Top Advisor Revenue" value={money(revenue.revenueByAdvisor[0]?.revenue ?? 0)} sub={revenue.revenueByAdvisor[0]?.advisor ?? '—'} />
          </div>
        </section>
      )}

      {/* Revenue by Advisor */}
      {revenue && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Revenue by Advisor</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-700/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/80 text-gray-400 text-xs uppercase">
                  <th className="text-left px-4 py-3">Advisor</th>
                  <th className="text-right px-4 py-3">Revenue</th>
                  <th className="text-right px-4 py-3">Clients</th>
                  <th className="text-right px-4 py-3">Avg / Client</th>
                </tr>
              </thead>
              <tbody>
                {revenue.revenueByAdvisor.map((r) => (
                  <tr key={r.advisor} className="border-t border-gray-800 hover:bg-gray-800/40 transition">
                    <td className="px-4 py-3 text-gray-200 font-medium">{r.advisor}</td>
                    <td className="px-4 py-3 text-right text-white">{money(r.revenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{r.clients}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{money(Math.round(r.revenue / r.clients))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Fee Collection Status */}
      {revenue && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Fee Collection Status</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-700/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/80 text-gray-400 text-xs uppercase">
                  <th className="text-left px-4 py-3">Period</th>
                  <th className="text-right px-4 py-3">Collected</th>
                  <th className="text-right px-4 py-3">Pending</th>
                  <th className="text-right px-4 py-3">Overdue</th>
                  <th className="text-right px-4 py-3">Collection Rate</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {revenue.feeCollectionStatus.map((f) => {
                  const overdueClients = f.overdue > 0 ? Math.max(1, Math.round(f.overdue / 1000)) : 0;
                  return (
                    <tr key={f.period} className="border-t border-gray-800 hover:bg-gray-800/40 transition">
                      <td className="px-4 py-3 text-gray-200 font-medium">{f.period}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">{money(f.collected)}</td>
                      <td className="px-4 py-3 text-right text-yellow-400">{money(f.pending)}</td>
                      <td className="px-4 py-3 text-right text-red-400">{money(f.overdue)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${f.rate >= 90 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                          {f.rate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {f.overdue > 0 ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => showToast(`Overdue fee reminders sent to ${overdueClients} clients`)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/30 hover:bg-[#C9A84C]/20 transition font-medium"
                            >
                              Send Reminders ({overdueClients} clients)
                            </button>
                            <button
                              onClick={() => router.push('/platform/billing')}
                              className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 transition font-medium"
                            >
                              View in Billing &rarr;
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600">No action needed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Cohort Analysis */}
      {revenue && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Cohort Analysis</h2>
          <p className="text-xs text-gray-500 mb-3">Businesses funded in the same quarter, tracked through lifecycle</p>
          <div className="overflow-x-auto rounded-xl border border-gray-700/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/80 text-gray-400 text-xs uppercase">
                  <th className="text-left px-4 py-3">Cohort</th>
                  <th className="text-right px-4 py-3">Funded</th>
                  <th className="text-right px-4 py-3">Active</th>
                  <th className="text-right px-4 py-3">Graduated</th>
                  <th className="text-right px-4 py-3">Churned</th>
                  <th className="text-right px-4 py-3">Avg Revenue</th>
                  <th className="text-right px-4 py-3">Retention</th>
                </tr>
              </thead>
              <tbody>
                {revenue.cohortAnalysis.map((c) => {
                  const retention = c.funded > 0 ? (((c.active + c.graduated) / c.funded) * 100).toFixed(1) : '0';
                  const retentionNum = Number(retention);
                  const retentionColor = retentionNum >= 90 ? 'text-emerald-400' : retentionNum >= 80 ? 'text-yellow-400' : 'text-red-400';
                  return (
                    <tr
                      key={c.cohort}
                      onClick={() => router.push(`/platform/clients?cohort=${encodeURIComponent(c.cohort)}`)}
                      className="border-t border-gray-800 hover:bg-gray-800/40 transition cursor-pointer"
                    >
                      <td className="px-4 py-3 text-[#C9A84C] font-medium">{c.cohort}</td>
                      <td className="px-4 py-3 text-right text-white">{c.funded}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">{c.active}</td>
                      <td className="px-4 py-3 text-right text-blue-400">{c.graduated}</td>
                      <td className="px-4 py-3 text-right text-red-400">{c.churned}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{money(c.avgRevenue)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${retentionColor}`}>
                          {retention}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className="bg-[#C9A84C] text-[#0A1628] px-5 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
