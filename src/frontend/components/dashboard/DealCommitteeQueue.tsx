'use client';

// ============================================================
// DealCommitteeQueue — Pending deal committee reviews with SLA
//
// Shows a table of deals awaiting committee decision. Displays
// reviewer avatar stack, consensus status, and SLA countdown.
// Only renders for admin / committee_member roles.
// ============================================================

import { SectionCard } from '../ui/card';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';

// ── Types ───────────────────────────────────────────────────────────────────

interface Reviewer {
  name: string;
  responded: boolean;
}

interface CommitteeDeal {
  id: string;
  client_name: string;
  client_id: string;
  deal_amount: number;
  risk_tier: string;
  submitted_date: string;
  reviewers: Reviewer[];
  consensus: string;
  sla_hours_remaining: number;
  application_id: string | null;
}

interface CommitteeQueueData {
  queue_count: number;
  deals: CommitteeDeal[];
  last_updated: string;
}

interface CfUser {
  role?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['admin', 'committee_member'];

function getUserRole(): string | null {
  try {
    const raw = localStorage.getItem('cf_user');
    if (!raw) return null;
    const user: CfUser = JSON.parse(raw);
    return user.role ?? null;
  } catch {
    return null;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatSla(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m remaining`;
}

function slaColorClass(hours: number): string {
  if (hours < 2) return 'text-red-600 bg-red-50';
  if (hours < 8) return 'text-amber-600 bg-amber-50';
  return 'text-emerald-600 bg-emerald-50';
}

function riskBadgeClass(tier: string): string {
  const t = tier.toLowerCase();
  if (t === 'critical') return 'bg-red-100 text-red-700 border-red-200';
  if (t === 'high') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (t === 'medium') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (t === 'low') return 'bg-green-100 text-green-700 border-green-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Component ───────────────────────────────────────────────────────────────

export function DealCommitteeQueue() {
  // ── Role gate ─────────────────────────────────────────────────
  const role = typeof window !== 'undefined' ? getUserRole() : null;
  const authorized = role !== null && ALLOWED_ROLES.includes(role);

  // ── Data fetch (always called — hooks cannot be conditional) ──
  const { data, isLoading, error, refetch } = useAuthFetch<CommitteeQueueData>(
    '/api/v1/dashboard/committee-queue',
  );

  // ── Role not allowed — render nothing ─────────────────────────
  if (!authorized) return null;

  // ── Loading skeleton ──────────────────────────────────────────
  if (isLoading) {
    return (
      <SectionCard title="Deal Committee Queue">
        <div className="animate-pulse space-y-3 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 w-32 rounded bg-gray-200" />
              <div className="h-4 w-20 rounded bg-gray-200" />
              <div className="h-4 w-16 rounded bg-gray-200" />
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="h-4 w-16 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </SectionCard>
    );
  }

  // ── Error ─────────────────────────────────────────────────────
  if (error) {
    return (
      <SectionCard title="Deal Committee Queue">
        <DashboardErrorState error={error} onRetry={refetch} />
      </SectionCard>
    );
  }

  // ── Empty state ───────────────────────────────────────────────
  if (!data || data.deals.length === 0) {
    return (
      <SectionCard title="Deal Committee Queue">
        <p className="px-4 py-6 text-sm text-gray-500">
          No deals pending review
        </p>
      </SectionCard>
    );
  }

  // ── Table ─────────────────────────────────────────────────────
  return (
    <SectionCard title="Deal Committee Queue" flushBody>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Risk Tier</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Reviewers</th>
              <th className="px-4 py-3">Consensus</th>
              <th className="px-4 py-3">SLA</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.deals.map((deal) => (
              <tr key={deal.id} className="hover:bg-gray-50/50 transition-colors">
                {/* Client name */}
                <td className="px-4 py-3 font-medium text-gray-900">
                  {deal.client_name}
                </td>

                {/* Deal amount */}
                <td className="px-4 py-3 text-gray-700">
                  {formatCurrency(deal.deal_amount)}
                </td>

                {/* Risk tier badge */}
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${riskBadgeClass(deal.risk_tier)}`}
                  >
                    {deal.risk_tier}
                  </span>
                </td>

                {/* Submitted date */}
                <td className="px-4 py-3 text-gray-600">
                  {formatDate(deal.submitted_date)}
                </td>

                {/* Reviewer avatar stack */}
                <td className="px-4 py-3">
                  <div className="flex -space-x-1">
                    {deal.reviewers.map((reviewer, idx) => (
                      <div
                        key={idx}
                        className={`relative flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold border-2 ${
                          reviewer.responded
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                            : 'border-gray-300 bg-gray-100 text-gray-600'
                        }`}
                        title={`${reviewer.name}${reviewer.responded ? ' (responded)' : ' (pending)'}`}
                      >
                        {getInitials(reviewer.name)}
                      </div>
                    ))}
                    {deal.reviewers.length === 0 && (
                      <span className="text-xs text-gray-400">--</span>
                    )}
                  </div>
                </td>

                {/* Consensus */}
                <td className="px-4 py-3 text-gray-600 capitalize text-xs">
                  {deal.consensus}
                </td>

                {/* SLA remaining */}
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${slaColorClass(deal.sla_hours_remaining)}`}
                  >
                    {formatSla(deal.sla_hours_remaining)}
                  </span>
                </td>

                {/* Review button */}
                <td className="px-4 py-3">
                  <a
                    href="/applications"
                    className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                  >
                    Review Deal
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
