'use client';

// ============================================================
// /documents — Document vault browser
// Filterable list with type, business, date, legal hold status.
// Upload modal, Request from Client modal, Release Hold modal,
// Bulk actions, View/Dossier placeholders with toasts.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { documentsApi } from '../../lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocumentType =
  | 'bank_statement'
  | 'tax_return'
  | 'articles_of_incorporation'
  | 'consent_record'
  | 'application'
  | 'credit_report'
  | 'compliance_check'
  | 'product_reality'
  | 'contract'
  | 'other';

type SignatureStatus = 'signed' | 'pending' | 'not_required' | 'esign_sent';

interface DocumentRecord {
  id: string;
  businessId: string;
  businessName: string;
  type: DocumentType;
  fileName: string;
  fileSizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  legalHold: boolean;
  tags: string[];
  description?: string;
  signatureStatus: SignatureStatus;
  esignSentAt?: string;
}

interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'info' | 'error';
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_DOCS: DocumentRecord[] = [
  { id: 'doc_001', businessId: 'biz_001', businessName: 'Apex Ventures LLC',    type: 'bank_statement',            fileName: 'apex_bank_stmt_feb2026.pdf',    fileSizeBytes: 248_000,   uploadedAt: '2026-03-01T10:00:00Z', uploadedBy: 'Sarah Chen',      legalHold: false, tags: ['bank', 'q1-2026'], description: 'February 2026 business checking statement', signatureStatus: 'not_required' },
  { id: 'doc_002', businessId: 'biz_001', businessName: 'Apex Ventures LLC',    type: 'consent_record',            fileName: 'apex_tcpa_consent_voice.json',  fileSizeBytes: 4_200,     uploadedAt: '2026-02-15T09:30:00Z', uploadedBy: 'System',          legalHold: true,  tags: ['consent', 'tcpa', 'voice'], signatureStatus: 'signed' },
  { id: 'doc_003', businessId: 'biz_002', businessName: 'NovaTech Solutions',   type: 'tax_return',                fileName: 'novatech_1120_2024.pdf',        fileSizeBytes: 1_200_000, uploadedAt: '2026-03-10T14:00:00Z', uploadedBy: 'Marcus Williams', legalHold: false, tags: ['tax', '2024'], signatureStatus: 'not_required' },
  { id: 'doc_004', businessId: 'biz_003', businessName: 'Blue Ridge Consulting', type: 'articles_of_incorporation', fileName: 'blueridge_articles.pdf',        fileSizeBytes: 380_000,   uploadedAt: '2026-01-05T11:00:00Z', uploadedBy: 'Sarah Chen',      legalHold: false, tags: ['formation', 'legal'], signatureStatus: 'pending' },
  { id: 'doc_005', businessId: 'biz_004', businessName: 'Summit Capital Group',  type: 'compliance_check',          fileName: 'summit_kyb_report.pdf',         fileSizeBytes: 92_000,    uploadedAt: '2026-03-20T16:00:00Z', uploadedBy: 'System',          legalHold: true,  tags: ['compliance', 'kyb'], signatureStatus: 'signed' },
  { id: 'doc_006', businessId: 'biz_005', businessName: 'Horizon Retail',       type: 'product_reality',           fileName: 'horizon_product_ack.pdf',       fileSizeBytes: 18_000,    uploadedAt: '2026-03-22T08:45:00Z', uploadedBy: 'Marcus Williams', legalHold: true,  tags: ['disclosure', 'ack'], signatureStatus: 'pending' },
  { id: 'doc_007', businessId: 'biz_006', businessName: 'Crestline Medical',    type: 'credit_report',             fileName: 'crestline_experian_pull.pdf',   fileSizeBytes: 560_000,   uploadedAt: '2026-03-28T09:00:00Z', uploadedBy: 'System',          legalHold: false, tags: ['credit', 'experian'], signatureStatus: 'not_required' },
  { id: 'doc_008', businessId: 'biz_004', businessName: 'Summit Capital Group',  type: 'application',               fileName: 'summit_chase_app_2026.pdf',     fileSizeBytes: 145_000,   uploadedAt: '2026-03-25T13:30:00Z', uploadedBy: 'James Okafor',    legalHold: false, tags: ['application', 'chase'], signatureStatus: 'pending' },
  { id: 'doc_009', businessId: 'biz_001', businessName: 'Apex Ventures LLC',    type: 'contract',                  fileName: 'apex_advisor_agreement.pdf',    fileSizeBytes: 210_000,   uploadedAt: '2026-01-10T10:00:00Z', uploadedBy: 'Sarah Chen',      legalHold: true,  tags: ['contract', 'legal'], signatureStatus: 'signed' },
  { id: 'doc_010', businessId: 'biz_007', businessName: 'Pinnacle Freight',     type: 'bank_statement',            fileName: 'pinnacle_bank_stmt_q4.pdf',     fileSizeBytes: 330_000,   uploadedAt: '2026-02-28T15:00:00Z', uploadedBy: 'Sarah Chen',      legalHold: false, tags: ['bank', 'q4-2025'], signatureStatus: 'not_required' },
];

const PLACEHOLDER_CLIENTS = [
  { id: 'biz_001', name: 'Apex Ventures LLC' },
  { id: 'biz_002', name: 'NovaTech Solutions' },
  { id: 'biz_003', name: 'Blue Ridge Consulting' },
  { id: 'biz_004', name: 'Summit Capital Group' },
  { id: 'biz_005', name: 'Horizon Retail' },
  { id: 'biz_006', name: 'Crestline Medical' },
  { id: 'biz_007', name: 'Pinnacle Freight' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  bank_statement:          'Bank Statement',
  tax_return:              'Tax Return',
  articles_of_incorporation: 'Articles of Inc.',
  consent_record:          'Consent Record',
  application:             'Application',
  credit_report:           'Credit Report',
  compliance_check:        'Compliance Check',
  product_reality:         'Product Reality',
  contract:                'Contract',
  other:                   'Other',
};

const DOC_TYPE_ICONS: Record<DocumentType, string> = {
  bank_statement: '🏦', tax_return: '📊', articles_of_incorporation: '📜',
  consent_record: '✅', application: '📋', credit_report: '📈',
  compliance_check: '🔍', product_reality: '⚖️', contract: '📝', other: '📄',
};

const UPLOAD_DOC_TYPES: DocumentType[] = [
  'bank_statement', 'consent_record', 'tax_return', 'compliance_check',
  'contract', 'other',
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

const ALL_DOC_TYPES: DocumentType[] = Object.keys(DOC_TYPE_LABELS) as DocumentType[];

let _toastId = 0;

// ---------------------------------------------------------------------------
// Toast Component
// ---------------------------------------------------------------------------

function ToastContainer({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium border flex items-center gap-3 animate-[slideIn_0.2s_ease-out] ${
            t.type === 'success' ? 'bg-green-900/90 text-green-200 border-green-700' :
            t.type === 'error'   ? 'bg-red-900/90 text-red-200 border-red-700' :
                                   'bg-gray-800/90 text-gray-200 border-gray-600'
          }`}
        >
          <span className="flex-1">{t.text}</span>
          <button onClick={() => onDismiss(t.id)} className="text-gray-400 hover:text-white ml-2">&times;</button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal Backdrop
// ---------------------------------------------------------------------------

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  // Core state
  const [docs, setDocs] = useState<DocumentRecord[]>(PLACEHOLDER_DOCS);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocumentType | ''>('');
  const [businessFilter, setBusinessFilter] = useState('');
  const [legalHoldOnly, setLegalHoldOnly] = useState(false);
  const [clientSelector, setClientSelector] = useState('');

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Upload modal
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<DocumentType>('bank_statement');
  const [uploadClient, setUploadClient] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadLegalHold, setUploadLegalHold] = useState(false);
  const uploadFileRef = useRef<HTMLInputElement>(null);

  // Request from Client modal
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestClient, setRequestClient] = useState('');
  const [requestDocType, setRequestDocType] = useState<DocumentType>('bank_statement');
  const [requestMessage, setRequestMessage] = useState('');

  // Release Hold modal
  const [releaseHoldModal, setReleaseHoldModal] = useState<DocumentRecord | null>(null);
  const [releaseReason, setReleaseReason] = useState('');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Exporting state
  const [exportingId, setExportingId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetch (placeholder)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await documentsApi.list({
          type: typeFilter || undefined,
          businessId: businessFilter || undefined,
        });
        if (res.success && Array.isArray(res.data)) {
          setDocs(res.data as DocumentRecord[]);
        }
      } catch { /* placeholder */ }
      finally { setLoading(false); }
    })();
  }, [typeFilter, businessFilter]);

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const displayed = docs.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      d.fileName.toLowerCase().includes(q) ||
      d.businessName.toLowerCase().includes(q) ||
      DOC_TYPE_LABELS[d.type].toLowerCase().includes(q) ||
      d.tags.some((t) => t.includes(q));
    const matchType = !typeFilter || d.type === typeFilter;
    const matchBusiness = !businessFilter || d.businessId === businessFilter || d.businessName.toLowerCase().includes(businessFilter.toLowerCase());
    const matchHold = !legalHoldOnly || d.legalHold;
    const matchClient = !clientSelector || d.businessId === clientSelector;
    return matchSearch && matchType && matchBusiness && matchHold && matchClient;
  });

  const isFiltered = search || typeFilter || businessFilter || legalHoldOnly || clientSelector;

  const businesses = Array.from(new Set(docs.map((d) => d.businessName))).sort();

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleUploadSubmit = () => {
    if (!uploadFile) return;
    const client = PLACEHOLDER_CLIENTS.find((c) => c.id === uploadClient);
    const newDoc: DocumentRecord = {
      id: `doc_${Date.now()}`,
      businessId: uploadClient || 'biz_001',
      businessName: client?.name || 'Unassigned',
      type: uploadDocType,
      fileName: uploadFile.name,
      fileSizeBytes: uploadFile.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Current User',
      legalHold: uploadLegalHold,
      tags: uploadTags.split(',').map((t) => t.trim()).filter(Boolean),
      signatureStatus: 'not_required',
    };
    setDocs((prev) => [newDoc, ...prev]);
    showToast(`Uploaded "${uploadFile.name}" successfully`, 'success');
    // Reset
    setUploadModalOpen(false);
    setUploadFile(null);
    setUploadDocType('bank_statement');
    setUploadClient('');
    setUploadTags('');
    setUploadLegalHold(false);
  };

  const handleView = () => {
    showToast('Preview not available in development mode', 'info');
  };

  const handleDossier = (doc: DocumentRecord) => {
    showToast(`Generating dossier for ${doc.businessName}...`, 'info');
    setExportingId(doc.businessId);
    setTimeout(() => {
      setExportingId(null);
      showToast('Dossier downloaded', 'success');
    }, 1500);
  };

  const handleReleaseHold = () => {
    if (!releaseHoldModal || !releaseReason.trim()) return;
    setDocs((prev) =>
      prev.map((d) =>
        d.id === releaseHoldModal.id ? { ...d, legalHold: false } : d
      )
    );
    showToast(`Legal hold released for "${releaseHoldModal.fileName}"`, 'success');
    setReleaseHoldModal(null);
    setReleaseReason('');
  };

  // 2C — Legal Hold Toggle (optimistic update)
  const handleToggleLegalHold = useCallback((doc: DocumentRecord) => {
    const newHoldState = !doc.legalHold;
    // Optimistic update
    setDocs((prev) =>
      prev.map((d) => d.id === doc.id ? { ...d, legalHold: newHoldState } : d)
    );
    showToast(
      newHoldState ? 'Legal hold applied' : 'Legal hold removed',
      'success',
    );
    // In production: POST/DELETE to /api/v1/documents/:id/hold
    console.info('[DocumentVault] %s legal hold for doc_id=%s', newHoldState ? 'Applied' : 'Removed', doc.id);
  }, [showToast]);

  // 2D — Send E-Sign
  const handleSendESign = useCallback((doc: DocumentRecord) => {
    // Optimistic update: mark as esign_sent with timestamp
    const sentAt = new Date().toISOString();
    setDocs((prev) =>
      prev.map((d) =>
        d.id === doc.id
          ? { ...d, signatureStatus: 'esign_sent' as SignatureStatus, esignSentAt: sentAt }
          : d
      )
    );
    showToast(`E-Sign request sent for ${doc.fileName}`, 'success');
    // In production: POST to /api/v1/documents/:id/esign
    console.info('[DocumentVault] E-Sign sent for doc_id=%s at %s', doc.id, sentAt);
  }, [showToast]);

  const handleRequestSubmit = () => {
    if (!requestClient) return;
    const client = PLACEHOLDER_CLIENTS.find((c) => c.id === requestClient);
    showToast(`Document request sent to ${client?.name || 'client'}`, 'success');
    setRequestModalOpen(false);
    setRequestClient('');
    setRequestDocType('bank_statement');
    setRequestMessage('');
  };

  // Bulk actions
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayed.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayed.map((d) => d.id)));
    }
  };

  const handleBulkDownload = () => {
    showToast(`Downloading ${selectedIds.size} document(s)...`, 'info');
    setSelectedIds(new Set());
  };

  const handleBulkAddTag = () => {
    const tag = prompt('Enter tag to add:');
    if (!tag) return;
    setDocs((prev) =>
      prev.map((d) =>
        selectedIds.has(d.id) ? { ...d, tags: [...d.tags, tag.trim()] } : d
      )
    );
    showToast(`Tag "${tag.trim()}" added to ${selectedIds.size} document(s)`, 'success');
    setSelectedIds(new Set());
  };

  const handleBulkAssign = () => {
    const clientId = prompt('Enter client/business ID to assign (e.g., biz_001):');
    if (!clientId) return;
    const client = PLACEHOLDER_CLIENTS.find((c) => c.id === clientId);
    if (!client) { showToast('Client not found', 'error'); return; }
    setDocs((prev) =>
      prev.map((d) =>
        selectedIds.has(d.id) ? { ...d, businessId: client.id, businessName: client.name } : d
      )
    );
    showToast(`${selectedIds.size} document(s) assigned to ${client.name}`, 'success');
    setSelectedIds(new Set());
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Toast container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Client selector */}
      <div className="mb-4">
        <select
          value={clientSelector}
          onChange={(e) => setClientSelector(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 min-w-[240px]"
        >
          <option value="">All Clients</option>
          {PLACEHOLDER_CLIENTS.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Document Vault</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {isFiltered
              ? `Showing ${displayed.length} of ${docs.length} documents`
              : `${displayed.length} documents`}
            {' · '}{docs.filter((d) => d.legalHold).length} on legal hold
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setUploadModalOpen(true)}
            className="px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold cursor-pointer transition-colors bg-gray-800 text-gray-200 hover:bg-gray-700 hover:text-white"
          >
            ↑ Upload
          </button>
          <button
            onClick={() => setRequestModalOpen(true)}
            className="px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold cursor-pointer transition-colors bg-gray-800 text-gray-200 hover:bg-gray-700 hover:text-white"
          >
            📩 Request from Client
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            placeholder="Search filename, business, document type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-8 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors text-sm"
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as DocumentType | '')}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Types</option>
          {ALL_DOC_TYPES.map((t) => (
            <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
          ))}
        </select>

        <select
          value={businessFilter}
          onChange={(e) => setBusinessFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Businesses</option>
          {businesses.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-700 bg-gray-800 cursor-pointer text-sm text-gray-200 hover:bg-gray-700 transition-colors">
          <input
            type="checkbox"
            checked={legalHoldOnly}
            onChange={(e) => setLegalHoldOnly(e.target.checked)}
            className="accent-blue-500"
          />
          Legal Hold Only
        </label>

        {(search || typeFilter || businessFilter || legalHoldOnly || clientSelector) && (
          <button
            onClick={() => { setSearch(''); setTypeFilter(''); setBusinessFilter(''); setLegalHoldOnly(false); setClientSelector(''); }}
            className="px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl bg-blue-950/60 border border-blue-800">
          <span className="text-sm text-blue-300 font-medium">{selectedIds.size} selected</span>
          <div className="flex gap-2 ml-4">
            <button onClick={handleBulkDownload} className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-200 hover:bg-gray-700 transition-colors">
              Download
            </button>
            <button onClick={handleBulkAddTag} className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-200 hover:bg-gray-700 transition-colors">
              Add Tag
            </button>
            <button onClick={handleBulkAssign} className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-200 hover:bg-gray-700 transition-colors">
              Assign to Client
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <p className="text-center text-gray-500 py-12">Loading documents...</p>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <p className="text-4xl mb-3">📄</p>
          <p>No documents match your filters.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === displayed.length && displayed.length > 0}
                    onChange={toggleSelectAll}
                    className="accent-blue-500"
                  />
                </th>
                <th className="text-left px-4 py-3 font-semibold">Document</th>
                <th className="text-left px-4 py-3 font-semibold">Type</th>
                <th className="text-left px-4 py-3 font-semibold">Business</th>
                <th className="text-left px-4 py-3 font-semibold">Uploaded</th>
                <th className="text-left px-4 py-3 font-semibold">Size</th>
                <th className="text-left px-4 py-3 font-semibold">Signature</th>
                <th className="text-left px-4 py-3 font-semibold">Legal Hold</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {displayed.map((doc) => (
                <tr key={doc.id} className={`transition-colors group ${selectedIds.has(doc.id) ? 'bg-blue-950/30' : 'bg-gray-950 hover:bg-gray-900'}`}>
                  {/* Checkbox */}
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(doc.id)}
                      onChange={() => toggleSelect(doc.id)}
                      className="accent-blue-500"
                    />
                  </td>

                  {/* Filename + tags */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{DOC_TYPE_ICONS[doc.type]}</span>
                      <div>
                        <p className="font-medium text-gray-100 group-hover:text-white text-sm">
                          {doc.fileName}
                        </p>
                        {doc.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[260px]">
                            {doc.description}
                          </p>
                        )}
                        {doc.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {doc.tags.map((tag) => (
                              <span key={tag} className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-800 text-gray-300 border border-gray-700 px-2 py-0.5 rounded-full">
                      {DOC_TYPE_LABELS[doc.type]}
                    </span>
                  </td>

                  {/* Business */}
                  <td className="px-4 py-3 text-gray-300 text-xs">{doc.businessName}</td>

                  {/* Date */}
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    <p>{formatDate(doc.uploadedAt)}</p>
                    <p className="text-gray-600">{doc.uploadedBy}</p>
                  </td>

                  {/* Size */}
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatBytes(doc.fileSizeBytes)}</td>

                  {/* Signature status (2D) */}
                  <td className="px-4 py-3">
                    {doc.signatureStatus === 'pending' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium bg-amber-900/60 text-amber-300 border border-amber-700 px-2 py-0.5 rounded-full">
                          Pending
                        </span>
                        <button
                          onClick={() => handleSendESign(doc)}
                          className="text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline transition-colors whitespace-nowrap"
                        >
                          Send E-Sign &rarr;
                        </button>
                      </div>
                    ) : doc.signatureStatus === 'esign_sent' ? (
                      <div className="flex flex-col">
                        <span className="text-xs font-medium bg-blue-900/60 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-full inline-block w-fit">
                          E-Sign Sent
                        </span>
                        {doc.esignSentAt && (
                          <span className="text-[10px] text-gray-500 mt-0.5">
                            {formatDate(doc.esignSentAt)}
                          </span>
                        )}
                      </div>
                    ) : doc.signatureStatus === 'signed' ? (
                      <span className="text-xs font-medium bg-emerald-900/60 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded-full">
                        Signed
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">---</span>
                    )}
                  </td>

                  {/* Legal hold toggle (2C) */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleLegalHold(doc)}
                      role="switch"
                      aria-checked={doc.legalHold}
                      aria-label={`Legal hold for ${doc.fileName}`}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                        doc.legalHold ? 'bg-orange-600' : 'bg-gray-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transform transition-transform ${
                          doc.legalHold ? 'translate-x-[18px]' : 'translate-x-[3px]'
                        }`}
                      />
                    </button>
                    {doc.legalHold && (
                      <span className="ml-2 text-xs font-bold text-orange-400">HOLD</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={handleView}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleDossier(doc)}
                        disabled={exportingId === doc.businessId}
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
                      >
                        {exportingId === doc.businessId ? 'Exporting...' : 'Dossier'}
                      </button>
                      {/* Release Hold button kept in modal for audit trail */}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer stats */}
      {displayed.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
          <span>Total size: {formatBytes(displayed.reduce((s, d) => s + d.fileSizeBytes, 0))}</span>
          <span>Legal holds: {displayed.filter((d) => d.legalHold).length}</span>
        </div>
      )}

      {/* ================================================================= */}
      {/* Upload Modal                                                      */}
      {/* ================================================================= */}
      {uploadModalOpen && (
        <ModalBackdrop onClose={() => setUploadModalOpen(false)}>
          <div className="p-6">
            <h2 className="text-lg font-bold text-white mb-4">Upload Document</h2>

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 ${
                uploadDragOver ? 'border-blue-500 bg-blue-950/30' : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
              }`}
              onDragOver={(e) => { e.preventDefault(); setUploadDragOver(true); }}
              onDragLeave={() => setUploadDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setUploadDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) setUploadFile(file);
              }}
              onClick={() => uploadFileRef.current?.click()}
            >
              <input
                ref={uploadFileRef}
                type="file"
                accept=".pdf,.jpg,.png,.json,.csv,.doc,.docx,.xlsx"
                onChange={(e) => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]); }}
                className="hidden"
              />
              {uploadFile ? (
                <div>
                  <p className="text-sm text-gray-200 font-medium">{uploadFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatBytes(uploadFile.size)}</p>
                </div>
              ) : (
                <div>
                  <p className="text-2xl mb-2">📁</p>
                  <p className="text-sm text-gray-400">Drag and drop a file here, or click to browse</p>
                  <p className="text-xs text-gray-600 mt-1">PDF, JPG, PNG, JSON, CSV, DOC, XLSX</p>
                </div>
              )}
            </div>

            {/* Document type */}
            <label className="block mb-3">
              <span className="text-xs text-gray-400 mb-1 block">Document Type</span>
              <select
                value={uploadDocType}
                onChange={(e) => setUploadDocType(e.target.value as DocumentType)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              >
                {UPLOAD_DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>

            {/* Client selector */}
            <label className="block mb-3">
              <span className="text-xs text-gray-400 mb-1 block">Client</span>
              <select
                value={uploadClient}
                onChange={(e) => setUploadClient(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select client...</option>
                {PLACEHOLDER_CLIENTS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            {/* Tags */}
            <label className="block mb-3">
              <span className="text-xs text-gray-400 mb-1 block">Tags (comma-separated)</span>
              <input
                type="text"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="e.g. bank, q1-2026, review"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
              />
            </label>

            {/* Legal hold */}
            <label className="flex items-center gap-2 mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={uploadLegalHold}
                onChange={(e) => setUploadLegalHold(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-sm text-gray-300">Place on legal hold</span>
            </label>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setUploadModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadSubmit}
                disabled={!uploadFile}
                className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Upload Document
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ================================================================= */}
      {/* Request from Client Modal                                         */}
      {/* ================================================================= */}
      {requestModalOpen && (
        <ModalBackdrop onClose={() => setRequestModalOpen(false)}>
          <div className="p-6">
            <h2 className="text-lg font-bold text-white mb-4">Request Document from Client</h2>

            {/* Client selector */}
            <label className="block mb-3">
              <span className="text-xs text-gray-400 mb-1 block">Client</span>
              <select
                value={requestClient}
                onChange={(e) => setRequestClient(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select client...</option>
                {PLACEHOLDER_CLIENTS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            {/* Document type */}
            <label className="block mb-3">
              <span className="text-xs text-gray-400 mb-1 block">Document Type</span>
              <select
                value={requestDocType}
                onChange={(e) => setRequestDocType(e.target.value as DocumentType)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              >
                {ALL_DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>

            {/* Message */}
            <label className="block mb-5">
              <span className="text-xs text-gray-400 mb-1 block">Message</span>
              <textarea
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                rows={3}
                placeholder="Please provide your most recent bank statement..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </label>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRequestModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestSubmit}
                disabled={!requestClient}
                className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send Request
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ================================================================= */}
      {/* Release Legal Hold Modal                                          */}
      {/* ================================================================= */}
      {releaseHoldModal && (
        <ModalBackdrop onClose={() => setReleaseHoldModal(null)}>
          <div className="p-6">
            <h2 className="text-lg font-bold text-white mb-2">Release Legal Hold</h2>
            <p className="text-sm text-gray-400 mb-4">
              Releasing hold on <span className="text-gray-200 font-medium">{releaseHoldModal.fileName}</span>
            </p>

            <label className="block mb-5">
              <span className="text-xs text-gray-400 mb-1 block">Documented Reason (required)</span>
              <textarea
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
                rows={3}
                placeholder="Provide the reason for releasing this legal hold..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                required
              />
            </label>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setReleaseHoldModal(null)}
                className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReleaseHold}
                disabled={!releaseReason.trim()}
                className="px-4 py-2 rounded-lg bg-orange-600 text-sm font-semibold text-white hover:bg-orange-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Release Hold
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
