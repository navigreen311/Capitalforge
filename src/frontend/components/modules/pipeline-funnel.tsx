'use client';

// ============================================================
// PipelineFunnel — 5-stage visual funnel
// Stages: Prospect → Onboarding → Active → Graduated → Churned
// Color gradient from navy (#0A1628) to gold (#C9A84C)
// ============================================================

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  description?: string;
}

interface PipelineFunnelProps {
  stages: FunnelStage[];
  className?: string;
  onStageClick?: (key: string) => void;
  selectedStage?: string | null;
}

// ─── Color interpolation (navy → gold) ───────────────────────────────────────

// Navy: #0A1628  →  Gold: #C9A84C
// Interpolate at 5 steps across R, G, B channels
const STAGE_COLORS = [
  '#0A1628', // 0% — full navy
  '#2D3A58', // 25%
  '#506285', // 50%
  '#8A8460', // 75%
  '#C9A84C', // 100% — full gold
];

const STAGE_TEXT_COLORS = [
  'text-white',
  'text-white',
  'text-white',
  'text-white',
  'text-[#0A1628]',
];

// ─── Conversion badge ─────────────────────────────────────────────────────────

function ConversionArrow({ from, to }: { from: number; to: number }) {
  if (from === 0) return null;
  const rate = Math.round((to / from) * 100);
  return (
    <div className="flex flex-col items-center gap-0.5 py-1" aria-label={`${rate}% conversion`}>
      <span className="text-[10px] font-semibold text-gray-400">{rate}%</span>
      <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden="true">
        <path d="M7 0 L7 12 M3 9 L7 13 L11 9" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ─── Single funnel stage bar ──────────────────────────────────────────────────

interface StageBarProps {
  stage: FunnelStage;
  maxCount: number;
  index: number;
  totalStages: number;
  onClick?: () => void;
  selected?: boolean;
}

function StageBar({ stage, maxCount, index, totalStages, onClick, selected }: StageBarProps) {
  // Width shrinks from 100% (index 0) to 52% (last stage)
  const minWidthPct = 52;
  const widthPct = 100 - ((100 - minWidthPct) / (totalStages - 1)) * index;
  const bgColor = STAGE_COLORS[index] ?? STAGE_COLORS[STAGE_COLORS.length - 1];
  const textColor = STAGE_TEXT_COLORS[index] ?? 'text-white';

  return (
    <div
      className={`mx-auto rounded-lg flex items-center justify-between px-5 py-3 transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:brightness-125' : ''
      } ${selected ? 'ring-2 ring-[#C9A84C] ring-offset-1 ring-offset-gray-900' : ''}`}
      style={{ width: `${widthPct}%`, backgroundColor: bgColor }}
      role="listitem"
      aria-label={`${stage.label}: ${stage.count} clients`}
      onClick={onClick}
    >
      {/* Left: label */}
      <div>
        <p className={`text-sm font-bold leading-tight ${textColor}`}>{stage.label}</p>
        {stage.description && (
          <p className={`text-[10px] mt-0.5 opacity-75 ${textColor}`}>{stage.description}</p>
        )}
      </div>

      {/* Right: count + mini bar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Proportion bar */}
        <div className="w-20 h-1.5 rounded-full bg-white/20 overflow-hidden hidden sm:block">
          <div
            className="h-full rounded-full bg-white/70"
            style={{ width: `${maxCount > 0 ? Math.round((stage.count / maxCount) * 100) : 0}%` }}
          />
        </div>
        <span className={`text-xl font-bold tabular-nums ${textColor}`}>{stage.count}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PipelineFunnel({ stages, className = '', onStageClick, selectedStage }: PipelineFunnelProps) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div
      className={`w-full flex flex-col items-stretch gap-0 ${className}`}
      role="list"
      aria-label="Client pipeline funnel"
    >
      {stages.map((stage, i) => (
        <div key={stage.key} className="flex flex-col items-center">
          <StageBar
            stage={stage}
            maxCount={maxCount}
            index={i}
            totalStages={stages.length}
            onClick={onStageClick ? () => onStageClick(stage.key) : undefined}
            selected={selectedStage === stage.key}
          />
          {i < stages.length - 1 && (
            <ConversionArrow from={stage.count} to={stages[i + 1].count} />
          )}
        </div>
      ))}

      {/* Summary row */}
      <div className="mt-4 pt-4 border-t border-gray-800 flex flex-wrap gap-x-6 gap-y-2 justify-center">
        {stages.map((stage, i) => (
          <div key={stage.key} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: STAGE_COLORS[i] ?? STAGE_COLORS[STAGE_COLORS.length - 1] }}
              aria-hidden="true"
            />
            <span>{stage.label}</span>
            <span className="font-semibold text-gray-200">{stage.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
