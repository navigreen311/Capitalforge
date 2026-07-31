'use client';

// ============================================================
// /declines — Decline Recovery Center
//
// This page used to hold its entire dataset in the component: seven
// DeclineRecord literals for clients that do not exist, a six-row reapply
// calendar, a five-row analytics series, a list of client names, and an
// adverse action "parser" that reported the same invented extraction —
// Chase, Experian, score 682 — for any file dropped on it. Advancing a
// recovery stage ran a setTimeout and mutated local state; logging a decline
// pushed onto an array; the letter generator asserted $540,000 of revenue and
// a resolved tax lien for whichever client was selected. Nothing was written,
// nothing was read, and a reload restored the same seven records.
//
// Eleven endpoints for exactly this work were mounted and answering the
// whole time. This reads and writes them.
//
// Sections:
//   1. Recovery stats            GET   /api/declines/stats
//   2. Declines table            GET   /api/declines
//   3. Stage and outcome         PATCH /api/declines/:id/stage, /resolve
//   4. Reconsideration letter    POST  /api/declines/:id/reconsideration
//   5. Log a decline             POST  /api/declines
//   6. Reason and issuer rates   GET   /api/declines/analytics
// ============================================================

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { getReconGuidance } from '@/lib/issuer-recon-guidance';
import { fetchAllPages } from '@/lib/fetch-all-pages';
import {
  toDeclineRows,
  toDeclineStats,
  toDeclineAnalytics,
  cooldownState,
  eligibleToReapply,
  nextStages,
  isTerminal,
  RECOVERY_STAGES,
  type DeclineRow,
  type DeclineStats,
  type DeclineAnalytics,
  type RecoveryStage,
  type ReasonCategory,
  type ReconStatus,
} from '@/lib/decline-view';

// ---------------------------------------------------------------------------
// Presentation tables
// ---------------------------------------------------------------------------

const REASON_LABELS: Record<ReasonCategory, { label: string; cls: string }> = {
  too_many_inquiries:   { label: 'Too Many Inquiries', cls: 'bg-orange-900 text-orange-300 border-orange-700' },
  insufficient_history: { label: 'Thin File',          cls: 'bg-blue-900 text-blue-300 border-blue-700'       },
  high_utilization:     { label: 'High Utilization',   cls: 'bg-red-900 text-red-300 border-red-700'          },
  income_verification:  { label: 'Income Verify',      cls: 'bg-purple-900 text-purple-300 border-purple-700' },
  velocity:             { label: 'Velocity Rule',      cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  internal_policy:      { label: 'Internal Policy',    cls: 'bg-gray-700 text-gray-300 border-gray-600'       },
  derogatory_marks:     { label: 'Derogatory',         cls: 'bg-red-950 text-red-400 border-red-800'          },
  unknown:              { label: 'Unclassified',       cls: 'bg-gray-800 text-gray-400 border-gray-700'       },
};

const RECON_STATUS_LABELS: Record<ReconStatus, { label: string; cls: string }> = {
  pending:     { label: 'Pending',     cls: 'bg-gray-800 text-gray-500 border-gray-700'       },
  letter_sent: { label: 'Letter Sent', cls: 'bg-blue-900 text-blue-300 border-blue-700'       },
  approved:    { label: 'Approved',    cls: 'bg-green-900 text-green-300 border-green-700'    },
  denied:      { label: 'Denied',      cls: 'bg-red-900 text-red-300 border-red-700'          },
};

const STAGE_LABELS: Record<RecoveryStage, string> = {
  new: 'New',
  letter_sent: 'Letter Sent',
  recon_call_scheduled: 'Recon Call Scheduled',
  recon_call_completed: 'Recon Call Completed',
  reapplication_ready: 'Reapplication Ready',
  reapplied: 'Reapplied',
  won: 'Won',
  lost: 'Lost',
};

const STAGE_COLORS: Record<RecoveryStage, string> = {
  new: 'bg-gray-700 text-gray-300',
  letter_sent: 'bg-blue-900 text-blue-300',
  recon_call_scheduled: 'bg-purple-900 text-purple-300',
  recon_call_completed: 'bg-indigo-900 text-indigo-300',
  reapplication_ready: 'bg-yellow-900 text-yellow-300',
  reapplied: 'bg-cyan-900 text-cyan-300',
  won: 'bg-green-900 text-green-300',
  lost: 'bg-red-900 text-red-300',
};

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
  return token === null ? {} : { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Cooldown
// ---------------------------------------------------------------------------

function CooldownCell({ row, now }: { row: DeclineRow; now: Date }) {
  const state = cooldownState(row.reapplyCooldownDate, now);

  // "Not recorded", never "Eligible Now". Reading an absent cooldown as
  // eligibility invites a hard pull inside the issuer's window.
  if (state.status === 'unknown') {
    return <span className="text-gray-500" title="No reapply date on file">Not recorded</span>;
  }
  if (state.status === 'eligible') {
    return <span className="text-green-400 font-semibold">Eligible now</span>;
  }
  return (
    <span className={state.daysRemaining <= 30 ? 'text-yellow-400' : 'text-red-400'}>
      {state.daysRemaining}d remaining
    </span>
  );
}

// ---------------------------------------------------------------------------
// Reconsideration letter
// ---------------------------------------------------------------------------

interface GeneratedLetter {
  letterId: string;
  subject: string;
  body: string;
}

function LetterModal({
  row,
  onClose,
  onGenerated,
}: {
  row: DeclineRow;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [letter, setLetter] = useState<GeneratedLetter | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The letter is generated and stored by the API, from the reasons the
  // issuer actually gave. The version this page used to build client-side
  // asserted specific revenue, a 40% paydown and a satisfied tax lien for
  // whichever client was open — representations of fact to a creditor, drawn
  // from nothing.
  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/declines/${row.id}/reconsideration`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: row.businessName ?? '' }),
      });
      const body = (await res.json()) as {
        success?: boolean;
        data?: { letter?: GeneratedLetter };
        error?: { message?: string };
      };
      if (!res.ok || body.success !== true || !body.data?.letter) {
        setError(body.error?.message ?? `The letter could not be generated (HTTP ${res.status}).`);
        return;
      }
      setLetter(body.data.letter);
      onGenerated();
    } catch {
      setError('Could not reach the server. Nothing was generated.');
    } finally {
      setBusy(false);
    }
  }, [row.id, row.businessName, onGenerated]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-gray-800 bg-gray-950 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Reconsideration Letter</h2>
            <p className="text-xs text-gray-500 mt-1">
              {row.businessName ?? 'Unnamed client'} · {row.issuer}
              {row.cardProduct === null ? '' : ` · ${row.cardProduct}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
            &times;
          </button>
        </div>

        {row.businessName === null && (
          <p className="mb-4 rounded-lg border border-yellow-800 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-300">
            This decline references a client id that resolves to no business, so the letter would
            be addressed to nobody. Fix the record before generating.
          </p>
        )}

        {letter === null && (
          <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-6 text-center">
            <p className="text-sm text-gray-400 mb-4">
              The letter is written from the decline reasons on this record and stored against it.
            </p>
            <button
              onClick={generate}
              disabled={busy || row.businessName === null}
              className="rounded-lg bg-[#C9A84C] px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Generating…' : 'Generate letter'}
            </button>
          </div>
        )}

        {error !== null && (
          <p className="mt-4 rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        {letter !== null && (
          <>
            <p className="text-xs text-gray-500 mb-2">Subject: {letter.subject}</p>
            <pre className="whitespace-pre-wrap rounded-lg border border-gray-800 bg-gray-900/60 p-4 text-xs text-gray-300 font-mono">
              {letter.body}
            </pre>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(letter.body).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  );
                }}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-900"
              >
                {copied ? 'Copied' : 'Copy to clipboard'}
              </button>
              <span className="text-xs text-gray-500">
                Bracketed fields are for the signer to complete before sending.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log a decline
// ---------------------------------------------------------------------------

interface ClientOption {
  id: string;
  name: string;
}

function LogDeclineModal({
  clients,
  onClose,
  onLogged,
}: {
  clients: ClientOption[];
  onClose: () => void;
  onLogged: (message: string) => void;
}) {
  const [form, setForm] = useState({
    client_id: '',
    issuer: '',
    card_name: '',
    declined_at: '',
    decline_reason: '',
    requested_limit: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    form.client_id !== '' &&
    form.issuer.trim() !== '' &&
    form.card_name.trim() !== '' &&
    form.decline_reason.trim() !== '';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/declines', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: form.client_id,
          issuer: form.issuer.trim(),
          card_name: form.card_name.trim(),
          decline_reason: form.decline_reason.trim(),
          ...(form.declined_at === ''
            ? {}
            : { declined_at: new Date(`${form.declined_at}T00:00:00.000Z`).toISOString() }),
          ...(form.requested_limit === '' ? {} : { requested_limit: Number(form.requested_limit) }),
          ...(form.notes.trim() === '' ? {} : { notes: form.notes.trim() }),
        }),
      });
      const body = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || body.success !== true) {
        // The failure is shown, not swallowed. This form used to push onto an
        // array and report success unconditionally.
        setError(body.error?.message ?? `The decline was not saved (HTTP ${res.status}).`);
        return;
      }
      onLogged('Decline logged.');
    } catch {
      setError('Could not reach the server. The decline was not saved.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-950 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-100">Log a Decline</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="decline-client" className="block text-xs text-gray-400 mb-1">
              Client <span className="text-red-500">*</span>
            </label>
            <select
              id="decline-client"
              className={field}
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {clients.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">
                No clients loaded, so a decline cannot be attached to one.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="decline-issuer" className="block text-xs text-gray-400 mb-1">
              Issuer <span className="text-red-500">*</span>
            </label>
            <input
              id="decline-issuer"
              className={field}
              value={form.issuer}
              onChange={(e) => setForm({ ...form, issuer: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="decline-card" className="block text-xs text-gray-400 mb-1">
              Card product <span className="text-red-500">*</span>
            </label>
            <input
              id="decline-card"
              className={field}
              value={form.card_name}
              onChange={(e) => setForm({ ...form, card_name: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="decline-date" className="block text-xs text-gray-400 mb-1">
              Date declined
            </label>
            <input
              id="decline-date"
              type="date"
              className={field}
              value={form.declined_at}
              onChange={(e) => setForm({ ...form, declined_at: e.target.value })}
            />
            <p className="mt-1 text-xs text-gray-500">
              Recovery time is measured from this date. Left blank, today is used.
            </p>
          </div>

          <div>
            <label htmlFor="decline-reason" className="block text-xs text-gray-400 mb-1">
              Reason given by the issuer <span className="text-red-500">*</span>
            </label>
            <input
              id="decline-reason"
              className={field}
              placeholder="As stated on the adverse action notice"
              value={form.decline_reason}
              onChange={(e) => setForm({ ...form, decline_reason: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="decline-limit" className="block text-xs text-gray-400 mb-1">
              Requested limit
            </label>
            <input
              id="decline-limit"
              type="number"
              min="1"
              className={field}
              value={form.requested_limit}
              onChange={(e) => setForm({ ...form, requested_limit: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="decline-notes" className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea
              id="decline-notes"
              rows={3}
              className={field}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        {error !== null && (
          <p className="mt-4 rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!ready || busy}
            className="rounded-lg bg-[#C9A84C] px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : 'Log decline'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issuer guidance
// ---------------------------------------------------------------------------

function IssuerGuidance({
  issuer,
  measured,
}: {
  issuer: string;
  measured: { winRate: number | null; resolved: number } | null;
}) {
  const guidance = getReconGuidance(issuer);
  if (!guidance) {
    return (
      <p className="text-xs text-gray-500">
        No reconsideration reference on file for {issuer}.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-[#C9A84C]/30 bg-[#0A1628] px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-[#C9A84C]">
          {guidance.issuer} Reconsideration Guidance
        </h3>
        {/* This tenant's own outcomes. The panel used to show a per-issuer
            "Historical success" figure that was written into the reference
            table by hand and measured nothing. */}
        <span className="text-xs text-gray-500">
          {measured === null || measured.resolved === 0 ? (
            <>Your win rate: <span className="text-gray-400">no resolved recoveries yet</span></>
          ) : (
            <>
              Your win rate:{' '}
              <span className="font-bold text-green-400">{measured.winRate}%</span>
              <span className="text-gray-600"> over {measured.resolved} resolved</span>
            </>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
        <div className="rounded-lg bg-gray-900/60 border border-gray-800 px-3 py-2">
          <p className="text-xs text-gray-500 mb-0.5">Phone</p>
          <p className="text-sm font-semibold text-white">{guidance.phone}</p>
        </div>
        <div className="rounded-lg bg-gray-900/60 border border-gray-800 px-3 py-2">
          <p className="text-xs text-gray-500 mb-0.5">Department</p>
          <p className="text-sm font-semibold text-white">{guidance.department}</p>
        </div>
        <div className="rounded-lg bg-gray-900/60 border border-gray-800 px-3 py-2">
          <p className="text-xs text-gray-500 mb-0.5">Best Time to Call</p>
          <p className="text-sm font-semibold text-white">{guidance.bestTimeToCall}</p>
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-400 mb-2">Talking Points</p>
      <ul className="space-y-1.5">
        {guidance.talkingPoints.map((point, i) => (
          <li key={point} className="flex gap-2 text-xs text-gray-300">
            <span className="text-[#C9A84C] font-bold flex-shrink-0">{i + 1}.</span>
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breakdown bars
// ---------------------------------------------------------------------------

function Breakdown({
  title,
  rows,
  emptyNote,
}: {
  title: string;
  rows: { label: string; total: number; won: number; lost: number; winRate: number | null; resolved: number }[];
  emptyNote: string;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      <h2 className="text-base font-semibold text-gray-200 mb-4">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">{emptyNote}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-baseline justify-between text-xs mb-1">
                <span className="text-gray-300">{r.label}</span>
                <span className="text-gray-500">
                  {r.total} decline{r.total === 1 ? '' : 's'}
                  {' · '}
                  {/* A bucket with nothing resolved has no win rate. Showing
                      0% there reports a failure that has not happened. */}
                  {r.resolved === 0 ? (
                    <span className="text-gray-600">no outcome yet</span>
                  ) : (
                    <span className="text-green-400 font-semibold">
                      {r.winRate}% won
                      <span className="text-gray-600"> of {r.resolved}</span>
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full bg-[#C9A84C]"
                  style={{ width: max === 0 ? '0%' : `${(r.total / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

export default function DeclinesPage() {
  const [rows, setRows] = useState<DeclineRow[]>([]);
  const [stats, setStats] = useState<DeclineStats | null>(null);
  const [analytics, setAnalytics] = useState<DeclineAnalytics | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [letterFor, setLetterFor] = useState<DeclineRow | null>(null);
  const [showLog, setShowLog] = useState(false);

  const [stageFilter, setStageFilter] = useState<RecoveryStage | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // One instant per render pass, rather than a hardcoded date. The cooldown
  // helper compared against new Date('2026-03-31'), so every countdown on the
  // page was measured from a day in the past.
  const now = useMemo(() => new Date(), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const auth = authHeaders();

    try {
      const [listed, statsRes, analyticsRes] = await Promise.all([
        fetchAllPages('/api/declines', (json) => {
          const body = json as { success?: boolean; data?: unknown };
          return body.success === true ? toDeclineRows(body.data) : [];
        }, { headers: auth }),
        fetch('/api/declines/stats', { headers: auth }),
        fetch('/api/declines/analytics', { headers: auth }),
      ]);

      setRows(listed.rows);
      setTruncated(listed.truncated);

      // Stats and analytics are shown only if they arrive. A failed panel
      // stays blank rather than falling back to a figure computed from the
      // rows that happened to load, which would not be the same number.
      if (statsRes.ok) {
        const body = (await statsRes.json()) as { success?: boolean; data?: unknown };
        setStats(body.success === true ? toDeclineStats(body.data) : null);
      } else {
        setStats(null);
      }

      if (analyticsRes.ok) {
        const body = (await analyticsRes.json()) as { success?: boolean; data?: unknown };
        setAnalytics(body.success === true ? toDeclineAnalytics(body.data) : null);
      } else {
        setAnalytics(null);
      }
    } catch {
      setLoadError('Could not reach the server. No declines are shown.');
      setRows([]);
      setStats(null);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Real clients for the log form, so a decline attaches to a business that
  // exists rather than to a name from a hardcoded list.
  useEffect(() => {
    fetchAllPages('/api/v1/clients', (json) => {
      const body = json as { success?: boolean; data?: unknown };
      if (body.success !== true || !Array.isArray(body.data)) return [];
      return body.data
        .map((row) => row as Record<string, unknown>)
        .filter((row) => typeof row['id'] === 'string')
        .map((row) => ({
          id: row['id'] as string,
          name:
            (typeof row['businessName'] === 'string' && row['businessName']) ||
            (typeof row['legalName'] === 'string' && row['legalName']) ||
            'Unnamed business',
        }));
    })
      .then(({ rows: loaded }) => setClients(loaded))
      .catch(() => undefined);
  }, []);

  // ── Writes ────────────────────────────────────────────────

  const advanceStage = useCallback(
    async (row: DeclineRow, stage: RecoveryStage) => {
      setBusyId(row.id);
      setActionError(null);
      try {
        // Resolving is a different endpoint: it stamps resolvedAt and, for a
        // win, approves the underlying application. Advancing does neither.
        const resolving = isTerminal(stage);
        const res = await fetch(
          `/api/declines/${row.id}/${resolving ? 'resolve' : 'stage'}`,
          {
            method: 'PATCH',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(resolving ? { outcome: stage } : { stage }),
          },
        );
        const body = (await res.json()) as { success?: boolean; error?: { message?: string } };
        if (!res.ok || body.success !== true) {
          // The old handler ran a setTimeout, moved the card and reported
          // success. Nothing was sent and nothing was saved.
          setActionError(body.error?.message ?? `The stage was not changed (HTTP ${res.status}).`);
          return;
        }
        showToast(`Moved to ${STAGE_LABELS[stage]}.`);
        await load();
      } catch {
        setActionError('Could not reach the server. The stage was not changed.');
      } finally {
        setBusyId(null);
      }
    },
    [load, showToast],
  );

  // ── Derived ───────────────────────────────────────────────

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const matchStage = stageFilter === 'all' || r.recoveryStage === stageFilter;
        const q = search.trim().toLowerCase();
        const matchSearch =
          q === '' ||
          (r.businessName ?? '').toLowerCase().includes(q) ||
          r.issuer.toLowerCase().includes(q) ||
          (r.cardProduct ?? '').toLowerCase().includes(q);
        return matchStage && matchSearch;
      }),
    [rows, stageFilter, search],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [stageFilter, search]);

  const eligible = useMemo(() => eligibleToReapply(rows, now), [rows, now]);

  const issuerRate = useCallback(
    (issuer: string) => {
      const found = analytics?.byIssuer.find((b) => b.label === issuer);
      return found === undefined ? null : { winRate: found.winRate, resolved: found.resolved };
    },
    [analytics],
  );

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">
      {toast !== null && (
        <div className="fixed top-6 right-6 z-50 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-200 shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Decline Recovery</h1>
          <p className="text-sm text-gray-500 mt-1">
            Declines under reconsideration, and what came of them.
          </p>
        </div>
        <button
          onClick={() => setShowLog(true)}
          className="rounded-lg bg-[#C9A84C] px-4 py-2 text-sm font-semibold text-gray-900"
        >
          Log a decline
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading declines…</p>}

      {loadError !== null && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {loadError}
        </p>
      )}

      {truncated && (
        <p className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-xs text-yellow-300">
          Not every decline could be loaded, so the figures below cover only those shown.
        </p>
      )}

      {!loading && loadError === null && (
        <>
          {/* ── Stats ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Declines" value={stats === null ? '—' : String(stats.totalDeclines)} />
            <Kpi
              label="Recon win rate"
              value={stats === null || stats.winRate === null ? '—' : `${stats.winRate}%`}
              note={
                stats === null
                  ? 'Not available'
                  : stats.winRate === null
                    ? 'Nothing resolved yet'
                    : `over ${stats.wonCount + stats.lostCount} resolved`
              }
            />
            <Kpi
              label="Avg days to resolve"
              value={
                stats === null || stats.avgRecoveryDays === null ? '—' : `${stats.avgRecoveryDays}d`
              }
              note={
                stats === null || stats.avgRecoveryDays === null
                  ? 'No resolved recoveries dated'
                  : `over ${stats.avgRecoveryBasedOn} resolved`
              }
            />
            <Kpi
              label="Eligible to reapply"
              value={String(eligible.length)}
              note="cooldown recorded and passed"
            />
          </div>

          {stats === null && (
            <p className="text-xs text-gray-500">
              Recovery statistics are unavailable, so those figures are blank rather than
              recomputed from the rows that loaded.
            </p>
          )}

          {/* ── Stage pipeline ── */}
          {stats !== null && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
              <h2 className="text-base font-semibold text-gray-200 mb-3">Recovery pipeline</h2>
              <div className="flex flex-wrap gap-2">
                {RECOVERY_STAGES.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => setStageFilter(stageFilter === stage ? 'all' : stage)}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      stageFilter === stage
                        ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]'
                        : 'border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    {STAGE_LABELS[stage]}
                    <span className="ml-2 font-bold text-gray-200">{stats.stageCounts[stage]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Filters ── */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              aria-label="Search declines"
              placeholder="Search client, issuer or card…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 w-72"
            />
            {stageFilter !== 'all' && (
              <button
                onClick={() => setStageFilter('all')}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300"
              >
                Clear stage filter: {STAGE_LABELS[stageFilter]}
              </button>
            )}
            <span className="text-xs text-gray-500">
              {filtered.length} of {rows.length} shown
            </span>
          </div>

          {actionError !== null && (
            <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              {actionError}
            </p>
          )}

          {/* ── Table ── */}
          <div className="rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Client</th>
                  <th className="px-4 py-3 text-left">Issuer / Card</th>
                  <th className="px-4 py-3 text-left">Declined</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                  <th className="px-4 py-3 text-right">Requested</th>
                  <th className="px-4 py-3 text-left">Recon</th>
                  <th className="px-4 py-3 text-left">Stage</th>
                  <th className="px-4 py-3 text-left">Reapply</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                      {rows.length === 0
                        ? 'No declines recorded.'
                        : 'No declines match these filters.'}
                    </td>
                  </tr>
                )}

                {visible.map((row) => {
                  const reason = REASON_LABELS[row.reasonCategory];
                  const recon = RECON_STATUS_LABELS[row.reconStatus];
                  const open = expandedId === row.id;

                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        onClick={() => setExpandedId(open ? null : row.id)}
                        className="cursor-pointer hover:bg-gray-900/40"
                      >
                        <td className="px-4 py-3">
                          {row.businessName ?? (
                            <span className="text-gray-500 italic">Unknown client</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {row.issuer}
                          <span className="block text-xs text-gray-600">
                            {row.cardProduct ?? 'Card not recorded'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400">{formatDate(row.declinedAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-2xs ${reason.cls}`}>
                            {reason.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">
                          {row.requestedLimit === null ? '—' : formatCurrency(row.requestedLimit)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-2xs ${recon.cls}`}>
                            {recon.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-2xs ${STAGE_COLORS[row.recoveryStage]}`}>
                            {STAGE_LABELS[row.recoveryStage]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <CooldownCell row={row} now={now} />
                        </td>
                      </tr>

                      {open && (
                        <tr>
                          <td colSpan={8} className="px-4 pb-4 bg-gray-900/20">
                            <div className="space-y-4 pt-2">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                <div>
                                  <p className="text-gray-500 mb-1">Reason given</p>
                                  <p className="text-gray-300">
                                    {row.reasonText ?? 'The issuer gave no reason.'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-gray-500 mb-1">Notes</p>
                                  <p className="text-gray-300">
                                    {row.reconsiderationNotes ?? 'None.'}
                                  </p>
                                </div>
                                {row.adverseActionRaw !== null && (
                                  <div className="md:col-span-2">
                                    <p className="text-gray-500 mb-1">Adverse action notice</p>
                                    <p className="text-gray-300">{row.adverseActionRaw}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-gray-500 mb-1">Application</p>
                                  <p className="text-gray-300">{row.applicationId ?? 'Not linked'}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500 mb-1">Resolved</p>
                                  <p className="text-gray-300">{formatDate(row.resolvedAt)}</p>
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => setLetterFor(row)}
                                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-900"
                                >
                                  {row.letterGenerated ? 'Regenerate letter' : 'Generate letter'}
                                </button>

                                {nextStages(row.recoveryStage).map((stage) => (
                                  <button
                                    key={stage}
                                    disabled={busyId === row.id}
                                    onClick={() => advanceStage(row, stage)}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                                      stage === 'won'
                                        ? 'bg-green-900 text-green-200'
                                        : stage === 'lost'
                                          ? 'bg-red-900 text-red-200'
                                          : 'bg-gray-800 text-gray-200'
                                    }`}
                                  >
                                    {busyId === row.id ? 'Saving…' : `Mark ${STAGE_LABELS[stage]}`}
                                  </button>
                                ))}

                                {isTerminal(row.recoveryStage) && (
                                  <span className="text-xs text-gray-500">
                                    Resolved {formatDate(row.resolvedAt)} — no further stage changes
                                    from here.
                                  </span>
                                )}
                              </div>

                              <IssuerGuidance issuer={row.issuer} measured={issuerRate(row.issuer)} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Page {page} of {pageCount}</span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  disabled={page === pageCount}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── Reapply ── */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
            <h2 className="text-base font-semibold text-gray-200 mb-1">Reapply calendar</h2>
            <p className="text-xs text-gray-500 mb-4">
              Declines whose recorded cooldown has passed. A decline with no cooldown date on file
              is not listed here — absent is not the same as eligible.
            </p>
            {eligible.length === 0 ? (
              <p className="text-xs text-gray-500">Nothing is eligible to reapply today.</p>
            ) : (
              <ul className="space-y-2">
                {eligible.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 px-3 py-2 text-xs"
                  >
                    <span className="text-gray-300">
                      {row.businessName ?? 'Unknown client'} · {row.issuer}
                      {row.cardProduct === null ? '' : ` · ${row.cardProduct}`}
                    </span>
                    <span className="text-green-400">
                      Cooldown ended {formatDate(row.reapplyCooldownDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Breakdowns ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Breakdown
              title="By decline reason"
              rows={analytics?.byReason ?? []}
              emptyNote={
                analytics === null
                  ? 'Analytics are unavailable.'
                  : 'No declines recorded yet.'
              }
            />
            <Breakdown
              title="By issuer"
              rows={analytics?.byIssuer ?? []}
              emptyNote={
                analytics === null
                  ? 'Analytics are unavailable.'
                  : 'No declines recorded yet.'
              }
            />
          </div>

          {/* Document parsing is not offered. This page carried an "Adverse
              Action Notice Parser" that accepted any file, waited two seconds
              and reported the same extraction every time — Chase, Experian,
              score 682 — then offered to open a decline record prefilled with
              it. The backend service behind that capability returns mock data
              by construction, so wiring it up would have moved the invention
              rather than removed it. */}
          <p className="text-xs text-gray-600">
            Adverse action notices are entered by hand. Automatic extraction from an uploaded
            notice is not available.
          </p>
        </>
      )}

      {letterFor !== null && (
        <LetterModal
          row={letterFor}
          onClose={() => setLetterFor(null)}
          onGenerated={() => {
            load();
          }}
        />
      )}

      {showLog && (
        <LogDeclineModal
          clients={clients}
          onClose={() => setShowLog(false)}
          onLogged={(msg) => {
            setShowLog(false);
            showToast(msg);
            load();
          }}
        />
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
