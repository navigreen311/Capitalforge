'use client';

// ============================================================
// SuitabilityIndicator — color-coded suitability score with
// score value, band label, recommendation, and no-go reasons.
// ============================================================

import type { SuitabilityResult } from '../../../shared/types';
import { RISK_THRESHOLDS } from '../../../shared/constants';

interface SuitabilityIndicatorProps {
  result: SuitabilityResult;
  showRecommendation?: boolean;
  showAlternatives?: boolean;
  compact?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Band helpers
// ---------------------------------------------------------------------------

type Band = 'nogo' | 'high' | 'moderate' | 'good';

function getBand(score: number, noGoTriggered: boolean): Band {
  if (noGoTriggered || score < RISK_THRESHOLDS.SUITABILITY_NOGO) return 'nogo';
  if (score < RISK_THRESHOLDS.SUITABILITY_HIGH_RISK) return 'high';
  if (score < RISK_THRESHOLDS.SUITABILITY_MODERATE) return 'moderate';
  return 'good';
}

const BAND_CONFIG: Record<
  Band,
  { label: string; bgClass: string; textClass: string; borderClass: string; barClass: string; dotClass: string }
> = {
  nogo: {
    label: 'No-Go',
    bgClass: 'bg-gray-950',
    textClass: 'text-gray-200',
    borderClass: 'border-gray-600',
    barClass: 'bg-gray-600',
    dotClass: 'bg-gray-400',
  },
  high: {
    label: 'High Risk',
    bgClass: 'bg-red-950',
    textClass: 'text-red-300',
    borderClass: 'border-red-700',
    barClass: 'bg-red-500',
    dotClass: 'bg-red-400',
  },
  moderate: {
    label: 'Moderate',
    bgClass: 'bg-yellow-950',
    textClass: 'text-yellow-300',
    borderClass: 'border-yellow-700',
    barClass: 'bg-yellow-500',
    dotClass: 'bg-yellow-400',
  },
  good: {
    label: 'Suitable',
    bgClass: 'bg-green-950',
    textClass: 'text-green-300',
    borderClass: 'border-green-700',
    barClass: 'bg-green-500',
    dotClass: 'bg-green-400',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SuitabilityIndicator({
  result,
  showRecommendation = true,
  showAlternatives = true,
  compact = false,
  className = '',
}: SuitabilityIndicatorProps) {
  const band = getBand(result.score, result.noGoTriggered);
  const cfg = BAND_CONFIG[band];

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${cfg.bgClass} ${cfg.borderClass} ${className}`}
      >
        <span className={`h-2 w-2 rounded-full ${cfg.dotClass}`} />
        <span className={`text-sm font-semibold ${cfg.textClass}`}>
          {result.score} — {cfg.label}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-5 ${cfg.bgClass} ${cfg.borderClass} ${className}`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${cfg.dotClass}`} />
          <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">
            Suitability
          </span>
        </div>
        <span
          className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full border ${cfg.textClass} ${cfg.borderClass} ${cfg.bgClass}`}
        >
          {cfg.label}
        </span>
      </div>

      {/* Score + bar */}
      <div className="mb-4">
        <div className="flex items-end gap-2 mb-2">
          <span className={`text-4xl font-black ${cfg.textClass}`}>
            {result.score}
          </span>
          <span className="text-gray-500 text-sm pb-1">/ 100</span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className={`h-full rounded-full ${cfg.barClass}`}
            style={{
              width: `${result.score}%`,
              transition: 'width 0.5s ease',
            }}
          />
        </div>
      </div>

      {/* Max safe leverage */}
      <div className="flex items-center justify-between text-sm mb-4 border-t border-gray-800 pt-3">
        <span className="text-gray-400">Max Safe Leverage</span>
        <span className="font-semibold text-gray-100">
          {result.maxSafeLeverage}x
        </span>
      </div>

      {/* No-Go reasons */}
      {result.noGoTriggered && result.noGoReasons.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1">
            No-Go Triggers
          </p>
          <ul className="space-y-1">
            {result.noGoReasons.map((reason, i) => (
              <li key={i} className="text-xs text-red-300 flex items-start gap-1.5">
                <span className="mt-0.5 text-red-500">&#x26A0;</span>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendation */}
      {showRecommendation && result.recommendation && (
        <div className="mt-3 border-t border-gray-800 pt-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">
            Recommendation
          </p>
          <p className="text-sm text-gray-200 leading-relaxed">
            {result.recommendation}
          </p>
        </div>
      )}

      {/* Alternative products */}
      {showAlternatives && result.alternativeProducts.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">
            Alternatives
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.alternativeProducts.map((p) => (
              <span
                key={p}
                className="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded-full px-2 py-0.5"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
