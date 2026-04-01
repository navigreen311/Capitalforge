'use client';

// ============================================================
// RewardsTrendChart — compact bar chart showing monthly rewards
// earned over 6 months, using inline SVG with brand-gold bars.
// Designed for dark theme, fits below KPI cards.
// ============================================================

import React, { useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RewardsTrendChartProps {
  data: Array<{ month: string; rewards: number }>;
  /** Year-over-year annotation, e.g. "+$1,240 vs last year" */
  yoyDelta?: string;
}

// ─── Placeholder data ────────────────────────────────────────────────────────

export const REWARDS_TREND_PLACEHOLDER: RewardsTrendChartProps['data'] = [
  { month: 'Oct', rewards: 1150 },
  { month: 'Nov', rewards: 1280 },
  { month: 'Dec', rewards: 1890 },
  { month: 'Jan', rewards: 1320 },
  { month: 'Feb', rewards: 1540 },
  { month: 'Mar', rewards: 1620 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDollars(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHART_HEIGHT = 120;
const BAR_WIDTH = 32;
const BAR_GAP = 16;
const TOP_PADDING = 24; // space for value label above tallest bar
const BOTTOM_PADDING = 20; // space for month labels
const GRADIENT_ID = 'rewards-gold-gradient';

// ─── Component ───────────────────────────────────────────────────────────────

export function RewardsTrendChart({ data, yoyDelta }: RewardsTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxReward = Math.max(...data.map((d) => d.rewards), 1);
  const chartWidth = data.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP + BAR_GAP * 2;
  const drawableHeight = CHART_HEIGHT - TOP_PADDING - BOTTOM_PADDING;

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

      {/* SVG bar chart */}
      <svg
        viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Bar chart showing monthly rewards: ${data
          .map((d) => `${d.month} ${formatDollars(d.rewards)}`)
          .join(', ')}`}
      >
        <defs>
          <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E5C87C" />
            <stop offset="100%" stopColor="#C9A84C" />
          </linearGradient>
        </defs>

        {data.map((item, i) => {
          const barHeight = (item.rewards / maxReward) * drawableHeight;
          const x = BAR_GAP + i * (BAR_WIDTH + BAR_GAP);
          const y = TOP_PADDING + drawableHeight - barHeight;
          const isHovered = hoveredIndex === i;

          return (
            <g
              key={item.month}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer"
            >
              {/* Invisible hit area for easier hover */}
              <rect
                x={x - 4}
                y={0}
                width={BAR_WIDTH + 8}
                height={CHART_HEIGHT}
                fill="transparent"
              />

              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={BAR_WIDTH}
                height={barHeight}
                rx={4}
                fill={`url(#${GRADIENT_ID})`}
                opacity={isHovered ? 1 : 0.8}
                className="transition-opacity duration-150"
              />

              {/* Value label — shown on hover or always for hovered bar */}
              {isHovered && (
                <text
                  x={x + BAR_WIDTH / 2}
                  y={y - 6}
                  textAnchor="middle"
                  className="text-[10px] font-semibold"
                  fill="#E5C87C"
                >
                  {formatDollars(item.rewards)}
                </text>
              )}

              {/* Month label */}
              <text
                x={x + BAR_WIDTH / 2}
                y={CHART_HEIGHT - 4}
                textAnchor="middle"
                className="text-[10px]"
                fill={isHovered ? '#E5C87C' : '#94A3B8'}
              >
                {item.month}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
