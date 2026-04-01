'use client';

// ============================================================
// SuitabilityAssessmentPanel — Full-width suitability summary
// shown at the top of optimizer results. Displays leverage
// capacity, recommended stack sizing, and a go/no-go verdict.
// ============================================================

import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SuitabilityAssessmentPanelProps {
  score: number;
  label: string;
  maxSafeLeverage: number;
  currentOutstanding: number;
  remainingCapacity: number;
  recommendedStackSize: string;
  strategy: string;
  estimatedRoundMin: number;
  estimatedRoundMax: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type ScoreTier = 'suitable' | 'borderline' | 'not-suitable';

function getScoreTier(score: number): ScoreTier {
  if (score >= 70) return 'suitable';
  if (score >= 50) return 'borderline';
  return 'not-suitable';
}

const TIER_CONFIG: Record<
  ScoreTier,
  {
    borderColor: string;
    badgeBg: string;
    badgeText: string;
    badgeLabel: string;
    scoreBg: string;
    scoreText: string;
    ringColor: string;
  }
> = {
  suitable: {
    borderColor: 'border-green-500',
    badgeBg: 'bg-green-500/20',
    badgeText: 'text-green-400',
    badgeLabel: 'SUITABLE',
    scoreBg: 'bg-green-500/10',
    scoreText: 'text-green-400',
    ringColor: 'ring-green-500/30',
  },
  borderline: {
    borderColor: 'border-amber-500',
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-400',
    badgeLabel: 'BORDERLINE',
    scoreBg: 'bg-amber-500/10',
    scoreText: 'text-amber-400',
    ringColor: 'ring-amber-500/30',
  },
  'not-suitable': {
    borderColor: 'border-red-500',
    badgeBg: 'bg-red-500/20',
    badgeText: 'text-red-400',
    badgeLabel: 'NOT SUITABLE',
    scoreBg: 'bg-red-500/10',
    scoreText: 'text-red-400',
    ringColor: 'ring-red-500/30',
  },
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000).toLocaleString()}K`;
  return `$${value.toLocaleString()}`;
}

function formatRange(min: number, max: number): string {
  return `${formatCurrency(min)}\u2013${formatCurrency(max)}`;
}

// ── Component ───────────────────────────────────────────────────────────────

export function SuitabilityAssessmentPanel({
  score,
  label,
  maxSafeLeverage,
  currentOutstanding,
  remainingCapacity,
  recommendedStackSize,
  strategy,
  estimatedRoundMin,
  estimatedRoundMax,
}: SuitabilityAssessmentPanelProps) {
  const tier = getScoreTier(score);
  const config = TIER_CONFIG[tier];
  const isNoGo = tier === 'not-suitable';
  const withinSafeLeverage = currentOutstanding + estimatedRoundMax <= maxSafeLeverage;
  const isCapacityLow = remainingCapacity < maxSafeLeverage * 0.2;

  return (
    <div
      className={`
        w-full rounded-xl border-2 ${config.borderColor}
        bg-gray-900 p-5 shadow-lg
      `}
    >
      {/* ── Header: Score + Badge ───────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
        {/* Score circle */}
        <div
          className={`
            flex items-center justify-center
            w-16 h-16 rounded-full ring-4 ${config.ringColor}
            ${config.scoreBg}
          `}
        >
          <span className={`text-2xl font-bold ${config.scoreText}`}>
            {score}
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-white">
              Suitability Score {score}/100
            </h3>
            <span
              className={`
                text-[10px] font-bold tracking-wider px-2.5 py-0.5
                rounded-full ${config.badgeBg} ${config.badgeText}
              `}
            >
              {config.badgeLabel}
            </span>
          </div>
          <p className="text-sm text-gray-400">{label}</p>
        </div>
      </div>

      {/* ── No-Go Banner ────────────────────────────────── */}
      {isNoGo && (
        <div className="mb-5 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
          <p className="text-sm font-semibold text-red-400">
            No-Go — Apply buttons are disabled
          </p>
          <p className="text-xs text-red-400/80 mt-0.5">
            This profile does not meet minimum suitability thresholds.
            Address the flagged issues before proceeding with applications.
          </p>
        </div>
      )}

      {/* ── Details Grid ────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
        <DetailCell
          label="Max Safe Leverage"
          value={formatCurrency(maxSafeLeverage)}
        />
        <DetailCell
          label="Current Outstanding"
          value={formatCurrency(currentOutstanding)}
        />
        <DetailCell
          label="Remaining Capacity"
          value={formatCurrency(remainingCapacity)}
          indicator={isCapacityLow ? 'warning' : 'ok'}
        />
        <DetailCell
          label="Recommended Stack Size"
          value={recommendedStackSize}
        />
        <DetailCell
          label="Estimated Round Total"
          value={formatRange(estimatedRoundMin, estimatedRoundMax)}
        />
        <DetailCell
          label="Within Safe Leverage"
          value={withinSafeLeverage ? 'Yes' : 'No'}
          indicator={withinSafeLeverage ? 'ok' : 'fail'}
        />
      </div>

      {/* ── Strategy ────────────────────────────────────── */}
      <div className="rounded-lg bg-gray-800 border border-gray-700 px-4 py-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Strategy
        </p>
        <p className="text-sm text-gray-300 leading-relaxed">{strategy}</p>
      </div>
    </div>
  );
}

// ── Detail cell sub-component ───────────────────────────────────────────────

function DetailCell({
  label,
  value,
  indicator,
}: {
  label: string;
  value: string;
  indicator?: 'ok' | 'warning' | 'fail';
}) {
  const indicatorIcon =
    indicator === 'ok'
      ? '\u2705'
      : indicator === 'warning'
        ? '\u26A0\uFE0F'
        : indicator === 'fail'
          ? '\u274C'
          : null;

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm font-semibold text-white">
        {value}
        {indicatorIcon && (
          <span className="ml-1.5" aria-label={indicator}>
            {indicatorIcon}
          </span>
        )}
      </p>
    </div>
  );
}
