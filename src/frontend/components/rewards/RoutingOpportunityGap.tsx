'use client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CardSwapOpportunity {
  category: string;
  currentCard: string;
  currentRate: number;
  bestCard: string;
  bestRate: number;
  monthlySpend: number;
  annualGain: number; // (bestRate - currentRate) * monthlySpend * 12
}

export interface RoutingOpportunityGapProps {
  currentYield: number;
  optimalYield: number;
  gap: number;
  /** Specific card-swap opportunities where current != best */
  swaps?: CardSwapOpportunity[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RoutingOpportunityGap({
  currentYield,
  optimalYield,
  gap,
  swaps = [],
}: RoutingOpportunityGapProps) {
  const maxValue = Math.max(optimalYield, currentYield, 1);
  const currentPct = Math.round((currentYield / maxValue) * 100);
  const optimalPct = Math.round((optimalYield / maxValue) * 100);
  const totalOpportunity = swaps.reduce((sum, s) => sum + s.annualGain, 0);

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-100 mb-4">
        Optimization Opportunity
      </h3>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Current Yield
          </p>
          <p className="text-lg font-bold text-gray-100">
            {formatCurrency(currentYield)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Optimal Yield
          </p>
          <p className="text-lg font-bold text-emerald-400">
            {formatCurrency(optimalYield)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Gap
          </p>
          <p className="text-lg font-bold text-amber-400">
            {formatCurrency(gap)}
            <span className="ml-1 text-xs font-medium text-amber-400/70">
              +{formatCurrency(gap)}/yr
            </span>
          </p>
        </div>
      </div>

      {/* Visual comparison bars */}
      <div className="space-y-2 mb-5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Current</span>
            <span className="text-xs text-gray-500">{currentPct}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-gray-800">
            <div
              className="h-2.5 rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${currentPct}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Optimal</span>
            <span className="text-xs text-gray-500">{optimalPct}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-gray-800">
            <div
              className="h-2.5 rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${optimalPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Card-swap instructions (3F) */}
      {swaps.length > 0 && (
        <div className="border-t border-gray-700 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Card-Swap Instructions
          </h4>
          <div className="space-y-2">
            {swaps.map((swap) => (
              <div
                key={swap.category}
                className="flex items-center justify-between gap-3 bg-gray-800/60 rounded-lg px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-300 truncate">
                    {swap.category}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className="text-red-400">{swap.currentCard} ({formatPct(swap.currentRate)})</span>
                    <span className="mx-1.5 text-gray-600">&rarr;</span>
                    <span className="text-emerald-400">{swap.bestCard} ({formatPct(swap.bestRate)})</span>
                  </p>
                </div>
                <span className="text-xs font-bold text-amber-400 whitespace-nowrap">
                  +{formatCurrency(swap.annualGain)}/yr
                </span>
              </div>
            ))}
          </div>

          {/* Total opportunity sum */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Total Opportunity
            </span>
            <span className="text-sm font-bold text-amber-400">
              +{formatCurrency(totalOpportunity)}/yr
            </span>
          </div>
        </div>
      )}

      {/* Footer text */}
      {swaps.length === 0 && (
        <p className="text-xs text-gray-500">
          Earn more by routing each category to the recommended card.
        </p>
      )}
    </div>
  );
}
