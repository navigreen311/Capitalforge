'use client';

// ============================================================
// RoundActionButtons — Per-round action buttons for the
// funding rounds list page. Provides:
//   - "+ Add Card Application" (navigates with round pre-filled)
//   - "Export Dossier PDF" (generates text summary, triggers download)
//   - "Close Round" (confirmation modal, updates status)
//   - "View Full Detail" (navigates to /funding-rounds/[id])
// ============================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FocusTrap } from '@/components/ui/focus-trap';
import { useToast } from '@/components/global/ToastProvider';

// ── Types ───────────────────────────────────────────────────────────────────

interface RoundApplication {
  id: string;
  cardProduct: string;
  issuer: string;
  approvedLimit: number;
  aprExpiresAt: string;
  regularApr: number;
  balance: number;
  annualFee?: number;
  cashAdvanceFee?: number;
  status?: string;
}

export interface RoundActionButtonsProps {
  roundId: string;
  businessId: string;
  businessName: string;
  roundNumber: number;
  status: string;
  obtainedAmount: number;
  targetAmount: number;
  startedAt: string;
  targetCloseAt: string;
  advisorName: string;
  applications: RoundApplication[];
  totalFees?: number;
  effectiveApr?: number;
  notes?: string;
  onStatusChange?: (roundId: string, newStatus: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Dossier PDF generator ───────────────────────────────────────────────────

function generateDossierText(props: RoundActionButtonsProps): string {
  const pct =
    props.targetAmount > 0
      ? Math.round((props.obtainedAmount / props.targetAmount) * 100)
      : 0;

  const lines: string[] = [
    '========================================',
    '  FUNDING ROUND DOSSIER',
    '========================================',
    '',
    `Round:          Round ${props.roundNumber}`,
    `Client:         ${props.businessName}`,
    `Status:         ${props.status.replace(/_/g, ' ').toUpperCase()}`,
    `Advisor:        ${props.advisorName}`,
    '',
    '--- Progress ---',
    `Target:         ${formatCurrency(props.targetAmount)}`,
    `Obtained:       ${formatCurrency(props.obtainedAmount)} (${pct}%)`,
    `Started:        ${formatDate(props.startedAt)}`,
    `Target Close:   ${formatDate(props.targetCloseAt)}`,
    '',
  ];

  if (props.totalFees != null || props.effectiveApr != null) {
    lines.push('--- Cost of Capital ---');
    if (props.totalFees != null) {
      lines.push(`Total Fees:     ${formatCurrency(props.totalFees)}`);
    }
    if (props.effectiveApr != null) {
      lines.push(`Effective APR:  ${props.effectiveApr}%`);
    }
    lines.push('');
  }

  if (props.notes) {
    lines.push('--- Notes ---');
    lines.push(props.notes);
    lines.push('');
  }

  if (props.applications.length > 0) {
    lines.push('--- Card Applications ---');
    lines.push(
      `${'Card'.padEnd(30)} ${'Issuer'.padEnd(15)} ${'Limit'.padStart(12)} ${'Balance'.padStart(12)} ${'APR'.padStart(8)} ${'Status'.padStart(10)}`,
    );
    lines.push('-'.repeat(92));

    for (const app of props.applications) {
      lines.push(
        `${app.cardProduct.padEnd(30)} ${app.issuer.padEnd(15)} ${formatCurrency(app.approvedLimit).padStart(12)} ${formatCurrency(app.balance).padStart(12)} ${(app.regularApr + '%').padStart(8)} ${(app.status ?? 'draft').padStart(10)}`,
      );
    }

    const totalLimit = props.applications.reduce(
      (s, a) => s + a.approvedLimit,
      0,
    );
    const totalBalance = props.applications.reduce(
      (s, a) => s + a.balance,
      0,
    );
    lines.push('-'.repeat(92));
    lines.push(
      `${'TOTAL'.padEnd(30)} ${''.padEnd(15)} ${formatCurrency(totalLimit).padStart(12)} ${formatCurrency(totalBalance).padStart(12)}`,
    );
    lines.push('');
  }

  lines.push('========================================');
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push('========================================');

  return lines.join('\n');
}

function downloadDossier(props: RoundActionButtonsProps): void {
  const text = generateDossierText(props);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `round-${props.roundNumber}-${props.businessName.replace(/\s+/g, '-').toLowerCase()}-dossier-${todayIso()}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Component ───────────────────────────────────────────────────────────────

export function RoundActionButtons(props: RoundActionButtonsProps) {
  const {
    roundId,
    businessId,
    businessName,
    roundNumber,
    status,
    obtainedAmount,
    targetAmount,
    onStatusChange,
  } = props;

  const router = useRouter();
  const toast = useToast();
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const isInProgress = status === 'in_progress';
  const pct =
    targetAmount > 0
      ? Math.round((obtainedAmount / targetAmount) * 100)
      : 0;

  // Prevent body scroll while modal is open
  useEffect(() => {
    if (!showCloseModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showCloseModal]);

  const handleAddApplication = useCallback(() => {
    router.push(
      `/applications/new?client_id=${encodeURIComponent(businessId)}&round_id=${encodeURIComponent(roundId)}`,
    );
  }, [router, businessId, roundId]);

  const handleExportDossier = useCallback(() => {
    downloadDossier(props);
    toast.success(`Dossier exported for Round ${roundNumber}`);
  }, [props, roundNumber, toast]);

  const handleViewDetail = useCallback(() => {
    router.push(`/funding-rounds/${roundId}`);
  }, [router, roundId]);

  const handleOpenCloseModal = useCallback(() => {
    setShowCloseModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    if (isClosing) return;
    setShowCloseModal(false);
  }, [isClosing]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) {
        handleCloseModal();
      }
    },
    [handleCloseModal],
  );

  const handleConfirmClose = useCallback(async () => {
    setIsClosing(true);
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('cf_access_token')
          : null;

      await fetch(`/api/v1/funding-rounds/${roundId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: 'completed' }),
      });

      toast.success(`Round ${roundNumber} for ${businessName} has been closed`);
      onStatusChange?.(roundId, 'completed');
      setShowCloseModal(false);
    } catch (err) {
      console.error('[RoundActionButtons] Failed to close round:', err);
      toast.error('Failed to close round. Please try again.');
    } finally {
      setIsClosing(false);
    }
  }, [roundId, roundNumber, businessName, onStatusChange, toast]);

  return (
    <>
      {/* Action buttons row */}
      <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-gray-800">
        {/* Add Card Application */}
        <button
          type="button"
          onClick={handleAddApplication}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                     rounded-lg bg-[#C9A84C]/15 text-[#C9A84C] border border-[#C9A84C]/30
                     hover:bg-[#C9A84C]/25 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Application
        </button>

        {/* Export Dossier */}
        <button
          type="button"
          onClick={handleExportDossier}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                     rounded-lg bg-gray-800 text-gray-300 border border-gray-700
                     hover:bg-gray-700 hover:text-gray-200 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export Dossier
        </button>

        {/* Close Round — only if in_progress */}
        {isInProgress && (
          <button
            type="button"
            onClick={handleOpenCloseModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                       rounded-lg bg-red-900/30 text-red-400 border border-red-800/50
                       hover:bg-red-900/50 hover:text-red-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Close Round
          </button>
        )}

        {/* View Full Detail */}
        <button
          type="button"
          onClick={handleViewDetail}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                     rounded-lg bg-blue-900/30 text-blue-400 border border-blue-800/50
                     hover:bg-blue-900/50 hover:text-blue-300 transition-colors ml-auto"
        >
          View Full Detail
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>

      {/* ── Close Round Confirmation Modal ──────────────────────────────── */}
      {showCloseModal && (
        <FocusTrap active={showCloseModal} onEscape={handleCloseModal}>
          <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={handleOverlayClick}
            role="dialog"
            aria-modal="true"
            aria-label={`Close Round ${roundNumber}`}
          >
            <div className="w-full max-w-md rounded-xl bg-gray-900 border border-gray-700 shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">
                  Close Round {roundNumber}
                </h2>
                <button
                  onClick={handleCloseModal}
                  disabled={isClosing}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
                  aria-label="Close dialog"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-3">
                <p className="text-sm text-gray-300">
                  Are you sure you want to close{' '}
                  <span className="font-semibold text-white">
                    Round {roundNumber}
                  </span>{' '}
                  for{' '}
                  <span className="font-semibold text-white">
                    {businessName}
                  </span>
                  ?
                </p>
                <div className="rounded-lg bg-gray-800/60 border border-gray-700 p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Obtained</span>
                    <span className="text-gray-200 font-semibold">
                      {formatCurrency(obtainedAmount)} of{' '}
                      {formatCurrency(targetAmount)} ({pct}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Applications</span>
                    <span className="text-gray-200 font-semibold">
                      {props.applications.length}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  This will set the round status to <span className="text-green-400 font-medium">Completed</span>.
                  No new applications can be added after closing.
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-gray-700 px-6 py-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isClosing}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClose}
                  disabled={isClosing}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                >
                  {isClosing ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Closing...
                    </span>
                  ) : (
                    'Close Round'
                  )}
                </button>
              </div>
            </div>
          </div>
        </FocusTrap>
      )}
    </>
  );
}
