'use client';

// ============================================================
// RoundActivityTimeline — Collapsible activity timeline for a
// funding round detail page. Shows chronological events with
// an inline "Add Note" form and optimistic updates.
// ============================================================

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';
import { SectionCard } from '../ui/card';

// ── Types ───────────────────────────────────────────────────────────────────

interface RoundActivityTimelineProps {
  roundId: string;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  detail: string;
  actor: string;
  timestamp: string;
}

interface TimelineData {
  events: TimelineEvent[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Placeholder data ────────────────────────────────────────────────────────

function buildPlaceholderEvents(): TimelineEvent[] {
  return [
    {
      id: 'evt-r01',
      event_type: 'round.created',
      title: 'Round created',
      detail: 'Funding round initiated with target of $150,000',
      actor: 'Sarah Chen',
      timestamp: daysAgo(60),
    },
    {
      id: 'evt-r02',
      event_type: 'round.application_drafted',
      title: 'Application drafted',
      detail: 'Ink Business Preferred (Chase) application prepared',
      actor: 'Sarah Chen',
      timestamp: daysAgo(45),
    },
    {
      id: 'evt-r03',
      event_type: 'round.application_submitted',
      title: 'Application submitted',
      detail: 'Ink Business Preferred (Chase) submitted for review',
      actor: 'Sarah Chen',
      timestamp: daysAgo(30),
    },
    {
      id: 'evt-r04',
      event_type: 'round.application_approved',
      title: 'Application approved',
      detail: 'Ink Business Preferred (Chase) approved — $45,000 credit line',
      actor: 'System',
      timestamp: daysAgo(14),
    },
  ];
}

// ── Loading skeleton ────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="animate-pulse space-y-4 py-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4 items-start">
          <div className="w-20 flex-shrink-0">
            <div className="h-3 w-16 rounded bg-gray-200" />
          </div>
          <div className="relative flex flex-col items-center">
            <div className="h-3 w-3 rounded-full bg-gray-200" />
            {i < 3 && <div className="w-0.5 flex-1 bg-gray-100 mt-1 min-h-[2rem]" />}
          </div>
          <div className="flex-1 space-y-1.5 pb-4">
            <div className="flex items-center justify-between">
              <div className="h-4 w-40 rounded bg-gray-200" />
              <div className="h-3 w-20 rounded bg-gray-100" />
            </div>
            <div className="h-3 w-56 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function RoundActivityTimeline({ roundId }: RoundActivityTimelineProps) {
  const { data, isLoading, error, refetch } = useAuthFetch<TimelineData>(
    `/api/v1/funding-rounds/${roundId}/timeline`,
  );

  const [isExpanded, setIsExpanded] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [optimisticEvents, setOptimisticEvents] = useState<TimelineEvent[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  // Measure inner content height for smooth animation
  useEffect(() => {
    if (contentRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContentHeight(entry.contentRect.height);
        }
      });
      observer.observe(contentRef.current);
      return () => observer.disconnect();
    }
  }, []);

  // Merge API events with optimistic ones
  const events = useMemo(() => {
    const apiEvents = data?.events ?? buildPlaceholderEvents();
    return [...optimisticEvents, ...apiEvents];
  }, [data, optimisticEvents]);

  // ── Add Note handler ────────────────────────────────────────
  const handleSaveNote = useCallback(async () => {
    if (!noteText.trim()) return;

    setIsSaving(true);

    const optimisticEvent: TimelineEvent = {
      id: `opt-${Date.now()}`,
      event_type: 'round.advisor_note_added',
      title: 'Note added',
      detail: noteText.trim(),
      actor: 'You',
      timestamp: new Date().toISOString(),
    };

    setOptimisticEvents((prev) => [optimisticEvent, ...prev]);
    setNoteText('');
    setShowNoteForm(false);

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
          event_type: 'round.advisor_note_added',
          payload: { round_id: roundId, note_text: noteText.trim() },
        }),
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('cf:toast', {
            detail: { message: 'Note added to timeline', type: 'success' },
          }),
        );
      }
    } catch {
      console.error('[RoundActivityTimeline] Failed to save note');
    } finally {
      setIsSaving(false);
    }
  }, [noteText, roundId]);

  // ── Error ──────────────────────────────────────────────────
  if (error) {
    return <DashboardErrorState error={error} onRetry={refetch} />;
  }

  // ── Header toggle ─────────────────────────────────────────
  const toggleHeader = (
    <button
      type="button"
      onClick={() => setIsExpanded((prev) => !prev)}
      className="w-full flex items-center justify-between gap-2 text-left"
      aria-expanded={isExpanded}
    >
      <span className="text-base font-semibold text-gray-900">
        {isExpanded ? '\u25BC' : '\u25B6'} Activity ({events.length} event{events.length !== 1 ? 's' : ''})
      </span>
    </button>
  );

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-surface-border shadow-card overflow-hidden">
      {/* Collapsible header */}
      <div className="px-6 py-4 border-b border-surface-border">
        {toggleHeader}
      </div>

      {/* Animated collapsible body */}
      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: isExpanded ? `${contentHeight + 32}px` : '0px' }}
      >
        <div ref={contentRef} className="p-6">
          {isLoading ? (
            <TimelineSkeleton />
          ) : (
            <>
              {/* Timeline events */}
              <div className="relative">
                {events.map((event, idx) => {
                  const isLast = idx === events.length - 1;

                  return (
                    <div key={event.id} className="flex gap-4 items-start">
                      {/* Date column */}
                      <div className="w-20 flex-shrink-0 pt-0.5">
                        <span className="text-xs text-gray-400">
                          {formatDate(event.timestamp)}
                        </span>
                      </div>

                      {/* Dot + vertical line */}
                      <div className="flex flex-col items-center">
                        <div className="h-3 w-3 rounded-full bg-brand-navy/60 border-2 border-white shadow-sm flex-shrink-0 mt-1" />
                        {!isLast && (
                          <div className="w-0.5 flex-1 bg-gray-200 min-h-[2rem]" />
                        )}
                      </div>

                      {/* Content column */}
                      <div className={`flex-1 min-w-0 ${isLast ? 'pb-2' : 'pb-5'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900 leading-tight">
                            {event.title}
                          </p>
                          <span className="flex-shrink-0 text-xs text-gray-400 whitespace-nowrap">
                            {event.actor}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                          {event.detail}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Note section */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                {showNoteForm ? (
                  <div className="space-y-3">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add a note about this round..."
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none resize-none"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveNote}
                        disabled={!noteText.trim() || isSaving}
                        className={`inline-flex items-center rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors ${
                          !noteText.trim() || isSaving
                            ? 'bg-indigo-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNoteForm(false);
                          setNoteText('');
                        }}
                        className="rounded-lg px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNoteForm(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Note
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
