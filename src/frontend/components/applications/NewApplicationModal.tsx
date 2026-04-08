'use client';

// ============================================================
// NewApplicationModal — Create a new funding application
//
// Centered modal with dark theme overlay.
// Fields: client selector, funding type, amount, round number.
// Accepts optional `defaults` prop to pre-fill from ReStack etc.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/global/ToastProvider';

// ── Types ───────────────────────────────────────────────────

export interface NewAppDefaults {
  client_id?: string;
  client_name?: string;
  round?: number;
  type?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaults?: NewAppDefaults;
}

interface ClientOption {
  id: string;
  name: string;
}

// ── Constants ───────────────────────────────────────────────

const FUNDING_TYPES = [
  'Credit Stack',
  'Term Loan',
  'SBA 7(a)',
  'Line of Credit',
  'Equipment',
] as const;

const MOCK_CLIENTS: ClientOption[] = [
  { id: 'biz_001', name: 'Blue Ridge Consulting' },
  { id: 'biz_002', name: 'Summit Capital Group' },
  { id: 'biz_003', name: 'Apex Ventures LLC' },
  { id: 'biz_004', name: 'Crestline Medical LLC' },
  { id: 'biz_005', name: 'Brightline Corp' },
];

// ── Helpers ─────────────────────────────────────────────────

function formatCurrency(value: string): string {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  return num.toLocaleString('en-US');
}

function parseCurrencyToNumber(value: string): number {
  return parseInt(value.replace(/[^\d]/g, '') || '0', 10);
}

// ── Component ───────────────────────────────────────────────

export function NewApplicationModal({ isOpen, onClose, defaults }: Props) {
  const toast = useToast();
  const backdropRef = useRef<HTMLDivElement>(null);

  // Form state
  const [clientId, setClientId] = useState('');
  const [fundingType, setFundingType] = useState('Credit Stack');
  const [amount, setAmount] = useState('');
  const [roundNumber, setRoundNumber] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Client list
  const [clients, setClients] = useState<ClientOption[]>(MOCK_CLIENTS);
  const [loadingClients, setLoadingClients] = useState(false);

  // Fetch clients on open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function fetchClients() {
      setLoadingClients(true);
      try {
        const res = await apiClient.get<{ data: Array<{ id: string; business_name?: string; name?: string }> }>(
          '/v1/clients',
          { params: { limit: 50 } },
        );
        if (!cancelled && res.success && Array.isArray(res.data?.data)) {
          const mapped = res.data.data.map((c) => ({
            id: c.id,
            name: c.business_name || c.name || c.id,
          }));
          if (mapped.length > 0) setClients(mapped);
        }
      } catch {
        // Silently fall back to mock clients
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    }

    fetchClients();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Apply defaults when they change or modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (defaults?.client_id) setClientId(defaults.client_id);
    else setClientId('');

    if (defaults?.type) setFundingType(defaults.type);
    else setFundingType('Credit Stack');

    if (defaults?.round) setRoundNumber(defaults.round);
    else setRoundNumber(1);

    setAmount('');
    setSubmitting(false);
  }, [isOpen, defaults]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  // Submit
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!clientId) {
        toast.warning('Please select a client.');
        return;
      }
      if (parseCurrencyToNumber(amount) <= 0) {
        toast.warning('Please enter a valid amount.');
        return;
      }

      setSubmitting(true);
      try {
        await apiClient.post('/v1/applications', {
          client_id: clientId,
          funding_type: fundingType,
          amount_requested: parseCurrencyToNumber(amount),
          round_number: roundNumber,
        });
        toast.success('Application created successfully.');
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create application';
        toast.error(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [clientId, fundingType, amount, roundNumber, onClose, toast],
  );

  if (!isOpen) return null;

  // Resolve display name for pre-filled client
  const selectedClientLabel =
    defaults?.client_name ||
    clients.find((c) => c.id === clientId)?.name ||
    '';

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="New Application"
    >
      <div className="bg-[#0F1A2E] border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-white font-semibold text-lg">New Application</h2>
            <p className="text-gray-400 text-sm mt-0.5">Create a new funding application</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none p-1"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Client selector */}
          <div>
            <label htmlFor="naw-client" className="block text-sm font-medium text-gray-300 mb-1.5">
              Client
            </label>
            <select
              id="naw-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={loadingClients}
              className="w-full rounded-lg border border-gray-600 bg-[#0A1628] text-gray-100
                         px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50
                         disabled:opacity-50"
            >
              <option value="">
                {loadingClients ? 'Loading clients...' : '-- Select a client --'}
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {selectedClientLabel && clientId && (
              <p className="text-xs text-gray-500 mt-1">Selected: {selectedClientLabel}</p>
            )}
          </div>

          {/* Funding type */}
          <div>
            <label htmlFor="naw-type" className="block text-sm font-medium text-gray-300 mb-1.5">
              Funding Type
            </label>
            <select
              id="naw-type"
              value={fundingType}
              onChange={(e) => setFundingType(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-[#0A1628] text-gray-100
                         px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
            >
              {FUNDING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="naw-amount" className="block text-sm font-medium text-gray-300 mb-1.5">
              Requested Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                id="naw-amount"
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(formatCurrency(e.target.value))}
                placeholder="0"
                className="w-full rounded-lg border border-gray-600 bg-[#0A1628] text-gray-100
                           pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
              />
            </div>
          </div>

          {/* Round number */}
          <div>
            <label htmlFor="naw-round" className="block text-sm font-medium text-gray-300 mb-1.5">
              Round Number
            </label>
            <input
              id="naw-round"
              type="number"
              min={1}
              value={roundNumber}
              onChange={(e) => setRoundNumber(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full rounded-lg border border-gray-600 bg-[#0A1628] text-gray-100
                         px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-300 rounded-lg
                         border border-gray-600 hover:bg-gray-700/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-semibold rounded-lg
                         bg-[#C9A84C] hover:bg-[#b8973e] text-[#0A1628]
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
