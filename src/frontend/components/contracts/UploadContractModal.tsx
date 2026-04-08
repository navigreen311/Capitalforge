'use client';

// ============================================================
// UploadContractModal — Full-featured contract upload modal
// with file drop zone, contract type selector, client selector,
// counterparty name, dates, auto-renewal toggle, notice period,
// governing state, and AI risk analysis checkbox.
// ============================================================

import { useState, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadContractData {
  file: File | null;
  contractType: string;
  client: string;
  counterpartyName: string;
  effectiveDate: string;
  expiryDate: string;
  autoRenewal: boolean;
  noticePeriod: string;
  governingState: string;
  runAiAnalysis: boolean;
}

interface UploadContractModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: UploadContractData) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTRACT_TYPES = [
  'MCA Agreement',
  'Line of Credit',
  'Term Loan',
  'Revenue Share',
  'Advisor Agreement',
  'Broker Agreement',
];

const CLIENTS = [
  'Apex Ventures LLC',
  'NovaTech Solutions Inc.',
  'Horizon Retail Partners',
  'Summit Capital Group',
  'Blue Ridge Consulting',
  'Crestline Medical LLC',
];

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
];

const INITIAL_FORM: UploadContractData = {
  file: null,
  contractType: '',
  client: '',
  counterpartyName: '',
  effectiveDate: '',
  expiryDate: '',
  autoRenewal: false,
  noticePeriod: '',
  governingState: '',
  runAiAnalysis: true,
};

// ---------------------------------------------------------------------------
// Shared input styles
// ---------------------------------------------------------------------------

const INPUT_CLS =
  'w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 placeholder:text-gray-600';

const LABEL_CLS = 'text-xs text-gray-400 font-semibold uppercase block mb-1';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UploadContractModal({ open, onClose, onSubmit }: UploadContractModalProps) {
  const [form, setForm] = useState<UploadContractData>(INITIAL_FORM);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const update = <K extends keyof UploadContractData>(key: K, value: UploadContractData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) update('file', file);
  };

  const canSubmit = form.file && form.contractType && form.client;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(form);
    setForm(INITIAL_FORM);
    onClose();
  };

  const handleClose = () => {
    setForm(INITIAL_FORM);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-[#0f1d32] border border-gray-700 rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-800">
          <h3 className="text-lg font-bold text-white">Upload Contract</h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* File drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-[#C9A84C] bg-[#C9A84C]/10'
                : 'border-gray-700 bg-[#0A1628] hover:border-gray-500'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.doc"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) update('file', e.target.files[0]); }}
            />
            {form.file ? (
              <div>
                <p className="text-sm text-[#C9A84C] font-semibold">{form.file.name}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {(form.file.size / 1024).toFixed(1)} KB
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); update('file', null); }}
                  className="text-xs text-gray-500 hover:text-red-400 mt-1 underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <svg className="mx-auto w-8 h-8 text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-gray-400 text-sm mb-1">Drop contract file here or click to browse</p>
                <p className="text-gray-500 text-xs">Supports PDF, DOCX, DOC</p>
              </div>
            )}
          </div>

          {/* Contract type + Client — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Contract Type *</label>
              <select
                value={form.contractType}
                onChange={(e) => update('contractType', e.target.value)}
                className={INPUT_CLS}
              >
                <option value="">Select type...</option>
                {CONTRACT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Client *</label>
              <select
                value={form.client}
                onChange={(e) => update('client', e.target.value)}
                className={INPUT_CLS}
              >
                <option value="">Select client...</option>
                {CLIENTS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Counterparty name */}
          <div>
            <label className={LABEL_CLS}>Counterparty Name</label>
            <input
              type="text"
              value={form.counterpartyName}
              onChange={(e) => update('counterpartyName', e.target.value)}
              className={INPUT_CLS}
              placeholder="e.g. First National Lending Corp"
            />
          </div>

          {/* Effective / Expiry dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Effective Date</label>
              <input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => update('effectiveDate', e.target.value)}
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Expiry Date</label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={(e) => update('expiryDate', e.target.value)}
                className={INPUT_CLS}
              />
            </div>
          </div>

          {/* Auto-renewal toggle + Notice period */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => update('autoRenewal', !form.autoRenewal)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.autoRenewal ? 'bg-[#C9A84C]' : 'bg-gray-700'
                }`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    form.autoRenewal ? 'translate-x-5' : ''
                  }`}
                />
              </div>
              <span className="text-xs text-gray-300 font-medium">Auto-Renewal</span>
            </label>

            {form.autoRenewal && (
              <div className="flex-1">
                <input
                  type="text"
                  value={form.noticePeriod}
                  onChange={(e) => update('noticePeriod', e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Notice period (e.g. 30 days)"
                />
              </div>
            )}
          </div>

          {/* Governing state */}
          <div>
            <label className={LABEL_CLS}>Governing State</label>
            <select
              value={form.governingState}
              onChange={(e) => update('governingState', e.target.value)}
              className={INPUT_CLS}
            >
              <option value="">Select state...</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Run AI risk analysis checkbox */}
          <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-800 bg-[#0A1628] cursor-pointer hover:border-gray-600 transition-colors">
            <input
              type="checkbox"
              checked={form.runAiAnalysis}
              onChange={(e) => update('runAiAnalysis', e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-[#C9A84C] focus:ring-[#C9A84C]/50 accent-[#C9A84C]"
            />
            <div>
              <p className="text-sm font-semibold text-gray-200">Run AI risk analysis</p>
              <p className="text-xs text-gray-500">Automatically scan for red flags, missing protections, and compliance issues</p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
              canSubmit
                ? 'bg-[#C9A84C] hover:bg-[#b8973f] text-[#0A1628]'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            Upload Contract
          </button>
        </div>
      </div>
    </div>
  );
}
