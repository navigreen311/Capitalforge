'use client';

// ============================================================
// CreditScoreCard — circular gauge, bureau, pull date,
// utilization bar.
// ============================================================

import { type Bureau, type ScoreType } from '../../../shared/types';

interface CreditScoreCardProps {
  score: number;
  maxScore?: number;
  bureau: Bureau;
  scoreType?: ScoreType;
  pullDate: string;           // ISO date string
  utilization?: number;       // 0–1
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.75) return '#22c55e';   // green-500
  if (pct >= 0.55) return '#eab308';   // yellow-500
  if (pct >= 0.4)  return '#f97316';   // orange-500
  return '#ef4444';                     // red-500
}

function scoreLabel(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.75) return 'Excellent';
  if (pct >= 0.65) return 'Good';
  if (pct >= 0.55) return 'Fair';
  if (pct >= 0.4)  return 'Poor';
  return 'Very Poor';
}

function utilizationColor(u: number): string {
  if (u <= 0.3)  return 'bg-green-500';
  if (u <= 0.7)  return 'bg-yellow-500';
  if (u <= 0.9)  return 'bg-orange-500';
  return 'bg-red-500';
}

function bureauLabel(bureau: Bureau): string {
  const labels: Record<Bureau, string> = {
    equifax: 'Equifax',
    transunion: 'TransUnion',
    experian: 'Experian',
    dnb: 'D&B',
  };
  return labels[bureau] ?? bureau;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// SVG circular gauge
// ---------------------------------------------------------------------------

interface GaugeProps {
  score: number;
  max: number;
  size?: number;
}

function CircularGauge({ score, max, size = 120 }: GaugeProps) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(score / max, 1);
  const dashOffset = circumference * (1 - pct);
  const color = scoreColor(score, max);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} className="block" aria-hidden="true">
      {/* Track */}
      <circle
        cx={cx} cy={cy} r={radius}
        fill="none"
        stroke="#1f2937"   /* gray-800 */
        strokeWidth={10}
      />
      {/* Progress arc — starts at 12 o'clock */}
      <circle
        cx={cx} cy={cy} r={radius}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      {/* Score label */}
      <text
        x={cx} y={cy - 6}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size * 0.22}
        fontWeight="700"
        fill={color}
      >
        {score}
      </text>
      <text
        x={cx} y={cy + size * 0.16}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size * 0.1}
        fill="#9ca3af"   /* gray-400 */
      >
        / {max}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CreditScoreCard({
  score,
  maxScore = 850,
  bureau,
  scoreType = 'fico',
  pullDate,
  utilization,
  className = '',
}: CreditScoreCardProps) {
  const label = scoreLabel(score, maxScore);

  return (
    <div
      className={`rounded-xl border border-gray-700 bg-gray-900 p-5 flex flex-col items-center gap-4 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between w-full text-sm">
        <span className="font-semibold text-gray-100 uppercase tracking-wide">
          {bureauLabel(bureau)}
        </span>
        <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full uppercase">
          {scoreType}
        </span>
      </div>

      {/* Gauge */}
      <CircularGauge score={score} max={maxScore} size={130} />

      {/* Label */}
      <p
        className="text-sm font-semibold"
        style={{ color: scoreColor(score, maxScore) }}
      >
        {label}
      </p>

      {/* Pull date */}
      <p className="text-xs text-gray-500">
        Pulled {formatDate(pullDate)}
      </p>

      {/* Utilization bar */}
      {utilization !== undefined && (
        <div className="w-full">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Utilization</span>
            <span>{Math.round(utilization * 100)}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${utilizationColor(utilization)}`}
              style={{
                width: `${Math.min(utilization * 100, 100)}%`,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
