'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InitiateCallModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  prefilledClientId?: string;
  prefilledClientName?: string;
  defaultClientName?: string;
  lockClient?: boolean;
  defaultPurpose?: string;
  lockPurpose?: boolean;
  onCallInitiated?: (data: { clientName: string; purpose: string }) => void;
}

const PURPOSES = [
  'APR Expiry Warning',
  'Payment Reminder',
  'Re-Stack Consultation',
  'Annual Review',
  'Recon Follow-Up',
  'Compliance Call',
  'General Relationship Call',
  'Custom',
] as const;

const ADVISORS = [
  'Sarah Chen',
  'Marcus Webb',
  'Jordan Mitchell',
  'Sam Delgado',
  'Alex Morgan (Admin)',
] as const;

// ─── Shared dark input style ────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  backgroundColor: '#1A2535',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#FFFFFF',
  fontSize: '14px',
  outline: 'none',
  appearance: 'auto' as const,
  colorScheme: 'dark',
  marginTop: '6px',
};

const labelStyle: React.CSSProperties = {
  color: '#9CA3AF',
  fontSize: '13px',
  fontWeight: 500,
};

// ─── Component ───────────────────────────────────────────────────────────────

export function InitiateCallModal({
  isOpen: isOpenProp,
  open: openProp,
  onClose,
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

  useEffect(() => {
    if (isOpen) {
      setClientName(resolvedClientName);
      setPurpose(resolvedPurpose);
      setAdvisor(ADVISORS[0]);
      setInitiating(false);
    }
  }, [isOpen, resolvedClientName, resolvedPurpose]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleInitiate = useCallback(async () => {
    if (!clientName.trim()) return;
    setInitiating(true);
    await new Promise((r) => setTimeout(r, 800));
    setInitiating(false);
    onCallInitiated?.({ clientName, purpose });
    onClose();
  }, [clientName, purpose, onCallInitiated, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="relative w-full max-w-lg mx-4 rounded-xl overflow-hidden"
        style={{ backgroundColor: '#0F1923', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ fontSize: '18px' }}>📞</span>
          <h2 style={{ color: '#FFFFFF', fontSize: '18px', fontWeight: 600, margin: 0 }}>
            Initiate Call
          </h2>
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#9CA3AF', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Client */}
          <div>
            <label style={labelStyle}>Client</label>
            {lockClient ? (
              <div style={{ ...inputStyle, opacity: 0.7, cursor: 'not-allowed' }}>
                {clientName}
              </div>
            ) : (
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Enter client name..."
                style={inputStyle}
              />
            )}
          </div>

          {/* Purpose */}
          <div>
            <label style={labelStyle}>Purpose</label>
            {lockPurpose ? (
              <div style={{ ...inputStyle, opacity: 0.7, cursor: 'not-allowed' }}>
                {purpose}
              </div>
            ) : (
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                style={inputStyle}
              >
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
          </div>

          {/* Advisor */}
          <div>
            <label style={labelStyle}>Advisor</label>
            <select
              value={advisor}
              onChange={(e) => setAdvisor(e.target.value)}
              style={inputStyle}
            >
              {ADVISORS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '12px', padding: '16px 24px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
              color: '#9CA3AF', fontSize: '14px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleInitiate}
            disabled={initiating || !clientName.trim()}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px',
              background: initiating || !clientName.trim() ? '#6B5A2A' : '#C9A84C',
              border: 'none', color: '#0A1628', fontSize: '14px', fontWeight: 600,
              cursor: initiating || !clientName.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              opacity: initiating || !clientName.trim() ? 0.5 : 1,
            }}
          >
            {initiating ? 'Initiating…' : '📞 Start Call'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default InitiateCallModal;
