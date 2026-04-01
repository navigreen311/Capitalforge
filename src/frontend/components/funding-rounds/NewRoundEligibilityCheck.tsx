'use client';

// ============================================================
// NewRoundEligibilityCheck — Auto-runs when a client is selected
// in the new round form. Shows round number auto-assignment,
// in-progress round warnings, and a 5-item eligibility checklist.
// ============================================================

import { useEffect, useState } from 'react';
import { SectionCard } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NewRoundEligibilityCheckProps {
  clientId: string;
  clientName: string;
  onEligibilityResult: (eligible: boolean) => void;
}

interface LastRoundInfo {
  roundNumber: number;
  completedDate: string;
  amountObtained: number;
}

interface InProgressRound {
  roundNumber: number;
  roundCode: string;
  percentComplete: number;
}

interface EligibilityItem {
  label: string;
  detail: string;
  passed: boolean;
}

interface EligibilityData {
  nextRoundNumber: number;
  lastRound: LastRoundInfo | null;
  inProgressRound: InProgressRound | null;
  items: EligibilityItem[];
  remainingLeverage: number;
  eligible: boolean;
}

// ---------------------------------------------------------------------------
// Placeholder data — replace with API call when backend is ready
// ---------------------------------------------------------------------------

function getPlaceholderEligibility(clientId: string, clientName: string): EligibilityData {
  // Simulate an in-progress round for biz_002 to demonstrate the warning state
  const hasInProgress = clientId === 'biz_002';

  return {
    nextRoundNumber: hasInProgress ? 2 : 2,
    lastRound: {
      roundNumber: 1,
      completedDate: 'Sep 30, 2025',
      amountObtained: 120_000,
    },
    inProgressRound: hasInProgress
      ? { roundNumber: 2, roundCode: 'FR-018', percentComplete: 70 }
      : null,
    items: [
      { label: 'Readiness Score', detail: '82/100 — Eligible', passed: true },
      { label: 'Time since last round', detail: '14 months — Clear', passed: true },
      { label: 'Suitability Score', detail: '72/100 — Suitable', passed: true },
      { label: 'Outstanding obligations', detail: '$34,500 — Within safe leverage', passed: true },
    ],
    remainingLeverage: 59_000,
    eligible: !hasInProgress,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewRoundEligibilityCheck({
  clientId,
  clientName,
  onEligibilityResult,
}: NewRoundEligibilityCheckProps) {
  const [data, setData] = useState<EligibilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [continueAnyway, setContinueAnyway] = useState(false);

  useEffect(() => {
    setLoading(true);
    setContinueAnyway(false);

    // Simulate async eligibility check
    const timer = setTimeout(() => {
      const result = getPlaceholderEligibility(clientId, clientName);
      setData(result);
      setLoading(false);

      // If no in-progress round, report eligibility immediately
      if (!result.inProgressRound) {
        onEligibilityResult(result.eligible);
      }
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SectionCard title="Eligibility Check">
        <div className="flex items-center gap-3 text-sm text-gray-500 animate-pulse">
          <span className="inline-block w-4 h-4 rounded-full border-2 border-gray-300 border-t-brand-navy animate-spin" />
          Checking eligibility for {clientName}...
        </div>
      </SectionCard>
    );
  }

  if (!data) return null;

  const isEligible = data.eligible || continueAnyway;
  const hasInProgress = data.inProgressRound && !continueAnyway;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SectionCard title="Eligibility Check" subtitle={`Client: ${clientName}`}>
      <div className="space-y-4">
        {/* ── Round number auto-assignment ──────────────────────────────── */}
        {data.inProgressRound && !continueAnyway ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">&#x26A0;&#xFE0F; {clientName}</span> already has Round{' '}
            {data.inProgressRound.roundNumber} in progress ({data.inProgressRound.roundCode},{' '}
            {data.inProgressRound.percentComplete}% complete).
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => {
                  setContinueAnyway(true);
                  onEligibilityResult(true);
                }}
                className="text-xs font-semibold text-amber-700 underline hover:text-amber-900"
              >
                Continue anyway
              </button>
              <button
                type="button"
                onClick={() => {
                  // In a real app this would navigate to the round detail
                  window.location.href = `/funding-rounds/${data.inProgressRound!.roundCode}`;
                }}
                className="text-xs font-semibold text-brand-navy underline hover:text-brand-navy/80"
              >
                View Round {data.inProgressRound.roundNumber} Instead
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span className="mr-1">&#x2705;</span>
            This will be <span className="font-semibold">Round {data.nextRoundNumber}</span> for{' '}
            {clientName}.
            {data.lastRound && (
              <>
                {' '}
                Last round: Round {data.lastRound.roundNumber} (completed{' '}
                {data.lastRound.completedDate} &mdash; $
                {data.lastRound.amountObtained.toLocaleString()} obtained)
              </>
            )}
          </div>
        )}

        {/* ── Eligibility checklist ────────────────────────────────────── */}
        {!hasInProgress && (
          <>
            <ul className="space-y-2">
              {data.items.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 flex-shrink-0 ${item.passed ? 'text-emerald-600' : 'text-red-500'}`}>
                    {item.passed ? '\u2705' : '\u274C'}
                  </span>
                  <span>
                    <span className="font-medium text-gray-700">{item.label}:</span>{' '}
                    <span className="text-gray-600">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            {/* Remaining leverage line */}
            <p className="text-sm text-gray-500 pl-6">
              Remaining safe leverage:{' '}
              <span className="font-semibold text-gray-700">
                ${data.remainingLeverage.toLocaleString()}
              </span>
            </p>

            {/* ── Ineligible banner ──────────────────────────────────── */}
            {!isEligible && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
                &#x274C; Not eligible for new round &mdash; resolve outstanding issues before proceeding.
              </div>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}
