'use client';

// ============================================================
// DealCommitteeQueue — Pending deal committee reviews with SLA
//
// Shows deals awaiting committee decision with risk badges,
// SLA countdown + progress bar, reviewer avatar stack, and
// "Review Deal" action button.
// Only renders for admin role (checked via localStorage cf_user).
// ============================================================

import { useState, useEffect } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

interface Reviewer {
  name: string;
  avatar?: string;
}

interface CommitteeDeal {
  id: string;
  client_name: string;
  deal_amount: number;
  risk_tier: 'High' | 'Critical';
  sla_hours_remaining: number;
  sla_hours_max: number;
  reviewers: Reviewer[];
  submitted_at: string;
}

interface CfUser {
  role?: string;
}

// ── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_DEALS: CommitteeDeal[] = [
  {
    id: 'dc-001',
    client_name: 'Apex Ventures',
    deal_amount: 250_000,
    risk_tier: 'High',
    sla_hours_remaining: 8.5,
    sla_hours_max: 12,
    reviewers: [
      { name: 'Sarah Chen' },
      { name: 'Mike Ross' },
      { name: 'Dana Liu' },
    ],
    submitted_at: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'dc-002',
    client_name: 'Meridian Holdings',
    deal_amount: 350_000,
    risk_tier: 'Critical',
    sla_hours_remaining: 2.3,
    sla_hours_max: 6,
    reviewers: [
      { name: 'James Park' },
      { name: 'Elena Voss' },
    ],
    submitted_at: new Date(Date.now() - 3.7 * 60 * 60 * 1000).toISOString(),
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function formatDealAmount(amount: number): string {
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}k`;
  }
  return `$${amount.toLocaleString('en-US')}`;
}

function formatSla(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function slaIsUrgent(hours: number): boolean {
  return hours < 4;
}

function riskBadgeClasses(tier: string): string {
  if (tier === 'Critical') return 'bg-red-100 text-red-700 border border-red-200';
  if (tier === 'High') return 'bg-amber-100 text-amber-700 border border-amber-200';
  return 'bg-gray-100 text-gray-700 border border-gray-200';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Deterministic color from name for avatar backgrounds
const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── SLA Progress Bar ────────────────────────────────────────────────────────

function SlaProgressBar({
  remaining,
  max,
}: {
  remaining: number;
  max: number;
}) {
  const pct = Math.max(0, Math.min(100, (remaining / max) * 100));
  const barColor =
    pct < 33 ? 'bg-red-500' : pct < 66 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Deal Row ────────────────────────────────────────────────────────────────

function DealRow({ deal }: { deal: CommitteeDeal }) {
  const urgent = slaIsUrgent(deal.sla_hours_remaining);

  return (
    <div className="px-6 py-4 space-y-2">
      {/* Main row */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Client name */}
        <span className="text-sm font-semibold text-gray-900 min-w-[140px]">
          {deal.client_name}
        </span>

        {/* Deal amount */}
        <span className="text-sm font-medium text-gray-700 min-w-[60px]">
          {formatDealAmount(deal.deal_amount)}
        </span>

        {/* Risk tier badge */}
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${riskBadgeClasses(deal.risk_tier)}`}
        >
          {deal.risk_tier}
        </span>

        {/* SLA countdown */}
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${
            urgent
              ? 'text-red-700 bg-red-50'
              : 'text-gray-600 bg-gray-50'
          }`}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          {formatSla(deal.sla_hours_remaining)}
        </span>

        {/* Reviewer avatar stack */}
        <div className="flex -space-x-2 ml-auto">
          {deal.reviewers.map((reviewer, idx) => (
            <div
              key={idx}
              className={`relative flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold border-2 border-white ${avatarColor(reviewer.name)}`}
              title={reviewer.name}
            >
              {getInitials(reviewer.name)}
            </div>
          ))}
        </div>

        {/* Review Deal button */}
        <a
          href="/applications"
          className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors flex-shrink-0"
        >
          Review Deal
        </a>
      </div>

      {/* SLA progress bar */}
      <SlaProgressBar
        remaining={deal.sla_hours_remaining}
        max={deal.sla_hours_max}
      />
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function DealCommitteeQueue() {
  const [authorized, setAuthorized] = useState(false);
  const [checked, setChecked] = useState(false);

  // Check role on mount (client-only)
  useEffect(() => {
    const role = getUserRole();
    setAuthorized(role === 'admin');
    setChecked(true);
  }, []);

  // Don't render until we've checked
  if (!checked) return null;

  // Only visible to admin role
  if (!authorized) return null;

  const deals = MOCK_DEALS;
  const pendingCount = deals.length;

  // ── Empty state ───────────────────────────────────────────────
  if (pendingCount === 0) {
    return (
      <section aria-label="Deal Committee Queue">
        <div className="bg-white rounded-xl border border-surface-border shadow-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-surface-border">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-gray-900">
                Deal Committee Queue
              </h3>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                0
              </span>
            </div>
          </div>
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-gray-500">
              No deals awaiting committee review
            </p>
          </div>
        </div>
      </section>
    );
  }

  // ── Populated state ──────────────────────────────────────────
  return (
    <section aria-label="Deal Committee Queue">
      <div className="bg-white rounded-xl border border-surface-border shadow-card overflow-hidden">
        {/* Header with pending count badge */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-gray-900">
              Deal Committee Queue
            </h3>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-100 text-xs font-bold text-red-700">
              {pendingCount}
            </span>
          </div>
        </div>

        {/* Deal rows */}
        <div className="divide-y divide-gray-100">
          {deals.map((deal) => (
            <DealRow key={deal.id} deal={deal} />
          ))}
        </div>
      </div>
    </section>
  );
}
