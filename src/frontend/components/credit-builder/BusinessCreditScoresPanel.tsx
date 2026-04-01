// ============================================================
// BusinessCreditScoresPanel — 3-card business credit scores display
// Shows D&B PAYDEX, Experian Business, and FICO SBSS scores
// ============================================================

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
  return (
    <section>
      <div className="mb-4">
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
    </section>
  );
}
