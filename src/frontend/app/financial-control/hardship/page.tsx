'use client';

// ============================================================
// /financial-control/hardship — clients in hardship
//
// This page held two clients in workout as literals — Carlos Mendez of
// Mendez Trucking LLC, $84,500 of debt, 3 missed payments, 92% utilisation,
// advisor Sarah Mitchell — with an at-risk list, a card list and an activity
// feed beside them. It called no API.
//
// It also generated a workout proposal letter addressed to the client, from
// multipliers of that invented balance: a reduced payment at 2% of it, a
// settlement at 55% or 65% "if paid within 90 days", late fees waived at $39
// each, a "temporary reduction to 9.99% APR", a 24-month plan, signed
// "CapitalForge Hardship Resolution Team" and valid for 30 days. And a
// four-stage call script to read to the client. None of the numbers came
// from anywhere, and a client shown that letter has been made an offer.
//
// The cases are real: hardship_cases, opened through a service that
// evaluates the trigger. What it holds is a trigger type, a severity, a
// status, and whether a payment plan or settlement offer has been attached.
// It holds no balance, no missed-payment count and no advisor, so none of
// those appear here.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '@/lib/api-client';
import {
  toHardshipRows,
  summarise,
  humanise,
  type HardshipRow,
} from '@/lib/hardship-view';

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  serious: 'bg-amber-100 text-amber-700',
  minor: 'bg-blue-100 text-blue-700',
};

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default function HardshipPage() {
  const [rows, setRows] = useState<HardshipRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/financial/hardship-cases', { headers: authHeaders() });
      const body = (await res.json()) as { success?: boolean; data?: unknown };
      if (!res.ok || body.success !== true) {
        setError(`Hardship cases could not be loaded (HTTP ${res.status}).`);
        setRows(null);
        return;
      }
      setRows(toHardshipRows(body.data));
    } catch {
      setError('Could not reach the server, so no cases are shown.');
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cases = rows ?? [];
  const summary = summarise(cases);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hardship</h1>
        <p className="text-sm text-gray-500 mt-1">
          Clients with an open hardship case, as recorded.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && rows !== null && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Cases', value: summary.total },
              { label: 'Open', value: summary.open },
              { label: 'Critical', value: summary.critical },
              { label: 'With a payment plan', value: summary.withPlan },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">{k.value}</p>
              </div>
            ))}
          </div>

          {cases.length === 0 ? (
            <p className="text-sm text-gray-500">
              No hardship case is open. Cases are opened through the hardship API when the
              signals — missed payments, utilisation — cross the thresholds the service applies.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Trigger</th>
                    <th className="px-4 py-3 text-left">Severity</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Payment plan</th>
                    <th className="px-4 py-3 text-left">Settlement offer</th>
                    <th className="px-4 py-3 text-left">Opened</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cases.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 text-gray-900">
                        {c.businessName ?? (
                          <span className="text-gray-400">Client not resolved</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{humanise(c.triggerType)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            SEVERITY_STYLE[c.severity] ?? 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {humanise(String(c.severity))}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{humanise(c.status)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.hasPaymentPlan ? 'Attached' : 'None'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.hasSettlementOffer ? 'Attached' : 'None'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(c.openedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section
            aria-label="What this page does not do"
            className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-2"
          >
            <h2 className="text-sm font-semibold text-amber-900">No offer is produced here</h2>
            <p className="text-xs text-amber-900 leading-relaxed">
              This page used to generate a workout proposal addressed to the client — a reduced
              monthly payment, a rate cut to 9.99%, waived late fees and a settlement at 55% of
              the balance, valid for 30 days and signed by a &ldquo;Hardship Resolution
              Team&rdquo;. Every figure was a multiplier of a debt balance that existed only in
              the page. A client shown that has been made an offer.
            </p>
            <p className="text-xs text-amber-900 leading-relaxed">
              Payment plans and settlements are computed by the hardship service under stated
              rules — an APR cap, a share of monthly revenue that narrows with severity, a
              settlement rate by severity — and attached to the case. They take a balance and a
              card list as input, which this page does not hold, so it does not offer to create
              one. Whether an advisor may make a settlement offer at all is a decision this
              system should not make by putting a button here.
            </p>
          </section>

          <p className="text-xs text-gray-500 leading-relaxed">
            The record holds a trigger, a severity, a status and whether a plan or offer is
            attached. It holds no outstanding balance, missed-payment count, utilisation figure
            or assigned advisor — the page showed all four, and the table has a column for none
            of them.
          </p>
        </>
      )}
    </div>
  );
}
