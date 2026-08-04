'use client';

// ============================================================
// /issuers — issuer directory
//
// This held its own issuer list. GET /api/issuers returns the one on
// record, with the contacts and products it actually carries.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { loadJson, toLoadError } from '@/lib/load-json';

interface Row { [key: string]: unknown; id?: string }

export default function IssuersPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [issuer, setIssuer] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadJson<unknown>('/api/issuers');
      const d = data as Record<string, unknown> | unknown[];
      const list = Array.isArray(d) ? d : ((d?.['issuers'] as unknown[]) ?? []);
      setRows(list as Row[]);
    } catch (e) {
      setError(`Issuers could not be loaded. ${toLoadError(e).message}`);
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A real contact against POST /api/crm/issuers/contacts.
  const submit = useCallback(async () => {
    setSaving(true);
    setFormError(null);
    try {
      await loadJson('/api/crm/issuers/contacts', {
        method: 'POST',
        body: {
          issuer,
          ...(contactName.trim() === '' ? {} : { contactName: contactName.trim() }),
          ...(phone.trim() === '' ? {} : { phone: phone.trim() }),
        },
      });
      setShowForm(false);
      setIssuer('');
      setContactName('');
      setPhone('');
      await load();
    } catch (e) {
      setFormError(`The contact was not saved. ${toLoadError(e).message}`);
    } finally {
      setSaving(false);
    }
  }, [issuer, contactName, phone, load]);


  const items = rows ?? [];
  const columns = items.length === 0 ? [] : Object.keys(items[0]).filter((c) => {
    const v = items[0][c];
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
  }).slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Issuers</h1>
        <p className="text-sm text-gray-500 mt-1">The issuer directory on record.</p>
      </div>


      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:border-gray-400"
        >
          + Add Issuer Contact
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Add an issuer contact</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <label htmlFor="issuer-name" className="block text-xs text-gray-500 mb-1">Issuer</label>
              <input
                id="issuer-name"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              />
            </div>
            <div>
              <label htmlFor="contact-name" className="block text-xs text-gray-500 mb-1">Contact name</label>
              <input
                id="contact-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              />
            </div>
            <div>
              <label htmlFor="contact-phone" className="block text-xs text-gray-500 mb-1">Phone</label>
              <input
                id="contact-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              />
            </div>
          </div>

          {formError !== null && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && rows !== null && (
        items.length === 0 ? (
          <p className="text-sm text-gray-500">No issuer is on record.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="px-4 py-3 text-left">
                      {c.replace(/([A-Z])/g, ' $1')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((row, i) => (
                  <tr key={String(row.id ?? i)}>
                    {columns.map((c) => (
                      <td key={c} className="px-4 py-3 text-gray-800">
                        {row[c] === null || row[c] === undefined ? '—' : String(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
