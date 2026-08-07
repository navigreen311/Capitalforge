'use client';
import { getStoredUserId } from '@/lib/session-storage';

// ============================================================
// /comm-compliance — Communication compliance
//
// This page called nothing. Its worst fixture was a QA scorecard naming four
// advisors and scoring them:
//
//   Alex Torres   compliance 70   script adherence 75   consent 68   ↓
//   Casey Rivera  compliance 84   script adherence 78   consent 80   →
//
// That is a performance record about a named person, with a trend arrow.
// Nobody scored those calls. Beside it sat five approved scripts with
// approvers written in, a list of reviewers with job titles, and a
// banned-claims scanner that ran a regex in the browser.
//
// The real ones were mounted the whole time:
//   POST /api/comm-compliance/scan      — server-side scan, per channel
//   GET  /api/scripts                   — the script library
//   GET  /api/advisors/:id/qa-scores    — scored calls for one advisor
//
// The team scorecard is gone and not replaced. QA scores are recorded per
// call against an advisor id, and no endpoint lists advisors — so a
// scorecard across the team cannot be assembled from this API at all. One
// advisor's scored calls can, given the id, and that is what is offered.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  toScanResult,
  toScriptRows,
  toQaScoreRows,
  summariseScripts,
  summariseQaScores,
  byScoredAtDesc,
  scriptCategories,
  humanise,
  CHANNELS,
  type Channel,
  type ScanResult,
  type ScriptRow,
  type QaScoreRow,
  type RiskLevel,
} from '@/lib/comm-compliance-view';
import { loadJson, toLoadError } from '@/lib/load-json';

type TabKey = 'scan' | 'scripts' | 'qa';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'scan', label: 'Scan' },
  { key: 'scripts', label: 'Script Library' },
  { key: 'qa', label: 'Call QA' },
];

const RISK_STYLE: Record<RiskLevel, string> = {
  critical: 'border-red-700 bg-red-900/20 text-red-200',
  high: 'border-orange-700 bg-orange-900/20 text-orange-200',
  medium: 'border-yellow-700 bg-yellow-900/20 text-yellow-200',
  low: 'border-green-700 bg-green-900/20 text-green-200',
};

/** The signed-in user, as the login stored it. */
function currentUser(): { id: string } | null {
  // Was its own parse of `cf_user`. Three components each had one, with three
  // ideas of the payload and two levels of validation.
  const id = getStoredUserId();
  return id === null ? null : { id };
}

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default function CommCompliancePage() {
  const [tab, setTab] = useState<TabKey>('scan');

  // ── Scan ──
  const [draft, setDraft] = useState('');
  const [channel, setChannel] = useState<Channel>('email');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // ── Scripts ──
  const [scripts, setScripts] = useState<ScriptRow[]>([]);
  const [scriptsError, setScriptsError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── QA ──
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [advisorId, setAdvisorId] = useState('');
  const [qaScores, setQaScores] = useState<QaScoreRow[] | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);

  // Read after mount: localStorage is not available while rendering on the
  // server, and reading it during render makes the two disagree.
  useEffect(() => {
    const user = currentUser();
    setMe(user);
    if (user !== null) setAdvisorId((prev) => (prev === '' ? user.id : prev));
  }, []);

  const loadScripts = useCallback(async () => {
    setLoading(true);
    setScriptsError(null);
    try {
      setScripts(toScriptRows(await loadJson<unknown>('/api/scripts')));
    } catch (e) {
      setScriptsError(`The script library could not be loaded. ${toLoadError(e).message}`);
      setScripts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScripts();
  }, [loadScripts]);

  const runScan = useCallback(async () => {
    if (me === null) {
      setScanError('You are not signed in, so the scan cannot be attributed to anyone.');
      return;
    }
    setScanning(true);
    setScanError(null);
    setScan(null);
    try {
      // Scanned as the signed-in user. The endpoint records who ran it, and
      // that is the only advisor id this page can know: nothing lists them.
      const data = await loadJson<unknown>('/api/comm-compliance/scan', {
        method: 'POST',
        body: { advisorId: me.id, channel, content: draft },
      });
      setScan(toScanResult(data));
    } catch (e) {
      setScanError(`Nothing was scanned. ${toLoadError(e).message}`);
    } finally {
      setScanning(false);
    }
  }, [draft, channel, me]);

  const loadQa = useCallback(async () => {
    const id = advisorId.trim();
    if (id === '') return;
    setQaLoading(true);
    setQaError(null);
    setQaScores(null);
    try {
      const data = await loadJson<unknown>(`/api/advisors/${encodeURIComponent(id)}/qa-scores`);
      setQaScores(toQaScoreRows(data));
    } catch (e) {
      // qaScores stays null rather than becoming an empty list: a failed read
      // must not render as "this advisor has no QA scores".
      setQaError(`No scores could be read for that advisor. ${toLoadError(e).message}`);
    } finally {
      setQaLoading(false);
    }
  }, [advisorId]);

  const scriptSummary = useMemo(() => summariseScripts(scripts), [scripts]);
  const categories = useMemo(() => scriptCategories(scripts), [scripts]);
  const visibleScripts = useMemo(
    () => (categoryFilter === 'all' ? scripts : scripts.filter((s) => s.category === categoryFilter)),
    [scripts, categoryFilter],
  );

  const qaSummary = useMemo(
    () => (qaScores === null ? null : summariseQaScores(qaScores)),
    [qaScores],
  );

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Communication Compliance</h1>
        <p className="text-sm text-gray-400 mt-1">
          What an advisor is cleared to say, what a scan makes of a draft, and how calls scored.
        </p>
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

      {/* ── Scan ── */}
      {tab === 'scan' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
            <h2 className="text-base font-semibold text-gray-200 mb-1">Scan a draft</h2>
            <p className="text-xs text-gray-500 mb-4">
              Checked on the server, against the banned-claim rules it holds. The previous version
              ran a regex in the browser, so what it flagged and what the platform flags could
              differ.
            </p>

            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div>
                <label htmlFor="scan-channel" className="block text-xs text-gray-400 mb-1">
                  Channel
                </label>
                <select
                  id="scan-channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as Channel)}
                  className="rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm px-3 py-2"
                >
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {humanise(c)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-600 pb-2">
                {me === null
                  ? 'Not signed in.'
                  : 'Recorded against you, as the person running the scan.'}
              </p>
            </div>

            <label htmlFor="scan-draft" className="block text-xs text-gray-400 mb-1">
              Draft
            </label>
            <textarea
              id="scan-draft"
              rows={5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste what you are about to send…"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
            />

            <button
              onClick={runScan}
              disabled={scanning || draft.trim() === '' || me === null}
              className="mt-3 rounded-lg bg-[#C9A84C] px-4 py-2 text-sm font-semibold text-[#0A1628] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {scanning ? 'Scanning…' : 'Scan'}
            </button>

            {scanError !== null && (
              <p className="mt-3 rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                {scanError}
              </p>
            )}
          </div>

          {scan !== null && (
            <div className={`rounded-xl border px-5 py-4 ${RISK_STYLE[scan.riskLevel]}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">
                  {humanise(scan.riskLevel)} risk
                  {scan.riskScore !== null && (
                    <span className="ml-2 opacity-80">score {scan.riskScore}</span>
                  )}
                </p>
                <p className="text-xs opacity-80">
                  {scan.violations.length} finding{scan.violations.length === 1 ? '' : 's'}
                </p>
              </div>

              {scan.violations.length === 0 ? (
                <p className="text-xs mt-2 opacity-90">
                  Nothing matched the banned-claim rules. That is not an approval of the wording.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {scan.violations.map((v) => (
                    <li
                      key={`${v.claimId}-${v.position ?? 0}`}
                      className="rounded-lg bg-black/20 p-3"
                    >
                      <p className="text-sm font-semibold">{v.label}</p>
                      <p className="text-xs mt-1 font-mono opacity-90">
                        &ldquo;{v.evidence}&rdquo;
                      </p>
                      {v.legalCitation !== null && (
                        <p className="text-2xs mt-2 opacity-75">{v.legalCitation}</p>
                      )}
                      {v.compliantAlternative !== null && (
                        <p className="text-xs mt-2">
                          <span className="opacity-75">Instead: </span>
                          {v.compliantAlternative}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Why the citations stop at the statute. */}
          <p className="text-xs text-gray-600 leading-relaxed">
            Findings cite the statute or rule. The scanner also carries an enforcement example per
            rule, which is not shown: one of them names a company that appears elsewhere in this
            codebase as an explicitly stubbed vendor, so the set cannot be relied on as precedent.
          </p>
        </div>
      )}

      {/* ── Scripts ── */}
      {tab === 'scripts' && (
        <div className="space-y-4">
          {loading && <p className="text-sm text-gray-500">Loading scripts…</p>}

          {scriptsError !== null && (
            <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              {scriptsError}
            </p>
          )}

          {!loading && scriptsError === null && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Kpi label="Scripts in use" value={String(scriptSummary.total)} />
                <Kpi
                  label="Without a recorded approver"
                  value={String(scriptSummary.unapproved)}
                  note={
                    scriptSummary.unapproved === 0
                      ? 'every script has one'
                      : 'in use, never signed off'
                  }
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">Category:</span>
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    categoryFilter === 'all'
                      ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]'
                      : 'border-gray-800 text-gray-400'
                  }`}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      categoryFilter === c
                        ? 'border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]'
                        : 'border-gray-800 text-gray-400'
                    }`}
                  >
                    {humanise(c)}
                  </button>
                ))}
              </div>

              {visibleScripts.length === 0 ? (
                <p className="rounded-xl border border-gray-800 bg-gray-900/40 px-5 py-10 text-center text-sm text-gray-500">
                  {scripts.length === 0 ? 'No script is in use.' : 'No script in this category.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {visibleScripts.map((s) => {
                    const open = expandedScript === s.id;
                    return (
                      <div
                        key={s.id}
                        className="rounded-xl border border-gray-800 bg-gray-900/40 p-5"
                      >
                        <button
                          onClick={() => setExpandedScript(open ? null : s.id)}
                          className="w-full text-left"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-100">{s.name}</p>
                              <p className="text-2xs text-gray-600">
                                {humanise(s.category)} · v{s.version}
                              </p>
                            </div>
                            {s.approvedBy === null ? (
                              // Never a role name standing in for a person.
                              <span className="rounded-full border border-yellow-700 bg-yellow-900/30 px-2 py-0.5 text-2xs text-yellow-300">
                                No recorded approver
                              </span>
                            ) : (
                              <span className="rounded-full border border-green-700 bg-green-900/30 px-2 py-0.5 text-2xs text-green-300">
                                Approved {formatDate(s.approvedAt)}
                              </span>
                            )}
                          </div>
                        </button>

                        {open && (
                          <>
                            <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-gray-800 bg-[#071019] p-3 text-xs text-gray-300 font-mono">
                              {s.content}
                            </pre>
                            {s.approvedBy === null && (
                              <p className="mt-2 text-2xs text-gray-600">
                                This script is active and being read from, and no approval is
                                recorded against it.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-xs text-gray-600 leading-relaxed">
                The library shows active scripts only — the endpoint returns nothing else, so a
                draft awaiting approval is not visible here.
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Call QA ── */}
      {tab === 'qa' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
            <h2 className="text-base font-semibold text-gray-200 mb-1">Scored calls</h2>
            <p className="text-xs text-gray-500 mb-4">
              QA scores are recorded per call, against an advisor id.
            </p>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[280px]">
                <label htmlFor="qa-advisor" className="block text-xs text-gray-400 mb-1">
                  Advisor id
                </label>
                <input
                  id="qa-advisor"
                  value={advisorId}
                  onChange={(e) => setAdvisorId(e.target.value)}
                  placeholder="advisor uuid"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 font-mono"
                />
              </div>
              <button
                onClick={loadQa}
                disabled={qaLoading || advisorId.trim() === ''}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-200 disabled:opacity-40"
              >
                {qaLoading ? 'Loading…' : 'Show scores'}
              </button>
            </div>

            {/* The scorecard that was here, and why it is not. */}
            <p className="text-2xs text-gray-600 mt-3 leading-relaxed">
              An id has to be typed because no endpoint lists advisors. This page used to show a
              scorecard for the whole team — four named advisors with an overall score, a call
              count and a trend arrow — and none of it was recorded anywhere. A team view needs an
              advisor directory the API does not have.
            </p>
          </div>

          {qaError !== null && (
            <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              {qaError}
            </p>
          )}

          {qaScores !== null && qaSummary !== null && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Kpi label="Calls scored" value={String(qaSummary.scored)} />
                <Kpi
                  label="Mean overall"
                  value={qaSummary.averageOverall === null ? '—' : String(qaSummary.averageOverall)}
                  note="across the calls reviewed"
                />
                <Kpi label="Last scored" value={formatDate(qaSummary.lastScoredAt)} />
              </div>

              {qaScores.length === 0 ? (
                <p className="rounded-xl border border-gray-800 bg-gray-900/40 px-5 py-10 text-center text-sm text-gray-500">
                  No call has been scored for that advisor.
                </p>
              ) : (
                <div className="rounded-xl border border-gray-800 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Scored</th>
                        <th className="px-4 py-3 text-right">Overall</th>
                        <th className="px-4 py-3 text-right">Compliance</th>
                        <th className="px-4 py-3 text-right">Script</th>
                        <th className="px-4 py-3 text-right">Consent</th>
                        <th className="px-4 py-3 text-left">Feedback</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {byScoredAtDesc(qaScores).map((s) => (
                        <tr key={s.id}>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {formatDate(s.scoredAt)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-200 font-semibold">
                            {s.overallScore}
                          </td>
                          {/* Dashes, not zeroes: a dimension nobody scored is
                              not a zero on that dimension. */}
                          <td className="px-4 py-3 text-right text-gray-400">
                            {s.complianceScore ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400">
                            {s.scriptAdherence ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400">
                            {s.consentCapture ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {s.feedback ?? <span className="text-gray-600">none recorded</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-xs text-gray-600 leading-relaxed">
                These are the calls that were reviewed, not a rating of the advisor. There is no
                trend: nothing records one, and a handful of scored calls is not a direction of
                travel.
              </p>
            </>
          )}
        </div>
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
