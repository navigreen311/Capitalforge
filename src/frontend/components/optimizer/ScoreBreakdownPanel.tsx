import React, { useCallback, useEffect, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScoreBreakdownPanelProps {
  isOpen: boolean;
  onClose: () => void;
  cardName: string;
  issuer: string;
  totalScore: number;
  positives: Array<{ factor: string; impact: number }>;
  negatives: Array<{ factor: string; impact: number }>;
  improvements?: Array<{ action: string; impact: string }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getScoreLabel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'High', color: 'text-emerald-400' };
  if (score >= 40) return { label: 'Moderate', color: 'text-yellow-400' };
  return { label: 'Low', color: 'text-red-400' };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ScoreBreakdownPanel({
  isOpen,
  onClose,
  cardName,
  issuer,
  totalScore,
  positives,
  negatives,
  improvements,
}: ScoreBreakdownPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen) return null;

  const { label, color } = getScoreLabel(totalScore);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Approval probability breakdown for ${cardName}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-[480px] h-full overflow-y-auto bg-[#1a2332] text-gray-100 border-l border-white/10 shadow-2xl animate-slide-in-right"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-6 py-5 bg-[#1a2332] border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-xs font-bold tracking-widest text-gray-400 uppercase">
              Approval Probability Breakdown
            </h2>
            <p className="mt-1 text-lg font-semibold text-white truncate">
              {cardName}
            </p>
            <p className="text-sm text-gray-400">{issuer}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close panel"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
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

        <div className="px-6 py-5 space-y-6">
          {/* ── Positive Factors ────────────────────────────────────── */}
          <section>
            <h3 className="mb-3 text-xs font-bold tracking-widest text-emerald-400 uppercase">
              Positive Factors
            </h3>
            <div className="overflow-hidden border rounded-lg border-white/10">
              <table className="w-full text-sm">
                <tbody>
                  {positives.map((item, i) => (
                    <tr
                      key={i}
                      className={i % 2 === 0 ? 'bg-white/[0.03]' : ''}
                    >
                      <td className="px-4 py-2.5 text-gray-200">
                        {item.factor}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-400">
                          +{item.impact} pts
                        </span>
                      </td>
                    </tr>
                  ))}
                  {positives.length === 0 && (
                    <tr>
                      <td className="px-4 py-3 text-gray-500" colSpan={2}>
                        No positive factors identified.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Negative Factors ────────────────────────────────────── */}
          <section>
            <h3 className="mb-3 text-xs font-bold tracking-widest text-red-400 uppercase">
              Negative Factors
            </h3>
            <div className="overflow-hidden border rounded-lg border-white/10">
              <table className="w-full text-sm">
                <tbody>
                  {negatives.map((item, i) => (
                    <tr
                      key={i}
                      className={i % 2 === 0 ? 'bg-white/[0.03]' : ''}
                    >
                      <td className="px-4 py-2.5 text-gray-200">
                        {item.factor}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-red-500/20 text-red-400">
                          -{item.impact} pts
                        </span>
                      </td>
                    </tr>
                  ))}
                  {negatives.length === 0 && (
                    <tr>
                      <td className="px-4 py-3 text-gray-500" colSpan={2}>
                        No negative factors identified.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Net Score ───────────────────────────────────────────── */}
          <section className="p-4 border rounded-lg border-white/10 bg-white/[0.03]">
            <p className="text-sm font-bold tracking-wide text-gray-300 uppercase">
              Net Score:{' '}
              <span className="text-xl text-white">{totalScore}</span>
              <span className="text-gray-400"> / 100</span>
              <span className={`ml-2 ${color}`}>— {label}</span>
            </p>
          </section>

          {/* ── Improvements ───────────────────────────────────────── */}
          {improvements && improvements.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-bold tracking-widest text-blue-400 uppercase">
                What Would Improve This Score
              </h3>
              <ul className="space-y-2">
                {improvements.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-300"
                  >
                    <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span>
                      {item.action}
                      <span className="ml-1 text-xs text-gray-500">
                        ({item.impact})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
