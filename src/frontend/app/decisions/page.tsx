'use client';

// ============================================================
// /decisions — AI decision governance
//
// This page called nothing. Eight decisions were literals, each tied to a
// named client and carrying a snapshot of the inputs behind it — FICO Score
// 742, Annual Revenue $2,400,000, DTI 47% — beside an override audit trail
// naming who approved each reversal:
//
//   Risk score 42/100 overridden to "Approved with conditions"
//   overrideBy:  Ana Reyes
//   approvedBy:  Diana Walsh (Chief Credit Officer)
//
// A documented override with senior sign-off is the control a fair lending
// examiner asks to see. None of those overrides happened. It closed with the
// assertion that entries are "append-only and retained for 7 years per
// regulatory requirements" and "cannot be deleted or modified" — a retention
// and immutability guarantee that nothing implements.
//
// Wired to what the record actually holds:
//   GET /api/ai-governance/decisions  — the log, filterable
//   GET /api/ai-governance/metrics    — per-module rates
//   GET /api/ai-governance/versions   — model and prompt versions seen
//
// Three of the page's columns are gone because there is nothing behind them,
// and the page says so rather than leaving the absence to be noticed:
// decisions carry no client, the inputs are kept only as a hash, and an
// override records who made it but not who authorised it.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchAllPages } from '@/lib/fetch-all-pages';
import { loadJson } from '@/lib/load-json';
import {
  toDecisionRows,
  toModuleMetrics,
  toVersionRows,
  summariseOutput,
  summariseDecisions,
  decisionFacets,
  confidencePercent,
  humanise,
  type DecisionRow,
  type ModuleMetrics,
  type VersionRow,
} from '@/lib/decision-view';

type TabKey = 'log' | 'modules' | 'versions';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'log', label: 'Decision Log' },
  { key: 'modules', label: 'By Module' },
  { key: 'versions', label: 'Model Versions' },
];

function formatDateTime(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 16).replace('T', ' ');
}

export default function DecisionsPage() {
  const [tab, setTab] = useState<TabKey>('log');

  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [metrics, setMetrics] = useState<ModuleMetrics[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [partial, setPartial] = useState<string[]>([]);

  const [moduleFilter, setModuleFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const [onlyBelowThreshold, setOnlyBelowThreshold] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setPartial([]);
    const failed: string[] = [];

    try {
      // The decision log decides whether this page has anything to show, so it
      // throws. The other two are supporting panels: each resolves to null on
      // failure and is named in `partial`, so one dead endpoint reports itself
      // rather than emptying a panel that would then read as a real zero.
      const [log, metrics, versions] = await Promise.all([
        // Paged, and counted: a governance log that silently shows its first
        // page understates every rate computed from it.
        fetchAllPages(
          '/api/ai-governance/decisions',
          (json) => {
            const body = json as { success?: boolean; data?: unknown };
            return body.success === true ? toDecisionRows(body.data) : [];
          },
        ),
        loadJson<unknown>('/api/ai-governance/metrics')
          .then(toModuleMetrics)
          .catch(() => null),
        loadJson<unknown>('/api/ai-governance/versions')
          .then(toVersionRows)
          .catch(() => null),
      ]);

      setDecisions(log.rows);
      setTruncated(log.truncated);

      setMetrics(metrics ?? []);
      if (metrics === null) failed.push('per-module rates');

      setVersions(versions ?? []);
      if (versions === null) failed.push('version history');

      setPartial(failed);
    } catch {
      setLoadError('Could not reach the server. No decisions are shown.');
      setDecisions([]);
      setMetrics([]);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => summariseDecisions(decisions), [decisions]);
  const facets = useMemo(() => decisionFacets(decisions), [decisions]);

  const filtered = useMemo(
    () =>
      decisions.filter(
        (d) =>
          (moduleFilter === 'all' || d.moduleSource === moduleFilter) &&
          (typeFilter === 'all' || d.decisionType === typeFilter) &&
          (!onlyOverridden || d.flags.wasOverridden || d.overriddenBy !== null) &&
          (!onlyBelowThreshold || d.flags.belowConfidenceThreshold),
      ),
    [decisions, moduleFilter, typeFilter, onlyOverridden, onlyBelowThreshold],
  );

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Decision Governance</h1>
        <p className="text-sm text-gray-400 mt-1">
          What each module decided, how confident it was, and where a person disagreed.
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
              Not every decision could be loaded, so the counts below cover only those shown.
            </p>
          )}
          {partial.length > 0 && (
            <p className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-xs text-yellow-300">
              Could not load {partial.join(' and ')}. Those tabs are blank rather than estimated.
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Decisions" value={String(summary.total)} />
            <Kpi
              label="Overridden"
              value={String(summary.overridden)}
              note="a person disagreed"
            />
            <Kpi
              label="Below confidence threshold"
              value={String(summary.belowThreshold)}
              note={
                summary.possibleHallucination > 0
                  ? `${summary.possibleHallucination} also flagged as suspect`
                  : 'none flagged as suspect'
              }
            />
            <Kpi
              label="Mean confidence"
              value={summary.averageConfidence === null ? '—' : `${summary.averageConfidence}%`}
              note={
                summary.averageConfidence === null
                  ? 'no decision reported one'
                  : summary.withoutConfidence > 0
                    ? `${summary.withoutConfidence} without a score`
                    : 'across all decisions'
              }
            />
          </div>

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

          {/* ── Decision log ── */}
          {tab === 'log' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label
                    htmlFor="decision-module"
                    className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1"
                  >
                    Module
                  </label>
                  <select
                    id="decision-module"
                    value={moduleFilter}
                    onChange={(e) => setModuleFilter(e.target.value)}
                    className="rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm px-3 py-2"
                  >
                    <option value="all">All modules</option>
                    {facets.modules.map((m) => (
                      <option key={m} value={m}>
                        {humanise(m)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="decision-type"
                    className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1"
                  >
                    Decision type
                  </label>
                  <select
                    id="decision-type"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm px-3 py-2"
                  >
                    <option value="all">All types</option>
                    {facets.types.map((t) => (
                      <option key={t} value={t}>
                        {humanise(t)}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs text-gray-400 pb-2">
                  <input
                    type="checkbox"
                    checked={onlyOverridden}
                    onChange={(e) => setOnlyOverridden(e.target.checked)}
                  />
                  Overridden only
                </label>

                <label className="flex items-center gap-2 text-xs text-gray-400 pb-2">
                  <input
                    type="checkbox"
                    checked={onlyBelowThreshold}
                    onChange={(e) => setOnlyBelowThreshold(e.target.checked)}
                  />
                  Below threshold only
                </label>

                <p className="text-xs text-gray-500 pb-2">
                  {filtered.length} of {decisions.length}
                </p>
              </div>

              <div className="rounded-xl border border-gray-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">When</th>
                      <th className="px-4 py-3 text-left">Module</th>
                      <th className="px-4 py-3 text-left">Decision</th>
                      <th className="px-4 py-3 text-left">Confidence</th>
                      <th className="px-4 py-3 text-left">Flags</th>
                      <th className="px-4 py-3 text-left">Model</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                          {decisions.length === 0
                            ? 'No decisions recorded.'
                            : 'No decisions match these filters.'}
                        </td>
                      </tr>
                    )}
                    {filtered.map((d) => {
                      const open = expandedId === d.id;
                      const pct = confidencePercent(d.confidence);
                      return (
                        <React.Fragment key={d.id}>
                          <tr
                            onClick={() => setExpandedId(open ? null : d.id)}
                            className="cursor-pointer hover:bg-gray-900/40"
                          >
                            <td className="px-4 py-3 text-xs text-gray-400">
                              {formatDateTime(d.createdAt)}
                            </td>
                            <td className="px-4 py-3 text-gray-300">
                              {humanise(String(d.moduleSource))}
                              <span className="block text-2xs text-gray-600">
                                {humanise(String(d.decisionType))}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-400">
                              {summariseOutput(d.output)}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {pct === null ? (
                                // Not 0%, which reads as a decision the model
                                // had no faith in.
                                <span className="text-gray-600">not reported</span>
                              ) : (
                                <span
                                  className={
                                    d.flags.belowConfidenceThreshold
                                      ? 'text-yellow-400 font-semibold'
                                      : 'text-gray-300'
                                  }
                                >
                                  {pct}%
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {d.flags.wasOverridden && (
                                  <span className="rounded-full border border-blue-700 bg-blue-900 px-2 py-0.5 text-2xs text-blue-300">
                                    Overridden
                                  </span>
                                )}
                                {d.flags.belowConfidenceThreshold && (
                                  <span className="rounded-full border border-yellow-700 bg-yellow-900 px-2 py-0.5 text-2xs text-yellow-300">
                                    Low confidence
                                  </span>
                                )}
                                {d.flags.possibleHallucination && (
                                  <span className="rounded-full border border-red-700 bg-red-900 px-2 py-0.5 text-2xs text-red-300">
                                    Suspect
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-2xs text-gray-500">
                              {d.modelVersion ?? '—'}
                              <span className="block text-gray-600">{d.promptVersion ?? '—'}</span>
                            </td>
                          </tr>

                          {open && (
                            <tr>
                              <td colSpan={6} className="px-4 pb-4 bg-gray-900/20">
                                <div className="space-y-4 pt-2">
                                  <div>
                                    <p className="text-2xs uppercase tracking-wide text-gray-600 mb-1">
                                      Output
                                    </p>
                                    <pre className="whitespace-pre-wrap rounded-lg border border-gray-800 bg-[#071019] p-3 text-xs text-gray-300 font-mono">
                                      {JSON.stringify(d.output, null, 2)}
                                    </pre>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                    <div>
                                      <p className="text-gray-500 mb-1">Inputs</p>
                                      {/* The row used to carry a snapshot of
                                          the inputs. They are hashed on the
                                          way in and not retained. */}
                                      <p className="text-gray-300 font-mono">
                                        {d.inputHash ?? 'no hash recorded'}
                                      </p>
                                      <p className="text-gray-600 mt-1 leading-relaxed">
                                        A digest, not the inputs. They are not kept, so that a
                                        decision can be recognised again without retaining the
                                        applicant data behind it.
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500 mb-1">Latency</p>
                                      <p className="text-gray-300">
                                        {d.latencyMs === null ? '—' : `${d.latencyMs} ms`}
                                      </p>
                                    </div>
                                  </div>

                                  <div>
                                    <p className="text-2xs uppercase tracking-wide text-gray-600 mb-1">
                                      Override
                                    </p>
                                    {d.overriddenBy === null ? (
                                      <p className="text-xs text-gray-500">
                                        Not overridden.
                                      </p>
                                    ) : (
                                      <>
                                        <p className="text-xs text-gray-300">
                                          Overridden by {d.overriddenBy}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">
                                          {d.overrideReason ?? 'No reason recorded.'}
                                        </p>
                                        {/* The trail used to name an approving
                                            officer per override. */}
                                        <p className="text-2xs text-gray-600 mt-2 leading-relaxed">
                                          Who authorised this override is not recorded. The log
                                          holds who made it and why.
                                        </p>
                                      </>
                                    )}
                                  </div>
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

              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-2">
                <h2 className="text-sm font-semibold text-gray-300">What this log does not hold</h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                  A decision is not linked to a client. There is no business on the record, so
                  there is no client column and no client filter — the previous version showed a
                  named client on every row.
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Retention and immutability are not claimed. This page used to close by saying
                  entries were &ldquo;append-only and retained for 7 years per regulatory
                  requirements&rdquo; and &ldquo;cannot be deleted or modified&rdquo;. Nothing
                  implements either; an override writes over the fields on the decision itself.
                </p>
              </div>
            </div>
          )}

          {/* ── Per module ── */}
          {tab === 'modules' && (
            <div className="rounded-xl border border-gray-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Module</th>
                    <th className="px-4 py-3 text-right">Decisions</th>
                    <th className="px-4 py-3 text-right">Override rate</th>
                    <th className="px-4 py-3 text-right">Mean confidence</th>
                    <th className="px-4 py-3 text-right">Below threshold</th>
                    <th className="px-4 py-3 text-right">Mean latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {metrics.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                        No module has recorded a decision.
                      </td>
                    </tr>
                  )}
                  {metrics.map((m) => (
                    <tr key={m.moduleSource}>
                      <td className="px-4 py-3 text-gray-300">{humanise(m.moduleSource)}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{m.totalDecisions}</td>
                      {/* Dashes, not zeroes: a module that decided nothing has
                          no override rate to report. */}
                      <td className="px-4 py-3 text-right text-gray-400">
                        {m.overrideRate === null ? '—' : `${m.overrideRate}%`}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {m.averageConfidence === null ? '—' : `${m.averageConfidence}%`}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {m.belowThresholdRate === null ? '—' : `${m.belowThresholdRate}%`}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {m.averageLatencyMs === null ? '—' : `${Math.round(m.averageLatencyMs)} ms`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Versions ── */}
          {tab === 'versions' && (
            <div className="rounded-xl border border-gray-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Model version</th>
                    <th className="px-4 py-3 text-left">Prompt version</th>
                    <th className="px-4 py-3 text-left">First seen</th>
                    <th className="px-4 py-3 text-left">Last seen</th>
                    <th className="px-4 py-3 text-right">Decisions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {versions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                        No model version has recorded a decision.
                      </td>
                    </tr>
                  )}
                  {versions.map((v) => (
                    <tr key={`${v.modelVersion ?? '?'}|${v.promptVersion ?? '?'}`}>
                      <td className="px-4 py-3 text-gray-300">{v.modelVersion ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-400">{v.promptVersion ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatDateTime(v.firstSeen)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatDateTime(v.lastSeen)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">{v.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
