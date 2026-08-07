'use client';

// ============================================================
// BusinessCreditScoresPanel — 3-card business credit scores display
// Shows D&B PAYDEX, Experian Business, and FICO SBSS scores
// With optional Score History LineChart (recharts)
// ============================================================

import { useState } from 'react';
import { ACQUISITION_PATHS, type AcquisitionPath } from '@/lib/score-acquisition';
import { AcquisitionPathDetail } from './AcquisitionPathDetail';
import {
  scoreCardState,
  showsProgressToward,
  type ScoreObtainability,
} from '@/lib/credit-view';
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
  /**
   * Equifax's own business product, 101–992.
   *
   * The panel showed three products while the system typed four. Equifax
   * Business Credit Risk got its own score type when the adapter stopped
   * writing its output as `sbss`, and `sc_006` gates Tier 2 on it — so the one
   * place an advisor looks at business credit omitted a score the client can
   * obtain and a tier depends on.
   */
  equifaxBusinessRisk: number | null;
  equifaxDate: string | null;
  /** Pulls on record, oldest first. Empty when none have been taken. */
  history: ScoreHistoryPoint[];
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
  obtainability: ScoreObtainability;
  /**
   * How the client gets this score. Optional so a card can exist before its
   * path is written, rather than forcing a placeholder — an empty expansion
   * would read as "there is nothing to do", which for three of these four is
   * false and for the fourth is the whole point.
   */
  acquisition?: AcquisitionPath;
  /**
   * Optional, because a target only means something a client can move toward.
   * A lender-computed score has no target on this card: there is no action
   * that closes the gap, so "115 pts needed" would be a to-do list item
   * nobody can pick up.
   */
  target?: number;
  targetLabel?: string;
  thresholds: { green: number; amber: number };
}

function ScoreCard({ title, score, maxScore, pullDate, obtainability, target, targetLabel, thresholds, acquisition }: ScoreCardProps) {
  const [expanded, setExpanded] = useState(false);
  const state = scoreCardState(score, obtainability);
  const obtainable = showsProgressToward(obtainability);

  // `score !== null`, not `state === 'measured'`, even though the two are
  // equivalent by construction. TypeScript narrows `score` from the first and
  // cannot from the second, so deriving it via `state` left every later use of
  // `score` typed `number | null`. Root `tsc --noEmit` passed; the Next build,
  // which type-checks the frontend with its own config, failed on
  // `score >= target`. Equivalent-by-construction is not equivalent to the
  // compiler.
  const hasScore = score !== null;
  const pct = hasScore ? Math.min((score / maxScore) * 100, 100) : 0;
  const hasTarget = target !== undefined && targetLabel !== undefined;
  const meetsTarget = hasScore && hasTarget && score >= target;
  const ptsNeeded = hasScore && hasTarget && !meetsTarget ? target - score : 0;

  return (
    <div
      // A stable hook per card. Selecting these by DOM shape resolved to a
      // container holding three of them, because the cards are siblings in a
      // grid and `filter({ hasText })` matches every ancestor that contains
      // the text. A structural locator here is one refactor from silently
      // targeting the wrong card.
      data-testid={`score-card-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      className={`rounded-xl border p-5 flex flex-col ${
        obtainable
          ? 'border-gray-800 bg-gray-900'
          // Deliberately a different card, not a greyer one. "Not measured"
          // and "not measurable" must not be told apart only by reading.
          : 'border-sky-900/50 bg-sky-950/20'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        <span className={`text-xs ${obtainable ? 'text-gray-500' : 'text-sky-400/80'}`}>
          {pullDate
            ? `Pulled ${pullDate}`
            : obtainable
              ? 'Not yet pulled'
              : 'Nothing to pull'}
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
        ) : state === 'awaiting_pull' ? (
          <>
            <p className="text-4xl font-bold text-gray-600 leading-none">&mdash;</p>
            <p className="text-sm text-gray-600 mt-1">Not yet pulled</p>
          </>
        ) : (
          <>
            {/* No em dash here. An em dash reads as a blank waiting to be
                filled in, which is exactly the wrong impression. */}
            <p className="text-2xl font-bold text-sky-300/70 leading-none mt-1">
              Lender-computed
            </p>
            <p className="text-sm text-sky-400/60 mt-1">Not obtainable on demand</p>
          </>
        )}
      </div>

      {/* Progress bar — only where progress is a thing that can be made. */}
      {obtainable && (
        <div className="h-2 rounded-full bg-gray-800 overflow-hidden mb-4">
          {hasScore && (
            <div
              className={`h-full rounded-full transition-all ${scoreColor(score, thresholds)}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
      )}

      {/* Footer: the target where there is one, and always the next action. */}
      <div
        className={`mt-auto pt-3 border-t ${obtainable ? 'border-gray-800' : 'border-sky-900/40'}`}
      >
        {hasTarget && (
          <div className="flex items-center gap-2 text-xs mb-1.5">
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
        )}

        {/* The half that was missing: a card said whether the client had the
            score and never how they get one. */}
        <p className={`text-xs leading-relaxed ${obtainable ? 'text-gray-500' : 'text-sky-400/70'}`}>
          {obtainability.kind === 'client_obtainable'
            ? obtainability.action
            : obtainability.reason}
        </p>

        {/* The summary above is unchanged. This adds the acquisition path
            beneath it — collapsed, because four expanded paths would bury the
            scoreboard the panel exists to show. */}
        {acquisition && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className={`mt-2 text-[11px] font-semibold underline decoration-dotted ${
                obtainable ? 'text-gray-400 hover:text-gray-200' : 'text-sky-400/80 hover:text-sky-300'
              }`}
            >
              {expanded
                ? 'Show less'
                : acquisition.kind === 'no_path'
                  ? 'Why there is no path →'
                  : 'How a client gets this →'}
            </button>
            {expanded && <AcquisitionPathDetail path={acquisition} />}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score History — mock data (Oct 2025 → Mar 2026, improving trend)
// ---------------------------------------------------------------------------

// This was a six-month series ending in paydex 72, intelliscore 54, sbss 148
// — a rising curve drawn for every client, including ones with no business
// credit file at all. GET /api/credit-builder/:clientId/score-history builds
// the real one from credit_profiles, and omits months with no pull rather
// than interpolating across them.

export interface ScoreHistoryPoint {
  month: string;
  paydex?: number | null;
  intelliscore?: number | null;
  sbss?: number | null;
}

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
  equifaxBusinessRisk,
  equifaxDate,
  history,
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
            Three bureau scores a client can obtain, and one a lender computes
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <ScoreCard
          title="D&B PAYDEX"
          acquisition={ACQUISITION_PATHS.paydex}
          score={paydex}
          maxScore={100}
          pullDate={paydexDate}
          target={80}
          targetLabel="80+ for Tier 1 unlock"
          thresholds={{ green: 80, amber: 60 }}
          obtainability={{
            kind: 'client_obtainable',
            action: 'D&B CreditSignal alerts on changes for free; the number itself needs a paid report, from about $60. Built by paying Net-30 vendors that report to D&B, early rather than on time.',
          }}
        />
        <ScoreCard
          title="Experian Business"
          acquisition={ACQUISITION_PATHS.intelliscore}
          score={experianBusiness}
          maxScore={100}
          pullDate={experianDate}
          target={60}
          targetLabel="60+ for Tier 2"
          thresholds={{ green: 80, amber: 60 }}
          obtainability={{
            kind: 'client_obtainable',
            action: 'Intelliscore Plus, about $49.95 a report or $199 a year — not free. The fastest win on this page: read the file for errors and dispute them, because correcting bad data moves a score faster than building good data.',
          }}
        />
        {/* No target and no progress bar. Both would imply an action that
            closes the gap, and there is none — see the reason below. */}
        <ScoreCard
          title="FICO SBSS"
          acquisition={ACQUISITION_PATHS.sbss}
          score={sbss}
          maxScore={300}
          pullDate={sbssDate}
          thresholds={{ green: 200, amber: 140 }}
          obtainability={{
            kind: 'lender_computed',
            reason: 'Calculated by FICO when a lender requests it, from the owners\' personal credit, business bureau data, financials and the application — so there is no record to pull and nothing an advisor can do to produce one. Coach the inputs, personal credit first. If a lender has pulled one, ask them for it.',
          }}
        />
        {/* Equifax Business Credit Risk, 101–992 — its own product, not SBSS.
            The panel tracked three scores while the system typed four, so the
            score `sc_006` gates Tier 2 on had no card. Client-obtainable, and
            the target matches that criterion rather than being invented here. */}
        <ScoreCard
          title="Equifax Business Risk"
          acquisition={ACQUISITION_PATHS.equifax_business_risk}
          score={equifaxBusinessRisk}
          maxScore={992}
          pullDate={equifaxDate}
          target={500}
          targetLabel="500+ for Tier 2"
          thresholds={{ green: 600, amber: 450 }}
          obtainability={{
            kind: 'client_obtainable',
            action: 'About $49.95 through a reseller such as eCredable, or roughly $30–40 direct from Equifax (verified 2026-08-05). Check which score you are reading: a bundle prints several, and only the Business Credit Risk Score (101–992) belongs here. Business Failure runs 1,000–1,880 and Payment Index 1–100, so both are obvious — but OneScore for Commercial runs 300–650 and looks exactly like a valid figure on this scale.',
          }}
        />
      </div>

      {/* ── Score History Chart ─────────────────────────────────────── */}
      {showHistory && (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/60 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            Score Trajectory
          </h3>
          {history.length === 0 ? (
            <p className="text-xs text-gray-500">
              No business credit pulls are on record for this client, so there is no
              trajectory to plot. This used to draw a six-month climb ending at paydex
              72 and SBSS 148 for everybody, including clients with no file at all.
            </p>
          ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={history} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
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
          )}
        </div>
      )}
    </section>
  );
}
