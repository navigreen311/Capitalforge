'use client';

// ============================================================
// ConsentStatusGrid — displays consent status per channel
// (voice / sms / email / partner) with granted/revoked/expired
// badges and granted-at timestamp.
// ============================================================

import type { ConsentChannel, ConsentStatus } from '../../../shared/types';

export interface ConsentRecord {
  channel: ConsentChannel;
  status: ConsentStatus;
  consentType?: string;
  grantedAt?: string;  // ISO date
  expiresAt?: string;  // ISO date
  revokedAt?: string;  // ISO date
}

interface ConsentStatusGridProps {
  records: ConsentRecord[];
  /** Called when an advisor wants to trigger a re-consent flow */
  onRequestConsent?: (channel: ConsentChannel) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHANNEL_META: Record<ConsentChannel, { label: string; icon: string }> = {
  voice:    { label: 'Voice',   icon: '📞' },
  sms:      { label: 'SMS',     icon: '💬' },
  email:    { label: 'Email',   icon: '✉️' },
  partner:  { label: 'Partner', icon: '🤝' },
  document: { label: 'Document', icon: '📄' },
};

const STATUS_CONFIG: Record<
  ConsentStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  active: {
    label: 'Granted',
    badgeClass: 'bg-green-900 text-green-300 border border-green-700',
    dotClass: 'bg-green-400',
  },
  revoked: {
    label: 'Revoked',
    badgeClass: 'bg-red-900 text-red-300 border border-red-700',
    dotClass: 'bg-red-400',
  },
  expired: {
    label: 'Expired',
    badgeClass: 'bg-yellow-900 text-yellow-300 border border-yellow-700',
    dotClass: 'bg-yellow-400',
  },
};

const ALL_CHANNELS: ConsentChannel[] = ['voice', 'sms', 'email', 'partner'];

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function statusDateLabel(record: ConsentRecord): { label: string; value: string } {
  if (record.status === 'revoked' && record.revokedAt) {
    return { label: 'Revoked', value: formatDate(record.revokedAt) };
  }
  if (record.status === 'expired' && record.expiresAt) {
    return { label: 'Expired', value: formatDate(record.expiresAt) };
  }
  if (record.grantedAt) {
    return { label: 'Granted', value: formatDate(record.grantedAt) };
  }
  return { label: '', value: '—' };
}

// ---------------------------------------------------------------------------
// Channel Card
// ---------------------------------------------------------------------------

function ChannelCard({
  channel,
  record,
  onRequestConsent,
}: {
  channel: ConsentChannel;
  record?: ConsentRecord;
  onRequestConsent?: (ch: ConsentChannel) => void;
}) {
  const meta = CHANNEL_META[channel];
  const status: ConsentStatus = record?.status ?? 'expired';
  const cfg = STATUS_CONFIG[status];
  const dateInfo = record ? statusDateLabel(record) : { label: '', value: '—' };
  const missing = !record;

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 flex flex-col gap-3">
      {/* Channel header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{meta.icon}</span>
          <span className="font-semibold text-gray-100 text-sm">{meta.label}</span>
        </div>

        {/* Status badge */}
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${cfg.badgeClass}`}>
          <span className={`h-1.5 w-1.5 rounded-full inline-block ${cfg.dotClass}`} />
          {missing ? 'No Record' : cfg.label}
        </span>
      </div>

      {/* Date row */}
      {!missing && (
        <p className="text-xs text-gray-400">
          {dateInfo.label && <span className="text-gray-500">{dateInfo.label}: </span>}
          {dateInfo.value}
        </p>
      )}

      {/* Consent type */}
      {record?.consentType && (
        <p className="text-xs text-gray-500 uppercase tracking-wide">
          {record.consentType}
        </p>
      )}

      {/* Expiry warning */}
      {record?.status === 'active' && record.expiresAt && (
        <p className="text-xs text-yellow-400">
          Expires {formatDate(record.expiresAt)}
        </p>
      )}

      {/* Action */}
      {onRequestConsent && (status !== 'active' || missing) && (
        <button
          onClick={() => onRequestConsent(channel)}
          className="mt-auto text-xs text-blue-400 hover:text-blue-300 underline text-left transition-colors"
        >
          Request consent →
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ConsentStatusGrid({
  records,
  onRequestConsent,
  className = '',
}: ConsentStatusGridProps) {
  const recordByChannel = Object.fromEntries(
    records.map((r) => [r.channel, r]),
  ) as Partial<Record<ConsentChannel, ConsentRecord>>;

  const activeCount = records.filter((r) => r.status === 'active').length;
  const totalChannels = ALL_CHANNELS.length;

  return (
    <div className={className}>
      {/* Summary strip */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          Consent Status
        </h3>
        <span className="text-xs text-gray-400">
          {activeCount} / {totalChannels} channels active
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ALL_CHANNELS.map((ch) => (
          <ChannelCard
            key={ch}
            channel={ch}
            record={recordByChannel[ch]}
            onRequestConsent={onRequestConsent}
          />
        ))}
      </div>
    </div>
  );
}
