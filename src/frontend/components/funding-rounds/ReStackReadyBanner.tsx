'use client';

// ============================================================
// ReStackReadyBanner — Small banner shown at the bottom of
// completed round cards when a client is eligible for the next
// funding round (readinessScore >= 75).
// ============================================================

import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ReStackReadyBannerProps {
  clientId: string;
  clientName: string;
  currentRoundNumber: number;
  readinessScore: number;
  onStartNextRound: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ReStackReadyBanner({
  clientId,
  clientName,
  currentRoundNumber,
  readinessScore,
  onStartNextRound,
}: ReStackReadyBannerProps) {
  if (readinessScore < 75) return null;

  const nextRound = currentRoundNumber + 1;

  return (
    <div
      className="flex items-center justify-between rounded-b-lg bg-teal-50 px-4 py-2 border-t border-teal-200"
      role="status"
      aria-label={`${clientName} is ready for round ${nextRound}`}
    >
      <span className="text-sm font-medium text-teal-700">
        ⚡ Ready for Round {nextRound}
      </span>

      <button
        type="button"
        onClick={onStartNextRound}
        className="rounded-md bg-teal-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 transition-colors"
      >
        Start Round {nextRound}
      </button>
    </div>
  );
}
