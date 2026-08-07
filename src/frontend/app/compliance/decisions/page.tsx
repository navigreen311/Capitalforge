'use client';

// ============================================================
// /compliance/decisions — Application decision register
//
// This page called nothing. Six decisions were literals, each with a named
// advisor, a paragraph of reasoning, the factors behind it — Credit Score:
// 780, PAYDEX: 82, Annual Revenue: $2.4M — and, on the declines, the adverse
// action notice:
//
//   adverseAction: { status: 'sent', sentDate: '2026-04-04', content: '…' }
//
// That is the ECOA §1002.9 record. A declined applicant must receive the
// notice within thirty days, and "sent on 4 April" is the evidence it
// happened. Nothing in this system records the notice or its delivery.
//
// There is a column called adverseActionNotice on CardApplication, which
// makes it look as though there is. The application pipeline writes assigned
// advisor ids into it — its own comment says "stored in adverseActionNotice
// field for now" — and the detail endpoint returns it as null. It is a
// metadata bucket wearing a compliance name.
//
// What this reads instead:
//   GET /api/applications                       — the decisions themselves
//   GET /api/fair-lending/adverse-action?year=  — the Section 1071 register
//
// Joined on applicationId, and the join is the point: a decline that is not
// on the register is worth surfacing, and neither source claims a notice
// went out.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { fetchAllPages } from '@/lib/fetch-all-pages';
import { loadJson } from '@/lib/load-json';
import {
  toDecisionRows,
  toRegisterIndex,
  summariseDecisions,
  declineGaps,
  needsAttention,
  type DecisionRow,
  type DecisionOutcome,
} from '@/lib/application-decision-view';

type FilterMode = 'all' | DecisionOutcome | 'attention';

const FILTERS: { key: FilterMode; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'approved', label: 'Approved' },
  { key: 'declined', label: 'Declined' },
  { key: 'attention', label: 'Needs attention' },
];

function formatDate(iso: string | null): string {
  if (iso === null) return 'not recorded';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? 'not recorded'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(n: number | null): string {
  if (n === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ComplianceDecisionsPage() {
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [registerUnavailable, setRegisterUnavailable] = useState(false);

  const [filter, setFilter] = useState<FilterMode>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const year = useMemo(() => new Date().getFullYear(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setRegisterUnavailable(false);

    try {
      // The two are fetched together but fail separately. Applications decide
      // whether this page has anything to show; the adverse-action register is
      // a comparison against them. A null register means the comparison could
      // not be made — distinct from a register with nothing in it, which is a
      // finding. Resolving it to null rather than throwing keeps a register
      // outage from blanking decisions that loaded.
      const [applications, register] = await Promise.all([
        fetchAllPages(
          '/api/applications',
          (json) => {
            const body = json as { success?: boolean; data?: unknown };
            return body.success === true && Array.isArray(body.data) ? body.data : [];
          },
        ),
        loadJson<unknown>(`/api/fair-lending/adverse-action?year=${year}`)
          .then(toRegisterIndex)
          .catch(() => null),
      ]);

      // Without it every decline would look absent from the register, which is
      // a finding this page raises. Better to say the comparison could not be
      // made.
      if (register === null) setRegisterUnavailable(true);

      setRows(toDecisionRows(applications.rows, register ?? new Map()));
      setTruncated(applications.truncated);
    } catch {
      setLoadError('Could not reach the server. No decisions are shown.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summariseDecisions(rows), [rows]);
  const attention = useMemo(() => needsAttention(rows), [rows]);

  const visible = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'attention') return attention;
    return rows.filter((r) => r.outcome === filter);
  }, [rows, filter, attention]);

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Application Decisions</h1>
        <p className="text-sm text-gray-400 mt-1">
          Every application that has been approved or declined, and what is recorded against it.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading decisions…</p>}

      {loadError !== null && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {loadError}
        </p>
      )}

      {!loading && loadError === null && (
        <>
          {truncated && (
            <p className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-xs text-yellow-300">
              Not every application could be loaded, so this register is incomplete.
            </p>
          )}
          {registerUnavailable && (
            <p className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-xs text-yellow-300">
              The Section 1071 register could not be read, so no decline is shown as on or off it.
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Decisions" value={String(summary.total)} />
            <Kpi
              label="Approved"
              value={String(summary.approved)}
              note={
                summary.approvalRate === null
                  ? 'nothing decided'
                  : `${summary.approvalRate}% of decided`
              }
            />
            <Kpi label="Declined" value={String(summary.declined)} />
            <Kpi
              label="Needs attention"
              value={String(attention.length)}
              note={
                registerUnavailable
                  ? 'register unavailable'
                  : 'a decline missing a reason or a register entry'
              }
            />
          </div>

          {/* The claim this page used to make on every decline. */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-2">Adverse action notices</h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              Not shown, and not tracked. Each decline here used to carry the notice text with a
              status of &ldquo;sent&rdquo; and a delivery date. Nothing in this system records the
              notice a declined applicant is issued, or whether it went — the column named
              adverseActionNotice holds application metadata, not a notice.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed mt-2">
              ECOA §1002.9 gives thirty days from the decision. What is shown below is the decision
              date and the reason on file, which is what the record can support. Delivery belongs
              wherever your notices are actually issued.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  filter === f.key
                    ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]'
                    : 'border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                {f.label}
                {f.key === 'attention' && attention.length > 0 && (
                  <span className="ml-1.5 text-yellow-400">{attention.length}</span>
                )}
              </button>
            ))}
            <span className="text-xs text-gray-500">
              {visible.length} of {rows.length}
            </span>
          </div>

          <div className="rounded-xl border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Client</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Decision</th>
                  <th className="px-4 py-3 text-left">Decided</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">On 1071 register</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                      {rows.length === 0
                        ? 'No application has been decided.'
                        : 'No decisions match this filter.'}
                    </td>
                  </tr>
                )}
                {visible.map((row) => {
                  const open = expandedId === row.applicationId;
                  const gaps = declineGaps(row);

                  return (
                    <React.Fragment key={row.applicationId}>
                      <tr
                        onClick={() => setExpandedId(open ? null : row.applicationId)}
                        className="cursor-pointer hover:bg-gray-900/40"
                      >
                        <td className="px-4 py-3">
                          <p className="text-gray-200">{row.businessName}</p>
                          <p className="text-2xs text-gray-600">{row.applicationId}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {row.issuer}
                          <span className="block text-2xs text-gray-600">{row.cardProduct}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-2xs ${
                              row.outcome === 'approved'
                                ? 'bg-green-900 text-green-300 border-green-700'
                                : 'bg-red-900 text-red-300 border-red-700'
                            }`}
                          >
                            {row.outcome === 'approved' ? 'Approved' : 'Declined'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {formatDate(row.decidedAt)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">
                          {formatCurrency(row.amount)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {row.outcome === 'approved' ? (
                            <span className="text-gray-600">n/a</span>
                          ) : registerUnavailable ? (
                            <span className="text-gray-600">unknown</span>
                          ) : row.onRegister ? (
                            <span className="text-green-400">Yes</span>
                          ) : (
                            // A decline the 1071 register has no record of is
                            // a finding, not a blank.
                            <span className="text-yellow-400 font-semibold">Not recorded</span>
                          )}
                        </td>
                      </tr>

                      {open && (
                        <tr>
                          <td colSpan={6} className="px-4 pb-4 bg-gray-900/20">
                            <div className="space-y-4 pt-2 text-xs">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-gray-500 mb-1">Reason on the application</p>
                                  <p className="text-gray-300">
                                    {row.declineReason ??
                                      (row.outcome === 'approved'
                                        ? 'Not applicable to an approval.'
                                        : 'No reason recorded.')}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-gray-500 mb-1">Reasons on the 1071 register</p>
                                  {row.registerReasons.length === 0 ? (
                                    <p className="text-gray-500">
                                      {row.outcome === 'approved'
                                        ? 'Not applicable to an approval.'
                                        : 'This decline is not on the register.'}
                                    </p>
                                  ) : (
                                    <ul className="list-disc list-inside space-y-0.5 text-gray-300">
                                      {row.registerReasons.map((r) => (
                                        <li key={r}>{r}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                                <div>
                                  <p className="text-gray-500 mb-1">Client advisor</p>
                                  <p className="text-gray-300">
                                    {row.advisorName ?? 'No advisor assigned'}
                                  </p>
                                  {/* The page named an advisor as the decider
                                      on each row. This is who owns the client. */}
                                  <p className="text-gray-600 mt-1">
                                    Who made the decision is not recorded; this is the advisor the
                                    client is assigned to.
                                  </p>
                                </div>
                                <div>
                                  <p className="text-gray-500 mb-1">Adverse action notice</p>
                                  <p className="text-gray-500">
                                    Not tracked. See the note above the table.
                                  </p>
                                </div>
                              </div>

                              {gaps !== null && (gaps.missingReason || gaps.missingFromRegister) && (
                                <div className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-3 py-2 text-yellow-300">
                                  {gaps.missingReason && <p>No decline reason is recorded.</p>}
                                  {gaps.missingFromRegister && (
                                    <p>
                                      This decline does not appear on the Section 1071 register for{' '}
                                      {year}.{' '}
                                      <Link href="/fair-lending" className="underline">
                                        Fair lending
                                      </Link>
                                    </p>
                                  )}
                                </div>
                              )}
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

          <p className="text-xs text-gray-600">
            No decision factors are listed. Each row used to carry a credit score, a PAYDEX figure
            and a revenue number as the basis for the decision; those live on a client&rsquo;s
            credit profile, and none of them is recorded against a decision.
          </p>
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
