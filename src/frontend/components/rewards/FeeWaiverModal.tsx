'use client';

// ============================================================
// FeeWaiverModal — Retention call workflow modal. Shows an
// issuer-specific retention script (phone number, opening line,
// ask, fallback line), success rate estimate, and a
// "Schedule Retention Call" button that fires a toast.
// ============================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FocusTrap } from '@/components/ui/focus-trap';

// ─── Issuer retention data ──────────────────────────────────────────────────

export interface RetentionScript {
  phone: string;
  openingLine: string;
  ask: string;
  fallbackLine: string;
  successRate: number; // 0–100
}

export const ISSUER_RETENTION_SCRIPTS: Record<string, RetentionScript> = {
  Chase: {
    phone: '1-800-432-3117',
    openingLine:
      "Hi, I've been a Chase customer for several years and I really enjoy my card benefits.",
    ask: "I noticed my annual fee is coming up. I'm considering whether to keep the card. Are there any retention offers, bonus points, or fee credits available for loyal customers?",
    fallbackLine:
      "I understand. Could you check if there's a product change option to a no-annual-fee card so I can keep my account history?",
    successRate: 68,
  },
  'American Express': {
    phone: '1-800-528-4800',
    openingLine:
      "Hello, I'm calling about my account. I've been an Amex member and I value the relationship.",
    ask: "My annual fee renewal is approaching and I'd like to discuss retention offers. Do you have any statement credits, bonus points, or fee waivers available for my account?",
    fallbackLine:
      "If there's nothing available now, could you note my request and let me know if any offers become available in the next 30 days?",
    successRate: 72,
  },
  Citibank: {
    phone: '1-800-950-5114',
    openingLine:
      "Hi, I'm a long-time Citi cardholder and I'd like to discuss my account.",
    ask: "With my annual fee renewal coming up, I'm evaluating whether the card still makes sense. Are there retention offers like a fee waiver, statement credit, or bonus miles available?",
    fallbackLine:
      "Could I be transferred to the retention or loyalty department? I'd like to explore all options before making a decision.",
    successRate: 55,
  },
  'Bank of America': {
    phone: '1-800-732-9194',
    openingLine:
      "Hello, I'm calling about my Bank of America card. I've been a customer for a while and enjoy banking with you.",
    ask: "I'm reviewing my annual fee and wondering if there are any retention incentives — perhaps a fee reduction, bonus cash back, or statement credit?",
    fallbackLine:
      "If no offers are available, could you help me look at downgrading to a no-fee card while keeping my credit history intact?",
    successRate: 48,
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FeeWaiverModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardName: string;
  issuer: string;
  annualFee: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function getScript(issuer: string): RetentionScript | null {
  return ISSUER_RETENTION_SCRIPTS[issuer] ?? null;
}

function successRateColor(rate: number): string {
  if (rate >= 65) return 'text-emerald-400';
  if (rate >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function successRateBg(rate: number): string {
  if (rate >= 65) return 'bg-emerald-400';
  if (rate >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FeeWaiverModal({
  isOpen,
  onClose,
  cardName,
  issuer,
  annualFee,
}: FeeWaiverModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) setToastMessage(null);
  }, [isOpen]);

  // Prevent body scroll
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  const handleScheduleCall = useCallback(() => {
    setToastMessage(`Retention call scheduled for ${cardName} (${issuer})`);
  }, [cardName, issuer]);

  if (!isOpen) return null;

  const script = getScript(issuer);

  return (
    <FocusTrap active={isOpen} onEscape={onClose}>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={handleOverlayClick}
        role="dialog"
        aria-modal="true"
        aria-label={`Fee waiver workflow for ${cardName}`}
      >
        {/* Panel */}
        <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-gray-900 border border-gray-700 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Fee Waiver Retention Script
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {cardName} &middot; {formatCurrency(annualFee)} annual fee
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400
                         hover:bg-gray-800 hover:text-gray-200 transition-colors"
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
          <div className="px-6 py-5 space-y-4">
            {script ? (
              <>
                {/* Phone number */}
                <div className="flex items-center gap-3 rounded-lg bg-gray-800 border border-gray-600 px-4 py-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-emerald-400 shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                  </svg>
                  <div>
                    <p className="text-xs text-gray-400">
                      {issuer} Retention / Customer Service
                    </p>
                    <p className="text-sm font-semibold text-white">
                      {script.phone}
                    </p>
                  </div>
                </div>

                {/* Success rate */}
                <div className="rounded-lg bg-gray-800 border border-gray-600 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Estimated Success Rate
                    </p>
                    <span className={`text-sm font-bold ${successRateColor(script.successRate)}`}>
                      {script.successRate}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-700">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${successRateBg(script.successRate)}`}
                      style={{ width: `${script.successRate}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    Based on community-reported data for {issuer} retention calls
                  </p>
                </div>

                {/* Script steps */}
                <div className="space-y-3">
                  <ScriptStep
                    step={1}
                    label="Opening Line"
                    text={script.openingLine}
                  />
                  <ScriptStep
                    step={2}
                    label="The Ask"
                    text={script.ask}
                  />
                  <ScriptStep
                    step={3}
                    label="Fallback (if declined)"
                    text={script.fallbackLine}
                  />
                </div>
              </>
            ) : (
              <div className="rounded-lg bg-gray-800 border border-gray-600 px-4 py-6 text-center">
                <p className="text-sm text-gray-300">
                  No retention script available for{' '}
                  <span className="font-semibold text-white">{issuer}</span>.
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Contact the issuer directly to negotiate your annual fee.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 border-t border-gray-700 px-6 py-4">
            <button
              type="button"
              className="flex-1 rounded-lg bg-brand-gold px-4 py-2.5 text-sm font-semibold
                         text-brand-navy hover:bg-brand-gold/90 transition-colors"
              onClick={handleScheduleCall}
            >
              Schedule Retention Call
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-medium
                         text-gray-200 hover:bg-gray-600 transition-colors"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        {/* Toast */}
        {toastMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-lg
                          bg-emerald-600 px-5 py-3 text-sm font-medium text-white
                          shadow-lg animate-fade-in">
            {toastMessage}
          </div>
        )}
      </div>
    </FocusTrap>
  );
}

// ─── Script step sub-component ───────────────────────────────────────────────

function ScriptStep({
  step,
  label,
  text,
}: {
  step: number;
  label: string;
  text: string;
}) {
  return (
    <div className="rounded-lg bg-gray-800 border border-gray-600 px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full
                     bg-brand-gold/20 text-brand-gold text-[10px] font-bold"
        >
          {step}
        </span>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </p>
      </div>
      <p className="text-sm text-gray-200 leading-relaxed italic pl-7">
        &ldquo;{text}&rdquo;
      </p>
    </div>
  );
}
