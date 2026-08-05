'use client';

// ============================================================
// GraduationTrackPanel — where a client is in the four-track
// progression, what is holding the next track closed, and what
// would open it.
//
// The engine behind this has been tested and unrendered since it was written:
// nothing in the frontend called /graduation/status, so the tracks, the gates
// and the roadmap existed only in an API response nobody read.
//
// The rule this panel exists to keep: a gate a client has *failed* and a gate
// nobody has *measured* are different facts, and only the first is about the
// client. They get different words, different colours, and different actions.
// ============================================================

import type {
  GraduationStatusView,
  GraduationGateView,
  GateStatus,
} from '@/lib/graduation-view';
import { gatesByStatus } from '@/lib/graduation-view';

export interface GraduationTrackPanelProps {
  /** Null until the assessment has been read. */
  status: GraduationStatusView | null;
  clientSelected: boolean;
  /** Set when the assessment could not be loaded at all. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

/**
 * `unknown` deliberately does not borrow the failure colour.
 *
 * Amber says "you fall short of this". Grey says "we have not looked". An
 * advisor acting on the first would tell a client to spend months building a
 * score; on the second, to pull a report.
 */
const GATE_STYLE: Record<GateStatus, { badge: string; label: string; icon: string; iconColor: string }> = {
  passed: {
    badge: 'bg-green-900 text-green-300 border-green-700',
    label: 'Met',
    icon: '✓',
    iconColor: 'text-green-400',
  },
  failed: {
    badge: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    label: 'Not yet',
    icon: '◑',
    iconColor: 'text-yellow-500',
  },
  unknown: {
    badge: 'bg-gray-800 text-gray-400 border-gray-700',
    label: 'Not measured',
    icon: '?',
    iconColor: 'text-gray-500',
  },
};

function GateRow({ gate }: { gate: GraduationGateView }) {
  const style = GATE_STYLE[gate.status];

  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900/40 p-2.5">
      <span className={`mt-0.5 w-4 flex-shrink-0 text-center text-sm font-bold ${style.iconColor}`}>
        {style.icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-300">{gate.criterion}</p>

        {/* What the gate read. An unmeasured gate has no figure to show, and
            printing "0" here would be the whole defect in miniature. */}
        <p className="mt-0.5 text-xs text-gray-500">
          {gate.actual === null ? (
            <span className="italic">Not on record</span>
          ) : (
            <>
              <span className="text-gray-400">{gate.actual}</span>
              <span className="mx-1.5 text-gray-600">·</span>
              needs {gate.required}
            </>
          )}
        </p>

        {/* The action, for a gate nobody has measured. This is the sentence
            that makes the third state useful rather than merely honest. */}
        {gate.status === 'unknown' && gate.resolution && (
          <p className="mt-1 text-xs text-gray-400">{gate.resolution}</p>
        )}
      </div>

      <span className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-xs ${style.badge}`}>
        {style.label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GraduationTrackPanel({
  status,
  clientSelected,
  error,
}: GraduationTrackPanelProps) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-200">Programme Track</h2>
        {status && (
          <span className="flex items-center gap-2">
            <span className="rounded border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-2 py-0.5 text-xs font-bold text-[#C9A84C]">
              {status.currentTrackLabel}
            </span>
            {/* A track is a funding-readiness claim an advisor acts on, so a
                track that lost a requirement must not read as a clean
                qualification. Amber beside the label, not a footnote below
                it — the badge is what gets read. */}
            {status.currentTrackCoverage === 'narrow' && (
              <span className="rounded border border-amber-700/60 bg-amber-900/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                Narrow assessment
              </span>
            )}
          </span>
        )}
      </div>
      <p className="mb-5 text-xs text-gray-500">
        Which of the four tracks this client qualifies for, and what the next one is waiting on
      </p>

      {/* Not read is not "no progress". An empty panel would read as a client
          with nothing holding them back. */}
      {status === null ? (
        <p className="text-xs text-gray-500">
          {error
            ? error
            : clientSelected
              ? 'This client’s track could not be assessed.'
              : 'Select a client to see which track they qualify for.'}
        </p>
      ) : (
        <>
          <p className="mb-4 text-xs text-gray-400">{status.currentTrackDescription}</p>

          {/* What qualifying for this track does not cover. Shown whether or
              not the client clears it: coverage is a fact about the track. */}
          {status.currentTrackCoverageNote && (
            <p className="mb-4 rounded-lg border border-amber-900/40 bg-amber-900/10 px-3 py-2 text-xs leading-relaxed text-amber-200/80">
              {status.currentTrackCoverageNote}
            </p>
          )}

          {/* ── Progression ─────────────────────────────────── */}
          <ol className="mb-5 space-y-1.5">
            {status.progression.map((step) => (
              <li
                key={step.track}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  step.active
                    ? 'border-[#C9A84C]/40 bg-[#C9A84C]/10'
                    : 'border-gray-800 bg-gray-900/30'
                }`}
              >
                <span
                  className={`text-xs font-semibold ${step.active ? 'text-[#C9A84C]' : 'text-gray-400'}`}
                >
                  {step.label}
                  {step.active && <span className="ml-2 text-gray-500">— current</span>}
                </span>
                <span className="text-xs text-gray-500">{step.range}</span>
              </li>
            ))}
          </ol>

          {/* ── Gates on the next track ─────────────────────── */}
          {status.nextTrackLabel === null ? (
            // "On the highest track, no next one to qualify for" reads as a
            // terminal endorsement — the client has arrived. On a narrow
            // track that is a stronger claim than the evidence supports, and
            // it is the sentence an advisor quotes. It says what was actually
            // established: everything this system assesses, and no more.
            status.currentTrackCoverage === 'narrow' ? (
              <p className="text-xs leading-relaxed text-amber-200/80">
                This client clears everything this system assesses, and there is no
                further track to qualify for.{' '}
                <span className="font-semibold">
                  Business credit is not among the things assessed
                </span>{' '}
                — treat this as the top of what is measured here, not a judgement
                that the client is ready for institutional credit.
              </p>
            ) : (
              <p className="text-xs text-gray-400">
                This client is on the highest track. There is no next one to qualify for.
              </p>
            )
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-gray-300">
                  To reach {status.nextTrackLabel}
                </h3>
                <span className="text-xs text-gray-500">{gateSummary(status)}</span>
              </div>

              <div className="space-y-2">
                {status.gates.map((gate) => (
                  <GateRow key={gate.criterion} gate={gate} />
                ))}
              </div>

              {/* An estimate is offered only where one can honestly be made.
                  A gate nobody has measured has no timeline, because the wait
                  is a report rather than months of building. */}
              <p className="mt-3 text-xs text-gray-500">
                {status.nextTrackEligible
                  ? `Every requirement for ${status.nextTrackLabel} is met.`
                  : status.estimatedMonthsToNextTrack === null
                    ? 'No timeline is projected while a requirement is unmeasured.'
                    : `Estimated ${status.estimatedMonthsToNextTrack} month${status.estimatedMonthsToNextTrack === 1 ? '' : 's'} at the current rate.`}
              </p>
            </div>
          )}

          {/* ── Roadmap ─────────────────────────────────────── */}
          {status.roadmap.length > 0 && (
            <div className="mt-5 border-t border-gray-800 pt-4">
              <h3 className="mb-2 text-xs font-semibold text-gray-300">Next actions</h3>
              <ol className="space-y-2">
                {status.roadmap.map((action) => (
                  <li key={`${action.priority}-${action.category}`} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-bold text-gray-400">
                      {action.priority}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-200">{action.action}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {action.impact}
                        <span className="mx-1.5 text-gray-700">·</span>
                        <span className="text-gray-400">{action.timelineEstimate}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** "3 met · 1 not yet · 1 not measured", omitting whatever is zero. */
function gateSummary(status: GraduationStatusView): string {
  const counts = gatesByStatus(status.gates);
  const parts: string[] = [];
  if (counts.passed > 0) parts.push(`${counts.passed} met`);
  if (counts.failed > 0) parts.push(`${counts.failed} not yet`);
  if (counts.unknown > 0) parts.push(`${counts.unknown} not measured`);
  return parts.join(' · ');
}
