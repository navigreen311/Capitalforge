'use client';

// ============================================================
// /platform/data-lineage — Data Lineage Explorer
// Business/client selector, timeline of ledger events,
// filter by event type, event detail cards, export lineage.
// ============================================================

import { useState, useCallback, useMemo } from 'react';

// ── Types ────────────────────────────────────────────────────

interface LedgerEventEntry {
  id: string;
  timestamp: string;
  eventType: string;
  payloadSummary: string;
  actor: string;
  version: number;
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
  'business.updated',
  'kyb.initiated',
  'kyb.completed',
  'application.submitted',
  'application.approved',
  'application.declined',
  'funding.disbursed',
  'compliance.check_passed',
  'compliance.check_failed',
  'document.uploaded',
  'document.verified',
  'credit.score_updated',
  'ach.payment_initiated',
  'ach.payment_completed',
  'offboarding.requested',
];

function generateEventsForBusiness(bizId: string): LedgerEventEntry[] {
  const actors = ['system', 'sarah.chen@apex.com', 'admin@capitalforge.io', 'api-integration', 'compliance-bot'];
  const baseDate = new Date('2026-04-07T10:00:00Z');

  return [
    {
      id: `evt-${bizId}-001`, timestamp: new Date(baseDate.getTime() - 86400000 * 30).toISOString(),
      eventType: 'business.created', payloadSummary: 'Business entity created with initial intake data',
      actor: actors[2], version: 1,
    },
    {
      id: `evt-${bizId}-002`, timestamp: new Date(baseDate.getTime() - 86400000 * 28).toISOString(),
      eventType: 'document.uploaded', payloadSummary: 'Articles of Incorporation uploaded (PDF, 2.4MB)',
      actor: actors[1], version: 1,
    },
    {
      id: `evt-${bizId}-003`, timestamp: new Date(baseDate.getTime() - 86400000 * 27).toISOString(),
      eventType: 'document.verified', payloadSummary: 'Articles of Incorporation verified via OCR + manual review',
      actor: actors[4], version: 1,
    },
    {
      id: `evt-${bizId}-004`, timestamp: new Date(baseDate.getTime() - 86400000 * 25).toISOString(),
      eventType: 'kyb.initiated', payloadSummary: 'KYB verification started: EIN lookup, Secretary of State check',
      actor: actors[0], version: 1,
    },
    {
      id: `evt-${bizId}-005`, timestamp: new Date(baseDate.getTime() - 86400000 * 23).toISOString(),
      eventType: 'kyb.completed', payloadSummary: 'KYB passed: Entity verified, good standing confirmed',
      actor: actors[0], version: 1,
    },
    {
      id: `evt-${bizId}-006`, timestamp: new Date(baseDate.getTime() - 86400000 * 22).toISOString(),
      eventType: 'credit.score_updated', payloadSummary: 'FICO score updated: 742 (Experian pull)',
      actor: actors[3], version: 1,
    },
    {
      id: `evt-${bizId}-007`, timestamp: new Date(baseDate.getTime() - 86400000 * 20).toISOString(),
      eventType: 'compliance.check_passed', payloadSummary: 'UDAP compliance check passed (risk score: 18/100)',
      actor: actors[4], version: 1,
    },
    {
      id: `evt-${bizId}-008`, timestamp: new Date(baseDate.getTime() - 86400000 * 18).toISOString(),
      eventType: 'application.submitted', payloadSummary: 'SBA 7(a) loan application submitted ($250,000 requested)',
      actor: actors[1], version: 1,
    },
    {
      id: `evt-${bizId}-009`, timestamp: new Date(baseDate.getTime() - 86400000 * 15).toISOString(),
      eventType: 'application.approved', payloadSummary: 'Application approved: $225,000 at 6.75% APR, 10yr term',
      actor: actors[0], version: 1,
    },
    {
      id: `evt-${bizId}-010`, timestamp: new Date(baseDate.getTime() - 86400000 * 12).toISOString(),
      eventType: 'document.uploaded', payloadSummary: 'Signed loan agreement uploaded (PDF, 1.8MB)',
      actor: actors[1], version: 1,
    },
    {
      id: `evt-${bizId}-011`, timestamp: new Date(baseDate.getTime() - 86400000 * 10).toISOString(),
      eventType: 'funding.disbursed', payloadSummary: 'Funds disbursed: $225,000 via ACH to account ending 4821',
      actor: actors[0], version: 1,
    },
    {
      id: `evt-${bizId}-012`, timestamp: new Date(baseDate.getTime() - 86400000 * 5).toISOString(),
      eventType: 'ach.payment_initiated', payloadSummary: 'First repayment initiated: $2,847.50',
      actor: actors[0], version: 1,
    },
    {
      id: `evt-${bizId}-013`, timestamp: new Date(baseDate.getTime() - 86400000 * 3).toISOString(),
      eventType: 'ach.payment_completed', payloadSummary: 'Payment completed: $2,847.50 (confirmation #ACH-88241)',
      actor: actors[3], version: 1,
    },
    {
      id: `evt-${bizId}-014`, timestamp: new Date(baseDate.getTime() - 86400000 * 1).toISOString(),
      eventType: 'business.updated', payloadSummary: 'Status updated to "funded", readiness score: 85',
      actor: actors[0], version: 2,
    },
  ];
}

// ── Helpers ──────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  'business.created': 'bg-blue-500',
  'business.updated': 'bg-blue-400',
  'kyb.initiated': 'bg-purple-500',
  'kyb.completed': 'bg-purple-400',
  'application.submitted': 'bg-yellow-500',
  'application.approved': 'bg-emerald-500',
  'application.declined': 'bg-red-500',
  'funding.disbursed': 'bg-[#C9A84C]',
  'compliance.check_passed': 'bg-emerald-400',
  'compliance.check_failed': 'bg-red-400',
  'document.uploaded': 'bg-cyan-500',
  'document.verified': 'bg-cyan-400',
  'credit.score_updated': 'bg-orange-400',
  'ach.payment_initiated': 'bg-indigo-500',
  'ach.payment_completed': 'bg-indigo-400',
  'offboarding.requested': 'bg-red-500',
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
  const [selectedBizId, setSelectedBizId] = useState<string>('');
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
    if (filteredEvents.length === 0) return;
    const biz = BUSINESSES.find((b) => b.id === selectedBizId);
    const csv = [
      'Timestamp,Event Type,Summary,Actor,Version',
      ...filteredEvents.map(
        (e) =>
          `"${formatTimestamp(e.timestamp)}","${e.eventType}","${e.payloadSummary}","${e.actor}",${e.version}`,
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-lineage-${biz?.name.replace(/\s+/g, '-') ?? selectedBizId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEvents, selectedBizId]);

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
          <div className="flex items-end">
            <button
              onClick={handleExport}
              disabled={filteredEvents.length === 0}
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
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-700/50" />

          <div className="space-y-4">
            {filteredEvents.map((evt, idx) => (
              <div key={evt.id} className="relative pl-14">
                {/* Dot on timeline */}
                <div
                  className={`absolute left-4 top-4 w-5 h-5 rounded-full border-2 border-[#0A1628] ${
                    TYPE_COLORS[evt.eventType] ?? 'bg-gray-500'
                  }`}
                />

                {/* Event Card */}
                <div className="bg-[#0f1b2e] border border-gray-700/50 rounded-xl p-4 hover:border-gray-600 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {/* Event Type Badge */}
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full text-white ${
                            TYPE_COLORS[evt.eventType] ?? 'bg-gray-500'
                          }`}
                        >
                          {formatEventType(evt.eventType)}
                        </span>
                        <span className="text-[10px] text-gray-500">v{evt.version}</span>
                      </div>

                      {/* Summary */}
                      <p className="text-sm text-gray-200 mt-1">{evt.payloadSummary}</p>

                      {/* Actor */}
                      <p className="text-xs text-gray-500 mt-2">
                        Actor: <span className="text-gray-400">{evt.actor}</span>
                      </p>
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
            ))}
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
