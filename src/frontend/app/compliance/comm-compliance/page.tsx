'use client';

// ============================================================
// /compliance/comm-compliance — Consent and do-not-contact
//
// This page called nothing, and two of its fixtures decided whether
// contacting somebody is lawful.
//
// A consent audit gave every business a voice, SMS and email status:
//
//   Apex Ventures LLC      voice granted   sms granted   email granted
//   Summit Capital Group   voice none      sms none      email granted
//
// And a do-not-contact list of three entries. Both were literals. "Granted"
// asserts a TCPA basis to call and text a client, and the DNC list is the
// record of the people who asked not to be. This system can send real SMS.
//
// Beside them sat a communication log of eight calls and emails with
// compliance flags — "no_consent", "banned_claim", "missing_opt_out" —
// attributing TCPA violations to named businesses that do not exist.
//
// What is here now:
//   GET /api/v1/clients                    — who the clients are
//   GET /api/businesses/:id/consent        — consent per channel, per client
//   GET /api/do-not-call                   — the suppression list
//
// That last endpoint did not exist. The table has been written to on every
// SMS opt-out and checked by the sender before every send, and nothing could
// read it back.
//
// The communication log is not rebuilt. Nothing records a per-communication
// compliance review, so a log of flagged calls would be the same fixture in
// a new place. The scanner on /comm-compliance checks a draft before it is
// sent, which is the part the platform can actually do.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { fetchAllPages } from '@/lib/fetch-all-pages';
import {
  toConsentEntries,
  toDncEntries,
  channelStatus,
  summariseConsent,
  suppressedBusinessIds,
  humanise,
  type BusinessConsent,
  type ConsentStatus,
  type DncEntry,
} from '@/lib/consent-audit-view';

type TabKey = 'consent' | 'dnc';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'consent', label: 'Consent Audit' },
  { key: 'dnc', label: 'Do Not Contact' },
];

const CONTACT_CHANNELS: ('voice' | 'sms' | 'email')[] = ['voice', 'sms', 'email'];

const STATUS_STYLE: Record<ConsentStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-green-900 text-green-300 border-green-700' },
  revoked: { label: 'Revoked', cls: 'bg-red-900 text-red-300 border-red-700' },
  expired: { label: 'Expired', cls: 'bg-orange-900 text-orange-300 border-orange-700' },
  pending: { label: 'Pending', cls: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  // Deliberately not styled as a failure. No basis on record is not a
  // refusal, and it is not permission either.
  unknown: { label: 'None on record', cls: 'bg-gray-800 text-gray-500 border-gray-700' },
};

/** How many clients to read consent for. Each is a separate request. */
const MAX_CLIENTS = 50;

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;
  return token === null ? {} : { Authorization: `Bearer ${token}` };
}

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ComplianceCommPage() {
  const [tab, setTab] = useState<TabKey>('consent');

  const [rows, setRows] = useState<BusinessConsent[]>([]);
  const [dnc, setDnc] = useState<DncEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dncError, setDncError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setDncError(null);
    const headers = authHeaders();

    try {
      const clients = await fetchAllPages(
        '/api/v1/clients',
        (json) => {
          const body = json as { success?: boolean; data?: unknown };
          if (body.success !== true || !Array.isArray(body.data)) return [];
          return body.data
            .map((row) => row as Record<string, unknown>)
            .filter((row) => typeof row['id'] === 'string')
            .map((row) => ({
              id: row['id'] as string,
              name:
                (typeof row['businessName'] === 'string' && row['businessName']) ||
                (typeof row['legalName'] === 'string' && row['legalName']) ||
                'Unnamed business',
            }));
        },
        { headers },
      );

      const capped = clients.rows.slice(0, MAX_CLIENTS);
      setTruncated(clients.truncated || clients.rows.length > MAX_CLIENTS);

      // Consent is read per business, so a failure on one must not decide
      // what is shown for the rest — and must not read as "no consent".
      const consent = await Promise.all(
        capped.map(async (client): Promise<BusinessConsent> => {
          try {
            const res = await fetch(
              `/api/businesses/${encodeURIComponent(client.id)}/consent`,
              { headers },
            );
            if (!res.ok) return { businessId: client.id, businessName: client.name, entries: null };
            const body = (await res.json()) as { success?: boolean; data?: unknown };
            return {
              businessId: client.id,
              businessName: client.name,
              entries: body.success === true ? toConsentEntries(body.data) : null,
            };
          } catch {
            return { businessId: client.id, businessName: client.name, entries: null };
          }
        }),
      );
      setRows(consent);

      const dncRes = await fetch('/api/do-not-call', { headers });
      if (dncRes.ok) {
        const body = (await dncRes.json()) as { success?: boolean; data?: unknown };
        setDnc(body.success === true ? toDncEntries(body.data) : []);
      } else {
        setDnc([]);
        setDncError(
          `The do-not-contact list could not be read (HTTP ${dncRes.status}). ` +
            'Treat no entry here as unknown, not as clearance to contact.',
        );
      }
    } catch {
      setLoadError('Could not reach the server. No consent state is shown.');
      setRows([]);
      setDnc([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => summariseConsent(rows), [rows]);
  const suppressed = useMemo(() => suppressedBusinessIds(dnc), [dnc]);

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Consent &amp; Do Not Contact</h1>
        <p className="text-sm text-gray-400 mt-1">
          What each client has agreed to be contacted on, and who has asked not to be.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading consent records…</p>}

      {loadError !== null && (
        <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {loadError}
        </p>
      )}

      {!loading && loadError === null && (
        <>
          {truncated && (
            <p className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-xs text-yellow-300">
              Consent was read for the first {MAX_CLIENTS} clients only. A client not shown here
              has not been checked.
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Clients checked" value={String(summary.businesses)} />
            {CONTACT_CHANNELS.map((channel) => (
              <Kpi
                key={channel}
                label={`${humanise(channel)} consent`}
                value={`${summary.contactable[channel]}`}
                note={
                  summary.unknown[channel] > 0
                    ? `${summary.unknown[channel]} with nothing on record`
                    : 'all clients have a record'
                }
              />
            ))}
          </div>

          {summary.unreadable > 0 && (
            <p className="rounded-lg border border-yellow-800 bg-yellow-900/20 px-4 py-3 text-xs text-yellow-300">
              {summary.unreadable} client
              {summary.unreadable === 1 ? "'s" : "s'"} consent record could not be read. Those are
              counted as unknown, not as consent.
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
                {t.key === 'dnc' && dnc.length > 0 && (
                  <span className="ml-1.5 text-gray-500">{dnc.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Consent ── */}
          {tab === 'consent' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Client</th>
                      {CONTACT_CHANNELS.map((c) => (
                        <th key={c} className="px-4 py-3 text-left">
                          {humanise(c)}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left">Suppressed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                          No clients to check.
                        </td>
                      </tr>
                    )}
                    {rows.map((row) => (
                      <tr key={row.businessId}>
                        <td className="px-4 py-3">
                          <p className="text-gray-200">{row.businessName}</p>
                          {row.entries === null && (
                            <p className="text-2xs text-yellow-500">record unreadable</p>
                          )}
                        </td>
                        {CONTACT_CHANNELS.map((channel) => {
                          const status = STATUS_STYLE[channelStatus(row, channel)];
                          return (
                            <td key={channel} className="px-4 py-3">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-2xs ${status.cls}`}
                              >
                                {status.label}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-xs">
                          {suppressed.has(row.businessId) ? (
                            <span className="text-red-400 font-semibold">On the DNC list</span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-2">
                <h2 className="text-sm font-semibold text-gray-300">Reading this table</h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                  <span className="text-gray-400">None on record</span> is not a refusal and not
                  permission. It means nothing covers that channel for that client. The previous
                  version of this page showed &ldquo;granted&rdquo; for clients that do not exist,
                  which on a TCPA surface is the assertion that you may dial them.
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  A revocation beats an active record on the same channel. Consent can be
                  withdrawn at any time, and the withdrawal is the more recent word.
                </p>
              </div>
            </div>
          )}

          {/* ── DNC ── */}
          {tab === 'dnc' && (
            <div className="space-y-4">
              {dncError !== null && (
                <p className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
                  {dncError}
                </p>
              )}

              <div className="rounded-xl border border-gray-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Number</th>
                      <th className="px-4 py-3 text-left">Client</th>
                      <th className="px-4 py-3 text-left">Source</th>
                      <th className="px-4 py-3 text-left">Reason</th>
                      <th className="px-4 py-3 text-left">Added</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {dnc.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                          {dncError === null
                            ? 'Nobody is on the do-not-contact list.'
                            : 'The list could not be read.'}
                        </td>
                      </tr>
                    )}
                    {dnc.map((e) => (
                      <tr key={e.id}>
                        <td className="px-4 py-3 font-mono text-gray-200">{e.phoneNumber}</td>
                        <td className="px-4 py-3 text-gray-400">
                          {e.businessName ?? (
                            // A number can be suppressed without matching any
                            // client, and it is still a number not to dial.
                            <span className="text-gray-600 italic">no client matched</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{humanise(e.source)}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {e.reason ?? <span className="text-gray-600">none recorded</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(e.addedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-2">
                <h2 className="text-sm font-semibold text-gray-300">About this list</h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                  This is the list the SMS sender checks before every send. It is read-only here:
                  a row is added when somebody opts out, and taking one off is undoing a person&rsquo;s
                  request — not something to do from a dashboard.
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Until this page was repaired nothing could read it back. It was written on every
                  opt-out and consulted before every send, and was visible only to the code that
                  consults it.
                </p>
              </div>
            </div>
          )}

          {/* The log that is not rebuilt. */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
            <h2 className="text-sm font-semibold text-gray-300 mb-2">Communication review log</h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              Not shown. This page listed eight calls and emails with compliance flags against
              them — no consent, banned claim, missing opt-out — for businesses that do not exist.
              Nothing records a compliance review of an individual communication, so rebuilding
              that list would put the same fixture in a new place.
            </p>
            <p className="text-xs text-gray-500 leading-relaxed mt-2">
              What the platform can do is check a draft before it is sent.{' '}
              <Link href="/comm-compliance" className="text-[#C9A84C] hover:underline">
                Communication compliance
              </Link>{' '}
              scans wording against the banned-claim rules and holds the script library.
            </p>
          </div>
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
