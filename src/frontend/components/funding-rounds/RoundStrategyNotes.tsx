'use client';

// ============================================================
// RoundStrategyNotes — Editable strategy notes for a funding round
//
// Displays notes as paragraph text with an "Edit Notes" toggle
// that switches to an inline textarea. Saves via PATCH to the
// funding-rounds API endpoint.
// ============================================================

import React, { useState, useCallback, useEffect } from 'react';
import { SectionCard } from '../ui/card';
import { apiClient } from '@/lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RoundStrategyNotesProps {
  roundId: string;
  initialNotes: string;
}

// ─── Inline Toast ───────────────────────────────────────────────────────────

function InlineToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex items-center gap-3 bg-emerald-700 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-bottom-4">
      <span>{message}</span>
      <button onClick={onDismiss} className="text-white/70 hover:text-white text-lg leading-none">
        &times;
      </button>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RoundStrategyNotes({ roundId, initialNotes }: RoundStrategyNotesProps) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleEdit = useCallback(() => {
    setDraft(notes);
    setEditing(true);
  }, [notes]);

  const handleCancel = useCallback(() => {
    setDraft(notes);
    setEditing(false);
  }, [notes]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('cf_access_token') : null;

      if (!token) {
        setToast('Authentication required');
        setSaving(false);
        return;
      }

      await apiClient.patch(`/v1/funding-rounds/${roundId}`, { notes: draft });

      setNotes(draft);
      setEditing(false);
      setToast('Strategy notes saved');
    } catch (err) {
      console.error('[RoundStrategyNotes] save failed:', err);
      setToast('Failed to save notes. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [roundId, draft]);

  return (
    <>
      <SectionCard
        title="Round Strategy"
        action={
          !editing ? (
            <button
              onClick={handleEdit}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              Edit Notes
            </button>
          ) : undefined
        }
      >
        {editing ? (
          <div className="space-y-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-y"
              placeholder="Enter strategy notes for this round..."
              disabled={saving}
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {notes || 'No strategy notes yet.'}
          </p>
        )}
      </SectionCard>

      {/* ── Toast ────────────────────────────────────────────────────────── */}
      {toast && <InlineToast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
