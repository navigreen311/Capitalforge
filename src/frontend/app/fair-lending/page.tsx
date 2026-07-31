'use client';

// ============================================================
// /fair-lending — Section 1071 monitoring
//
// This page used to be entirely literal. Ten demographic buckets gave
// approval rates by race, gender and ownership — White (Non-Hispanic) 71%
// against Black or African American 56% — beside a hardcoded deal volume of
// 87, a per-field completeness table, a list of applications with missing
// data, and a readiness checklist that marked the Regulation B firewall and
// the adverse action notice templates as complete. It called nothing. The API
// for the same year reported totalApplications: 0, recordsWithDemographics: 0.
//
// A fixed disparity is wrong twice: it shows one that is not happening, and it
// hides one that is, because the numbers do not move.
//
// What is here now comes from:
//   GET /api/fair-lending/dashboard?year=
//   GET /api/fair-lending/coverage?year=
//   GET /api/fair-lending/adverse-action?year=
//
// Outcomes broken down by demographic are absent, and stay absent. The API
// does not expose them: getAdverseActionReport excludes demographic data by
// design and per-record access runs through a separate audit-logged endpoint.
// That is the Regulation B firewall, not a gap to fill in from the client.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  toFairLendingDashboard,
  toCoverageCheck,
  toAdverseActionRows,
  coverageBanner,
  collectionStatus,
  humanise,
  type FairLendingDashboard,
  type CoverageCheck,
  type AdverseActionRow,
} from '@/lib/fair-lending-view';

type TabKey = 'overview' | 'adverse' | 'collection' | 'obligations';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'adverse', label: 'Adverse Action Register' },
  { key: 'collection', label: 'Demographic Collection' },
  { key: 'obligations', label: 'Section 1071 Obligations' },
];

/**
 * The obligations Section 1071 places on a covered lender.
 *
 * Presented as a reference list with no status against any item. It used to
 * carry one — "Firewall: loan officers cannot access demographic data:
 * complete", "Adverse action notice templates approved by compliance:
 * complete" — which is an attestation that a control is in place. Nothing in
 * the system records evidence for any of these, so no status is shown; a
 * green tick here is the sort of thing that ends up in an examination
 * response.
 */
const OBLIGATIONS: { label: string; detail: string }[] = [
  {
    label: 'Firewall demographic data from underwriting',
    detail:
      'Regulation B §1002.107(b). Records are written with isFirewalled set, and per-record ' +
      'demographic access is audit-logged, but whether staff and systems honour the firewall ' +
      'in practice is not something this system observes.',
  },
  {
    label: 'Collect applicant demographic data at origination',
    detail:
      'Mandatory to request, voluntary to answer. The Demographic Collection tab shows how ' +
      'many recorded decisions carry a response.',
  },
  {
    label: 'Issue adverse action notices within 30 days',
    detail:
      'ECOA §1002.9. Notice delivery is not recorded anywhere in this system, so it cannot be ' +
      'reported on here. The register lists the decisions that require one.',
  },
  {
    label: 'File the annual LAR with the CFPB',
    detail: 'Required once the covered application threshold is met for the reporting year.',
  },
  {
    label: 'Train staff on 1071 collection and firewall requirements',
    detail: 'Not tracked in this system.',
  },
  {
    label: 'Update vendor agreements for demographic data handling',
    detail: 'Not tracked in this system.',
  },
];

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
  return token === null ? {} : { Authorization: `Bearer ${token}` };
}

function pct(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default function FairLendingPage() {
  const thisYear = useMemo(() => new Date().getFullYear(), []);
  const [year, setYear] = useState<number>(thisYear);
  const [tab, setTab] = useState<TabKey>('overview');

  const [dashboard, setDashboard] = useState<FairLendingDashboard | null>(null);
  const [coverage, setCoverage] = useState<CoverageCheck | null>(null);
  const [adverse, setAdverse] = useState<AdverseActionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partial, setPartial] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setPartial([]);
    const headers = authHeaders();
    const failed: string[] = [];

    try {
      const [dashRes, covRes, advRes] = await Promise.all([
        fetch(`/api/fair-lending/dashboard?year=${year}`, { headers }),
        fetch(`/api/fair-lending/coverage?year=${year}`, { headers }),
        fetch(`/api/fair-lending/adverse-action?year=${year}`, { headers }),
      ]);

      if (dashRes.ok) {
        const body = (await dashRes.json()) as { success?: boolean; data?: unknown };
        setDashboard(body.success === true ? toFairLendingDashboard(body.data) : null);
      } else {
        setDashboard(null);
        failed.push('the reporting summary');
      }

      if (covRes.ok) {
        const body = (await covRes.json()) as { success?: boolean; data?: unknown };
        setCoverage(body.success === true ? toCoverageCheck(body.data) : null);
      } else {
        setCoverage(null);
        failed.push('the coverage check');
      }

      if (advRes.ok) {
        const body = (await advRes.json()) as { success?: boolean; data?: unknown };
        setAdverse(body.success === true ? toAdverseActionRows(body.data) : []);
      } else {
        setAdverse([]);
        failed.push('the adverse action register');
      }

      // Each panel reports its own failure. A partial load must not leave one
      // section showing another year's numbers under this year's heading.
      setPartial(failed);
    } catch {
      setLoadError('Could not reach the server. No fair lending figures are shown.');
      setDashboard(null);
      setCoverage(null);
      setAdverse([]);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const banner = coverageBanner(coverage, dashboard?.coverageStatus ?? 'below_threshold');
  const collection = collectionStatus(dashboard);

  const bannerTone =
    banner.tone === 'triggered'
      ? 'border-red-700 bg-red-900/20 text-red-200'
      : banner.tone === 'warning'
        ? 'border-yellow-700 bg-yellow-900/20 text-yellow-200'
        : 'border-gray-700 bg-gray-900/40 text-gray-300';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Fair Lending — Section 1071</h1>
          <p className="text-sm text-gray-500 mt-1">
            Covered applications, credit decisions and adverse action, for the reporting year.
          </p>
        </div>
        <div>
          <label htmlFor="reporting-year" className="block text-xs text-gray-500 mb-1">
            Reporting year
          </label>
          <select
            id="reporting-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
          >
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading fair lending figures…</p>}

      {loadError !== null && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {loadError}
        </p>
      )}

      {!loading && loadError === null && (
        <>
          {partial.length > 0 && (
            <p className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-xs text-yellow-300">
              Could not load {partial.join(' and ')}. Those sections are blank rather than
              estimated.
            </p>
          )}

          {/* ── Coverage ── */}
          <div className={`rounded-xl border px-5 py-4 ${bannerTone}`}>
            <p className="text-sm font-semibold">{banner.headline}</p>
            <p className="text-xs mt-1 opacity-90">{banner.detail}</p>
            {coverage !== null && (
              <div className="mt-3 h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full ${
                    banner.tone === 'triggered'
                      ? 'bg-red-500'
                      : banner.tone === 'warning'
                        ? 'bg-yellow-500'
                        : 'bg-gray-500'
                  }`}
                  style={{ width: `${Math.min(100, coverage.percentToThreshold)}%` }}
                />
              </div>
            )}
          </div>

          {/* ── Tabs ── */}
          <div className="flex flex-wrap gap-2 border-b border-gray-800">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm border-b-2 -mb-px ${
                  tab === t.key
                    ? 'border-[#C9A84C] text-[#C9A84C]'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className="space-y-5">
              {dashboard === null ? (
                <p className="text-sm text-gray-500">
                  The reporting summary is unavailable, so no figures are shown for {year}.
                </p>
              ) : dashboard.totalApplications === 0 ? (
                <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-5 py-8 text-center">
                  <p className="text-sm text-gray-300">
                    No covered applications recorded for {year}.
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Rates are not shown, rather than shown as 0% — nothing was decided, which is
                    not the same as nothing being approved.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Kpi
                      label="Covered applications"
                      value={String(dashboard.totalApplications)}
                      note={`reporting year ${dashboard.reportingYear}`}
                    />
                    <Kpi
                      label="Approved"
                      value={pct(dashboard.approvalRate)}
                      note="of covered applications"
                    />
                    <Kpi
                      label="Denied"
                      value={pct(dashboard.denialRate)}
                      note="of covered applications"
                    />
                    <Kpi
                      label="Withdrawn"
                      value={pct(dashboard.withdrawalRate)}
                      note="by the applicant"
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <CountPanel
                      title="Action taken"
                      rows={dashboard.actionsByType.map((a) => ({
                        label: humanise(String(a.action)),
                        count: a.count,
                      }))}
                      total={dashboard.totalApplications}
                    />
                    <CountPanel
                      title="Credit purpose"
                      rows={dashboard.applicationsByPurpose}
                      total={dashboard.totalApplications}
                    />
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
                    <h2 className="text-base font-semibold text-gray-200 mb-1">
                      Most cited adverse action reasons
                    </h2>
                    <p className="text-xs text-gray-500 mb-4">
                      As recorded on the denial, tallied across {year}.
                    </p>
                    {dashboard.topAdverseReasons.length === 0 ? (
                      <p className="text-xs text-gray-500">No denials recorded for {year}.</p>
                    ) : (
                      <ul className="space-y-2">
                        {dashboard.topAdverseReasons.map((r) => (
                          <li
                            key={r.reason}
                            className="flex items-center justify-between text-xs border-b border-gray-800 pb-2 last:border-0"
                          >
                            <span className="text-gray-300">{r.reason}</span>
                            <span className="text-gray-500">
                              {r.count} application{r.count === 1 ? '' : 's'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}

              {/* The chart that used to be the centrepiece of this page. */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
                <h2 className="text-base font-semibold text-gray-200 mb-2">
                  Outcomes by demographic
                </h2>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Not shown. This page previously charted approval rates by race, gender and
                  ownership from figures written into the page — they did not come from your
                  records, and did not change when your records did.
                </p>
                <p className="text-xs text-gray-500 leading-relaxed mt-2">
                  The API does not break outcomes down by demographic. Responses are stored
                  firewalled from underwriting under Regulation B §1002.107(b), the adverse action
                  register excludes them by design, and reading them per record goes through a
                  separate audit-logged endpoint. Disparity analysis belongs with your compliance
                  function, on data pulled through that path.
                </p>
              </div>
            </div>
          )}

          {/* ── Adverse action register ── */}
          {tab === 'adverse' && (
            <div className="rounded-xl border border-gray-800 overflow-x-auto">
              <div className="px-5 py-4 border-b border-gray-800">
                <h2 className="text-base font-semibold text-gray-200">Adverse Action Register</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Every decision recorded as denied in {year}. Whether a notice was delivered is
                  not recorded by this system, so it is not reported here — the earlier version of
                  this page showed a delivery column and counted undelivered notices from it.
                </p>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Application</th>
                    <th className="px-4 py-3 text-left">Action date</th>
                    <th className="px-4 py-3 text-left">Reasons given</th>
                    <th className="px-4 py-3 text-left">Purpose</th>
                    <th className="px-4 py-3 text-left">Entity</th>
                    <th className="px-4 py-3 text-left">Firewalled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {adverse.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                        No denials recorded for {year}.
                      </td>
                    </tr>
                  )}
                  {adverse.map((row) => (
                    <tr key={row.recordId}>
                      <td className="px-4 py-3 text-gray-300">
                        {row.applicationId ?? (
                          <span className="text-gray-500 italic">not linked</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{formatDate(row.actionDate)}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {row.adverseReasons.length === 0 ? (
                          <span className="text-gray-500 italic">none recorded</span>
                        ) : (
                          <ul className="list-disc list-inside space-y-0.5">
                            {row.adverseReasons.map((r) => (
                              <li key={r}>{r}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {row.creditPurpose === null ? '—' : humanise(row.creditPurpose)}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {row.businessType === null ? '—' : humanise(row.businessType)}
                      </td>
                      <td className="px-4 py-3">
                        {row.isFirewalled ? (
                          <span className="text-green-400 text-xs">Yes</span>
                        ) : (
                          <span className="text-red-400 text-xs font-semibold">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Demographic collection ── */}
          {tab === 'collection' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
                <h2 className="text-base font-semibold text-gray-200 mb-1">
                  Demographic collection
                </h2>
                <p className="text-xs text-gray-500 mb-4">{collection.note}</p>

                {collection.rate === null ? (
                  <p className="text-sm text-gray-500">Nothing to report for {year}.</p>
                ) : (
                  <>
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-bold text-gray-100">{collection.rate}%</span>
                      <span className="text-sm text-gray-500">
                        {collection.collected} of {collection.total} recorded decisions carry a
                        response
                      </span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full bg-[#C9A84C]"
                        style={{ width: `${Math.min(100, collection.rate)}%` }}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
                <h3 className="text-sm font-semibold text-gray-300 mb-2">What this figure is not</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  It counts records carrying a demographic response. It says nothing about what was
                  answered, and a figure below 100% is not a finding — applicants may decline to
                  provide, and a declared refusal is itself a valid response under 1071.
                </p>
                <p className="text-xs text-gray-500 leading-relaxed mt-2">
                  A per-field completeness breakdown used to appear here, naming which applications
                  were missing race, ethnicity or business age. No such per-field data is recorded,
                  and the application ids it named did not exist.
                </p>
              </div>
            </div>
          )}

          {/* ── Obligations ── */}
          {tab === 'obligations' && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
              <h2 className="text-base font-semibold text-gray-200 mb-1">
                Section 1071 obligations
              </h2>
              <p className="text-xs text-gray-500 mb-5">
                A reference list, with no status against any item. This was previously a checklist
                marking the Regulation B firewall and the adverse action notice templates as
                complete — an attestation that a control is in place, which nothing here has any
                evidence for.
              </p>
              <ul className="space-y-4">
                {OBLIGATIONS.map((o) => (
                  <li
                    key={o.label}
                    className="border-b border-gray-800 pb-4 last:border-0 last:pb-0"
                  >
                    <p className="text-sm text-gray-200">{o.label}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{o.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
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

function CountPanel({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; count: number }[];
  total: number;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      <h2 className="text-base font-semibold text-gray-200 mb-4">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">Nothing recorded.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-baseline justify-between text-xs mb-1">
                <span className="text-gray-300">{r.label}</span>
                <span className="text-gray-500">
                  {r.count} of {total}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full bg-[#C9A84C]"
                  style={{ width: total === 0 ? '0%' : `${(r.count / total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
