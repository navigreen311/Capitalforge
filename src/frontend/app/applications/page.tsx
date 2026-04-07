'use client';

// ============================================================
// /applications — Kanban pipeline board
// Columns: draft | pending_consent | submitted | approved | declined
// Cards show issuer, card product, client, status badge.
// Clicking a card opens the ApplicationDetailDrawer.
// Drag-and-drop between columns to update status.
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { applicationsApi } from '../../lib/api-client';
import { ApplicationDetailDrawer } from '../../components/applications/ApplicationDetailDrawer';
import NewApplicationWizardModal from '../../components/applications/wizard/NewApplicationWizardModal';
import type { ApplicationStatus } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApplicationCard {
  id: string;
  businessId: string;
  businessName: string;
  issuer: string;
  cardProduct: string;
  status: ApplicationStatus;
  requestedLimit: number;
  approvedLimit?: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------

const PLACEHOLDER_APPS: ApplicationCard[] = [
  {
    id: 'APP-0091', businessId: 'biz_001', businessName: 'Apex Ventures LLC',
    issuer: 'Chase', cardProduct: 'Ink Business Cash', status: 'draft',
    requestedLimit: 25000, createdAt: '2026-03-28T10:00:00Z', updatedAt: '2026-03-28T10:00:00Z',
  },
  {
    id: 'APP-0090', businessId: 'biz_002', businessName: 'NovaTech Solutions Inc.',
    issuer: 'Amex', cardProduct: 'Business Gold', status: 'pending_consent',
    requestedLimit: 30000, createdAt: '2026-03-27T09:00:00Z', updatedAt: '2026-03-29T11:00:00Z',
  },
  {
    id: 'APP-0089', businessId: 'biz_003', businessName: 'Blue Ridge Consulting',
    issuer: 'Capital One', cardProduct: 'Spark Cash Plus', status: 'submitted',
    requestedLimit: 20000, createdAt: '2026-03-26T14:00:00Z', updatedAt: '2026-03-30T08:00:00Z',
  },
  {
    id: 'APP-0088', businessId: 'biz_004', businessName: 'Summit Capital Group',
    issuer: 'Chase', cardProduct: 'Ink Business Preferred', status: 'approved',
    requestedLimit: 50000, approvedLimit: 45000, createdAt: '2026-03-20T10:00:00Z', updatedAt: '2026-03-28T15:00:00Z',
  },
  {
    id: 'APP-0087', businessId: 'biz_005', businessName: 'Horizon Retail Partners',
    issuer: 'Citi', cardProduct: 'Citi Business Platinum', status: 'declined',
    requestedLimit: 15000, createdAt: '2026-03-22T11:00:00Z', updatedAt: '2026-03-25T09:00:00Z',
  },
  {
    id: 'APP-0086', businessId: 'biz_006', businessName: 'Crestline Medical LLC',
    issuer: 'Amex', cardProduct: 'Plum Card', status: 'draft',
    requestedLimit: 40000, createdAt: '2026-03-30T07:00:00Z', updatedAt: '2026-03-30T07:00:00Z',
  },
  {
    id: 'APP-0085', businessId: 'biz_001', businessName: 'Apex Ventures LLC',
    issuer: 'Bank of America', cardProduct: 'Business Advantage Cash Rewards', status: 'submitted',
    requestedLimit: 18000, createdAt: '2026-03-29T08:00:00Z', updatedAt: '2026-03-30T10:00:00Z',
  },
  {
    id: 'APP-0084', businessId: 'biz_007', businessName: 'Pinnacle Freight Corp',
    issuer: 'US Bank', cardProduct: 'Business Altitude Connect', status: 'approved',
    requestedLimit: 60000, approvedLimit: 60000, createdAt: '2026-03-15T12:00:00Z', updatedAt: '2026-03-22T14:00:00Z',
  },
];

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
      className="rounded-xl border border-surface-border bg-white shadow-card hover:shadow-card-hover p-4 cursor-pointer transition-shadow group"
    >
      {/* Business name */}
      <p className="text-xs text-gray-400 mb-0.5 truncate">{card.businessName}</p>

      {/* Card product */}
      <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-navy leading-snug mb-2">
        {card.cardProduct}
      </p>

      {/* Issuer + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
          {card.issuer}
        </span>
        <span className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${STATUS_CHIP[card.status] ?? STATUS_CHIP.draft}`}>
          {card.status.replace('_', ' ')}
        </span>
      </div>

      {/* Amount */}
      <div className="mt-2 text-xs text-gray-500">
        {card.approvedLimit != null ? (
          <span className="text-emerald-600 font-semibold">
            Approved: {formatCurrency(card.approvedLimit)}
          </span>
        ) : (
          <span>Requested: {formatCurrency(card.requestedLimit)}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ApplicationsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<ApplicationCard[]>(PLACEHOLDER_APPS);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const dragId = useRef<string | null>(null);

  // Drawer state
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  // Wizard modal state
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await applicationsApi.list();
      if (res.success && Array.isArray(res.data)) {
        setApps(res.data as ApplicationCard[]);
      }
    } catch { /* use placeholder */ }
    finally { setLoading(false); }
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

  const filtered = apps.filter(
    (a) =>
      !search ||
      a.businessName.toLowerCase().includes(search.toLowerCase()) ||
      a.cardProduct.toLowerCase().includes(search.toLowerCase()) ||
      a.issuer.toLowerCase().includes(search.toLowerCase()),
  );

  const byStatus = (status: ApplicationStatus) =>
    filtered.filter((a) => a.status === status);

  const totalApproved = apps
    .filter((a) => a.status === 'approved')
    .reduce((s, a) => s + (a.approvedLimit ?? a.requestedLimit), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Application Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {apps.length} total · {apps.filter((a) => a.status === 'approved').length} approved ·{' '}
            <span className="text-emerald-600 font-semibold">{formatCurrency(totalApproved)}</span> funded
          </p>
        </div>
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

      {loading && (
        <p className="text-center text-gray-400 py-12">Loading pipeline...</p>
      )}

      {/* Kanban board */}
      {!loading && (
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
      )}

      <p className="text-xs text-gray-400">
        Tip: drag cards between columns to update status. Click a card to view details.
      </p>

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
