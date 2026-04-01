'use client';

// ============================================================
// DeclineBulkActions — Bulk action bar for selected decline records
// Shown when one or more decline records are selected.
// ============================================================

export interface DeclineBulkActionsProps {
  selectedCount: number;
  selectedRecords: Array<{
    id: string;
    businessName: string;
    issuer: string;
    cardProduct: string;
    reconStatus: string;
  }>;
  onExportCsv: () => void;
  onGenerateLetters: () => void;
  onMarkSent: () => void;
  onClear: () => void;
}

export function DeclineBulkActions({
  selectedCount,
  selectedRecords,
  onExportCsv,
  onGenerateLetters,
  onMarkSent,
  onClear,
}: DeclineBulkActionsProps) {
  if (selectedCount <= 0) return null;

  return (
    <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
      {/* Selection count */}
      <span className="text-sm font-semibold text-yellow-300 mr-1">
        {selectedCount} selected
      </span>

      {/* Export CSV */}
      <button
        onClick={onExportCsv}
        className="text-xs px-3 py-1.5 rounded-lg bg-yellow-900 hover:bg-yellow-800 text-yellow-300 border border-yellow-700 font-semibold transition-colors"
      >
        Export CSV
      </button>

      {/* Generate Letters */}
      <button
        onClick={onGenerateLetters}
        className="text-xs px-3 py-1.5 rounded-lg bg-yellow-900 hover:bg-yellow-800 text-yellow-300 border border-yellow-700 font-semibold transition-colors"
      >
        Generate Letters
      </button>

      {/* Mark as Sent */}
      <button
        onClick={onMarkSent}
        className="text-xs px-3 py-1.5 rounded-lg bg-yellow-900 hover:bg-yellow-800 text-yellow-300 border border-yellow-700 font-semibold transition-colors"
      >
        Mark as Sent
      </button>

      {/* Cancel / clear selection */}
      <button
        onClick={onClear}
        className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 font-semibold transition-colors ml-auto"
      >
        Cancel
      </button>
    </div>
  );
}
