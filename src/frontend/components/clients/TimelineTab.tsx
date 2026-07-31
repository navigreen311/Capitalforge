'use client';

// ============================================================
// TimelineTab — Chronological event stream for a client
//
// Displays a vertical timeline of client events (applications,
// payments, consent, calls, compliance, documents, credit, notes)
// with type-based filtering, keyword search, and an "Add Note"
// modal for advisor annotations with optimistic updates.
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import {
  getEventConfig,
  formatRelativeTime,
  toTimelineEvents,
  type EventCategory,
  type TimelineEvent,
} from '@/lib/timeline-view';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import { SectionCard } from '../ui/card';

// ── Types ───────────────────────────────────────────────────────────────────

interface TimelineTabProps {
  clientId: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const FILTER_TABS: { key: EventCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'application', label: 'Applications' },
  { key: 'payment', label: 'Payments' },
  { key: 'consent', label: 'Consent' },
  { key: 'call', label: 'Calls' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'document', label: 'Documents' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatAbsoluteTime(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="animate-pulse space-y-6 py-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="h-10 w-10 rounded-full bg-gray-200" />
            {i < 4 && <div className="w-0.5 flex-1 bg-gray-100 mt-2" />}
          </div>
          <div className="flex-1 space-y-2 pb-6">
            <div className="flex items-center justify-between">
              <div className="h-4 w-48 rounded bg-gray-200" />
              <div className="h-3 w-20 rounded bg-gray-100" />
            </div>
            <div className="h-3 w-64 rounded bg-gray-100" />
            <div className="h-3 w-24 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Add Note Modal ──────────────────────────────────────────────────────────

interface AddNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (noteText: string) => void;
  isSaving: boolean;
}

function AddNoteModal({ isOpen, onClose, onSave, isSaving }: AddNoteModalProps) {
  const [noteText, setNoteText] = useState('');

  const handleSave = useCallback(() => {
    if (!noteText.trim()) return;
    onSave(noteText.trim());
    setNoteText('');
  }, [noteText, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Add timeline note"
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Add Note</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add a note about this client..."
          rows={4}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none resize-none"
          autoFocus
        />

        <div className="flex justify-end gap-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!noteText.trim() || isSaving}
            className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
              !noteText.trim() || isSaving
                ? 'bg-indigo-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isSaving ? (
              <>
                <svg
                  className="mr-1.5 h-3.5 w-3.5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              'Save Note'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function TimelineTab({ clientId }: TimelineTabProps) {
  const { data, isLoading, error, refetch } = useAuthFetch<unknown>(
    `/api/v1/clients/${clientId}/timeline`,
  );

  const [activeFilter, setActiveFilter] = useState<EventCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [optimisticEvents, setOptimisticEvents] = useState<TimelineEvent[]>([]);

  // Merge API events with optimistic ones (optimistic on top). An empty
  // ledger yields an empty timeline — it previously yielded a set of sample
  // events, so a client with no recorded activity looked active.
  const allEvents = useMemo(
    () => [...optimisticEvents, ...toTimelineEvents(data)],
    [data, optimisticEvents],
  );

  // Filter + search
  const filteredEvents = useMemo(() => {
    let events = allEvents;

    if (activeFilter !== 'all') {
      events = events.filter((e) => {
        const config = getEventConfig(e.event_type);
        return config.category === activeFilter;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      events = events.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.detail.toLowerCase().includes(q) ||
          e.actor.toLowerCase().includes(q),
      );
    }

    return events;
  }, [allEvents, activeFilter, searchQuery]);

  // ── Add Note handler ────────────────────────────────────────
  const handleSaveNote = useCallback(
    async (noteText: string) => {
      setIsSaving(true);

      // Optimistic update — insert at the top immediately
      const optimisticEvent: TimelineEvent = {
        id: `opt-${Date.now()}`,
        event_type: 'client.advisor_note_added',
        title: 'Advisor note added',
        detail: noteText,
        actor: 'You',
        timestamp: new Date().toISOString(),
      };

      setOptimisticEvents((prev) => [optimisticEvent, ...prev]);
      setIsModalOpen(false);

      try {
        const token =
          typeof window !== 'undefined'
            ? localStorage.getItem('cf_access_token')
            : null;

        await fetch('/api/v1/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            event_type: 'client.advisor_note_added',
            payload: { client_id: clientId, note_text: noteText },
          }),
        });

        // Success toast (simple alert fallback — would use a toast library in prod)
        if (typeof window !== 'undefined') {
          // Dispatch a custom event that a toast system could pick up
          window.dispatchEvent(
            new CustomEvent('cf:toast', {
              detail: { message: 'Note added to timeline', type: 'success' },
            }),
          );
        }
      } catch {
        // Silently handle — optimistic event stays visible
        console.error('[TimelineTab] Failed to save note');
      } finally {
        setIsSaving(false);
      }
    },
    [clientId],
  );

  // ── Loading ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SectionCard title="Timeline">
        <TimelineSkeleton />
      </SectionCard>
    );
  }

  // ── Error ───────────────────────────────────────────────────
  if (error) {
    return (
      <DashboardErrorState
        error={error}
        onRetry={refetch}
      />
    );
  }

  // ── Header action ───────────────────────────────────────────
  const headerAction = (
    <button
      type="button"
      onClick={() => setIsModalOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      Add Note
    </button>
  );

  // ── Render ──────────────────────────────────────────────────
  return (
    <>
      <SectionCard title="Timeline" action={headerAction}>
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          <div className="flex flex-wrap gap-1.5">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveFilter(tab.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeFilter === tab.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-56 sm:ml-auto">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              className="w-full rounded-lg border border-gray-300 py-1.5 pl-9 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
            />
          </div>
        </div>

        {/* Event list */}
        {filteredEvents.length === 0 ? (
          <div className="py-12 text-center">
            {allEvents.length === 0 ? (
              <>
                <p className="text-sm font-medium text-gray-700">No recorded activity</p>
                <p className="mt-1 text-xs text-gray-500">
                  Nothing has been logged against this client yet.
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No events match your filters.</p>
            )}
          </div>
        ) : (
          <div className="relative">
            {filteredEvents.map((event, idx) => {
              const config = getEventConfig(event.event_type);
              const isLast = idx === filteredEvents.length - 1;

              return (
                <div key={event.id} className="flex gap-4">
                  {/* Icon column with vertical line */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${config.bgClass}`}
                    >
                      <span className={`text-xs font-bold ${config.textClass}`}>
                        {config.monogram}
                      </span>
                    </div>
                    {!isLast && (
                      <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
                    )}
                  </div>

                  {/* Content column */}
                  <div className={`flex-1 min-w-0 ${isLast ? 'pb-2' : 'pb-6'}`}>
                    {/* Row 1: title + relative time */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 leading-tight">
                        {event.title}
                      </p>
                      <span className="flex-shrink-0 text-xs text-gray-400 whitespace-nowrap">
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>

                    {/* Row 2: detail + absolute time */}
                    <div className="flex items-start justify-between gap-2 mt-0.5">
                      <p className="text-sm text-gray-600 leading-snug">
                        {event.detail}
                      </p>
                      <span className="flex-shrink-0 text-[11px] text-gray-300 whitespace-nowrap hidden sm:inline">
                        {formatAbsoluteTime(event.timestamp)}
                      </span>
                    </div>

                    {/* Row 3: actor + link */}
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="text-xs text-gray-400">
                        {event.actor}
                      </span>
                      {event.link && (
                        <a
                          href={event.link}
                          className="flex-shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          View &rarr;
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Add Note Modal */}
      <AddNoteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveNote}
        isSaving={isSaving}
      />
    </>
  );
}
