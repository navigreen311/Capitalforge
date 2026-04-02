'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FocusTrap } from '@/components/ui/focus-trap';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InitiateCallModalProps {
  /** Primary open flag — supports both `isOpen` and `open` */
  isOpen?: boolean;
  /** Alias for isOpen */
  open?: boolean;
  onClose: () => void;
  prefilledClientId?: string;
  prefilledClientName?: string;
  /** Alias for prefilledClientName */
  defaultClientName?: string;
  lockClient?: boolean;
  /** Default purpose selection */
  defaultPurpose?: string;
  /** Lock purpose dropdown so user cannot change it */
  lockPurpose?: boolean;
  onCallInitiated?: (data: { clientName: string; purpose: string }) => void;
}

const PURPOSES = [
  'APR Expiry Warning',
  'Re-Stack Consultation',
  'Payment Reminder',
  'Onboarding Welcome',
  'Compliance Follow-up',
  'Account Review',
  'Custom',
] as const;

const ADVISORS = [
  'Sarah Chen',
  'Marcus Webb',
  'David Kim',
  'Emily Rodriguez',
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function InitiateCallModal({
  isOpen: isOpenProp,
  open: openProp,
  onClose,
  prefilledClientId,
  prefilledClientName,
  defaultClientName,
  lockClient = false,
  defaultPurpose,
  lockPurpose = false,
  onCallInitiated,
}: InitiateCallModalProps) {
  const isOpen = isOpenProp ?? openProp ?? false;
  const resolvedClientName = prefilledClientName ?? defaultClientName ?? '';
  const resolvedPurpose = defaultPurpose ?? PURPOSES[0];

  const [clientName, setClientName] = useState(resolvedClientName);
  const [purpose, setPurpose] = useState<string>(resolvedPurpose);
  const [advisor, setAdvisor] = useState<string>(ADVISORS[0]);
  const [initiating, setInitiating] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setClientName(resolvedClientName);
      setPurpose(resolvedPurpose);
      setAdvisor(ADVISORS[0]);
      setInitiating(false);
    }
  }, [isOpen, resolvedClientName, resolvedPurpose]);

  // Prevent body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const handleInitiate = useCallback(async () => {
    if (!clientName.trim()) return;
    setInitiating(true);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 800));
    setInitiating(false);
    onCallInitiated?.({ clientName, purpose });
    onClose();
  }, [clientName, purpose, onCallInitiated, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <FocusTrap active={isOpen} onEscape={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">📞 Initiate Call</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {/* Client */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Client</label>
              {lockClient ? (
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                  {clientName}
                </div>
              ) : (
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Enter client name..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
                />
              )}
            </div>

            {/* Purpose */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Purpose</label>
              {lockPurpose ? (
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                  {purpose}
                </div>
              ) : (
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold bg-white"
                >
                  {PURPOSES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Advisor */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Advisor</label>
              <select
                value={advisor}
                onChange={(e) => setAdvisor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold bg-white"
              >
                {ADVISORS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInitiate}
              disabled={initiating || !clientName.trim()}
              className="px-5 py-2 text-sm font-bold rounded-lg bg-brand-gold text-brand-navy hover:bg-brand-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {initiating ? 'Initiating…' : '📞 Start Call'}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

export default InitiateCallModal;
