'use client';

// ============================================================
// FundingRoundTableView — Sortable table view of funding rounds
//
// Features:
//   - Sortable columns (click header for asc/desc)
//   - Default sort: APR urgency ascending (most urgent first)
//   - Kebab menu per row: View Detail, Add Application,
//     Export Dossier, Mark Complete
//   - Progress column: percentage + inline colored mini bar
//   - APR Alert: red "Urgent Xd" / amber "Act Soon Xd" / green "Clear"
//   - Uses cf-table classes
// ============================================================

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Badge } from '../ui/badge';
import type { BadgeStatus } from '../ui/badge';

// ── Types ───────────────────────────────────────────────────────────────────

interface AprUrgency {
  days: number;
  tier: 'urgent' | 'act_soon' | 'clear';
}

export interface FundingRoundRow {
  id: string;
  businessName: string;
  roundNumber: number;
  status: string;
  obtainedAmount: number;
  targetAmount: number;
  targetCloseAt: string;
  advisorName: string;
  aprUrgency: AprUrgency | null;
}

export interface FundingRoundTableViewProps {
  rounds: FundingRoundRow[];
  onRoundClick: (roundId: string) => void;
}

type SortField =
  | 'id'
  | 'businessName'
  | 'roundNumber'
  | 'status'
  | 'progress'
  | 'targetCloseAt'
  | 'aprUrgency'
  | 'advisorName';

type SortDirection = 'asc' | 'desc';

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_TO_BADGE: Record<string, BadgeStatus> = {
  draft: 'draft',
  open: 'active',
  active: 'active',
  in_progress: 'processing',
  pending: 'pending',
  closed: 'inactive',
  funded: 'funded',
  completed: 'approved',
  expired: 'expired',
  declined: 'declined',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function progressPct(obtained: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((obtained / target) * 100));
}

function progressBarColor(pct: number): string {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Numeric urgency value for sorting — lower = more urgent */
function aprSortValue(urgency: AprUrgency | null): number {
  if (urgency == null) return Number.MAX_SAFE_INTEGER;
  const tierWeight = urgency.tier === 'urgent' ? 0 : urgency.tier === 'act_soon' ? 100_000 : 200_000;
  return tierWeight + urgency.days;
}

function compareValues<T>(a: T, b: T, dir: SortDirection): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === 'asc' ? -1 : 1;
  if (b == null) return dir === 'asc' ? 1 : -1;
  if (typeof a === 'string' && typeof b === 'string') {
    return dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return dir === 'asc' ? a - b : b - a;
  }
  return 0;
}

// ── Sort Arrow ──────────────────────────────────────────────────────────────

function SortArrow({ field, sortField, sortDir }: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDirection;
}) {
  if (field !== sortField) {
    return <span className="ml-1 text-gray-300 text-[10px]">{'\u2195'}</span>;
  }
  return (
    <span className="ml-1 text-brand-navy text-[10px]">
      {sortDir === 'asc' ? '\u2191' : '\u2193'}
    </span>
  );
}

// ── APR Alert Badge ────────────────────────────────────────────────────────

function AprAlertBadge({ urgency }: { urgency: AprUrgency | null }) {
  if (urgency == null) {
    return <span className="text-gray-400">&mdash;</span>;
  }

  const config: Record<AprUrgency['tier'], { bg: string; text: string; label: string }> = {
    urgent:   { bg: 'bg-red-50',    text: 'text-red-700',    label: `Urgent ${urgency.days}d` },
    act_soon: { bg: 'bg-amber-50',  text: 'text-amber-700',  label: `Act Soon ${urgency.days}d` },
    clear:    { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Clear' },
  };

  const cfg = config[urgency.tier];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

// ── Row Kebab Menu ──────────────────────────────────────────────────────────

function RowKebabMenu({ round, onRoundClick }: {
  round: FundingRoundRow;
  onRoundClick: (id: string) => void;
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
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
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
        onClick={(e) => { e.stopPropagation(); setOpen((p) => !p); }}
        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label={`Actions for round ${round.id}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        &#x22EE;
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 w-44 bg-white rounded-lg shadow-lg border border-surface-border py-1"
          role="menu"
        >
          <button
            onClick={() => { onRoundClick(round.id); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            View Detail
          </button>
          <button
            onClick={() => { console.info('[FundingRoundTable] Add Application:', round.id); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            Add Application
          </button>
          <button
            onClick={() => { console.info('[FundingRoundTable] Export Dossier:', round.id); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            Export Dossier
          </button>
          <button
            onClick={() => { console.info('[FundingRoundTable] Mark Complete:', round.id); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            Mark Complete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function FundingRoundTableView({
  rounds,
  onRoundClick,
}: FundingRoundTableViewProps) {
  const [sortField, setSortField] = useState<SortField>('aprUrgency');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  // ── Sort ────────────────────────────────────────────────────────────────
  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortDir('asc');
      }
      return field;
    });
  }, []);

  const sorted = useMemo(() => {
    const copy = [...rounds];
    copy.sort((a, b) => {
      if (sortField === 'aprUrgency') {
        const aVal = aprSortValue(a.aprUrgency);
        const bVal = aprSortValue(b.aprUrgency);
        return compareValues(aVal, bVal, sortDir);
      }
      if (sortField === 'progress') {
        const aVal = progressPct(a.obtainedAmount, a.targetAmount);
        const bVal = progressPct(b.obtainedAmount, b.targetAmount);
        return compareValues(aVal, bVal, sortDir);
      }
      const aVal = a[sortField as keyof FundingRoundRow];
      const bVal = b[sortField as keyof FundingRoundRow];
      return compareValues(aVal as string | number, bVal as string | number, sortDir);
    });
    return copy;
  }, [rounds, sortField, sortDir]);

  // ── Sortable header helper ─────────────────────────────────────────────
  const thButton = (label: string, field: SortField, align: 'text-left' | 'text-right' = 'text-left') => (
    <th className={align} key={field}>
      <button
        onClick={() => handleSort(field)}
        className="inline-flex items-center gap-0.5 hover:text-gray-800 transition-colors"
      >
        {label}
        <SortArrow field={field} sortField={sortField} sortDir={sortDir} />
      </button>
    </th>
  );

  return (
    <div className="cf-table-wrapper">
      <div className="overflow-x-auto">
        <table className="cf-table">
          <thead>
            <tr>
              {thButton('Round ID', 'id')}
              {thButton('Client', 'businessName')}
              {thButton('Round #', 'roundNumber')}
              {thButton('Status', 'status')}
              {thButton('Progress', 'progress')}
              {thButton('Target Close', 'targetCloseAt')}
              {thButton('APR Alert', 'aprUrgency')}
              {thButton('Advisor', 'advisorName')}
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                  No funding rounds found.
                </td>
              </tr>
            ) : (
              sorted.map((round) => {
                const pct = progressPct(round.obtainedAmount, round.targetAmount);
                const badgeStatus: BadgeStatus = STATUS_TO_BADGE[round.status] ?? 'draft';

                return (
                  <tr key={round.id} className="group">
                    {/* Round ID — clickable */}
                    <td>
                      <button
                        onClick={() => onRoundClick(round.id)}
                        className="font-medium text-brand-navy hover:underline text-sm"
                      >
                        {round.id}
                      </button>
                    </td>

                    {/* Client */}
                    <td className="font-medium text-gray-900">{round.businessName}</td>

                    {/* Round # */}
                    <td className="text-sm">R{round.roundNumber}</td>

                    {/* Status chip */}
                    <td>
                      <Badge
                        status={badgeStatus}
                        label={statusLabel(round.status)}
                        size="sm"
                      />
                    </td>

                    {/* Progress — percentage + mini bar */}
                    <td>
                      <div className="inline-flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 w-8 text-right">
                          {pct}%
                        </span>
                        <div className="w-[30px] h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${progressBarColor(pct)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Target Close */}
                    <td className="text-sm">{formatDate(round.targetCloseAt)}</td>

                    {/* APR Alert */}
                    <td>
                      <AprAlertBadge urgency={round.aprUrgency} />
                    </td>

                    {/* Advisor */}
                    <td className="text-sm">{round.advisorName}</td>

                    {/* Actions */}
                    <td className="text-right">
                      <RowKebabMenu round={round} onRoundClick={onRoundClick} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
