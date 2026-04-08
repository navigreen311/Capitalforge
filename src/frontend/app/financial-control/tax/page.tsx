'use client';

// ============================================================
// /financial-control/tax — Tax Document Center
//
// Sections:
//   1. Client/business search selector (1A)
//   2. Tax year filter dropdown (reloads data on change)
//   3. Summary stats (total documents, pending, generated)
//   4. Tax document list (1099s, annual summaries, K-1s)
//   5. Generate tax document button (placeholder)
//   6. Download buttons per document — disabled for non-generated (1B)
//   7. Expandable rows with key figures + actions (1E)
//   8. Bulk export button
// ============================================================

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

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
  /** Key figures for expandable detail (1E) */
  keyFigures?: {
    totalInterest: number;
    deductible: number;
    nonDeductible: number;
    annualFees: number;
    cashAdvanceFees: number;
  };
}

interface PlaceholderClient {
  id: string;
  name: string;
  ein: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const TAX_YEARS = [2025, 2024, 2023, 2022];

const CLIENTS: PlaceholderClient[] = [
  { id: 'all', name: 'All Clients', ein: '' },
  { id: 'c1', name: 'Acme Holdings LLC', ein: '12-3456789' },
  { id: 'c2', name: 'Vertex Capital Group', ein: '98-7654321' },
  { id: 'c3', name: 'Northwind Traders Inc', ein: '55-1234567' },
  { id: 'c4', name: 'Contoso Partners LP', ein: '33-9876543' },
  { id: 'c5', name: 'Tailspin Ventures Corp', ein: '77-4561230' },
];

const PLACEHOLDER_DOCUMENTS: TaxDocument[] = [
  {
    id: 'td_001', docType: '1099-INT', label: '1099-INT — Interest Income',
    description: 'Reports interest income earned on business credit lines and deposit accounts.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2026-01-15T10:30:00Z', fileSize: '48 KB',
    keyFigures: { totalInterest: 18_450, deductible: 15_200, nonDeductible: 3_250, annualFees: 1_389, cashAdvanceFees: 225 },
  },
  {
    id: 'td_002', docType: '1099-MISC', label: '1099-MISC — Miscellaneous Income',
    description: 'Referral bonuses, signup rewards, and other miscellaneous payments.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2026-01-15T10:32:00Z', fileSize: '36 KB',
    keyFigures: { totalInterest: 12_800, deductible: 10_500, nonDeductible: 2_300, annualFees: 695, cashAdvanceFees: 0 },
  },
  {
    id: 'td_003', docType: 'annual_summary', label: 'Annual Fee & Interest Summary',
    description: 'Year-end summary of all fees, interest charges, and deductible business expenses by card.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2026-01-20T14:00:00Z', fileSize: '124 KB',
    keyFigures: { totalInterest: 42_600, deductible: 36_100, nonDeductible: 6_500, annualFees: 2_084, cashAdvanceFees: 450 },
  },
  {
    id: 'td_004', docType: 'k1_schedule', label: 'Schedule K-1 Summary',
    description: 'Partner share of income, deductions, and credits for pass-through entity.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'pending',
    keyFigures: { totalInterest: 18_450, deductible: 15_200, nonDeductible: 3_250, annualFees: 1_389, cashAdvanceFees: 225 },
  },
  {
    id: 'td_005', docType: 'year_end_fee', label: 'Year-End Fee Report',
    description: 'Detailed breakdown of annual fees, late fees, foreign transaction fees, and other charges.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'processing',
    keyFigures: { totalInterest: 18_450, deductible: 15_200, nonDeductible: 3_250, annualFees: 1_389, cashAdvanceFees: 225 },
  },
  {
    id: 'td_006', docType: '1099-K', label: '1099-K — Payment Card Transactions',
    description: 'Reports payment card and third party network transactions exceeding $600 threshold.',
    taxYear: 2025, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2026-01-18T09:15:00Z', fileSize: '52 KB',
    keyFigures: { totalInterest: 9_400, deductible: 7_800, nonDeductible: 1_600, annualFees: 495, cashAdvanceFees: 75 },
  },
  // Vertex Capital Group documents
  {
    id: 'td_010', docType: '1099-INT', label: '1099-INT — Interest Income',
    description: 'Reports interest income earned on business credit lines and deposit accounts.',
    taxYear: 2025, businessName: 'Vertex Capital Group', ein: '98-7654321',
    status: 'generated', generatedAt: '2026-01-16T08:00:00Z', fileSize: '42 KB',
    keyFigures: { totalInterest: 24_300, deductible: 20_100, nonDeductible: 4_200, annualFees: 1_590, cashAdvanceFees: 150 },
  },
  {
    id: 'td_011', docType: 'annual_summary', label: 'Annual Fee & Interest Summary',
    description: 'Year-end summary of all fees, interest charges, and deductible business expenses by card.',
    taxYear: 2025, businessName: 'Vertex Capital Group', ein: '98-7654321',
    status: 'pending',
    keyFigures: { totalInterest: 24_300, deductible: 20_100, nonDeductible: 4_200, annualFees: 1_590, cashAdvanceFees: 150 },
  },
  // 2024 documents
  {
    id: 'td_007', docType: '1099-INT', label: '1099-INT — Interest Income',
    description: 'Reports interest income earned on business credit lines and deposit accounts.',
    taxYear: 2024, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2025-01-14T11:00:00Z', fileSize: '44 KB',
    keyFigures: { totalInterest: 16_200, deductible: 13_800, nonDeductible: 2_400, annualFees: 1_195, cashAdvanceFees: 180 },
  },
  {
    id: 'td_008', docType: 'annual_summary', label: 'Annual Fee & Interest Summary',
    description: 'Year-end summary of all fees, interest charges, and deductible business expenses by card.',
    taxYear: 2024, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2025-01-20T08:30:00Z', fileSize: '118 KB',
    keyFigures: { totalInterest: 38_900, deductible: 33_200, nonDeductible: 5_700, annualFees: 1_889, cashAdvanceFees: 375 },
  },
  {
    id: 'td_009', docType: '1099-MISC', label: '1099-MISC — Miscellaneous Income',
    description: 'Referral bonuses, signup rewards, and other miscellaneous payments.',
    taxYear: 2024, businessName: 'Acme Holdings LLC', ein: '12-3456789',
    status: 'generated', generatedAt: '2025-01-14T11:05:00Z', fileSize: '32 KB',
    keyFigures: { totalInterest: 8_600, deductible: 7_200, nonDeductible: 1_400, annualFees: 495, cashAdvanceFees: 0 },
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

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
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
// Client Search Selector Component (1A)
// ---------------------------------------------------------------------------

function ClientSelector({
  clients,
  selectedId,
  onSelect,
}: {
  clients: PlaceholderClient[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      clients.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.ein.includes(query),
      ),
    [clients, query],
  );

  const selected = clients.find((c) => c.id === selectedId);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 rounded-lg bg-gray-800 border border-gray-700 px-4 py-2.5 text-sm text-gray-100 hover:border-[#C9A84C]/60 focus:outline-none focus:border-[#C9A84C] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <span className="truncate">{selected?.name ?? 'Select Client'}</span>
          {selected && selected.id !== 'all' && (
            <span className="text-xs text-gray-500 font-mono shrink-0">{selected.ein}</span>
          )}
        </div>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg bg-gray-800 border border-gray-700 shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-700">
            <div className="flex items-center gap-2 rounded-md bg-gray-900 px-3 py-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients by name or EIN..."
                className="bg-transparent text-sm text-gray-100 placeholder-gray-500 focus:outline-none w-full"
                autoFocus
              />
            </div>
          </div>
          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-500">No clients found.</div>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onSelect(c.id);
                  setOpen(false);
                  setQuery('');
                }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700/60 transition-colors flex items-center justify-between ${
                  c.id === selectedId ? 'bg-[#C9A84C]/10 text-[#C9A84C]' : 'text-gray-200'
                }`}
              >
                <span>{c.name}</span>
                {c.ein && <span className="text-xs text-gray-500 font-mono">{c.ein}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinancialControlTaxPage() {
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [generating, setGenerating] = useState(false);
  const [documents, setDocuments] = useState<TaxDocument[]>(PLACEHOLDER_DOCUMENTS);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Filter by year and client (1A)
  const filtered = useMemo(() => {
    let docs = documents.filter((d) => d.taxYear === selectedYear);
    if (selectedClient !== 'all') {
      const client = CLIENTS.find((c) => c.id === selectedClient);
      if (client) {
        docs = docs.filter((d) => d.ein === client.ein);
      }
    }
    return docs;
  }, [documents, selectedYear, selectedClient]);

  const generatedCount = filtered.filter((d) => d.status === 'generated').length;
  const pendingCount = filtered.filter((d) => d.status === 'pending' || d.status === 'processing').length;

  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function handleGenerate() {
    setGenerating(true);
    const client = selectedClient !== 'all'
      ? CLIENTS.find((c) => c.id === selectedClient)
      : CLIENTS[1]; // default to Acme
    setTimeout(() => {
      const newDoc: TaxDocument = {
        id: `td_gen_${Date.now()}`,
        docType: 'annual_summary',
        label: 'Annual Fee & Interest Summary (Custom)',
        description: 'Custom-generated annual summary for the selected tax year.',
        taxYear: selectedYear,
        businessName: client?.name ?? 'Acme Holdings LLC',
        ein: client?.ein ?? '12-3456789',
        status: 'generated',
        generatedAt: new Date().toISOString(),
        fileSize: '96 KB',
        keyFigures: { totalInterest: 18_450, deductible: 15_200, nonDeductible: 3_250, annualFees: 1_389, cashAdvanceFees: 225 },
      };
      setDocuments((prev) => [newDoc, ...prev]);
      setGenerating(false);
      showToast(`Tax document generated for ${selectedYear}.`);
    }, 1200);
  }

  // 1B — Download handler: generates text summary, triggers .txt download
  function handleDownload(doc: TaxDocument) {
    const kf = doc.keyFigures;
    const lines = [
      `CapitalForge Tax Document Export`,
      `================================`,
      `Document: ${doc.label}`,
      `Type:     ${doc.docType}`,
      `Tax Year: ${doc.taxYear}`,
      `Business: ${doc.businessName}`,
      `EIN:      ${doc.ein}`,
      `Status:   ${doc.status}`,
      doc.generatedAt ? `Generated: ${formatDate(doc.generatedAt)}` : '',
      ``,
      `Description`,
      `-----------`,
      doc.description,
      ``,
    ];

    if (kf) {
      lines.push(
        `Key Figures`,
        `-----------`,
        `  Total Interest:    ${fmtCurrency(kf.totalInterest)}`,
        `  Deductible:        ${fmtCurrency(kf.deductible)}`,
        `  Non-deductible:    ${fmtCurrency(kf.nonDeductible)}`,
        `  Annual Fees:       ${fmtCurrency(kf.annualFees)}`,
        `  Cash Advance Fees: ${fmtCurrency(kf.cashAdvanceFees)}`,
        ``,
      );
    }

    lines.push(`--- End of Document ---`);

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.docType}-${doc.taxYear}-${doc.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${doc.label}.`);
  }

  function handleEmailAccountant(doc: TaxDocument) {
    showToast(`Email sent to accountant for "${doc.label}".`);
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
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Tax Document Center</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Manage and download tax documents, 1099s, and annual summaries.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Year selector */}
          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(Number(e.target.value));
              setExpandedRows(new Set()); // collapse rows on year change
            }}
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

      {/* Client / Business Selector (1A) */}
      <div className="flex items-center gap-3">
        <ClientSelector
          clients={CLIENTS}
          selectedId={selectedClient}
          onSelect={(id) => {
            setSelectedClient(id);
            setExpandedRows(new Set()); // collapse rows on client change
          }}
        />
        {selectedClient !== 'all' && (
          <button
            onClick={() => { setSelectedClient('all'); setExpandedRows(new Set()); }}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors underline"
          >
            Clear filter
          </button>
        )}
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
            {selectedClient !== 'all' && ` for ${CLIENTS.find((c) => c.id === selectedClient)?.name}`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/60 text-gray-400 text-xs uppercase tracking-wide">
                <th className="w-10 px-3 py-3"></th>{/* expand chevron column */}
                <th className="text-left px-4 py-3 font-semibold">Type</th>
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
                const isExpanded = expandedRows.has(doc.id);
                const isGenerated = doc.status === 'generated';
                const isProcessing = doc.status === 'processing';

                return (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    typeCfg={typeCfg}
                    statusCfg={statusCfg}
                    isExpanded={isExpanded}
                    isGenerated={isGenerated}
                    isProcessing={isProcessing}
                    onToggle={() => toggleRow(doc.id)}
                    onDownload={() => handleDownload(doc)}
                    onEmail={() => handleEmailAccountant(doc)}
                  />
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="px-5 py-10 text-center text-gray-600 text-sm">
              No tax documents found for {selectedYear}
              {selectedClient !== 'all' && ` and ${CLIENTS.find((c) => c.id === selectedClient)?.name}`}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocumentRow — row + expandable detail panel (1E)
// ---------------------------------------------------------------------------

function DocumentRow({
  doc,
  typeCfg,
  statusCfg,
  isExpanded,
  isGenerated,
  isProcessing,
  onToggle,
  onDownload,
  onEmail,
}: {
  doc: TaxDocument;
  typeCfg: { color: string; icon: string };
  statusCfg: { label: string; badgeClass: string };
  isExpanded: boolean;
  isGenerated: boolean;
  isProcessing: boolean;
  onToggle: () => void;
  onDownload: () => void;
  onEmail: () => void;
}) {
  return (
    <>
      <tr className="bg-[#0A1628] hover:bg-gray-900/50 transition-colors">
        {/* Expand chevron (1E) */}
        <td className="px-3 py-3 text-center">
          <button
            onClick={onToggle}
            className="p-1 rounded hover:bg-gray-700/60 transition-colors"
            aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
          >
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </td>
        <td className="px-4 py-3">
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
          {doc.generatedAt ? formatDate(doc.generatedAt) : '\u2014'}
        </td>
        <td className="px-4 py-3 text-right text-xs text-gray-500">
          {doc.fileSize ?? '\u2014'}
        </td>
        {/* Actions column — 1B download logic */}
        <td className="px-4 py-3 text-center">
          {isGenerated ? (
            <button
              onClick={onDownload}
              className="text-xs font-semibold text-[#C9A84C] hover:text-amber-300 transition-colors"
            >
              Download
            </button>
          ) : isProcessing ? (
            <span className="text-xs text-blue-400 animate-pulse">Processing...</span>
          ) : (
            <button
              disabled
              className="text-xs font-semibold text-gray-600 cursor-not-allowed"
              title="Document must be generated before downloading"
            >
              Download
            </button>
          )}
        </td>
      </tr>

      {/* Expanded detail panel (1E) */}
      {isExpanded && (
        <tr className="bg-gray-900/40">
          <td colSpan={8} className="px-6 py-5">
            <div className="space-y-4">
              {/* Key figures — 2-column grid */}
              {doc.keyFigures && (
                <div>
                  <h4 className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-3">Key Figures</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                      { label: 'Total Interest', value: doc.keyFigures.totalInterest, color: 'text-white' },
                      { label: 'Deductible', value: doc.keyFigures.deductible, color: 'text-green-400' },
                      { label: 'Non-deductible', value: doc.keyFigures.nonDeductible, color: 'text-red-400' },
                      { label: 'Annual Fees', value: doc.keyFigures.annualFees, color: 'text-[#C9A84C]' },
                      { label: 'Cash Advance Fees', value: doc.keyFigures.cashAdvanceFees, color: 'text-orange-400' },
                    ].map((fig) => (
                      <div key={fig.label} className="rounded-lg border border-gray-800 bg-gray-900/80 px-4 py-3">
                        <p className="text-xs text-gray-400 mb-1">{fig.label}</p>
                        <p className={`text-lg font-bold ${fig.color}`}>{fmtCurrency(fig.value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={onDownload}
                  disabled={!isGenerated}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isGenerated
                      ? 'bg-[#C9A84C] hover:bg-amber-400 text-gray-900'
                      : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {isGenerated ? 'Download' : isProcessing ? 'Processing...' : 'Unavailable'}
                </button>
                <button
                  onClick={onEmail}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C9A84C]/40 text-[#C9A84C] hover:bg-[#C9A84C]/10 text-sm font-semibold transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email to Accountant
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
