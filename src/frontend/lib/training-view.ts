// ============================================================
// CapitalForge — Training and certification mapping
//
// The training page called nothing. It carried three certification tracks
// with their own modules, and a per-advisor progress table:
//
//   Jordan M.  5/5 modules   certified 2026-01-15   expires 2027-01-15
//   Casey R.   5/5 modules   certified 2026-01-15   expires 2027-01-15
//
// A completed certification is the evidence that mandatory training was
// done. Nobody sat any of it.
//
// The real ones:
//   GET  /api/training/certifications             — a user's certifications
//   GET  /api/training/tracks                     — what each track covers
//   POST /api/training/certifications/:id/complete
//
// The catalogue endpoint did not exist before this repair; the tracks lived
// only inside the service, which is why the page had its own copy of them.
//
// A certification is per user, and no endpoint lists users — so a team
// progress table cannot be built. One person's record can, given their id.
// ============================================================

export type TrackName = 'onboarding' | 'annual' | 'advanced';

/**
 * Certification status as the API records it.
 *
 * 'passed' and 'failed' are outcomes of an attempt; 'expired' is a pass that
 * has lapsed. They are kept apart because they mean different things about
 * whether somebody may work.
 */
export type CertStatus = 'not_started' | 'in_progress' | 'passed' | 'failed' | 'expired';

export interface TrackModule {
  id: string;
  title: string;
  description: string;
  topics: string[];
  bannedClaimCategories: string[];
  estimatedMinutes: number | null;
  /**
   * Takeaways from the enforcement cases behind this module.
   *
   * The cases themselves are not carried. They name parties and penalties
   * that are not real — see withoutEnforcementCases in the training service.
   */
  lessons: string[];
}

export interface Track {
  name: TrackName | string;
  label: string;
  description: string;
  /** Null when the certification does not expire. */
  expiryMonths: number | null;
  passingScore: number | null;
  prerequisiteTracks: string[];
  modules: TrackModule[];
  totalMinutes: number | null;
}

export interface Certification {
  id: string;
  userId: string;
  trackName: string;
  status: CertStatus;
  /** Null until an attempt has been scored. Never 0 as a stand-in. */
  score: number | null;
  completedAt: string | null;
  expiresAt: string | null;
  certificateRef: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

const STATUSES = new Set<string>([
  'not_started',
  'in_progress',
  'passed',
  'failed',
  'expired',
]);

/**
 * A certification status.
 *
 * Anything unrecognised becomes 'not_started' — never 'passed'. A pass is
 * the record that somebody completed mandatory training, and it has to come
 * from an attempt, not from a fallback.
 */
export function toCertStatus(raw: unknown): CertStatus {
  const s = (str(raw) ?? '').toLowerCase();
  return STATUSES.has(s) ? (s as CertStatus) : 'not_started';
}

export function toCertification(row: unknown): Certification | null {
  const r = asRecord(row);
  const id = str(r['id']);
  if (id === null) return null;

  return {
    id,
    userId: str(r['userId']) ?? '',
    trackName: str(r['trackName']) ?? 'unknown',
    status: toCertStatus(r['status']),
    score: num(r['score']),
    completedAt: str(r['completedAt']),
    expiresAt: str(r['expiresAt']),
    certificateRef: str(r['certificateRef']),
  };
}

export function toCertifications(data: unknown): Certification[] {
  const list = Array.isArray(data) ? data : asRecord(data)['data'];
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => toCertification(row))
    .filter((row): row is Certification => row !== null);
}

export function toTrack(row: unknown): Track | null {
  const r = asRecord(row);
  const name = str(r['name']);
  if (name === null) return null;

  const modules = Array.isArray(r['modules'])
    ? r['modules'].flatMap((entry) => {
        const m = asRecord(entry);
        const id = str(m['id']);
        const title = str(m['title']);
        if (id === null || title === null) return [];
        return [
          {
            id,
            title,
            description: str(m['description']) ?? '',
            topics: stringList(m['topics']),
            bannedClaimCategories: stringList(m['bannedClaimCategories']),
            estimatedMinutes: num(m['estimatedMinutes']),
            lessons: stringList(m['lessons']),
          },
        ];
      })
    : [];

  return {
    name,
    label: str(r['label']) ?? name,
    description: str(r['description']) ?? '',
    expiryMonths: num(r['expiryMonths']),
    passingScore: num(r['passingScore']),
    prerequisiteTracks: stringList(r['prerequisiteTracks']),
    modules,
    totalMinutes: num(r['totalMinutes']),
  };
}

export function toTracks(data: unknown): Track[] {
  const list = Array.isArray(data) ? data : asRecord(data)['data'];
  if (!Array.isArray(list)) return [];
  return list.map((row) => toTrack(row)).filter((row): row is Track => row !== null);
}

// ── Derived ─────────────────────────────────────────────────

/**
 * Whether a certification is currently valid.
 *
 * A pass with an expiry in the past is not valid, whatever the stored status
 * says: expiry is a date, and a status column can lag behind it. The service
 * has an expireStale sweep, and nothing guarantees it has run.
 */
export function isCurrentlyValid(cert: Certification, now: Date): boolean {
  if (cert.status !== 'passed') return false;
  if (cert.expiresAt === null) return true;

  const expires = new Date(cert.expiresAt);
  if (Number.isNaN(expires.getTime())) return false;
  return expires.getTime() > now.getTime();
}

/** Days until a certification lapses. Null when it does not expire. */
export function daysUntilExpiry(cert: Certification, now: Date): number | null {
  if (cert.expiresAt === null) return null;
  const expires = new Date(cert.expiresAt);
  if (Number.isNaN(expires.getTime())) return null;
  return Math.ceil((expires.getTime() - now.getTime()) / 86_400_000);
}

export interface TrackStanding {
  track: Track;
  certification: Certification | null;
  valid: boolean;
  /** Null when there is no certification or it does not expire. */
  daysLeft: number | null;
  /** Prerequisite tracks not currently held. */
  missingPrerequisites: string[];
}

/**
 * Where the person stands on each track.
 *
 * A track with no certification row is "not started" — which is different
 * from failed, and different again from expired. The page shows the
 * difference because only one of them means somebody once passed.
 */
export function standings(
  tracks: Track[],
  certifications: Certification[],
  now: Date,
): TrackStanding[] {
  const byTrack = new Map(certifications.map((c) => [c.trackName, c]));

  const valid = new Set(
    certifications.filter((c) => isCurrentlyValid(c, now)).map((c) => c.trackName),
  );

  return tracks.map((track) => {
    const certification = byTrack.get(String(track.name)) ?? null;
    return {
      track,
      certification,
      valid: certification !== null && isCurrentlyValid(certification, now),
      daysLeft: certification === null ? null : daysUntilExpiry(certification, now),
      missingPrerequisites: track.prerequisiteTracks.filter((p) => !valid.has(p)),
    };
  });
}

export interface TrainingSummary {
  tracks: number;
  /** Tracks with a currently valid certification. */
  certified: number;
  /** Passed but lapsed — somebody who was certified and no longer is. */
  lapsed: number;
  inProgress: number;
  notStarted: number;
}

export function summarise(rows: TrackStanding[], now: Date): TrainingSummary {
  return {
    tracks: rows.length,
    certified: rows.filter((r) => r.valid).length,
    lapsed: rows.filter(
      (r) => r.certification?.status === 'passed' && !isCurrentlyValid(r.certification, now),
    ).length,
    inProgress: rows.filter((r) => r.certification?.status === 'in_progress').length,
    notStarted: rows.filter((r) => r.certification === null).length,
  };
}

/** Snake case to words, for values the API sends as enum keys. */
export function humanise(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}
