'use client';

// ============================================================
// ViolationActionButtons — Action buttons for network rule
// violation items (Acknowledge, Contact Network, Document Response).
// Contact Network opens a modal with phone, dispute portal,
// department, and calling notes for Visa / Mastercard / Amex.
// violation items (Acknowledge, Contact, Document Response).
// Shows acknowledged-by info when a violation has been ack'd.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';

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

// ── Network contact directory ───────────────────────────────────────────────

interface NetworkContactInfo {
  phone: string;
  disputePortalUrl: string;
  department: string;
  callingNotes: string[];
}

const NETWORK_CONTACTS: Record<string, NetworkContactInfo> = {
  Visa: {
    phone: '1-800-847-2911',
    disputePortalUrl: 'https://www.visa.com/dispute-resolution',
    department: 'Visa Commercial Card Compliance',
    callingNotes: [
      'Reference the violation rule number (e.g. Rule 10.3.2).',
      'Have the merchant ID and transaction date ready.',
      'Ask to open a formal compliance review case.',
      'Request a written confirmation of the call via email.',
    ],
  },
  Mastercard: {
    phone: '1-800-627-8372',
    disputePortalUrl: 'https://www.mastercard.com/dispute-portal',
    department: 'Mastercard Commercial Products Disputes',
    callingNotes: [
      'Reference the MC rule number (e.g. Rule 5.10.1.1).',
      'Provide the ARN (Acquirer Reference Number) if available.',
      'Ask for the compliance case ID for tracking.',
      'Confirm expected SLA for resolution (typically 30–45 days).',
    ],
  },
  Amex: {
    phone: '1-800-528-4800',
    disputePortalUrl: 'https://www.americanexpress.com/disputes',
    department: 'American Express Commercial Card Program Compliance',
    callingNotes: [
      'Reference the CPC policy number (e.g. Policy 4.2).',
      'Provide the card member account number (last 5 digits).',
      'Request pre-authorization guidance for future transactions.',
      'Ask about written documentation requirements for compliance.',
    ],
  },
};

// ── Component ───────────────────────────────────────────────────────────────

export function ViolationActionButtons({
  violationId,
  network,
  acknowledged,
  acknowledgedInfo,
  onAcknowledge,
  onDocumentResponse,
}: ViolationActionButtonsProps) {
  const [contactModalOpen, setContactModalOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!contactModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setContactModalOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [contactModalOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) setContactModalOpen(false);
    },
    [],
  );

  const contact = NETWORK_CONTACTS[network] ?? null;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Acknowledge button / badge */}
        {acknowledged ? (
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

        {/* Contact network button — opens modal */}
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
          onClick={() => setContactModalOpen(true)}
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

      {/* ── Contact Network Modal ──────────────────────────────────────────── */}
      {contactModalOpen && contact && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`contact-modal-title-${violationId}`}
        >
          <div className="relative w-full max-w-md rounded-xl bg-gray-900 border border-gray-700 shadow-2xl">
            {/* Close */}
            <button
              onClick={() => setContactModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
              aria-label="Close contact modal"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-700">
              <h3
                id={`contact-modal-title-${violationId}`}
                className="text-lg font-bold text-white"
              >
                Contact {network}
              </h3>
              <p className="text-sm text-gray-400 mt-0.5">{contact.department}</p>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4">
              {/* Phone */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Phone Number</p>
                <a
                  href={`tel:${contact.phone.replace(/-/g, '')}`}
                  className="text-lg font-bold text-[#C9A84C] hover:text-amber-300 transition-colors"
                >
                  {contact.phone}
                </a>
              </div>

              {/* Dispute Portal */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Dispute Portal</p>
                <a
                  href={contact.disputePortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all transition-colors"
                >
                  {contact.disputePortalUrl}
                </a>
              </div>

              {/* Calling Notes */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Calling Notes</p>
                <ul className="space-y-1.5">
                  {contact.callingNotes.map((note, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
              <button
                onClick={() => setContactModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white
                  border border-gray-600 hover:border-gray-500 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>

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
