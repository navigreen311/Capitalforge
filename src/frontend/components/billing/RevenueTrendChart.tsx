'use client';

// ============================================================
// RevenueTrendChart — Stacked bar chart (recharts) showing
// 6 months of revenue broken down by deal type.
// Collapsible analytics section with toggle.
// Deal type colors: Flat Fee (gold), Rev Share (blue),
// MCA (green), LOC (purple).
// ============================================================

import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonthlyRevenue {
  month: string;
  flatFee: number;
  revShare: number;
  mca: number;
  loc: number;
}

export interface RevenueTrendChartProps {
  data?: MonthlyRevenue[];
}

// ---------------------------------------------------------------------------
// Placeholder data (6 months)
// ---------------------------------------------------------------------------

const PLACEHOLDER_DATA: MonthlyRevenue[] = [
  { month: 'Nov',  flatFee: 9750,  revShare: 18500, mca: 12000, loc: 4200 },
  { month: 'Dec',  flatFee: 7200,  revShare: 22000, mca: 15600, loc: 5800 },
  { month: 'Jan',  flatFee: 11500, revShare: 14200, mca: 18900, loc: 3500 },
  { month: 'Feb',  flatFee: 8400,  revShare: 31250, mca: 9800,  loc: 7800 },
  { month: 'Mar',  flatFee: 14000, revShare: 18500, mca: 42000, loc: 5200 },
  { month: 'Apr',  flatFee: 5200,  revShare: 24600, mca: 8700,  loc: 6100 },
];

// ---------------------------------------------------------------------------
// Colors matching spec
// ---------------------------------------------------------------------------

const COLORS = {
  flatFee:  '#C9A84C', // gold
  revShare: '#3B82F6', // blue
  mca:      '#22C55E', // green
  loc:      '#A855F7', // purple
};

const LABELS: Record<string, string> = {
  flatFee:  'Flat Fee',
  revShare: 'Rev Share',
  mca:      'MCA',
  loc:      'LOC',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDollars(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n}`;
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const total = payload.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 shadow-xl px-4 py-3 text-sm">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6 mb-1">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-300 text-xs">{LABELS[entry.dataKey] || entry.dataKey}</span>
          </span>
          <span className="text-xs font-semibold text-gray-100 tabular-nums">{formatCurrency(entry.value)}</span>
        </div>
      ))}
      <div className="border-t border-gray-700 mt-1.5 pt-1.5 flex items-center justify-between">
        <span className="text-xs font-bold text-gray-400">Total</span>
        <span className="text-xs font-black text-[#C9A84C] tabular-nums">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom legend
// ---------------------------------------------------------------------------

function CustomLegend() {
  return (
    <div className="flex items-center justify-center gap-4 mt-2">
      {Object.entries(LABELS).map(([key, label]) => (
        <span key={key} className="flex items-center gap-1.5 text-xs text-gray-400">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: COLORS[key as keyof typeof COLORS] }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  const [expanded, setExpanded] = useState(false);
  const chartData = data ?? PLACEHOLDER_DATA;

  // Summary stats
  const totalRevenue = useMemo(
    () => chartData.reduce((sum, m) => sum + m.flatFee + m.revShare + m.mca + m.loc, 0),
    [chartData],
  );

  const avgMonthly = useMemo(
    () => (chartData.length > 0 ? totalRevenue / chartData.length : 0),
    [chartData, totalRevenue],
  );

  // Month-over-month growth
  const momGrowth = useMemo(() => {
    if (chartData.length < 2) return null;
    const prev = chartData[chartData.length - 2];
    const curr = chartData[chartData.length - 1];
    const prevTotal = prev.flatFee + prev.revShare + prev.mca + prev.loc;
    const currTotal = curr.flatFee + curr.revShare + curr.mca + curr.loc;
    if (prevTotal === 0) return null;
    return ((currTotal - prevTotal) / prevTotal) * 100;
  }, [chartData]);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-800/30 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
            Revenue Analytics
          </span>
          <span className="text-xs font-semibold text-[#C9A84C] bg-[#0A1628] border border-[#C9A84C]/30 px-2 py-0.5 rounded">
            6 months
          </span>
        </div>
        <span className={`text-gray-500 text-xs font-semibold transition-transform ${expanded ? 'rotate-180' : ''}`}>
          &#9660;
        </span>
      </button>

      {/* Collapsible content */}
      {expanded && (
        <div className="px-5 pb-5">
          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">6-Month Total</p>
              <p className="text-lg font-black text-[#C9A84C]">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Avg Monthly</p>
              <p className="text-lg font-black text-blue-400">{formatCurrency(avgMonthly)}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">MoM Growth</p>
              <p className={`text-lg font-black ${momGrowth !== null && momGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {momGrowth !== null ? `${momGrowth >= 0 ? '+' : ''}${momGrowth.toFixed(1)}%` : 'N/A'}
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={2} barCategoryGap="20%">
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B7280', fontSize: 11 }}
                  tickFormatter={formatDollars}
                  width={50}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Legend content={<CustomLegend />} />
                <Bar dataKey="flatFee"  stackId="revenue" fill={COLORS.flatFee}  radius={[0, 0, 0, 0]} name="Flat Fee" />
                <Bar dataKey="revShare" stackId="revenue" fill={COLORS.revShare} radius={[0, 0, 0, 0]} name="Rev Share" />
                <Bar dataKey="mca"      stackId="revenue" fill={COLORS.mca}      radius={[0, 0, 0, 0]} name="MCA" />
                <Bar dataKey="loc"      stackId="revenue" fill={COLORS.loc}      radius={[4, 4, 0, 0]} name="LOC" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
