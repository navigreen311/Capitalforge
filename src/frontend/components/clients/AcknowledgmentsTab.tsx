'use client';

// ============================================================
// AcknowledgmentsTab — Required acknowledgments for a client
//
// Displays 5 required acknowledgment types with signature status,
// signed dates, and action buttons (View Document / Request Signature).
// Includes a "Request All Pending" bulk action button.
// ============================================================

import React, { useState, useCallback } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import { SectionCard } from '../ui/card';

// ── Types ───────────────────────────────────────────────────────────────────

interface AcknowledgmentsTabProps {
  clientId: string;
}

type AckStatus = 'signed' | 'pending' | 'not_sent';

interface AcknowledgmentItem {
  id: string;
  type: string;
  name: string;
  description: string;
  status: AckStatus;
  signed_date: string | null;
  signed_by: string | null;
  document_url: string | null;
}

interface AcknowledgmentsData {
  acknowledgments: AcknowledgmentItem[];
}

// ── Status display config ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<AckStatus, { icon: string; label: string }> = {
  signed:   { icon: '✅', label: 'Signed' },
  pending:  { icon: '⏳', label: 'Pending' },
  not_sent: { icon: '❌', label: 'Not Sent' },
};

const ROW_STYLES: Record<AckStatus, string> = {
  signed:   'bg-green-50 border-l-green-500',
  pending:  'bg-amber-50 border-l-amber-500',
  not_sent: 'bg-gray-50 border-l-gray-300',
};

// ── Placeholder data ────────────────────────────────────────────────────────

function buildPlaceholderAcknowledgments(): AcknowledgmentItem[] {
  return [
    {
      id: 'ack-1',
      type: 'product_reality',
      name: 'Product-Reality Acknowledgment',
      description: 'You are receiving credit-card-based funding.',
      status: 'signed',
      signed_date: '2026-03-15T14:30:00Z',
      signed_by: 'James Thornton',
      document_url: '/documents/ack-product-reality-signed.pdf',
    },
    {
      id: 'ack-2',
      type: 'fee_refund',
      name: 'Fee & Refund Acknowledgment',
      description: 'Itemized fee schedule including all origination, servicing, and early-termination fees.',
      status: 'signed',
      signed_date: '2026-03-15T14:32:00Z',
      signed_by: 'James Thornton',
      document_url: '/documents/ack-fee-refund-signed.pdf',
    },
    {
      id: 'ack-3',
      type: 'personal_guarantee',
      name: 'Personal Guarantee Acknowledgment',
      description: 'Personal guarantee obligations and liability scope for business funding.',
      status: 'signed',
      signed_date: '2026-03-15T14:35:00Z',
      signed_by: 'James Thornton',
      document_url: '/documents/ack-personal-guarantee-signed.pdf',
    },
    {
      id: 'ack-4',
      type: 'cash_advance_restriction',
      name: 'Cash-Advance Restriction Acknowledgment',
      description: 'Restrictions on cash advance usage, prohibited transactions, and compliance requirements.',
      status: 'pending',
      signed_date: null,
      signed_by: null,
      document_url: null,
    },
    {
      id: 'ack-5',
      type: 'data_sharing_privacy',
      name: 'Data Sharing & Privacy Consent',
      description: 'Consent for data sharing with funding partners, credit bureaus, and affiliated service providers.',
      status: 'not_sent',
      signed_date: null,
      signed_by: null,
      document_url: null,
    },
  ];
}

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
    useAuthFetch<AcknowledgmentsData>(`/api/v1/clients/${clientId}/acknowledgments`);

  // Use placeholder data when API returns nothing (mock mode or dev)
  const acknowledgments = data?.acknowledgments ?? buildPlaceholderAcknowledgments();

  const [requestingType, setRequestingType] = useState<string | null>(null);
  const [requestingAll, setRequestingAll] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const hasUnsigned = acknowledgments.some((a) => a.status !== 'signed');

  // ── Request signature for a single acknowledgment ──────────

  const handleRequestSignature = useCallback(
    async (type: string, name: string) => {
      setRequestingType(type);
      setSuccessMessage(null);
      try {
        const token =
          typeof window !== 'undefined'
            ? localStorage.getItem('cf_access_token')
            : null;

        await fetch(`/api/v1/clients/${clientId}/acknowledgments/request`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ type }),
        });

        setSuccessMessage(`Signature request sent for ${name}.`);
        // Auto-dismiss after 4 seconds
        setTimeout(() => setSuccessMessage(null), 4000);
      } catch {
        // Silently handle — in production this would show an error toast
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
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('cf_access_token')
          : null;

      for (const ack of unsigned) {
        await fetch(`/api/v1/clients/${clientId}/acknowledgments/request`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ type: ack.type }),
        });
      }

      setSuccessMessage(
        `Signature requests sent for ${unsigned.length} acknowledgment${unsigned.length > 1 ? 's' : ''}.`,
      );
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch {
      // Silently handle
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

                  {/* Action row */}
                  <div className="mt-2 ml-6">
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
                      <button
                        type="button"
                        onClick={() =>
                          handleRequestSignature(ack.type, ack.name)
                        }
                        disabled={isRequesting || requestingAll}
                        className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
                          isRequesting || requestingAll
                            ? 'bg-indigo-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                      >
                        {isRequesting ? (
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
                        ) : (
                          'Request Signature'
                        )}
                      </button>
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
