'use client';

/**
 * RoundCompletionWorkflow — Mark Complete button + confirmation modal + Start Next Round CTA
 *
 * Provides the end-of-round workflow for a funding round:
 *  1. "Mark Complete" button (visible when in_progress and >= 80% progress)
 *  2. Confirmation modal with re-stack eligibility note
 *  3. "Plan Round N+1" CTA (visible when completed or on-track, if readiness >= 75)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FocusTrap } from '@/components/ui/focus-trap';
import { apiClient } from '@/lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface RoundCompletionWorkflowProps {
  roundId: string;
  clientId: string;
  clientName: string;
  roundNumber: number;
  status: string;
  progressPct: number;
  obtainedAmount: number;
  targetAmount: number;
  clientReadinessScore: number;
  onStatusChange?: (newStatus: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function RoundCompletionWorkflow({
  roundId,
  clientId,
  clientName,
  roundNumber,
  status,
  progressPct,
  obtainedAmount,
  targetAmount,
  clientReadinessScore,
  onStatusChange,
}: RoundCompletionWorkflowProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const isInProgress = status === 'in_progress';
  const isCompleted = status === 'completed';
  const isOnTrack = isInProgress && progressPct >= 80;

  const showMarkComplete = isOnTrack;
  const showNextRoundCta = (isCompleted || isOnTrack) && clientReadinessScore >= 75;

  // Prevent body scroll while modal is open
  useEffect(() => {
    if (!isModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isModalOpen]);

  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    if (isSubmitting) return;
    setIsModalOpen(false);
  }, [isSubmitting]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) {
        handleCloseModal();
      }
    },
    [handleCloseModal],
  );

  const handleConfirm = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('cf_access_token')
          : null;

      await apiClient.patch(`/v1/funding-rounds/${roundId}`, { status: 'completed' }, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      // Success toast via CapitalForge custom event system
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('cf:toast', {
            detail: {
              message: `Round ${roundNumber} marked as complete`,
              type: 'success',
            },
          }),
        );
      }

      onStatusChange?.('completed');
      setIsModalOpen(false);
    } catch (err) {
      console.error('[RoundCompletionWorkflow] Failed to mark round complete:', err);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('cf:toast', {
            detail: {
              message: 'Failed to mark round as complete. Please try again.',
              type: 'error',
            },
          }),
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [roundId, roundNumber, onStatusChange]);

  const handlePlanNextRound = useCallback(() => {
    router.push(
      `/funding-rounds/new?client_id=${encodeURIComponent(clientId)}&round_number=${roundNumber + 1}`,
    );
  }, [router, clientId, roundNumber]);

  // Nothing to render if neither action is visible
  if (!showMarkComplete && !showNextRoundCta) return null;

  return (
    <>
      {/* ── Action buttons ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {showMarkComplete && (
          <button
            type="button"
            className="btn-primary"
            onClick={handleOpenModal}
          >
            Mark Complete
          </button>
        )}

        {showNextRoundCta && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-gray-600">
              Round {roundNumber} is on track &mdash; ready to plan Round{' '}
              {roundNumber + 1}?
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={handlePlanNextRound}
            >
              Plan Round {roundNumber + 1} &rarr;
            </button>
          </div>
        )}
      </div>

      {/* ── Confirmation modal ─────────────────────────────────────────────── */}
      {isModalOpen && (
        <FocusTrap active={isModalOpen} onEscape={handleCloseModal}>
          <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={handleOverlayClick}
            role="dialog"
            aria-modal="true"
            aria-label={`Mark Round ${roundNumber} as complete`}
          >
            <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Complete Round {roundNumber}
                </h2>
                <button
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-surface-overlay hover:text-gray-700 transition-colors"
                  aria-label="Close"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
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
                <p className="text-sm text-gray-700">
                  Round {roundNumber} obtained{' '}
                  <span className="font-semibold">
                    {formatCurrency(obtainedAmount)}
                  </span>{' '}
                  of{' '}
                  <span className="font-semibold">
                    {formatCurrency(targetAmount)}
                  </span>{' '}
                  ({progressPct}%). Mark as complete?
                </p>
                <p className="text-sm text-gray-500">
                  This will trigger the re-stack eligibility assessment for{' '}
                  <span className="font-medium text-gray-700">
                    {clientName}
                  </span>
                  .
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-surface-border px-6 py-4">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="h-4 w-4 animate-spin"
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
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                      </svg>
                      Completing...
                    </span>
                  ) : (
                    'Confirm'
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
