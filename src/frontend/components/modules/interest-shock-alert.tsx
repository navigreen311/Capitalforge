'use client';

// ============================================================
// InterestShockAlert — Banner/card showing cards approaching
// promo APR expiry. Displays days remaining, current balance,
// and projected monthly interest increase.
//
// Severity:
//   red    = critical  (<30 days or expired)
//   yellow = warning   (30–60 days)
//   green  = safe      (>60 days)
// ============================================================

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromoCard {
  id: string;
  cardName: string;
  issuer: string;
  promoExpiresAt: string; // ISO date
  promoApr: number;       // e.g. 0 for 0% promo
  regularApr: number;     // e.g. 24.99
  /**
   * Optional: card balances are not modelled — no issuer integration supplies
   * them. When absent the expiry and rate are still shown, because those are
   * real, but every figure derived from a balance is rendered as unavailable
   * rather than computed from a zero. A "+$0/mo" interest shock reads as
   * reassurance, and would be the one number a reader acts on.
   */
  balance?: number | null;
}

export type AlertSeverity = 'critical' | 'warning' | 'safe';

interface InterestShockAlertProps {
  cards?: PromoCard[];
  /** Only show cards with severity at or above this threshold */
  minSeverity?: AlertSeverity;
  /** Render as a compact inline banner vs full cards */
  compact?: boolean;
  className?: string;
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function getSeverity(days: number): AlertSeverity {
  if (days < 30) return 'critical';
  if (days < 60) return 'warning';
  return 'safe';
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, safe: 2 };

const SEVERITY_CONFIG: Record<AlertSeverity, {
  bg: string; border: string; headerBg: string;
  titleText: string; valueText: string; badgeClass: string;
  badgeLabel: string; icon: string; barColor: string;
}> = {
  critical: {
    bg:         'bg-red-950/50',
    border:     'border-red-700',
    headerBg:   'bg-red-900/60',
    titleText:  'text-red-200',
    valueText:  'text-red-300',
    badgeClass: 'bg-red-900 text-red-200 border-red-600',
    badgeLabel: 'Critical',
    icon:       '⚠',
    barColor:   'bg-red-500',
  },
  warning: {
    bg:         'bg-yellow-950/40',
    border:     'border-yellow-700',
    headerBg:   'bg-yellow-900/50',
    titleText:  'text-yellow-200',
    valueText:  'text-yellow-300',
    badgeClass: 'bg-yellow-900 text-yellow-200 border-yellow-600',
    badgeLabel: 'Act Soon',
    icon:       '○',
    barColor:   'bg-yellow-400',
  },
  safe: {
    bg:         'bg-green-950/30',
    border:     'border-green-800',
    headerBg:   'bg-green-900/40',
    titleText:  'text-green-200',
    valueText:  'text-green-300',
    badgeClass: 'bg-green-900 text-green-200 border-green-700',
    badgeLabel: 'On Track',
    icon:       '✓',
    barColor:   'bg-green-500',
  },
};

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

/** Monthly interest cost: balance × APR / 12 */
function monthlyInterest(balance: number, apr: number): number {
  return (balance * (apr / 100)) / 12;
}

/** The extra monthly interest once the promo lapses, or null with no balance. */
function monthlyIncreaseFor(card: PromoCard): number | null {
  if (card.balance === null || card.balance === undefined) return null;
  return monthlyInterest(card.balance, card.regularApr) - monthlyInterest(card.balance, card.promoApr);
}

/** Currency, or an explicit dash for a figure that has no source. */
function currencyOrDash(value: number | null): string {
  return value === null ? '—' : formatCurrency(value);
}

// ---------------------------------------------------------------------------
// Compact row variant
// ---------------------------------------------------------------------------

function CompactRow({ card, days, severity }: { card: PromoCard; days: number; severity: AlertSeverity }) {
  const cfg = SEVERITY_CONFIG[severity];
  const monthlyIncrease = monthlyIncreaseFor(card);

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${cfg.bg} ${cfg.border}`}>
      <span className={`text-base ${cfg.valueText}`} aria-hidden="true">{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${cfg.titleText}`}>{card.cardName}</p>
        <p className="text-xs text-gray-400">
          {card.issuer}
          {card.balance === null || card.balance === undefined
            ? ' · balance not tracked'
            : ` · ${formatCurrency(card.balance)} balance`}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold ${cfg.valueText}`}>
          {days <= 0 ? 'Expired' : `${days}d left`}
        </p>
        <p className="text-[10px] text-gray-500">
          {monthlyIncrease === null ? 'increase unknown' : `+${formatCurrency(monthlyIncrease)}/mo`}
        </p>
      </div>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.badgeClass}`}>
        {cfg.badgeLabel}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full card variant
// ---------------------------------------------------------------------------

function AlertCard({ card, days, severity }: { card: PromoCard; days: number; severity: AlertSeverity }) {
  const cfg = SEVERITY_CONFIG[severity];
  const hasBalance = card.balance !== null && card.balance !== undefined;
  const currentMonthly  = hasBalance ? monthlyInterest(card.balance as number, card.promoApr) : null;
  const projectedMonthly = hasBalance ? monthlyInterest(card.balance as number, card.regularApr) : null;
  const monthlyIncrease  =
    projectedMonthly === null || currentMonthly === null ? null : projectedMonthly - currentMonthly;

  // Progress bar: fill = % of promo period remaining (cap at 90-day window)
  const maxWindow = 90;
  const pct = days <= 0 ? 0 : Math.min((days / maxWindow) * 100, 100);

  return (
    <div className={`rounded-xl border overflow-hidden ${cfg.bg} ${cfg.border}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${cfg.headerBg} border-b ${cfg.border}`}>
        <div className="flex items-center gap-2">
          <span className={`text-lg ${cfg.valueText}`} aria-hidden="true">{cfg.icon}</span>
          <div>
            <p className={`text-sm font-semibold ${cfg.titleText}`}>{card.cardName}</p>
            <p className="text-xs text-gray-400">{card.issuer}</p>
          </div>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.badgeClass}`}>
          {cfg.badgeLabel}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-4 space-y-3">
        {/* Countdown */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Promo Expires</span>
          <span className={`text-sm font-bold ${cfg.valueText}`}>
            {days <= 0
              ? `Expired ${Math.abs(days)}d ago`
              : `${days} days remaining`}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full bg-gray-800">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${cfg.barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-500 -mt-1">{formatDate(card.promoExpiresAt)}</p>

        {/* Financials grid */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-lg bg-gray-900/60 px-3 py-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Current Balance</p>
            <p className="text-base font-bold text-white">
              {card.balance === null || card.balance === undefined
                ? '—'
                : formatCurrency(card.balance)}
            </p>
          </div>
          <div className="rounded-lg bg-gray-900/60 px-3 py-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Promo → Regular APR</p>
            <p className="text-base font-bold text-white">
              {card.promoApr}% → {card.regularApr}%
            </p>
          </div>
          <div className="rounded-lg bg-gray-900/60 px-3 py-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Current Monthly Int.</p>
            <p className="text-base font-bold text-green-400">{currencyOrDash(currentMonthly)}</p>
          </div>
          <div className={`rounded-lg px-3 py-2 ${cfg.bg} border ${cfg.border}`}>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Projected Monthly Int.</p>
            <p className={`text-base font-bold ${cfg.valueText}`}>{currencyOrDash(projectedMonthly)}</p>
          </div>
        </div>

        {/* Shock callout */}
        <div className={`rounded-lg border px-3 py-2.5 ${cfg.bg} ${cfg.border}`}>
          <p className={`text-xs font-semibold ${cfg.valueText}`}>
            {days <= 0
              ? projectedMonthly === null
                ? `Regular APR of ${card.regularApr}% now in effect — pay down or transfer immediately.`
                : `Regular APR now in effect. Monthly interest: ${formatCurrency(projectedMonthly)} — pay down or transfer immediately.`
              : severity === 'critical'
              ? monthlyIncrease === null
                ? `Only ${days} days left before the rate rises to ${card.regularApr}% — act now.`
                : `Only ${days} days left. Monthly interest will increase by ${formatCurrency(monthlyIncrease)} — act now.`
              : monthlyIncrease === null
                ? `${days} days remaining. Plan to pay down or transfer this balance before the rate rises to ${card.regularApr}%.`
                : `${days} days remaining. Plan to pay down or transfer this balance to avoid +${formatCurrency(monthlyIncrease)}/mo.`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InterestShockAlert({
  // Defaults to nothing, not to the sample cards. A caller that omitted
  // `cards` used to get four fabricated promo expirations, complete with a
  // summed monthly interest shock presented as this client's exposure. The
  // empty branch below already says nothing needs attention.
  cards = [],
  minSeverity = 'warning',
  compact = false,
  className = '',
}: InterestShockAlertProps) {
  // Recompute days on a timer so the component stays current
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Annotate each card with live days/severity, then filter + sort
  const annotated = cards
    .map(card => {
      const days = daysUntil(card.promoExpiresAt);
      const severity = getSeverity(days);
      return { card, days, severity };
    })
    .filter(({ severity }) => SEVERITY_ORDER[severity] <= SEVERITY_ORDER[minSeverity])
    .sort((a, b) => a.days - b.days); // most urgent first

  if (annotated.length === 0) {
    return (
      <div className={`rounded-xl border border-gray-800 bg-[#0A1628] px-5 py-8 text-center ${className}`}>
        <p className="text-sm text-gray-500">No promo expirations require attention.</p>
      </div>
    );
  }

  const criticalCount = annotated.filter(a => a.severity === 'critical').length;
  const warningCount  = annotated.filter(a => a.severity === 'warning').length;
  // Summed over the cards whose balance is known. `shockBasedOn` says how many
  // that is, so a small total is not read as small exposure when it is really
  // partial coverage.
  const withBalance   = annotated.filter(({ card }) => monthlyIncreaseFor(card) !== null);
  const shockBasedOn  = withBalance.length;
  const totalShock    = shockBasedOn === 0
    ? null
    : withBalance.reduce((sum, { card }) => sum + (monthlyIncreaseFor(card) ?? 0), 0);

  return (
    <div className={`rounded-xl border border-gray-800 bg-[#0A1628] overflow-hidden ${className}`}>
      {/* Banner header */}
      <div className={`px-5 py-4 border-b ${criticalCount > 0 ? 'border-red-900 bg-red-950/30' : 'border-yellow-900 bg-yellow-950/20'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`text-base font-semibold ${criticalCount > 0 ? 'text-red-200' : 'text-yellow-200'}`}>
              Interest Shock Alerts
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {criticalCount > 0 && <span className="text-red-400 font-medium">{criticalCount} critical · </span>}
              {warningCount > 0  && <span className="text-yellow-400 font-medium">{warningCount} warning · </span>}
              {totalShock === null ? (
                <span className="text-gray-500">
                  Projected increase unavailable — no balances tracked
                </span>
              ) : (
                <>
                  Projected increase:{' '}
                  <span className="text-white font-semibold">{formatCurrency(totalShock)}/mo</span>
                  {shockBasedOn < annotated.length && (
                    <span className="text-gray-500">
                      {' '}(across {shockBasedOn} of {annotated.length} cards with balances)
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          <span className={`text-sm font-bold px-3 py-1 rounded-full border ${
            criticalCount > 0
              ? 'bg-red-900 text-red-200 border-red-600'
              : 'bg-yellow-900 text-yellow-200 border-yellow-600'
          }`}>
            {annotated.length} card{annotated.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Cards / rows */}
      <div className={compact ? 'p-4 space-y-2' : 'p-4 grid gap-4 sm:grid-cols-2'}>
        {annotated.map(({ card, days, severity }) =>
          compact
            ? <CompactRow key={card.id} card={card} days={days} severity={severity} />
            : <AlertCard  key={card.id} card={card} days={days} severity={severity} />
        )}
      </div>
    </div>
  );
}
