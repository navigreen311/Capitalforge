'use client';

// ============================================================
// StepSubProgress — Sub-progress indicators for DUNS track
// steps 4 (trade lines) and 5 (Paydex score).
// Compact, dark-themed widgets designed to nest inside a step row.
// ============================================================

import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface TradelineSubProgressProps {
  /** Number of trade lines currently established */
  current: number;
  /** Target number of trade lines required */
  target: number;
}

export interface PaydexSubProgressProps {
  /** Current Paydex score (null if not yet available) */
  currentScore: number | null;
  /** Target Paydex score to reach */
  targetScore: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

// ── TradelineSubProgress ────────────────────────────────────────────────────

export function TradelineSubProgress({ current, target }: TradelineSubProgressProps) {
  const percent = target > 0 ? clampPercent((current / target) * 100) : 0;
  const reached = current >= target;

  return (
    <div className="mt-1.5 space-y-1">
      <p className="text-xs text-gray-400">
        <span className="font-medium text-gray-200">{current}</span> of{' '}
        <span className="font-medium text-gray-200">{target}</span> trade lines established
      </p>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-gray-700">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            reached ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {reached && (
        <p className="text-xs font-medium text-green-400">
          ✅ Minimum reached
        </p>
      )}
    </div>
  );
}

// ── PaydexSubProgress ───────────────────────────────────────────────────────

export function PaydexSubProgress({ currentScore, targetScore }: PaydexSubProgressProps) {
  const hasScore = currentScore !== null;
  const meetsTarget = hasScore && currentScore >= targetScore;
  const percent = hasScore && targetScore > 0
    ? clampPercent((currentScore / targetScore) * 100)
    : 0;

  return (
    <div className="mt-1.5 space-y-1">
      <p className="text-xs text-gray-400">
        Current Paydex:{' '}
        {hasScore ? (
          <span
            className={`font-semibold ${
              meetsTarget ? 'text-green-400' : 'text-amber-400'
            }`}
          >
            {currentScore}
          </span>
        ) : (
          <span className="italic text-gray-500">N/A</span>
        )}
      </p>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-gray-700">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            meetsTarget ? 'bg-green-500' : 'bg-amber-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="text-xs text-gray-500">
        Target: <span className="font-medium text-gray-300">{targetScore}</span>
      </p>
    </div>
  );
}
