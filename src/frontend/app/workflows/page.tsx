'use client';

// ============================================================
// /workflows — automation rules
//
// This held workflows as literals with last-triggered times. They are
// rows in workflow_rules now, and nothing executes them — the API says
// so, and so does this page.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { loadJson, toLoadError } from '@/lib/load-json';

interface Row { [key: string]: unknown; id?: string }

export default function WorkflowsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('');
  const [condition, setCondition] = useState('');
  const [action, setAction] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await loadJson<Record<string, unknown> | unknown[]>('/api/platform/workflows');
      const list = Array.isArray(d) ? d : ((d?.['workflows'] as unknown[]) ?? []);
      setRows(list as Row[]);
    } catch (e) {
      setError(`Workflows could not be loaded. ${toLoadError(e).message}`);
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A real rule against POST /api/platform/workflows. It is stored and it
  // will not run — nothing executes workflow rules yet, and the response
  // says so.
  const submit = useCallback(async () => {
    setSaving(true);
    setFormError(null);
    try {
      await loadJson('/api/platform/workflows', {
        method: 'POST',
        body: { name, trigger, condition, action },
      });
      setShowForm(false);
      setName('');
      await load();
    } catch (e) {
      setFormError(`The rule was not saved. ${toLoadError(e).message}`);
    } finally {
      setSaving(false);
    }
  }, [name, trigger, condition, action, load]);


  const items = rows ?? [];
  const columns = items.length === 0 ? [] : Object.keys(items[0]).filter((c) => {
    const v = items[0][c];
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
  }).slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
        <p className="text-sm text-gray-500 mt-1">Rules on record. Nothing executes them yet.</p>
      </div>


      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:border-gray-400"
        >
          + New Rule
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">New workflow rule</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <label htmlFor="wf-name" className="block text-xs text-gray-500 mb-1">Name</label>
              <input
                id="wf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              />
            </div>
            <div>
              <label htmlFor="wf-trigger" className="block text-xs text-gray-500 mb-1">Trigger event</label>
              <input
                id="wf-trigger"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              />
            </div>
            <div>
              <label htmlFor="wf-condition" className="block text-xs text-gray-500 mb-1">Condition</label>
              <input
                id="wf-condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              />
            </div>
            <div>
              <label htmlFor="wf-action" className="block text-xs text-gray-500 mb-1">Action</label>
              <input
                id="wf-action"
                value={action}
                onChange={(e) => setAction(e.target.value)}
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
          <p className="text-sm text-gray-500">No workflow rule is on record.</p>
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
