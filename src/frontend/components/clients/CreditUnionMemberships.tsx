'use client';

// ============================================================
// CreditUnionMemberships — Shows a client's credit union
// membership statuses with join actions for open-membership CUs.
// ============================================================

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MembershipStatus = 'active' | 'pending' | 'not_a_member';

export interface CreditUnionMembership {
  id: string;
  name: string;
  status: MembershipStatus;
  joinDate?: string;
  /** Products the client holds at this CU */
  products: string[];
  /** Products available to apply for */
  availableProducts: string[];
  /** Whether the CU is open to anyone (no eligibility restrictions) */
  openMembership: boolean;
  /** Fee to join, if applicable */
  joinFee?: number;
}

// ---------------------------------------------------------------------------
// Mock data — client is a member of Alliant and PenFed
// ---------------------------------------------------------------------------

const MOCK_MEMBERSHIPS: CreditUnionMembership[] = [
  {
    id: 'alliant',
    name: 'Alliant Credit Union',
    status: 'active',
    joinDate: '2024-09-15',
    products: ['High-Rate Savings', 'Visa Platinum'],
    availableProducts: ['Business Checking', 'Business Visa'],
    openMembership: true,
    joinFee: 0,
  },
  {
    id: 'penfed',
    name: 'PenFed Credit Union',
    status: 'active',
    joinDate: '2025-03-01',
    products: ['Savings'],
    availableProducts: ['Power Cash Rewards', 'Pathfinder Rewards', 'Business Line of Credit'],
    openMembership: true,
    joinFee: 5,
  },
  {
    id: 'navy-federal',
    name: 'Navy Federal Credit Union',
    status: 'not_a_member',
    products: [],
    availableProducts: ['Business Visa', 'Business Checking', 'Business Savings'],
    openMembership: false,
  },
  {
    id: 'dcu',
    name: 'Digital Federal Credit Union (DCU)',
    status: 'not_a_member',
    products: [],
    availableProducts: ['Visa Platinum', 'Business Savings', 'Business Checking'],
    openMembership: true,
    joinFee: 5,
  },
  {
    id: 'first-tech',
    name: 'First Tech Federal Credit Union',
    status: 'not_a_member',
    products: [],
    availableProducts: ['Odyssey Rewards', 'Business Rewards', 'Business Checking'],
    openMembership: true,
    joinFee: 5,
  },
  {
    id: 'becu',
    name: 'BECU',
    status: 'not_a_member',
    products: [],
    availableProducts: ['Visa', 'Business Checking', 'Money Market'],
    openMembership: false,
  },
  {
    id: 'connexus',
    name: 'Connexus Credit Union',
    status: 'not_a_member',
    products: [],
    availableProducts: ['Visa Signature', 'Business Checking'],
    openMembership: true,
    joinFee: 5,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<MembershipStatus, { label: string; classes: string }> = {
  active: {
    label: 'Active',
    classes: 'bg-emerald-900/40 text-emerald-400 border-emerald-700',
  },
  pending: {
    label: 'Pending',
    classes: 'bg-amber-900/40 text-amber-400 border-amber-700',
  },
  not_a_member: {
    label: 'Not a Member',
    classes: 'bg-gray-800 text-gray-400 border-gray-700',
  },
};

function formatMemberSince(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
  const years = Math.floor(diffMonths / 12);
  const months = diffMonths % 12;

  const datePart = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const agePart = years > 0 ? `${years}yr ${months}mo` : `${months}mo`;

  return `Member since ${datePart} (${agePart})`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreditUnionMembershipsProps {
  clientId: string;
  /** Optional: use compact layout (e.g. for sidebar or credit tab) */
  compact?: boolean;
  /** Optional: callback for toast messages */
  onToast?: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreditUnionMemberships({
  clientId,
  compact = false,
  onToast,
}: CreditUnionMembershipsProps) {
  const [memberships] = useState<CreditUnionMembership[]>(MOCK_MEMBERSHIPS);
  const [expanded, setExpanded] = useState(!compact);

  const activeMemberships = memberships.filter((m) => m.status === 'active');
  const pendingMemberships = memberships.filter((m) => m.status === 'pending');
  const nonMembers = memberships.filter((m) => m.status === 'not_a_member');

  const toast = (msg: string) => {
    if (onToast) onToast(msg);
  };

  // Compact summary for Credit tab
  if (compact) {
    return (
      <div className="rounded-xl border border-surface-border bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Credit Union Memberships
          </h3>
          <span className="text-xs font-bold text-gray-400">
            {activeMemberships.length} active / {memberships.length} total
          </span>
        </div>

        <div className="space-y-2">
          {memberships.map((cu) => {
            const statusCfg = STATUS_CONFIG[cu.status];
            return (
              <div
                key={cu.id}
                className="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{cu.name}</span>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusCfg.classes}`}
                >
                  {statusCfg.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Full layout for Profile tab
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
      {/* Header with collapse toggle */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">
            Credit Union Memberships
          </h3>
          <span className="text-xs font-semibold text-gray-500">
            {activeMemberships.length} active
            {pendingMemberships.length > 0 && ` / ${pendingMemberships.length} pending`}
            {' / '}
            {memberships.length} total
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <>
          {/* Active memberships */}
          {activeMemberships.length > 0 && (
            <div className="space-y-3">
              {activeMemberships.map((cu) => (
                <MembershipRow key={cu.id} cu={cu} onToast={toast} />
              ))}
            </div>
          )}

          {/* Pending memberships */}
          {pendingMemberships.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide pt-2">
                Pending
              </p>
              {pendingMemberships.map((cu) => (
                <MembershipRow key={cu.id} cu={cu} onToast={toast} />
              ))}
            </div>
          )}

          {/* Not a member */}
          {nonMembers.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">
                Available Credit Unions
              </p>
              {nonMembers.map((cu) => (
                <MembershipRow key={cu.id} cu={cu} onToast={toast} />
              ))}
            </div>
          )}

          {/* Bulk eligibility check */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => toast('Eligibility check complete — scanning all credit unions')}
              className="w-full px-4 py-2.5 text-sm font-bold rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Check Eligibility for All Credit Unions
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Membership Row
// ---------------------------------------------------------------------------

function MembershipRow({
  cu,
  onToast,
}: {
  cu: CreditUnionMembership;
  onToast: (msg: string) => void;
}) {
  const statusCfg = STATUS_CONFIG[cu.status];

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white truncate">{cu.name}</p>
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border flex-shrink-0 ${statusCfg.classes}`}
          >
            {statusCfg.label}
          </span>
        </div>

        {/* Member info */}
        {cu.status === 'active' && cu.joinDate && (
          <p className="text-xs text-gray-400 mt-0.5">{formatMemberSince(cu.joinDate)}</p>
        )}

        {/* Current products */}
        {cu.products.length > 0 && (
          <p className="text-xs text-gray-500 mt-0.5">
            Products: {cu.products.join(', ')}
          </p>
        )}

        {/* Available products */}
        {cu.availableProducts.length > 0 && cu.status === 'active' && (
          <p className="text-xs text-gray-600 mt-0.5">
            Available: {cu.availableProducts.join(', ')}
          </p>
        )}

        {/* Open membership badge for non-members */}
        {cu.status === 'not_a_member' && cu.openMembership && (
          <p className="text-xs text-emerald-500 mt-0.5">
            Open Membership{cu.joinFee != null ? ` — Join for $${cu.joinFee}` : ''}
          </p>
        )}

        {/* Restricted membership for non-members */}
        {cu.status === 'not_a_member' && !cu.openMembership && (
          <p className="text-xs text-gray-600 mt-0.5">
            Restricted — eligibility check required
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        {cu.status === 'active' && (
          <button
            type="button"
            onClick={() => onToast(`Opening ${cu.name} product application...`)}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-brand-gold text-brand-navy hover:bg-brand-gold/90 transition-colors whitespace-nowrap"
          >
            Apply for Product
          </button>
        )}

        {cu.status === 'pending' && (
          <span className="text-xs font-semibold text-amber-400 whitespace-nowrap">
            Application in progress
          </span>
        )}

        {cu.status === 'not_a_member' && cu.openMembership && (
          <button
            type="button"
            onClick={() =>
              onToast(
                `Initiating ${cu.name} membership${cu.joinFee ? ` — $${cu.joinFee} fee` : ''}`,
              )
            }
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            Join{cu.joinFee ? ` — $${cu.joinFee}` : ''}
          </button>
        )}

        {cu.status === 'not_a_member' && !cu.openMembership && (
          <button
            type="button"
            onClick={() => onToast(`Checking ${cu.name} eligibility...`)}
            className="text-xs font-semibold text-brand-gold hover:text-brand-gold/80 transition-colors whitespace-nowrap"
          >
            Check Eligibility
          </button>
        )}
      </div>
    </div>
  );
}
