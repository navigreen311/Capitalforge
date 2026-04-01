'use client';

import { useState, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SectionCard } from '@/components/ui/card';

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

  const availableProducts = ISSUERS.find((i) => i.issuer === form.issuer)?.products ?? [];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'issuer') setForm((prev) => ({ ...prev, issuer: value, cardProduct: '' }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.issuer || !form.cardProduct || !form.requestedLimit) {
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
      // If API doesn't exist yet, just redirect back
      router.push('/applications');
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
            <label htmlFor="clientName" className="cf-label">Client / Business Name</label>
            <input
              id="clientName"
              name="clientName"
              type="text"
              placeholder="Search or enter client name..."
              value={form.clientName}
              onChange={handleChange}
              className="cf-input"
            />
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
