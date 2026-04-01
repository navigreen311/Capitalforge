import React, { useState, useEffect } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HistoryRun {
  id: string;
  date: string;
  clientName: string | null;
  topCard: string;
  topProbability: number;
  inputs: Record<string, unknown>;
}

interface OptimizationHistoryProps {
  onLoadRun: (run: HistoryRun) => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cf_optimizer_history';
const MAX_RUNS = 10;

// ─── LocalStorage Helpers ──────────────────────────────────────────────────

export function getOptimizationHistory(): HistoryRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOptimizationRun(run: HistoryRun): void {
  const history = getOptimizationHistory();
  // Prepend new run, remove duplicates by id, cap at MAX_RUNS
  const updated = [run, ...history.filter((r) => r.id !== run.id)].slice(
    0,
    MAX_RUNS,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

// ─── Component ─────────────────────────────────────────────────────────────

export function OptimizationHistory({ onLoadRun }: OptimizationHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [runs, setRuns] = useState<HistoryRun[]>([]);

  // Load history from localStorage when expanded
  useEffect(() => {
    if (isExpanded) {
      setRuns(getOptimizationHistory());
    }
  }, [isExpanded]);

  return (
    <div className="mt-4 border rounded-lg border-white/10 bg-white/[0.02]">
      {/* ── Collapsible Header ─────────────────────────────────────── */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center justify-between w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
        aria-expanded={isExpanded}
      >
        <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">
          Past Runs
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* ── Expanded Content ───────────────────────────────────────── */}
      {isExpanded && (
        <div className="px-4 pb-3">
          {runs.length === 0 ? (
            <p className="py-3 text-xs text-center text-gray-500">
              No past runs yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center gap-3 px-3 py-2 text-xs rounded-md bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                >
                  {/* Date */}
                  <span className="flex-shrink-0 text-gray-500">
                    {run.date}
                  </span>

                  {/* Client name or fallback */}
                  <span className="text-gray-400 truncate min-w-0">
                    {run.clientName ?? 'Manual Input'}
                  </span>

                  {/* Top card + probability */}
                  <span className="flex-1 font-medium text-gray-200 truncate text-right min-w-0">
                    {run.topCard}
                  </span>
                  <span className="flex-shrink-0 font-semibold text-emerald-400">
                    {run.topProbability}%
                  </span>

                  {/* Load button */}
                  <button
                    onClick={() => onLoadRun(run)}
                    className="flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                  >
                    Load
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* View all link */}
          {runs.length > 0 && (
            <button
              onClick={() => console.log('[OptimizationHistory] View all runs')}
              className="block w-full pt-2 mt-2 text-xs text-center text-blue-400 border-t border-white/5 hover:text-blue-300 transition-colors"
            >
              View all runs
            </button>
          )}
        </div>
      )}
    </div>
  );
}
