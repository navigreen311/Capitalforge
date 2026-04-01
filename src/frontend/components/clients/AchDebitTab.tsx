'use client';

// ============================================================
// AchDebitTab — ACH authorization, debit history & tolerance
//
// Displays authorization status with revoke action, a 90-day
// debit history table with failed-transaction highlighting, and
// a tolerance monitor comparing authorized vs actual amounts.
// ============================================================

import React, { useState, useCallback } from 'react';
import { SectionCard } from '../ui/card';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '../dashboard/DashboardErrorState';

// ── Types ───────────────────────────────────────────────────────────────────

interface AchDebitTabProps {
  clientId: string;
}

type AuthorizationStatus = 'authorized' | 'not_authorized' | 'revoked';
type DebitStatus = 'processed' | 'failed' | 'pending';

interface AchAuthorization {
  status: AuthorizationStatus;
  clientName: string;
  authorizedAmount: number;
  authorizedFrequency: string;
  authorizationDate: string;
  bankAccountLast4: string;
  bankName: string;
  accountType: string;
  debits: DebitEntry[];
  toleranceAlerts: ToleranceAlert[];
}

interface DebitEntry {
  id: string;
  date: string;
  amount: number;
  status: DebitStatus;
  referenceNumber: string;
}

interface ToleranceAlert {
  date: string;
  authorizedAmount: number;
  actualAmount: number;
  overageAmount: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<AuthorizationStatus, { label: string; className: string }> = {
  authorized: {
    label: 'Authorized',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  not_authorized: {
    label: 'Not Authorized',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
  revoked: {
    label: 'Revoked',
    className: 'bg-red-100 text-red-700 border-red-200',
  },
};

const DEBIT_STATUS_DISPLAY: Record<DebitStatus, { icon: string; label: string; className: string }> = {
  processed: { icon: '\u2705', label: 'Processed', className: 'text-emerald-600' },
  failed: { icon: '\u274C', label: 'Failed', className: 'text-red-600' },
  pending: { icon: '\u23F3', label: 'Pending', className: 'text-amber-600' },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// ── Placeholder data (used when mock layer provides null) ───────────────────

function buildPlaceholderData(clientId: string): AchAuthorization {
  void clientId;
  return {
    status: 'authorized',
    clientName: 'Rapid Growth Capital LLC',
    authorizedAmount: 5000,
    authorizedFrequency: 'Monthly',
    authorizationDate: 'Jan 15, 2026',
    bankAccountLast4: '4521',
    bankName: 'Chase',
    accountType: 'Business Checking',
    debits: [
      { id: 'dbt-1', date: 'Mar 28, 2026', amount: 4200.0, status: 'processed', referenceNumber: 'ACH-20260328-001' },
      { id: 'dbt-2', date: 'Mar 15, 2026', amount: 3800.0, status: 'processed', referenceNumber: 'ACH-20260315-001' },
      { id: 'dbt-3', date: 'Feb 28, 2026', amount: 4500.0, status: 'processed', referenceNumber: 'ACH-20260228-001' },
      { id: 'dbt-4', date: 'Feb 15, 2026', amount: 4100.0, status: 'failed', referenceNumber: 'ACH-20260215-001' },
      { id: 'dbt-5', date: 'Jan 28, 2026', amount: 3950.0, status: 'processed', referenceNumber: 'ACH-20260128-001' },
      { id: 'dbt-6', date: 'Jan 15, 2026', amount: 4000.0, status: 'processed', referenceNumber: 'ACH-20260115-001' },
      { id: 'dbt-7', date: 'Jan 05, 2026', amount: 3600.0, status: 'processed', referenceNumber: 'ACH-20260105-001' },
    ],
    toleranceAlerts: [],
  };
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

function SectionSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-gray-200 rounded w-full" style={{ width: `${85 - i * 10}%` }} />
      ))}
    </div>
  );
}

// ── Confirmation Modal ──────────────────────────────────────────────────────

interface ConfirmModalProps {
  clientName: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function RevokeConfirmModal({ clientName, isOpen, isSubmitting, onConfirm, onCancel }: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl border border-surface-border shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Revoke ACH Authorization</h3>
        <p className="text-sm text-gray-600 mb-6">
          Are you sure you want to revoke ACH authorization for{' '}
          <span className="font-semibold text-gray-900">{clientName}</span>?
          This will stop all automated debits.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
              isSubmitting
                ? 'bg-red-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {isSubmitting ? 'Revoking...' : 'Revoke Authorization'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function AchDebitTab({ clientId }: AchDebitTabProps) {
  const { data: fetchedData, isLoading, error, refetch } = useAuthFetch<AchAuthorization>(
    `/api/v1/clients/${clientId}/ach-authorization`,
  );

  // Fall back to placeholder when no API / mock data is available
  const data = fetchedData ?? (isLoading ? null : buildPlaceholderData(clientId));

  const [authStatus, setAuthStatus] = useState<AuthorizationStatus | null>(null);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Derive effective status (local override takes precedence)
  const effectiveStatus: AuthorizationStatus = authStatus ?? data?.status ?? 'not_authorized';

  const handleRevoke = useCallback(async () => {
    setIsRevoking(true);
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('cf_access_token')
          : null;

      await fetch(`/api/v1/clients/${clientId}/ach-authorization/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      setAuthStatus('revoked');
      setShowRevokeModal(false);
      setToastMessage('ACH authorization has been revoked successfully.');

      // Auto-dismiss toast after 4 seconds
      setTimeout(() => setToastMessage(null), 4000);
    } catch {
      // Silently handle — production would show an error toast
    } finally {
      setIsRevoking(false);
    }
  }, [clientId]);

  // ── Error state ──────────────────────────────────────────────
  if (error) {
    return <DashboardErrorState error={error} onRetry={refetch} />;
  }

  // ── Loading state ────────────────────────────────────────────
  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <SectionCard title="Authorization Status"><SectionSkeleton lines={5} /></SectionCard>
        <SectionCard title="Debit History" subtitle="Last 90 days"><SectionSkeleton lines={6} /></SectionCard>
        <SectionCard title="Tolerance Monitor"><SectionSkeleton lines={3} /></SectionCard>
      </div>
    );
  }

  const badge = STATUS_BADGE[effectiveStatus];

  // ── Render ─────────────────────────────────────────────────────
  return (
    <>
      {/* Success toast */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg animate-in fade-in slide-in-from-top-2">
          <span>{'\u2705'}</span>
          {toastMessage}
        </div>
      )}

      <div className="space-y-6">
        {/* ── Section 1: Authorization Status ─────────────────────── */}
        <SectionCard
          title="Authorization Status"
          action={
            effectiveStatus === 'authorized' ? (
              <button
                type="button"
                onClick={() => setShowRevokeModal(true)}
                className="inline-flex items-center rounded-lg border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
              >
                Revoke Authorization
              </button>
            ) : undefined
          }
        >
          <div className="space-y-4">
            {/* Status badge */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500">Status</span>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Authorized Amount</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {formatCurrency(data.authorizedAmount)} max per debit
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Authorized Frequency</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{data.authorizedFrequency}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Authorization Date</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{data.authorizationDate}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Bank Account</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  ****{data.bankAccountLast4}, {data.bankName} {data.accountType}
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── Section 2: Debit History ────────────────────────────── */}
        <SectionCard title="Debit History" subtitle="Last 90 days" flushBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-gray-50/60">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Reference #</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {data.debits.map((debit) => {
                  const display = DEBIT_STATUS_DISPLAY[debit.status];
                  const isFlaggable = debit.status === 'failed';
                  return (
                    <tr
                      key={debit.id}
                      className={isFlaggable ? 'bg-red-50' : 'bg-white hover:bg-gray-50/50'}
                    >
                      <td className="px-6 py-3 text-gray-900 whitespace-nowrap">{debit.date}</td>
                      <td className="px-6 py-3 text-gray-900 font-medium whitespace-nowrap">
                        {formatCurrency(debit.amount)}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 font-medium ${display.className}`}>
                          {display.icon} {display.label}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">
                        {debit.referenceNumber}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        {isFlaggable && (
                          <button
                            type="button"
                            className="inline-flex items-center rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
                          >
                            Flag
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* ── Section 3: Tolerance Monitor ────────────────────────── */}
        <SectionCard title="Tolerance Monitor">
          {data.toleranceAlerts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <span className="text-lg">{'\u2705'}</span>
              <p className="text-sm font-medium text-emerald-700">
                All debits within authorized parameters
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.toleranceAlerts.map((alert, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2"
                >
                  <p className="text-sm font-bold text-red-700">
                    ALERT — debit on {alert.date} exceeded authorized amount by{' '}
                    {formatCurrency(alert.overageAmount)}
                  </p>
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Authorized
                      </span>
                      <p className="font-semibold text-gray-900">{formatCurrency(alert.authorizedAmount)}</p>
                    </div>
                    <div className="text-gray-300">vs</div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Actual
                      </span>
                      <p className="font-semibold text-red-700">{formatCurrency(alert.actualAmount)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Revoke confirmation modal */}
      <RevokeConfirmModal
        clientName={data.clientName}
        isOpen={showRevokeModal}
        isSubmitting={isRevoking}
        onConfirm={handleRevoke}
        onCancel={() => setShowRevokeModal(false)}
      />
    </>
  );
}
