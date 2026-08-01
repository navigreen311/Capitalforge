'use client';

// ============================================================
// /regulatory — Regulatory Intelligence
//
// This page called nothing. It held six regulatory alerts with impact scores
// and affected-module lists, five funds-flow rows carrying daily volumes
// ("$2.4M/day"), six AML readiness pillar scores, and a register of state
// lending licences:
//
//   CA  Commercial Financing License   CFL-60DX-2024   active   2027-06-30
//   NY  Premium Finance Agency         PFA-NY-0441     active   2026-12-31
//   IL  Retail Installment Sales Act   RISA-IL-0772    expired  2025-12-31
//
// None of those licences exist. Nothing in the schema records a licence held,
// its number or its expiry, and no endpoint returns one. Lending into a state
// without the licence it requires is not a reporting problem, which makes a
// register asserting you hold one the most dangerous thing that was here.
//
// Its router was one of the twenty-two index.ts never imported, so every
// endpoint behind this page answered 404 while the page had its own answers.
// Now that it is mounted:
//   GET  /api/regulatory/alerts              — rule changes and impact
//   POST /api/regulatory/alerts/:id/review   — record a review decision
//   GET  /api/regulatory/impact/:ruleId      — assessment for one rule
//   GET  /api/funds-flow/classifications     — how money moves, per workflow
//   GET  /api/funds-flow/licensing-status    — workflows escalated for review
//
// Licensing here means "which workflows need a licensing question answered".
// That is a different claim from "which licences we hold", and it is the one
// the system can actually support.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  toRegulatoryAlerts,
  toFundsFlowRows,
  toLicensingEscalations,
  toImpactAssessment,
  impactBand,
  summariseAlerts,
  unresolvedFlows,
  humanise,
  type RegulatoryAlertRow,
  type FundsFlowRow,
  type LicensingEscalationRow,
  type ImpactAssessment,
  type AlertStatus,
  type Urgency,
} from '@/lib/regulatory-view';

type TabKey = 'alerts' | 'flows' | 'licensing';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'alerts', label: 'Rule Changes' },
  { key: 'flows', label: 'Funds Flow' },
  { key: 'licensing', label: 'Licensing Review' },
];

const URGENCY_STYLE: Record<Urgency, string> = {
  critical: 'bg-red-900 text-red-300 border-red-700',
  high: 'bg-orange-900 text-orange-300 border-orange-700',
  medium: 'bg-yellow-900 text-yellow-300 border-yellow-700',
  low: 'bg-gray-800 text-gray-400 border-gray-700',
};

const STATUS_STYLE: Record<AlertStatus, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-blue-900 text-blue-300 border-blue-700' },
  under_review: { label: 'Under review', cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  resolved: { label: 'Resolved', cls: 'bg-green-900 text-green-300 border-green-700' },
  dismissed: { label: 'Dismissed', cls: 'bg-gray-800 text-gray-500 border-gray-700' },
};

/** The transitions the review endpoint accepts. */
const REVIEW_OPTIONS: { value: 'under_review' | 'resolved' | 'dismissed'; label: string }[] = [
  { value: 'under_review', label: 'Mark under review' },
  { value: 'resolved', label: 'Mark resolved' },
  { value: 'dismissed', label: 'Dismiss' },
];

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
  return token === null ? {} : { Authorization: `Bearer ${token}` };
}

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default function RegulatoryPage() {
  const [tab, setTab] = useState<TabKey>('alerts');

  const [alerts, setAlerts] = useState<RegulatoryAlertRow[]>([]);
  const [flows, setFlows] = useState<FundsFlowRow[]>([]);
  const [escalations, setEscalations] = useState<LicensingEscalationRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partial, setPartial] = useState<string[]>([]);

  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [impact, setImpact] = useState<Record<string, ImpactAssessment | null>>({});
  const [impactLoading, setImpactLoading] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setPartial([]);
    const headers = authHeaders();
    const failed: string[] = [];

    try {
      const [alertsRes, flowsRes, licRes] = await Promise.all([
        fetch('/api/regulatory/alerts?limit=500', { headers }),
        fetch('/api/funds-flow/classifications', { headers }),
        fetch('/api/funds-flow/licensing-status', { headers }),
      ]);

      if (alertsRes.ok) {
        const body = (await alertsRes.json()) as { success?: boolean; data?: unknown };
        setAlerts(body.success === true ? toRegulatoryAlerts(body.data) : []);
      } else {
        setAlerts([]);
        failed.push('rule changes');
      }

      if (flowsRes.ok) {
        const body = (await flowsRes.json()) as { success?: boolean; data?: unknown };
        setFlows(body.success === true ? toFundsFlowRows(body.data) : []);
      } else {
        setFlows([]);
        failed.push('funds flow classifications');
      }

      if (licRes.ok) {
        const body = (await licRes.json()) as { success?: boolean; data?: unknown };
        setEscalations(body.success === true ? toLicensingEscalations(body.data) : []);
      } else {
        setEscalations([]);
        failed.push('licensing review');
      }

      // Reported per section. A partial load must not leave one panel empty
      // in a way that reads as "nothing to do here".
      setPartial(failed);
    } catch {
      setLoadError('Could not reach the server. No regulatory data is shown.');
      setAlerts([]);
      setFlows([]);
      setEscalations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadImpact = useCallback(
    async (alertId: string) => {
      if (impact[alertId] !== undefined) return;
      setImpactLoading(alertId);
      try {
        const res = await fetch(`/api/regulatory/impact/${encodeURIComponent(alertId)}`, {
          headers: authHeaders(),
        });
        if (!res.ok) {
          setImpact((prev) => ({ ...prev, [alertId]: null }));
          return;
        }
        const body = (await res.json()) as { success?: boolean; data?: unknown };
        setImpact((prev) => ({
          ...prev,
          [alertId]: body.success === true ? toImpactAssessment(body.data) : null,
        }));
      } catch {
        setImpact((prev) => ({ ...prev, [alertId]: null }));
      } finally {
        setImpactLoading(null);
      }
    },
    [impact],
  );

  const review = useCallback(
    async (alertId: string, newStatus: 'under_review' | 'resolved' | 'dismissed') => {
      setBusyId(alertId);
      setActionError(null);
      try {
        const res = await fetch(`/api/regulatory/alerts/${encodeURIComponent(alertId)}/review`, {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ newStatus }),
        });
        const body = (await res.json()) as { success?: boolean; error?: { message?: string } };
        if (!res.ok || body.success !== true) {
          setActionError(
            body.error?.message ?? `The review was not recorded (HTTP ${res.status}).`,
          );
          return;
        }
        showToast('Review recorded.');
        await load();
      } catch {
        setActionError('Could not reach the server. The review was not recorded.');
      } finally {
        setBusyId(null);
      }
    },
    [load, showToast],
  );

  const summary = useMemo(() => summariseAlerts(alerts), [alerts]);
  const openFlows = useMemo(() => unresolvedFlows(flows), [flows]);

  const visibleAlerts = useMemo(
    () => (statusFilter === 'all' ? alerts : alerts.filter((a) => a.status === statusFilter)),
    [alerts, statusFilter],
  );

  const criticalEscalations = escalations.filter((e) => e.urgency === 'critical');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">
      {toast !== null && (
        <div className="fixed top-6 right-6 z-50 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-200 shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-100">Regulatory Intelligence</h1>
        <p className="text-sm text-gray-500 mt-1">
          Rule changes affecting this platform, and how money moves through each workflow.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading regulatory data…</p>}

      {loadError !== null && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {loadError}
        </p>
      )}

      {!loading && loadError === null && (
        <>
          {partial.length > 0 && (
            <p className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-xs text-yellow-300">
              Could not load {partial.join(', ')}. Those sections are blank rather than estimated.
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Rule changes" value={String(summary.total)} />
            <Kpi
              label="Awaiting first review"
              value={String(summary.needingReview)}
              note={summary.needingReview === 0 ? 'nothing new' : 'not yet looked at'}
            />
            <Kpi
              label="Highest open impact"
              value={summary.highestOpenScore === null ? '—' : `${summary.highestOpenScore}`}
              note={
                summary.highestOpenScore === null
                  ? 'no open alert carries a score'
                  : summary.openWithoutScore > 0
                    ? `${summary.openWithoutScore} open alert${summary.openWithoutScore === 1 ? '' : 's'} unscored`
                    : 'across all open alerts'
              }
            />
            <Kpi
              label="Workflows to settle"
              value={String(openFlows.length)}
              note="under review or flagged"
            />
          </div>

          {criticalEscalations.length > 0 && (
            <p className="rounded-lg border border-red-700 bg-red-900/20 px-4 py-3 text-sm text-red-200">
              {criticalEscalations.length} workflow
              {criticalEscalations.length === 1 ? '' : 's'} escalated as critical for licensing
              review.
            </p>
          )}

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

          {actionError !== null && (
            <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              {actionError}
            </p>
          )}

          {/* ── Rule changes ── */}
          {tab === 'alerts' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">Status:</span>
                {(['all', 'new', 'under_review', 'resolved', 'dismissed'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      statusFilter === s
                        ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]'
                        : 'border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    {s === 'all' ? 'All' : STATUS_STYLE[s].label}
                  </button>
                ))}
              </div>

              {visibleAlerts.length === 0 ? (
                <p className="rounded-xl border border-gray-800 bg-gray-900/40 px-5 py-10 text-center text-sm text-gray-500">
                  {alerts.length === 0
                    ? 'No rule changes recorded.'
                    : 'No rule changes match this filter.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {visibleAlerts.map((alert) => {
                    const band = impactBand(alert.impactScore);
                    const open = expandedId === alert.id;
                    const status = STATUS_STYLE[alert.status];

                    return (
                      <div
                        key={alert.id}
                        className="rounded-xl border border-gray-800 bg-gray-900/40 p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="rounded-full border border-gray-700 px-2 py-0.5 text-2xs text-gray-400">
                                {alert.source}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-2xs ${status.cls}`}
                              >
                                {status.label}
                              </span>
                              {/* No band means no score was published. Rendering
                                  that as "low" asserts an assessment nobody made. */}
                              {band === null ? (
                                <span className="rounded-full border border-gray-700 px-2 py-0.5 text-2xs text-gray-500">
                                  Impact not scored
                                </span>
                              ) : (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-2xs ${URGENCY_STYLE[band]}`}
                                >
                                  Impact {alert.impactScore} · {humanise(band)}
                                </span>
                              )}
                            </div>
                            <h2 className="text-sm font-semibold text-gray-100">{alert.title}</h2>
                            <p className="text-xs text-gray-500 mt-1">{alert.summary}</p>
                          </div>
                          <div className="text-right text-xs text-gray-500 flex-shrink-0">
                            <p>Effective {formatDate(alert.effectiveDate)}</p>
                            {alert.reviewedAt !== null && (
                              <p className="mt-0.5">Reviewed {formatDate(alert.reviewedAt)}</p>
                            )}
                          </div>
                        </div>

                        {alert.affectedModules.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {alert.affectedModules.map((m) => (
                              <span
                                key={m}
                                className="rounded border border-gray-800 bg-gray-900 px-2 py-0.5 text-2xs text-gray-400"
                              >
                                {humanise(m)}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => {
                              const next = open ? null : alert.id;
                              setExpandedId(next);
                              if (next !== null) loadImpact(alert.id);
                            }}
                            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-900"
                          >
                            {open ? 'Hide assessment' : 'Impact assessment'}
                          </button>

                          {REVIEW_OPTIONS.filter((o) => o.value !== alert.status).map((o) => (
                            <button
                              key={o.value}
                              disabled={busyId === alert.id}
                              onClick={() => review(alert.id, o.value)}
                              className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-200 disabled:opacity-40"
                            >
                              {busyId === alert.id ? 'Saving…' : o.label}
                            </button>
                          ))}
                        </div>

                        {open && (
                          <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-4">
                            {impactLoading === alert.id ? (
                              <p className="text-xs text-gray-500">Loading assessment…</p>
                            ) : impact[alert.id] == null ? (
                              <p className="text-xs text-gray-500">
                                No assessment is available for this rule.
                              </p>
                            ) : (
                              <>
                                <p className="text-xs text-gray-400">{impact[alert.id]?.rationale}</p>
                                {(impact[alert.id]?.recommendedActions.length ?? 0) > 0 && (
                                  <ul className="mt-3 space-y-1.5">
                                    {impact[alert.id]?.recommendedActions.map((a) => (
                                      <li key={a} className="flex gap-2 text-xs text-gray-300">
                                        <span className="text-[#C9A84C] flex-shrink-0">•</span>
                                        {a}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Funds flow ── */}
          {tab === 'flows' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Workflow</th>
                      <th className="px-4 py-3 text-left">Classification</th>
                      <th className="px-4 py-3 text-left">Framework</th>
                      <th className="px-4 py-3 text-left">Licensing</th>
                      <th className="px-4 py-3 text-left">Legal opinion</th>
                      <th className="px-4 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {flows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                          No workflows classified.
                        </td>
                      </tr>
                    )}
                    {flows.map((flow) => (
                      <tr key={flow.id}>
                        <td className="px-4 py-3">
                          <p className="text-gray-200">{flow.workflowName}</p>
                          {flow.riskBasis !== null && (
                            <p className="text-xs text-gray-500 mt-0.5">{flow.riskBasis}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {humanise(flow.classification)}
                          {flow.processorRole !== null && (
                            <span className="block text-xs text-gray-600">
                              {flow.processorRole.toUpperCase()}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {flow.regulatoryFramework ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {flow.moneyTransmissionAlert ? (
                            <span className="text-red-400 font-semibold">
                              Money transmission flag
                            </span>
                          ) : (
                            <span className="text-gray-400">
                              {flow.licensingStatus === null ? '—' : humanise(flow.licensingStatus)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {flow.legalOpinionRef ?? <span className="text-gray-600">none on file</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{humanise(flow.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-gray-600">
                Transaction volume is not shown. Each row used to carry a figure such as
                &ldquo;$2.4M/day&rdquo;; no column records volume against a workflow
                classification.
              </p>
            </div>
          )}

          {/* ── Licensing review ── */}
          {tab === 'licensing' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
                <h2 className="text-base font-semibold text-gray-200 mb-1">
                  Workflows escalated for licensing review
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                  Money movement that raises a licensing question, from the funds-flow classifier.
                </p>

                {escalations.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    No workflow is currently escalated for licensing review.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {escalations.map((e) => (
                      <li
                        key={e.workflowId}
                        className="rounded-lg border border-gray-800 bg-gray-950 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-200">{e.workflowName}</p>
                            <p className="text-xs text-gray-500 mt-1">{e.escalationReason}</p>
                          </div>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-2xs flex-shrink-0 ${URGENCY_STYLE[e.urgency]}`}
                          >
                            {humanise(e.urgency)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                          <span>{humanise(e.licensingStatus)}</span>
                          {e.affectedStates.length > 0 && (
                            <span>States: {e.affectedStates.join(', ')}</span>
                          )}
                          {e.counselReferralRequired && (
                            <span className="text-orange-400">Counsel referral required</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* The table this page is most likely to be missed for. */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
                <h3 className="text-sm font-semibold text-gray-300 mb-2">Licences held</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Not shown. This page used to list state lending licences with numbers, statuses
                  and expiry dates — a California Commercial Financing Licence, a New York Premium
                  Finance Agency licence, an expired Illinois registration. Those licences were
                  written into the page. Nothing in this system records a licence held, its number
                  or when it lapses.
                </p>
                <p className="text-xs text-gray-500 leading-relaxed mt-2">
                  Whether you are licensed where you lend is not a question this page can answer,
                  and the cost of getting it wrong is not a reporting failure. Keep that register
                  wherever your licences are actually administered.
                </p>
              </div>

              {/* Same for the AML gauge. */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
                <h3 className="text-sm font-semibold text-gray-300 mb-2">AML readiness</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Not shown. Six pillars — customer due diligence, transaction monitoring, SAR
                  filing readiness, sanctions screening, record retention, training — each carried
                  a score out of 100. Nothing measured any of them; the numbers were constants in
                  the page, identical for every tenant.
                </p>
              </div>
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
