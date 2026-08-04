'use client';

// ============================================================
// /statements — imported statements and what the detector found
//
// 1763 lines of literals: clients, statements with closing balances and
// minimum payments, line items, and a list of detected anomalies nobody
// detected. The worst of them:
//
//   "Annual fee charged twice on Amex Business Platinum in the same billing
//    cycle" — $1,390.00 against an expected $695.00 — with the instruction
//   "Contact Amex commercial servicing to request reversal of duplicate
//    annual fee charge (ref: stmt_002). Escalate if unresolved within 5
//    business days."
//
// An advisor acting on that calls an issuer about a charge that was never
// made, on behalf of a client who was never billed for it.
//
// The detector is real. It compares an imported statement against what the
// system holds and records what it finds on the statement row. This page
// shows the statements for a client and the anomalies the detector actually
// produced — with no remediation advice, because the detector produces none.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { loadJson, toLoadError } from '@/lib/load-json';
import {
  toStatementRows,
  toAnomalyRows,
  summarise,
  formatMoney,
  type StatementRow,
  type AnomalyRow,
} from '@/lib/statements-view';

interface ClientOption {
  businessId: string;
  businessName: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-amber-100 text-amber-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
};

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default function StatementsPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [statements, setStatements] = useState<StatementRow[] | null>(null);
  const [anomalies, setAnomalies] = useState<{ statementId: string; anomaly: AnomalyRow }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The client list comes from the disclosure inventory endpoint, which is
  // the one place that returns every business with its name.
  useEffect(() => {
    void (async () => {
      try {
        const payload = await loadJson<{
          businesses?: { businessId: string; businessName: string }[];
        } | null>('/api/compliance/disclosures');
        const list = payload?.businesses ?? [];
        setClients(list);
        if (list.length > 0) setSelected(list[0].businessId);
        else setLoading(false);
      } catch (e) {
        setError(`Could not load the client list. ${toLoadError(e).message}`);
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async (businessId: string) => {
    setLoading(true);
    setError(null);
    try {
      // The statements decide whether this page renders; the anomaly check is
      // a second opinion on them. A failure there is reported as such rather
      // than rendered as "no anomalies", which would read as a clean bill of
      // health — so it resolves to null instead of throwing.
      const [statements, anomalies] = await Promise.all([
        loadJson<unknown>(`/api/statements?client_id=${encodeURIComponent(businessId)}`),
        loadJson<unknown>(
          `/api/businesses/${encodeURIComponent(businessId)}/statements/anomalies`,
        ).then(toAnomalyRows).catch(() => null),
      ]);

      setStatements(toStatementRows(statements));
      setAnomalies(anomalies ?? []);
      if (anomalies === null) {
        setError('Statements loaded, but the anomaly check could not be read.');
      }
    } catch (e) {
      setError(`Statements could not be loaded. ${toLoadError(e).message}`);
      setStatements(null);
      setAnomalies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected !== '') void load(selected);
  }, [selected, load]);

  const rows = statements ?? [];
  const summary = summarise(rows);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statements</h1>
          <p className="text-sm text-gray-500 mt-1">
            Imported statements, and what the reconciliation check found in them.
          </p>
        </div>

        {clients.length > 0 && (
          <div>
            <label htmlFor="client" className="block text-xs text-gray-500 mb-1">
              Client
            </label>
            <select
              id="client"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
            >
              {clients.map((c) => (
                <option key={c.businessId} value={c.businessId}>
                  {c.businessName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && clients.length === 0 && error === null && (
        <p className="text-sm text-gray-500">No clients on record.</p>
      )}

      {!loading && statements !== null && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Statements', value: String(summary.statements) },
              { label: 'Reconciled', value: String(summary.reconciled) },
              { label: 'With anomalies', value: String(summary.withAnomalies) },
              { label: 'Closing balance', value: formatMoney(summary.totalClosingBalance) },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">{k.value}</p>
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">
              No statement has been imported for this client. Statements arrive through the
              import endpoint; nothing is fetched from an issuer.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Issuer</th>
                    <th className="px-4 py-3 text-left">Statement date</th>
                    <th className="px-4 py-3 text-right">Closing balance</th>
                    <th className="px-4 py-3 text-right">Minimum</th>
                    <th className="px-4 py-3 text-left">Due</th>
                    <th className="px-4 py-3 text-left">Reconciled</th>
                    <th className="px-4 py-3 text-right">Anomalies</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3 text-gray-900">{s.issuer}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(s.statementDate)}</td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {formatMoney(s.closingBalance)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatMoney(s.minimumPayment)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(s.dueDate)}</td>
                      <td className="px-4 py-3 text-gray-600">{s.reconciled ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{s.anomalyCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section aria-label="Anomalies" className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Anomalies ({anomalies.length})
            </h2>

            {anomalies.length === 0 ? (
              <p className="text-sm text-gray-500">
                The check found nothing on the statements imported for this client. That is the
                result of a check that ran, not a statement that no issue exists.
              </p>
            ) : (
              <ul className="space-y-2">
                {anomalies.map(({ statementId, anomaly }, i) => (
                  <li
                    key={`${statementId}-${i}`}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          SEVERITY_STYLE[anomaly.severity] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {anomaly.severity}
                      </span>
                      <span className="text-xs text-gray-500">{anomaly.type}</span>
                      {anomaly.amount !== null && (
                        <span className="text-xs text-gray-500">
                          {formatMoney(anomaly.amount)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-800">{anomaly.description}</p>
                    {anomaly.transactionRef !== null && (
                      <p className="mt-0.5 text-xs text-gray-500">{anomaly.transactionRef}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs text-gray-500 leading-relaxed">
              No remediation instruction is shown, because the detector produces none. The
              previous version told an advisor to &ldquo;contact Amex commercial servicing to
              request reversal of duplicate annual fee charge&rdquo; and to escalate within five
              business days — over a duplicate charge that had not happened, on a statement that
              had not been imported. What to do about a real finding is a judgement, and the
              statement record does not make it.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
