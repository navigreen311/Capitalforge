'use client';

// ============================================================
// ApplicationsTab — Client detail page tab showing all
// applications for a given client with consent/ack chips,
// balance & utilization for approved cards, submit flow
// with pre-submission checklist, and decline handling.
// ============================================================

import { useState, useMemo } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import {
  toApplicationViews,
  summariseGates,
  formatAmount,
  type ApplicationStatus,
  type ApplicationView,
} from '@/lib/applications-view';
import AprCountdown from '@/components/modules/apr-countdown';

// ── Types ───────────────────────────────────────────────────────────────────

interface ApplicationsTabProps {
  clientId: string;
  clientName: string;
}


// ── Status Badge ────────────────────────────────────────────────────────────

const STATUS_BADGE_CONFIG: Record<
  ApplicationStatus,
  { label: string; className: string }
> = {
  approved: {
    label: 'Approved',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  draft: {
    label: 'Draft',
    className: 'bg-gray-50 text-gray-600 border-gray-200',
  },
  submitted: {
    label: 'Submitted',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  declined: {
    label: 'Declined',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
};

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const cfg = STATUS_BADGE_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border text-xs font-medium px-2.5 py-0.5 ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ── Consent & Acknowledgment Chips ──────────────────────────────────────────

// `null` is a third state, not a falsy second one. Rendering an unloaded gate
// as "Missing" would assert that a client's consent is absent from the file.
function ConsentChip({ complete }: { complete: boolean | null }) {
  const className =
    complete === null
      ? 'bg-gray-100 text-gray-700 border-gray-300'
      : complete
        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
        : 'bg-red-100 text-red-800 border-red-300';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>
      Consent: {complete === null ? 'Unknown' : complete ? 'Complete' : 'Missing'}
    </span>
  );
}

function AckChip({ signed }: { signed: boolean | null }) {
  const className =
    signed === null
      ? 'bg-gray-100 text-gray-700 border-gray-300'
      : signed
        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
        : 'bg-amber-100 text-amber-800 border-amber-300';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>
      Ack: {signed === null ? 'Unknown' : signed ? 'Signed' : 'Required'}
    </span>
  );
}

// ── Utilization Bar ─────────────────────────────────────────────────────────

function UtilizationBar({ pct }: { pct: number }) {
  const colorClass =
    pct > 50 ? 'bg-red-500' : pct >= 30 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-10 text-right">
        {pct}%
      </span>
    </div>
  );
}

// ── Pre-Submission Checklist Modal ──────────────────────────────────────────

function PreSubmissionModal({
  appId,
  onClose,
}: {
  appId: string;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('cf_access_token')
          : null;

      const res = await fetch(`/api/v1/applications/${appId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(`Submit failed (${res.status})`);
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Pre-Submission Checklist
        </h3>

        {submitted ? (
          <div className="text-center py-4">
            <div className="text-emerald-600 text-2xl mb-2">&#10003;</div>
            <p className="text-sm text-gray-700 font-medium">
              Application submitted successfully.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy/90 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-600 mt-0.5">&#10003;</span>
                Consent verified
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-600 mt-0.5">&#10003;</span>
                Product-Reality Acknowledgment signed
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-600 mt-0.5">&#10003;</span>
                Business purpose documented
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-amber-500 mt-0.5">&#9888;</span>
                Confirm no misrepresentations
              </li>
            </ul>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Confirm & Submit'}
              </button>
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Decline Reason Section ──────────────────────────────────────────────────

function DeclineSection({
  appId,
  reason,
}: {
  appId: string;
  /** null when no decline reason is on record — the toggle is then hidden. */
  reason: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-3 space-y-2">
      {reason ? (
        <>
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors flex items-center gap-1"
          >
            <span
              className="inline-block transition-transform"
              style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              &#9656;
            </span>
            View Decline Reason
          </button>

          {expanded && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {reason}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500">No decline reason on record.</p>
      )}

      <a
        href={`/applications/${appId}/reconsideration`}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-navy hover:text-brand-navy/80 transition-colors"
      >
        Start Reconsideration &rarr;
      </a>
    </div>
  );
}

// ── Card Skeleton ───────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-gray-200 rounded w-3/5" />
          <div className="h-3 bg-gray-100 rounded w-2/5" />
        </div>
        <div className="h-6 w-20 bg-gray-200 rounded-full" />
      </div>
      <div className="flex gap-2">
        <div className="h-5 w-28 bg-gray-100 rounded-full" />
        <div className="h-5 w-24 bg-gray-100 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-4/5" />
      </div>
    </div>
  );
}

function LoadingSkeletons() {
  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

// ── Currency Formatter ──────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ── Application Card ────────────────────────────────────────────────────────

function ApplicationCard({ app }: { app: ApplicationView }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-card overflow-hidden">
        <div className="p-5 space-y-4">
          {/* Header: product name + status */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                {app.cardProduct}
              </h4>
              <p className="text-xs text-gray-500">{app.issuer}</p>
            </div>
            <StatusBadge status={app.status} />
          </div>

          {/* Amounts */}
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-500">Requested: </span>
              <span className="font-medium text-gray-800">
                {formatAmount(app.requestedAmount)}
              </span>
            </div>
            {app.approvedAmount !== null && (
              <div>
                <span className="text-gray-500">Approved: </span>
                <span className="font-semibold text-emerald-700">
                  {formatAmount(app.approvedAmount)}
                </span>
              </div>
            )}
          </div>

          {/* Consent & Ack chips */}
          <div className="flex flex-wrap gap-2">
            <ConsentChip complete={app.consentComplete} />
            <AckChip signed={app.ackSigned} />
          </div>

          {/* Card account detail — balance, utilisation, APR expiry — is not
              modelled behind this endpoint. It previously defaulted to $0 and
              0% utilisation, which reads as a healthy, unused card rather
              than as an unknown one. */}
          {app.status === 'approved' && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Balance, utilisation and APR expiry are not available for this card.
              </p>
            </div>
          )}

          {/* Draft-specific: submit button */}
          {app.status === 'draft' && (
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={() => setShowModal(true)}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy/90 transition-colors"
              >
                Submit Application
              </button>
            </div>
          )}

          {/* Declined-specific: the list endpoint carries no decline reason,
              so none is asserted. */}
          {app.status === 'declined' && (
            <div className="pt-2 border-t border-gray-100">
              <DeclineSection appId={app.id} reason={null} />
            </div>
          )}
        </div>
      </div>

      {/* Pre-submission modal */}
      {showModal && (
        <PreSubmissionModal
          appId={app.id}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function ApplicationsTab({
  clientId,
  clientName,
}: ApplicationsTabProps) {
  // The list endpoint is business-scoped; consent/acknowledgment status is a
  // property of the business, so it comes from the compliance gate.
  const { data, isLoading, error, refetch } = useAuthFetch<unknown>(
    `/api/applications`,
    { businessId: clientId },
  );
  const { data: gateData } = useAuthFetch<unknown>(
    `/api/applications/compliance-gate/${clientId}`,
  );

  const applications = useMemo(
    () => toApplicationViews(data, summariseGates(gateData)),
    [data, gateData],
  );

  return (
    <section aria-label={`Applications for ${clientName}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Applications</h2>
        <a
          href={`/applications/new?client_id=${clientId}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy/90 transition-colors"
        >
          + New Application
        </a>
      </div>

      {/* Cards */}
      {isLoading ? (
        <LoadingSkeletons />
      ) : error ? (
        <DashboardErrorState error={error} onRetry={refetch} />
      ) : applications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-sm font-medium text-gray-700">No applications yet</p>
          <p className="mt-1 text-xs text-gray-500">
            This client has not applied for any cards.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {applications.map((app) => (
            <ApplicationCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </section>
  );
}
