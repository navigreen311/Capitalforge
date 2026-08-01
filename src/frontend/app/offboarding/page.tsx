'use client';

// ============================================================
// /offboarding — Offboarding
//
// This page called nothing. Four workflows were literals, each with its data
// steps ticked off:
//
//   Summit Capital Group   complete   PII anonymization ✓  Credit file purge ✓
//   Apex Ventures LLC      55%        PII anonymization running
//
// Those ticks are the answer to "did you erase my data". Beside them sat a
// retention schedule of seven data classes with legal bases and delete-after
// dates, and a set of exit interviews with named assignees.
//
// The deletion behind this is real and irreversible: it nulls SSNs, dates of
// birth and addresses on every business owner, rewrites every user's email
// and password hash, deactivates the tenant on a tenant offboarding, and
// writes a signed proof hash. Nothing about it is a stub.
//
// Wired to:
//   GET /api/offboarding                        — the workflows
//   GET /api/offboarding/retention?jurisdiction — what a deletion keeps
//
// Neither existed before; only a lookup by id did, so a page listing what is
// in progress had nothing to read.
//
// No deletion is triggered from here, and that is deliberate — see the note
// at the foot of the page.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchAllPages } from '@/lib/fetch-all-pages';
import {
  toOffboardingRows,
  toRetentionExceptions,
  deletionIsProven,
  summarise,
  daysOpen,
  humanise,
  type OffboardingRow,
  type RetentionException,
  type DeletionStatus,
} from '@/lib/offboarding-view';

type Jurisdiction = 'ccpa' | 'gdpr' | 'both' | 'internal';

const JURISDICTIONS: Jurisdiction[] = ['both', 'ccpa', 'gdpr', 'internal'];

const DELETION_STYLE: Record<DeletionStatus, { label: string; cls: string }> = {
  completed: { label: 'Deleted', cls: 'bg-green-900 text-green-300 border-green-700' },
  in_progress: { label: 'Deleting', cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  pending: { label: 'Not deleted', cls: 'bg-gray-800 text-gray-400 border-gray-700' },
  // Never styled as done. An unreadable status is not an erasure.
  unknown: { label: 'Status unreadable', cls: 'bg-orange-900 text-orange-300 border-orange-700' },
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

export default function OffboardingPage() {
  const [rows, setRows] = useState<OffboardingRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [retention, setRetention] = useState<RetentionException[]>([]);
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('both');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const headers = authHeaders();

    try {
      const [workflowsRes, clients] = await Promise.all([
        fetch('/api/offboarding', { headers }),
        // Workflows carry a businessId and no name.
        fetchAllPages(
          '/api/v1/clients',
          (json) => {
            const body = json as { success?: boolean; data?: unknown };
            if (body.success !== true || !Array.isArray(body.data)) return [];
            return body.data
              .map((row) => row as Record<string, unknown>)
              .filter((row) => typeof row['id'] === 'string')
              .map((row) => ({
                id: row['id'] as string,
                name:
                  (typeof row['businessName'] === 'string' && row['businessName']) ||
                  'Unnamed business',
              }));
          },
          { headers },
        ).catch(() => ({ rows: [] as { id: string; name: string }[], total: null, truncated: false })),
      ]);

      if (!workflowsRes.ok) {
        setLoadError(`Offboarding workflows could not be loaded (HTTP ${workflowsRes.status}).`);
        setRows([]);
        return;
      }

      const body = (await workflowsRes.json()) as { success?: boolean; data?: unknown };
      setRows(body.success === true ? toOffboardingRows(body.data) : []);
      setNames(new Map(clients.rows.map((c) => [c.id, c.name])));
    } catch {
      setLoadError('Could not reach the server. No offboarding workflows are shown.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRetention = useCallback(async (j: Jurisdiction) => {
    setRetentionError(null);
    try {
      const res = await fetch(`/api/offboarding/retention?jurisdiction=${j}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        setRetention([]);
        setRetentionError(`Retention exceptions could not be read (HTTP ${res.status}).`);
        return;
      }
      const body = (await res.json()) as { success?: boolean; data?: unknown };
      setRetention(body.success === true ? toRetentionExceptions(body.data) : []);
    } catch {
      setRetention([]);
      setRetentionError('Could not reach the server.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadRetention(jurisdiction);
  }, [loadRetention, jurisdiction]);

  const summary = useMemo(() => summarise(rows), [rows]);

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Offboarding</h1>
        <p className="text-sm text-gray-400 mt-1">
          Clients and tenants on their way out, and what has been done with their data.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading offboarding workflows…</p>}

      {loadError !== null && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {loadError}
        </p>
      )}

      {!loading && loadError === null && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Workflows" value={String(summary.total)} />
            <Kpi label="Still open" value={String(summary.open)} />
            <Kpi
              label="Awaiting deletion"
              value={String(summary.awaitingDeletion)}
              note="data still held"
            />
            <Kpi
              label="Deleted, with proof"
              value={String(summary.deleted)}
              note={
                summary.completedWithoutProof > 0
                  ? `${summary.completedWithoutProof} completed with no proof`
                  : 'every completion is signed'
              }
            />
          </div>

          {summary.completedWithoutProof > 0 && (
            <p className="rounded-lg border border-orange-800 bg-orange-900/20 px-4 py-3 text-xs text-orange-300">
              {summary.completedWithoutProof} workflow
              {summary.completedWithoutProof === 1 ? ' is' : 's are'} marked as deleted with no
              proof hash recorded. The record says the data is gone and nothing signs for it.
            </p>
          )}

          <div className="rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Entity</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Export</th>
                  <th className="px-4 py-3 text-left">Data deletion</th>
                  <th className="px-4 py-3 text-left">Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                      No offboarding is in progress.
                    </td>
                  </tr>
                )}
                {rows.map((row) => {
                  const open = expanded === row.id;
                  const deletion = DELETION_STYLE[row.deletionStatus];
                  const days = daysOpen(row, now);

                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        onClick={() => setExpanded(open ? null : row.id)}
                        className="cursor-pointer hover:bg-gray-900/40"
                      >
                        <td className="px-4 py-3">
                          <p className="text-gray-200">
                            {row.businessId === null
                              ? 'Whole tenant'
                              : (names.get(row.businessId) ?? row.businessId)}
                          </p>
                          <p className="text-2xs text-gray-600">{row.id}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {humanise(String(row.offboardingType))}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {humanise(row.status)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {row.dataExportCompleted ? (
                            <span className="text-green-400">Packaged</span>
                          ) : (
                            <span className="text-gray-500">Not yet</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-2xs ${deletion.cls}`}>
                            {deletion.label}
                          </span>
                          {/* A completion with no signature is not a proof. */}
                          {row.deletionStatus === 'completed' && !deletionIsProven(row) && (
                            <span className="block text-2xs text-orange-400 mt-0.5">
                              no proof recorded
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {formatDate(row.initiatedAt)}
                          {days !== null && (
                            <span className="block text-2xs text-gray-600">
                              {row.completedAt === null ? `${days} days open` : `closed in ${days} days`}
                            </span>
                          )}
                        </td>
                      </tr>

                      {open && (
                        <tr>
                          <td colSpan={6} className="px-4 pb-4 bg-gray-900/20">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs">
                              <div>
                                <p className="text-gray-500 mb-1">Reason for leaving</p>
                                <p className="text-gray-300">
                                  {row.exitReason ?? 'None recorded.'}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-1">Exit interview</p>
                                <p className="text-gray-300">
                                  {row.exitInterviewNotes ?? 'Not recorded.'}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-1">Deletion proof</p>
                                <p className="text-gray-300 font-mono break-all">
                                  {row.deletionProofHash ?? (
                                    <span className="font-sans text-gray-600">
                                      No deletion has run.
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-1">Refund</p>
                                <p className="text-gray-300">
                                  {row.refundAmount === null
                                    ? 'None calculated.'
                                    : new Intl.NumberFormat('en-US', {
                                        style: 'currency',
                                        currency: 'USD',
                                      }).format(row.refundAmount)}
                                </p>
                              </div>
                            </div>

                            {/* The five ticks this row used to carry. */}
                            <p className="mt-4 text-2xs text-gray-600 leading-relaxed">
                              There are no per-step states. The record holds one deletion status
                              for the workflow; the previous version showed consent revocation, PII
                              anonymization, credit file purge and audit log archival ticking off
                              separately, and none of those is tracked.
                            </p>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Retention ── */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-200">What a deletion keeps</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Tables held back from an erasure, and the statute requiring it.
                </p>
              </div>
              <div>
                <label htmlFor="jurisdiction" className="block text-xs text-gray-400 mb-1">
                  Jurisdiction
                </label>
                <select
                  id="jurisdiction"
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value as Jurisdiction)}
                  className="rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm px-3 py-2"
                >
                  {JURISDICTIONS.map((j) => (
                    <option key={j} value={j}>
                      {j === 'both' ? 'CCPA and GDPR' : j.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {retentionError !== null && (
              <p className="rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300 mb-3">
                {retentionError}
              </p>
            )}

            {retention.length === 0 ? (
              <p className="text-xs text-gray-500">
                Nothing is held back for this jurisdiction.
              </p>
            ) : (
              <ul className="space-y-2">
                {retention.map((e) => (
                  <li
                    key={`${e.table}-${e.legalBasis}`}
                    className="rounded-lg border border-gray-800 bg-[#071019] px-3 py-2"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-gray-200">{e.table}</span>
                      <span className="text-2xs text-gray-500">
                        until {formatDate(e.retainUntil)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{e.reason}</p>
                    <p className="text-2xs text-gray-600 mt-0.5">{e.legalBasis}</p>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 text-xs text-gray-600 leading-relaxed">
              This is what an erasure holds back, not a general retention schedule. The page
              previously showed one — seven data classes with retention periods and delete-after
              dates — and nothing anywhere records it.
            </p>
          </div>

          {/* ── Why deletion is not a button here ── */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-gray-300">Running a deletion</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Not offered from this page. The deletion is real and cannot be undone: it nulls the
              social security number, date of birth and address on every business owner, rewrites
              every user&rsquo;s email and password hash, and on a tenant offboarding deactivates
              the tenant. It is guarded by a confirmation token derived on the server, which is
              the point — a dashboard should not be able to produce it.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Worth knowing before you rely on that guard: the token and the deletion proof
              signature both fall back to a hardcoded default when their environment variables are
              unset, so on a deployment that has not set them, neither is a secret.
            </p>
          </div>
        </>
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
