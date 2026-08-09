'use client';

// ============================================================
// /platform/issuers — issuer reference data
//
// The presentation is the one this page always had: dark surface, logos,
// grouped under Major Banks and Credit Unions with counts, a filter toggle,
// and a row expander. What changed is the columns.
//
// It used to show Approval Rate, Total Apps, Approved, Declined and Avg
// Limit, plus a Credit Unions card averaging them. Those came from
// ISSUERS_DATA, a literal of fourteen issuers in a route file — Chase alone
// reported more applications than this system has ever held. They described
// no tenant, and they rendered in the same table, same weight, as data read
// from the database.
//
// The columns are now the rule data, from issuers and issuer_rules: how many
// rules an issuer has, how many carry a source, and when one was last
// verified. The expander shows the rules themselves with their sourceUrl and
// lastVerified, which is the capability the old page had no way to express.
//
// The dark surface is supplied here, by this file. There is no
// platform/layout.tsx, and the app shell is light — .cf-card is bg-white. A
// rewrite of this page that dropped the wrapper left every dark-palette text
// class on a light background, which is what "washed-out grey on grey" was.
//
// The DNA flag is gone: it was `doNotApply: true` with a literal reason,
// never derived. See docs/backlog/issuer-dna-flag-derivation.md.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { loadJson, toLoadError, type AuthFetchError } from '@/lib/load-json';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';

// ── Types ────────────────────────────────────────────────────
//
// Optional exactly where the API may omit it. The previous interface declared
// velocityRulesList, approvalCriteriaDetail, declineReasons and dnaDetail as
// required while the API sent none of them, so `velocityRulesList.length`
// type-checked and threw on every row expansion.

interface IssuerRule {
  id: string;
  ruleType: string;
  name: string;
  description: string | null;
  value: number | null;
  periodDays: number | null;
  severity: string;
  /** A citation that is a URL. Rendered as a link. */
  sourceUrl: string | null;
  /**
   * A citation that is not a URL — a published document, a registry entry.
   * Rendered as text. A rule carrying either one is sourced, which is why
   * "sourced" is counted with hasSource() rather than on sourceUrl alone.
   */
  sourceNote: string | null;
  /** When it was last checked. Null means never, not "recently". */
  lastVerified: string | null;
}

interface Issuer {
  id: string;
  name: string;
  slug: string;
  issuerType: string;
  logoUrl: string | null;
  phoneRecon: string | null;
  notes: string | null;
  rules: IssuerRule[];
}

type FilterMode = 'all' | 'bank' | 'credit_union';

interface IssuerCounts {
  slug: string;
  applications: number;
  approved: number;
  declined: number;
  pending: number;
}

interface CountsResponse {
  minDecidedForRate: number;
  byIssuer: IssuerCounts[];
  unmatched: { issuer: string; count: number }[];
  notInDirectory: { registryId: string; count: number }[];
  totals: { counted: number; placed: number; unmatched: number; notInDirectory: number };
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Presentation only. Issuer.logoUrl is null for every row, and an emoji is a
 * label rather than a claim about the issuer, so it is kept here rather than
 * written into the table.
 */
const LOGO: Record<string, string> = {
  chase: '🏦',
  'american-express': '💳',
  'capital-one': '🏛️',
  citi: '🏢',
  'bank-of-america': '🏦',
  'us-bank': '🏛️',
  'wells-fargo': '🏦',
};

function logoFor(issuer: Issuer): string {
  return LOGO[issuer.slug] ?? (issuer.issuerType === 'credit_union' ? '🤝' : '🏦');
}

function formatDate(iso: string | null): string | null {
  if (iso === null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysSince(iso: string | null): number | null {
  if (iso === null) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** The most recent verification across an issuer's rules, or null if none. */
function lastVerifiedOf(issuer: Issuer): string | null {
  const dates = issuer.rules
    .map((r) => r.lastVerified)
    .filter((d): d is string => d !== null)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1]! : null;
}

/** A URL citation or a prose citation. Either one is a source. */
function hasSource(rule: IssuerRule): boolean {
  return rule.sourceUrl !== null || rule.sourceNote !== null;
}

function sourcedCount(issuer: Issuer): number {
  return issuer.rules.filter(hasSource).length;
}

// ── Rule provenance ──────────────────────────────────────────

function Provenance({ rule }: { rule: IssuerRule }): React.JSX.Element {
  const verified = formatDate(rule.lastVerified);
  const age = daysSince(rule.lastVerified);
  const stale = age !== null && age > 365;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      {rule.sourceUrl !== null ? (
        <a
          href={rule.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline"
          data-testid="rule-source"
        >
          Source
        </a>
      ) : rule.sourceNote !== null ? (
        <span className="text-gray-400" data-testid="rule-source-note" title={rule.sourceNote}>
          {rule.sourceNote}
        </span>
      ) : (
        <span className="text-amber-400" data-testid="rule-unsourced">
          No source recorded
        </span>
      )}

      {verified !== null ? (
        <span className={stale ? 'text-amber-400' : 'text-gray-500'} data-testid="rule-verified">
          Verified {verified}
          {stale ? ` — over a year ago` : ''}
        </span>
      ) : (
        <span className="text-amber-400">Never verified</span>
      )}
    </span>
  );
}

// ── Expanded rule list ───────────────────────────────────────

function RulesPanel({ issuer }: { issuer: Issuer }): React.JSX.Element {
  return (
    <td colSpan={5} className="bg-gray-900/40 px-6 py-4">
      {issuer.rules.length === 0 ? (
        <p className="text-sm text-gray-400">
          No rules are recorded for {issuer.name}. That is the state of the table, not a statement
          that this issuer has no rules.
        </p>
      ) : (
        <ul className="space-y-2">
          {issuer.rules.map((rule) => {
            const quantity =
              rule.value !== null && rule.periodDays !== null
                ? `${String(rule.value)} per ${String(rule.periodDays)} days`
                : rule.value !== null
                  ? String(rule.value)
                  : null;

            return (
              <li
                key={rule.id}
                className="rounded-lg border border-gray-700/40 bg-gray-800/50 px-3 py-2.5"
                data-testid="issuer-rule"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-gray-100">{rule.name}</span>
                  <span
                    className={
                      rule.severity === 'hard'
                        ? 'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-red-900/50 text-red-300'
                        : 'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-gray-700 text-gray-300'
                    }
                  >
                    {rule.severity}
                  </span>
                  {quantity !== null && (
                    <span className="text-xs font-semibold text-[#C9A84C]">{quantity}</span>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-gray-600">{rule.ruleType}</span>
                </div>

                {rule.description !== null && rule.description !== '' && (
                  <p className="mt-1 text-sm text-gray-400">{rule.description}</p>
                )}

                <div className="mt-1.5">
                  <Provenance rule={rule} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(issuer.phoneRecon !== null || issuer.notes !== null) && (
        <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-800 pt-3 sm:grid-cols-2">
          {issuer.phoneRecon !== null && (
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-gray-500">Reconsideration line</dt>
              <dd className="text-sm text-gray-200">{issuer.phoneRecon}</dd>
            </div>
          )}
          {issuer.notes !== null && (
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-gray-500">Notes</dt>
              <dd className="text-sm text-gray-200">{issuer.notes}</dd>
            </div>
          )}
        </dl>
      )}
    </td>
  );
}

// ── Issuer row ───────────────────────────────────────────────

function IssuerRow({ issuer }: { issuer: Issuer }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const sourced = sourcedCount(issuer);
  const verified = lastVerifiedOf(issuer);
  const verifiedLabel = formatDate(verified);
  const age = daysSince(verified);
  const stale = age !== null && age > 365;

  return (
    <>
      <tr
        onClick={() => { setExpanded(!expanded); }}
        className="border-t border-gray-800 hover:bg-gray-800/40 cursor-pointer"
        data-testid={`issuer-row-${issuer.slug}`}
      >
        <td className="px-6 py-3">
          <span className="flex items-center gap-2">
            <span aria-hidden="true">{logoFor(issuer)}</span>
            <span className="font-medium text-white">{issuer.name}</span>
          </span>
        </td>
        <td className="px-6 py-3 text-gray-300">{issuer.rules.length}</td>
        <td className="px-6 py-3">
          {issuer.rules.length === 0 ? (
            <span className="text-gray-600">—</span>
          ) : (
            <span className={sourced < issuer.rules.length ? 'text-amber-400' : 'text-gray-300'}>
              {sourced} of {issuer.rules.length}
            </span>
          )}
        </td>
        <td className="px-6 py-3">
          {verifiedLabel === null ? (
            <span className="text-amber-400">Never</span>
          ) : (
            <span className={stale ? 'text-amber-400' : 'text-gray-300'}>{verifiedLabel}</span>
          )}
        </td>
        <td className="px-6 py-3 text-right">
          <span
            className={`inline-block text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            ▾
          </span>
        </td>
      </tr>
      {expanded && <tr><RulesPanel issuer={issuer} /></tr>}
    </>
  );
}

// ── Group ────────────────────────────────────────────────────

function Group({ title, issuers }: { title: string; issuers: Issuer[] }): React.JSX.Element {
  return (
    <>
      <tr className="bg-gray-900/70">
        <td colSpan={5} className="px-6 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {title} ({issuers.length})
        </td>
      </tr>
      {issuers.length === 0 ? (
        <tr className="border-t border-gray-800">
          <td colSpan={5} className="px-6 py-3 text-sm text-gray-500">
            None recorded. The issuers table holds no {title.toLowerCase()} — nothing is hidden by
            a filter.
          </td>
        </tr>
      ) : (
        issuers.map((i) => <IssuerRow key={i.id} issuer={i} />)
      )}
    </>
  );
}

// ── Our book ─────────────────────────────────────────────────
//
// Deliberately a different surface from the rules table above: this is what
// this tenant has placed, not reference data about issuers, and the two must
// not read alike. It is where the deleted volume figures would try to come
// back, so it states its own scope and its own arithmetic.

function CountsSection({ counts, issuers }: { counts: CountsResponse; issuers: Issuer[] }): React.JSX.Element {
  const nameFor = (slug: string): string => issuers.find((i) => i.slug === slug)?.name ?? slug;
  const rows = [...counts.byIssuer].sort((a, b) => b.applications - a.applications);
  const { totals } = counts;

  return (
    <section
      aria-label="Applications placed"
      data-testid="counts-section"
      className="rounded-xl border border-blue-900/50 bg-blue-950/10 p-5 space-y-4"
    >
      <div>
        <h2 className="text-sm font-semibold text-gray-100">Applications this tenant has placed</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
          Our book, not market data. No other tenant&rsquo;s applications are counted, and nothing
          here says how an issuer treats applicants generally.
        </p>
      </div>

      {/* The arithmetic, on the page rather than only in the code: a future
          silent drop is then legible instead of a total quietly running short. */}
      <p className="text-xs text-gray-500" data-testid="counts-reconciliation">
        {totals.counted} application{totals.counted === 1 ? '' : 's'}: {totals.placed} matched to an
        issuer, {totals.unmatched} unmatched, {totals.notInDirectory} not in the directory.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No applications on record.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-gray-500">
                <th scope="col" className="py-2 pr-4 font-semibold">Issuer</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Applications</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Decided</th>
                <th scope="col" className="py-2 font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const decided = r.approved + r.declined;
                return (
                  <tr key={r.slug} className="border-t border-gray-800" data-testid={`counts-${r.slug}`}>
                    <th scope="row" className="py-2 pr-4 text-left font-normal text-gray-200">
                      {nameFor(r.slug)}
                    </th>
                    <td className="py-2 pr-4 text-gray-300">{r.applications}</td>
                    <td className="py-2 pr-4 text-gray-300">{decided}</td>
                    <td className="py-2 text-gray-300">
                      {/* Always the denominator, never a bare percentage. At
                          n=1 a rate reads identically to one from n=200. */}
                      {r.approved} of {r.applications} approved
                      {r.declined > 0 && <span className="text-gray-500"> · {r.declined} declined</span>}
                      {r.pending > 0 && <span className="text-gray-500"> · {r.pending} pending</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {counts.unmatched.length > 0 && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-900/10 px-4 py-3" data-testid="counts-unmatched">
          <p className="text-xs font-semibold text-amber-300">Unmatched issuer names</p>
          <p className="mt-1 text-xs text-amber-200/80">
            These application records name an issuer the registry does not recognise, so they are
            counted here rather than dropped.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {counts.unmatched.map((u) => (
              <li key={u.issuer} className="text-xs text-gray-300">
                &ldquo;{u.issuer}&rdquo; — {u.count}
              </li>
            ))}
          </ul>
        </div>
      )}

      {counts.notInDirectory.length > 0 && (
        <div className="rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-3" data-testid="counts-not-in-directory">
          <p className="text-xs font-semibold text-gray-200">Known issuers not in the directory</p>
          <p className="mt-1 text-xs text-gray-400">
            The name resolves to an issuer the registry knows, and no row for it exists in the
            issuers table. Adding it would move these into the table above.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {counts.notInDirectory.map((n) => (
              <li key={n.registryId} className="text-xs text-gray-300">
                <span className="font-mono">{n.registryId}</span> — {n.count}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-500">
        No approval rate is shown for an issuer with fewer than {counts.minDecidedForRate} decided
        applications: below that, one decision moves the rate by five points or more. Average
        approved limit is not shown at all — the limit granted has only just started being
        recorded, and the older column holds the amount requested at draft, which sits on declined
        applications too.
      </p>
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function IssuersPage(): React.JSX.Element {
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [counts, setCounts] = useState<CountsResponse | null>(null);
  const [error, setError] = useState<AuthFetchError | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<FilterMode>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, countData] = await Promise.all([
        loadJson<Issuer[] | null>('/api/platform/issuers'),
        loadJson<CountsResponse | null>('/api/platform/issuers/application-counts'),
      ]);
      setIssuers(data ?? []);
      setCounts(countData ?? null);
      setError(null);
    } catch (e) {
      setError(toLoadError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const banks = useMemo(() => issuers.filter((i) => i.issuerType === 'bank'), [issuers]);
  const cus = useMemo(() => issuers.filter((i) => i.issuerType === 'credit_union'), [issuers]);

  const totalRules = issuers.reduce((n, i) => n + i.rules.length, 0);
  const totalSourced = issuers.reduce((n, i) => n + sourcedCount(i), 0);
  const unsourced = totalRules - totalSourced;

  if (error !== null) {
    return (
      <div className="min-h-screen bg-[#0A1628] px-6 py-8">
        <DashboardErrorState error={error} onRetry={() => void load()} variant="dark" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-200 px-6 py-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Issuer Directory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Velocity rules and approval criteria by issuer, with the source and verification date
            recorded for each.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {([['all', 'Show All'], ['bank', 'Banks Only'], ['credit_union', 'Credit Unions Only']] as [FilterMode, string][]).map(
            ([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); }}
                className={
                  mode === m
                    ? 'rounded-lg border border-[#C9A84C] bg-[#C9A84C]/10 px-3 py-1.5 text-xs font-medium text-[#C9A84C]'
                    : 'rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200'
                }
              >
                {label}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
          <p className="text-xs uppercase text-gray-500">Issuers</p>
          <p className="mt-1 text-2xl font-bold text-white">{issuers.length}</p>
        </div>
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
          <p className="text-xs uppercase text-gray-500">Rules recorded</p>
          <p className="mt-1 text-2xl font-bold text-white">{totalRules}</p>
        </div>
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-4">
          <p className="text-xs uppercase text-gray-500">With a source</p>
          <p className="mt-1 text-2xl font-bold text-white">{totalSourced}</p>
        </div>
        <div
          className={
            unsourced > 0
              ? 'rounded-xl border border-amber-700/50 bg-amber-900/10 p-4'
              : 'rounded-xl border border-gray-700/60 bg-gray-900/60 p-4'
          }
        >
          <p className="text-xs uppercase text-gray-500">Without a source</p>
          <p
            className={unsourced > 0 ? 'mt-1 text-2xl font-bold text-amber-400' : 'mt-1 text-2xl font-bold text-white'}
            data-testid="unsourced-count"
          >
            {unsourced}
          </p>
        </div>
      </div>

      <section
        aria-label="What this page shows"
        className="rounded-xl border border-gray-700/60 bg-gray-900/60 p-5"
      >
        <h2 className="text-sm font-semibold text-gray-200">What this page shows</h2>
        <p className="mt-2 text-xs leading-relaxed text-gray-400">
          Reference data about issuers, from the issuers and issuer_rules tables. It is not about
          your clients: there are no application counts, approval rates or credit limits here,
          because this system holds none per issuer that would mean anything.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-gray-400">
          It used to show them, from a literal in a route file, beside a client list read from the
          database and rendered identically — application totals two orders of magnitude above
          everything this system has ever recorded. Those figures are not repeated here.
        </p>
      </section>

      {counts !== null && <CountsSection counts={counts} issuers={issuers} />}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-900">
              <tr className="text-xs uppercase tracking-wider text-gray-500">
                <th scope="col" className="px-6 py-3 font-semibold">Issuer</th>
                <th scope="col" className="px-6 py-3 font-semibold">Rules</th>
                <th scope="col" className="px-6 py-3 font-semibold">Sourced</th>
                <th scope="col" className="px-6 py-3 font-semibold">Last verified</th>
                <th scope="col" className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {(mode === 'all' || mode === 'bank') && <Group title="Major Banks" issuers={banks} />}
              {(mode === 'all' || mode === 'credit_union') && (
                <Group title="Credit Unions" issuers={cus} />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
