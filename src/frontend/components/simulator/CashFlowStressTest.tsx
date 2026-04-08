'use client';

// ============================================================
// CashFlowStressTest — Monthly Cash Flow Stress Test chart
// Shows net cash flow across Best/Base/Worst revenue scenarios
// using recharts LineChart with dark theme styling.
// ============================================================

import { useMemo } from 'react';
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

interface CashFlowStressTestProps {
  /** Monthly base revenue — defaults to $45,000 */
  monthlyRevenue?: number;
  /** Total monthly debt payment obligations from simulation results */
  monthlyDebtPayment: number;
  /** Monthly fixed operating expenses — defaults to $32,000 */
  monthlyExpenses?: number;
  /** Number of months to project */
  months: number;
}

interface MonthDataPoint {
  month: string;
  best: number;
  base: number;
  worst: number;
}

type RiskLevel = 'low' | 'moderate' | 'high';

interface ScenarioRisk {
  label: string;
  level: RiskLevel;
  color: string;
  bgClass: string;
  description: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MONTHLY_REVENUE = 45000;
const DEFAULT_MONTHLY_EXPENSES = 32000;
const BEST_MULTIPLIER = 1.20;  // +20% revenue
const WORST_MULTIPLIER = 0.80; // -20% revenue

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function computeMonthlyData(
  months: number,
  revenue: number,
  expenses: number,
  debtPayment: number,
): MonthDataPoint[] {
  const data: MonthDataPoint[] = [];
  for (let m = 1; m <= months; m++) {
    const bestRevenue = revenue * BEST_MULTIPLIER;
    const worstRevenue = revenue * WORST_MULTIPLIER;

    data.push({
      month: `M${m}`,
      best: Math.round(bestRevenue - expenses - debtPayment),
      base: Math.round(revenue - expenses - debtPayment),
      worst: Math.round(worstRevenue - expenses - debtPayment),
    });
  }
  return data;
}

function assessRisk(data: MonthDataPoint[]): {
  overall: RiskLevel;
  scenarios: ScenarioRisk[];
} {
  const worstNegative = data.some((d) => d.worst < 0);
  const baseNegative = data.some((d) => d.base < 0);
  const bestNegative = data.some((d) => d.best < 0);

  let overall: RiskLevel;
  if (baseNegative) {
    overall = 'high';
  } else if (worstNegative) {
    overall = 'moderate';
  } else {
    overall = 'low';
  }

  const scenarios: ScenarioRisk[] = [
    {
      label: 'Best Case (+20%)',
      level: bestNegative ? 'high' : 'low',
      color: bestNegative ? '#EF4444' : '#22C55E',
      bgClass: bestNegative
        ? 'bg-red-900/40 border-red-700 text-red-300'
        : 'bg-emerald-900/40 border-emerald-700 text-emerald-300',
      description: bestNegative
        ? 'Cash flow goes negative even with +20% revenue'
        : 'Positive cash flow throughout',
    },
    {
      label: 'Base Case (100%)',
      level: baseNegative ? 'high' : 'low',
      color: baseNegative ? '#EF4444' : '#22C55E',
      bgClass: baseNegative
        ? 'bg-red-900/40 border-red-700 text-red-300'
        : 'bg-emerald-900/40 border-emerald-700 text-emerald-300',
      description: baseNegative
        ? 'Cash flow goes negative at current revenue'
        : 'Positive cash flow throughout',
    },
    {
      label: 'Worst Case (-20%)',
      level: worstNegative ? (baseNegative ? 'high' : 'moderate') : 'low',
      color: worstNegative ? (baseNegative ? '#EF4444' : '#F59E0B') : '#22C55E',
      bgClass: worstNegative
        ? baseNegative
          ? 'bg-red-900/40 border-red-700 text-red-300'
          : 'bg-yellow-900/40 border-yellow-700 text-yellow-300'
        : 'bg-emerald-900/40 border-emerald-700 text-emerald-300',
      description: worstNegative
        ? 'Cash flow goes negative with -20% revenue'
        : 'Positive cash flow throughout',
    },
  ];

  return { overall, scenarios };
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────

function StressTestTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 shadow-xl">
      <p className="text-xs font-semibold text-gray-300 mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 text-xs">
          <span style={{ color: entry.color }} className="font-medium">
            {entry.name}
          </span>
          <span className={`tabular-nums font-semibold ${entry.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmt$(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function CashFlowStressTest({
  monthlyRevenue = DEFAULT_MONTHLY_REVENUE,
  monthlyDebtPayment,
  monthlyExpenses = DEFAULT_MONTHLY_EXPENSES,
  months,
}: CashFlowStressTestProps) {
  const data = useMemo(
    () => computeMonthlyData(months, monthlyRevenue, monthlyExpenses, monthlyDebtPayment),
    [months, monthlyRevenue, monthlyExpenses, monthlyDebtPayment],
  );

  const risk = useMemo(() => assessRisk(data), [data]);

  // Compute Y-axis domain with padding
  const allValues = data.flatMap((d) => [d.best, d.base, d.worst]);
  const yMin = Math.min(...allValues, 0);
  const yMax = Math.max(...allValues, 0);
  const yPadding = Math.max(Math.abs(yMax - yMin) * 0.1, 1000);

  const overallRiskConfig: Record<RiskLevel, { label: string; color: string; bgClass: string }> = {
    low: { label: 'Low Risk', color: '#22C55E', bgClass: 'bg-emerald-900/40 border-emerald-700 text-emerald-300' },
    moderate: { label: 'Moderate Risk', color: '#F59E0B', bgClass: 'bg-yellow-900/40 border-yellow-700 text-yellow-300' },
    high: { label: 'High Risk', color: '#EF4444', bgClass: 'bg-red-900/40 border-red-700 text-red-300' },
  };

  const overall = overallRiskConfig[risk.overall];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">Monthly Cash Flow Stress Test</h3>
            <p className="text-sm text-gray-400 mt-1">
              Can the business afford payments across revenue scenarios?
            </p>
          </div>
          <div className={`px-4 py-2 rounded-lg border text-sm font-bold ${overall.bgClass}`}>
            {overall.label}
          </div>
        </div>

        {/* Chart */}
        <div className="w-full" style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis
                dataKey="month"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                axisLine={{ stroke: '#374151' }}
                tickLine={{ stroke: '#374151' }}
              />
              <YAxis
                domain={[Math.floor(yMin - yPadding), Math.ceil(yMax + yPadding)]}
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                axisLine={{ stroke: '#374151' }}
                tickLine={{ stroke: '#374151' }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip content={<StressTestTooltip /> as any} />
              <Legend
                wrapperStyle={{ paddingTop: 16 }}
                iconType="line"
                formatter={(value: string) => (
                  <span className="text-xs text-gray-300">{value}</span>
                )}
              />

              {/* Break-even reference line at $0 */}
              <ReferenceLine
                y={0}
                stroke="#EF4444"
                strokeDasharray="8 4"
                strokeWidth={2}
                label={{
                  value: 'Break-even',
                  position: 'right',
                  fill: '#EF4444',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />

              {/* Best case: dashed green */}
              <Line
                type="monotone"
                dataKey="best"
                name="Best (+20%)"
                stroke="#22C55E"
                strokeWidth={2}
                strokeDasharray="8 4"
                dot={false}
                activeDot={{ r: 4, fill: '#22C55E' }}
              />

              {/* Base case: solid gold */}
              <Line
                type="monotone"
                dataKey="base"
                name="Base (100%)"
                stroke="#C9A84C"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#C9A84C' }}
              />

              {/* Worst case: dotted red */}
              <Line
                type="monotone"
                dataKey="worst"
                name="Worst (-20%)"
                stroke="#EF4444"
                strokeWidth={2}
                strokeDasharray="2 4"
                dot={false}
                activeDot={{ r: 4, fill: '#EF4444' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Assumptions row */}
        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          <span>Revenue: {fmt$(monthlyRevenue)}/mo</span>
          <span>Expenses: {fmt$(monthlyExpenses)}/mo</span>
          <span>Debt Payment: {fmt$(monthlyDebtPayment)}/mo</span>
          <span>Horizon: {months} months</span>
        </div>
      </div>

      {/* Risk Rating Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {risk.scenarios.map((scenario) => (
          <div
            key={scenario.label}
            className={`rounded-xl border p-4 space-y-2 ${scenario.bgClass}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">{scenario.label}</p>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: scenario.color + '22', color: scenario.color }}
              >
                {scenario.level === 'low'
                  ? 'Low Risk'
                  : scenario.level === 'moderate'
                    ? 'Moderate Risk'
                    : 'High Risk'}
              </span>
            </div>
            <p className="text-xs opacity-80">{scenario.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
