'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SectionCard } from '@/components/ui/card';
import { loadJson } from '@/lib/load-json';
import { toClientRows, type ClientRow } from '@/lib/client-roster-view';

// ── Issuer / card product options ──────────────────────────────

const ISSUERS = [
  { issuer: 'Chase', products: ['Ink Business Preferred', 'Ink Business Cash', 'Ink Business Unlimited'] },
  { issuer: 'American Express', products: ['Business Platinum', 'Business Gold', 'Blue Business Plus'] },
  { issuer: 'Capital One', products: ['Spark Cash Plus', 'Spark Miles', 'Spark Classic'] },
  { issuer: 'Bank of America', products: ['Business Advantage Cash', 'Business Advantage Travel'] },
  { issuer: 'Citi', products: ['Business AAdvantage', 'Costco Anywhere Visa Business'] },
  { issuer: 'US Bank', products: ['Business Triple Cash', 'Business Leverage'] },
  { issuer: 'Wells Fargo', products: ['Business Elite', 'Business Secured'] },
];

// ── Page ───────────────────────────────────────────────────────

export default function NewApplicationPageWrapper() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-400">Loading...</div>}>
      <NewApplicationPage />
    </Suspense>
  );
}

function NewApplicationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillClientId = searchParams.get('client_id') ?? '';

  const [form, setForm] = useState({
    clientId: prefillClientId,
    clientName: '',
    issuer: '',
    cardProduct: '',
    requestedLimit: '',
    businessPurpose: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);

  // The client was a free-text box, and `businessId` came only from a
  // `client_id` query parameter. Arriving at this page any other way — the
  // sidebar, a bookmark — left it unset, and the API requires it: the form
  // could be filled in completely and still be refused for a field it never
  // offered. Typing a name here never set an id, so the name was decoration.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await loadJson<unknown>('/api/clients?limit=200');
        if (!cancelled) setClients(toClientRows(data));
      } catch {
        // Leave the list empty; the field explains itself below.
        if (!cancelled) setClients([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const availableProducts = ISSUERS.find((i) => i.issuer === form.issuer)?.products ?? [];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'issuer') setForm((prev) => ({ ...prev, issuer: value, cardProduct: '' }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // The API refuses without a business, so check it here rather than
    // letting the server explain a field the form used not to collect.
    if (!form.clientId || !form.issuer || !form.cardProduct || !form.requestedLimit) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('cf_access_token');
      const res = await fetch('/api/v1/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          businessId: form.clientId || undefined,
          issuer: form.issuer,
          cardProduct: form.cardProduct,
          requestedLimit: Number(form.requestedLimit),
          businessPurpose: form.businessPurpose,
          status: 'draft',
        }),
      });

      if (res.ok) {
        router.push('/applications');
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: { message?: string } })?.error?.message ?? 'Failed to create application');
      }
    } catch {
      // This used to navigate to the list — "If API doesn't exist yet, just
      // redirect back". A request that never completed took the user to a
      // page of applications theirs was not on, which reads as success. Stay
      // here and say what happened.
      setError('Could not reach the server, so no application was created.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Application</h1>
          <p className="text-sm text-gray-500 mt-0.5">Submit a new card application for a client</p>
        </div>
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← Back
        </button>
      </div>

      <SectionCard title="Application Details">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Client */}
          <div>
            <label htmlFor="clientId" className="cf-label">
              Client / Business Name <span className="text-red-500">*</span>
            </label>
            <select
              id="clientId"
              name="clientId"
              value={form.clientId}
              onChange={handleChange}
              className="cf-input"
            >
              <option value="">Select a client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName}
                </option>
              ))}
            </select>
            {clients.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                No clients could be loaded. An application must belong to one.
              </p>
            )}
            {prefillClientId && (
              <p className="text-xs text-gray-400 mt-1">Pre-filled from client: {prefillClientId}</p>
            )}
          </div>

          {/* Issuer */}
          <div>
            <label htmlFor="issuer" className="cf-label">Card Issuer <span className="text-red-500">*</span></label>
            <select
              id="issuer"
              name="issuer"
              value={form.issuer}
              onChange={handleChange}
              className="cf-input"
            >
              <option value="">Select issuer...</option>
              {ISSUERS.map((i) => (
                <option key={i.issuer} value={i.issuer}>{i.issuer}</option>
              ))}
            </select>
          </div>

          {/* Card Product */}
          <div>
            <label htmlFor="cardProduct" className="cf-label">Card Product <span className="text-red-500">*</span></label>
            <select
              id="cardProduct"
              name="cardProduct"
              value={form.cardProduct}
              onChange={handleChange}
              className="cf-input"
              disabled={!form.issuer}
            >
              <option value="">{form.issuer ? 'Select card product...' : 'Select issuer first'}</option>
              {availableProducts.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Requested Limit */}
          <div>
            <label htmlFor="requestedLimit" className="cf-label">Requested Credit Limit ($) <span className="text-red-500">*</span></label>
            <input
              id="requestedLimit"
              name="requestedLimit"
              type="number"
              min="1000"
              step="1000"
              placeholder="e.g. 50000"
              value={form.requestedLimit}
              onChange={handleChange}
              className="cf-input"
            />
          </div>

          {/* Business Purpose */}
          <div>
            <label htmlFor="businessPurpose" className="cf-label">Business Purpose</label>
            <textarea
              id="businessPurpose"
              name="businessPurpose"
              rows={3}
              placeholder="Describe the business purpose for this credit line..."
              value={form.businessPurpose}
              onChange={handleChange}
              className="cf-input"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-outline btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary btn"
            >
              {submitting ? 'Creating...' : 'Create Draft Application'}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
