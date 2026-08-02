'use client';

// ============================================================
// /documents — the document vault
//
// This page listed documents as literals — titles, sizes, upload dates and
// clients — while GET /api/businesses/:id/documents returned the ones on
// record. A document list is what somebody checks before saying a file was
// received.
//
// Document contents are not read here: the vault stores metadata and a
// storage key, and nothing in this codebase retrieves the file itself.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { authHeaders } from '@/lib/api-client';

interface ClientOption { id: string; businessName: string }
interface DocRow {
  id: string;
  title?: string | null;
  documentType?: string | null;
  sizeBytes?: number | null;
  legalHold?: boolean;
  createdAt?: string | null;
}

export default function DocumentsPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState<DocRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('other');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/clients?limit=200', { headers: authHeaders() });
        const body = (await res.json()) as { success?: boolean; data?: ClientOption[] };
        const list = body.success === true ? body.data ?? [] : [];
        setClients(list);
        if (list.length > 0) setSelected(list[0].id);
        else setLoading(false);
      } catch {
        setError('Could not load the client list.');
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async (businessId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/documents`, {
        headers: authHeaders(),
      });
      const body = (await res.json()) as { success?: boolean; data?: { documents?: DocRow[] } };
      if (!res.ok || body.success !== true) {
        setError(`Documents could not be loaded (HTTP ${res.status}).`);
        setRows(null);
        return;
      }
      setRows(body.data?.documents ?? []);
    } catch {
      setError('Could not reach the server.');
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected !== '') void load(selected);
  }, [selected, load]);

  // A real upload: the endpoint takes the file bytes base64-encoded, stores
  // the document and returns the record. Nothing is claimed to be stored
  // until it answers.
  const upload = useCallback(async () => {
    if (file === null) return;
    setUploading(true);
    setUploadError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      const content = btoa(binary);

      const res = await fetch(`/api/businesses/${encodeURIComponent(selected)}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          documentType: docType,
          title: title.trim() === '' ? file.name : title.trim(),
          content,
          mimeType: file.type === '' ? 'application/octet-stream' : file.type,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        setUploadError(body.error?.message ?? `The document was not stored (HTTP ${res.status}).`);
        return;
      }
      setShowUpload(false);
      setFile(null);
      setTitle('');
      await load(selected);
    } catch {
      setUploadError('Could not reach the server, so nothing was uploaded.');
    } finally {
      setUploading(false);
    }
  }, [file, title, docType, selected, load]);

  const docs = rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-1">Documents held for a client.</p>
        </div>
        {clients.length > 0 && (
          <div>
            <label htmlFor="doc-client" className="block text-xs text-gray-500 mb-1">Client</label>
            <select
              id="doc-client"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.businessName}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowUpload((v) => !v)}
          disabled={selected === ''}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:border-gray-400 disabled:opacity-50"
        >
          ↑ Upload
        </button>
      </div>

      {showUpload && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Upload a document</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <label htmlFor="doc-file" className="block text-xs text-gray-500 mb-1">File</label>
              <input
                id="doc-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm text-gray-800"
              />
            </div>
            <div>
              <label htmlFor="doc-title" className="block text-xs text-gray-500 mb-1">Title</label>
              <input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Defaults to the file name"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              />
            </div>
            <div>
              <label htmlFor="doc-type" className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                id="doc-type"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
              >
                {[
                  'consent_form',
                  'acknowledgment',
                  'application',
                  'disclosure',
                  'adverse_action',
                  'contract',
                  'statement',
                  'other',
                ].map((v) => (
                  <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          {uploadError !== null && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {uploadError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void upload()}
            disabled={uploading || file === null}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && error === null && rows !== null && (
        docs.length === 0 ? (
          <p className="text-sm text-gray-500">No document is held for this client.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">Size</th>
                  <th className="px-4 py-3 text-left">Legal hold</th>
                  <th className="px-4 py-3 text-left">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 text-gray-900">{d.title ?? d.id}</td>
                    <td className="px-4 py-3 text-gray-600">{d.documentType ?? '\u2014'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {d.sizeBytes === null || d.sizeBytes === undefined
                        ? '\u2014'
                        : `${Math.round(d.sizeBytes / 1024)} KB`}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{d.legalHold === true ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-gray-500">{d.createdAt?.slice(0, 10) ?? '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
