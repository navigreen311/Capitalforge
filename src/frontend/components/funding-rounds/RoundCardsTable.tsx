'use client';

// ============================================================
// RoundCardsTable — Enhanced cards-in-round table for the
// funding round detail page.
//
// Features:
//   - Balance column with formatted currency ("—" for non-approved)
//   - Utilization bar (green <30%, amber 30–60%, red >60%)
//   - Consent status indicators (complete/pending/blocked)
//   - APR expiry with color-coded urgency
//   - "Notify Client" dropdown on approved cards with APR expiry
// ============================================================

import { useState, useRef, useEffect } from 'react';
import { SectionCard } from '../ui/card';

// ── Types ───────────────────────────────────────────────────────────────────

export interface RoundCard {
  id: string;
  cardProduct: string;
  issuer: string;
  limit: number;
  balance: number | null;
  utilization: number | null;
  consentStatus: 'complete' | 'pending' | 'blocked';
  status: string;
  aprDaysLeft: number | null;
}

export interface RoundCardsTableProps {
  cards: RoundCard[];
  onNotifyClient?: (cardId: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number | null): string {
  if (value == null) return '\u2014';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function statusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Status chip colors ──────────────────────────────────────────────────────

const STATUS_CHIP: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  declined: 'bg-red-50 text-red-700 border-red-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  funded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending_consent: 'bg-amber-50 text-amber-700 border-amber-200',
};

// ── Utilization bar ─────────────────────────────────────────────────────────

function UtilizationBar({ utilization }: { utilization: number }) {
  let barColor: string;
  if (utilization < 30) {
    barColor = 'bg-emerald-500';
  } else if (utilization <= 60) {
    barColor = 'bg-amber-500';
  } else {
    barColor = 'bg-red-500';
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(utilization, 100)}%` }}
        />
      </div>
      <span className="text-xs text-gray-600 tabular-nums">{utilization}%</span>
    </div>
  );
}

// ── Consent indicator ───────────────────────────────────────────────────────

const CONSENT_DISPLAY: Record<
  RoundCard['consentStatus'],
  { icon: string; label: string; className: string }
> = {
  complete: { icon: '\u2705', label: 'Complete', className: 'text-emerald-700' },
  pending:  { icon: '\u26A0\uFE0F', label: 'Pending',  className: 'text-amber-700' },
  blocked:  { icon: '\u274C', label: 'Blocked',  className: 'text-red-700' },
};

function ConsentBadge({ status }: { status: RoundCard['consentStatus'] }) {
  const display = CONSENT_DISPLAY[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${display.className}`}>
      <span aria-hidden="true">{display.icon}</span>
      {display.label}
    </span>
  );
}

// ── APR expiry ──────────────────────────────────────────────────────────────

function aprExpiryColor(days: number | null): string {
  if (days == null) return 'text-gray-400';
  if (days <= 15) return 'text-red-600 font-semibold';
  if (days <= 60) return 'text-amber-600 font-semibold';
  return 'text-emerald-600';
}

function aprExpiryLabel(days: number | null): string {
  if (days == null) return '\u2014';
  if (days <= 0) return 'Expired';
  if (days === 1) return '1 day';
  return `${days} days`;
}

// ── Notify Client Dropdown ──────────────────────────────────────────────────

const NOTIFY_ACTIONS = [
  { key: 'voiceforge', label: 'Send VoiceForge call' },
  { key: 'sms',        label: 'Send SMS' },
  { key: 'email',      label: 'Send email' },
  { key: 'manual',     label: 'Log manual note' },
] as const;

function NotifyDropdown({
  cardId,
  onNotifyClient,
}: {
  cardId: string;
  onNotifyClient?: (cardId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((p) => !p);
        }}
        className="px-3 py-1.5 text-xs font-medium text-brand-navy rounded-lg border border-brand-navy/20 hover:bg-brand-navy/5 transition-colors inline-flex items-center gap-1"
        aria-label={`Notify client for card ${cardId}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        Notify Client
        <span className="text-[10px]">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 w-48 bg-white rounded-lg shadow-lg border border-surface-border py-1"
          role="menu"
        >
          {NOTIFY_ACTIONS.map((action) => (
            <button
              key={action.key}
              onClick={() => {
                console.info(`[RoundCardsTable] ${action.key}:`, cardId);
                onNotifyClient?.(cardId);
                setOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              role="menuitem"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function RoundCardsTable({ cards, onNotifyClient }: RoundCardsTableProps) {
  return (
    <SectionCard title="Cards in This Round" flushBody>
      <div className="overflow-x-auto">
        <table className="cf-table">
          <thead>
            <tr>
              <th className="text-left">Card</th>
              <th className="text-left">Issuer</th>
              <th className="text-right">Limit</th>
              <th className="text-right">Balance</th>
              <th className="text-left">Util%</th>
              <th className="text-center">Consent</th>
              <th className="text-center">Status</th>
              <th className="text-right">APR Expiry</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {cards.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                  No cards in this round.
                </td>
              </tr>
            ) : (
              cards.map((card) => {
                const isApproved = card.status === 'approved' || card.status === 'funded';
                const showNotify = isApproved && card.aprDaysLeft != null;

                return (
                  <tr key={card.id}>
                    {/* Card product */}
                    <td className="font-medium text-gray-900">{card.cardProduct}</td>

                    {/* Issuer */}
                    <td className="text-gray-600">{card.issuer}</td>

                    {/* Limit */}
                    <td className="text-right tabular-nums">{formatCurrency(card.limit)}</td>

                    {/* Balance */}
                    <td className="text-right tabular-nums">
                      {isApproved ? formatCurrency(card.balance) : '\u2014'}
                    </td>

                    {/* Utilization */}
                    <td>
                      {isApproved && card.utilization != null ? (
                        <UtilizationBar utilization={card.utilization} />
                      ) : (
                        <span className="text-gray-400">{'\u2014'}</span>
                      )}
                    </td>

                    {/* Consent */}
                    <td className="text-center">
                      <ConsentBadge status={card.consentStatus} />
                    </td>

                    {/* Status */}
                    <td className="text-center">
                      <span
                        className={`text-2xs font-bold px-2 py-0.5 rounded-full border ${
                          STATUS_CHIP[card.status] ?? STATUS_CHIP.draft
                        }`}
                      >
                        {statusLabel(card.status)}
                      </span>
                    </td>

                    {/* APR Expiry */}
                    <td className={`text-right tabular-nums text-sm ${aprExpiryColor(card.aprDaysLeft)}`}>
                      {aprExpiryLabel(card.aprDaysLeft)}
                    </td>

                    {/* Action */}
                    <td className="text-right">
                      {showNotify ? (
                        <NotifyDropdown
                          cardId={card.id}
                          onNotifyClient={onNotifyClient}
                        />
                      ) : (
                        <span className="text-gray-300">{'\u2014'}</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
