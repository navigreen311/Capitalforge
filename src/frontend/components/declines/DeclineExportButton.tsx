'use client';

// ============================================================
// DeclineExportButton — CSV export for decline records
//
// Generates a CSV with columns: App ID, Business, Issuer,
// Card Product, Declined Date, Reason, Recon Status,
// Cooldown Ends, Requested Limit.
// Triggers browser download as declines-export-YYYY-MM-DD.csv
// ============================================================

import { useCallback } from 'react';

// -- Types -------------------------------------------------------------------

export interface DeclineExportRecord {
  appId: string;
  businessName: string;
  issuer: string;
  cardProduct: string;
  declinedDate: string;
  reasonCategory: string;
  reconStatus: string;
  cooldownEndsDate: string | null;
  requestedLimit: number;
}

export interface DeclineExportButtonProps {
  records: DeclineExportRecord[];
}

// -- Helpers -----------------------------------------------------------------

const CSV_HEADERS = [
  'App ID',
  'Business',
  'Issuer',
  'Card Product',
  'Declined Date',
  'Reason',
  'Recon Status',
  'Cooldown Ends',
  'Requested Limit',
] as const;

/** Escape a CSV field value -- wrap in quotes if it contains commas, quotes, or newlines. */
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

function buildCsvContent(records: DeclineExportRecord[]): string {
  const headerLine = CSV_HEADERS.join(',');

  const rows = records.map((r) => {
    const fields = [
      r.appId,
      r.businessName,
      r.issuer,
      r.cardProduct,
      r.declinedDate,
      statusLabel(r.reasonCategory),
      statusLabel(r.reconStatus),
      r.cooldownEndsDate ?? '',
      String(r.requestedLimit),
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

// -- Component ---------------------------------------------------------------

export function DeclineExportButton({ records }: DeclineExportButtonProps) {
  const handleExport = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const filename = `declines-export-${today}.csv`;
    const content = buildCsvContent(records);
    downloadCsv(content, filename);
  }, [records]);

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={records.length === 0}
      className="btn btn-outline inline-flex items-center gap-2
                 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Export decline records as CSV"
    >
      {/* Download icon (Heroicons arrow-down-tray, 20px filled) */}
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
