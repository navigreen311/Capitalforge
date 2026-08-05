// ============================================================
// CapitalForge — graduation track view mapping
//
// `GET /api/businesses/:id/graduation/status` has existed, tested and
// unrendered, for as long as the engine behind it. Nothing in the frontend
// called it, so the four progression tracks, the gates holding a client back
// and the roadmap out of them were reachable only by an advisor who knew the
// URL.
//
// Kept pure, like `credit-view`, so the rules are testable without rendering.
// ============================================================

/**
 * Three outcomes, mirroring the engine.
 *
 * `unknown` is a requirement nobody has measured this client against — not one
 * they fell short of. The panel must not draw them alike: a client who has not
 * been scored has not failed anything, and telling them otherwise sends them
 * to fix a problem they may not have.
 */
export type GateStatus = 'passed' | 'failed' | 'unknown';

export interface GraduationGateView {
  criterion: string;
  required: number | string;
  /** Null when the figure this gate reads has never been recorded. */
  actual: number | string | null;
  status: GateStatus;
  gap: number | null;
  /** What would answer an unknown gate. Null when the gate was measured. */
  resolution: string | null;
}

export interface RoadmapActionView {
  priority: number;
  category: string;
  action: string;
  impact: string;
  timelineEstimate: string;
}

export interface TrackStepView {
  track: string;
  label: string;
  range: string;
  active: boolean;
}

export interface GraduationStatusView {
  currentTrackLabel: string;
  currentTrackDescription: string;
  currentTrackCreditRange: string;
  /**
   * Whether this track still asserts everything it used to. `narrow` means a
   * requirement was removed as unmeasurable, so qualifying covers less ground
   * than it appears to — see TRACK_COVERAGE in client-graduation.service.
   */
  currentTrackCoverage: 'full' | 'narrow';
  currentTrackCoverageNote: string | null;
  nextTrackLabel: string | null;
  nextTrackEligible: boolean;
  gates: GraduationGateView[];
  roadmap: RoadmapActionView[];
  progression: TrackStepView[];
  /** Null when no estimate can be made — which includes an unmeasured gate. */
  estimatedMonthsToNextTrack: number | null;
}

const STATUSES = new Set<GateStatus>(['passed', 'failed', 'unknown']);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * The assessment, or null when nothing was read.
 *
 * Null rather than an empty assessment: a client with no gates and a client
 * whose assessment could not be loaded are different states, and an empty
 * panel would read as "nothing is holding them back".
 */
export function toGraduationStatus(data: unknown): GraduationStatusView | null {
  const root = asRecord(data);
  const body = asRecord(root['data']) ;
  const d = Object.keys(body).length > 0 ? body : root;

  if (typeof d['currentTrackLabel'] !== 'string') return null;

  const gates = (Array.isArray(d['milestoneGates']) ? d['milestoneGates'] : []).flatMap(
    (raw): GraduationGateView[] => {
      const g = asRecord(raw);
      const criterion = str(g['criterion']);
      if (criterion === '') return [];

      const status = g['status'] as GateStatus;
      return [
        {
          criterion,
          required:
            typeof g['required'] === 'number' || typeof g['required'] === 'string'
              ? (g['required'] as number | string)
              : '',
          // Undefined and null both mean not recorded. Zero is a real value
          // and must survive: a client with no tradelines genuinely has none.
          actual:
            g['actual'] === null || g['actual'] === undefined
              ? null
              : (g['actual'] as number | string),
          // An unrecognised status becomes `unknown`, never `failed`. A client
          // must not be shown as falling short because a string did not parse.
          status: STATUSES.has(status) ? status : 'unknown',
          gap: typeof g['gap'] === 'number' ? g['gap'] : null,
          resolution: typeof g['resolution'] === 'string' ? g['resolution'] : null,
        },
      ];
    },
  );

  const roadmap = (Array.isArray(d['actionRoadmap']) ? d['actionRoadmap'] : []).flatMap(
    (raw): RoadmapActionView[] => {
      const a = asRecord(raw);
      const action = str(a['action']);
      if (action === '') return [];
      return [
        {
          priority: typeof a['priority'] === 'number' ? a['priority'] : 99,
          category: str(a['category'], 'other'),
          action,
          impact: str(a['impact']),
          timelineEstimate: str(a['timelineEstimate'], 'Unknown'),
        },
      ];
    },
  );

  const progression = (Array.isArray(d['trackProgression']) ? d['trackProgression'] : []).flatMap(
    (raw): TrackStepView[] => {
      const t = asRecord(raw);
      const track = str(t['track']);
      if (track === '') return [];
      return [
        {
          track,
          label: str(t['label'], track),
          range: str(t['range']),
          active: t['active'] === true,
        },
      ];
    },
  );

  return {
    currentTrackLabel: d['currentTrackLabel'] as string,
    currentTrackDescription: str(d['currentTrackDescription']),
    currentTrackCreditRange: str(d['currentTrackCreditRange']),
    // Defaults to 'full' when the field is absent, which is the safe
    // direction: an older response simply renders as it always did rather
    // than claiming a narrowness it knows nothing about.
    currentTrackCoverage: d['currentTrackCoverage'] === 'narrow' ? 'narrow' : 'full',
    currentTrackCoverageNote:
      typeof d['currentTrackCoverageNote'] === 'string' ? d['currentTrackCoverageNote'] : null,
    nextTrackLabel: typeof d['nextTrackLabel'] === 'string' ? d['nextTrackLabel'] : null,
    nextTrackEligible: d['nextTrackEligible'] === true,
    gates,
    roadmap: roadmap.sort((a, b) => a.priority - b.priority),
    progression,
    estimatedMonthsToNextTrack:
      typeof d['estimatedMonthsToNextTrack'] === 'number'
        ? d['estimatedMonthsToNextTrack']
        : null,
  };
}

/** How many gates are holding the next track closed, and why. */
export function gatesByStatus(gates: GraduationGateView[]): {
  passed: number;
  failed: number;
  unknown: number;
} {
  return {
    passed: gates.filter((g) => g.status === 'passed').length,
    failed: gates.filter((g) => g.status === 'failed').length,
    unknown: gates.filter((g) => g.status === 'unknown').length,
  };
}
