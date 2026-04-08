'use client';

// ============================================================
// /platform/data-lineage — Data Lineage Explorer
// Business/client selector, timeline of ledger events,
// filter by event type, event detail cards, export lineage.
// ============================================================

import { useState, useCallback, useMemo } from 'react';

// ── Types ────────────────────────────────────────────────────

type EventCategory = 'client' | 'application' | 'funding' | 'compliance' | 'payment';

interface LedgerEventEntry {
  id: string;
  timestamp: string;
  eventType: string;
  category: EventCategory;
  payloadSummary: string;
  actor: string;
  version: number;
  linkedRecord?: { label: string; id: string };
  metadata?: Record<string, string>;
}

interface BusinessOption {
  id: string;
  name: string;
}

// ── Mock Data ────────────────────────────────────────────────

const BUSINESSES: BusinessOption[] = [
  { id: 'biz-001', name: 'Apex Ventures LLC' },
  { id: 'biz-002', name: 'NovaBridge Capital' },
  { id: 'biz-003', name: 'Horizon Retail Partners' },
  { id: 'biz-004', name: 'BlueStar Holdings' },
  { id: 'biz-005', name: 'Meridian Finance Group' },
];

const EVENT_TYPES = [
  'business.created',
  'compliance.consent_captured',
  'application.submitted',
  'application.approved',
  'ach.payment_completed',
];

function generateEventsForBusiness(bizId: string): LedgerEventEntry[] {
  const actors = ['system', 'sarah.chen@apex.com', 'admin@capitalforge.io', 'api-integration', 'compliance-bot'];
  const baseDate = new Date('2026-04-07T10:00:00Z');

  return [
    {
      id: `evt-${bizId}-001`, timestamp: new Date(baseDate.getTime() - 86400000 * 30).toISOString(),
      eventType: 'business.created', category: 'client',
      payloadSummary: 'Client entity created with initial intake data and KYC details',
      actor: actors[2], version: 1,
      linkedRecord: { label: 'Client Profile', id: `client-${bizId}` },
    },
    {
      id: `evt-${bizId}-002`, timestamp: new Date(baseDate.getTime() - 86400000 * 25).toISOString(),
      eventType: 'compliance.consent_captured', category: 'compliance',
      payloadSummary: 'E-Sign consent and TCPA authorization captured via secure form',
      actor: actors[1], version: 1,
      linkedRecord: { label: 'Consent Record', id: `consent-${bizId}` },
    },
    {
      id: `evt-${bizId}-003`, timestamp: new Date(baseDate.getTime() - 86400000 * 20).toISOString(),
      eventType: 'application.submitted', category: 'application',
      payloadSummary: 'SBA 7(a) loan application submitted ($250,000 requested)',
      actor: actors[1], version: 1,
      linkedRecord: { label: 'Application', id: `app-${bizId}` },
    },
    {
      id: `evt-${bizId}-004`, timestamp: new Date(baseDate.getTime() - 86400000 * 15).toISOString(),
      eventType: 'application.approved', category: 'funding',
      payloadSummary: 'Application approved: $225,000 at 6.75% APR, 10yr term',
      actor: actors[0], version: 1,
      linkedRecord: { label: 'Funding Offer', id: `offer-${bizId}` },
    },
    {
      id: `evt-${bizId}-005`, timestamp: new Date(baseDate.getTime() - 86400000 * 5).toISOString(),
      eventType: 'ach.payment_completed', category: 'payment',
      payloadSummary: 'First repayment completed: $2,847.50 (confirmation #ACH-88241)',
      actor: actors[3], version: 1,
      linkedRecord: { label: 'Payment Record', id: `pay-${bizId}` },
    },
  ];
}

// ── Helpers ──────────────────────────────────────────────────

const CATEGORY_COLORS: Record<EventCategory, { dot: string; badge: string; label: string }> = {
  client:     { dot: 'bg-teal-500',    badge: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',    label: 'Client' },
  application:{ dot: 'bg-blue-500',    badge: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',    label: 'Application' },
  funding:    { dot: 'bg-[#C9A84C]',   badge: 'bg-[#C9A84C]/20 text-[#C9A84C] border border-[#C9A84C]/30', label: 'Funding' },
  compliance: { dot: 'bg-amber-500',   badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30', label: 'Compliance' },
  payment:    { dot: 'bg-green-500',   badge: 'bg-green-500/20 text-green-400 border border-green-500/30', label: 'Payment' },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatEventType(type: string): string {
  return type
    .split('.')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '))
    .join(' > ');
}

// ── Main Page ────────────────────────────────────────────────

export default function PlatformDataLineagePage() {
  const [selectedBizId, setSelectedBizId] = useState<string>(BUSINESSES[0]?.id ?? '');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const events = useMemo(() => {
    if (!selectedBizId) return [];
    return generateEventsForBusiness(selectedBizId);
  }, [selectedBizId]);

  const filteredEvents = useMemo(() => {
    if (typeFilter === 'all') return events;
    return events.filter((e) => e.eventType === typeFilter);
  }, [events, typeFilter]);

  const usedEventTypes = useMemo(() => {
    const types = new Set(events.map((e) => e.eventType));
    return Array.from(types).sort();
  }, [events]);

  const handleExport = useCallback(() => {
    if (!selectedBizId || filteredEvents.length === 0) return;
    const biz = BUSINESSES.find((b) => b.id === selectedBizId);
    const divider = '─'.repeat(60);

    const lines = [
      `DATA LINEAGE REPORT`,
      `Generated: ${new Date().toISOString()}`,
      `Business: ${biz?.name ?? selectedBizId}`,
      `Events: ${filteredEvents.length}${typeFilter !== 'all' ? ` (filtered by ${formatEventType(typeFilter)})` : ''}`,
      divider,
      '',
      ...filteredEvents.flatMap((e, i) => [
        `[${i + 1}] ${formatEventType(e.eventType)}`,
        `    Category:  ${CATEGORY_COLORS[e.category].label}`,
        `    Timestamp: ${formatTimestamp(e.timestamp)}`,
        `    Summary:   ${e.payloadSummary}`,
        `    Actor:     ${e.actor}`,
        `    Version:   ${e.version}`,
        ...(e.linkedRecord ? [`    Linked:    ${e.linkedRecord.label} (${e.linkedRecord.id})`] : []),
        '',
      ]),
      divider,
      `End of report.`,
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-lineage-${biz?.name.replace(/\s+/g, '-') ?? selectedBizId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEvents, selectedBizId, typeFilter]);

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Data Lineage Explorer</h1>
        <p className="text-sm text-gray-400 mt-1">
          Trace the full lifecycle of ledger events for any business in the platform.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Business Selector */}
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
              Business / Client
            </label>
            <select
              value={selectedBizId}
              onChange={(e) => {
                setSelectedBizId(e.target.value);
                setTypeFilter('all');
              }}
              className="w-full bg-[#111c33] border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#C9A84C]"
            >
              <option value="">-- Select a business --</option>
              {BUSINESSES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Event Type Filter */}
          <div>
            <label className="block text-xs text-gray-400 font-medium mb-2 uppercase tracking-wide">
              Filter by Event Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              disabled={!selectedBizId}
              className="w-full bg-[#111c33] border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#C9A84C] disabled:opacity-50"
            >
              <option value="all">All Event Types ({events.length})</option>
              {usedEventTypes.map((t) => (
                <option key={t} value={t}>
                  {formatEventType(t)} ({events.filter((e) => e.eventType === t).length})
                </option>
              ))}
            </select>
          </div>

          {/* Export */}
          <div className="flex flex-col items-start justify-end gap-2">
            <button
              onClick={handleExport}
              disabled={!selectedBizId}
              className="px-5 py-2.5 border border-gray-600 text-gray-300 font-semibold rounded-lg hover:bg-[#111c33] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export Lineage Report
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        {selectedBizId && (
          <div className="flex gap-6 mt-4 pt-4 border-t border-gray-700/30">
            <div>
              <span className="text-xs text-gray-500">Total Events</span>
              <span className="block text-lg font-bold text-white">{events.length}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500">Event Types</span>
              <span className="block text-lg font-bold text-white">{usedEventTypes.length}</span>
            </div>
            <div>
              <span className="text-xs text-gray-500">Filtered</span>
              <span className="block text-lg font-bold text-[#C9A84C]">{filteredEvents.length}</span>
              {typeFilter !== 'all' && (
                <span className="text-[10px] text-amber-400">
                  Showing {filteredEvents.length} of {events.length} events
                </span>
              )}
            </div>
            <div>
              <span className="text-xs text-gray-500">Time Span</span>
              <span className="block text-lg font-bold text-white">
                {events.length > 0
                  ? `${Math.ceil(
                      (new Date(events[events.length - 1].timestamp).getTime() -
                        new Date(events[0].timestamp).getTime()) /
                        (1000 * 60 * 60 * 24),
                    )} days`
                  : '--'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      {selectedBizId && filteredEvents.length > 0 ? (
        <div className="relative">
          <div className="space-y-4">
            {filteredEvents.map((evt, idx) => {
              const catStyle = CATEGORY_COLORS[evt.category];
              return (
                <div key={evt.id} className="relative pl-14">
                  {/* Category-colored dot */}
                  <div
                    className={`absolute left-4 top-4 w-5 h-5 rounded-full border-2 border-[#0A1628] ${catStyle.dot} z-10`}
                  />

                  {/* Connector line segment between dots */}
                  {idx < filteredEvents.length - 1 && (
                    <div className="absolute left-[23px] top-9 bottom-[-16px] w-0.5 bg-gray-700/50" />
                  )}

                  {/* Event Card */}
                  <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-4 hover:border-gray-600 transition">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        {/* Event Type Badge */}
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${catStyle.badge}`}
                          >
                            {formatEventType(evt.eventType)}
                          </span>
                          <span className="text-[10px] text-gray-500">v{evt.version}</span>
                        </div>

                        {/* Summary */}
                        <p className="text-sm text-gray-200 mt-1">{evt.payloadSummary}</p>

                        {/* Actor + Linked Record */}
                        <div className="flex items-center gap-4 mt-2">
                          <p className="text-xs text-gray-500">
                            Actor: <span className="text-gray-400">{evt.actor}</span>
                          </p>
                          {evt.linkedRecord && (
                            <button
                              className={`text-[10px] font-medium px-2 py-0.5 rounded ${catStyle.badge} hover:opacity-80 transition`}
                              title={`View ${evt.linkedRecord.label} (${evt.linkedRecord.id})`}
                            >
                              {evt.linkedRecord.label} &rarr;
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-400">{formatTimestamp(evt.timestamp)}</p>
                        {idx > 0 && (
                          <p className="text-[10px] text-gray-600 mt-1">
                            +{Math.ceil(
                              (new Date(evt.timestamp).getTime() -
                                new Date(filteredEvents[idx - 1].timestamp).getTime()) /
                                (1000 * 60 * 60 * 24),
                            )}d
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : selectedBizId ? (
        <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-12 text-center">
          <p className="text-gray-500">No events match the current filter.</p>
        </div>
      ) : (
        <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-12 text-center">
          <div className="text-4xl mb-4 opacity-30">&#128279;</div>
          <p className="text-gray-400">Select a business to view its data lineage timeline.</p>
        </div>
      )}
    </div>
  );
}
