'use client';

// ============================================================
// SpendByCategoryChart — horizontal bar chart showing spend
// breakdown by MCC category. Risky categories (Wire Transfer,
// Cash Advance, Crypto) render amber/red bars with a warning
// icon. Normal categories render blue/teal bars.
// ============================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpendByCategoryItem {
  category: string;
  amount: number;
  pct: number;
  isRisky?: boolean;
}

export interface SpendByCategoryChartProps {
  data: SpendByCategoryItem[];
  activeCategory?: string | null;
  onCategoryClick?: (category: string) => void;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

export const PLACEHOLDER_SPEND_BY_CATEGORY: SpendByCategoryItem[] = [
  { category: 'Wire Transfer', amount: 9_750, pct: 35, isRisky: true },
  { category: 'SaaS',          amount: 5_450, pct: 20 },
  { category: 'Airlines',      amount: 4_210, pct: 15 },
  { category: 'Other',         amount: 3_490, pct: 13 },
  { category: 'Office',        amount: 3_200, pct: 12 },
  { category: 'Cash Advance',  amount: 1_500, pct: 5,  isRisky: true },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpendByCategoryChart({ data, activeCategory, onCategoryClick }: SpendByCategoryChartProps) {
  const maxPct = Math.max(...data.map((d) => d.pct), 1);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      {/* Section header */}
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
        Spend by Category
      </h3>

      {/* Bar rows */}
      <div className="space-y-3">
        {data.map((item) => {
          const isRisky = item.isRisky === true;
          const isActive = activeCategory === item.category;
          const barColor = isRisky
            ? 'bg-gradient-to-r from-amber-600 to-red-500'
            : 'bg-gradient-to-r from-blue-500 to-teal-400';
          const textColor = isRisky ? 'text-amber-300' : 'text-gray-200';
          const barWidthPct = (item.pct / maxPct) * 100;

          return (
            <button
              key={item.category}
              type="button"
              onClick={() => onCategoryClick?.(item.category)}
              className={`group w-full text-left rounded-lg px-2 py-1.5 -mx-2 transition-all cursor-pointer
                ${isActive
                  ? 'ring-2 ring-[#C9A84C] bg-[#C9A84C]/10'
                  : 'hover:bg-gray-800/50'
                }`}
            >
              {/* Label row */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  {isRisky && (
                    <span
                      className="text-amber-400 text-sm"
                      aria-label="Risky category"
                      title="Risky category"
                    >
                      &#x26A0;
                    </span>
                  )}
                  <span className={`text-xs font-semibold ${isActive ? 'text-[#C9A84C]' : textColor}`}>
                    {item.category}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-100 tabular-nums">
                    {formatCurrency(item.amount)}
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums w-10 text-right">
                    {item.pct}%
                  </span>
                </div>
              </div>

              {/* Bar */}
              <div className="h-2.5 w-full rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor} transition-all duration-500`}
                  style={{ width: `${barWidthPct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
