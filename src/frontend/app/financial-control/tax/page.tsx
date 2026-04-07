'use client';

// ============================================================
// /financial-control/tax — Tax Document Center
//
// Sections:
//   1. Tax year filter dropdown
//   2. Summary stats (total documents, pending, generated)
//   3. Tax document list (1099s, annual summaries, K-1s)
//   4. Generate tax document button (placeholder)
//   5. Download/export buttons per document
//   6. Bulk export button
// ============================================================

import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocType = '1099-INT' | '1099-MISC' | '1099-K' | 'annual_summary' | 'k1_schedule' | 'year_end_fee';
type DocStatus = 'generated' | 'pending' | 'processing' | 'error';

interface TaxDocument {
  id: string;
  docType: DocType;
  label: string;
  description: string;
  taxYear: number;
  businessName: string;
  ein: string;
  status: DocStatus;
  generatedAt?: string;
  fileSize?: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const TAX_YEARS = [2025, 2024, 2023, 2022];

const PLACEHOLDER_DOCUMENTS: TaxDocument[] = [
  {
    id: 'td_001', docType: '1099-INT', label: '1099-INT — Interest Income',
    description: 'Reports interest income earned on business credit lines and deposit accounts.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2026-01-15T10:30:00Z', fileSize: '48 KB',
  },
  {
    id: 'td_002', docType: '1099-MISC', label: '1099-MISC — Miscellaneous Income',
    description: 'Referral bonuses, signup rewards, and other miscellaneous payments.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2026-01-15T10:32:00Z', fileSize: '36 KB',
  },
  {
    id: 'td_003', docType: 'annual_summary', label: 'Annual Fee & Interest Summary',
    description: 'Year-end summary of all fees, interest charges, and deductible business expenses by card.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2026-01-20T14:00:00Z', fileSize: '124 KB',
  },
  {
    id: 'td_004', docType: 'k1_schedule', label: 'Schedule K-1 Summary',
    description: 'Partner share of income, deductions, and credits for pass-through entity.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'pending',
  },
  {
    id: 'td_005', docType: 'year_end_fee', label: 'Year-End Fee Report',
    description: 'Detailed breakdown of annual fees, late fees, foreign transaction fees, and other charges.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'processing',
  },
  {
    id: 'td_006', docType: '1099-K', label: '1099-K — Payment Card Transactions',
    description: 'Reports payment card and third party network transactions exceeding $600 threshold.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2026-01-18T09:15:00Z', fileSize: '52 KB',
  },
  // 2024 documents
  {
    id: 'td_007', docType: '1099-INT', label: '1099-INT — Interest Income',
    description: 'Reports interest income earned on business credit lines and deposit accounts.',
    taxYear: 2024, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2025-01-14T11:00:00Z', fileSize: '44 KB',
  },
  {
    id: 'td_008', docType: 'annual_summary', label: 'Annual Fee & Interest Summary',
    description: 'Year-end summary of all fees, interest charges, and deductible business expenses by card.',
    taxYear: 2024, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2025-01-20T08:30:00Z', fileSize: '118 KB',
  },
  {
    id: 'td_009', docType: '1099-MISC', label: '1099-MISC — Miscellaneous Income',
    description: 'Referral bonuses, signup rewards, and other miscellaneous payments.',
    taxYear: 2024, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2025-01-14T11:05:00Z', fileSize: '32 KB',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOC_TYPE_CONFIG: Record<DocType, { color: string; icon: string }> = {
  '1099-INT':       { color: 'bg-blue-900 text-blue-300 border-blue-700',     icon: 'INT' },
  '1099-MISC':      { color: 'bg-purple-900 text-purple-300 border-purple-700', icon: 'MSC' },
  '1099-K':         { color: 'bg-teal-900 text-teal-300 border-teal-700',     icon: 'K' },
  'annual_summary': { color: 'bg-[#0A1628] text-[#C9A84C] border-[#C9A84C]/40', icon: 'SUM' },
  'k1_schedule':    { color: 'bg-indigo-900 text-indigo-300 border-indigo-700', icon: 'K-1' },
  'year_end_fee':   { color: 'bg-orange-900 text-orange-300 border-orange-700', icon: 'FEE' },
};

const STATUS_CONFIG: Record<DocStatus, { label: string; badgeClass: string }> = {
  generated:  { label: 'Generated',  badgeClass: 'bg-green-900 text-green-300 border-green-700' },
  pending:    { label: 'Pending',    badgeClass: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
  processing: { label: 'Processing', badgeClass: 'bg-blue-900 text-blue-300 border-blue-700' },
  error:      { label: 'Error',      badgeClass: 'bg-red-900 text-red-300 border-red-700' },
};

function formatDate(s: string): string {
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
}

function showToast(message: string) {
  const el = document.createElement('div');
  el.textContent = message;
  el.className =
    'fixed bottom-6 right-6 z-[100] px-5 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-100 shadow-2xl';
  el.style.animation = 'fadeInUp 0.3s ease, fadeOut 0.3s ease 2.5s forwards';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinancialControlTaxPage() {
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [generating, setGenerating] = useState(false);
  const [documents, setDocuments] = useState<TaxDocument[]>(PLACEHOLDER_DOCUMENTS);

  const filtered = useMemo(
    () => documents.filter((d) => d.taxYear === selectedYear),
    [documents, selectedYear],
  );

  const generatedCount = filtered.filter((d) => d.status === 'generated').length;
  const pendingCount = filtered.filter((d) => d.status === 'pending' || d.status === 'processing').length;

  function handleGenerate() {
    setGenerating(true);
    setTimeout(() => {
      const newDoc: TaxDocument = {
        id: `td_gen_${Date.now()}`,
        docType: 'annual_summary',
        label: 'Annual Fee & Interest Summary (Custom)',
        description: 'Custom-generated annual summary for the selected tax year.',
        taxYear: selectedYear,
        businessName: 'Acme Holdings LLC',
        ein: '12-3456789',
        status: 'generated',
        generatedAt: new Date().toISOString(),
        fileSize: '96 KB',
      };
      setDocuments((prev) => [newDoc, ...prev]);
      setGenerating(false);
      showToast(`Tax document generated for ${selectedYear}.`);
    }, 1200);
  }

  function handleDownload(doc: TaxDocument) {
    // Placeholder: generate a simple text file
    const content = [
      `CapitalForge Tax Document Export`,
      `================================`,
      `Document: ${doc.label}`,
      `Type: ${doc.docType}`,
      `Tax Year: ${doc.taxYear}`,
      `Business: ${doc.businessName}`,
      `EIN: ${doc.ein}`,
      `Status: ${doc.status}`,
      doc.generatedAt ? `Generated: ${formatDate(doc.generatedAt)}` : '',
      ``,
      doc.description,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.docType}-${doc.taxYear}-${doc.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${doc.label}.`);
  }

  function handleBulkExport() {
    const exportable = filtered.filter((d) => d.status === 'generated');
    if (exportable.length === 0) {
      showToast('No generated documents to export.');
      return;
    }
    const rows = [
      'ID,Type,Label,Tax Year,Business,EIN,Status,Generated',
      ...exportable.map((d) =>
        `${d.id},${d.docType},"${d.label}",${d.taxYear},"${d.businessName}",${d.ein},${d.status},${d.generatedAt ?? ''}`,
      ),
    ].join('\n');

    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax-documents-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${exportable.length} documents for ${selectedYear}.`);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-6">
      {/* Toast animation styles */}
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tax Document Center</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Manage and download tax documents, 1099s, and annual summaries.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Year selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#C9A84C]"
          >
            {TAX_YEARS.map((y) => (
              <option key={y} value={y}>Tax Year {y}</option>
            ))}
          </select>
          <button
            onClick={handleBulkExport}
            className="px-4 py-2 rounded-lg border border-[#C9A84C]/40 text-[#C9A84C] hover:bg-[#C9A84C]/10 text-sm font-semibold transition-colors"
          >
            Export All
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-amber-400 disabled:opacity-50 text-gray-900 text-sm font-semibold transition-colors"
          >
            {generating ? 'Generating...' : '+ Generate Document'}
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Documents', value: filtered.length, color: 'text-white' },
          { label: 'Generated', value: generatedCount, color: 'text-green-400' },
          { label: 'Pending / Processing', value: pendingCount, color: pendingCount > 0 ? 'text-yellow-400' : 'text-green-400' },
          { label: 'Tax Year', value: selectedYear, color: 'text-[#C9A84C]' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Document list */}
      <div className="rounded-xl border border-gray-800 bg-[#0A1628] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-base font-semibold text-white">Documents for {selectedYear}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length} document{filtered.length !== 1 ? 's' : ''} available
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/60 text-gray-400 text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Type</th>
                <th className="text-left px-4 py-3 font-semibold">Document</th>
                <th className="text-left px-4 py-3 font-semibold">Business</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Generated</th>
                <th className="text-right px-4 py-3 font-semibold">Size</th>
                <th className="text-center px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.map((doc) => {
                const typeCfg = DOC_TYPE_CONFIG[doc.docType];
                const statusCfg = STATUS_CONFIG[doc.status];

                return (
                  <tr key={doc.id} className="bg-[#0A1628] hover:bg-gray-900/50 transition-colors">
                    <td className="px-5 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${typeCfg.color}`}>
                        {typeCfg.icon}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-100">{doc.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5 max-w-[300px]">{doc.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-200">{doc.businessName}</p>
                      <p className="text-xs text-gray-500 font-mono">{doc.ein}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusCfg.badgeClass}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-400">
                      {doc.generatedAt ? formatDate(doc.generatedAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">
                      {doc.fileSize ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {doc.status === 'generated' ? (
                        <button
                          onClick={() => handleDownload(doc)}
                          className="text-xs font-semibold text-[#C9A84C] hover:text-amber-300 transition-colors"
                        >
                          Download
                        </button>
                      ) : doc.status === 'processing' ? (
                        <span className="text-xs text-blue-400 animate-pulse">Processing...</span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="px-5 py-10 text-center text-gray-600 text-sm">
              No tax documents found for {selectedYear}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
