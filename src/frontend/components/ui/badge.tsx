import React from 'react';

// ─── Status Variants ─────────────────────────────────────────────────────────

export type BadgeStatus =
  | 'approved'
  | 'pending'
  | 'declined'
  | 'review'
  | 'inactive'
  | 'draft'
  | 'active'
  | 'funded'
  | 'expired'
  | 'processing';

export type BadgeSize = 'sm' | 'md' | 'lg';
export type BadgeVariant = 'subtle' | 'solid' | 'outline';

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
}

const STATUS_MAP: Record<BadgeStatus, StatusConfig> = {
  approved:   { label: 'Approved',   bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  active:     { label: 'Active',     bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  funded:     { label: 'Funded',     bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  pending:    { label: 'Pending',    bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  processing: { label: 'Processing', bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
  review:     { label: 'In Review',  bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500' },
  draft:      { label: 'Draft',      bg: 'bg-gray-50',     text: 'text-gray-600',    border: 'border-gray-200',    dot: 'bg-gray-400' },
  inactive:   { label: 'Inactive',   bg: 'bg-gray-50',     text: 'text-gray-500',    border: 'border-gray-200',    dot: 'bg-gray-400' },
  declined:   { label: 'Declined',   bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500' },
  expired:    { label: 'Expired',    bg: 'bg-red-50',      text: 'text-red-600',     border: 'border-red-200',     dot: 'bg-red-400' },
};

const SIZE_MAP: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-1',
  md: 'text-xs    px-2   py-1   gap-1.5',
  lg: 'text-sm    px-3   py-1.5 gap-2',
};

const DOT_SIZE_MAP: Record<BadgeSize, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2   h-2',
  lg: 'w-2.5 h-2.5',
};

// ─── Badge component ─────────────────────────────────────────────────────────

interface BadgeProps {
  status: BadgeStatus;
  /** Override the display label */
  label?: string;
  size?: BadgeSize;
  variant?: BadgeVariant;
  /** Show animated pulse dot */
  pulse?: boolean;
  className?: string;
}

export function Badge({
  status,
  label,
  size = 'md',
  variant = 'subtle',
  pulse = false,
  className = '',
}: BadgeProps) {
  const cfg = STATUS_MAP[status];
  const displayLabel = label ?? cfg.label;

  const variantStyles = {
    subtle:  `${cfg.bg} ${cfg.text}`,
    solid:   `${cfg.dot} text-white`,
    outline: `bg-transparent border ${cfg.border} ${cfg.text}`,
  };

  return (
    <span
      className={`
        inline-flex items-center rounded-full font-medium border
        ${SIZE_MAP[size]}
        ${variant === 'subtle'  ? `${cfg.bg} ${cfg.text} border-transparent` : ''}
        ${variant === 'solid'   ? `${cfg.dot} text-white border-transparent` : ''}
        ${variant === 'outline' ? `bg-transparent border ${cfg.border} ${cfg.text}` : ''}
        ${className}
      `}
      aria-label={`Status: ${displayLabel}`}
    >
      {/* Status dot */}
      <span
        className={`
          inline-block rounded-full flex-shrink-0
          ${DOT_SIZE_MAP[size]}
          ${variant === 'solid' ? 'bg-white/60' : cfg.dot}
          ${pulse ? 'animate-pulse' : ''}
        `}
        aria-hidden="true"
      />
      {displayLabel}
    </span>
  );
}

// ─── Generic color badge ──────────────────────────────────────────────────────
// For non-status uses: tags, categories, labels.

type ColorName = 'navy' | 'gold' | 'blue' | 'purple' | 'teal' | 'orange' | 'gray';

const COLOR_MAP: Record<ColorName, string> = {
  navy:   'bg-brand-navy/10 text-brand-navy   border-transparent',
  gold:   'bg-brand-gold/15 text-brand-gold-600 border-transparent',
  blue:   'bg-blue-50   text-blue-700   border-transparent',
  purple: 'bg-purple-50 text-purple-700 border-transparent',
  teal:   'bg-teal-50   text-teal-700   border-transparent',
  orange: 'bg-orange-50 text-orange-700 border-transparent',
  gray:   'bg-gray-100  text-gray-600   border-transparent',
};

interface ColorBadgeProps {
  label: string;
  color?: ColorName;
  size?: BadgeSize;
  className?: string;
  onRemove?: () => void;
}

export function ColorBadge({
  label,
  color = 'gray',
  size = 'md',
  className = '',
  onRemove,
}: ColorBadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium border
        ${SIZE_MAP[size]} ${COLOR_MAP[color]} ${className}
      `}
    >
      {label}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 hover:opacity-70 transition-opacity"
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

// ─── Convenience re-exports ──────────────────────────────────────────────────
export { STATUS_MAP };
