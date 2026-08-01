'use client';

// ============================================================
// /disclosures — Disclosure CMS
//
// This page called nothing. Nine templates were literals, each with a version
// number, an author, and an approvedBy:
//
//   Adverse Action Notice   v1.5   Approved   approvedBy: GC
//   ECOA Rights — English   v2.1   Approved   approvedBy: CCO
//   FCRA Summary of Rights  v2.0   Approved   approvedBy: CCO
//
// Those are approval records. A disclosure is the text a client is handed to
// satisfy a legal obligation, and "approved by the CCO" asserts that somebody
// accountable signed it off. Nobody had. A version history with named authors
// and change summaries sat behind two of them, invented the same way.
//
// It also offered "Send to N Clients" against a list of five made-up firms,
// with delivery-channel checkboxes and no endpoint behind the button — on
// text whose delivery is itself the compliance act.
//
// The CMS was there the whole time:
//   GET  /api/disclosures/templates              — list, filterable
//   GET  /api/disclosures/templates/:id/history  — real version history
//   POST /api/disclosures/templates/:id/submit   — draft → pending review
//   POST /api/disclosures/templates/:id/approve  — records who approved it
//   POST /api/disclosures/render                 — fill a template's variables
//
// Rendering is refused by the API unless a template is approved and active.
// That control is now visible rather than rendered around.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  toDisclosureTemplates,
  renderability,
  missingVariables,
  summariseTemplates,
  templateFacets,
  wordCount,
  humanise,
  type DisclosureTemplateRow,
  type TemplateStatus,
} from '@/lib/disclosure-view';

const STATUS_STYLE: Record<TemplateStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-gray-800 text-gray-400 border-gray-700' },
  pending_review: {
    label: 'Pending review',
    cls: 'bg-yellow-900 text-yellow-300 border-yellow-700',
  },
  approved: { label: 'Approved', cls: 'bg-green-900 text-green-300 border-green-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-900 text-red-300 border-red-700' },
  superseded: { label: 'Superseded', cls: 'bg-gray-800 text-gray-500 border-gray-700' },
};

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
  return token === null ? {} : { Authorization: `Bearer ${token}` };
}

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default function DisclosuresPage() {
  const [templates, setTemplates] = useState<DisclosureTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const [stateFilter, setStateFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [history, setHistory] = useState<DisclosureTemplateRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [context, setContext] = useState<Record<string, string>>({});
  const [rendered, setRendered] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Paged by limit and offset, capped at 100 by the API, and the envelope
      // reports how many came back rather than how many exist. So: read until
      // a page comes back short. Without this the library would silently be
      // its own first 50 rows, and a disclosure that exists would look absent.
      const PAGE = 100;
      const MAX_PAGES = 20;
      const collected: DisclosureTemplateRow[] = [];
      let truncated = false;

      for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
        const res = await fetch(
          `/api/disclosures/templates?limit=${PAGE}&offset=${pageIndex * PAGE}`,
          { headers: authHeaders() },
        );
        if (!res.ok) {
          if (pageIndex === 0) {
            setLoadError(`The disclosure library could not be loaded (HTTP ${res.status}).`);
            setTemplates([]);
            return;
          }
          // A later page failing loses rows, which must not read as an empty
          // shelf.
          truncated = true;
          break;
        }

        const body = (await res.json()) as { success?: boolean; data?: unknown };
        const batch = body.success === true ? toDisclosureTemplates(body.data) : [];
        collected.push(...batch);

        if (batch.length < PAGE) break;
        if (pageIndex === MAX_PAGES - 1) truncated = true;
      }

      setTemplates(collected);
      setTruncated(truncated);
    } catch {
      setLoadError('Could not reach the server. No disclosure templates are shown.');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  // Reset the render form whenever a different template is opened, so values
  // typed for one are never submitted against another.
  useEffect(() => {
    setContext({});
    setRendered(null);
    setHistory(null);
    setActionError(null);
  }, [selectedId]);

  const loadHistory = useCallback(async (id: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/disclosures/templates/${encodeURIComponent(id)}/history`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        setHistory([]);
        return;
      }
      const body = (await res.json()) as { success?: boolean; data?: unknown };
      setHistory(body.success === true ? toDisclosureTemplates(body.data) : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const act = useCallback(
    async (id: string, action: 'submit' | 'approve') => {
      setBusy(true);
      setActionError(null);
      try {
        const res = await fetch(
          `/api/disclosures/templates/${encodeURIComponent(id)}/${action}`,
          {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
        );
        const body = (await res.json()) as { success?: boolean; error?: { message?: string } };
        if (!res.ok || body.success !== true) {
          setActionError(
            body.error?.message ??
              `The template was not ${action === 'submit' ? 'submitted' : 'approved'} (HTTP ${res.status}).`,
          );
          return;
        }
        showToast(action === 'submit' ? 'Submitted for review.' : 'Approval recorded.');
        await load();
      } catch {
        setActionError('Could not reach the server. Nothing was changed.');
      } finally {
        setBusy(false);
      }
    },
    [load, showToast],
  );

  const render = useCallback(
    async (template: DisclosureTemplateRow) => {
      setBusy(true);
      setActionError(null);
      setRendered(null);
      try {
        const res = await fetch('/api/disclosures/render', {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: template.id, context }),
        });
        const body = (await res.json()) as {
          success?: boolean;
          data?: unknown;
          error?: { message?: string };
        };
        if (!res.ok || body.success !== true) {
          setActionError(body.error?.message ?? `Nothing was rendered (HTTP ${res.status}).`);
          return;
        }
        const data = body.data as { rendered?: string; content?: string } | undefined;
        setRendered(data?.rendered ?? data?.content ?? '');
      } catch {
        setActionError('Could not reach the server. Nothing was rendered.');
      } finally {
        setBusy(false);
      }
    },
    [context],
  );

  const summary = useMemo(() => summariseTemplates(templates), [templates]);
  const facets = useMemo(() => templateFacets(templates), [templates]);

  const filtered = useMemo(
    () =>
      templates.filter(
        (t) =>
          (stateFilter === 'all' || t.state === stateFilter) &&
          (categoryFilter === 'all' || t.category === categoryFilter),
      ),
    [templates, stateFilter, categoryFilter],
  );

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6 space-y-6">
      {toast !== null && (
        <div className="fixed top-6 right-6 z-50 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-200 shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-white">Disclosure Templates</h1>
        <p className="text-sm text-gray-400 mt-1">
          The text issued to clients, and where each version stands in review.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading disclosure templates…</p>}

      {loadError !== null && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {loadError}
        </p>
      )}

      {!loading && loadError === null && (
        <>
          {truncated && (
            <p className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-xs text-yellow-300">
              Not every disclosure could be loaded, so the library below is incomplete.
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Templates" value={String(summary.total)} />
            <Kpi
              label="Approved"
              value={String(summary.approved)}
              note={
                summary.approvedButInactive > 0
                  ? `${summary.approvedButInactive} not active, so not issuable`
                  : 'all active'
              }
            />
            <Kpi label="Awaiting review" value={String(summary.awaitingReview)} />
            <Kpi label="Drafts" value={String(summary.drafts)} />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                htmlFor="disclosure-state"
                className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1"
              >
                State
              </label>
              <select
                id="disclosure-state"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm px-3 py-2"
              >
                <option value="all">All states</option>
                {facets.states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="disclosure-category"
                className="block text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1"
              >
                Category
              </label>
              <select
                id="disclosure-category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-sm px-3 py-2"
              >
                <option value="all">All categories</option>
                {facets.categories.map((c) => (
                  <option key={c} value={c}>
                    {humanise(c)}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-gray-500 pb-2">
              {filtered.length} of {templates.length}
            </p>
          </div>

          {actionError !== null && (
            <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              {actionError}
            </p>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* ── Library ── */}
            <section className="xl:col-span-2" aria-label="Template library">
              <div className="rounded-xl border border-gray-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Disclosure</th>
                      <th className="px-4 py-3 text-left">State</th>
                      <th className="px-4 py-3 text-left">Version</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Approved by</th>
                      <th className="px-4 py-3 text-right">Words</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                          {templates.length === 0
                            ? 'No disclosure templates recorded.'
                            : 'No templates match these filters.'}
                        </td>
                      </tr>
                    )}
                    {filtered.map((t) => {
                      const status = STATUS_STYLE[t.status];
                      return (
                        <tr
                          key={t.id}
                          onClick={() => setSelectedId(t.id)}
                          className={`cursor-pointer hover:bg-gray-900/40 ${
                            selectedId === t.id ? 'bg-gray-900/60' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <p className="text-gray-200">{t.name}</p>
                            <p className="text-xs text-gray-600">{humanise(String(t.category))}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-400">{t.state}</td>
                          <td className="px-4 py-3 text-gray-400">{t.version}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-2xs ${status.cls}`}
                            >
                              {status.label}
                            </span>
                            {t.status === 'approved' && !t.isActive && (
                              <span className="block text-2xs text-yellow-500 mt-0.5">
                                not active
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {t.approvedBy === null ? (
                              // Never a role name standing in for a person.
                              <span className="text-gray-600">not approved</span>
                            ) : (
                              <>
                                {t.approvedBy}
                                <span className="block text-2xs text-gray-600">
                                  {formatDate(t.approvedAt)}
                                </span>
                              </>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {wordCount(t.content)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Detail ── */}
            <section aria-label="Template detail">
              {selected === null ? (
                <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6 text-center">
                  <p className="text-sm text-gray-500">Select a disclosure to view it.</p>
                </div>
              ) : (
                <DetailPanel
                  template={selected}
                  busy={busy}
                  context={context}
                  setContext={setContext}
                  rendered={rendered}
                  history={history}
                  historyLoading={historyLoading}
                  onLoadHistory={() => loadHistory(selected.id)}
                  onSubmit={() => act(selected.id, 'submit')}
                  onApprove={() => act(selected.id, 'approve')}
                  onRender={() => render(selected)}
                />
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function DetailPanel({
  template,
  busy,
  context,
  setContext,
  rendered,
  history,
  historyLoading,
  onLoadHistory,
  onSubmit,
  onApprove,
  onRender,
}: {
  template: DisclosureTemplateRow;
  busy: boolean;
  context: Record<string, string>;
  setContext: (next: Record<string, string>) => void;
  rendered: string | null;
  history: DisclosureTemplateRow[] | null;
  historyLoading: boolean;
  onLoadHistory: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onRender: () => void;
}) {
  const can = renderability(template);
  const missing = missingVariables(template, context);
  const status = STATUS_STYLE[template.status];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="text-sm font-semibold text-white">{template.name}</h2>
          <span className={`rounded-full border px-2 py-0.5 text-2xs flex-shrink-0 ${status.cls}`}>
            {status.label}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          {template.state} · {humanise(String(template.category))} · v{template.version} ·
          effective {formatDate(template.effectiveDate)}
        </p>

        <pre className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-800 bg-[#071019] p-3 text-xs text-gray-300 font-mono">
          {template.content}
        </pre>

        <div className="mt-4 flex flex-wrap gap-2">
          {/* Both transitions are recorded now. Submitting used to answer 200
              and write nothing, because the status was inferred from
              approvedAt and isActive and those two fields cannot express
              "pending review"; there is a status column for it. */}
          {template.status === 'draft' && (
            <button
              onClick={onSubmit}
              disabled={busy}
              className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-200 disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Submit for review'}
            </button>
          )}
          {template.status === 'pending_review' && (
            <button
              onClick={onApprove}
              disabled={busy}
              className="rounded-lg bg-green-900 px-3 py-1.5 text-xs text-green-200 disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Approve'}
            </button>
          )}
          <button
            onClick={onLoadHistory}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-900"
          >
            Version history
          </button>
        </div>

        {template.status === 'draft' && (
          <p className="mt-3 text-2xs text-gray-600 leading-relaxed">
            A draft goes to review before it can be approved.
          </p>
        )}

        {/* The approval that used to be asserted. */}
        <p className="mt-3 text-2xs text-gray-600 leading-relaxed">
          {template.approvedBy === null
            ? 'Not approved. Approving records who did it and when.'
            : `Approved by ${template.approvedBy} on ${formatDate(template.approvedAt)}.`}
        </p>
      </div>

      {/* ── Render ── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Render for a client</h3>
        <p className="text-xs text-gray-500 mb-3">
          Produces the text to issue. Issuing it, and recording that it was issued, happens outside
          this page — the previous version had a &ldquo;Send to clients&rdquo; button with nothing
          behind it.
        </p>

        {!can.canRender ? (
          // Stated, not just disabled: the reason is the compliance control.
          <p className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-300">
            {can.reason}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {template.variables.map((v) => (
                <div key={v.name}>
                  <label
                    htmlFor={`var-${v.name}`}
                    className="block text-xs text-gray-400 mb-0.5"
                  >
                    {v.name}
                    {v.required && <span className="text-red-500"> *</span>}
                  </label>
                  <input
                    id={`var-${v.name}`}
                    value={context[v.name] ?? ''}
                    onChange={(e) => setContext({ ...context, [v.name]: e.target.value })}
                    placeholder={v.description}
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200"
                  />
                </div>
              ))}
              {template.variables.length === 0 && (
                <p className="text-xs text-gray-500">This template takes no variables.</p>
              )}
            </div>

            <button
              onClick={onRender}
              disabled={busy || missing.length > 0}
              className="mt-3 rounded-lg bg-[#C9A84C] px-3 py-1.5 text-xs font-semibold text-[#0A1628] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Rendering…' : 'Render'}
            </button>
            {missing.length > 0 && (
              <p className="mt-2 text-2xs text-gray-500">
                Still needed: {missing.join(', ')}
              </p>
            )}
          </>
        )}

        {rendered !== null && (
          <pre className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-800 bg-[#071019] p-3 text-xs text-gray-300 font-mono">
            {rendered}
          </pre>
        )}
      </div>

      {/* ── History ── */}
      {history !== null && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Version history</h3>
          {historyLoading ? (
            <p className="text-xs text-gray-500">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-gray-500">
              No earlier versions recorded for this disclosure.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-800 pb-2 last:border-0 text-xs"
                >
                  <span className="text-gray-300">v{h.version}</span>
                  <span className="text-gray-500">{STATUS_STYLE[h.status].label}</span>
                  <span className="text-gray-600">{formatDate(h.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
          {/* The old history carried a change summary and an author per entry.
              Neither is recorded. */}
          <p className="mt-3 text-2xs text-gray-600">
            Change summaries and per-version authors are not recorded.
          </p>
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
