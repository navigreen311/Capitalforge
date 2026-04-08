'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaxDocument {
  id: string;
  type: string;
  taxYear: number;
  status: 'Generated';
  generatedAt: string;
}

const DOCUMENT_TYPES = [
  '1099-INT',
  '1099-MISC',
  '1099-K',
  'Annual Fee Summary',
  'Year-End Fee Report',
  'Schedule K-1',
  'IRC §163(j) Summary',
] as const;

const AVAILABLE_YEARS = [2025, 2024, 2023, 2022];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GenerateDocumentModal({
  onClose,
  onGenerate,
}: {
  onClose: () => void;
  onGenerate: (doc: TaxDocument) => void;
}) {
  const [docType, setDocType] = useState<string>(DOCUMENT_TYPES[0]);
  const [taxYear, setTaxYear] = useState<number>(2025);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    // Simulate generation delay
    await new Promise((r) => setTimeout(r, 800));

    const doc: TaxDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: docType,
      taxYear,
      status: 'Generated',
      generatedAt: new Date().toISOString(),
    };

    onGenerate(doc);
    setGenerating(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-white">Generate Tax Document</h3>
              <p className="text-xs text-gray-500 mt-0.5">Select document type and tax year</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-lg font-bold"
            >
              &times;
            </button>
          </div>

          {/* Document type selector */}
          <label className="block mb-4">
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
              Document Type
            </span>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="mt-1 w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm font-semibold rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C] transition-colors cursor-pointer"
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          {/* Tax year selector */}
          <label className="block mb-5">
            <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
              Tax Year
            </span>
            <select
              value={taxYear}
              onChange={(e) => setTaxYear(Number(e.target.value))}
              className="mt-1 w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm font-semibold rounded-lg px-3 py-2 focus:outline-none focus:border-[#C9A84C] transition-colors cursor-pointer"
            >
              {AVAILABLE_YEARS.map((y) => (
                <option key={y} value={y}>
                  FY {y}
                </option>
              ))}
            </select>
          </label>

          {/* Document type description */}
          <div className="mb-5 rounded-lg bg-gray-800/60 border border-gray-700/50 px-3 py-2.5">
            <p className="text-xs text-gray-400">
              {docType === '1099-INT' && 'Reports interest income received from financial institutions.'}
              {docType === '1099-MISC' && 'Reports miscellaneous income such as rewards and cashback.'}
              {docType === '1099-K' && 'Reports payment card and third-party network transactions.'}
              {docType === 'Annual Fee Summary' && 'Summarizes all card fees paid during the tax year.'}
              {docType === 'Year-End Fee Report' && 'Detailed fee breakdown by card for year-end reporting.'}
              {docType === 'Schedule K-1' && 'Partner share of income, deductions, and credits (pass-through entities).'}
              {docType === 'IRC §163(j) Summary' && 'Business interest expense deductibility analysis under IRC §163(j).'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#C9A84C] text-gray-950 hover:bg-[#d4b65e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {generating ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-gray-800 border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
