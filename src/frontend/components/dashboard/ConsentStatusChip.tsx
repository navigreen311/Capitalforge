'use client';

// ============================================================
// ConsentStatusChip — Small inline pill for table rows
//
// Displays consent status as a colored chip with optional
// tooltip (via native title attribute).
// ============================================================

interface ConsentStatusChipProps {
  status: 'complete' | 'pending' | 'blocked';
  tooltip?: string;
}

const STATUS_CONFIG: Record<
  ConsentStatusChipProps['status'],
  { label: string; className: string }
> = {
  complete: {
    label: 'Complete',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  pending: {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  blocked: {
    label: 'Blocked',
    className: 'bg-red-100 text-red-800 border-red-300',
  },
};

export function ConsentStatusChip({ status, tooltip }: ConsentStatusChipProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className}`}
      title={tooltip}
    >
      {config.label}
    </span>
  );
}
