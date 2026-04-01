'use client';

// ============================================================
// RoundComparison — Side-by-side comparison table across rounds
//
// Shows key metrics (obtained, target, approval rate, time,
// fees, cards) for every round a client has, with the current
// round column highlighted.
// ============================================================

import React from 'react';
import { SectionCard } from '../ui/card';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RoundMetrics {
  roundNumber: number;
  obtained: number;
  target: number;
  approvalRate: number;
  days: number;
  fees: number;
  cardsApproved: number;
}

interface CurrentRoundMetrics extends RoundMetrics {
  status: string;
}

export interface RoundComparisonProps {
  clientName: string;
  currentRound: CurrentRoundMetrics;
  previousRounds: RoundMetrics[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatPct(value: number): string {
  return `${value.toFixed(0)}%`;
}

function formatDays(value: number): string {
  return `${value} day${value !== 1 ? 's' : ''}`;
}

// ─── Row definitions ────────────────────────────────────────────────────────

interface RowDef {
  label: string;
  accessor: (r: RoundMetrics) => string;
}

const ROWS: RowDef[] = [
  { label: 'Obtained',         accessor: (r) => formatCurrency(r.obtained) },
  { label: 'Target',           accessor: (r) => formatCurrency(r.target) },
  { label: 'Approval Rate',    accessor: (r) => formatPct(r.approvalRate) },
  { label: 'Time to Complete', accessor: (r) => formatDays(r.days) },
  { label: 'Fees Paid',        accessor: (r) => formatCurrency(r.fees) },
  { label: 'Cards Approved',   accessor: (r) => String(r.cardsApproved) },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function RoundComparison({
  clientName,
  currentRound,
  previousRounds,
}: RoundComparisonProps) {
  const hasHistory = previousRounds.length > 0;

  // Merge all rounds sorted by round number
  const allRounds: RoundMetrics[] = [...previousRounds, currentRound].sort(
    (a, b) => a.roundNumber - b.roundNumber,
  );

  return (
    <SectionCard title={`Round Comparison \u2014 ${clientName}`} flushBody>
      {!hasHistory ? (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-gray-500">
            This is the first round for this client.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Metric</th>
                {allRounds.map((round) => (
                  <th
                    key={round.roundNumber}
                    className={`px-4 py-3 text-right ${
                      round.roundNumber === currentRound.roundNumber
                        ? 'bg-brand-navy/5'
                        : ''
                    }`}
                  >
                    Round {round.roundNumber}
                    {round.roundNumber === currentRound.roundNumber && (
                      <span className="ml-1.5 text-[10px] font-semibold text-brand-navy uppercase">
                        Current
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ROWS.map((row) => (
                <tr key={row.label} className="hover:bg-gray-50/50">
                  <td className="px-6 py-3 font-medium text-gray-700 whitespace-nowrap">
                    {row.label}
                  </td>
                  {allRounds.map((round) => (
                    <td
                      key={round.roundNumber}
                      className={`px-4 py-3 text-right tabular-nums text-gray-900 ${
                        round.roundNumber === currentRound.roundNumber
                          ? 'bg-brand-navy/5 font-semibold'
                          : ''
                      }`}
                    >
                      {row.accessor(round)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
