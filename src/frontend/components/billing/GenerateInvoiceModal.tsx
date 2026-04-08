'use client';

// ============================================================
// GenerateInvoiceModal — Enhanced invoice generation with
// funding amount, fee schedule display, auto-calculated fees
// based on deal structure, line items breakdown.
// ============================================================

import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DealStructure = 'revenue_share' | 'flat_fee' | 'term_loan' | 'line_of_credit' | 'mca';

export interface InvoicePayload {
  id: string;
  invoiceNumber: string;
  client: string;
  amount: number;
  dueDate: string;
  issuedDate: string;
  status: 'draft';
  dealStructure: DealStructure;
  description: string;
}

export interface GenerateInvoiceModalProps {
  onClose: () => void;
  onSubmit: (invoice: InvoicePayload) => void;
  nextNumber: number;
}

// ---------------------------------------------------------------------------
// Fee schedule rates by deal structure
// ---------------------------------------------------------------------------

const FEE_SCHEDULE: Record<DealStructure, { label: string; type: 'flat' | 'percentage'; rate: number; description: string }> = {
  flat_fee:       { label: 'Flat Fee',       type: 'flat',       rate: 2500,  description: 'Fixed advisory / origination fee' },
  revenue_share:  { label: 'Revenue Share',  type: 'percentage', rate: 8.5,   description: 'Percentage of funded amount' },
  mca:            { label: 'MCA',            type: 'percentage', rate: 12.0,  description: 'Percentage of advance amount' },
  term_loan:      { label: 'Term Loan',      type: 'percentage', rate: 3.5,   description: 'Percentage of loan principal' },
  line_of_credit: { label: 'Line of Credit', type: 'percentage', rate: 4.0,   description: 'Percentage of credit line' },
};

const DEAL_STRUCTURE_OPTIONS: { value: DealStructure; label: string }[] = [
  { value: 'flat_fee',       label: 'Flat Fee' },
  { value: 'revenue_share',  label: 'Revenue Share' },
  { value: 'mca',            label: 'Merchant Cash Advance (MCA)' },
  { value: 'term_loan',      label: 'Term Loan' },
  { value: 'line_of_credit', label: 'Line of Credit' },
];

const PLACEHOLDER_CLIENTS: { name: string; defaultDescription: string }[] = [
  { name: 'Apex Ventures LLC',       defaultDescription: 'Origination fee + revenue share' },
  { name: 'NovaTech Solutions Inc.',  defaultDescription: 'Advisory flat fee — funding round facilitation' },
  { name: 'Horizon Retail Partners',  defaultDescription: 'MCA origination + servicing fee' },
  { name: 'Summit Capital Group',     defaultDescription: 'Term loan processing fee' },
  { name: 'Blue Ridge Consulting',    defaultDescription: 'LOC setup fee' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Line item interface
// ---------------------------------------------------------------------------

interface LineItem {
  id: string;
  label: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GenerateInvoiceModal({ onClose, onSubmit, nextNumber }: GenerateInvoiceModalProps) {
  const [form, setForm] = useState({
    client: '',
    dealStructure: 'flat_fee' as DealStructure,
    fundingAmount: '',
    dueDate: '',
    description: '',
  });
  const [generating, setGenerating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customLineItems, setCustomLineItems] = useState<LineItem[]>([]);
  const [newLineLabel, setNewLineLabel] = useState('');
  const [newLineAmount, setNewLineAmount] = useState('');

  // Current fee schedule entry
  const feeSchedule = FEE_SCHEDULE[form.dealStructure];

  // Auto-calculate fee
  const calculatedFee = useMemo(() => {
    const funding = Number(form.fundingAmount) || 0;
    if (feeSchedule.type === 'flat') {
      return feeSchedule.rate;
    }
    return funding * (feeSchedule.rate / 100);
  }, [form.fundingAmount, form.dealStructure, feeSchedule]);

  // Build line items
  const lineItems = useMemo(() => {
    const items: LineItem[] = [];
    const funding = Number(form.fundingAmount) || 0;

    if (feeSchedule.type === 'flat') {
      items.push({
        id: 'fee_base',
        label: `${feeSchedule.label} — Fixed Fee`,
        amount: feeSchedule.rate,
      });
    } else {
      items.push({
        id: 'fee_base',
        label: `${feeSchedule.label} Fee (${feeSchedule.rate}% of ${formatCurrency(funding)})`,
        amount: calculatedFee,
      });
    }

    // Add custom line items
    items.push(...customLineItems);

    return items;
  }, [calculatedFee, feeSchedule, form.fundingAmount, customLineItems]);

  // Total amount
  const totalAmount = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + item.amount, 0);
  }, [lineItems]);

  function handleClientChange(clientName: string) {
    const match = PLACEHOLDER_CLIENTS.find((c) => c.name === clientName);
    setForm({
      ...form,
      client: clientName,
      description: match ? match.defaultDescription : form.description,
    });
    if (clientName) setErrors((e) => ({ ...e, client: '' }));
  }

  function addLineItem() {
    if (!newLineLabel.trim() || !newLineAmount || Number(newLineAmount) <= 0) return;
    setCustomLineItems((prev) => [
      ...prev,
      { id: `line_${Date.now()}`, label: newLineLabel.trim(), amount: Number(newLineAmount) },
    ]);
    setNewLineLabel('');
    setNewLineAmount('');
  }

  function removeLineItem(id: string) {
    setCustomLineItems((prev) => prev.filter((li) => li.id !== id));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.client) errs.client = 'Client is required';
    if (feeSchedule.type !== 'flat' && (!form.fundingAmount || Number(form.fundingAmount) <= 0)) {
      errs.fundingAmount = 'Funding amount is required for percentage-based fees';
    }
    if (!form.dueDate) errs.dueDate = 'Due date is required';
    if (totalAmount <= 0) errs.total = 'Total amount must be greater than zero';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleGenerate() {
    if (!validate()) return;
    setGenerating(true);
    setTimeout(() => {
      const invNum = `INV-${String(nextNumber).padStart(4, '0')}`;
      const newInvoice: InvoicePayload = {
        id: `inv_gen_${Date.now()}`,
        invoiceNumber: invNum,
        client: form.client,
        amount: totalAmount,
        dueDate: form.dueDate,
        issuedDate: new Date().toISOString().split('T')[0],
        status: 'draft',
        dealStructure: form.dealStructure,
        description: form.description || `${feeSchedule.label} invoice`,
      };
      setGenerating(false);
      onSubmit(newInvoice);
      onClose();
    }, 800);
  }

  const inputBase = 'w-full rounded-lg bg-gray-800 border px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]';
  const labelBase = 'block text-xs text-gray-400 font-semibold mb-1 uppercase tracking-wide';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Generate Invoice</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="space-y-4">
          {/* Client */}
          <div>
            <label className={labelBase}>Client Name</label>
            <select
              value={form.client}
              onChange={(e) => handleClientChange(e.target.value)}
              className={`${inputBase} ${errors.client ? 'border-red-500' : 'border-gray-700'}`}
            >
              <option value="">Select a client...</option>
              {PLACEHOLDER_CLIENTS.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
            {errors.client && <p className="text-xs text-red-400 mt-1">{errors.client}</p>}
          </div>

          {/* Deal Structure */}
          <div>
            <label className={labelBase}>Deal Structure</label>
            <select
              value={form.dealStructure}
              onChange={(e) => setForm({ ...form, dealStructure: e.target.value as DealStructure })}
              className={`${inputBase} border-gray-700`}
            >
              {DEAL_STRUCTURE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Fee Schedule Display */}
          <div className="rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Fee Schedule</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">{feeSchedule.description}</span>
              <span className="text-sm font-bold text-[#C9A84C]">
                {feeSchedule.type === 'flat'
                  ? formatCurrency(feeSchedule.rate)
                  : `${feeSchedule.rate}%`}
              </span>
            </div>
          </div>

          {/* Funding Amount */}
          <div>
            <label className={labelBase}>Funding Amount (USD)</label>
            <input
              type="number"
              value={form.fundingAmount}
              onChange={(e) => {
                setForm({ ...form, fundingAmount: e.target.value });
                if (e.target.value) setErrors((er) => ({ ...er, fundingAmount: '' }));
              }}
              placeholder="0.00"
              className={`${inputBase} ${errors.fundingAmount ? 'border-red-500' : 'border-gray-700'}`}
            />
            {errors.fundingAmount && <p className="text-xs text-red-400 mt-1">{errors.fundingAmount}</p>}
          </div>

          {/* Auto-calculated Fee Display */}
          {(Number(form.fundingAmount) > 0 || feeSchedule.type === 'flat') && (
            <div className="rounded-lg border border-[#C9A84C]/30 bg-[#0A1628] px-4 py-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Calculated Fee</p>
              <p className="text-lg font-black text-[#C9A84C]">
                {formatCurrency(calculatedFee)}
              </p>
              {feeSchedule.type === 'percentage' && Number(form.fundingAmount) > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {feeSchedule.rate}% of {formatCurrency(Number(form.fundingAmount))}
                </p>
              )}
              {feeSchedule.type === 'flat' && (
                <p className="text-xs text-gray-400 mt-0.5">Fixed fee — not affected by funding amount</p>
              )}
            </div>
          )}

          {/* Due Date */}
          <div>
            <label className={labelBase}>Due Date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => {
                setForm({ ...form, dueDate: e.target.value });
                if (e.target.value) setErrors((er) => ({ ...er, dueDate: '' }));
              }}
              className={`${inputBase} ${errors.dueDate ? 'border-red-500' : 'border-gray-700'}`}
            />
            {errors.dueDate && <p className="text-xs text-red-400 mt-1">{errors.dueDate}</p>}
          </div>

          {/* Description */}
          <div>
            <label className={labelBase}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Invoice description..."
              rows={2}
              className={`${inputBase} border-gray-700 resize-none`}
            />
          </div>

          {/* Line Items Breakdown */}
          <div>
            <label className={labelBase}>Line Items</label>
            <div className="rounded-lg border border-gray-700 bg-gray-800/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-3 py-2 text-left text-xs text-gray-500 font-semibold">Item</th>
                    <th className="px-3 py-2 text-right text-xs text-gray-500 font-semibold w-28">Amount</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {lineItems.map((li) => (
                    <tr key={li.id}>
                      <td className="px-3 py-2 text-gray-300 text-xs">{li.label}</td>
                      <td className="px-3 py-2 text-right text-gray-100 font-semibold tabular-nums text-xs">
                        {formatCurrency(li.amount)}
                      </td>
                      <td className="px-2 py-2">
                        {li.id !== 'fee_base' && (
                          <button
                            onClick={() => removeLineItem(li.id)}
                            className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                            title="Remove"
                          >
                            &times;
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-600">
                    <td className="px-3 py-2 text-xs font-bold text-gray-300 uppercase">Total</td>
                    <td className="px-3 py-2 text-right text-sm font-black text-[#C9A84C] tabular-nums">
                      {formatCurrency(totalAmount)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>

              {/* Add custom line item */}
              <div className="border-t border-gray-700 px-3 py-2 flex items-center gap-2">
                <input
                  type="text"
                  value={newLineLabel}
                  onChange={(e) => setNewLineLabel(e.target.value)}
                  placeholder="Additional item..."
                  className="flex-1 bg-transparent border-none text-xs text-gray-300 placeholder-gray-600 focus:outline-none"
                />
                <input
                  type="number"
                  value={newLineAmount}
                  onChange={(e) => setNewLineAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-24 bg-transparent border-none text-xs text-gray-300 placeholder-gray-600 text-right focus:outline-none tabular-nums"
                />
                <button
                  onClick={addLineItem}
                  className="text-xs text-[#C9A84C] hover:text-amber-300 font-semibold transition-colors whitespace-nowrap"
                >
                  + Add
                </button>
              </div>
            </div>
            {errors.total && <p className="text-xs text-red-400 mt-1">{errors.total}</p>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex-1 px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 disabled:opacity-50 text-gray-900 text-sm font-semibold transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}
