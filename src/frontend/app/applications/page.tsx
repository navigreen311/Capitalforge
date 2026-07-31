'use client';

// ============================================================
// /applications — Kanban pipeline board
// Columns: draft | pending_consent | submitted | approved | declined
// Cards show issuer, card product, client, status badge.
// Clicking a card opens the ApplicationDetailDrawer.
// Drag-and-drop between columns to update status.
// ============================================================

import {
  toApplicationCards,
  advisorInitials,
  type ApplicationCardView,
  type ConsentStatus,
} from '@/lib/application-card-view';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { applicationsApi } from '../../lib/api-client';
import { ApplicationDetailDrawer } from '../../components/applications/ApplicationDetailDrawer';
import { ApplicationFilterBar } from '../../components/applications/ApplicationFilterBar';
import type { ApplicationFilters } from '../../components/applications/ApplicationFilterBar';
import ApplicationTableView from '../../components/applications/ApplicationTableView';
import type { ApplicationRow } from '../../components/applications/ApplicationTableView';
import NewApplicationWizardModal from '../../components/applications/wizard/NewApplicationWizardModal';
import type { ApplicationStatus } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// The board's card shape and its mapping now live in lib/application-card-view,
// which builds every field from what the API returns and leaves the rest null.
// This file used to declare the type locally and seed state with ten sample
// applications, then cast the real response onto that shape unchecked.
export type ApplicationCard = ApplicationCardView;

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const COLUMNS: { status: ApplicationStatus; label: string; dotColor: string }[] = [
  { status: 'draft',           label: 'Draft',           dotColor: 'bg-gray-400' },
  { status: 'pending_consent', label: 'Pending Consent', dotColor: 'bg-blue-400' },
  { status: 'submitted',       label: 'Submitted',       dotColor: 'bg-amber-400' },
  { status: 'approved',        label: 'Approved',        dotColor: 'bg-emerald-400' },
  { status: 'declined',        label: 'Declined',        dotColor: 'bg-red-400' },
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ---------------------------------------------------------------------------
// Kanban Card
// ---------------------------------------------------------------------------

const STATUS_CHIP: Record<string, string> = {
  draft:           'bg-gray-100 text-gray-600 border-gray-200',
  pending_consent: 'bg-blue-50 text-blue-700 border-blue-200',
  submitted:       'bg-amber-50 text-amber-700 border-amber-200',
  approved:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  declined:        'bg-red-50 text-red-700 border-red-200',
  reconsideration: 'bg-orange-50 text-orange-700 border-orange-200',
};

// Typed by ConsentStatus rather than `string`, so a state without an entry is
// a compile error. As a plain Record<string, …> the lookup below returned
// undefined for an unhandled state and threw on the first property read.
const CONSENT_DOT: Record<ConsentStatus, { color: string; title: string }> = {
  complete: { color: 'bg-emerald-500', title: 'Consent complete' },
  missing:  { color: 'bg-red-500',     title: 'Consent missing' },
  // Not "pending": nothing has been checked, so no claim is made either way.
  unknown:  { color: 'bg-gray-300',    title: 'Consent not recorded' },
};


function daysLabel(days: number | null, status: string): string {
  const label = status.replace(/_/g, ' ');
  // No usable timestamp on the record, so the age is unknown rather than 0 —
  // "0d in draft" would read as filed today.
  return days === null ? `in ${label}` : `${days}d in ${label}`;
}

function daysInStatusClasses(days: number | null): string {
  if (days === null) return 'text-gray-500 italic';
  if (days > 14) return 'text-red-500 font-semibold';
  if (days > 7)  return 'text-amber-500 font-semibold';
  return 'text-gray-400';
}

function AppCard({
  card,
  onDragStart,
  onClick,
}: {
  card: ApplicationCard;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onClick: () => void;
}) {
  // Distinguish drag from click
  const mouseDown = useRef({ x: 0, y: 0 });
  const dragged = useRef(false);

  // An unrecognised value falls through to 'unknown', not to 'missing':
  // asserting a compliance failure we have not established is its own error.
  const consent = CONSENT_DOT[card.consentStatus];

  return (
    <div
      draggable
      onDragStart={(e) => { dragged.current = true; onDragStart(e, card.id); }}
      onMouseDown={(e) => { mouseDown.current = { x: e.clientX, y: e.clientY }; dragged.current = false; }}
      onMouseUp={(e) => {
        const dx = Math.abs(e.clientX - mouseDown.current.x);
        const dy = Math.abs(e.clientY - mouseDown.current.y);
        if (dx < 5 && dy < 5 && !dragged.current) onClick();
      }}
      className="relative rounded-xl border border-surface-border bg-white shadow-card hover:shadow-card-hover p-4 cursor-pointer transition-shadow group"
    >
      {/* Round badge — top-right pill */}
      {card.roundNumber !== null && (
        <span className="absolute -top-1.5 -right-1.5 text-2xs font-bold px-1.5 py-0.5 rounded-full border bg-teal-50 text-teal-700 border-teal-300 shadow-sm">
          R{card.roundNumber}
        </span>
      )}

      {/* Business name */}
      <p className="text-xs text-gray-400 mb-0.5 truncate">{card.businessName}</p>

      {/* Card product */}
      <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-navy leading-snug mb-2">
        {card.cardProduct}
      </p>

      {/* Issuer + consent dot + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              card.issuer_type === 'credit_union' ? 'bg-[#1D9E75]' : consent.color
            }`}
            title={card.issuer_type === 'credit_union' ? 'Credit Union' : consent.title}
          />
          {card.issuer}
          {card.issuer_type === 'credit_union' && (
            <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 ml-1">
              CU
            </span>
          )}
        </span>
        <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${STATUS_CHIP[card.status] ?? STATUS_CHIP.draft}`}>
          {card.status.replace('_', ' ')}
        </span>
      </div>

      {/* Amount */}
      <div className="mt-2 text-xs text-gray-500">
        {card.approvedLimit != null ? (
          <span className="text-emerald-600 font-semibold">
            Approved: {card.approvedLimit === null ? '—' : formatCurrency(card.approvedLimit)}
          </span>
        ) : (
          <span>
            Requested: {card.requestedLimit === null ? '—' : formatCurrency(card.requestedLimit)}
          </span>
        )}
      </div>

      {/* Days in status + advisor initials */}
      <div className="mt-1.5 flex items-center justify-between">
        <span className={`text-2xs ${daysInStatusClasses(card.daysInStatus)}`}>
          {daysLabel(card.daysInStatus, card.status)}
        </span>
        {advisorInitials(card.advisor) === null ? (
          <span
            className="w-6 h-6 rounded-full border border-dashed border-gray-300 text-gray-400
              text-2xs flex items-center justify-center shrink-0"
            title="No advisor assigned"
          >
            —
          </span>
        ) : (
          <span
            className="w-6 h-6 rounded-full bg-brand-navy text-white text-2xs font-bold
              flex items-center justify-center shrink-0"
            title={card.advisor ?? undefined}
          >
            {advisorInitials(card.advisor)}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status filter pills
// ---------------------------------------------------------------------------

const STATUS_FILTERS: { value: ApplicationStatus | 'all'; label: string }[] = [
  { value: 'all',             label: 'All' },
  { value: 'draft',           label: 'Draft' },
  { value: 'pending_consent', label: 'Pending Consent' },
  { value: 'submitted',       label: 'Submitted' },
  { value: 'approved',        label: 'Approved' },
  { value: 'declined',        label: 'Declined' },
];

// ---------------------------------------------------------------------------
// Map ApplicationCard → ApplicationRow (for table view)
// ---------------------------------------------------------------------------

function cardToRow(card: ApplicationCard): ApplicationRow {
  return {
    id: card.id,
    client_id: card.businessId,
    client_name: card.businessName,
    card_product: card.cardProduct,
    issuer: card.issuer,
    round_number: null,
    round_id: null,
    requested: card.requestedLimit ?? 0,
    approved: card.approvedLimit ?? null,
    status: card.status,
    apr_days_remaining: null,
    submitted_date: card.createdAt ?? '',
    advisor: card.advisor ?? '',
    consent_status: card.consentStatus === 'complete' ? 'complete' : 'none',
    acknowledgment_status: 'none',
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type PipelineFilter =
  | 'total'
  | 'pipeline_value'
  | 'approved_value'
  | 'avg_time'
  | 'approval_rate'
  | null;

export default function ApplicationsPage() {
  const [apps, setApps] = useState<ApplicationCard[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinct from an empty pipeline: a failed load must not look like no work.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState<PipelineFilter>(null);
  const dragId = useRef<string | null>(null);

  // View mode state: kanban or table
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

  // Status filter for table view
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');

  // Filter bar filters
  const [filters, setFilters] = useState<ApplicationFilters>({
    client: '',
    issuer: '',
    advisor: '',
    round: '',
  });

  const hasActiveFilters = Object.values(filters).some((v) => v !== '');

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({ client: '', issuer: '', advisor: '', round: '' });
  }, []);

  // Drawer state
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  // Wizard modal state
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await applicationsApi.list();
      if (res.success) {
        // Mapped rather than cast. `res.data as ApplicationCard[]` compiled
        // fine and then threw on the first render, because the real rows do
        // not carry the fields the sample data did.
        setApps(toApplicationCards(res.data));
      } else {
        setLoadError('The applications list could not be loaded.');
      }
    } catch {
      setLoadError('Could not reach the server. The pipeline is not shown.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetStatus: ApplicationStatus) => {
      e.preventDefault();
      const id = dragId.current;
      if (!id) return;

      setApps((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: targetStatus } : a)),
      );
      dragId.current = null;

      try {
        await applicationsApi.updateStatus(id, targetStatus);
      } catch { /* optimistic update stands */ }
    },
    [],
  );

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  // ── Computed stats ──────────────────────────────────────────
  // A card carrying neither an approved nor a requested figure contributes
  // nothing, rather than a zero that quietly drags the totals down.
  const amountOf = (a: ApplicationCard): number | null => a.approvedLimit ?? a.requestedLimit;

  const totalApproved = apps
    .filter((a) => a.status === 'approved')
    .reduce((sum, a) => sum + (amountOf(a) ?? 0), 0);

  const pipelineValue = apps.reduce((sum, a) => sum + (amountOf(a) ?? 0), 0);

  const decidedApps = apps.filter(
    (a) => a.status === 'approved' || a.status === 'declined',
  );
  const approvalRate =
    decidedApps.length > 0
      ? ((apps.filter((a) => a.status === 'approved').length / decidedApps.length) * 100)
      : 0;

  // Averaged over the cards whose age is known. Counting an unknown age as 0
  // would pull the headline average towards "same day" for records that simply
  // carry no timestamp; null instead, rendered as a dash.
  const agedCards = apps.filter((a) => a.daysInStatus !== null);
  const avgTime =
    agedCards.length > 0
      ? agedCards.reduce((sum, a) => sum + (a.daysInStatus ?? 0), 0) / agedCards.length
      : null;

  // ── Chip-based filtering ──────────────────────────────────
  function chipFilter(a: ApplicationCard): boolean {
    if (!activeChip) return true;
    switch (activeChip) {
      case 'approved_value':
        return a.status === 'approved';
      case 'approval_rate':
        return a.status === 'approved' || a.status === 'declined';
      case 'avg_time':
        return a.daysInStatus !== null && a.daysInStatus > 0;
      case 'pipeline_value':
      case 'total':
      default:
        return true;
    }
  }

  const filtered = apps.filter(
    (a) =>
      chipFilter(a) &&
      (!search ||
        a.businessName.toLowerCase().includes(search.toLowerCase()) ||
        a.cardProduct.toLowerCase().includes(search.toLowerCase()) ||
        a.issuer.toLowerCase().includes(search.toLowerCase())) &&
      (!filters.issuer || a.issuer === filters.issuer) &&
      (!filters.client || a.businessName === filters.client) &&
      (!filters.advisor || a.advisor === filters.advisor) &&
      (!filters.round || (a.roundNumber !== null && `Round ${a.roundNumber}` === filters.round)),
  );

  const byStatus = (status: ApplicationStatus) =>
    filtered.filter((a) => a.status === status);

  // Apply status filter for table view
  const statusFiltered = statusFilter === 'all'
    ? filtered
    : filtered.filter((a) => a.status === statusFilter);

  // Map to table rows
  const tableRows: ApplicationRow[] = useMemo(
    () => statusFiltered.map(cardToRow),
    [statusFiltered],
  );

  // ── Chip definitions ──────────────────────────────────────
  const chipDefs: { key: PipelineFilter; label: string; value: string }[] = [
    { key: 'total',          label: 'Total',          value: `${apps.length}` },
    { key: 'pipeline_value', label: 'Pipeline Value', value: formatCurrency(pipelineValue) },
    { key: 'approved_value', label: 'Approved',       value: formatCurrency(totalApproved) },
    { key: 'avg_time',       label: 'Avg Time',       value: avgTime === null ? '—' : `${avgTime.toFixed(1)}d` },
    { key: 'approval_rate',  label: 'Approval Rate',  value: `${approvalRate.toFixed(0)}%` },
  ];

  function handleChipClick(key: PipelineFilter) {
    setActiveChip((prev) => (prev === key ? null : key));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Application Pipeline</h1>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="cf-input w-48"
          />
          <button
            onClick={() => setIsWizardOpen(true)}
            className="btn-accent btn flex-shrink-0"
          >
            + New Application
          </button>
        </div>
      </div>

      {/* Filter bar with view toggle */}
      <ApplicationFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Pipeline stats chips */}
      <div className="flex flex-wrap gap-2">
        {chipDefs.map((chip) => {
          const isActive = activeChip === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => handleChipClick(chip.key)}
              className={[
                'inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full border transition-all duration-150',
                isActive
                  ? 'bg-brand-gold/20 text-brand-gold border-brand-gold shadow-sm'
                  : 'bg-white text-gray-600 border-surface-border hover:border-brand-gold/40 hover:shadow-card',
              ].join(' ')}
            >
              {chip.label}: {chip.value}
            </button>
          );
        })}
        {activeChip && (
          <button
            type="button"
            onClick={() => setActiveChip(null)}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 transition-colors"
          >
            Clear filter
          </button>
        )}
      </div>

      {loading && (
        <p className="text-center text-gray-400 py-12">Loading pipeline...</p>
      )}

      {/* A failed load is not an empty pipeline. Without this the board would
          render five empty columns and read as "no applications". */}
      {!loading && loadError !== null && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-red-800">{loadError}</p>
          <button
            type="button"
            onClick={fetchApps}
            className="mt-3 px-4 py-2 rounded-lg border border-red-300 bg-white text-sm
              font-semibold text-red-700 hover:bg-red-100 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table view */}
      {!loading && loadError === null && viewMode === 'table' && (
        <>
          {/* Status filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_FILTERS.map((sf) => {
              const isActive = statusFilter === sf.value;
              const count = sf.value === 'all'
                ? filtered.length
                : filtered.filter((a) => a.status === sf.value).length;
              return (
                <button
                  key={sf.value}
                  onClick={() => setStatusFilter(sf.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    isActive
                      ? 'bg-brand-navy text-white border-brand-navy'
                      : 'bg-white text-gray-600 border-surface-border hover:bg-gray-50 hover:text-gray-800'
                  }`}
                >
                  {sf.label}
                  <span className={`ml-1.5 ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table */}
          <ApplicationTableView
            applications={tableRows}
            onCardClick={(appId) => setSelectedAppId(appId)}
          />
        </>
      )}

      {/* Kanban board */}
      {!loading && loadError === null && viewMode === 'kanban' && (
        <>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map((col) => {
              const cards = byStatus(col.status);
              return (
                <div
                  key={col.status}
                  onDrop={(e) => handleDrop(e, col.status)}
                  onDragOver={handleDragOver}
                  className="w-64 flex flex-col gap-2 flex-shrink-0"
                >
                  {/* Column header */}
                  <div className="flex items-center gap-2 pb-2 mb-1 border-b border-surface-border">
                    <span className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
                      {col.label}
                    </span>
                    <span className="ml-auto text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      {cards.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="min-h-[120px] flex flex-col gap-2">
                    {cards.map((card) => (
                      <AppCard
                        key={card.id}
                        card={card}
                        onDragStart={handleDragStart}
                        onClick={() => setSelectedAppId(card.id)}
                      />
                    ))}

                    {cards.length === 0 && (
                      <div className="rounded-xl border-2 border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                        Drop here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-400">
            Tip: drag cards between columns to update status. Click a card to view details.
          </p>
        </>
      )}

      {/* Application Detail Drawer */}
      <ApplicationDetailDrawer
        appId={selectedAppId}
        onClose={() => setSelectedAppId(null)}
      />

      {/* New Application Wizard Modal */}
      <NewApplicationWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={() => {
          fetchApps();
        }}
      />
    </div>
  );
}
