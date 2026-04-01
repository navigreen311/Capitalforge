'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FocusTrap } from '../ui/focus-trap';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  merchant: string;
  mcc: string;
  category: string;
  amount: number;
  date: string;
  riskScore: number;
  flags: string[];
  businessPurpose: string | null;
  card: string;
  violations?: string[];
}

export interface TransactionDetailModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onSavePurpose: (txnId: string, purpose: string) => void;
  onMarkReviewed: (txnId: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getRiskColor(score: number): string {
  if (score < 30) return 'bg-emerald-500';
  if (score <= 70) return 'bg-amber-500';
  return 'bg-red-500';
}

function getRiskLabel(score: number): string {
  if (score < 30) return 'Low';
  if (score <= 70) return 'Medium';
  return 'High';
}

function getRiskTextColor(score: number): string {
  if (score < 30) return 'text-emerald-400';
  if (score <= 70) return 'text-amber-400';
  return 'text-red-400';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function estimateCashAdvanceFee(amount: number): string {
  const low = amount * 0.03;
  const high = amount * 0.05;
  return `${formatCurrency(low)}–${formatCurrency(high)}`;
}

// ─── TransactionDetailModal ─────────────────────────────────────────────────────

export function TransactionDetailModal({
  transaction,
  isOpen,
  onClose,
  onSavePurpose,
  onMarkReviewed,
}: TransactionDetailModalProps) {
  const [purpose, setPurpose] = useState('');

  // Sync textarea with transaction data when modal opens or transaction changes
  useEffect(() => {
    if (transaction) {
      setPurpose(transaction.businessPurpose ?? '');
    }
  }, [transaction]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Close on Escape (handled by FocusTrap, but also prevent scroll)
  useEffect(() => {
    if (!isOpen) return;

    // Prevent body scroll while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !transaction) return null;

  const isCashAdvance = transaction.category.toLowerCase() === 'cash advance';

  return (
    <FocusTrap active={isOpen} onEscape={onClose}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="txn-modal-title"
      >
        {/* Modal panel */}
        <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-brand-navy-900 border border-brand-navy-700 shadow-2xl">
          {/* ── Close button ──────────────────────────────────────────────── */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* ── 1. Header ─────────────────────────────────────────────────── */}
          <div className="px-6 pt-6 pb-4 border-b border-brand-navy-700">
            <h2 id="txn-modal-title" className="text-lg font-semibold text-white pr-8">
              {transaction.merchant}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              MCC {transaction.mcc} &middot; {transaction.category}
            </p>
            <div className="flex items-center justify-between mt-3">
              <span className="text-2xl font-bold text-white">
                {formatCurrency(transaction.amount)}
              </span>
              <span className="text-sm text-gray-400">
                {formatDate(transaction.date)}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Card: <span className="text-gray-300">{transaction.card}</span>
            </p>
          </div>

          {/* ── 2. Risk Score Breakdown ────────────────────────────────────── */}
          <div className="px-6 py-4 border-b border-brand-navy-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-300">Risk Score</span>
              <span className={`text-sm font-semibold ${getRiskTextColor(transaction.riskScore)}`}>
                {transaction.riskScore}/100 &middot; {getRiskLabel(transaction.riskScore)}
              </span>
            </div>

            {/* Score bar */}
            <div className="w-full h-2.5 bg-brand-navy-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getRiskColor(transaction.riskScore)}`}
                style={{ width: `${Math.min(transaction.riskScore, 100)}%` }}
              />
            </div>

            {/* Flag badges */}
            {transaction.flags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {transaction.flags.map((flag) => (
                  <span
                    key={flag}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                               bg-red-500/15 text-red-400 border border-red-500/20"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── 3. Network Violations ─────────────────────────────────────── */}
          {transaction.violations && transaction.violations.length > 0 && (
            <div className="px-6 py-4 border-b border-brand-navy-700">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Network Violations</h3>
              <ul className="space-y-1.5">
                {transaction.violations.map((violation, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                    <span className="text-red-300">{violation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── 4. Business Purpose ───────────────────────────────────────── */}
          <div className="px-6 py-4 border-b border-brand-navy-700">
            <label
              htmlFor="business-purpose"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Business Purpose
            </label>
            <textarea
              id="business-purpose"
              rows={3}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Enter the business justification for this transaction..."
              className="w-full rounded-lg bg-brand-navy-800 border border-brand-navy-600
                         text-white placeholder-gray-500 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold
                         resize-none transition-colors"
            />
            <button
              onClick={() => onSavePurpose(transaction.id, purpose)}
              disabled={!purpose.trim()}
              className="mt-2 inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium
                         bg-brand-gold text-brand-navy-900 hover:bg-brand-gold-400
                         disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors"
            >
              Save Purpose
            </button>
          </div>

          {/* ── 5. Cash Advance Fee Alert ─────────────────────────────────── */}
          {isCashAdvance && (
            <div className="px-6 py-3 border-b border-brand-navy-700">
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
                <span className="text-amber-400 flex-shrink-0 text-base leading-none mt-0.5" aria-hidden="true">
                  &#x26A0;
                </span>
                <p className="text-sm text-amber-300">
                  Cash advance fee likely: ~{estimateCashAdvanceFee(transaction.amount)} (3–5%)
                </p>
              </div>
            </div>
          )}

          {/* ── 6. Actions ────────────────────────────────────────────────── */}
          <div className="px-6 py-4 flex items-center justify-between gap-3">
            <button
              onClick={() => onMarkReviewed(transaction.id)}
              className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium
                         bg-emerald-600 text-white hover:bg-emerald-500
                         transition-colors"
            >
              Mark as Reviewed
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium
                         text-gray-400 hover:text-white border border-brand-navy-600
                         hover:border-brand-navy-500 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
