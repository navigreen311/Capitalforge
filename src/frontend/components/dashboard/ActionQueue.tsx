'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ────────────────────────────────────────────────────

type Priority = 'critical' | 'high' | 'medium';

interface ActionTask {
  id: string;
  priority: Priority;
  type: string;
  client_name: string;
  client_id: string;
  description: string;
  due_date: string | null;
  action_url: string;
  action_label: string;
}

interface ActionQueueData {
  total_count: number;
  tasks: ActionTask[];
  last_updated: string;
}

// ── Constants ────────────────────────────────────────────────

const PRIORITY_STYLES: Record<Priority, string> = {
  critical: 'bg-red-50 text-red-700',
  high: 'bg-amber-50 text-amber-700',
  medium: 'bg-blue-50 text-blue-700',
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  pending_consent:       { bg: 'bg-amber-100', text: 'text-amber-700' },
  missing_acknowledgment:{ bg: 'bg-orange-100', text: 'text-orange-700' },
  expired_consent:       { bg: 'bg-red-100', text: 'text-red-700' },
  unresolved_compliance: { bg: 'bg-rose-100', text: 'text-rose-700' },
  apr_expiry:            { bg: 'bg-purple-100', text: 'text-purple-700' },
  pending_deal_review:   { bg: 'bg-blue-100', text: 'text-blue-700' },
};

const TYPE_MONOGRAMS: Record<string, string> = {
  pending_consent: 'PC',
  missing_acknowledgment: 'MA',
  expired_consent: 'EC',
  unresolved_compliance: 'UC',
  apr_expiry: 'AE',
  pending_deal_review: 'DR',
};

const VISIBLE_COUNT = 5;

// ── Quick Actions ────────────────────────────────────────────

interface QuickActionItem {
  icon: string;
  label: string;
  description: string;
  href: string;
  accent?: boolean;
}

const QUICK_ACTIONS: QuickActionItem[] = [
  {
    icon: 'AP',
    label: 'New Application',
    description: 'Submit a funding application for a client',
    href: '/applications/new',
    accent: true,
  },
  {
    icon: 'CL',
    label: 'Add Client',
    description: 'Onboard a new business entity',
    href: '/clients/new',
  },
  {
    icon: 'CI',
    label: 'Pull Credit Report',
    description: 'Request bureau data for a client',
    href: '/credit-intelligence/pull',
  },
  {
    icon: 'DC',
    label: 'Export Dossier',
    description: 'Generate a client funding package',
    href: '/documents/export',
  },
];

// ── Helpers ──────────────────────────────────────────────────

function formatDueDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `${diffDays}d left`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Skeleton ─────────────────────────────────────────────────

function ActionQueueSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
          <div className="w-16 h-5 rounded bg-gray-200" />
          <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="w-32 h-4 rounded bg-gray-200" />
            <div className="w-48 h-3 rounded bg-gray-200" />
          </div>
          <div className="w-20 h-3 rounded bg-gray-200" />
          <div className="w-24 h-8 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────

export function ActionQueue() {
  const [data, setData] = useState<ActionQueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/dashboard/action-queue');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setError(null);
      } else {
        setError(json.error?.message ?? 'Failed to load action queue');
      }
    } catch {
      setError('Unable to connect to the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const markComplete = async (task: ActionTask) => {
    setCompletingIds((prev) => new Set(prev).add(task.id));
    try {
      await fetch('/api/v1/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'task.completed',
          aggregateType: 'action_queue',
          aggregateId: task.id,
          payload: {
            task_type: task.type,
            client_id: task.client_id,
          },
        }),
      });
      // Remove completed task from local state
      setData((prev) =>
        prev
          ? {
              ...prev,
              total_count: prev.total_count - 1,
              tasks: prev.tasks.filter((t) => t.id !== task.id),
            }
          : prev,
      );
    } catch {
      // Silently fail — task stays in queue
    } finally {
      setCompletingIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const visibleTasks =
    data && !showAll ? data.tasks.slice(0, VISIBLE_COUNT) : data?.tasks ?? [];
  const hasMore = (data?.total_count ?? 0) > VISIBLE_COUNT;

  return (
    <div className="space-y-6">
      {/* ── Action Queue ────────────────────────────────── */}
      <section aria-labelledby="action-queue-heading">
        <div className="flex items-center justify-between mb-3">
          <h2
            id="action-queue-heading"
            className="text-sm font-semibold text-gray-900 tracking-tight"
          >
            Today&apos;s Action Queue
            {data && (
              <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {data.total_count}
              </span>
            )}
          </h2>
        </div>

        {loading && <ActionQueueSkeleton />}

        {error && !loading && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && data && data.tasks.length === 0 && (
          <div className="rounded-lg border border-surface-border bg-gray-50 p-6 text-center text-sm text-gray-500">
            No pending actions — you&apos;re all caught up!
          </div>
        )}

        {!loading && !error && data && data.tasks.length > 0 && (
          <div className="space-y-2">
            {visibleTasks.map((task) => {
              const typeColor = TYPE_COLORS[task.type] ?? {
                bg: 'bg-gray-100',
                text: 'text-gray-700',
              };
              const monogram = TYPE_MONOGRAMS[task.type] ?? 'TK';
              const isCompleting = completingIds.has(task.id);

              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-surface-border bg-white hover:shadow-card transition-shadow duration-150"
                >
                  {/* Priority badge */}
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${PRIORITY_STYLES[task.priority]}`}
                  >
                    {task.priority}
                  </span>

                  {/* Type icon (monogram circle) */}
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold flex-shrink-0 ${typeColor.bg} ${typeColor.text}`}
                    aria-hidden="true"
                  >
                    {monogram}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {task.client_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{task.description}</p>
                  </div>

                  {/* Due date */}
                  <span className="text-xs text-gray-400 flex-shrink-0 w-20 text-right">
                    {formatDueDate(task.due_date)}
                  </span>

                  {/* Action button */}
                  <a
                    href={task.action_url}
                    className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-brand-navy text-white hover:bg-brand-navy-800 transition-colors flex-shrink-0"
                  >
                    {task.action_label}
                  </a>

                  {/* Mark complete */}
                  <button
                    type="button"
                    onClick={() => markComplete(task)}
                    disabled={isCompleting}
                    className="p-1.5 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50 flex-shrink-0"
                    aria-label={`Mark "${task.description}" as complete`}
                    title="Mark complete"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              );
            })}

            {/* View all toggle */}
            {hasMore && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="w-full py-2 text-xs font-medium text-brand-navy hover:text-brand-navy-800 transition-colors"
              >
                {showAll
                  ? 'Show fewer tasks'
                  : `View all ${data.total_count} tasks`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Quick Actions ───────────────────────────────── */}
      <section aria-labelledby="quick-actions-heading">
        <h2
          id="quick-actions-heading"
          className="text-sm font-semibold text-gray-900 tracking-tight mb-3"
        >
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {QUICK_ACTIONS.map((qa) => (
            <a
              key={qa.label}
              href={qa.href}
              className={`
                flex items-start gap-3 p-4 rounded-xl border transition-all duration-150
                ${qa.accent
                  ? 'bg-brand-navy text-white border-brand-navy hover:bg-brand-navy-800'
                  : 'bg-white border-surface-border hover:border-gray-300 hover:shadow-card'}
              `}
            >
              <span
                className={`
                  inline-flex items-center justify-center w-10 h-10 rounded-lg
                  text-sm font-bold flex-shrink-0
                  ${qa.accent ? 'bg-white/10 text-brand-gold' : 'bg-surface-overlay text-brand-navy'}
                `}
                aria-hidden="true"
              >
                {qa.icon}
              </span>
              <div>
                <p className={`text-sm font-semibold ${qa.accent ? 'text-white' : 'text-gray-900'}`}>
                  {qa.label}
                </p>
                <p className={`text-xs mt-0.5 ${qa.accent ? 'text-white/60' : 'text-gray-400'}`}>
                  {qa.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
