'use client';

// ============================================================
// BusinessCreditScoresPanel — 3-card business credit scores display
// Shows D&B PAYDEX, Experian Business, and FICO SBSS scores
// With optional Score History LineChart (recharts)
// ============================================================

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BusinessCreditScoresPanelProps {
  clientName: string | null;
  paydex: number | null;
  paydexDate: string | null;
  experianBusiness: number | null;
  experianDate: string | null;
  sbss: number | null;
  sbssDate: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number, thresholds: { green: number; amber: number }): string {
  if (score >= thresholds.green) return 'bg-green-500';
  if (score >= thresholds.amber) return 'bg-yellow-500';
  return 'bg-red-500';
}

function scoreLabel(score: number, thresholds: { green: number; amber: number }): string {
  if (score >= thresholds.green) return 'Excellent';
  if (score >= thresholds.amber) return 'Good';
  if (score >= thresholds.amber * 0.6) return 'Fair';
  return 'Poor';
}

function scoreLabelColor(score: number, thresholds: { green: number; amber: number }): string {
  if (score >= thresholds.green) return 'text-green-400';
  if (score >= thresholds.amber) return 'text-yellow-400';
  if (score >= thresholds.amber * 0.6) return 'text-orange-400';
  return 'text-red-400';
}

// ---------------------------------------------------------------------------
// ScoreCard sub-component
// ---------------------------------------------------------------------------

interface ScoreCardProps {
  title: string;
  score: number | null;
  maxScore: number;
  pullDate: string | null;
  target: number;
  targetLabel: string;
  thresholds: { green: number; amber: number };
}

function ScoreCard({ title, score, maxScore, pullDate, target, targetLabel, thresholds }: ScoreCardProps) {
  const hasScore = score !== null;
  const pct = hasScore ? Math.min((score / maxScore) * 100, 100) : 0;
  const meetsTarget = hasScore && score >= target;
  const ptsNeeded = hasScore && !meetsTarget ? target - score : 0;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        <span className="text-xs text-gray-500">
          {pullDate ? `Pulled ${pullDate}` : 'Not yet pulled'}
        </span>
      </div>

      {/* Score display */}
      <div className="text-center mb-4">
        {hasScore ? (
          <>
            <p className="text-4xl font-bold text-white leading-none">
              {score}
              <span className="text-lg text-gray-500 font-normal">/{maxScore}</span>
            </p>
            <p className={`text-sm font-semibold mt-1 ${scoreLabelColor(score, thresholds)}`}>
              {scoreLabel(score, thresholds)}
            </p>
          </>
        ) : (
          <>
            <p className="text-4xl font-bold text-gray-600 leading-none">&mdash;</p>
            <p className="text-sm text-gray-600 mt-1">Not yet pulled</p>
          </>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-gray-800 overflow-hidden mb-4">
        {hasScore && (
          <div
            className={`h-full rounded-full transition-all ${scoreColor(score, thresholds)}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>

      {/* Target */}
      <div className="mt-auto pt-3 border-t border-gray-800">
        <div className="flex items-center gap-2 text-xs">
          {hasScore ? (
            meetsTarget ? (
              <>
                <span className="text-green-400">&#x2705;</span>
                <span className="text-gray-400">{targetLabel}</span>
              </>
            ) : (
              <>
                <span className="text-yellow-400 font-semibold">{ptsNeeded} pts needed</span>
                <span className="text-gray-500">&middot;</span>
                <span className="text-gray-400">{targetLabel}</span>
              </>
            )
          ) : (
            <span className="text-gray-500">{targetLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score History — mock data (Oct 2025 → Mar 2026, improving trend)
// ---------------------------------------------------------------------------

const SCORE_HISTORY = [
  { month: 'Oct 25', paydex: 45, intelliscore: 32, sbss: 110 },
  { month: 'Nov 25', paydex: 52, intelliscore: 38, sbss: 122 },
  { month: 'Dec 25', paydex: 58, intelliscore: 42, sbss: 131 },
  { month: 'Jan 26', paydex: 64, intelliscore: 47, sbss: 138 },
  { month: 'Feb 26', paydex: 68, intelliscore: 51, sbss: 144 },
  { month: 'Mar 26', paydex: 72, intelliscore: 54, sbss: 148 },
];

// ---------------------------------------------------------------------------
// Custom tooltip for dark theme
// ---------------------------------------------------------------------------

function ScoreHistoryTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-700 bg-[#0A1628] px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-gray-300 mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: <span className="font-bold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BusinessCreditScoresPanel({
  clientName,
  paydex,
  paydexDate,
  experianBusiness,
  experianDate,
  sbss,
  sbssDate,
}: BusinessCreditScoresPanelProps) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-200">
            Business Credit Scores
            {clientName && (
              <span className="text-gray-500 font-normal"> &mdash; {clientName}</span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Current bureau scores across D&amp;B, Experian, and FICO SBSS
          </p>
        </div>

        {/* Score History toggle */}
        <button
          type="button"
          onClick={() => setShowHistory((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors
            ${showHistory
              ? 'border-[#C9A84C]/40 bg-[#C9A84C]/10 text-[#C9A84C]'
              : 'border-gray-700 bg-gray-900 text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8M14 7h7v7" />
          </svg>
          {showHistory ? 'Hide History' : 'Score History'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ScoreCard
          title="D&B PAYDEX"
          score={paydex}
          maxScore={100}
          pullDate={paydexDate}
          target={80}
          targetLabel="80+ for Tier 1 unlock"
          thresholds={{ green: 80, amber: 60 }}
        />
        <ScoreCard
          title="Experian Business"
          score={experianBusiness}
          maxScore={100}
          pullDate={experianDate}
          target={60}
          targetLabel="60+ for Tier 2"
          thresholds={{ green: 80, amber: 60 }}
        />
        <ScoreCard
          title="FICO SBSS"
          score={sbss}
          maxScore={300}
          pullDate={sbssDate}
          target={175}
          targetLabel="175+ for Tier 3"
          thresholds={{ green: 200, amber: 140 }}
        />
      </div>

      {/* ── Score History Chart ─────────────────────────────────────── */}
      {showHistory && (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/60 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            Score Trajectory &mdash; Last 6 Months
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={SCORE_HISTORY} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="month"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                axisLine={{ stroke: '#4B5563' }}
                tickLine={{ stroke: '#4B5563' }}
              />
              <YAxis
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                axisLine={{ stroke: '#4B5563' }}
                tickLine={{ stroke: '#4B5563' }}
                domain={[0, 200]}
              />
              <Tooltip content={<ScoreHistoryTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: 12 }}
                formatter={(value: string) => (
                  <span className="text-xs text-gray-400">{value}</span>
                )}
              />

              {/* Reference lines at key thresholds */}
              <ReferenceLine y={80} stroke="#C9A84C" strokeDasharray="6 3" strokeOpacity={0.5} label={{ value: 'PAYDEX 80', position: 'right', fill: '#C9A84C', fontSize: 10 }} />
              <ReferenceLine y={60} stroke="#3B82F6" strokeDasharray="6 3" strokeOpacity={0.5} label={{ value: 'Intelliscore 60', position: 'right', fill: '#3B82F6', fontSize: 10 }} />
              <ReferenceLine y={160} stroke="#14B8A6" strokeDasharray="6 3" strokeOpacity={0.5} label={{ value: 'SBSS 160', position: 'right', fill: '#14B8A6', fontSize: 10 }} />

              {/* Score lines */}
              <Line
                type="monotone"
                dataKey="paydex"
                name="PAYDEX"
                stroke="#C9A84C"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#C9A84C', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#C9A84C', stroke: '#0A1628', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="intelliscore"
                name="Intelliscore"
                stroke="#3B82F6"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#3B82F6', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#3B82F6', stroke: '#0A1628', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="sbss"
                name="SBSS"
                stroke="#14B8A6"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#14B8A6', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#14B8A6', stroke: '#0A1628', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
