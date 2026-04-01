'use client';

// ============================================================
// OptimizerResultsActions — Action buttons for optimizer results
//
// Horizontal row of actions: Save to Client, Export PDF, and
// Copy Link. All buttons disabled when no results are present.
// Save to Client requires a selected client.
// ============================================================

import React, { useState, useCallback, useEffect } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OptimizerResultsActionsProps {
  clientId: string | null;
  clientName: string | null;
  hasResults: boolean;
  onSaveToClient: () => void;
}

// ─── Inline Toast ───────────────────────────────────────────────────────────

function InlineToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-3 bg-emerald-700 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-bottom-4">
      <span>{message}</span>
      <button onClick={onDismiss} className="text-white/70 hover:text-white text-lg leading-none">
        &times;
      </button>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OptimizerResultsActions({
  clientId,
  clientName,
  hasResults,
  onSaveToClient,
}: OptimizerResultsActionsProps) {
  const [toast, setToast] = useState<string | null>(null);

  const canSave = hasResults && clientId !== null;

  const handleExportPdf = useCallback(() => {
    setToast('PDF export coming soon');
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setToast('Link copied to clipboard');
    } catch {
      setToast('Failed to copy link');
    }
  }, []);

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {/* Save to Client */}
        <button
          type="button"
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 text-sm px-3 py-1.5"
          disabled={!canSave}
          title={!clientId ? 'Select a client first' : clientName ? `Save to ${clientName}` : 'Save to client'}
          onClick={onSaveToClient}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
          </svg>
          Save to Client
        </button>

        {/* Export PDF */}
        <button
          type="button"
          className="btn btn-outline inline-flex items-center gap-1.5 text-sm px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!hasResults}
          onClick={handleExportPdf}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          Export PDF
        </button>

        {/* Copy Link */}
        <button
          type="button"
          className="btn btn-outline inline-flex items-center gap-1.5 text-sm px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!hasResults}
          onClick={handleCopyLink}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
          Copy Link
        </button>
      </div>

      {toast && <InlineToast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
