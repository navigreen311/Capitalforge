'use client';
import { getStoredUserId } from '@/lib/session-storage';

// ============================================================
// /compliance/training — Compliance training status
//
// This page called nothing. Five training modules carried their own due
// dates, completion flags and scores, and beside them sat an advisor grid:
//
//   Sarah Chen        TCPA ✓  UDAP ✓  State ✓  Product ✗  AML ✗
//   Lisa Thompson     TCPA ✗  UDAP ✗  State ✗  Product ✗  AML ✗
//
// Five named people against five modules, and every cell invented. A
// completed compliance module is the evidence that somebody was trained.
//
// This is the page the sidebar links to, so it carries the working surface:
// your certifications, where each stands, and completing one.
//   GET  /api/training/certifications
//   GET  /api/training/tracks
//   POST /api/training/certifications/:id/complete
//
// The module grid is not rebuilt. Certification is recorded per track, as a
// whole — nothing records progress through the modules inside one, so a
// per-module tick would be the same fixture in a new place. Nor is the
// advisor grid: certifications are per user and no endpoint lists users.
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
import { loadJson, toLoadError } from '@/lib/load-json';

const STATUS_STYLE: Record<CertStatus, { label: string; cls: string }> = {
  passed: { label: 'Passed', cls: 'bg-green-900 text-green-300 border-green-700' },
  in_progress: { label: 'In progress', cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  failed: { label: 'Failed', cls: 'bg-red-900 text-red-300 border-red-700' },
  expired: { label: 'Expired', cls: 'bg-orange-900 text-orange-300 border-orange-700' },
  not_started: { label: 'Not started', cls: 'bg-gray-800 text-gray-500 border-gray-700' },
};

/** The signed-in user, as the login stored it. */
function currentUserId(): string | null {
  // Was its own parse of `cf_user`, one of three.
  return getStoredUserId();
}

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ComplianceTrainingPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partial, setPartial] = useState<string[]>([]);

  const [me, setMe] = useState<string | null>(null);
  const [scoring, setScoring] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    setMe(currentUserId());
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setPartial([]);
    const failed: string[] = [];

    try {
      // Per-endpoint reporting, kept intact. This page was set aside in batch 1
      // of the sweep as resisting conversion, on the grounds that loadJson
      // throws and would collapse the distinction between which of the two
      // failed. It does not: putting the catch on each promise rather than
      // around the group keeps it exactly.
      const [tracks, certs] = await Promise.all([
        loadJson<unknown>('/api/training/tracks').then(toTracks).catch(() => null),
        loadJson<unknown>('/api/training/certifications')
          .then(toCertifications)
          .catch(() => null),
      ]);

      setTracks(tracks ?? []);
      if (tracks === null) failed.push('the catalogue');

      setCerts(certs ?? []);
      // Otherwise every track reads as not started, which says you have
      // done none of it.
      if (certs === null) failed.push('your certifications');

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

  const complete = useCallback(
    async (certificationId: string) => {
      const value = Number(score);
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        setActionError('Enter a whole score between 0 and 100.');
        return;
      }

      setBusy(true);
      setActionError(null);
      try {
        const data = await loadJson<{ status?: string; certificateRef?: string | null }>(
          `/api/training/certifications/${encodeURIComponent(certificationId)}/complete`,
          { method: 'POST', body: { score: value } },
        );

        showToast(
          data?.status === 'passed'
            ? `Recorded as passed${data.certificateRef ? ` — ${data.certificateRef}` : ''}.`
            : 'Recorded as failed. The score was below the pass mark for this track.',
        );
        setScoring(null);
        setScore('');
        await load();
      } catch (e) {
        setActionError(`Nothing was recorded. ${toLoadError(e).message}`);
      } finally {
        setBusy(false);
      }
    },
    [score, load, showToast],
  );

  const rows = useMemo(() => standings(tracks, certs, now), [tracks, certs, now]);
  const summary = useMemo(() => summarise(rows, now), [rows, now]);

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6 space-y-6">
      {toast !== null && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-[#C9A84C]/30 bg-[#0A1628] px-5 py-3 text-sm text-gray-100 shadow-2xl">
          {toast}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-white">Compliance Training</h1>
        <p className="text-sm text-gray-400 mt-1">
          Where your certifications stand, and what renews when.
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
              Could not load {partial.join(' and ')}. What is below is incomplete — do not read a
              blank as a track you have not taken.
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Currently certified" value={String(summary.certified)} />
            <Kpi
              label="Lapsed"
              value={String(summary.lapsed)}
              note={summary.lapsed === 0 ? 'nothing has expired' : 'passed once, expired since'}
            />
            <Kpi label="In progress" value={String(summary.inProgress)} />
            <Kpi label="Not started" value={String(summary.notStarted)} />
          </div>

          {actionError !== null && (
            <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              {actionError}
            </p>
          )}

          <div className="rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Certification</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-left">Completed</th>
                  <th className="px-4 py-3 text-left">Renews</th>
                  <th className="px-4 py-3 text-left">Certificate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                      No certification track is published.
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <TrackRow
                    key={String(row.track.name)}
                    row={row}
                    mine={me !== null && row.certification?.userId === me}
                    scoring={scoring === row.certification?.id}
                    score={score}
                    busy={busy}
                    onScoreChange={setScore}
                    onStart={() => {
                      setScoring(row.certification?.id ?? null);
                      setScore('');
                      setActionError(null);
                    }}
                    onCancel={() => setScoring(null)}
                    onSubmit={() => {
                      if (row.certification !== null) complete(row.certification.id);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-gray-300">How a score is recorded</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              The score is entered here and taken as given — no assessment is run, and nothing
              records who typed it. It is compared against the track&rsquo;s pass mark, and a pass
              sets the renewal date and issues a certificate reference.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Completing is only offered for your own certifications. The API scopes the request to
              the tenant rather than to you, so a caller with compliance write access can complete
              somebody else&rsquo;s — that is worth closing, and this page does not do it.
            </p>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-gray-300">What is not here</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              No module grid. Five modules used to carry their own due dates, completion flags and
              scores; certification is recorded per track as a whole, and nothing records progress
              through the modules inside one. What each track covers is on{' '}
              <Link href="/training" className="text-[#C9A84C] hover:underline">
                training
              </Link>
              .
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              No advisor grid. Five named people were shown against those modules with every cell
              filled in. Certifications are per user and no endpoint lists users, so a team view
              cannot be assembled.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function TrackRow({
  row,
  mine,
  scoring,
  score,
  busy,
  onScoreChange,
  onStart,
  onCancel,
  onSubmit,
}: {
  row: TrackStanding;
  mine: boolean;
  scoring: boolean;
  score: string;
  busy: boolean;
  onScoreChange: (value: string) => void;
  onStart: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { track, certification, valid, daysLeft } = row;
  const status = STATUS_STYLE[certification?.status ?? 'not_started'];
  const canComplete =
    mine && certification !== null && (certification.status === 'in_progress' || !valid);

  return (
    <tr>
      <td className="px-4 py-3">
        <p className="text-gray-200">{track.label}</p>
        <p className="text-2xs text-gray-600">
          {humanise(String(track.name))}
          {track.passingScore !== null && ` · pass mark ${track.passingScore}`}
        </p>
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full border px-2 py-0.5 text-2xs ${status.cls}`}>
          {status.label}
        </span>
        {/* A pass past its expiry is not current, whatever the column says. */}
        {certification?.status === 'passed' && !valid && (
          <span className="block text-2xs text-orange-400 mt-0.5">lapsed</span>
        )}
      </td>
      <td className="px-4 py-3 text-right text-gray-400">
        {certification?.score ?? <span className="text-gray-600">—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-400">
        {formatDate(certification?.completedAt ?? null)}
      </td>
      <td className="px-4 py-3 text-xs">
        {certification === null || certification.expiresAt === null ? (
          <span className="text-gray-600">
            {certification === null ? '—' : 'does not expire'}
          </span>
        ) : (
          <span className={daysLeft !== null && daysLeft < 30 ? 'text-yellow-400' : 'text-gray-400'}>
            {formatDate(certification.expiresAt)}
            {daysLeft !== null && (
              <span className="block text-2xs text-gray-600">
                {daysLeft < 0 ? `${Math.abs(daysLeft)} days ago` : `${daysLeft} days`}
              </span>
            )}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs">
        {certification?.certificateRef !== null && certification !== null ? (
          <span className="font-mono text-gray-400">{certification.certificateRef}</span>
        ) : scoring ? (
          <span className="flex items-center gap-2">
            <input
              aria-label={`Score for ${track.label}`}
              type="number"
              min="0"
              max="100"
              value={score}
              onChange={(e) => onScoreChange(e.target.value)}
              className="w-20 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200"
            />
            <button
              onClick={onSubmit}
              disabled={busy}
              className="rounded bg-[#C9A84C] px-2 py-1 text-2xs font-semibold text-[#0A1628] disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Record'}
            </button>
            <button onClick={onCancel} className="text-2xs text-gray-500 hover:text-gray-300">
              Cancel
            </button>
          </span>
        ) : canComplete ? (
          <button
            onClick={onStart}
            className="rounded-lg border border-gray-700 px-2 py-1 text-2xs text-gray-300 hover:bg-gray-900"
          >
            Record a score
          </button>
        ) : certification === null ? (
          // Nothing to complete: enrolment happens elsewhere, and there is no
          // endpoint here to start a track.
          <span className="text-gray-600">not enrolled</span>
        ) : (
          <span className="text-gray-600">—</span>
        )}
      </td>
    </tr>
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
