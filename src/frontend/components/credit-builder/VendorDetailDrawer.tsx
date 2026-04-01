'use client';

// ============================================================
// VendorDetailDrawer — Right slide-over panel (480px) showing
// vendor details, application instructions, and action buttons.
// Dark theme (bg-[#1a2332]) to match the credit-builder palette.
// ============================================================

import { useEffect, useRef, useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

export interface VendorDetail {
  name: string;
  category: string;
  tier: string;
  reportsTo: string;
  creditLimit: string;
  difficulty: string;
  requirements: string;
  applicationUrl?: string;
}

export interface VendorDetailDrawerProps {
  vendor: VendorDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onTrack: () => void;
}

// ── Tier badge colors ───────────────────────────────────────────────────────

function tierBadgeClasses(tier: string): string {
  const t = tier.toLowerCase();
  if (t.includes('1') || t === 'starter')
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (t.includes('2') || t === 'intermediate')
    return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (t.includes('3') || t === 'advanced')
    return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  if (t.includes('4') || t === 'elite')
    return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

// ── Application steps (generic template per vendor) ─────────────────────────

function getApplicationSteps(vendor: VendorDetail): string[] {
  return [
    `Visit the ${vendor.name} website and navigate to their business credit application page.`,
    `Complete the business credit application with your EIN, DUNS number, and business entity details.`,
    `Provide any required documentation: ${vendor.requirements || 'business license, EIN verification'}.`,
    `Place your first order using Net 30 terms to establish your trade line.`,
    `Pay your invoice on time (or early) to ensure positive reporting to ${vendor.reportsTo}.`,
  ];
}

// ── Detail row for dark theme ───────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-200 text-right">{value}</span>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function VendorDetailDrawer({ vendor, isOpen, onClose, onTrack }: VendorDetailDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    // Focus the close button when drawer opens
    closeButtonRef.current?.focus();
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !vendor) return null;

  const steps = getApplicationSteps(vendor);

  return (
    <>
      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.25s ease-out;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full w-[480px] max-w-full bg-[#1a2332] shadow-xl z-50 flex flex-col animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-label={`${vendor.name} details`}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-white/10">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white truncate">
              {vendor.name}
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${tierBadgeClasses(vendor.tier)}`}
              >
                {vendor.tier}
              </span>
              <span className="text-sm text-gray-400">{vendor.category}</span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Vendor Details ──────────────────────────────── */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Details
            </h4>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 divide-y divide-white/5">
              <DetailRow label="Reports To" value={vendor.reportsTo} />
              <DetailRow label="Credit Limit" value={vendor.creditLimit} />
              <DetailRow label="Difficulty" value={vendor.difficulty} />
              <DetailRow label="Requirements" value={vendor.requirements} />
            </div>
          </div>

          {/* ── How to Apply ────────────────────────────────── */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              How to Apply
            </h4>
            <ol className="space-y-3">
              {steps.map((step, idx) => (
                <li key={idx} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold flex items-center justify-center mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="text-sm text-gray-300 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* ── Tip ─────────────────────────────────────────── */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="flex gap-2">
              <span className="text-amber-400 flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
              <p className="text-sm text-amber-200/90">
                Order immediately — the reporting cycle begins with your first purchase.
              </p>
            </div>
          </div>
        </div>

        {/* ── Actions Footer ──────────────────────────────────── */}
        <div className="border-t border-white/10 px-6 py-4 bg-[#151d2a]">
          <div className="grid grid-cols-2 gap-3">
            {vendor.applicationUrl ? (
              <a
                href={vendor.applicationUrl.startsWith('http') ? vendor.applicationUrl : `https://${vendor.applicationUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2.5 transition-colors"
              >
                Apply Now &#x2197;
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="text-center text-sm font-medium text-gray-500 bg-gray-700/50 rounded-lg px-4 py-2.5 cursor-not-allowed"
              >
                Apply Now &#x2197;
              </button>
            )}
            <button
              type="button"
              onClick={onTrack}
              className="text-center text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg px-4 py-2.5 transition-colors"
            >
              Track This Account
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
