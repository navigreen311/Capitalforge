'use client';

// ============================================================
// /compliance/documents — Document Vault
// Global document list across all businesses with search,
// filter tabs, upload metadata, legal hold toggle.
// ============================================================

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocType = 'bank_statement' | 'tax_return' | 'articles_of_incorporation' | 'consent_record' | 'application' | 'credit_report' | 'compliance_check' | 'product_reality' | 'contract' | 'other';
type FilterTab = 'All' | 'Pending Signature' | 'On Legal Hold' | 'AI-Parsed';

interface DocumentRecord {
  id: string;
  businessId: string;
  businessName: string;
  type: DocType;
  fileName: string;
  fileSizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  legalHold: boolean;
  aiParsed: boolean;
  pendingSignature: boolean;
  tags: string[];
  description?: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_DOCS: DocumentRecord[] = [
  { id: 'doc_001', businessId: 'biz_001', businessName: 'Apex Ventures LLC',      type: 'bank_statement',            fileName: 'apex_bank_stmt_feb2026.pdf',     fileSizeBytes: 248_000,   uploadedAt: '2026-03-01T10:00:00Z', uploadedBy: 'Sarah Chen',      legalHold: false, aiParsed: true,  pendingSignature: false, tags: ['bank', 'q1-2026'] },
  { id: 'doc_002', businessId: 'biz_001', businessName: 'Apex Ventures LLC',      type: 'consent_record',            fileName: 'apex_tcpa_consent.json',         fileSizeBytes: 4_200,     uploadedAt: '2026-02-15T09:30:00Z', uploadedBy: 'System',          legalHold: true,  aiParsed: false, pendingSignature: false, tags: ['consent', 'tcpa'] },
  { id: 'doc_003', businessId: 'biz_002', businessName: 'NovaTech Solutions',     type: 'tax_return',                fileName: 'novatech_1120_2024.pdf',         fileSizeBytes: 1_200_000, uploadedAt: '2026-03-10T14:00:00Z', uploadedBy: 'Marcus Williams', legalHold: false, aiParsed: true,  pendingSignature: false, tags: ['tax', '2024'] },
  { id: 'doc_004', businessId: 'biz_003', businessName: 'Blue Ridge Consulting',  type: 'articles_of_incorporation', fileName: 'blueridge_articles.pdf',          fileSizeBytes: 380_000,   uploadedAt: '2026-01-05T11:00:00Z', uploadedBy: 'Sarah Chen',      legalHold: false, aiParsed: false, pendingSignature: true,  tags: ['formation', 'legal'] },
  { id: 'doc_005', businessId: 'biz_004', businessName: 'Summit Capital Group',   type: 'compliance_check',          fileName: 'summit_kyb_report.pdf',          fileSizeBytes: 92_000,    uploadedAt: '2026-03-20T16:00:00Z', uploadedBy: 'System',          legalHold: true,  aiParsed: true,  pendingSignature: false, tags: ['compliance', 'kyb'] },
  { id: 'doc_006', businessId: 'biz_005', businessName: 'Horizon Retail',         type: 'product_reality',           fileName: 'horizon_product_ack.pdf',        fileSizeBytes: 18_000,    uploadedAt: '2026-03-22T08:45:00Z', uploadedBy: 'Marcus Williams', legalHold: true,  aiParsed: false, pendingSignature: false, tags: ['disclosure', 'ack'] },
  { id: 'doc_007', businessId: 'biz_006', businessName: 'Crestline Medical',      type: 'credit_report',             fileName: 'crestline_experian_pull.pdf',    fileSizeBytes: 560_000,   uploadedAt: '2026-03-28T09:00:00Z', uploadedBy: 'System',          legalHold: false, aiParsed: true,  pendingSignature: false, tags: ['credit', 'experian'] },
  { id: 'doc_008', businessId: 'biz_004', businessName: 'Summit Capital Group',   type: 'application',               fileName: 'summit_chase_app_2026.pdf',      fileSizeBytes: 145_000,   uploadedAt: '2026-03-25T13:30:00Z', uploadedBy: 'James Okafor',    legalHold: false, aiParsed: false, pendingSignature: true,  tags: ['application', 'chase'] },
  { id: 'doc_009', businessId: 'biz_001', businessName: 'Apex Ventures LLC',      type: 'contract',                  fileName: 'apex_advisor_agreement.pdf',     fileSizeBytes: 210_000,   uploadedAt: '2026-01-10T10:00:00Z', uploadedBy: 'Sarah Chen',      legalHold: true,  aiParsed: true,  pendingSignature: false, tags: ['contract', 'legal'] },
  { id: 'doc_010', businessId: 'biz_007', businessName: 'Pinnacle Freight',       type: 'bank_statement',            fileName: 'pinnacle_bank_stmt_q4.pdf',      fileSizeBytes: 330_000,   uploadedAt: '2026-02-28T15:00:00Z', uploadedBy: 'Sarah Chen',      legalHold: false, aiParsed: false, pendingSignature: false, tags: ['bank', 'q4-2025'] },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOC_TYPE_LABELS: Record<DocType, string> = {
  bank_statement: 'Bank Statement', tax_return: 'Tax Return', articles_of_incorporation: 'Articles of Inc.',
  consent_record: 'Consent Record', application: 'Application', credit_report: 'Credit Report',
  compliance_check: 'Compliance Check', product_reality: 'Product Reality', contract: 'Contract', other: 'Other',
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

const FILTER_TABS: FilterTab[] = ['All', 'Pending Signature', 'On Legal Hold', 'AI-Parsed'];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocumentVaultPage() {
  const [docs, setDocs] = useState<DocumentRecord[]>(PLACEHOLDER_DOCS);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Upload form state
  const [uploadForm, setUploadForm] = useState({ businessName: '', docType: 'other' as DocType, fileName: '', description: '' });

  // Fetch from API on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/compliance/documents');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data?.length) setDocs(data.data);
        }
      } catch { /* use placeholder */ }
    })();
  }, []);

  // Filtered docs
  const filtered = docs.filter((d) => {
    // Search
    const q = search.toLowerCase();
    if (q && !d.businessName.toLowerCase().includes(q) && !d.fileName.toLowerCase().includes(q) && !DOC_TYPE_LABELS[d.type].toLowerCase().includes(q)) {
      return false;
    }
    // Tab filter
    if (activeTab === 'Pending Signature') return d.pendingSignature;
    if (activeTab === 'On Legal Hold') return d.legalHold;
    if (activeTab === 'AI-Parsed') return d.aiParsed;
    return true;
  });

  const toggleHold = useCallback((id: string) => {
    setDocs((prev) => prev.map((d) => d.id === id ? { ...d, legalHold: !d.legalHold } : d));
    const doc = docs.find((d) => d.id === id);
    if (doc) {
      const newState = !doc.legalHold;
      setToast(`${doc.fileName} — legal hold ${newState ? 'enabled' : 'released'}`);
      // Try API
      fetch(`/api/compliance/documents/${id}/hold`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legalHold: newState }),
      }).catch(() => {});
    }
  }, [docs]);

  const handleUpload = useCallback(() => {
    if (!uploadForm.fileName.trim()) return;
    const newDoc: DocumentRecord = {
      id: `doc_${Date.now()}`,
      businessId: 'biz_new',
      businessName: uploadForm.businessName || 'Unknown Business',
      type: uploadForm.docType,
      fileName: uploadForm.fileName,
      fileSizeBytes: 0,
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Current User',
      legalHold: false,
      aiParsed: false,
      pendingSignature: false,
      tags: [],
      description: uploadForm.description,
    };
    setDocs((prev) => [newDoc, ...prev]);
    setShowUploadModal(false);
    setUploadForm({ businessName: '', docType: 'other', fileName: '', description: '' });
    setToast('Document metadata uploaded');
    // Try API
    fetch('/api/compliance/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDoc),
    }).catch(() => {});
  }, [uploadForm]);

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Document Vault</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {docs.length} documents across all businesses
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-[#0A1628] text-sm font-semibold transition-colors"
        >
          Upload Document
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by business name, doc type, or filename..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-lg bg-[#0f1d32] border border-gray-700 text-gray-200 text-sm px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 placeholder-gray-500"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800">
        {FILTER_TABS.map((tab) => {
          const count = tab === 'All' ? docs.length
            : tab === 'Pending Signature' ? docs.filter((d) => d.pendingSignature).length
            : tab === 'On Legal Hold' ? docs.filter((d) => d.legalHold).length
            : docs.filter((d) => d.aiParsed).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-[#C9A84C] text-[#C9A84C]'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab} <span className="text-xs text-gray-500 ml-1">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Document Table */}
      <div className="rounded-xl border border-gray-800 bg-[#0f1d32] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">File</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Business</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Type</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Size</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Uploaded</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Status</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wide font-semibold">Legal Hold</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No documents match your search.</td></tr>
              ) : (
                filtered.map((doc) => (
                  <tr key={doc.id} className="border-b border-gray-800/50 hover:bg-[#0A1628]/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-gray-100 font-medium truncate max-w-[200px]">{doc.fileName}</p>
                      <p className="text-xs text-gray-500">{doc.uploadedBy}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{doc.businessName}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                        {DOC_TYPE_LABELS[doc.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatSize(doc.fileSizeBytes)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(doc.uploadedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {doc.aiParsed && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-700">AI</span>
                        )}
                        {doc.pendingSignature && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-300 border border-yellow-700">Pending Sig</span>
                        )}
                        {!doc.aiParsed && !doc.pendingSignature && (
                          <span className="text-xs text-gray-600">--</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleHold(doc.id)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          doc.legalHold ? 'bg-red-600' : 'bg-gray-700'
                        }`}
                        title={doc.legalHold ? 'Release legal hold' : 'Enable legal hold'}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            doc.legalHold ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f1d32] border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Upload Document</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Business Name</label>
                <input
                  type="text"
                  value={uploadForm.businessName}
                  onChange={(e) => setUploadForm((f) => ({ ...f, businessName: e.target.value }))}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  placeholder="Enter business name"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Document Type</label>
                <select
                  value={uploadForm.docType}
                  onChange={(e) => setUploadForm((f) => ({ ...f, docType: e.target.value as DocType }))}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                >
                  {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => (
                    <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">File Name</label>
                <input
                  type="text"
                  value={uploadForm.fileName}
                  onChange={(e) => setUploadForm((f) => ({ ...f, fileName: e.target.value }))}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                  placeholder="document.pdf"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Description</label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 resize-none"
                  placeholder="Optional description..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-5">
              <button onClick={() => setShowUploadModal(false)} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-gray-300 transition-colors">
                Cancel
              </button>
              <button onClick={handleUpload} className="px-4 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] text-sm font-semibold text-[#0A1628] transition-colors">
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-[#0A1628] border border-[#C9A84C]/30 text-gray-100 text-sm rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
      )}
    </div>
  );
}
