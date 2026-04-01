'use client';

// ============================================================
// /funding-rounds — Funding rounds overview
// Active rounds with APR countdown timers, completion %,
// credit obtained vs target, expiry alert badges.
// ============================================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fundingRoundsApi } from '../../lib/api-client';
import AprCountdown from '../../components/modules/apr-countdown';
import type { RoundStatus } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FundingApplication {
  id: string;
  cardProduct: string;
  issuer: string;
  approvedLimit: number;
  aprExpiresAt: string;
  regularApr: number;
  balance: number;
}

interface FundingRound {
  id: string;
  businessId: string;
  businessName: string;
  status: RoundStatus;
  targetAmount: number;
  obtainedAmount: number;
  startedAt: string;
  targetCloseAt: string;
  applications: FundingApplication[];
  advisorName: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_ROUNDS: FundingRound[] = [
  {
    id: 'fr_001',
    businessId: 'biz_001',
    businessName: 'Apex Ventures LLC',
    status: 'in_progress',
    targetAmount: 150000,
    obtainedAmount: 105000,
    startedAt: '2026-01-15T00:00:00Z',
    targetCloseAt: '2026-04-15T00:00:00Z',
    advisorName: 'Sarah Chen',
    notes: 'Phase 2 stack — targeting Chase + Amex',
    applications: [
      { id: 'app_004', cardProduct: 'Ink Business Preferred', issuer: 'Chase', approvedLimit: 45000, aprExpiresAt: '2026-05-20T00:00:00Z', regularApr: 20.99, balance: 38000 },
      { id: 'app_008', cardProduct: 'Business Altitude Connect', issuer: 'US Bank', approvedLimit: 60000, aprExpiresAt: '2026-06-30T00:00:00Z', regularApr: 21.49, balance: 55000 },
    ],
  },
  {
    id: 'fr_002',
    businessId: 'biz_004',
    businessName: 'Summit Capital Group',
    status: 'in_progress',
    targetAmount: 200000,
    obtainedAmount: 60000,
    startedAt: '2026-02-01T00:00:00Z',
    targetCloseAt: '2026-05-01T00:00:00Z',
    advisorName: 'James Okafor',
    applications: [
      { id: 'app_009', cardProduct: 'Business Gold', issuer: 'Amex', approvedLimit: 60000, aprExpiresAt: '2026-04-10T00:00:00Z', regularApr: 18.49, balance: 52000 },
    ],
  },
  {
    id: 'fr_003',
    businessId: 'biz_007',
    businessName: 'Pinnacle Freight Corp',
    status: 'completed',
    targetAmount: 120000,
    obtainedAmount: 120000,
    startedAt: '2025-10-01T00:00:00Z',
    targetCloseAt: '2026-01-01T00:00:00Z',
    advisorName: 'Sarah Chen',
    applications: [
      { id: 'app_010', cardProduct: 'Ink Business Cash', issuer: 'Chase', approvedLimit: 50000, aprExpiresAt: '2025-12-31T00:00:00Z', regularApr: 19.99, balance: 0 },
      { id: 'app_011', cardProduct: 'Spark Cash Plus', issuer: 'Capital One', approvedLimit: 70000, aprExpiresAt: '2026-01-15T00:00:00Z', regularApr: 22.49, balance: 0 },
    ],
  },
  {
    id: 'fr_004',
    businessId: 'biz_006',
    businessName: 'Crestline Medical LLC',
    status: 'planning',
    targetAmount: 80000,
    obtainedAmount: 0,
    startedAt: '2026-03-25T00:00:00Z',
    targetCloseAt: '2026-06-30T00:00:00Z',
    advisorName: 'James Okafor',
    applications: [],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROUND_STATUS_CONFIG: Record<RoundStatus, { label: string; badgeClass: string; dotClass: string }> = {
  planning:    { label: 'Planning',    badgeClass: 'bg-gray-800 text-gray-300 border-gray-600', dotClass: 'bg-gray-400' },
  in_progress: { label: 'In Progress', badgeClass: 'bg-blue-900 text-blue-300 border-blue-700', dotClass: 'bg-blue-400' },
  completed:   { label: 'Completed',   badgeClass: 'bg-green-900 text-green-300 border-green-700', dotClass: 'bg-green-400' },
  cancelled:   { label: 'Cancelled',   badgeClass: 'bg-red-900 text-red-300 border-red-700', dotClass: 'bg-red-400' },
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function daysUntil(isoDate: string): number {
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function CompletionBar({ obtained, target }: { obtained: number; target: number }) {
  const pct = target > 0 ? Math.min((obtained / target) * 100, 100) : 0;
  const color = pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : pct >= 30 ? 'bg-yellow-500' : 'bg-gray-600';

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">
          {formatCurrency(obtained)} <span className="text-gray-600">of</span> {formatCurrency(target)}
        </span>
        <span className="font-semibold text-gray-200">{Math.round(pct)}%</span>
      </div>
      <div className="w-full h-2.5 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%`, transition: 'width 0.5s ease' }}
        />
      </div>
    </div>
  );
}

function AprExpiryAlerts({ apps }: { apps: FundingApplication[] }) {
  const urgent = apps.filter((a) => daysUntil(a.aprExpiresAt) < 60);
  if (!urgent.length) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wide">APR Expiry Alerts</p>
      {urgent.map((a) => (
        <AprCountdown
          key={a.id}
          cardProduct={a.cardProduct}
          issuer={a.issuer}
          expiresAt={a.aprExpiresAt}
          regularApr={a.regularApr}
          balance={a.balance}
          compact
          className="w-full"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FundingRoundsPage() {
  const router = useRouter();
  const [rounds, setRounds] = useState<FundingRound[]>(PLACEHOLDER_ROUNDS);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RoundStatus | ''>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fundingRoundsApi.list({ status: statusFilter || undefined });
        if (res.success && Array.isArray(res.data)) {
          setRounds(res.data as FundingRound[]);
        }
      } catch { /* placeholder */ }
      finally { setLoading(false); }
    })();
  }, [statusFilter]);

  const displayed = rounds.filter((r) => !statusFilter || r.status === statusFilter);

  const totalObtained = rounds
    .filter((r) => r.status === 'in_progress' || r.status === 'completed')
    .reduce((s, r) => s + r.obtainedAmount, 0);

  const expiringAprs = rounds
    .flatMap((r) => r.applications)
    .filter((a) => daysUntil(a.aprExpiresAt) < 30);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Funding Rounds</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {rounds.filter((r) => r.status === 'in_progress').length} active ·{' '}
            <span className="text-green-400 font-semibold">{formatCurrency(totalObtained)}</span> total obtained
            {expiringAprs.length > 0 && (
              <span className="ml-2 text-red-400 font-semibold">
                ⚠ {expiringAprs.length} APR{expiringAprs.length !== 1 ? 's' : ''} expiring &lt;30d
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RoundStatus | '')}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Rounds</option>
            <option value="planning">Planning</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={() => router.push('/funding-rounds/new')}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors whitespace-nowrap"
          >
            + New Round
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-500 text-center py-12">Loading rounds…</p>}

      {/* Round cards */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {displayed.map((round) => {
            const cfg = ROUND_STATUS_CONFIG[round.status];
            const daysLeft = daysUntil(round.targetCloseAt);

            return (
              <div
                key={round.id}
                className="rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-700 transition-colors cursor-pointer"
                onClick={() => router.push(`/funding-rounds/${round.id}`)}
              >
                {/* Card header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-bold text-gray-100 text-base">{round.businessName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Advisor: {round.advisorName}</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${cfg.badgeClass}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
                    {cfg.label}
                  </span>
                </div>

                {/* Completion bar */}
                <div className="mb-4">
                  <CompletionBar obtained={round.obtainedAmount} target={round.targetAmount} />
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div>
                    <p className="text-gray-500 mb-0.5">Started</p>
                    <p className="text-gray-300">{formatDate(round.startedAt)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-0.5">Target Close</p>
                    <p className={`font-semibold ${daysLeft < 14 && round.status === 'in_progress' ? 'text-red-400' : 'text-gray-300'}`}>
                      {formatDate(round.targetCloseAt)}
                      {round.status === 'in_progress' && (
                        <span className="text-gray-500 font-normal ml-1">({daysLeft}d)</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-0.5">Applications</p>
                    <p className="text-gray-300">{round.applications.length}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-0.5">Total Target</p>
                    <p className="text-gray-300 font-semibold">{formatCurrency(round.targetAmount)}</p>
                  </div>
                </div>

                {/* Notes */}
                {round.notes && (
                  <p className="text-xs text-gray-500 italic mb-3">{round.notes}</p>
                )}

                {/* APR alerts */}
                <AprExpiryAlerts apps={round.applications} />
              </div>
            );
          })}

          {displayed.length === 0 && (
            <div className="lg:col-span-2 text-center py-12 text-gray-500">
              No funding rounds match the selected filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
