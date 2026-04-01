'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/ui/card';

const CLIENTS = [
  { id: 'biz_001', name: 'Apex Ventures LLC' },
  { id: 'biz_002', name: 'NovaTech Solutions Inc.' },
  { id: 'biz_003', name: 'Blue Ridge Consulting' },
  { id: 'biz_004', name: 'Summit Capital Group' },
  { id: 'biz_005', name: 'Horizon Retail Partners' },
  { id: 'biz_006', name: 'Crestline Medical LLC' },
  { id: 'biz_007', name: 'Pinnacle Freight Corp' },
];

export default function NewFundingRoundPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    clientId: '',
    targetAmount: '',
    targetCloseDate: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.clientId || !form.targetAmount) {
      setError('Please select a client and enter a target amount.');
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem('cf_access_token');
      await fetch('/api/v1/funding-rounds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          businessId: form.clientId,
          targetCredit: Number(form.targetAmount),
          targetCloseDate: form.targetCloseDate || undefined,
          notes: form.notes || undefined,
        }),
      });
      router.push('/funding-rounds');
    } catch {
      router.push('/funding-rounds');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Funding Round</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create a new card stacking round for a client</p>
        </div>
        <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">← Back</button>
      </div>

      <SectionCard title="Round Details">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="clientId" className="cf-label">Client <span className="text-red-500">*</span></label>
            <select id="clientId" name="clientId" value={form.clientId} onChange={handleChange} className="cf-input">
              <option value="">Select client...</option>
              {CLIENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="targetAmount" className="cf-label">Target Credit Amount ($) <span className="text-red-500">*</span></label>
            <input id="targetAmount" name="targetAmount" type="number" min="10000" step="5000" placeholder="e.g. 150000" value={form.targetAmount} onChange={handleChange} className="cf-input" />
          </div>
          <div>
            <label htmlFor="targetCloseDate" className="cf-label">Target Close Date</label>
            <input id="targetCloseDate" name="targetCloseDate" type="date" value={form.targetCloseDate} onChange={handleChange} className="cf-input" />
          </div>
          <div>
            <label htmlFor="notes" className="cf-label">Notes</label>
            <textarea id="notes" name="notes" rows={3} placeholder="Round strategy notes..." value={form.notes} onChange={handleChange} className="cf-input" />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={() => router.back()} className="btn-outline btn">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary btn">
              {submitting ? 'Creating...' : 'Create Round'}
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
