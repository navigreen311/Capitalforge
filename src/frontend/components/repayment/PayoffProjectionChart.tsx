'use client';

// ============================================================
// PayoffProjectionChart — Line chart showing projected balance
// payoff over time for each card + total, with Avalanche/Snowball toggle.
// Uses recharts LineChart with dark theme styling.
// ============================================================

import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ── Types ───────────────────────────────────────────────────────────────────

type Strategy = 'avalanche' | 'snowball';

interface CardProjection {
  name: string;
  color: string;
  /** Balance at each month index (0 = today) */
  avalanche: number[];
  snowball: number[];
}

export interface PayoffProjectionChartProps {
  /** Override default strategy (controlled externally) */
  initialStrategy?: Strategy;
}

// ── Mock Data ───────────────────────────────────────────────────────────────

const CARD_PROJECTIONS: CardProjection[] = [
  {
    name: 'Ink Business Cash',
    color: '#C9A84C', // brand gold
    avalanche: [18400, 16200, 13900, 11500, 9000, 6400, 3700, 900, 0, 0, 0, 0],
    snowball:  [18400, 16800, 15100, 13300, 11400, 9400, 7300, 5100, 2800, 400, 0, 0],
  },
  {
    name: 'Business Gold Card',
    color: '#6366F1', // indigo
    avalanche: [12200, 11200, 10100, 9000, 7800, 6500, 5100, 3600, 2000, 300, 0, 0],
    snowball:  [12200, 10600, 8900, 7100, 5200, 3200, 1100, 0, 0, 0, 0, 0],
  },
];

/** Build chart data points with a "Total" line */
function buildChartData(cards: CardProjection[], strategy: Strategy) {
  const months = 12; // 0..11
  const data: Record<string, string | number>[] = [];

  for (let m = 0; m < months; m++) {
    const point: Record<string, string | number> = { month: `M${m}` };
    let total = 0;

    for (const card of cards) {
      const balance = strategy === 'avalanche' ? card.avalanche[m] : card.snowball[m];
      point[card.name] = balance;
      total += balance;
    }

    point['Total'] = total;
    data.push(point);
  }

  return data;
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 shadow-xl">
      <p className="text-xs font-semibold text-gray-300 mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-400">{entry.name}</span>
          </span>
          <span className="font-semibold text-gray-100">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function PayoffProjectionChart({ initialStrategy = 'avalanche' }: PayoffProjectionChartProps) {
  const [strategy, setStrategy] = useState<Strategy>(initialStrategy);

  const chartData = useMemo(
    () => buildChartData(CARD_PROJECTIONS, strategy),
    [strategy],
  );

  return (
    <div className="rounded-xl border border-gray-800 bg-[#0A1628] overflow-hidden">
      {/* Header with strategy toggle */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <div>
          <h3 className="text-base font-semibold text-white">Payoff Projection</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Projected balance over the next 12 months
          </p>
        </div>

        {/* Strategy toggle */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 border border-gray-700">
          <button
            onClick={() => setStrategy('avalanche')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              strategy === 'avalanche'
                ? 'bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Avalanche
          </button>
          <button
            onClick={() => setStrategy('snowball')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              strategy === 'snowball'
                ? 'bg-[#0A1628] text-[#C9A84C] border border-[#C9A84C]/40'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Snowball
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="px-5 py-4">
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
            <XAxis
              dataKey="month"
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={{ stroke: '#374151' }}
            />
            <YAxis
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={{ stroke: '#374151' }}
              tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: 12, fontSize: 12, color: '#9CA3AF' }}
            />

            {/* "Today" reference line */}
            <ReferenceLine
              x="M0"
              stroke="#C9A84C"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: 'Today',
                position: 'top',
                fill: '#C9A84C',
                fontSize: 11,
                fontWeight: 600,
              }}
            />

            {/* Individual card lines */}
            {CARD_PROJECTIONS.map((card) => (
              <Line
                key={card.name}
                type="monotone"
                dataKey={card.name}
                stroke={card.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: card.color }}
              />
            ))}

            {/* Total line — bold */}
            <Line
              type="monotone"
              dataKey="Total"
              stroke="#F9FAFB"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5, fill: '#F9FAFB' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer insight */}
      <div className="px-5 py-3 border-t border-gray-800 bg-gray-900/30">
        <p className="text-xs text-gray-400">
          {strategy === 'avalanche'
            ? 'Avalanche: pays off high-APR debt first — total payoff projected in ~10 months'
            : 'Snowball: pays off smallest balances first — total payoff projected in ~11 months'}
        </p>
      </div>
    </div>
  );
}
