// ============================================================
// Offboarding — shared view
//
// Rendered by both /offboarding and /platform/offboarding. The sidebar links
// to the second; the first is reachable by URL. They were two separate pages
// over the same subject, each with its own fixtures — one with four
// workflows and ticked-off deletion steps, the other with five requests and
// a fabricated deletion audit trail, timestamps to the second and record
// counts. One implementation now, so they cannot drift apart again or
// disagree about whether somebody's data was erased.
//
// Reads:
//   GET /api/offboarding                          — the workflows
//   GET /api/offboarding/retention?jurisdiction    — what a deletion keeps
//   GET /api/platform/offboarding/:id/audit-log    — the real audit trail
//
// The first two did not exist before this repair. The third did, and
// invented its entries from an in-memory stage counter; it now reads the
// audit_logs the offboarding service writes.
//
// No deletion is triggered from here. See the note at the foot of the view.
// ============================================================

'use client';


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
  type AuditEntry,
  toAuditEntries,
} from '@/lib/offboarding-view';
import { loadJson, toLoadError } from '@/lib/load-json';

type Jurisdiction = 'ccpa' | 'gdpr' | 'both' | 'internal';

const JURISDICTIONS: Jurisdiction[] = ['both', 'ccpa', 'gdpr', 'internal'];

const DELETION_STYLE: Record<DeletionStatus, { label: string; cls: string }> = {
  completed: { label: 'Deleted', cls: 'bg-green-900 text-green-300 border-green-700' },
  in_progress: { label: 'Deleting', cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  pending: { label: 'Not deleted', cls: 'bg-gray-800 text-gray-400 border-gray-700' },
  // Never styled as done. An unreadable status is not an erasure.
  unknown: { label: 'Status unreadable', cls: 'bg-orange-900 text-orange-300 border-orange-700' },
};

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function OffboardingView() {
  const [rows, setRows] = useState<OffboardingRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [retention, setRetention] = useState<RetentionException[]>([]);
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('both');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [audit, setAudit] = useState<Record<string, AuditEntry[] | null>>({});
  const [auditLoading, setAuditLoading] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const [workflowsRes, clients] = await Promise.all([
        loadJson<unknown>('/api/offboarding')
          .then((value) => ({ loaded: true as const, value }))
          .catch(() => ({ loaded: false as const, value: null })),
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
        ).catch(() => ({ rows: [] as { id: string; name: string }[], total: null, truncated: false })),
      ]);

      // The workflows decide whether this view has anything to show; the
      // client names are a display lookup that already falls back to an empty
      // list, so a failed name fetch leaves ids showing rather than blanking
      // workflows that loaded.
      if (!workflowsRes.loaded) {
        setLoadError('Offboarding workflows could not be loaded, so none are shown.');
        setRows([]);
        return;
      }

      setRows(toOffboardingRows(workflowsRes.value));
      setNames(new Map(clients.rows.map((c) => [c.id, c.name])));
    } catch (e) {
      setLoadError(`Offboarding workflows could not be loaded. ${toLoadError(e).message}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRetention = useCallback(async (j: Jurisdiction) => {
    setRetentionError(null);
    try {
      const data = await loadJson<unknown>(`/api/offboarding/retention?jurisdiction=${j}`);
      setRetention(toRetentionExceptions(data));
    } catch (e) {
      // The list is emptied and the failure named. A retention exception that
      // could not be read must not look like one that does not exist.
      setRetention([]);
      setRetentionError(`Retention exceptions could not be read. ${toLoadError(e).message}`);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadRetention(jurisdiction);
  }, [loadRetention, jurisdiction]);

  const loadAudit = useCallback(
    async (workflowId: string) => {
      if (audit[workflowId] !== undefined) return;
      setAuditLoading(workflowId);
      try {
        const data = await loadJson<unknown>(
          `/api/platform/offboarding/${encodeURIComponent(workflowId)}/audit-log`,
        );
        setAudit((prev) => ({ ...prev, [workflowId]: toAuditEntries(data) }));
      } catch {
        setAudit((prev) => ({ ...prev, [workflowId]: null }));
      } finally {
        setAuditLoading(null);
      }
    },
    [audit],
  );

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
                        onClick={() => {
                          const next = open ? null : row.id;
                          setExpanded(next);
                          if (next !== null) loadAudit(row.id);
                        }}
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

                            <div className="mt-4">
                              <p className="text-2xs uppercase tracking-wide text-gray-600 mb-2">
                                Audit trail
                              </p>
                              {auditLoading === row.id ? (
                                <p className="text-xs text-gray-500">Loading…</p>
                              ) : audit[row.id] == null ? (
                                <p className="text-xs text-gray-500">
                                  {audit[row.id] === null
                                    ? 'The audit trail could not be read.'
                                    : 'Not loaded.'}
                                </p>
                              ) : audit[row.id]!.length === 0 ? (
                                <p className="text-xs text-gray-500">
                                  Nothing has been recorded against this workflow yet.
                                </p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {audit[row.id]!.map((entry) => (
                                    <li
                                      key={entry.id}
                                      className="flex flex-wrap items-baseline gap-2 text-xs"
                                    >
                                      <span className="text-gray-500 font-mono">
                                        {formatDate(entry.timestamp)}
                                      </span>
                                      <span className="text-gray-300">{humanise(entry.action)}</span>
                                      {entry.performedBy !== null && (
                                        <span className="text-2xs text-gray-600">
                                          by {entry.performedBy}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {/* Every entry here was previously generated at
                                  request time from an in-memory counter, with
                                  timestamps an hour apart and attributed to
                                  "system". */}
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
            <h2 className="text-sm font-semibold text-gray-300">What &ldquo;Packaged&rdquo; means</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              That an export has been run for this workflow, not that a file is waiting somewhere.
              The export is assembled on request and returned in the response; nothing is stored
              afterwards, so another copy means running it again. It leaves out credentials, the
              demographic data firewalled under Section 1071, and the contents of documents as
              opposed to their details — the export itself lists what it omits and why.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              It does include the social security number held for KYC, because it is the
              owner&rsquo;s own data and a subject-access request covers it. So an export is a
              plaintext SSN in transit and then in whatever file it is saved to. The document
              names its identifying fields, and the audit trail records that an export carrying
              them was taken and by whom.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Until recently it packaged nothing at all: it counted three tables, produced a
              storage path for a file that was never written, and marked this column done.
            </p>

            <h2 className="text-sm font-semibold text-gray-300 pt-2">Running a deletion</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Not offered from this page. The deletion is real and cannot be undone: it nulls the
              social security number, date of birth and address on every business owner, rewrites
              every user&rsquo;s email and password hash, and on a tenant offboarding deactivates
              the tenant. It is guarded by a confirmation token derived on the server, which is
              the point — a dashboard should not be able to produce it.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              That guard is only as good as its secret, and until recently there was none: the
              token and the deletion proof signature both fell back to a constant in the source
              when their environment variables were unset. Both are now required —
              DELETION_CONFIRM_SECRET and DELETION_PROOF_SECRET — and with either missing the
              endpoint refuses rather than falling back. Whether this deployment has set them is
              not something this page can see, so it does not claim either way.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              There is also no deletion certificate to download. This page used to produce one: a
              text file headed DATA DELETION CERTIFICATE, with per-class record counts and
              retention reasons, assembled entirely from the fixtures above. It was a document you
              could hand to a client or an examiner attesting to an erasure that had not happened.
              A certificate has to be generated from the deletion the service actually ran, and the
              record it writes — a proof hash and a record count — is not yet exposed for that.
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
