'use client';

// ============================================================
// AcknowledgmentsTab — Required acknowledgments for a client
//
// Displays 5 required acknowledgment types with signature status,
// signed dates, and action buttons (View Document / Send for Signature).
// Includes DocuSign e-signature integration with status tracking:
//   Pending → Sent → Delivered → Signed
// Includes a "Request All Pending" bulk action button.
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import {
  buildAcknowledgmentList,
  missingCount,
  type AckStatus,
  type AcknowledgmentItem,
  type DocuSignStatus,
} from '@/lib/acknowledgments-view';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import { SectionCard } from '../ui/card';
import { loadJson, toLoadError } from '@/lib/load-json';

// ── Types ───────────────────────────────────────────────────────────────────

interface AcknowledgmentsTabProps {
  clientId: string;
}


// ── Status display config ───────────────────────────────────────────────────

// Only two states are real: the table stores signed acknowledgments, so an
// entry is either on file or it is not. "Pending" would assert that a request
// is in flight, which nothing in the record supports.
const STATUS_CONFIG: Record<AckStatus, { icon: string; label: string }> = {
  signed:  { icon: '✅', label: 'Signed' },
  missing: { icon: '❌', label: 'No signed record' },
};

const ROW_STYLES: Record<AckStatus, string> = {
  signed:  'bg-green-50 border-l-green-500',
  missing: 'bg-gray-50 border-l-gray-300',
};

// ── DocuSign Status Badge Config ────────────────────────────────────────────

const DOCUSIGN_STATUS_STYLES: Record<DocuSignStatus, string> = {
  none:      '',
  sent:      'bg-blue-100 text-blue-800 border-blue-300',
  delivered: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  signed:    'bg-emerald-100 text-emerald-800 border-emerald-300',
  declined:  'bg-red-100 text-red-800 border-red-300',
};

const DOCUSIGN_STATUS_LABELS: Record<DocuSignStatus, string> = {
  none:      '',
  sent:      'Sent via DocuSign',
  delivered: 'Delivered to Signer',
  signed:    'Signed via DocuSign',
  declined:  'Declined',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatSignedDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function AcknowledgmentsSkeleton() {
  return (
    <SectionCard title="Acknowledgments">
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-surface-border border-l-4 border-l-gray-200 p-4"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-48 rounded bg-gray-200" />
                <div className="h-3 w-72 rounded bg-gray-100" />
              </div>
              <div className="space-y-2 text-right">
                <div className="h-3 w-24 rounded bg-gray-200 ml-auto" />
                <div className="h-3 w-20 rounded bg-gray-100 ml-auto" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function AcknowledgmentsTab({ clientId }: AcknowledgmentsTabProps) {
  const { data, isLoading, error, refetch } =
    useAuthFetch<unknown>(`/api/v1/clients/${clientId}/acknowledgments`);

  // The required catalogue, each entry either signed or missing. Previously a
  // client with no acknowledgments on file rendered a sample list showing
  // three of them already signed.
  const acknowledgments = useMemo(() => buildAcknowledgmentList(data), [data]);

  const [requestingType, setRequestingType] = useState<string | null>(null);
  const [sendingDocuSign, setSendingDocuSign] = useState<string | null>(null);
  const [requestingAll, setRequestingAll] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasUnsigned = missingCount(acknowledgments) > 0;

  // ── Send for Signature via DocuSign ─────────────────────────

  const handleSendForSignature = useCallback(
    async (ack: AcknowledgmentItem) => {
      setSendingDocuSign(ack.type);
      setSuccessMessage(null);
      setErrorMessage(null);
      try {
        const data = await loadJson<{ isMock?: boolean } | null>('/api/docusign/send', {
          method: 'POST',
          body: {
            signerEmail:     'client@example.com', // In production, fetched from client record
            signerName:      'Client Signer',      // In production, fetched from client record
            documentBase64:  btoa(ack.name),        // Stub — real impl sends actual doc bytes
            documentName:    `${ack.type}.pdf`,
            envelopeSubject: `CapitalForge: Please sign ${ack.name}`,
            envelopeMessage: `Please review and sign the ${ack.name} acknowledgment.`,
            businessId:      clientId,
            docType:         ack.type,
          },
        });

        setSuccessMessage(
          data?.isMock
            ? `[DEMO] DocuSign signature request sent for ${ack.name}`
            : `DocuSign signature request sent for ${ack.name}`,
        );
        setTimeout(() => setSuccessMessage(null), 4000);
      } catch (e) {
        setErrorMessage(`Failed to send for signature. ${toLoadError(e).message}`);
        setTimeout(() => setErrorMessage(null), 4000);
      } finally {
        setSendingDocuSign(null);
      }
    },
    [clientId],
  );

  // ── Request signature for a single acknowledgment ──────────

  const handleRequestSignature = useCallback(
    async (type: string, name: string) => {
      setRequestingType(type);
      setSuccessMessage(null);
      try {
        // The success message used to fire after an unchecked fetch, so a
        // refused request still told the advisor it had been sent.
        await loadJson(`/api/v1/clients/${clientId}/acknowledgments/request`, {
          method: 'POST',
          body: { type },
        });

        setSuccessMessage(`Signature request sent for ${name}.`);
        // Auto-dismiss after 4 seconds
        setTimeout(() => setSuccessMessage(null), 4000);
      } catch (e) {
        setErrorMessage(`The signature request for ${name} was not sent. ${toLoadError(e).message}`);
        setTimeout(() => setErrorMessage(null), 6000);
      } finally {
        setRequestingType(null);
      }
    },
    [clientId],
  );

  // ── Request all pending ────────────────────────────────────

  const handleRequestAllPending = useCallback(async () => {
    setRequestingAll(true);
    setSuccessMessage(null);
    try {
      const unsigned = acknowledgments.filter((a) => a.status !== 'signed');

      // Counted rather than assumed. This used to report the size of the list
      // it set out to send, not the number that were accepted, so a run where
      // every request was refused still claimed them all sent. One failure no
      // longer abandons the rest either.
      let sent = 0;
      const failures: string[] = [];
      for (const ack of unsigned) {
        try {
          await loadJson(`/api/v1/clients/${clientId}/acknowledgments/request`, {
            method: 'POST',
            body: { type: ack.type },
          });
          sent += 1;
        } catch {
          failures.push(ack.type);
        }
      }

      if (sent > 0) {
        setSuccessMessage(
          `Signature requests sent for ${sent} acknowledgment${sent > 1 ? 's' : ''}.`,
        );
        setTimeout(() => setSuccessMessage(null), 4000);
      }
      if (failures.length > 0) {
        setErrorMessage(
          `${failures.length} request${failures.length > 1 ? 's were' : ' was'} not sent: ${failures.join(', ')}.`,
        );
        setTimeout(() => setErrorMessage(null), 6000);
      }
    } finally {
      setRequestingAll(false);
    }
  }, [clientId, acknowledgments]);

  // ── Loading ────────────────────────────────────────────────

  if (isLoading) {
    return <AcknowledgmentsSkeleton />;
  }

  // ── Error ──────────────────────────────────────────────────

  if (error) {
    return <DashboardErrorState error={error} onRetry={refetch} />;
  }

  // ── Header action ─────────────────────────────────────────

  const headerAction = hasUnsigned ? (
    <button
      type="button"
      onClick={handleRequestAllPending}
      disabled={requestingAll}
      className={`inline-flex items-center rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors ${
        requestingAll
          ? 'bg-indigo-400 cursor-not-allowed'
          : 'bg-indigo-600 hover:bg-indigo-700'
      }`}
    >
      {requestingAll ? (
        <>
          <svg
            className="mr-1.5 h-3.5 w-3.5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Sending…
        </>
      ) : (
        'Request All Pending'
      )}
    </button>
  ) : null;

  // ── Render ─────────────────────────────────────────────────

  return (
    <SectionCard title="Acknowledgments" action={headerAction}>
      {/* Success toast banner */}
      {successMessage && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          <svg
            className="h-4 w-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {successMessage}
        </div>
      )}

      {/* Error toast banner */}
      {errorMessage && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <svg
            className="h-4 w-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          {errorMessage}
        </div>
      )}

      <div className="space-y-3">
        {acknowledgments.map((ack) => {
          const statusCfg = STATUS_CONFIG[ack.status];
          const isRequesting = requestingType === ack.type;

          return (
            <div
              key={ack.id}
              className={`rounded-lg border border-surface-border border-l-4 ${ROW_STYLES[ack.status]} p-4`}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left content */}
                <div className="flex-1 min-w-0">
                  {/* Top row: status icon + name */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm" aria-hidden="true">
                      {statusCfg.icon}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {ack.name}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mt-1 ml-6 text-sm text-gray-600">
                    {ack.description}
                  </p>

                  {/* DocuSign status badge */}
                  {ack.docusign_status && ack.docusign_status !== 'none' && (
                    <div className="mt-1.5 ml-6">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${DOCUSIGN_STATUS_STYLES[ack.docusign_status]}`}
                      >
                        {DOCUSIGN_STATUS_LABELS[ack.docusign_status]}
                      </span>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="mt-2 ml-6 flex items-center gap-2">
                    {ack.status === 'signed' && ack.document_url ? (
                      <a
                        href={ack.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                      >
                        View Document
                      </a>
                    ) : (
                      <>
                        {/* Send for Signature via DocuSign */}
                        <button
                          type="button"
                          onClick={() => handleSendForSignature(ack)}
                          disabled={
                            sendingDocuSign === ack.type ||
                            requestingAll ||
                            ack.docusign_status === 'sent' ||
                            ack.docusign_status === 'delivered'
                          }
                          className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
                            sendingDocuSign === ack.type || requestingAll
                              ? 'bg-blue-400 cursor-not-allowed'
                              : ack.docusign_status === 'sent' || ack.docusign_status === 'delivered'
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {sendingDocuSign === ack.type ? (
                            <>
                              <svg
                                className="mr-1.5 h-3 w-3 animate-spin"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                />
                              </svg>
                              Sending…
                            </>
                          ) : ack.docusign_status === 'sent' || ack.docusign_status === 'delivered' ? (
                            'Awaiting Signature'
                          ) : (
                            'Send for Signature'
                          )}
                        </button>

                        {/* Fallback: Request Signature (internal) */}
                        <button
                          type="button"
                          onClick={() =>
                            handleRequestSignature(ack.type, ack.name)
                          }
                          disabled={isRequesting || requestingAll}
                          className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                            isRequesting || requestingAll
                              ? 'text-indigo-400 border-indigo-200 cursor-not-allowed'
                              : 'text-indigo-600 border-indigo-300 hover:bg-indigo-50'
                          } border`}
                        >
                          {isRequesting ? 'Sending…' : 'Request Manually'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Right content: date + signed by */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-gray-500">
                    {ack.signed_date
                      ? formatSignedDate(ack.signed_date)
                      : 'Not signed'}
                  </p>
                  {ack.signed_by && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      Signed by: {ack.signed_by}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
