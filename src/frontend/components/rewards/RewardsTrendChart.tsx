'use client';

// ============================================================
// RewardsTrendChart — recharts BarChart showing monthly rewards
// earned over 6 months with proper XAxis/YAxis labels.
// Dark theme with brand-gold bars.
// ============================================================

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RewardsTrendChartProps {
  data: Array<{ month: string; rewards: number }>;
  /** Year-over-year annotation, e.g. "+$1,240 vs last year" */
  yoyDelta?: string;
}

// ─── Placeholder data (Oct–Mar, $980–$1,840) ────────────────────────────────

export const REWARDS_TREND_PLACEHOLDER: RewardsTrendChartProps['data'] = [
  { month: 'Oct', rewards: 980 },
  { month: 'Nov', rewards: 1220 },
  { month: 'Dec', rewards: 1840 },
  { month: 'Jan', rewards: 1100 },
  { month: 'Feb', rewards: 1450 },
  { month: 'Mar', rewards: 1680 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDollars(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

// ─── Custom tooltip ─────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  value: number;
  payload: { month: string; rewards: number };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 shadow-lg">
      <p className="text-xs text-gray-400">{item.payload.month}</p>
      <p className="text-sm font-semibold text-brand-gold">
        {formatDollars(item.value)}
      </p>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RewardsTrendChart({ data, yoyDelta }: RewardsTrendChartProps) {
  return (
    <div className="bg-brand-navy rounded-xl border border-brand-navy-700 p-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-white">Monthly Rewards</h4>
        {yoyDelta && (
          <span className="text-xs font-medium text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded-full">
            {yoyDelta}
          </span>
        )}
      </div>

      {/* Recharts bar chart */}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#94A3B8', fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#94A3B8', fontSize: 11 }}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
            width={48}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
          />
          <Bar
            dataKey="rewards"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          >
            {data.map((entry) => (
              <Cell
                key={entry.month}
                fill="#C9A84C"
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
