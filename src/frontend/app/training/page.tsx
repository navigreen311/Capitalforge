'use client';

// ============================================================
// /training — Training and certification
//
// This page called nothing. It carried three certification tracks with their
// own modules, and a per-advisor progress table:
//
//   Jordan M.  5/5 modules   certified 2026-01-15   expires 2027-01-15
//   Casey R.   5/5 modules   certified 2026-01-15   expires 2027-01-15
//
// A completed certification is the evidence that mandatory training was
// done, and it is what an examiner asks to see. Nobody sat any of it.
//
// It also carried a banned-claims library with enforcement case examples.
// Those cases live in the training service and are not real — one names a
// company that appears elsewhere in this codebase as an explicitly stubbed
// vendor, with a docket-style reference. The service no longer lets them out
// at all; what does come through is the lesson from each.
//
// Wired to:
//   GET /api/training/certifications  — this user's certifications
//   GET /api/training/tracks          — what each track covers
//
// The catalogue endpoint did not exist before, which is why this page had
// its own copy of the tracks. A team progress table still cannot be built:
// certifications are per user and no endpoint lists users.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  toCertifications,
  toTracks,
  standings,
  summarise,
  humanise,
  type Track,
  type Certification,
  type TrackStanding,
  type CertStatus,
} from '@/lib/training-view';

const STATUS_STYLE: Record<CertStatus, { label: string; cls: string }> = {
  passed: { label: 'Passed', cls: 'bg-green-900 text-green-300 border-green-700' },
  in_progress: { label: 'In progress', cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  failed: { label: 'Failed', cls: 'bg-red-900 text-red-300 border-red-700' },
  expired: { label: 'Expired', cls: 'bg-orange-900 text-orange-300 border-orange-700' },
  not_started: { label: 'Not started', cls: 'bg-gray-800 text-gray-500 border-gray-700' },
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
  return token === null ? {} : { Authorization: `Bearer ${token}` };
}

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TrainingPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partial, setPartial] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // One instant per render pass, so every expiry on the page is measured
  // from the same moment.
  const now = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setPartial([]);
    const headers = authHeaders();
    const failed: string[] = [];

    try {
      const [tracksRes, certsRes] = await Promise.all([
        fetch('/api/training/tracks', { headers }),
        fetch('/api/training/certifications', { headers }),
      ]);

      if (tracksRes.ok) {
        const body = (await tracksRes.json()) as { success?: boolean; data?: unknown };
        setTracks(body.success === true ? toTracks(body.data) : []);
      } else {
        setTracks([]);
        failed.push('the catalogue');
      }

      if (certsRes.ok) {
        const body = (await certsRes.json()) as { success?: boolean; data?: unknown };
        setCerts(body.success === true ? toCertifications(body.data) : []);
      } else {
        setCerts([]);
        // Without this the page would show every track as not started, which
        // reads as "you have done none of it".
        failed.push('your certifications');
      }

      setPartial(failed);
    } catch {
      setLoadError('Could not reach the server. No training record is shown.');
      setTracks([]);
      setCerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => standings(tracks, certs, now), [tracks, certs, now]);
  const summary = useMemo(() => summarise(rows, now), [rows, now]);

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Training &amp; Certification</h1>
        <p className="text-sm text-gray-400 mt-1">
          Your certifications, and what each track covers.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading your training record…</p>}

      {loadError !== null && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {loadError}
        </p>
      )}

      {!loading && loadError === null && (
        <>
          {partial.length > 0 && (
            <p className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-xs text-yellow-300">
              Could not load {partial.join(' and ')}. What is shown below is incomplete — do not
              read a blank as a track you have not taken.
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Tracks" value={String(summary.tracks)} />
            <Kpi
              label="Currently certified"
              value={String(summary.certified)}
              note="passed and not lapsed"
            />
            <Kpi
              label="Lapsed"
              value={String(summary.lapsed)}
              note={summary.lapsed === 0 ? 'nothing has expired' : 'passed once, expired since'}
            />
            <Kpi label="Not started" value={String(summary.notStarted)} />
          </div>

          <div className="space-y-3">
            {rows.length === 0 && (
              <p className="rounded-xl border border-gray-800 bg-gray-900/40 px-5 py-10 text-center text-sm text-gray-500">
                No certification track is published.
              </p>
            )}

            {rows.map((row) => (
              <TrackCard
                key={String(row.track.name)}
                row={row}
                open={expanded === String(row.track.name)}
                onToggle={() =>
                  setExpanded(
                    expanded === String(row.track.name) ? null : String(row.track.name),
                  )
                }
              />
            ))}
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-gray-300">What is not here</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Only your own record. Certifications are held per user and no endpoint lists users,
              so a team progress table cannot be assembled — the previous version showed one for
              four advisors, with completion dates and expiries that were written into the page.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              No enforcement cases. Each module carries takeaways drawn from them, and those are
              shown; the cases themselves name parties, penalties and docket references that are
              not real, so the service no longer sends them.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Modules are not marked off here. Nothing records progress within a track — a
              certification is recorded as a whole, when it is completed. The banned-claim wording
              each module covers is checked by the scan on{' '}
              <Link href="/comm-compliance" className="text-[#C9A84C] hover:underline">
                communication compliance
              </Link>
              .
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function TrackCard({
  row,
  open,
  onToggle,
}: {
  row: TrackStanding;
  open: boolean;
  onToggle: () => void;
}) {
  const { track, certification, valid, daysLeft, missingPrerequisites } = row;
  const status = STATUS_STYLE[certification?.status ?? 'not_started'];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-100">{track.label}</h2>
            <p className="text-xs text-gray-500 mt-1">{track.description}</p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`rounded-full border px-2 py-0.5 text-2xs ${status.cls}`}>
              {status.label}
            </span>
            {/* A pass past its expiry is not current, whatever the status
                column says — the sweep that marks records expired may not
                have run. */}
            {certification?.status === 'passed' && !valid && (
              <span className="text-2xs text-orange-400">expired {formatDate(certification.expiresAt)}</span>
            )}
            {valid && daysLeft !== null && (
              <span className="text-2xs text-gray-500">{daysLeft} days left</span>
            )}
            {valid && daysLeft === null && (
              <span className="text-2xs text-gray-600">does not expire</span>
            )}
          </div>
        </div>
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-2xs text-gray-600">
        <span>
          {track.modules.length} module{track.modules.length === 1 ? '' : 's'}
        </span>
        {track.totalMinutes !== null && <span>{track.totalMinutes} minutes</span>}
        {track.passingScore !== null && <span>pass mark {track.passingScore}</span>}
        {certification?.score !== null && certification !== null && (
          <span className="text-gray-500">your score {certification.score}</span>
        )}
        {certification?.completedAt !== null && certification !== null && (
          <span className="text-gray-500">completed {formatDate(certification.completedAt)}</span>
        )}
      </div>

      {missingPrerequisites.length > 0 && (
        <p className="mt-3 rounded-lg border border-yellow-800 bg-yellow-900/20 px-3 py-2 text-2xs text-yellow-300">
          Requires a current {missingPrerequisites.map(humanise).join(', ')} certification first.
        </p>
      )}

      {open && (
        <div className="mt-4 space-y-3">
          {track.modules.map((module) => (
            <div key={module.id} className="rounded-lg border border-gray-800 bg-[#071019] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-gray-200">{module.title}</p>
                {module.estimatedMinutes !== null && (
                  <span className="text-2xs text-gray-600">{module.estimatedMinutes} min</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">{module.description}</p>

              {module.topics.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {module.topics.map((topic) => (
                    <li key={topic} className="flex gap-2 text-xs text-gray-400">
                      <span className="text-gray-700 flex-shrink-0">•</span>
                      {topic}
                    </li>
                  ))}
                </ul>
              )}

              {module.lessons.length > 0 && (
                <div className="mt-3 border-t border-gray-800 pt-3">
                  <p className="text-2xs uppercase tracking-wide text-gray-600 mb-1">Takeaways</p>
                  {module.lessons.map((lesson) => (
                    <p key={lesson} className="text-xs text-gray-300">
                      {lesson}
                    </p>
                  ))}
                </div>
              )}

              {module.bannedClaimCategories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {module.bannedClaimCategories.map((c) => (
                    <span
                      key={c}
                      className="rounded border border-gray-800 bg-gray-900 px-2 py-0.5 text-2xs text-gray-500"
                    >
                      {humanise(c)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-100 mt-0.5">{value}</p>
      {note !== undefined && <p className="text-2xs text-gray-600 mt-0.5">{note}</p>}
    </div>
  );
}
