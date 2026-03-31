import React from 'react';

// ─── Base Card ───────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Makes the card clickable with hover effect */
  onClick?: () => void;
  /** Remove default padding */
  noPadding?: boolean;
}

export function Card({ children, className = '', onClick, noPadding }: CardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`
        bg-white rounded-xl border border-surface-border shadow-card
        ${noPadding ? '' : 'p-6'}
        ${onClick ? 'cursor-pointer hover:shadow-card-hover transition-shadow duration-150 text-left w-full' : ''}
        ${className}
      `}
    >
      {children}
    </Tag>
  );
}

// ─── Stat / Metric Card ──────────────────────────────────────────────────────

export type TrendDirection = 'up' | 'down' | 'flat';

interface StatCardProps {
  title: string;
  value: string | number;
  /** e.g. "+12.4%" or "3 this week" */
  trendLabel?: string;
  trendDirection?: TrendDirection;
  /** Optional icon placeholder text (2 chars) */
  icon?: string;
  /** Background color for the icon container */
  iconBg?: string;
  /** Foreground color for the icon text */
  iconColor?: string;
  subtitle?: string;
  className?: string;
  onClick?: () => void;
}

const TREND_STYLES: Record<TrendDirection, string> = {
  up:   'text-emerald-600',
  down: 'text-red-500',
  flat: 'text-gray-400',
};

const TREND_ARROWS: Record<TrendDirection, string> = {
  up:   '↑',
  down: '↓',
  flat: '→',
};

export function StatCard({
  title,
  value,
  trendLabel,
  trendDirection = 'flat',
  icon,
  iconBg = 'bg-brand-navy/5',
  iconColor = 'text-brand-navy',
  subtitle,
  className = '',
  onClick,
}: StatCardProps) {
  return (
    <Card className={`flex flex-col gap-3 ${className}`} onClick={onClick}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {icon && (
          <span
            className={`inline-flex items-center justify-center w-9 h-9 rounded-lg
                        text-xs font-bold flex-shrink-0 ${iconBg} ${iconColor}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>

      {/* Value */}
      <p className="text-3xl font-bold tracking-tight text-gray-900 leading-none">
        {value}
      </p>

      {/* Footer — trend + subtitle */}
      {(trendLabel || subtitle) && (
        <div className="flex items-center gap-2 flex-wrap">
          {trendLabel && (
            <span className={`text-sm font-medium ${TREND_STYLES[trendDirection]}`}>
              {TREND_ARROWS[trendDirection]} {trendLabel}
            </span>
          )}
          {subtitle && (
            <span className="text-xs text-gray-400">{subtitle}</span>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Section Card (with title header) ───────────────────────────────────────

interface SectionCardProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Remove body padding (e.g. for flush tables) */
  flushBody?: boolean;
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className = '',
  flushBody,
}: SectionCardProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-surface-border shadow-card
                  overflow-hidden ${className}`}
    >
      {/* Card header */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-surface-border">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>

      {/* Card body */}
      <div className={flushBody ? '' : 'p-6'}>{children}</div>
    </div>
  );
}

// ─── Empty State Card ────────────────────────────────────────────────────────

interface EmptyCardProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyCard({ icon, title, description, action, className = '' }: EmptyCardProps) {
  return (
    <Card className={`flex flex-col items-center justify-center text-center py-12 ${className}`}>
      {icon && (
        <span
          className="inline-flex items-center justify-center w-12 h-12 rounded-xl
                     bg-surface-overlay text-xl mb-4"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <h4 className="text-base font-semibold text-gray-700 mb-1">{title}</h4>
      {description && (
        <p className="text-sm text-gray-400 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
