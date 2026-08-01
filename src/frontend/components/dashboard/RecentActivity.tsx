'use client';

// ============================================================
// Recent Activity
//
// This card was five literals on the dashboard page, under a comment reading
// "Activity feed mock data (retained — no replacement component)": "APP-0091
// moved to underwriting review — 12 min ago", "Credit pull completed —
// Brightline Corp (Equifax)", "Dossier exported for Apex Ventures Inc.".
// The times were strings, so it said "12 min ago" whenever it was opened,
// and "Mark all read" faded the rows, raised a toast reading "All activity
// marked as read", and set a Set in component state that a refresh threw
// away.
//
// It reads GET /api/activity now — the tenant's audit_logs. There is no
// read state, here or in the schema, so there is no mark-read control.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { SectionCard } from '@/components/ui/card';
import {
  toActivityRows,
  describeAction,
  describeTarget,
  initials,
  groupByDay,
  relativeTime,
  type ActivityRow,
} from '@/lib/activity-view';

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
  return token === null ? {} : { Authorization: `Bearer ${token}` };
}

export function RecentActivity() {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Set after mount: a relative time rendered on the server and again in the
  // browser produces two different strings.
  const [now, setNow] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/activity?limit=20', { headers: authHeaders() });
      const body = (await res.json()) as { success?: boolean; data?: unknown };
      if (!res.ok || body.success !== true) {
        setError(`The activity log could not be read (HTTP ${res.status}).`);
        setRows(null);
        return;
      }
      setRows(toActivityRows(body.data));
      const t = (body.data as { total?: unknown }).total;
      setTotal(typeof t === 'number' ? t : null);
    } catch {
      setError('Could not reach the server, so no activity is shown.');
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setNow(new Date());
    void load();
  }, [load]);

  const groups = rows === null || now === null ? [] : groupByDay(rows, now);

  return (
    // A labelled region: SectionCard renders a plain div, so without this
    // there is no way to scope to this card — on the page or in a test.
    <section aria-label="Recent activity">
      <SectionCard
        title="Recent Activity"
        action={
          <span className="text-xs text-gray-400">
            {total === null ? '' : `${total} recorded`}
          </span>
        }
      >
        {loading && <p className="text-sm text-gray-400">Loading…</p>}

        {error !== null && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        {!loading && error === null && rows !== null && rows.length === 0 && (
          <p className="text-sm text-gray-400">
            Nothing recorded yet. Entries appear here as actions are taken — this is the audit
            log, not a feed of everything that happens in the system.
          </p>
        )}

        <div className="divide-y divide-surface-border -mx-6">
          {groups.map((group) => (
            <React.Fragment key={group.label}>
              <p className="px-6 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {group.label}
              </p>
              {group.rows.map((row) => (
                <div key={row.id} className="px-6 py-3 flex items-start gap-3">
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full
                               flex-shrink-0 text-[10px] font-bold bg-surface-overlay text-gray-600"
                    aria-hidden="true"
                  >
                    {initials(row.action)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 leading-snug">
                      {describeAction(row.action)}
                      {describeTarget(row) !== '' && (
                        <span className="text-gray-400"> — {describeTarget(row)}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {now === null ? '' : relativeTime(row.occurredAt, now)}
                      {/* Attributed only where the record attributes it. */}
                      {row.actor === null ? ' · unattributed' : ` · ${row.actor}`}
                    </p>
                  </div>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>

        {!loading && error === null && rows !== null && rows.length > 0 && (
          <p className="pt-3 text-[10px] text-gray-400 leading-relaxed">
            From the audit log. Nothing marks an entry as read — the schema records no such
            thing, and the button that used to do it only faded the rows until the page was
            refreshed.
          </p>
        )}
      </SectionCard>
    </section>
  );
}

export default RecentActivity;
