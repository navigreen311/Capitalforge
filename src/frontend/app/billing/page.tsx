'use client';

// ============================================================
// /billing — invoices
//
// This page listed invoices as literals: CF-2026-0041 to Apex Ventures LLC
// for $18,500 issued, CF-2026-0040 to NovaTech Solutions for $9,750 marked
// overdue, CF-2026-0039 to Horizon Retail Partners for $42,000. Beside them
// sat commissions owed to named partners — Marcus Webb, $6,250 approved —
// and a usage meter reading 87,400 of 100,000 API calls against an
// Enterprise plan. It called no API.
//
// An overdue invoice says a client owes money and has not paid it.
//
//   GET /api/businesses/:id/invoices — the invoices, per client
//
// Overdue is computed here from the due date and the absence of a payment,
// not read from a status somebody typed. Commissions and usage metering are
// not shown: commission_records exists but nothing writes to it, and no
// meter records usage.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { loadJson, toLoadError } from '@/lib/load-json';
import {
  toInvoiceRows,
  isOverdue,
  summarise,
  formatMoney,
  type InvoiceRow,
} from '@/lib/billing-view';

interface ClientOption {
  businessId: string;
  businessName: string;
}

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default function BillingPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [dealStructure, setDealStructure] = useState('consulting_only');
  const [approvedCredit, setApprovedCredit] = useState('0');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    setNow(new Date());
    void (async () => {
      try {
        const payload = await loadJson<{ businesses?: ClientOption[] } | null>(
          '/api/compliance/disclosures',
        );
        const list = payload?.businesses ?? [];
        setClients(list);
        if (list.length > 0) setSelected(list[0].businessId);
        else setLoading(false);
      } catch (e) {
        setError(`Invoices could not be loaded. ${toLoadError(e).message}`);
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async (businessId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadJson<unknown>(`/api/businesses/${encodeURIComponent(businessId)}/invoices`);
      setRows(toInvoiceRows(data));
    } catch {
      setError('Could not reach the server.');
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected !== '') void load(selected);
  }, [selected, load]);

  // Generates a real invoice: the fee schedule for the deal structure is
  // applied by the service and the row is written. Nothing is charged.
  const generate = useCallback(async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      await loadJson(`/api/businesses/${encodeURIComponent(selected)}/invoices`, {
        method: 'POST',
        body: {
          dealStructure,
          totalApprovedCredit: Number(approvedCredit) || 0,
        },
      });
      setShowGenerate(false);
      await load(selected);
    } catch (e) {
      setGenerateError(`The invoice was not created. ${toLoadError(e).message}`);
    } finally {
      setGenerating(false);
    }
  }, [selected, dealStructure, approvedCredit, load]);

  const invoices = rows ?? [];
  const summary = now === null ? null : summarise(invoices, now);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <p className="text-sm text-gray-500 mt-1">Invoices raised against a client.</p>
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

      {!loading && error === null && rows !== null && summary !== null && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Invoices', value: String(summary.invoices) },
              { label: 'Paid', value: String(summary.paid) },
              { label: 'Overdue', value: String(summary.overdue) },
              { label: 'Outstanding', value: formatMoney(summary.outstandingAmount) },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">{k.value}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowGenerate((v) => !v)}
              disabled={selected === ''}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:border-gray-400 disabled:opacity-50"
            >
              + Generate Invoice
            </button>
          </div>

          {showGenerate && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Generate an invoice</h2>
              <div className="flex flex-wrap gap-4">
                <div>
                  <label htmlFor="deal-structure" className="block text-xs text-gray-500 mb-1">
                    Deal structure
                  </label>
                  <select
                    id="deal-structure"
                    value={dealStructure}
                    onChange={(e) => setDealStructure(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                  >
                    {[
                      'card_stacking',
                      'credit_repair',
                      'consulting_only',
                      'white_label_reseller',
                      'enterprise_managed',
                    ].map((v) => (
                      <option key={v} value={v}>
                        {v.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="approved-credit" className="block text-xs text-gray-500 mb-1">
                    Total approved credit
                  </label>
                  <input
                    id="approved-credit"
                    type="number"
                    min="0"
                    value={approvedCredit}
                    onChange={(e) => setApprovedCredit(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                  />
                </div>
              </div>

              {generateError !== null && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {generateError}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={generating}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {generating ? 'Generating…' : 'Generate'}
                </button>
                <p className="text-xs text-gray-500">
                  Applies the fee schedule for the structure and writes the invoice. It does not
                  charge anything.
                </p>
              </div>
            </div>
          )}

          {invoices.length === 0 ? (
            <p className="text-sm text-gray-500">
              No invoice has been raised for this client. Invoices are generated through the
              billing API against a deal structure and its fee schedule.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Invoice</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Issued</th>
                    <th className="px-4 py-3 text-left">Due</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv) => {
                    const overdue = isOverdue(inv, now ?? new Date());
                    return (
                      <tr key={inv.id}>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{inv.type.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {formatMoney(inv.amount)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(inv.issuedAt)}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(inv.dueDate)}</td>
                        <td className="px-4 py-3">
                          {inv.paidAt !== null || inv.status === 'paid' ? (
                            <span className="text-emerald-700">Paid</span>
                          ) : overdue === true ? (
                            <span className="text-red-700">Overdue</span>
                          ) : overdue === null ? (
                            // No due date on the record: not overdue, and
                            // not on time either.
                            <span className="text-gray-500">No due date</span>
                          ) : (
                            <span className="text-gray-700">{inv.status}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <section
            aria-label="What is not here"
            className="rounded-xl border border-gray-200 bg-white p-5 space-y-2"
          >
            <h2 className="text-sm font-semibold text-gray-900">What is not here</h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              <strong>Commissions.</strong> The page showed amounts owed to named partners and
              advisors, with approval statuses and due dates, from literals. They are rows in
              commission_records now — created against an invoice through the API and listed at
              /api/commissions — and none has been created for this tenant, which is why none
              appears.
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              <strong>Usage metering.</strong> It reported 87,400 of 100,000 API calls, 48 of 50
              deals and 12 of 12 seats against an Enterprise plan. Nothing meters usage.
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              <strong>Taking payment.</strong> Marking an invoice paid records that it was paid.
              It does not charge anything — no card is debited and no money moves.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
