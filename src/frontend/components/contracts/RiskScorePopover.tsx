'use client';

// ============================================================
// RiskScorePopover — Clickable risk score badge that shows
// a popover with risk breakdown: category, description,
// severity, and points. Includes "Full AI Contract Review"
// button that triggers a toast.
// ============================================================

import { useState, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RiskFactor {
  category: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  points: number;
}

interface RiskScorePopoverProps {
  score: number;
  factors?: RiskFactor[];
  onAiReview?: () => void;
}

// ---------------------------------------------------------------------------
// Mock risk factors for high-risk contract (88/100)
// ---------------------------------------------------------------------------

const HIGH_RISK_FACTORS: RiskFactor[] = [
  { category: 'Indemnification', description: 'Missing indemnification clause', severity: 'critical', points: 25 },
  { category: 'UDAP Compliance', description: 'No UDAP disclosure provided', severity: 'critical', points: 20 },
  { category: 'Termination', description: 'Unclear termination provisions', severity: 'high', points: 18 },
  { category: 'Governing Law', description: 'No governing law specified', severity: 'high', points: 15 },
  { category: 'Auto-Renewal', description: 'Auto-renewal without notice requirement', severity: 'medium', points: 10 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function riskColor(score: number): string {
  if (score >= 75) return 'text-red-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-green-400';
}

function riskBgColor(score: number): string {
  if (score >= 75) return 'bg-red-400';
  if (score >= 50) return 'bg-amber-400';
  return 'bg-green-400';
}

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-red-900/60 text-red-300 border-red-700' },
  high:     { label: 'High',     className: 'bg-orange-900/60 text-orange-300 border-orange-700' },
  medium:   { label: 'Medium',   className: 'bg-amber-900/60 text-amber-300 border-amber-700' },
  low:      { label: 'Low',      className: 'bg-green-900/60 text-green-300 border-green-700' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RiskScorePopover({ score, factors, onAiReview }: RiskScorePopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Resolve factors: use provided factors, or mock data for score >= 80
  const resolvedFactors = factors ?? (score >= 80 ? HIGH_RISK_FACTORS : []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  return (
    <div className="relative">
      {/* Trigger — the risk score badge */}
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setOpen((prev) => !prev); }}
        className="text-center cursor-pointer group"
        aria-label={`Risk score ${score}. Click for breakdown.`}
      >
        <p className="text-xs text-gray-500 mb-0.5">Risk</p>
        <p className={`text-lg font-black ${riskColor(score)} group-hover:scale-110 transition-transform`}>
          {score}
        </p>
      </button>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          className="absolute z-50 right-0 top-full mt-2 w-[360px] bg-[#0f1d32] border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-white">Risk Breakdown</h4>
              <p className="text-xs text-gray-400 mt-0.5">
                Score: <span className={`font-bold ${riskColor(score)}`}>{score}</span>/100
              </p>
            </div>
            {/* Score bar */}
            <div className="w-20 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${riskBgColor(score)}`}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>

          {/* Factors list */}
          <div className="px-4 py-3 max-h-[280px] overflow-y-auto space-y-2">
            {resolvedFactors.length === 0 ? (
              <p className="text-xs text-gray-500 py-2">No detailed risk factors available.</p>
            ) : (
              resolvedFactors.map((factor, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-[#0A1628] border border-gray-800"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-200">{factor.category}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${SEVERITY_CONFIG[factor.severity].className}`}>
                        {SEVERITY_CONFIG[factor.severity].label}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">{factor.description}</p>
                  </div>
                  <span className={`text-sm font-black shrink-0 ${riskColor(factor.points >= 20 ? 80 : factor.points >= 15 ? 60 : 30)}`}>
                    +{factor.points}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Footer — AI Review button */}
          <div className="px-4 py-3 border-t border-gray-800">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onAiReview) onAiReview();
                setOpen(false);
              }}
              className="w-full py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-[#0A1628] text-sm font-bold transition-colors"
            >
              Full AI Contract Review &#10022;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
