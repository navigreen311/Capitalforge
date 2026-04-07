'use client';

// ============================================================
// SuitabilityPanel — Full suitability assessment display
//
// Shows:
//   - Large score number with tier-colored background
//   - Tier badge (Suitable / Marginal / Not Suitable)
//   - 6-component score breakdown bars
//   - Hard no-go triggers as red alert items
//   - Soft warnings as amber items
//   - Recommendation text
//   - Alternatives section for not_suitable clients
//   - Max safe leverage indicator
// ============================================================

import { useMemo } from 'react';

// ── Types (mirror backend SuitabilityResult) ─────────────────

export type SuitabilityTier = 'suitable' | 'marginal' | 'not_suitable';

export interface ComponentScore {
  component: string;
  label: string;
  points: number;
  maxPoints: number;
  reason: string;
}

export interface HardNoGoTrigger {
  code: string;
  label: string;
  description: string;
}

export interface SoftWarning {
  code: string;
  label: string;
  description: string;
}

export interface Alternative {
  product: string;
  description: string;
  reason: string;
}

export interface SuitabilityResultData {
  score: number;
  tier: SuitabilityTier;
  maxSafeLeverage: number;
  componentScores: ComponentScore[];
  hardNoGoTriggers: HardNoGoTrigger[];
  softWarnings: SoftWarning[];
  recommendation: string;
  alternatives: Alternative[];
}

interface SuitabilityPanelProps {
  result: SuitabilityResultData;
  loading?: boolean;
}

// ── Color Helpers ────────────────────────────────────────────

function tierColors(tier: SuitabilityTier) {
  switch (tier) {
    case 'suitable':
      return {
        text: 'text-green-400',
        bg: 'bg-green-900/30',
        border: 'border-green-700',
        badge: 'bg-green-900 text-green-300 border-green-700',
        bar: 'bg-green-500',
      };
    case 'marginal':
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-900/30',
        border: 'border-amber-700',
        badge: 'bg-amber-900 text-amber-300 border-amber-700',
        bar: 'bg-amber-500',
      };
    case 'not_suitable':
      return {
        text: 'text-red-400',
        bg: 'bg-red-900/30',
        border: 'border-red-700',
        badge: 'bg-red-900 text-red-300 border-red-700',
        bar: 'bg-red-500',
      };
  }
}

function tierLabel(tier: SuitabilityTier): string {
  switch (tier) {
    case 'suitable': return 'Suitable';
    case 'marginal': return 'Marginal';
    case 'not_suitable': return 'Not Suitable';
  }
}

function componentBarColor(points: number, maxPoints: number): string {
  const pct = maxPoints > 0 ? points / maxPoints : 0;
  if (pct >= 0.75) return 'bg-green-500';
  if (pct >= 0.50) return 'bg-amber-500';
  return 'bg-red-500';
}

// ── Component ────────────────────────────────────────────────

export default function SuitabilityPanel({ result, loading }: SuitabilityPanelProps) {
  const colors = useMemo(() => tierColors(result.tier), [result.tier]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 rounded-xl bg-gray-800" />
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Score Display + Tier Badge ──────────────────────── */}
      <div className={`rounded-xl border p-6 text-center ${colors.bg} ${colors.border}`}>
        <p className="text-sm text-gray-400 mb-1">Suitability Score</p>
        <p className={`text-5xl font-extrabold ${colors.text}`}>
          {result.score}
        </p>
        <p className="text-sm text-gray-400 mt-1">out of 100</p>

        {/* Tier badge */}
        <div className="mt-3 flex justify-center">
          <span className={`text-sm font-bold px-4 py-1 rounded-full border ${colors.badge}`}>
            {tierLabel(result.tier)}
          </span>
        </div>

        {/* Max safe leverage */}
        <div className="mt-4 flex justify-center gap-1">
          <span className="text-xs text-gray-400">Max Safe Leverage:</span>
          <span className={`text-xs font-bold ${colors.text}`}>
            {result.maxSafeLeverage === 0
              ? 'None'
              : `${result.maxSafeLeverage} card${result.maxSafeLeverage === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {/* ── Hard No-Go Triggers ────────────────────────────── */}
      {result.hardNoGoTriggers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide">
            Hard No-Go Triggers
          </h3>
          {result.hardNoGoTriggers.map((trigger) => (
            <div
              key={trigger.code}
              className="rounded-lg border border-red-700 bg-red-900/20 p-3 flex items-start gap-3"
            >
              <span className="shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-red-800 text-red-200 text-xs font-bold">
                !
              </span>
              <div>
                <p className="text-sm font-semibold text-red-300">{trigger.label}</p>
                <p className="text-xs text-red-400/80 mt-0.5">{trigger.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Soft Warnings ──────────────────────────────────── */}
      {result.softWarnings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">
            Warnings
          </h3>
          {result.softWarnings.map((warning) => (
            <div
              key={warning.code}
              className="rounded-lg border border-amber-700 bg-amber-900/20 p-3 flex items-start gap-3"
            >
              <span className="shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-amber-800 text-amber-200 text-xs font-bold">
                !
              </span>
              <div>
                <p className="text-sm font-semibold text-amber-300">{warning.label}</p>
                <p className="text-xs text-amber-400/80 mt-0.5">{warning.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Component Score Breakdown ──────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          Score Breakdown
        </h3>
        {result.componentScores.map((comp) => {
          const pct = comp.maxPoints > 0 ? (comp.points / comp.maxPoints) * 100 : 0;
          const barColor = componentBarColor(comp.points, comp.maxPoints);

          return (
            <div
              key={comp.component}
              className="rounded-lg border border-gray-700 bg-gray-900/50 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-200">{comp.label}</span>
                <span className="text-sm font-bold text-white">
                  {comp.points} / {comp.maxPoints}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">{comp.reason}</p>
            </div>
          );
        })}
      </div>

      {/* ── Recommendation ─────────────────────────────────── */}
      <div className={`rounded-xl border p-4 ${colors.bg} ${colors.border}`}>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2">
          Recommendation
        </h3>
        <p className={`text-sm ${colors.text}`}>{result.recommendation}</p>
      </div>

      {/* ── Alternatives (shown when not suitable) ─────────── */}
      {result.alternatives.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wide">
            Alternative Products
          </h3>
          {result.alternatives.map((alt) => (
            <div
              key={alt.product}
              className="rounded-lg border border-blue-700/50 bg-blue-900/10 p-4"
            >
              <p className="text-sm font-semibold text-blue-300">{alt.product}</p>
              <p className="text-xs text-gray-400 mt-1">{alt.description}</p>
              <p className="text-xs text-blue-400/80 mt-1 italic">{alt.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
