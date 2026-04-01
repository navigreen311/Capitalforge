'use client';

// ============================================================
// DeclinePatternAnalytics — Collapsible analytics section
// showing decline reason patterns, bar chart, and summary stats
// for the last 90 days.
// ============================================================

import React, { useState } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface DeclinePattern {
  reason: string;
  count: number;
  pct: number;
  avgCooldown: number;
}

export interface DeclinePatternAnalyticsProps {
  patterns: Array<DeclinePattern>;
  winRate: number;
  totalRecons: number;
  mostReceptiveIssuer: string;
  mostBlockedIssuer: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const REASON_COLORS: Record<string, string> = {
  'Too many inquiries':       'bg-orange-500',
  'High utilization':         'bg-red-500',
  'Velocity — too many new accounts': 'bg-yellow-500',
  'Insufficient income':      'bg-purple-500',
  'Derogatory marks':         'bg-red-800',
};

const DEFAULT_BAR_COLOR = 'bg-gray-500';

function barColorForReason(reason: string): string {
  return REASON_COLORS[reason] ?? DEFAULT_BAR_COLOR;
}

// ── Placeholder Data ────────────────────────────────────────────────────────

export const PLACEHOLDER_PATTERNS: DeclinePattern[] = [
  { reason: 'Too many inquiries',                count: 34, pct: 38, avgCooldown: 90 },
  { reason: 'High utilization',                   count: 22, pct: 24, avgCooldown: 60 },
  { reason: 'Velocity — too many new accounts',   count: 18, pct: 20, avgCooldown: 120 },
  { reason: 'Insufficient income',                count: 11, pct: 12, avgCooldown: 180 },
  { reason: 'Derogatory marks',                   count: 5,  pct: 6,  avgCooldown: 365 },
];

export const PLACEHOLDER_PROPS: DeclinePatternAnalyticsProps = {
  patterns: PLACEHOLDER_PATTERNS,
  winRate: 32,
  totalRecons: 19,
  mostReceptiveIssuer: 'Chase',
  mostBlockedIssuer: 'Citi',
};

// ── Component ───────────────────────────────────────────────────────────────

export function DeclinePatternAnalytics({
  patterns,
  winRate,
  totalRecons,
  mostReceptiveIssuer,
  mostBlockedIssuer,
}: DeclinePatternAnalyticsProps) {
  const [expanded, setExpanded] = useState(true);

  const topReason = patterns.length > 0
    ? patterns.reduce((a, b) => (b.count > a.count ? b : a)).reason
    : null;

  const wonCount = Math.round((winRate / 100) * totalRecons);

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
      {/* ── Header ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-5 py-3 text-left
                   hover:bg-gray-800/60 transition-colors"
      >
        <h3 className="text-xs font-bold tracking-widest text-gray-300 uppercase">
          Decline Patterns (last 90 days)
        </h3>
        <span
          className="text-gray-400 transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          &#9660;
        </span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5">
          {/* ── Bar Chart ─────────────────────────────────────── */}
          <div className="space-y-3">
            {patterns.map((p) => (
              <div key={p.reason} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-200 font-medium">{p.reason}</span>
                  <span className="text-gray-400 tabular-nums">
                    {p.count} &middot; {p.pct}% &middot; {p.avgCooldown}d cooldown
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-gray-800">
                  <div
                    className={`h-2.5 rounded-full ${barColorForReason(p.reason)} transition-all duration-300`}
                    style={{ width: `${p.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* ── Summary Stats ─────────────────────────────────── */}
          <div className="border-t border-gray-800 pt-4 space-y-1.5 text-xs text-gray-300">
            <p>
              Reconsideration win rate:{' '}
              <span className="text-white font-semibold">{winRate}%</span>{' '}
              <span className="text-gray-500">
                ({wonCount} of {totalRecons} submitted)
              </span>
            </p>
            <p>
              Most receptive issuer:{' '}
              <span className="text-green-400 font-semibold">{mostReceptiveIssuer}</span>
            </p>
            <p>
              Most blocked issuer:{' '}
              <span className="text-red-400 font-semibold">{mostBlockedIssuer}</span>
            </p>
          </div>

          {/* ── Insight ───────────────────────────────────────── */}
          {topReason && (
            <div className="rounded-lg border border-gray-700 bg-gray-800/60 px-4 py-3 text-xs text-gray-300 leading-relaxed">
              {'\uD83D\uDCA1'} <span className="font-semibold text-white">{topReason}</span> is
              your most common decline reason — consider running the Optimizer velocity check
              before every application submission.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
