'use client';

// ============================================================
// /financial-control/simulator — stacking scenarios
//
// This page held five clients as literals — "Marcus Rivera — Retail Store,
// FICO 745, $920,000 revenue" — and computed every result locally:
//
//   const effectiveApr = input.avgApr * 0.85; // simplified: blend with
//                                             // intro rates
//
// so the cost of capital, the monthly payment and the credit impact came
// from arithmetic invented in the browser, against clients who did not
// exist. A different answer to the same question sat behind
// POST /api/simulator/run the whole time.
//
// The profile is entered here because the system does not hold a FICO
// score, a utilisation ratio or an inquiry count for a client. Those are
// inputs an advisor supplies, and the page says so rather than presenting
// them as facts on file.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { loadJson, toLoadError } from '@/lib/load-json';
import { ScenarioResultView } from '@/components/simulator/ScenarioResultView';

interface ClientOption {
  id: string;
  businessName: string;
}

interface Profile {
  ficoScore: number;
  utilizationRatio: number;
  derogatoryCount: number;
  inquiries12m: number;
  creditAgeMonths: number;
  annualRevenue: number;
  yearsInOperation: number;
  existingDebt: number;
  targetCreditLimit: number;
}

const DEFAULT_PROFILE: Profile = {
  ficoScore: 700,
  utilizationRatio: 0.3,
  derogatoryCount: 0,
  inquiries12m: 2,
  creditAgeMonths: 60,
  annualRevenue: 500_000,
  yearsInOperation: 3,
  existingDebt: 0,
  targetCreditLimit: 50_000,
};

const FIELDS: { key: keyof Profile; label: string; step?: string }[] = [
  { key: 'ficoScore', label: 'FICO score' },
  { key: 'utilizationRatio', label: 'Utilisation ratio (0–1)', step: '0.01' },
  { key: 'derogatoryCount', label: 'Derogatory marks' },
  { key: 'inquiries12m', label: 'Inquiries, 12 months' },
  { key: 'creditAgeMonths', label: 'Credit age (months)' },
  { key: 'annualRevenue', label: 'Annual revenue' },
  { key: 'yearsInOperation', label: 'Years in operation', step: '0.5' },
  { key: 'existingDebt', label: 'Existing debt' },
  { key: 'targetCreditLimit', label: 'Target credit limit' },
];

export default function SimulatorPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = (await loadJson<ClientOption[] | null>('/api/clients?limit=200')) ?? [];
        setClients(list);
        if (list.length > 0) setBusinessId(list[0].id);
      } catch (e) {
        setError(`Could not load the client list. ${toLoadError(e).message}`);
      }
    })();
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const data = await loadJson<Record<string, unknown> | null>('/api/simulator/run', {
        method: 'POST',
        body: {
          profile: { ...profile, ...(businessId === '' ? {} : { businessId }) },
        },
      });
      setResult(data ?? null);
    } catch (e) {
      setError(`The scenario did not run. ${toLoadError(e).message}`);
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [profile, businessId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stacking Simulator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Runs a scenario against the simulator service.
        </p>
      </div>

      <section
        aria-label="Where these numbers come from"
        className="rounded-xl border border-gray-200 bg-white p-5 space-y-2"
      >
        <h2 className="text-sm font-semibold text-gray-900">Where these numbers come from</h2>
        <p className="text-xs text-gray-600 leading-relaxed">
          The profile below is entered, not looked up. This system does not hold a FICO score, a
          utilisation ratio, an inquiry count or a credit age for any client — so nothing is
          pre-filled from a record, and a result is only as good as what was typed.
        </p>
        <p className="text-xs text-gray-600 leading-relaxed">
          The result comes from the simulator service. The page used to compute it here, from an
          effective APR of the entered rate times 0.85 — a different answer to the same question,
          against five clients written into the file.
        </p>
      </section>

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        {clients.length > 0 && (
          <div>
            <label htmlFor="sim-client" className="block text-xs text-gray-500 mb-1">
              Client (optional — recorded with the run)
            </label>
            <select
              id="sim-client"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`sim-${f.key}`} className="block text-xs text-gray-500 mb-1">
                {f.label}
              </label>
              <input
                id={`sim-${f.key}`}
                type="number"
                step={f.step ?? '1'}
                value={profile[f.key]}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, [f.key]: Number(e.target.value) }))
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run scenario'}
        </button>
      </div>

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {result !== null && <ScenarioResultView result={result} />}
    </div>
  );
}
