'use client';

// ============================================================
// ApplicationExportButton — Exports application data as CSV.
// Generates a downloadable CSV file with all visible columns.
// ============================================================

import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ApplicationExportRow {
  id: string;
  client_name: string;
  card_product: string;
  issuer: string;
  round_number: number | null;
  requested: number;
  approved: number | null;
  status: string;
  apr_days_remaining: number | null;
  submitted_date: string;
  advisor: string;
}

export interface ApplicationExportButtonProps {
  applications: ApplicationExportRow[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'APP ID',
  'Client',
  'Card Product',
  'Issuer',
  'Round',
  'Requested',
  'Approved',
  'Status',
  'APR Expiry Days',
  'Submitted Date',
  'Advisor',
] as const;

/** Escape a CSV field value — wrap in quotes if it contains commas, quotes, or newlines. */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function statusLabel(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function buildCsvContent(applications: ApplicationExportRow[]): string {
  const headerLine = CSV_HEADERS.join(',');

  const rows = applications.map((app) => {
    const fields = [
      app.id,
      app.client_name,
      app.card_product,
      app.issuer,
      app.round_number !== null ? String(app.round_number) : '',
      String(app.requested),
      app.approved !== null ? String(app.approved) : '',
      statusLabel(app.status),
      app.apr_days_remaining !== null ? String(app.apr_days_remaining) : '',
      app.submitted_date,
      app.advisor,
    ];
    return fields.map(escapeCsvField).join(',');
  });

  return [headerLine, ...rows].join('\r\n');
}

function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Component ───────────────────────────────────────────────────────────────

export function ApplicationExportButton({ applications }: ApplicationExportButtonProps) {
  const handleExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    const filename = `applications-export-${today}.csv`;
    const content = buildCsvContent(applications);
    downloadCsv(content, filename);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={applications.length === 0}
      className="btn btn-outline inline-flex items-center gap-2
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {/* Download icon (Heroicons arrow-down-tray) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
        aria-hidden="true"
      >
        <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
        <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
      </svg>
      Export CSV
    </button>
  );
}
