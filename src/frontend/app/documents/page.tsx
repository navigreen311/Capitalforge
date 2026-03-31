'use client';

// ============================================================
// /documents — Document vault browser
// Filterable list with type, business, date, legal hold status.
// Upload button. Dossier export button.
// ============================================================

import { useState, useEffect, useRef } from 'react';
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
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_DOCS: DocumentRecord[] = [
  { id: 'doc_001', businessId: 'biz_001', businessName: 'Apex Ventures LLC',   type: 'bank_statement',          fileName: 'apex_bank_stmt_feb2026.pdf',    fileSizeBytes: 248_000,  uploadedAt: '2026-03-01T10:00:00Z', uploadedBy: 'Sarah Chen',      legalHold: false, tags: ['bank', 'q1-2026'], description: 'February 2026 business checking statement' },
  { id: 'doc_002', businessId: 'biz_001', businessName: 'Apex Ventures LLC',   type: 'consent_record',          fileName: 'apex_tcpa_consent_voice.json',  fileSizeBytes: 4_200,    uploadedAt: '2026-02-15T09:30:00Z', uploadedBy: 'System',          legalHold: true,  tags: ['consent', 'tcpa', 'voice'] },
  { id: 'doc_003', businessId: 'biz_002', businessName: 'NovaTech Solutions',  type: 'tax_return',              fileName: 'novatech_1120_2024.pdf',        fileSizeBytes: 1_200_000,uploadedAt: '2026-03-10T14:00:00Z', uploadedBy: 'Marcus Williams', legalHold: false, tags: ['tax', '2024'] },
  { id: 'doc_004', businessId: 'biz_003', businessName: 'Blue Ridge Consulting',type: 'articles_of_incorporation',fileName: 'blueridge_articles.pdf',       fileSizeBytes: 380_000,  uploadedAt: '2026-01-05T11:00:00Z', uploadedBy: 'Sarah Chen',      legalHold: false, tags: ['formation', 'legal'] },
  { id: 'doc_005', businessId: 'biz_004', businessName: 'Summit Capital Group', type: 'compliance_check',        fileName: 'summit_kyb_report.pdf',         fileSizeBytes: 92_000,   uploadedAt: '2026-03-20T16:00:00Z', uploadedBy: 'System',          legalHold: true,  tags: ['compliance', 'kyb'] },
  { id: 'doc_006', businessId: 'biz_005', businessName: 'Horizon Retail',      type: 'product_reality',         fileName: 'horizon_product_ack.pdf',       fileSizeBytes: 18_000,   uploadedAt: '2026-03-22T08:45:00Z', uploadedBy: 'Marcus Williams', legalHold: true,  tags: ['disclosure', 'ack'] },
  { id: 'doc_007', businessId: 'biz_006', businessName: 'Crestline Medical',   type: 'credit_report',           fileName: 'crestline_experian_pull.pdf',   fileSizeBytes: 560_000,  uploadedAt: '2026-03-28T09:00:00Z', uploadedBy: 'System',          legalHold: false, tags: ['credit', 'experian'] },
  { id: 'doc_008', businessId: 'biz_004', businessName: 'Summit Capital Group', type: 'application',             fileName: 'summit_chase_app_2026.pdf',     fileSizeBytes: 145_000,  uploadedAt: '2026-03-25T13:30:00Z', uploadedBy: 'James Okafor',    legalHold: false, tags: ['application', 'chase'] },
  { id: 'doc_009', businessId: 'biz_001', businessName: 'Apex Ventures LLC',   type: 'contract',                fileName: 'apex_advisor_agreement.pdf',    fileSizeBytes: 210_000,  uploadedAt: '2026-01-10T10:00:00Z', uploadedBy: 'Sarah Chen',      legalHold: true,  tags: ['contract', 'legal'] },
  { id: 'doc_010', businessId: 'biz_007', businessName: 'Pinnacle Freight',    type: 'bank_statement',          fileName: 'pinnacle_bank_stmt_q4.pdf',     fileSizeBytes: 330_000,  uploadedAt: '2026-02-28T15:00:00Z', uploadedBy: 'Sarah Chen',      legalHold: false, tags: ['bank', 'q4-2025'] },
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentRecord[]>(PLACEHOLDER_DOCS);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocumentType | ''>('');
  const [businessFilter, setBusinessFilter] = useState('');
  const [legalHoldOnly, setLegalHoldOnly] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const displayed = docs.filter((d) => {
    const matchSearch =
      !search ||
      d.fileName.toLowerCase().includes(search.toLowerCase()) ||
      d.businessName.toLowerCase().includes(search.toLowerCase()) ||
      d.tags.some((t) => t.includes(search.toLowerCase()));
    const matchType = !typeFilter || d.type === typeFilter;
    const matchBusiness = !businessFilter || d.businessId === businessFilter || d.businessName.toLowerCase().includes(businessFilter.toLowerCase());
    const matchHold = !legalHoldOnly || d.legalHold;
    return matchSearch && matchType && matchBusiness && matchHold;
  });

  const businesses = Array.from(new Set(docs.map((d) => d.businessName))).sort();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await documentsApi.upload(form);
      // In a real app, refetch or optimistically add the new doc
    } catch { /* silently fail in demo */ }
    finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportDossier = async (businessId: string) => {
    setExportingId(businessId);
    try {
      await documentsApi.exportDossier(businessId);
      // Real implementation would trigger a download
    } catch { /* silently fail in demo */ }
    finally { setExportingId(null); }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Document Vault</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {displayed.length} documents · {docs.filter((d) => d.legalHold).length} on legal hold
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.png,.json,.csv"
            onChange={handleUpload}
            className="hidden"
            id="doc-upload"
          />
          <label
            htmlFor="doc-upload"
            className={`px-4 py-2 rounded-lg border border-gray-700 text-sm font-semibold cursor-pointer transition-colors ${
              uploading
                ? 'bg-gray-800 text-gray-500'
                : 'bg-gray-800 text-gray-200 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {uploading ? 'Uploading…' : '↑ Upload'}
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search filename, business, tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
        />

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

        {(search || typeFilter || businessFilter || legalHoldOnly) && (
          <button
            onClick={() => { setSearch(''); setTypeFilter(''); setBusinessFilter(''); setLegalHoldOnly(false); }}
            className="px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Document list */}
      {loading ? (
        <p className="text-center text-gray-500 py-12">Loading documents…</p>
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
                <th className="text-left px-4 py-3 font-semibold">Document</th>
                <th className="text-left px-4 py-3 font-semibold">Type</th>
                <th className="text-left px-4 py-3 font-semibold">Business</th>
                <th className="text-left px-4 py-3 font-semibold">Uploaded</th>
                <th className="text-left px-4 py-3 font-semibold">Size</th>
                <th className="text-left px-4 py-3 font-semibold">Legal Hold</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {displayed.map((doc) => (
                <tr key={doc.id} className="bg-gray-950 hover:bg-gray-900 transition-colors group">
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

                  {/* Legal hold */}
                  <td className="px-4 py-3">
                    {doc.legalHold ? (
                      <span className="text-xs font-bold bg-orange-900 text-orange-300 border border-orange-700 px-2 py-0.5 rounded-full">
                        Hold
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                        View
                      </button>
                      <button
                        onClick={() => handleExportDossier(doc.businessId)}
                        disabled={exportingId === doc.businessId}
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
                      >
                        {exportingId === doc.businessId ? 'Exporting…' : 'Dossier'}
                      </button>
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
    </div>
  );
}
