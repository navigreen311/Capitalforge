'use client';

/**
 * SaveFundingPlanButton — Persists optimizer sequencing rounds as a
 * client funding plan via the API and provides navigation to the
 * Funding Rounds page on success.
 */

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SaveFundingPlanRound {
  round: number;
  cards: string[];
  creditMin: number;
  creditMax: number;
  waitDays: number | null;
}

export interface SaveFundingPlanButtonProps {
  clientId: string | null;
  clientName: string | null;
  rounds: SaveFundingPlanRound[];
  onSaved?: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function emitToast(message: string, type: 'success' | 'error') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('cf:toast', { detail: { message, type } }),
    );
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SaveFundingPlanButton({
  clientId,
  clientName,
  rounds,
  onSaved,
}: SaveFundingPlanButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'saved'>('idle');

  const handleSave = useCallback(async () => {
    if (!clientId || status === 'loading') return;

    setStatus('loading');

    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('cf_access_token')
          : null;

      await apiClient.post(
        `/v1/clients/${clientId}/funding-plans`,
        {
          rounds: rounds.map((r) => ({
            round: r.round,
            cards: r.cards,
            estimated_credit_min: r.creditMin,
            estimated_credit_max: r.creditMax,
            wait_days: r.waitDays,
          })),
        },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );

      setStatus('saved');
      emitToast(
        `${rounds.length}-round funding plan saved to ${clientName ?? 'client'}`,
        'success',
      );
      onSaved?.();
    } catch (err) {
      console.error('[SaveFundingPlanButton] Failed to save plan:', err);
      emitToast('Failed to save funding plan. Please try again.', 'error');
      setStatus('idle');
    }
  }, [clientId, clientName, rounds, status, onSaved]);

  const isDisabled = !clientId;

  // ── Saved state — link to funding rounds ──────────────────────────────

  if (status === 'saved') {
    return (
      <Link
        href="/funding-rounds"
        className="
          group inline-flex items-center justify-center gap-2 w-full
          rounded-xl px-5 py-3 text-sm font-semibold
          bg-emerald-500/15 text-emerald-400 border border-emerald-500/25
          hover:bg-emerald-500/25 transition-all duration-150
        "
      >
        <span aria-hidden="true">&#x2705;</span>
        Plan Saved &mdash; View in Funding Rounds
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 opacity-60 group-hover:translate-x-0.5 transition-transform"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </Link>
    );
  }

  // ── Default / loading state ───────────────────────────────────────────

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={handleSave}
        disabled={isDisabled || status === 'loading'}
        className={`
          w-full rounded-xl px-5 py-3 text-sm font-semibold
          transition-all duration-150
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold
          disabled:opacity-50 disabled:cursor-not-allowed
          ${
            isDisabled
              ? 'bg-gray-700 text-gray-400 border border-gray-600'
              : 'bg-brand-gold text-brand-navy-900 hover:bg-brand-gold-600 shadow-md hover:shadow-lg'
          }
        `}
        aria-label={
          isDisabled
            ? 'Select a client to save the funding plan'
            : 'Save as Funding Plan'
        }
      >
        {status === 'loading' ? (
          <span className="flex items-center justify-center gap-2">
            <span
              className="inline-block w-4 h-4 rounded-full border-2 border-brand-navy-900/30 border-t-brand-navy-900 animate-spin"
              aria-hidden="true"
            />
            Saving&hellip;
          </span>
        ) : (
          'Save as Funding Plan'
        )}
      </button>

      {/* Disabled tooltip */}
      {isDisabled && (
        <div
          role="tooltip"
          className="
            pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
            whitespace-nowrap rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-gray-300
            opacity-0 group-hover:opacity-100 transition-opacity duration-150
            shadow-lg border border-white/10
          "
        >
          Select a client to save the funding plan
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
