'use client';

// ============================================================
// FundingRoundExportButton — CSV export for funding rounds
//
// Generates a CSV with columns: Round ID, Client, Round #,
// Status, Obtained, Target, Progress %, Target Close, Advisor.
// Triggers browser download as funding-rounds-export-YYYY-MM-DD.csv
// ============================================================

import { useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface FundingRoundExportRow {
  id: string;
  businessName: string;
  roundNumber: number;
  status: string;
  obtainedAmount: number;
  targetAmount: number;
  targetCloseAt: string;
  advisorName: string;
}

export interface FundingRoundExportButtonProps {
  rounds: FundingRoundExportRow[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function progressPct(obtained: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((obtained / target) * 100));
}

/** Escape a CSV field value (wrap in quotes if it contains comma, quote, or newline). */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Component ───────────────────────────────────────────────────────────────

export function FundingRoundExportButton({ rounds }: FundingRoundExportButtonProps) {
  const handleExport = useCallback(() => {
    const headers = [
      'Round ID',
      'Client',
      'Round #',
      'Status',
      'Obtained',
      'Target',
      'Progress %',
      'Target Close',
      'Advisor',
    ];

    const rows = rounds.map((r) => [
      escapeCsvField(r.id),
      escapeCsvField(r.businessName),
      String(r.roundNumber),
      escapeCsvField(statusLabel(r.status)),
      String(r.obtainedAmount),
      String(r.targetAmount),
      `${progressPct(r.obtainedAmount, r.targetAmount)}%`,
      escapeCsvField(formatDate(r.targetCloseAt)),
      escapeCsvField(r.advisorName),
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `funding-rounds-export-${todayIso()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [rounds]);

  return (
    <button
      onClick={handleExport}
      className="btn btn-outline inline-flex items-center gap-2"
      title="Export funding rounds as CSV"
    >
      {/* Download icon (Heroicons outline) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
        />
      </svg>
      Export CSV
    </button>
  );
}
