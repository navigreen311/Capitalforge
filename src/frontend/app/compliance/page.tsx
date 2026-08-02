'use client';

// ============================================================
// /compliance — Compliance Center, from compliance_checks
//
// This page stated a regulated firm's compliance position out of literals.
// Ten findings against businesses that do not exist: "NY disclosure deadline
// missed — immediate filing required" for Apex Ventures LLC, "Affiliated
// vendor on CFPB enforcement watch list" for Blue Ridge Consulting, KYB gaps
// for Horizon Retail Partners, enhanced due diligence for Pinnacle Freight
// LLC. It scored them into a six-component breakdown — UDAP 0 of 25, State
// Disclosures 5 of 25 — named a top priority reading "File the 2 overdue
// state disclosures (+10 points)", and listed quick wins naming more
// businesses that do not exist.
//
// Then it wrote all of it to disk as compliance-report-<date>.txt.
//
// Running checks was simulated too: a progress bar, a two-second timer, and a
// count of "new issues found" invented in the browser.
//
// GET /api/compliance/overview reads compliance_checks and always has.
// POST /api/compliance/run-all really runs them, through the service, and
// persists what it finds. POST /api/compliance/export-report now builds the
// report from those rows. This page uses all three.
//
// Two things are deliberately absent:
//
//   A score when nothing has been checked. The endpoint returned 100 for a
//   tenant with no checks on record — the strongest claim it could make,
//   derived from never having looked. It is null now, and this page says so
//   rather than drawing a full ring.
//
//   Recommendations. "Top priority" and "quick wins" told an operator which
//   regulatory filings to make, with point values attached. What a firm owes
//   a regulator is advice, and nothing in this system computes it.
// ============================================================

import { useCallback, useMemo, useState } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { apiClient } from '@/lib/api-client';
import {
  toComplianceOverview,
  riskShare,
  type RiskLevel,
  type ComplianceCheckView,
} from '@/lib/compliance-overview-view';

// ─── Presentation ────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<RiskLevel, { label: string; badge: string; dot: string }> = {
  critical: { label: 'Critical', badge: 'bg-red-900 text-red-300 border-red-700', dot: 'bg-red-500' },
  high: { label: 'High', badge: 'bg-orange-900 text-orange-300 border-orange-700', dot: 'bg-orange-500' },
  medium: { label: 'Medium', badge: 'bg-yellow-900 text-yellow-300 border-yellow-700', dot: 'bg-yellow-500' },
  low: { label: 'Low', badge: 'bg-green-900 text-green-300 border-green-700', dot: 'bg-green-500' },
};

const RISK_ORDER: RiskLevel[] = ['critical', 'high', 'medium', 'low'];

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function humanise(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The score ring. Renders as unknown rather than as zero. */
function ScoreRing({ score }: { score: number | null }) {
  const size = 132;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score === null ? 0 : Math.min(100, Math.max(0, score));
  const colour = score === null ? '#4B5563' : score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <svg
      width={size}
      height={size}
      aria-label={score === null ? 'Compliance score not available' : `Compliance score ${score}`}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1F2937" strokeWidth={stroke} fill="none" />
      {score !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colour}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (pct / 100) * circumference}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-white font-bold"
        style={{ fontSize: score === null ? 28 : 34 }}
      >
        {score === null ? '—' : score}
      </text>
    </svg>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState<RiskLevel | null>(null);

  const { data: raw, isLoading, error, refetch } = useAuthFetch<unknown>('/api/compliance/overview');

  const view = useMemo(() => toComplianceOverview(raw), [raw]);
  const known = view.loaded && !isLoading && error === null;

  const visibleChecks: ComplianceCheckView[] = useMemo(
    () => (riskFilter === null ? view.checks : view.checks.filter((c) => c.riskLevel === riskFilter)),
    [view.checks, riskFilter],
  );

  const runChecks = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      // The real run. This used to be a two-second timer that incremented a
      // progress bar and invented a count of new issues in the browser.
      const res = await apiClient.post<{ businessCount: number; checkCount: number }>(
        '/compliance/run-all',
      );
      await refetch();
      setNotice(
        `Ran ${res.data?.checkCount ?? 0} checks across ${res.data?.businessCount ?? 0} businesses.`,
      );
    } catch (err) {
      setActionError(
        `Could not run compliance checks: ${
          err instanceof Error ? err.message : 'the request failed'
        }`,
      );
    } finally {
      setBusy(false);
    }
  }, [refetch]);

  const exportReport = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      // Built server-side from the rows. The browser used to assemble this
      // from its own literals and write it to disk.
      const res = await apiClient.post<{ reportText: string }>('/compliance/export-report');
      const text = res.data?.reportText ?? '';
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-report-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice('Compliance report downloaded.');
    } catch (err) {
      setActionError(
        `Could not build the report: ${err instanceof Error ? err.message : 'the request failed'}`,
      );
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Center</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {known
              ? `${view.total} checks on record · ${view.failed} open`
              : 'Checks on record for this tenant.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void exportReport()}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            Export report
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runChecks()}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8933e] text-[#0A1628] text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {busy ? 'Running…' : 'Run all checks'}
          </button>
        </div>
      </div>

      {actionError !== null && (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-4">
          <p className="text-sm font-semibold text-red-300">{actionError}</p>
        </div>
      )}
      {notice !== null && (
        <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
          <p className="text-sm text-gray-300">{notice}</p>
        </div>
      )}

      {isLoading && <p className="text-sm text-gray-500">Loading compliance checks…</p>}

      {!isLoading && error !== null && (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-4 space-y-1">
          <p className="text-sm font-semibold text-red-300">
            Compliance checks could not be read.
          </p>
          <p className="text-xs text-red-200">
            No score and no findings are shown. This page states a firm&apos;s regulatory
            position, so it shows nothing rather than a sample.
          </p>
        </div>
      )}

      {known && (
        <>
          {/* ── Score ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 flex items-center gap-6">
              <ScoreRing score={view.score} />
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                  Compliance score
                </p>
                {view.score === null ? (
                  <p className="text-sm text-gray-300 max-w-xs">
                    No checks have run for this tenant, so there is no score. This showed
                    100 out of 100 in that state — a clean bill of health from never
                    having looked.
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">
                    From {view.total} checks · {view.passed} passed, {view.failed} open
                  </p>
                )}
              </div>
            </div>

            {/* ── Risk distribution ────────────────────────────── */}
            <div className="lg:col-span-2 rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-3">
              <h2 className="text-sm font-semibold text-gray-200">Risk distribution</h2>
              {view.total === 0 ? (
                <p className="text-xs text-gray-500">
                  Nothing has been assessed, so no share is shown. A row of 0% would state
                  that no check is critical, which is itself a finding.
                </p>
              ) : (
                RISK_ORDER.map((level) => {
                  const count = view.riskDistribution[level];
                  const pct = riskShare(count, view.total);
                  return (
                    <div key={level}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${RISK_CONFIG[level].dot}`} />
                          <span className="text-sm font-semibold text-gray-200">
                            {RISK_CONFIG[level].label}
                          </span>
                        </div>
                        <span className="text-sm text-gray-400">
                          {count}
                          {pct === null ? '' : ` (${pct}%)`}
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2">
                        <div
                          className={`${RISK_CONFIG[level].dot} h-2 rounded-full transition-all duration-500`}
                          style={{ width: `${pct ?? 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Checks ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-200">Compliance checks</h2>
              {riskFilter !== null && (
                <button
                  type="button"
                  onClick={() => setRiskFilter(null)}
                  aria-label="Clear filter"
                  className="text-xs text-gray-400 hover:text-gray-200"
                >
                  Clear filter
                </button>
              )}
            </div>

            {view.checks.length === 0 ? (
              <div className="space-y-1">
                <p className="text-sm text-gray-300">No compliance checks are on record.</p>
                <p className="text-xs text-gray-500">
                  Ten were shown here — against Apex Ventures LLC, Horizon Retail Partners,
                  Blue Ridge Consulting and others — and none of those businesses exist. Run
                  the checks to populate this from real ones.
                </p>
              </div>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  {RISK_ORDER.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setRiskFilter(riskFilter === level ? null : level)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        riskFilter === level
                          ? RISK_CONFIG[level].badge
                          : 'bg-gray-950 text-gray-400 border-gray-700 hover:border-gray-500'
                      }`}
                    >
                      {RISK_CONFIG[level].label} ({view.riskDistribution[level]})
                    </button>
                  ))}
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500">
                      <th className="pb-2 font-medium">Check</th>
                      <th className="pb-2 font-medium">Business</th>
                      <th className="pb-2 font-medium">Risk</th>
                      <th className="pb-2 font-medium">Finding</th>
                      <th className="pb-2 font-medium">Checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleChecks.map((check) => (
                      <tr key={check.id} className="border-t border-gray-800 align-top">
                        <td className="py-2 text-gray-200">{humanise(check.checkType)}</td>
                        <td className="py-2 text-gray-300">{check.businessName}</td>
                        <td className="py-2">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${
                              RISK_CONFIG[check.riskLevel].badge
                            }`}
                          >
                            {RISK_CONFIG[check.riskLevel].label}
                          </span>
                        </td>
                        <td className="py-2 text-gray-400 max-w-md">
                          {check.findings === '' ? (
                            <span className="italic text-gray-600">no finding recorded</span>
                          ) : (
                            check.findings
                          )}
                        </td>
                        <td className="py-2 text-gray-500 whitespace-nowrap">
                          {formatDate(check.checkedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          {/* ── What this page no longer claims ────────────────── */}
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-5 space-y-2">
            <h2 className="text-sm font-semibold text-gray-300">Not shown here</h2>
            <ul className="text-xs text-gray-500 space-y-1.5 list-disc pl-4">
              <li>
                <strong className="text-gray-400">A recommended next filing.</strong> A
                &quot;top priority&quot; and three &quot;quick wins&quot; told an operator
                which regulatory filings to make, with point values attached, naming
                businesses that do not exist. What a firm owes a regulator is advice, and
                nothing here computes it.
              </li>
              <li>
                <strong className="text-gray-400">A per-category score.</strong> UDAP 0 of
                25, State Disclosures 5 of 25 and four more were written into the page, as
                was the endpoint behind them. Scores now come from the checks that ran, and
                a category nothing has scored shows no score.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
