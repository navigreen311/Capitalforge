'use client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RoutingOpportunityGapProps {
  currentYield: number;
  optimalYield: number;
  gap: number;
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

// ─── Component ───────────────────────────────────────────────────────────────

export function RoutingOpportunityGap({
  currentYield,
  optimalYield,
  gap,
}: RoutingOpportunityGapProps) {
  const maxValue = Math.max(optimalYield, currentYield, 1);
  const currentPct = Math.round((currentYield / maxValue) * 100);
  const optimalPct = Math.round((optimalYield / maxValue) * 100);

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-100 mb-4">
        Optimization Opportunity
      </h3>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {/* Current */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Current Yield
          </p>
          <p className="text-lg font-bold text-gray-100">
            {formatCurrency(currentYield)}
          </p>
        </div>

        {/* Optimal */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Optimal Yield
          </p>
          <p className="text-lg font-bold text-emerald-400">
            {formatCurrency(optimalYield)}
          </p>
        </div>

        {/* Gap */}
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
      <div className="space-y-2 mb-4">
        {/* Current bar */}
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

        {/* Optimal bar */}
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

      {/* Footer text */}
      <p className="text-xs text-gray-500">
        Earn more by routing each category to the recommended card.
      </p>
    </div>
  );
}
