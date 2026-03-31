'use client';

// ============================================================
// /applications — Kanban pipeline board
// Columns: draft | pending_consent | submitted | approved | declined
// Cards show issuer, card product, client, status badge.
// Drag-and-drop placeholder (uses HTML5 draggable).
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { applicationsApi } from '../../lib/api-client';
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
    id: 'app_001', businessId: 'biz_001', businessName: 'Apex Ventures LLC',
    issuer: 'Chase', cardProduct: 'Ink Business Cash', status: 'draft',
    requestedLimit: 25000, createdAt: '2026-03-28T10:00:00Z', updatedAt: '2026-03-28T10:00:00Z',
  },
  {
    id: 'app_002', businessId: 'biz_002', businessName: 'NovaTech Solutions Inc.',
    issuer: 'Amex', cardProduct: 'Business Gold', status: 'pending_consent',
    requestedLimit: 30000, createdAt: '2026-03-27T09:00:00Z', updatedAt: '2026-03-29T11:00:00Z',
  },
  {
    id: 'app_003', businessId: 'biz_003', businessName: 'Blue Ridge Consulting',
    issuer: 'Capital One', cardProduct: 'Spark Cash Plus', status: 'submitted',
    requestedLimit: 20000, createdAt: '2026-03-26T14:00:00Z', updatedAt: '2026-03-30T08:00:00Z',
  },
  {
    id: 'app_004', businessId: 'biz_004', businessName: 'Summit Capital Group',
    issuer: 'Chase', cardProduct: 'Ink Business Preferred', status: 'approved',
    requestedLimit: 50000, approvedLimit: 45000, createdAt: '2026-03-20T10:00:00Z', updatedAt: '2026-03-28T15:00:00Z',
  },
  {
    id: 'app_005', businessId: 'biz_005', businessName: 'Horizon Retail Partners',
    issuer: 'Citi', cardProduct: 'Citi® Business Platinum', status: 'declined',
    requestedLimit: 15000, createdAt: '2026-03-22T11:00:00Z', updatedAt: '2026-03-25T09:00:00Z',
  },
  {
    id: 'app_006', businessId: 'biz_006', businessName: 'Crestline Medical LLC',
    issuer: 'Amex', cardProduct: 'Plum Card', status: 'draft',
    requestedLimit: 40000, createdAt: '2026-03-30T07:00:00Z', updatedAt: '2026-03-30T07:00:00Z',
  },
  {
    id: 'app_007', businessId: 'biz_001', businessName: 'Apex Ventures LLC',
    issuer: 'Bank of America', cardProduct: 'Business Advantage Cash Rewards', status: 'submitted',
    requestedLimit: 18000, createdAt: '2026-03-29T08:00:00Z', updatedAt: '2026-03-30T10:00:00Z',
  },
  {
    id: 'app_008', businessId: 'biz_007', businessName: 'Pinnacle Freight Corp',
    issuer: 'US Bank', cardProduct: 'Business Altitude Connect', status: 'approved',
    requestedLimit: 60000, approvedLimit: 60000, createdAt: '2026-03-15T12:00:00Z', updatedAt: '2026-03-22T14:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const COLUMNS: { status: ApplicationStatus; label: string; headerClass: string }[] = [
  { status: 'draft',           label: 'Draft',           headerClass: 'border-gray-600 text-gray-300' },
  { status: 'pending_consent', label: 'Pending Consent', headerClass: 'border-blue-600 text-blue-300' },
  { status: 'submitted',       label: 'Submitted',       headerClass: 'border-yellow-500 text-yellow-300' },
  { status: 'approved',        label: 'Approved',        headerClass: 'border-green-500 text-green-300' },
  { status: 'declined',        label: 'Declined',        headerClass: 'border-red-600 text-red-300' },
];

const CARD_BADGE: Record<ApplicationStatus, string> = {
  draft:           'bg-gray-800 text-gray-300 border-gray-600',
  pending_consent: 'bg-blue-900 text-blue-300 border-blue-700',
  submitted:       'bg-yellow-900 text-yellow-300 border-yellow-700',
  approved:        'bg-green-900 text-green-300 border-green-700',
  declined:        'bg-red-900 text-red-300 border-red-700',
  reconsideration: 'bg-orange-900 text-orange-300 border-orange-700',
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ---------------------------------------------------------------------------
// Kanban Card
// ---------------------------------------------------------------------------

function AppCard({
  card,
  onDragStart,
  onClick,
}: {
  card: ApplicationCard;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onClick: (id: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card.id)}
      onClick={() => onClick(card.id)}
      className="rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-800 p-3 cursor-grab active:cursor-grabbing transition-colors group"
    >
      {/* Business name */}
      <p className="text-xs text-gray-400 mb-0.5 truncate">{card.businessName}</p>

      {/* Card product */}
      <p className="text-sm font-semibold text-gray-100 group-hover:text-white leading-snug mb-2">
        {card.cardProduct}
      </p>

      {/* Issuer badge */}
      <div className="flex items-center justify-between">
        <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
          {card.issuer}
        </span>
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${CARD_BADGE[card.status]}`}>
          {card.status.replace('_', ' ')}
        </span>
      </div>

      {/* Limits */}
      <div className="mt-2 text-xs text-gray-500">
        {card.approvedLimit !== undefined ? (
          <span className="text-green-400 font-semibold">
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await applicationsApi.list();
        if (res.success && Array.isArray(res.data)) {
          setApps(res.data as ApplicationCard[]);
        }
      } catch { /* use placeholder */ }
      finally { setLoading(false); }
    })();
  }, []);

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
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 overflow-x-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Application Pipeline</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {apps.length} total · {apps.filter((a) => a.status === 'approved').length} approved ·{' '}
            <span className="text-green-400 font-semibold">{formatCurrency(totalApproved)}</span> funded
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => router.push('/applications/new')}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold transition-colors whitespace-nowrap"
          >
            + New Application
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-center text-gray-500 py-12">Loading pipeline…</p>
      )}

      {/* Kanban board */}
      {!loading && (
        <div className="flex gap-4 min-w-max pb-4">
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
                <div className={`border-b-2 pb-2 mb-1 flex items-center justify-between ${col.headerClass}`}>
                  <span className="text-xs font-bold uppercase tracking-widest">
                    {col.label}
                  </span>
                  <span className="text-xs font-semibold bg-gray-800 px-2 py-0.5 rounded-full text-gray-300">
                    {cards.length}
                  </span>
                </div>

                {/* Drop zone */}
                <div className="min-h-[120px] flex flex-col gap-2">
                  {cards.map((card) => (
                    <AppCard
                      key={card.id}
                      card={card}
                      onDragStart={handleDragStart}
                      onClick={(id) => router.push(`/applications/${id}`)}
                    />
                  ))}

                  {cards.length === 0 && (
                    <div className="rounded-lg border-2 border-dashed border-gray-800 p-4 text-center text-xs text-gray-600">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-600">
        Tip: drag cards between columns to update status. Changes persist to the API.
      </p>
    </div>
  );
}
