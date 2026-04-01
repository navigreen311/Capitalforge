'use client';

// ============================================================
// IssuerReconLines — Issuer reconsideration phone numbers and
// a small ReconCallButton component for initiating calls.
// ============================================================

import { useState, useEffect, useCallback } from 'react';

// ── Constants ──────────────────────────────────────────────────

export const RECON_LINES: Record<string, string> = {
  'Chase': '888-245-0625',
  'American Express': '877-399-3083',
  'Amex': '877-399-3083',
  'Citi': '800-695-5171',
  'Capital One': '800-625-7866',
  'Bank of America': '800-841-6863',
  'Wells Fargo': '800-967-9521',
  'US Bank': '800-947-1444',
  'Discover': '800-347-2683',
  'Barclays': '866-408-4064',
};

export function getReconLine(issuer: string): string | null {
  return RECON_LINES[issuer] ?? null;
}

// ── Inline Toast ───────────────────────────────────────────────

function InlineToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-3 bg-emerald-700 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-bottom-4">
      <span>{message}</span>
      <button onClick={onDismiss} className="text-white/70 hover:text-white text-lg leading-none">
        &times;
      </button>
    </div>
  );
}

// ── Phone SVG Icon ─────────────────────────────────────────────

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-4 w-4'}
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

// ── Types ──────────────────────────────────────────────────────

export interface ReconCallButtonProps {
  issuer: string;
  compact?: boolean;
}

// ── Component ──────────────────────────────────────────────────

export function ReconCallButton({ issuer, compact = false }: ReconCallButtonProps) {
  const phone = getReconLine(issuer);
  const [toast, setToast] = useState<string | null>(null);

  const handleVoiceForge = useCallback(() => {
    setToast('VoiceForge call initiated');
  }, []);

  if (!phone) return null;

  const telHref = `tel:${phone.replace(/-/g, '')}`;

  // ── Compact mode: just the phone link ────────────────────────
  if (compact) {
    return (
      <a
        href={telHref}
        className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        <PhoneIcon className="h-3.5 w-3.5" />
        {phone}
      </a>
    );
  }

  // ── Full mode: phone link + VoiceForge button ────────────────
  return (
    <div className="inline-flex items-center gap-3">
      <a
        href={telHref}
        className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        <PhoneIcon className="h-4 w-4" />
        {phone}
      </a>

      <button
        type="button"
        onClick={handleVoiceForge}
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors"
      >
        Call via VoiceForge
      </button>

      {toast && <InlineToast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
