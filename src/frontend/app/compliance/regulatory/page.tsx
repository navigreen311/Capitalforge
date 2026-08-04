'use client';

// ============================================================
// /compliance/regulatory — Regulatory update feed
//
// This page called nothing and held eight regulatory updates as literals. Not
// summaries of real rules: specific claims about enacted law and enforcement,
// attributed to named regulators.
//
//   "FTC settled with a business credit broker for $2.3M over misleading
//    'guaranteed approval' claims"
//   "Texas HB 1442 Business Lending Transparency Act Signed … Effective
//    September 1, 2026"
//   "California SB 1235 Amendment Expands Disclosure Requirements"
//
// Each carried a clientImpact paragraph telling an advisor what to do about
// it — update Texas contract templates, audit Florida application flows. An
// advisor following that is acting on legislation that was written here.
// There is also a "Last synced" date, and nothing syncs.
//
// The feed now reads the same alerts the /regulatory page works from:
//   GET /api/regulatory/alerts
//   GET /api/regulatory/impact/:ruleId
//
// Three of the page's features are gone because nothing backs them. There is
// no state column, so no state filter. There is no clientImpact column; what
// the API can say is which platform modules a rule touches and what it
// recommends, which is a different and narrower claim, labelled as such. And
// there is no bookmark column or endpoint, so the pin is gone rather than
// kept as a toggle that forgets on reload.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { loadJson, toLoadError } from '@/lib/load-json';
import Link from 'next/link';
import {
  toRegulatoryAlerts,
  toImpactAssessment,
  impactBand,
  facetsOf,
  byEffectiveDateDesc,
  humanise,
  type RegulatoryAlertRow,
  type ImpactAssessment,
  type AlertStatus,
  type Urgency,
} from '@/lib/regulatory-view';

const URGENCY_STYLE: Record<Urgency, string> = {
  critical: 'bg-red-900 text-red-300 border-red-700',
  high: 'bg-orange-900 text-orange-300 border-orange-700',
  medium: 'bg-yellow-900 text-yellow-300 border-yellow-700',
  low: 'bg-green-900 text-green-300 border-green-700',
};

const STATUS_LABEL: Record<AlertStatus, string> = {
  new: 'Not yet reviewed',
  under_review: 'Under review',
  resolved: 'Reviewed',
  dismissed: 'Dismissed',
};

function formatDate(iso: string | null): string {
  if (iso === null) return 'no date recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'no date recorded';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ComplianceRegulatoryFeedPage() {
  const [alerts, setAlerts] = useState<RegulatoryAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sourceFilter, setSourceFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [impact, setImpact] = useState<Record<string, ImpactAssessment | null>>({});
  const [impactLoading, setImpactLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await loadJson<unknown>('/api/regulatory/alerts?limit=500');
      setAlerts(toRegulatoryAlerts(data));
    } catch (e) {
      const info = toLoadError(e);
      setLoadError(
        info.type === 'auth_required'
          ? 'Your session has ended. Sign in again to see regulatory updates.'
          : info.type === 'network_error'
            ? 'Could not reach the server. No regulatory updates are shown.'
            : `The regulatory feed could not be loaded. ${info.message}`,
      );
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadImpact = useCallback(
    async (id: string) => {
      if (impact[id] !== undefined) return;
      setImpactLoading(id);
      try {
        const data = await loadJson<unknown>(
          `/api/regulatory/impact/${encodeURIComponent(id)}`,
        );
        setImpact((prev) => ({ ...prev, [id]: toImpactAssessment(data) }));
      } catch {
        setImpact((prev) => ({ ...prev, [id]: null }));
      } finally {
        setImpactLoading(null);
      }
    },
    [impact],
  );

  // Options come from the alerts that loaded. The page hardcoded six states
  // and seven rule types, so a filter could offer a value nothing had.
  const facets = useMemo(() => facetsOf(alerts), [alerts]);

  const filtered = useMemo(() => {
    const rows = alerts.filter(
      (a) =>
        (sourceFilter === 'all' || a.source === sourceFilter) &&
        (typeFilter === 'all' || a.ruleType === typeFilter),
    );
    return byEffectiveDateDesc(rows);
  }, [alerts, sourceFilter, typeFilter]);

  const undated = filtered.filter((a) => a.effectiveDate === null).length;

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Regulatory Updates</h1>
        <p className="text-sm text-gray-400 mt-1">
          Rule changes recorded for this tenant, most recently effective first.
        </p>
        {/* No "last synced" line. The previous one read "Last synced: Apr 7,
            2026" and was a constant; nothing fetches rules from anywhere. */}
        <p className="text-xs text-gray-600 mt-2">
          Recorded in this system — not a feed from the regulators. The same updates appear on the{' '}
          <Link href="/regulatory" className="text-[#C9A84C] hover:underline">
            regulatory intelligence
          </Link>{' '}
          page, where they can be reviewed and marked off.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading regulatory updates…</p>}

      {loadError !== null && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {loadError}
        </p>
      )}

      {!loading && loadError === null && (
        <>
          <div className="flex flex-wrap items-end gap-4 mb-6">
            <div>
              <label
                className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1"
                htmlFor="compliance-regulatory-source"
              >
                Source
              </label>
              <select
                id="compliance-regulatory-source"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
              >
                <option value="all">All sources</option>
                {facets.sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1"
                htmlFor="compliance-regulatory-type"
              >
                Rule type
              </label>
              <select
                id="compliance-regulatory-type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
              >
                <option value="all">All rule types</option>
                {facets.ruleTypes.map((t) => (
                  <option key={t} value={t}>
                    {humanise(t)}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-gray-500 pb-2">
              {filtered.length} update{filtered.length === 1 ? '' : 's'}
              {undated > 0 && ` · ${undated} with no effective date, listed last`}
            </p>
          </div>

          {/* There is no state filter. No column records which jurisdiction a
              rule belongs to, and the six offered before — Federal, CA, NY,
              TX, FL — were part of the same fixture as the rules themselves. */}

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-gray-800 bg-gray-900/40 px-5 py-12 text-center text-sm text-gray-500">
              {alerts.length === 0
                ? 'No regulatory updates recorded.'
                : 'No updates match these filters.'}
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map((alert) => {
                const band = impactBand(alert.impactScore);
                const open = expandedId === alert.id;

                return (
                  <article
                    key={alert.id}
                    className="rounded-xl border border-gray-800 bg-gray-900/40 p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="rounded-full border border-gray-700 px-2 py-0.5 text-2xs text-gray-300">
                        {alert.source}
                      </span>
                      <span className="rounded-full border border-gray-800 px-2 py-0.5 text-2xs text-gray-500">
                        {humanise(alert.ruleType)}
                      </span>
                      {/* An unscored rule is not a low-relevance one. */}
                      {band === null ? (
                        <span className="rounded-full border border-gray-700 px-2 py-0.5 text-2xs text-gray-500">
                          Relevance not scored
                        </span>
                      ) : (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-2xs ${URGENCY_STYLE[band]}`}
                        >
                          {humanise(band)}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-gray-500">
                        Effective {formatDate(alert.effectiveDate)}
                      </span>
                    </div>

                    <h2 className="text-sm font-semibold text-white">{alert.title}</h2>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">{alert.summary}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => {
                          const next = open ? null : alert.id;
                          setExpandedId(next);
                          if (next !== null) loadImpact(alert.id);
                        }}
                        className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-900"
                      >
                        {open ? 'Hide platform impact' : 'Platform impact'}
                      </button>
                      <span className="text-xs text-gray-600">
                        {STATUS_LABEL[alert.status]}
                        {alert.reviewedAt !== null && ` · ${formatDate(alert.reviewedAt)}`}
                      </span>
                    </div>

                    {open && (
                      <div className="mt-4 rounded-lg border border-gray-800 bg-[#071019] p-4">
                        {impactLoading === alert.id ? (
                          <p className="text-xs text-gray-500">Loading…</p>
                        ) : impact[alert.id] == null ? (
                          <p className="text-xs text-gray-500">
                            No impact assessment is available for this rule.
                          </p>
                        ) : (
                          <>
                            {/* Deliberately "platform impact", not "client
                                impact". Each item used to carry a paragraph
                                telling an advisor what their clients must do
                                about a rule; the API assesses which platform
                                modules a rule touches, which is a narrower
                                thing and the one it can support. */}
                            <p className="text-2xs uppercase tracking-wide text-gray-600 mb-2">
                              Modules affected on this platform
                            </p>
                            <p className="text-xs text-gray-400">{impact[alert.id]?.rationale}</p>

                            {(impact[alert.id]?.affectedModules.length ?? 0) > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {impact[alert.id]?.affectedModules.map((m) => (
                                  <span
                                    key={m}
                                    className="rounded border border-gray-800 bg-gray-900 px-2 py-0.5 text-2xs text-gray-400"
                                  >
                                    {humanise(m)}
                                  </span>
                                ))}
                              </div>
                            )}

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

                            <p className="mt-3 text-2xs text-gray-600 leading-relaxed">
                              What a given client must do about this rule is not assessed here.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
