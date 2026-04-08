'use client';

// ============================================================
// ViolationActionButtons — Action buttons for network rule
// violation items (Acknowledge, Contact, Document Response).
// Shows acknowledged-by info when a violation has been ack'd.
// ============================================================

import React from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface AcknowledgedInfo {
  by: string;
  date: string;
}

export interface ViolationActionButtonsProps {
  violationId: string;
  network: string;
  acknowledged: boolean;
  acknowledgedInfo?: AcknowledgedInfo | null;
  onAcknowledge: (id: string) => void;
  onDocumentResponse: (id: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ViolationActionButtons({
  violationId,
  network,
  acknowledged,
  acknowledgedInfo,
  onAcknowledge,
  onDocumentResponse,
}: ViolationActionButtonsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Acknowledge button / badge */}
      {acknowledged ? (
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-900/40
              border border-emerald-700/50 px-3 py-1.5 text-xs font-medium text-emerald-400"
          >
            Acknowledged &#x2705;
          </span>
          {acknowledgedInfo && (
            <span className="text-xs text-gray-500">
              by {acknowledgedInfo.by} on{' '}
              {new Date(acknowledgedInfo.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onAcknowledge(violationId)}
          className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs
            font-medium text-gray-200 hover:bg-gray-700 hover:border-gray-500
            focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
        >
          Acknowledge
        </button>
      )}

      {/* Contact network button */}
      <button
        type="button"
        onClick={() => {
          window.open(`mailto:support@${network.toLowerCase().replace(/\s+/g, '')}.com`, '_blank');
        }}
        className="rounded-lg border border-blue-700/50 bg-blue-900/30 px-3 py-1.5 text-xs
          font-medium text-blue-300 hover:bg-blue-900/50 hover:border-blue-600
          focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-colors"
      >
        Contact {network}
      </button>

      {/* Document Response button */}
      <button
        type="button"
        onClick={() => onDocumentResponse(violationId)}
        className="rounded-lg border border-amber-700/50 bg-amber-900/30 px-3 py-1.5 text-xs
          font-medium text-amber-300 hover:bg-amber-900/50 hover:border-amber-600
          focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-colors"
      >
        Document Response
      </button>
    </div>
  );
}
