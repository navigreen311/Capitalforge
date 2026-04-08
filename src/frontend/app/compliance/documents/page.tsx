'use client';

// ============================================================
// /compliance/documents — Document Vault
// Global document list across all businesses with search,
// filter tabs, upload metadata, legal hold toggle.
// ============================================================

import { useState, useEffect, useCallback, useRef, DragEvent } from 'react';

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

// Unique businesses from placeholder data for selector
const BUSINESSES = [
  { id: 'biz_001', name: 'Apex Ventures LLC' },
  { id: 'biz_002', name: 'NovaTech Solutions' },
  { id: 'biz_003', name: 'Blue Ridge Consulting' },
  { id: 'biz_004', name: 'Summit Capital Group' },
  { id: 'biz_005', name: 'Horizon Retail' },
  { id: 'biz_006', name: 'Crestline Medical' },
  { id: 'biz_007', name: 'Pinnacle Freight' },
];

// Mock AI parsed fields for slide-over
const MOCK_AI_FIELDS: Record<string, { key: string; value: string }[]> = {
  doc_001: [
    { key: 'Account Number', value: '****-4821' },
    { key: 'Statement Period', value: 'Feb 1 - Feb 28, 2026' },
    { key: 'Ending Balance', value: '$142,387.50' },
    { key: 'Total Deposits', value: '$287,000.00' },
  ],
  doc_003: [
    { key: 'Tax Year', value: '2024' },
    { key: 'Form Type', value: '1120' },
    { key: 'Total Revenue', value: '$2,450,000' },
    { key: 'Net Income', value: '$312,000' },
  ],
  doc_005: [
    { key: 'Check Type', value: 'KYB Verification' },
    { key: 'Status', value: 'Passed' },
    { key: 'Risk Score', value: '12 / 100 (Low)' },
    { key: 'Verified On', value: 'Mar 20, 2026' },
  ],
  doc_007: [
    { key: 'Bureau', value: 'Experian' },
    { key: 'FICO Score', value: '742' },
    { key: 'Total Tradelines', value: '14' },
    { key: 'Derogatory Marks', value: '0' },
  ],
  doc_009: [
    { key: 'Contract Type', value: 'Advisory Agreement' },
    { key: 'Effective Date', value: 'Jan 10, 2026' },
    { key: 'Term', value: '12 months' },
    { key: 'Monthly Fee', value: '$5,000' },
  ],
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocumentVaultPage() {
  const [docs, setDocs] = useState<DocumentRecord[]>(PLACEHOLDER_DOCS);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    businessId: '',
    businessName: '',
    docType: 'other' as DocType,
    fileName: '',
    description: '',
    parseWithAI: false,
    applyLegalHold: false,
  });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setUploadForm((f) => ({ ...f, fileName: file.name }));
    }
  }, []);
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadForm((f) => ({ ...f, fileName: file.name }));
    }
  }, []);

  const handleUpload = useCallback(() => {
    if (!uploadForm.fileName.trim()) return;
    const biz = BUSINESSES.find((b) => b.id === uploadForm.businessId);
    const newDoc: DocumentRecord = {
      id: `doc_${Date.now()}`,
      businessId: uploadForm.businessId || 'biz_new',
      businessName: biz?.name || uploadForm.businessName || 'Unknown Business',
      type: uploadForm.docType,
      fileName: uploadForm.fileName,
      fileSizeBytes: Math.floor(Math.random() * 500_000) + 10_000,
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Current User',
      legalHold: uploadForm.applyLegalHold,
      aiParsed: uploadForm.parseWithAI,
      pendingSignature: false,
      tags: [],
      description: uploadForm.description,
    };
    setDocs((prev) => [newDoc, ...prev]);
    setShowUploadModal(false);
    setUploadForm({ businessId: '', businessName: '', docType: 'other', fileName: '', description: '', parseWithAI: false, applyLegalHold: false });
    setToast(`"${newDoc.fileName}" uploaded successfully`);
    // Try API
    fetch('/api/compliance/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDoc),
    }).catch(() => {});
  }, [uploadForm]);

  // Slide-over actions
  const handleDownload = useCallback((doc: DocumentRecord) => {
    setToast(`Downloading "${doc.fileName}"...`);
  }, []);
  const handleSendESign = useCallback((doc: DocumentRecord) => {
    setToast(`"${doc.fileName}" sent for e-signature`);
  }, []);
  const handleDelete = useCallback((doc: DocumentRecord) => {
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    setSelectedDoc(null);
    setDeleteConfirm(false);
    setToast(`"${doc.fileName}" deleted`);
    fetch(`/api/compliance/documents/${doc.id}`, { method: 'DELETE' }).catch(() => {});
  }, []);
  const toggleSlideoverHold = useCallback((doc: DocumentRecord) => {
    const newState = !doc.legalHold;
    setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, legalHold: newState } : d));
    setSelectedDoc((prev) => prev ? { ...prev, legalHold: newState } : prev);
    setToast(`${doc.fileName} — legal hold ${newState ? 'enabled' : 'released'}`);
    fetch(`/api/compliance/documents/${doc.id}/hold`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legalHold: newState }),
    }).catch(() => {});
  }, []);

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
                  <tr key={doc.id} onClick={() => { setSelectedDoc(doc); setDeleteConfirm(false); }} className="border-b border-gray-800/50 hover:bg-[#0A1628]/50 transition-colors cursor-pointer">
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
                        onClick={(e) => { e.stopPropagation(); toggleHold(doc.id); }}
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

      {/* Upload Modal (2A) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowUploadModal(false)}>
          <div className="bg-[#0f1d32] border border-gray-700 rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white">Upload Document</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="space-y-4">
              {/* File Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-[#C9A84C] bg-[#C9A84C]/10'
                    : uploadForm.fileName
                    ? 'border-green-600 bg-green-900/10'
                    : 'border-gray-600 hover:border-gray-500 bg-[#0A1628]/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {uploadForm.fileName ? (
                  <div>
                    <div className="text-[#C9A84C] text-2xl mb-1">&#10003;</div>
                    <p className="text-sm text-gray-200 font-medium">{uploadForm.fileName}</p>
                    <p className="text-xs text-gray-500 mt-1">Click or drag to replace</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-gray-500 text-3xl mb-2">&#8682;</div>
                    <p className="text-sm text-gray-300">Drag & drop a file here, or <span className="text-[#C9A84C] underline">browse</span></p>
                    <p className="text-xs text-gray-500 mt-1">PDF, DOCX, JSON, PNG up to 25 MB</p>
                  </div>
                )}
              </div>

              {/* Business / Client Selector */}
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase block mb-1">Business / Client</label>
                <select
                  value={uploadForm.businessId}
                  onChange={(e) => {
                    const biz = BUSINESSES.find((b) => b.id === e.target.value);
                    setUploadForm((f) => ({ ...f, businessId: e.target.value, businessName: biz?.name || '' }));
                  }}
                  className="w-full rounded-lg bg-[#0A1628] border border-gray-700 text-gray-200 text-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
                >
                  <option value="">Select a business...</option>
                  {BUSINESSES.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Document Type Selector */}
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

              {/* Checkboxes */}
              <div className="flex flex-col gap-3 pt-1">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={uploadForm.parseWithAI}
                    onChange={(e) => setUploadForm((f) => ({ ...f, parseWithAI: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-600 bg-[#0A1628] text-[#C9A84C] focus:ring-[#C9A84C]/50 accent-[#C9A84C]"
                  />
                  <div>
                    <span className="text-sm text-gray-200 group-hover:text-white transition-colors">Parse with VisionAudioForge AI</span>
                    <p className="text-xs text-gray-500">Automatically extract key fields using AI</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={uploadForm.applyLegalHold}
                    onChange={(e) => setUploadForm((f) => ({ ...f, applyLegalHold: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-600 bg-[#0A1628] text-[#C9A84C] focus:ring-[#C9A84C]/50 accent-[#C9A84C]"
                  />
                  <div>
                    <span className="text-sm text-gray-200 group-hover:text-white transition-colors">Apply Legal Hold</span>
                    <p className="text-xs text-gray-500">Prevent deletion and modification</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-800">
              <button onClick={() => setShowUploadModal(false)} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-semibold text-gray-300 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!uploadForm.fileName.trim()}
                className="px-5 py-2 rounded-lg bg-[#C9A84C] hover:bg-[#b8973f] disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-[#0A1628] transition-colors"
              >
                Upload Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Detail Slide-over (2B) */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedDoc(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-[#0f1d32] border-l border-gray-700 shadow-2xl h-full overflow-y-auto animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Slide-over Header */}
            <div className="sticky top-0 bg-[#0f1d32] border-b border-gray-800 px-6 py-4 z-10">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="text-gray-400 hover:text-white text-sm flex items-center gap-1 transition-colors"
                >
                  &#8592; Close
                </button>
              </div>
              <h2 className="text-lg font-bold text-white truncate" title={selectedDoc.fileName}>
                {selectedDoc.fileName}
              </h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-800 text-[#C9A84C] border border-[#C9A84C]/30">
                  {DOC_TYPE_LABELS[selectedDoc.type]}
                </span>
                {selectedDoc.aiParsed && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-700">AI Parsed</span>
                )}
                {selectedDoc.pendingSignature && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-300 border border-yellow-700">Pending Sig</span>
                )}
                {selectedDoc.legalHold && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-700">Legal Hold</span>
                )}
              </div>
              <div className="mt-3 text-xs text-gray-400 space-y-0.5">
                <p><span className="text-gray-500">Business:</span> {selectedDoc.businessName}</p>
                <p><span className="text-gray-500">Uploaded by:</span> {selectedDoc.uploadedBy} on {formatDate(selectedDoc.uploadedAt)}</p>
                <p><span className="text-gray-500">Size:</span> {formatSize(selectedDoc.fileSizeBytes)}</p>
              </div>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* AI Parsed Fields */}
              <div>
                <h3 className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">AI Parsed Fields</h3>
                {selectedDoc.aiParsed && MOCK_AI_FIELDS[selectedDoc.id] ? (
                  <div className="rounded-lg border border-gray-800 bg-[#0A1628] divide-y divide-gray-800">
                    {MOCK_AI_FIELDS[selectedDoc.id].map((field) => (
                      <div key={field.key} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-gray-400">{field.key}</span>
                        <span className="text-sm text-gray-200 font-medium">{field.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-800 bg-[#0A1628] px-4 py-6 text-center">
                    <p className="text-xs text-gray-500">
                      {selectedDoc.aiParsed ? 'No parsed fields available' : 'Document has not been AI-parsed'}
                    </p>
                  </div>
                )}
              </div>

              {/* Legal Hold Toggle */}
              <div>
                <h3 className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">Legal Hold</h3>
                <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-[#0A1628] px-4 py-3">
                  <div>
                    <p className="text-sm text-gray-200">{selectedDoc.legalHold ? 'Legal hold active' : 'No legal hold'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selectedDoc.legalHold ? 'Document is protected from deletion' : 'Document can be modified or deleted'}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleSlideoverHold(selectedDoc)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      selectedDoc.legalHold ? 'bg-red-600' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        selectedDoc.legalHold ? 'translate-x-5.5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div>
                <h3 className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => handleDownload(selectedDoc)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#0A1628] border border-gray-800 text-gray-200 text-sm hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-base">&#8615;</span>
                    Download
                  </button>
                  <button
                    onClick={() => handleSendESign(selectedDoc)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#0A1628] border border-gray-800 text-gray-200 text-sm hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-base">&#9993;</span>
                    Send for E-Sign
                  </button>
                  {!deleteConfirm ? (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#0A1628] border border-red-900/50 text-red-400 text-sm hover:bg-red-900/20 transition-colors"
                    >
                      <span className="text-base">&#128465;</span>
                      Delete Document
                    </button>
                  ) : (
                    <div className="rounded-lg border border-red-700 bg-red-900/20 p-3">
                      <p className="text-sm text-red-300 mb-2">Are you sure you want to delete this document?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(selectedDoc)}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
                        >
                          Confirm Delete
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tags */}
              {selectedDoc.tags.length > 0 && (
                <div>
                  <h3 className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">Tags</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDoc.tags.map((tag) => (
                      <span key={tag} className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Slide-in animation */}
          <style>{`
            @keyframes slideInRight {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
            .animate-slide-in-right {
              animation: slideInRight 0.25s ease-out;
            }
          `}</style>
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
