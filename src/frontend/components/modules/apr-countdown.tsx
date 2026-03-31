'use client';

// ============================================================
// AprCountdown — APR expiry countdown timer with days
// remaining, color-coded urgency, and card metadata.
// Green >60 days | Yellow 30–60 | Red <30
// ============================================================

import { useEffect, useState } from 'react';
import { APR_ALERT_WINDOWS } from '../../../shared/constants';

export interface AprCountdownProps {
  /** Name or identifier of the card / product */
  cardProduct: string;
  /** Issuer name */
  issuer: string;
  /** ISO date string for when the 0% / intro APR expires */
  expiresAt: string;
  /** The go-to rate after the promo period ends (e.g. 24.99) */
  regularApr?: number;
  /** Current balance on this card */
  balance?: number;
  compact?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(isoDate: string): number {
  const now = Date.now();
  const target = new Date(isoDate).getTime();
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
}

type UrgencyLevel = 'safe' | 'warning' | 'critical' | 'expired';

function getUrgency(days: number): UrgencyLevel {
  if (days <= 0) return 'expired';
  if (days < APR_ALERT_WINDOWS[2]) return 'critical';   // < 15d
  if (days < APR_ALERT_WINDOWS[1]) return 'critical';   // < 30d  (both thresholds < 30)
  if (days < APR_ALERT_WINDOWS[0]) return 'warning';    // < 60d
  return 'safe';
}

const URGENCY_CONFIG: Record<
  UrgencyLevel,
  {
    ringClass: string;
    textClass: string;
    bgClass: string;
    borderClass: string;
    badgeClass: string;
    badgeLabel: string;
  }
> = {
  safe: {
    ringClass: 'stroke-green-500',
    textClass: 'text-green-400',
    bgClass: 'bg-green-950',
    borderClass: 'border-green-700',
    badgeClass: 'bg-green-900 text-green-300 border-green-700',
    badgeLabel: 'On Track',
  },
  warning: {
    ringClass: 'stroke-yellow-500',
    textClass: 'text-yellow-400',
    bgClass: 'bg-yellow-950',
    borderClass: 'border-yellow-700',
    badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    badgeLabel: 'Act Soon',
  },
  critical: {
    ringClass: 'stroke-red-500',
    textClass: 'text-red-400',
    bgClass: 'bg-red-950',
    borderClass: 'border-red-700',
    badgeClass: 'bg-red-900 text-red-300 border-red-700',
    badgeLabel: 'Urgent',
  },
  expired: {
    ringClass: 'stroke-gray-600',
    textClass: 'text-gray-400',
    bgClass: 'bg-gray-900',
    borderClass: 'border-gray-700',
    badgeClass: 'bg-gray-800 text-gray-400 border-gray-600',
    badgeLabel: 'APR Active',
  },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Circular timer ring (SVG)
// ---------------------------------------------------------------------------

function TimerRing({
  days,
  maxDays = 90,
  size = 80,
  urgency,
}: {
  days: number;
  maxDays?: number;
  size?: number;
  urgency: UrgencyLevel;
}) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = urgency === 'expired' ? 0 : Math.min(days / maxDays, 1);
  const dashOffset = circumference * (1 - pct);
  const cfg = URGENCY_CONFIG[urgency];
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} aria-hidden="true">
      <circle
        cx={cx} cy={cy} r={radius}
        fill="none" stroke="#1f2937" strokeWidth={6}
      />
      <circle
        cx={cx} cy={cy} r={radius}
        fill="none"
        className={cfg.ringClass}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      {/* Days label */}
      <text
        x={cx} y={cy - 4}
        textAnchor="middle"
        fontSize={size * 0.24}
        fontWeight="700"
        fill={urgency === 'expired' ? '#6b7280' : 'white'}
      >
        {urgency === 'expired' ? '—' : days}
      </text>
      <text
        x={cx} y={cy + size * 0.18}
        textAnchor="middle"
        fontSize={size * 0.12}
        fill="#9ca3af"
      >
        {urgency === 'expired' ? 'expired' : 'days'}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AprCountdown({
  cardProduct,
  issuer,
  expiresAt,
  regularApr,
  balance,
  compact = false,
  className = '',
}: AprCountdownProps) {
  const [days, setDays] = useState(() => daysUntil(expiresAt));

  // Refresh every minute so timers update in long-running sessions
  useEffect(() => {
    const id = setInterval(() => setDays(daysUntil(expiresAt)), 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const urgency = getUrgency(days);
  const cfg = URGENCY_CONFIG[urgency];

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-3 rounded-lg border px-3 py-2 ${cfg.bgClass} ${cfg.borderClass} ${className}`}
      >
        <TimerRing days={days} urgency={urgency} size={44} maxDays={90} />
        <div>
          <p className="text-xs font-semibold text-gray-100 truncate max-w-[120px]">
            {cardProduct}
          </p>
          <p className={`text-xs ${cfg.textClass}`}>
            {urgency === 'expired' ? 'APR active' : `${days}d left`}
          </p>
        </div>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${cfg.badgeClass} ml-auto`}>
          {cfg.badgeLabel}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-5 ${cfg.bgClass} ${cfg.borderClass} ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="font-semibold text-gray-100 text-sm">{cardProduct}</p>
          <p className="text-xs text-gray-400">{issuer}</p>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badgeClass}`}>
          {cfg.badgeLabel}
        </span>
      </div>

      {/* Timer ring + details */}
      <div className="flex items-center gap-5">
        <TimerRing days={days} urgency={urgency} size={80} maxDays={90} />

        <div className="flex-1 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Promo Expires</span>
            <span className="text-gray-200">{formatDate(expiresAt)}</span>
          </div>
          {regularApr !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-400">Go-To APR</span>
              <span className="text-gray-200">{regularApr.toFixed(2)}%</span>
            </div>
          )}
          {balance !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-400">Balance</span>
              <span className="font-semibold text-gray-100">{formatCurrency(balance)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Urgency message */}
      {urgency !== 'safe' && (
        <div className={`mt-4 rounded-lg p-2.5 border ${cfg.borderClass} ${cfg.bgClass}`}>
          <p className={`text-xs font-semibold ${cfg.textClass}`}>
            {urgency === 'expired'
              ? 'Promo period has ended — regular APR is now in effect.'
              : urgency === 'critical'
              ? `Only ${days} days left! Transfer or pay down this balance immediately.`
              : `${days} days remaining. Start planning payoff or transfer strategy.`}
          </p>
        </div>
      )}
    </div>
  );
}
