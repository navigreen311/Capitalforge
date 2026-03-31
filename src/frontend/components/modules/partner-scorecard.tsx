'use client';

// ============================================================
// PartnerScorecard — 4 dimension bars (compliance, complaints,
// due diligence, contract) + overall grade A–F with color.
// ============================================================

interface DimensionScore {
  label: string;
  score: number; // 0–100
}

interface PartnerScorecardProps {
  compliance: number;    // 0–100
  complaints: number;    // 0–100 (higher = better = fewer complaints)
  dueDiligence: number;  // 0–100
  contract: number;      // 0–100
  partnerName?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gradeFromScore(avg: number): { grade: string; color: string; bgClass: string; borderClass: string } {
  if (avg >= 90) return { grade: 'A', color: '#22c55e', bgClass: 'bg-green-950',  borderClass: 'border-green-700' };
  if (avg >= 80) return { grade: 'B', color: '#84cc16', bgClass: 'bg-lime-950',   borderClass: 'border-lime-700' };
  if (avg >= 70) return { grade: 'C', color: '#eab308', bgClass: 'bg-yellow-950', borderClass: 'border-yellow-700' };
  if (avg >= 60) return { grade: 'D', color: '#f97316', bgClass: 'bg-orange-950', borderClass: 'border-orange-700' };
  return               { grade: 'F', color: '#ef4444', bgClass: 'bg-red-950',     borderClass: 'border-red-700' };
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 65) return 'bg-lime-500';
  if (score >= 50) return 'bg-yellow-500';
  if (score >= 35) return 'bg-orange-500';
  return 'bg-red-500';
}

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 65) return 'text-lime-400';
  if (score >= 50) return 'text-yellow-400';
  if (score >= 35) return 'text-orange-400';
  return 'text-red-400';
}

// ---------------------------------------------------------------------------
// DimensionBar sub-component
// ---------------------------------------------------------------------------

function DimensionBar({ label, score }: DimensionScore) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400 font-medium">{label}</span>
        <span className={`font-bold tabular-nums ${scoreTextColor(score)}`}>{score}</span>
      </div>
      <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor(score)}`}
          style={{ width: `${Math.min(score, 100)}%`, transition: 'width 0.5s ease' }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PartnerScorecard({
  compliance,
  complaints,
  dueDiligence,
  contract,
  partnerName,
  className = '',
}: PartnerScorecardProps) {
  const avg = Math.round((compliance + complaints + dueDiligence + contract) / 4);
  const { grade, color, bgClass, borderClass } = gradeFromScore(avg);

  const dimensions: DimensionScore[] = [
    { label: 'Compliance',    score: compliance },
    { label: 'Complaints',    score: complaints },
    { label: 'Due Diligence', score: dueDiligence },
    { label: 'Contract',      score: contract },
  ];

  return (
    <div className={`rounded-xl border border-gray-800 bg-gray-900 p-5 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          {partnerName && (
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Partner Scorecard</p>
          )}
          <p className="text-sm font-semibold text-gray-100">
            {partnerName ?? 'Partner Scorecard'}
          </p>
        </div>

        {/* Overall grade badge */}
        <div
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl border-2 ${bgClass} ${borderClass} flex-shrink-0`}
        >
          <span className="text-2xl font-black leading-none" style={{ color }}>{grade}</span>
          <span className="text-xs text-gray-500 mt-0.5">{avg}/100</span>
        </div>
      </div>

      {/* Dimension bars */}
      <div className="space-y-3">
        {dimensions.map((d) => (
          <DimensionBar key={d.label} label={d.label} score={d.score} />
        ))}
      </div>

      {/* Footer legend */}
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
        <span className="text-gray-500 font-semibold">Grade:</span>
        <span className="text-green-400">A 90+</span>
        <span className="text-lime-400">B 80+</span>
        <span className="text-yellow-400">C 70+</span>
        <span className="text-orange-400">D 60+</span>
        <span className="text-red-400">F &lt;60</span>
      </div>
    </div>
  );
}
