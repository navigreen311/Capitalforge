'use client';

// ============================================================
// DocumentsTab — Client documents management panel
//
// Features:
//   - Required documents checklist with upload status
//   - Document type filter bar
//   - E-signature status column with Send for Signature action
//   - Legal hold display with Release Hold confirmation modal
//   - Request from Client modal for requesting missing documents
//   - Kebab actions menu (View / Download)
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { SectionCard } from '../ui/card';
import { FocusTrap } from '@/components/ui/focus-trap';

// ── Types ───────────────────────────────────────────────────────────────────

interface DocumentsTabProps {
  clientId: string;
}

type SignatureStatus = 'signed' | 'pending' | 'not_required' | 'sent' | 'delivered';
type DocumentType = 'consent' | 'contract' | 'bank_statement' | 'id' | 'compliance' | 'other';
type FilterType = 'all' | DocumentType;

interface DocumentRecord {
  id: string;
  name: string;
  type: DocumentType;
  typeLabel: string;
  size: string;
  uploadedAt: string;
  signatureStatus: SignatureStatus;
  legalHold: boolean;
  /** DocuSign envelope tracking */
  docusignEnvelopeId?: string | null;
}

interface RequiredDoc {
  label: string;
  uploaded: boolean;
  fileName?: string;
}

// ── Placeholder Data ────────────────────────────────────────────────────────

const REQUIRED_DOCUMENTS: RequiredDoc[] = [
  { label: 'Bank Statement (3 months)', uploaded: true,  fileName: 'apex_bank_stmt_feb2026.pdf' },
  { label: 'Advisor Agreement',         uploaded: true,  fileName: 'apex_advisor_agreement.pdf' },
  { label: 'TCPA Consent Record',       uploaded: true,  fileName: 'apex_tcpa_consent_voice.json' },
  { label: 'Product-Reality Acknowledgment', uploaded: false },
  { label: 'Government ID (Owner)',     uploaded: false },
];

const PLACEHOLDER_DOCUMENTS: DocumentRecord[] = [
  {
    id: 'doc-001',
    name: 'apex_bank_stmt_feb2026.pdf',
    type: 'bank_statement',
    typeLabel: 'Bank Statement',
    size: '1.2 MB',
    uploadedAt: '2026-02-14',
    signatureStatus: 'not_required',
    legalHold: false,
  },
  {
    id: 'doc-002',
    name: 'apex_advisor_agreement.pdf',
    type: 'contract',
    typeLabel: 'Contract',
    size: '420 KB',
    uploadedAt: '2026-01-20',
    signatureStatus: 'signed',
    legalHold: false,
  },
  {
    id: 'doc-003',
    name: 'apex_tcpa_consent_voice.json',
    type: 'consent',
    typeLabel: 'Consent',
    size: '8 KB',
    uploadedAt: '2026-01-18',
    signatureStatus: 'signed',
    legalHold: true,
  },
  {
    id: 'doc-004',
    name: 'apex_compliance_disclosure_2026.pdf',
    type: 'compliance',
    typeLabel: 'Compliance',
    size: '310 KB',
    uploadedAt: '2026-03-01',
    signatureStatus: 'pending',
    legalHold: false,
  },
  {
    id: 'doc-005',
    name: 'apex_owner_dl_scan.png',
    type: 'id',
    typeLabel: 'ID',
    size: '2.8 MB',
    uploadedAt: '2026-03-10',
    signatureStatus: 'not_required',
    legalHold: true,
  },
];

const DOCUMENT_TYPE_OPTIONS = [
  'Bank Statement',
  'Advisor Agreement',
  'TCPA Consent Record',
  'Product-Reality Acknowledgment',
  'Government ID (Owner)',
  'Compliance Disclosure',
  'Other',
];

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all',            label: 'All' },
  { value: 'consent',        label: 'Consent' },
  { value: 'contract',       label: 'Contract' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'id',             label: 'ID' },
  { value: 'compliance',     label: 'Compliance' },
  { value: 'other',          label: 'Other' },
];

const TYPE_ICONS: Record<DocumentType, string> = {
  consent:        '\u{1F4DC}',
  contract:       '\u{1F4DD}',
  bank_statement: '\u{1F3E6}',
  id:             '\u{1F4B3}',
  compliance:     '\u{1F6E1}',
  other:          '\u{1F4C4}',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function getAuthToken(): string {
  try {
    return localStorage.getItem('cf_token') ?? '';
  } catch {
    return '';
  }
}

// ── Signature Badge ─────────────────────────────────────────────────────────

const SIG_STYLES: Record<SignatureStatus, string> = {
  signed:       'bg-emerald-100 text-emerald-800 border-emerald-300',
  pending:      'bg-amber-100 text-amber-800 border-amber-300',
  sent:         'bg-blue-100 text-blue-800 border-blue-300',
  delivered:    'bg-indigo-100 text-indigo-800 border-indigo-300',
  not_required: 'bg-gray-100 text-gray-500 border-gray-300',
};

const SIG_LABELS: Record<SignatureStatus, string> = {
  signed:       'Signed',
  pending:      'Pending Signature',
  sent:         'Sent for Signature',
  delivered:    'Delivered to Signer',
  not_required: 'Not Required',
};

function SignatureBadge({
  status,
  onSendForSignature,
  isSending,
}: {
  status: SignatureStatus;
  onSendForSignature?: () => void;
  isSending?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${SIG_STYLES[status]}`}
      >
        {SIG_LABELS[status]}
      </span>
      {(status === 'pending') && onSendForSignature && (
        <button
          onClick={onSendForSignature}
          disabled={isSending}
          className={`text-xs font-medium transition-colors ${
            isSending
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-blue-600 hover:text-blue-700 hover:underline'
          }`}
        >
          {isSending ? 'Sending...' : 'Request Signature'}
        </button>
      )}
    </div>
  );
}

// ── Kebab Actions Menu ──────────────────────────────────────────────────────

function DocKebabMenu({ doc }: { doc: DocumentRecord }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((p) => !p)}
        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label={`Actions for ${doc.name}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        &#x22EE;
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 w-40 bg-white rounded-lg shadow-lg border border-surface-border py-1"
          role="menu"
        >
          <a
            href={`/documents/${doc.id}/view`}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            View
          </a>
          <a
            href={`/documents/${doc.id}/download`}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            Download
          </a>
        </div>
      )}
    </div>
  );
}

// ── Toast ───────────────────────────────────────────────────────────────────

function InlineToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-3 bg-emerald-700 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-bottom-4">
      <span>{message}</span>
      <button onClick={onDismiss} className="text-white/70 hover:text-white text-lg leading-none">&times;</button>
    </div>
  );
}

// ── Request from Client Modal ───────────────────────────────────────────────

function RequestModal({
  isOpen,
  onClose,
  clientId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  onSuccess: (msg: string) => void;
}) {
  const [docType, setDocType] = useState(DOCUMENT_TYPE_OPTIONS[0]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    setSending(true);
    try {
      // Mock POST — replace with real API call
      await new Promise((resolve) => setTimeout(resolve, 600));
      // POST /api/v1/clients/:clientId/document-requests
      console.info('[DocumentsTab] POST /api/v1/clients/%s/document-requests', clientId, { docType, message });
      onSuccess(`Request for "${docType}" sent to client`);
      setMessage('');
      onClose();
    } finally {
      setSending(false);
    }
  }, [clientId, docType, message, onClose, onSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <FocusTrap active={isOpen}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
            <h3 className="text-base font-semibold text-gray-900">Request Document from Client</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            <div>
              <label htmlFor="req-doc-type" className="block text-sm font-medium text-gray-700 mb-1">
                Document Type
              </label>
              <select
                id="req-doc-type"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy"
              >
                {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="req-message" className="block text-sm font-medium text-gray-700 mb-1">
                Message
              </label>
              <textarea
                id="req-message"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Please upload your most recent bank statement..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy/90 transition-colors disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

// ── Release Hold Confirmation Modal ─────────────────────────────────────────

function ReleaseHoldModal({
  isOpen,
  doc,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  doc: DocumentRecord | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [releasing, setReleasing] = useState(false);

  const handleRelease = useCallback(async () => {
    if (!doc) return;
    setReleasing(true);
    try {
      const token = getAuthToken();
      // Mock DELETE — replace with real API call
      await new Promise((resolve) => setTimeout(resolve, 600));
      console.info(
        '[DocumentsTab] DELETE /api/v1/documents/%s/hold — Authorization: Bearer %s',
        doc.id,
        token ? '***' : '(none)',
      );
      console.info('[DocumentsTab] Audit log: legal_hold_released doc_id=%s', doc.id);
      onSuccess(`Legal hold released for "${doc.name}"`);
      onClose();
    } finally {
      setReleasing(false);
    }
  }, [doc, onClose, onSuccess]);

  if (!isOpen || !doc) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <FocusTrap active={isOpen}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
          <div className="px-6 py-5 space-y-3">
            <h3 className="text-base font-semibold text-gray-900">Release Legal Hold</h3>
            <p className="text-sm text-gray-600">
              Are you sure you want to release the legal hold on{' '}
              <span className="font-medium text-gray-900">{doc.name}</span>?
              This action will be logged for compliance audit.
            </p>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRelease}
              disabled={releasing}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {releasing ? 'Releasing...' : 'Release Hold'}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function DocumentsTab({ clientId }: DocumentsTabProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [holdModalDoc, setHoldModalDoc] = useState<DocumentRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>(PLACEHOLDER_DOCUMENTS);

  const filteredDocs = filter === 'all'
    ? documents
    : documents.filter((d) => d.type === filter);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  const handleReleaseHoldSuccess = useCallback((msg: string) => {
    if (holdModalDoc) {
      setDocuments((prev) =>
        prev.map((d) => (d.id === holdModalDoc.id ? { ...d, legalHold: false } : d)),
      );
    }
    showToast(msg);
  }, [holdModalDoc, showToast]);

  const [sendingSignatureId, setSendingSignatureId] = useState<string | null>(null);

  const handleSendForSignature = useCallback(async (doc: DocumentRecord) => {
    setSendingSignatureId(doc.id);
    try {
      const token = getAuthToken();

      const res = await fetch('/api/docusign/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          signerEmail:     'client@example.com', // In production, fetched from client record
          signerName:      'Client Signer',      // In production, fetched from client record
          documentBase64:  btoa(doc.name),        // Stub — real impl sends actual doc bytes
          documentName:    doc.name,
          envelopeSubject: `CapitalForge: Please sign ${doc.name}`,
          envelopeMessage: `Please review and sign the document "${doc.name}".`,
          businessId:      clientId,
          docType:         doc.type,
        }),
      });

      const result = await res.json();

      if (result.success) {
        // Update local state to reflect sent status
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? { ...d, signatureStatus: 'sent' as SignatureStatus, docusignEnvelopeId: result.data?.envelopeId }
              : d,
          ),
        );
        const msg = result.data?.isMock
          ? `[DEMO] DocuSign signature request sent for "${doc.name}"`
          : `Signature request sent for "${doc.name}" via DocuSign`;
        showToast(msg);
      } else {
        showToast(`Failed to send for signature: ${result.error?.message ?? 'Unknown error'}`);
      }
    } catch {
      showToast('Failed to send for signature. Please try again.');
    } finally {
      setSendingSignatureId(null);
    }
  }, [clientId, showToast]);

  const handleRequestDoc = useCallback((label: string) => {
    setRequestModalOpen(true);
  }, []);

  return (
    <div className="space-y-6">
      {/* ── Required Documents Checklist ─────────────────────────────────── */}
      <SectionCard
        title="Required Documents"
        subtitle="Required for funding applications"
      >
        <ul className="space-y-2">
          {REQUIRED_DOCUMENTS.map((rd) => (
            <li key={rd.label} className="flex items-center gap-3 text-sm">
              {rd.uploaded ? (
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold">
                  &#x2713;
                </span>
              ) : (
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-amber-100 text-amber-600 text-xs font-bold">
                  !
                </span>
              )}
              <span className="font-medium text-gray-900">{rd.label}</span>
              {rd.uploaded ? (
                <span className="text-gray-500">&mdash; {rd.fileName}</span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-gray-400">&mdash; NOT UPLOADED</span>
                  <button
                    onClick={() => handleRequestDoc(rd.label)}
                    className="text-xs font-medium text-brand-navy hover:underline px-2 py-0.5 rounded border border-brand-navy/20 hover:bg-brand-navy/5 transition-colors"
                  >
                    Request
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* ── Documents Table Section ──────────────────────────────────────── */}
      <SectionCard
        title="Documents"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRequestModalOpen(true)}
              className="px-3 py-1.5 text-sm font-medium text-brand-navy rounded-lg border border-brand-navy/20 hover:bg-brand-navy/5 transition-colors"
            >
              Request from Client
            </button>
            <button className="px-3 py-1.5 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy/90 transition-colors">
              Upload
            </button>
          </div>
        }
        flushBody
      >
        {/* Filter Row */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-surface-border overflow-x-auto">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === opt.value
                  ? 'bg-brand-navy text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="cf-table-wrapper border-0 rounded-none">
          <table className="cf-table">
            <thead>
              <tr>
                <th className="text-left">Type</th>
                <th className="text-left">Name</th>
                <th className="text-left">Category</th>
                <th className="text-left">Size</th>
                <th className="text-left">Uploaded</th>
                <th className="text-left">Signature</th>
                <th className="text-left">Hold</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400 text-sm">
                    No documents match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => (
                  <tr key={doc.id} className="group">
                    <td>
                      <span className="text-base" aria-label={doc.typeLabel}>
                        {TYPE_ICONS[doc.type]}
                      </span>
                    </td>
                    <td>
                      <span className="font-medium text-gray-900">{doc.name}</span>
                    </td>
                    <td>{doc.typeLabel}</td>
                    <td>{doc.size}</td>
                    <td>{doc.uploadedAt}</td>
                    <td>
                      <SignatureBadge
                        status={doc.signatureStatus}
                        isSending={sendingSignatureId === doc.id}
                        onSendForSignature={
                          doc.signatureStatus === 'pending'
                            ? () => handleSendForSignature(doc)
                            : undefined
                        }
                      />
                    </td>
                    <td>
                      {doc.legalHold ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-red-100 border border-red-300 text-red-800 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">
                            HOLD
                          </span>
                          <button
                            onClick={() => setHoldModalDoc(doc)}
                            className="text-xs text-red-600 hover:underline font-medium"
                          >
                            Release Hold
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">&mdash;</span>
                      )}
                    </td>
                    <td className="text-right">
                      <DocKebabMenu doc={doc} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <RequestModal
        isOpen={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        clientId={clientId}
        onSuccess={showToast}
      />

      <ReleaseHoldModal
        isOpen={holdModalDoc !== null}
        doc={holdModalDoc}
        onClose={() => setHoldModalDoc(null)}
        onSuccess={handleReleaseHoldSuccess}
      />

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toast && <InlineToast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
