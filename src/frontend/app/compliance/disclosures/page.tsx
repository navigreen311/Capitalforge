'use client';

// ============================================================
// /compliance/disclosures — state disclosure position
//
// This page listed ten filings against named businesses with deadlines and
// statuses: "Apex Ventures LLC / CA / SB 1235 Commercial Finance Disclosures
// / 2026-04-15 / Pending", two marked Filed with dates, three Overdue. The
// summary counted them into Overdue / Pending / Filed cards.
//
// "File" set the row to Filed in component state and minted a confirmation
// reference — `CF-${year}-${state}-${Math.random().toString(36)...}` — plus
// a link to /documents/disclosures/<id>.pdf, a file nothing generates. A
// bulk action did that for every pending row behind a progress bar and
// finished with "10 disclosures filed successfully". The endpoint it called
// answered 200 with a filing date and wrote nothing. The compliance landing
// page routes here with a button labelled "File Now".
//
// A state disclosure filing is a submission to a regulator. Nothing in this
// system submits one, and nothing records that anybody did — so this page
// now shows what is known, and states plainly what is not.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { loadJson, toLoadError } from '@/lib/load-json';
import {
  toDisclosureInventory,
  statesRepresented,
  withoutState,
  type DisclosureInventory,
} from '@/lib/disclosure-filings-view';

export default function DisclosuresPage() {
  const [inventory, setInventory] = useState<DisclosureInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadJson<unknown>('/api/compliance/disclosures');
      setInventory(toDisclosureInventory(data));
    } catch (e) {
      // inventory stays null. An empty inventory would read as "no disclosures
      // are required", which is the opposite of "we could not check".
      setError(
        `The disclosure inventory could not be loaded, so nothing is shown below. ${toLoadError(e).message}`,
      );
      setInventory(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const businesses = inventory?.businesses ?? [];
  const states = statesRepresented(businesses);
  const unknownState = withoutState(businesses);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">State Disclosures</h1>
        <p className="text-sm text-gray-500 mt-1">
          Where your clients are formed, and what this system does and does not know about
          disclosure obligations.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && inventory !== null && (
        <>
          {/* ── What is missing, first, because it governs everything below ── */}
          <section
            aria-label="What this page cannot tell you"
            className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-3"
          >
            <h2 className="text-sm font-semibold text-amber-900">
              This page cannot tell you whether you have filed
            </h2>
            <p className="text-xs text-amber-900 leading-relaxed">
              <strong>No obligation register.</strong> {inventory.obligationRegister.why}
            </p>
            <p className="text-xs text-amber-900 leading-relaxed">
              <strong>No filing record.</strong> {inventory.filingRecord.why}
            </p>
            <p className="text-xs text-amber-900 leading-relaxed">
              Until both exist, the deadlines and statuses this page used to show — Pending,
              Overdue, Filed — cannot be produced from anything. They were written into the page,
              and the same six were served to every tenant by the API behind it.
            </p>
          </section>

          {/* ── Filing ── */}
          <section
            aria-label="Filing a disclosure"
            className="rounded-xl border border-gray-200 bg-white p-5 space-y-2"
          >
            <h2 className="text-sm font-semibold text-gray-900">Filing a disclosure</h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              Not offered here, individually or in bulk. The button that used to do it marked the
              row filed in the browser, generated a confirmation reference with a random number
              generator and a link to a PDF that is never created, and called an endpoint that
              answered with a filing date while writing nothing. That endpoint now refuses.
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              File through the state&rsquo;s own channel, and keep the confirmation the regulator
              issues. This system has nowhere to put it yet.
            </p>
          </section>

          {/* ── Inventory ── */}
          <section aria-label="Clients by state of formation" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-900">Clients by state of formation</h2>
              <p className="text-xs text-gray-500">
                {businesses.length} client{businesses.length === 1 ? '' : 's'}
                {states.length > 0 && ` · ${states.length} state${states.length === 1 ? '' : 's'}`}
                {unknownState > 0 && ` · ${unknownState} with no state on record`}
              </p>
            </div>

            {businesses.length === 0 ? (
              <p className="text-sm text-gray-500">No clients on record.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Client</th>
                      <th className="px-4 py-3 text-left">State of formation</th>
                      <th className="px-4 py-3 text-left">Client status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {businesses.map((b) => (
                      <tr key={b.businessId}>
                        <td className="px-4 py-3 text-gray-900">{b.businessName}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {/* Not defaulted to a state. */}
                          {b.stateOfFormation ?? (
                            <span className="text-gray-400">Not recorded</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{b.status ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-gray-500 leading-relaxed">
              State of formation is where the entity was registered. It is not a determination of
              which disclosure law applies — that turns on where the recipient of the financing is
              located, the product and the amount — so this table is an inventory, not a
              compliance position.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
