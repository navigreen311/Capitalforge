'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FocusTrap } from '@/components/ui/focus-trap';

// ─── Issuer customer service numbers ────────────────────────────────────────

export const ISSUER_CUSTOMER_SERVICE: Record<string, string> = {
  'Chase':              '1-800-432-3117',
  'American Express':   '1-800-528-4800',
  'Capital One':        '1-800-227-4825',
  'Citi':               '1-800-950-5114',
  'Bank of America':    '1-800-732-9194',
  'Discover':           '1-800-347-2683',
  'Wells Fargo':        '1-800-869-3557',
} as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RewardsActionCard {
  name: string;
  issuer: string;
  annualFee: number;
  rewardsEarned: number;
  netBenefit: number;
  balance?: number;
  renewalDate?: string;
}

export interface RewardsActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'cancel' | 'negotiate';
  card: RewardsActionCard;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function getIssuerPhone(issuer: string): string {
  return ISSUER_CUSTOMER_SERVICE[issuer] ?? 'See issuer website for number';
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RewardsActionModal({ isOpen, onClose, type, card }: RewardsActionModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showPhone, setShowPhone] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setToastMessage(null);
      setShowPhone(false);
    }
  }, [isOpen]);

  // Prevent body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
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

  const handleCallIssuer = useCallback(() => {
    setShowPhone(true);
  }, []);

  const handleLogCancellation = useCallback(() => {
    setToastMessage(`Cancellation logged for ${card.name}`);
  }, [card.name]);

  if (!isOpen) return null;

  const phone = getIssuerPhone(card.issuer);

  return (
    <FocusTrap active={isOpen} onEscape={onClose}>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={handleOverlayClick}
        role="dialog"
        aria-modal="true"
        aria-label={type === 'cancel' ? `Cancel ${card.name}` : `Negotiate ${card.name}`}
      >
        {/* Panel — dark theme */}
        <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-gray-900 border border-gray-700 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">
              {type === 'cancel'
                ? `Cancel ${card.name}?`
                : `Request fee waiver \u2014 ${card.name}`}
            </h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {type === 'cancel' ? (
              <CancelBody card={card} />
            ) : (
              <NegotiateBody card={card} />
            )}

            {/* Phone number reveal */}
            {showPhone && (
              <div className="flex items-center gap-2 rounded-lg bg-gray-800 border border-gray-600 px-4 py-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
                <div>
                  <p className="text-xs text-gray-400">{card.issuer} Customer Service</p>
                  <p className="text-sm font-semibold text-white">{phone}</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer — action buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 border-t border-gray-700 px-6 py-4">
            {type === 'cancel' ? (
              <>
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                  onClick={handleCallIssuer}
                >
                  Call {card.issuer} to Cancel
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-medium text-gray-200 hover:bg-gray-600 transition-colors"
                  onClick={handleLogCancellation}
                >
                  Log Card Cancellation
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                  onClick={handleCallIssuer}
                >
                  Call {card.issuer}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-medium text-gray-200 hover:bg-gray-600 transition-colors"
                  onClick={() => setToastMessage(`Product change request noted for ${card.name}`)}
                >
                  Request Product Change
                </button>
              </>
            )}
          </div>
        </div>

        {/* Toast notification */}
        {toastMessage && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-lg bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg animate-fade-in">
            {toastMessage}
          </div>
        )}
      </div>
    </FocusTrap>
  );
}

// ─── Cancel mode body ───────────────────────────────────────────────────────

function CancelBody({ card }: { card: RewardsActionCard }) {
  return (
    <>
      <p className="text-sm text-gray-300 leading-relaxed">
        Your <span className="font-semibold text-white">{card.name}</span> has a
        negative net benefit of{' '}
        <span className="font-semibold text-red-400">{formatCurrency(card.netBenefit)}</span>.
        The {formatCurrency(card.annualFee)} annual fee exceeds the{' '}
        {formatCurrency(card.rewardsEarned)} in rewards earned, making this card
        a net loss.
      </p>

      {card.balance != null && card.balance > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-900/30 border border-amber-700/50 px-4 py-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-amber-200">
            <span className="font-semibold">Outstanding balance:</span>{' '}
            {formatCurrency(card.balance)}. Pay off the remaining balance before
            cancelling to avoid interest charges.
          </p>
        </div>
      )}

      {card.renewalDate && (
        <div className="flex items-start gap-2 rounded-lg bg-gray-800 border border-gray-600 px-4 py-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-gray-300">
            <span className="font-semibold text-white">Renewal deadline:</span>{' '}
            {card.renewalDate}. Cancel before this date to avoid the next annual
            fee charge.
          </p>
        </div>
      )}
    </>
  );
}

// ─── Negotiate mode body ────────────────────────────────────────────────────

function NegotiateBody({ card }: { card: RewardsActionCard }) {
  const phone = getIssuerPhone(card.issuer);

  return (
    <>
      <p className="text-sm text-gray-300 leading-relaxed">
        Use the script below when calling {card.issuer} to negotiate a fee waiver
        or retention offer for your{' '}
        <span className="font-semibold text-white">{card.name}</span>.
      </p>

      {/* Call script */}
      <div className="rounded-lg bg-gray-800 border border-gray-600 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
          Suggested Script
        </p>
        <p className="text-sm text-gray-200 leading-relaxed italic">
          &ldquo;I&rsquo;ve been a loyal {card.issuer} customer and I value my{' '}
          {card.name}. However, I&rsquo;m reconsidering keeping the card due to the{' '}
          {formatCurrency(card.annualFee)} annual fee. Are there any retention
          offers, statement credits, or fee waivers you can provide? I&rsquo;d
          prefer to keep the card if we can work something out.&rdquo;
        </p>
      </div>

      {/* Issuer phone */}
      <div className="flex items-center gap-2 rounded-lg bg-gray-800 border border-gray-600 px-4 py-3">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
        </svg>
        <div>
          <p className="text-xs text-gray-400">{card.issuer} Customer Service</p>
          <p className="text-sm font-semibold text-white">{phone}</p>
        </div>
      </div>
    </>
  );
}
