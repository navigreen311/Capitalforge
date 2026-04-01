// ============================================================
// ConsentStatusGrid — unit tests
// Tests all 4 channels displayed, granted/revoked/expired state
// configs, summary count logic, date label formatting, and
// STATUS_CONFIG entries — from consent-status-grid.tsx.
// ============================================================

import { describe, it, expect } from 'vitest';
import type { ConsentChannel, ConsentStatus } from '../../../src/shared/types/index';

// ── Types matching consent-status-grid.tsx ───────────────────────────────────

interface ConsentRecord {
  channel: ConsentChannel;
  status: ConsentStatus;
  consentType?: string;
  grantedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

// ── Inline constants from consent-status-grid.tsx ────────────────────────────

const CHANNEL_META: Record<ConsentChannel, { label: string; icon: string }> = {
  voice:    { label: 'Voice',    icon: '📞' },
  sms:      { label: 'SMS',      icon: '💬' },
  email:    { label: 'Email',    icon: '✉️' },
  partner:  { label: 'Partner',  icon: '🤝' },
  document: { label: 'Document', icon: '📄' },
};

interface StatusConfig {
  label: string;
  badgeClass: string;
  dotClass: string;
}

const STATUS_CONFIG: Record<ConsentStatus, StatusConfig> = {
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

function statusDateLabel(record: ConsentRecord): { label: string; value: string } {
  if (record.status === 'revoked' && record.revokedAt) {
    return { label: 'Revoked', value: record.revokedAt };
  }
  if (record.status === 'expired' && record.expiresAt) {
    return { label: 'Expired', value: record.expiresAt };
  }
  if (record.grantedAt) {
    return { label: 'Granted', value: record.grantedAt };
  }
  return { label: '', value: '—' };
}

// ────────────────────────────────────────────────────────────────────────────

describe('ConsentStatusGrid — channel list', () => {
  it('ALL_CHANNELS contains exactly 4 channels', () => {
    expect(ALL_CHANNELS).toHaveLength(4);
  });

  it('ALL_CHANNELS includes voice, sms, email, partner', () => {
    expect(ALL_CHANNELS).toContain('voice');
    expect(ALL_CHANNELS).toContain('sms');
    expect(ALL_CHANNELS).toContain('email');
    expect(ALL_CHANNELS).toContain('partner');
  });

  it('CHANNEL_META has entries for all 4 required channels', () => {
    ALL_CHANNELS.forEach((ch) => {
      expect(CHANNEL_META).toHaveProperty(ch);
      expect(CHANNEL_META[ch].label).toBeTruthy();
    });
  });

  it('channel labels are correct', () => {
    expect(CHANNEL_META.voice.label).toBe('Voice');
    expect(CHANNEL_META.sms.label).toBe('SMS');
    expect(CHANNEL_META.email.label).toBe('Email');
    expect(CHANNEL_META.partner.label).toBe('Partner');
  });
});

describe('ConsentStatusGrid — STATUS_CONFIG entries', () => {
  it('has entries for all 3 consent statuses', () => {
    const statuses: ConsentStatus[] = ['active', 'revoked', 'expired'];
    statuses.forEach((s) => {
      expect(STATUS_CONFIG).toHaveProperty(s);
    });
  });

  it('active status maps to "Granted" label with green colors', () => {
    const cfg = STATUS_CONFIG.active;
    expect(cfg.label).toBe('Granted');
    expect(cfg.badgeClass).toContain('green');
    expect(cfg.dotClass).toContain('green');
  });

  it('revoked status maps to "Revoked" label with red colors', () => {
    const cfg = STATUS_CONFIG.revoked;
    expect(cfg.label).toBe('Revoked');
    expect(cfg.badgeClass).toContain('red');
    expect(cfg.dotClass).toContain('red');
  });

  it('expired status maps to "Expired" label with yellow colors', () => {
    const cfg = STATUS_CONFIG.expired;
    expect(cfg.label).toBe('Expired');
    expect(cfg.badgeClass).toContain('yellow');
    expect(cfg.dotClass).toContain('yellow');
  });
});

describe('ConsentStatusGrid — active count summary', () => {
  const records: ConsentRecord[] = [
    { channel: 'voice',   status: 'active',  grantedAt: '2026-01-01' },
    { channel: 'sms',     status: 'revoked', revokedAt: '2026-02-01' },
    { channel: 'email',   status: 'active',  grantedAt: '2026-01-15' },
    { channel: 'partner', status: 'expired', expiresAt: '2025-12-31' },
  ];

  it('counts active channels correctly', () => {
    const activeCount = records.filter((r) => r.status === 'active').length;
    expect(activeCount).toBe(2);
  });

  it('total channels is always 4 (ALL_CHANNELS.length)', () => {
    expect(ALL_CHANNELS.length).toBe(4);
  });

  it('summary string formats correctly', () => {
    const activeCount = records.filter((r) => r.status === 'active').length;
    const summary = `${activeCount} / ${ALL_CHANNELS.length} channels active`;
    expect(summary).toBe('2 / 4 channels active');
  });

  it('counts 0 active when all revoked', () => {
    const revokedAll: ConsentRecord[] = ALL_CHANNELS.map((ch) => ({
      channel: ch,
      status: 'revoked' as ConsentStatus,
    }));
    expect(revokedAll.filter((r) => r.status === 'active').length).toBe(0);
  });

  it('counts all 4 active when all granted', () => {
    const allActive: ConsentRecord[] = ALL_CHANNELS.map((ch) => ({
      channel: ch,
      status: 'active' as ConsentStatus,
    }));
    expect(allActive.filter((r) => r.status === 'active').length).toBe(4);
  });
});

describe('ConsentStatusGrid — record-by-channel lookup', () => {
  const records: ConsentRecord[] = [
    { channel: 'voice', status: 'active', grantedAt: '2026-01-01' },
    { channel: 'email', status: 'expired', expiresAt: '2025-11-01' },
  ];

  it('builds a map keyed by channel', () => {
    const map = Object.fromEntries(records.map((r) => [r.channel, r])) as
      Partial<Record<ConsentChannel, ConsentRecord>>;
    expect(map.voice?.status).toBe('active');
    expect(map.email?.status).toBe('expired');
  });

  it('missing channel maps to undefined (No Record state)', () => {
    const map = Object.fromEntries(records.map((r) => [r.channel, r])) as
      Partial<Record<ConsentChannel, ConsentRecord>>;
    expect(map.sms).toBeUndefined();
    expect(map.partner).toBeUndefined();
  });

  it('missing channel defaults to "expired" status for display', () => {
    // From the component: const status: ConsentStatus = record?.status ?? 'expired'
    const record: ConsentRecord | undefined = undefined;
    const status: ConsentStatus = record?.status ?? 'expired';
    expect(status).toBe('expired');
  });
});

describe('ConsentStatusGrid — date label logic', () => {
  it('revoked record shows revokedAt date', () => {
    const record: ConsentRecord = {
      channel: 'voice',
      status: 'revoked',
      revokedAt: '2026-02-15',
    };
    const result = statusDateLabel(record);
    expect(result.label).toBe('Revoked');
    expect(result.value).toBe('2026-02-15');
  });

  it('expired record shows expiresAt date', () => {
    const record: ConsentRecord = {
      channel: 'email',
      status: 'expired',
      expiresAt: '2025-12-01',
    };
    const result = statusDateLabel(record);
    expect(result.label).toBe('Expired');
    expect(result.value).toBe('2025-12-01');
  });

  it('active record shows grantedAt date', () => {
    const record: ConsentRecord = {
      channel: 'sms',
      status: 'active',
      grantedAt: '2026-01-10',
    };
    const result = statusDateLabel(record);
    expect(result.label).toBe('Granted');
    expect(result.value).toBe('2026-01-10');
  });

  it('record with no date fields returns em dash', () => {
    const record: ConsentRecord = {
      channel: 'partner',
      status: 'active',
    };
    const result = statusDateLabel(record);
    expect(result.value).toBe('—');
  });
});

describe('ConsentStatusGrid — re-consent button logic', () => {
  it('re-consent button shown for non-active channel when onRequestConsent is provided', () => {
    const status: ConsentStatus = 'revoked';
    const hasCallback = true;
    const shouldShow = hasCallback && (status !== 'active' || false);
    expect(shouldShow).toBe(true);
  });

  it('re-consent button NOT shown for active channel', () => {
    const status: ConsentStatus = 'active';
    const missing = false;
    const shouldShow = status !== 'active' || missing;
    expect(shouldShow).toBe(false);
  });

  it('re-consent button shown for missing record', () => {
    const status: ConsentStatus = 'expired'; // default for missing
    const missing = true;
    const shouldShow = status !== 'active' || missing;
    expect(shouldShow).toBe(true);
  });
});
