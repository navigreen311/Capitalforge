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
  roundNumber: number;
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
    roundNumber: 2,
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
    roundNumber: 1,
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
    roundNumber: 1,
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
    roundNumber: 1,
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
  planning:    { label: 'Planning',    badgeClass: 'bg-gray-100 text-gray-600 border-gray-300', dotClass: 'bg-gray-400' },
  in_progress: { label: 'In Progress', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200', dotClass: 'bg-blue-500' },
  completed:   { label: 'Completed',   badgeClass: 'bg-green-50 text-green-700 border-green-200', dotClass: 'bg-green-500' },
  cancelled:   { label: 'Cancelled',   badgeClass: 'bg-red-50 text-red-700 border-red-200', dotClass: 'bg-red-500' },
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

/** Left-border color based on urgency / status. */
function urgencyBorderClass(round: FundingRound): string {
  const hasUrgentApr = round.applications.some((a) => daysUntil(a.aprExpiresAt) <= 15);
  if (hasUrgentApr) return 'border-l-red-500';

  const hasWarningApr = round.applications.some((a) => daysUntil(a.aprExpiresAt) <= 60);
  if (hasWarningApr) return 'border-l-amber-400';

  if (round.status === 'in_progress') return 'border-l-blue-500';
  if (round.status === 'completed') return 'border-l-green-500';
  if (round.status === 'planning') return 'border-l-gray-300';
  return 'border-l-gray-300';
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function CompletionBar({ obtained, target }: { obtained: number; target: number }) {
  const pct = target > 0 ? Math.min((obtained / target) * 100, 100) : 0;
  const color = pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : pct >= 30 ? 'bg-yellow-500' : 'bg-gray-300';

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">
          {formatCurrency(obtained)} <span className="text-gray-400">of</span> {formatCurrency(target)}
        </span>
        <span className="font-semibold text-gray-700">{Math.round(pct)}%</span>
      </div>
      <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
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
      <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">APR Expiry Alerts</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Funding Rounds</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {rounds.filter((r) => r.status === 'in_progress').length} active ·{' '}
            <span className="text-green-600 font-semibold">{formatCurrency(totalObtained)}</span> total obtained
            {expiringAprs.length > 0 && (
              <span className="ml-2 text-red-600 font-semibold">
                ⚠ {expiringAprs.length} APR{expiringAprs.length !== 1 ? 's' : ''} expiring &lt;30d
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RoundStatus | '')}
            className="cf-input"
          >
            <option value="">All Rounds</option>
            <option value="planning">Planning</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={() => router.push('/funding-rounds/new')}
            className="btn btn-primary whitespace-nowrap"
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
                className={`rounded-xl border border-surface-border bg-white shadow-card hover:shadow-card-hover p-5 transition-shadow cursor-pointer border-l-4 ${urgencyBorderClass(round)}`}
                onClick={() => router.push(`/funding-rounds/${round.id}`)}
              >
                {/* Card header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-bold text-gray-900 text-base">
                      Round {round.roundNumber} &mdash; {round.businessName}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Advisor: {round.advisorName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Teal round badge */}
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                      R{round.roundNumber}
                    </span>
                    {/* Status badge */}
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${cfg.badgeClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
                      {cfg.label}
                    </span>
                  </div>
                </div>

                {/* Completion bar */}
                <div className="mb-4">
                  <CompletionBar obtained={round.obtainedAmount} target={round.targetAmount} />
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div>
                    <p className="text-gray-400 mb-0.5">Started</p>
                    <p className="text-gray-700">{formatDate(round.startedAt)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-0.5">Target Close</p>
                    <p className={`font-semibold ${daysLeft < 14 && round.status === 'in_progress' ? 'text-red-600' : 'text-gray-700'}`}>
                      {formatDate(round.targetCloseAt)}
                      {round.status === 'in_progress' && (
                        <span className="text-gray-400 font-normal ml-1">({daysLeft}d)</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-0.5">Applications</p>
                    <p className="text-gray-700">{round.applications.length}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 mb-0.5">Total Target</p>
                    <p className="text-gray-700 font-semibold">{formatCurrency(round.targetAmount)}</p>
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
