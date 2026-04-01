'use client';

import { useEffect, useState, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────

type AlertTier = 'critical' | 'warning' | 'upcoming';

interface AprExpiryAlert {
  client_id: string;
  client_name: string;
  issuer: string;
  card_last_four: string;
  credit_limit: number | null;
  expiry_date: string;
  days_remaining: number;
  tier: AlertTier;
  card_id: string;
  funding_round_id: string | null;
}

interface AprExpiryData {
  all_clear: boolean;
  counts: {
    critical: number;
    warning: number;
    upcoming: number;
  };
  alerts: AprExpiryAlert[];
  last_updated: string;
}

// ── Styles ───────────────────────────────────────────────────

const COLORS = {
  navy: '#1B2A4A',
  navyLight: '#243556',
  coral: '#FF6B6B',
  red: '#DC2626',
  amber: '#F59E0B',
  amberLight: '#FEF3C7',
  green: '#10B981',
  greenLight: '#D1FAE5',
  greenDark: '#065F46',
  white: '#FFFFFF',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray700: '#374151',
  gray900: '#111827',
} as const;

const tierConfig: Record<AlertTier, { label: string; bg: string; text: string; badge: string; badgeText: string }> = {
  critical: {
    label: 'Critical',
    bg: '#FEF2F2',
    text: COLORS.red,
    badge: COLORS.coral,
    badgeText: COLORS.white,
  },
  warning: {
    label: 'Warning',
    bg: COLORS.amberLight,
    text: '#92400E',
    badge: COLORS.amber,
    badgeText: COLORS.white,
  },
  upcoming: {
    label: 'Upcoming',
    bg: '#EFF6FF',
    text: '#1E40AF',
    badge: '#3B82F6',
    badgeText: COLORS.white,
  },
};

// ── Loading Skeleton ─────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${COLORS.gray200}` }}>
      <div
        style={{
          background: COLORS.navy,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 180,
            height: 20,
            borderRadius: 4,
            background: 'rgba(255,255,255,0.15)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 56,
              borderRadius: 6,
              background: COLORS.gray100,
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export function AprExpiryPanel() {
  const [data, setData] = useState<AprExpiryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AlertTier>('critical');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Fetch alerts
  useEffect(() => {
    let cancelled = false;

    async function fetchAlerts() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/v1/dashboard/apr-expiry-alerts');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load APR alerts');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAlerts();
    return () => { cancelled = true; };
  }, []);

  // Dismiss handler — logs apr_expiry.acknowledged event
  const handleDismiss = useCallback(async (alert: AprExpiryAlert) => {
    try {
      await fetch('/api/v1/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'apr_expiry.acknowledged',
          aggregateType: 'CardApplication',
          aggregateId: alert.card_id,
          payload: {
            client_id: alert.client_id,
            days_remaining: alert.days_remaining,
            tier: alert.tier,
          },
        }),
      });
      setDismissedIds((prev) => new Set(prev).add(alert.card_id));
    } catch {
      // Silently fail — non-critical action
    }
  }, []);

  // Loading state
  if (loading) return <LoadingSkeleton />;

  // Error state
  if (error) {
    return (
      <div
        style={{
          borderRadius: 8,
          border: `1px solid ${COLORS.red}`,
          padding: 16,
          color: COLORS.red,
          fontSize: 14,
        }}
      >
        Failed to load APR expiry alerts: {error}
      </div>
    );
  }

  if (!data) return null;

  // All clear state
  if (data.all_clear) {
    return (
      <div
        style={{
          borderRadius: 8,
          background: COLORS.greenLight,
          border: `1px solid ${COLORS.green}`,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: COLORS.greenDark,
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        <span style={{ fontSize: 20 }}>&#10003;</span>
        Portfolio APR Health: Clear
      </div>
    );
  }

  // Filter alerts for active tab, excluding dismissed
  const visibleAlerts = data.alerts.filter(
    (a) => a.tier === activeTab && !dismissedIds.has(a.card_id),
  );

  const tabs: AlertTier[] = ['critical', 'warning', 'upcoming'];

  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${COLORS.gray200}` }}>
      {/* Navy header bar */}
      <div
        style={{
          background: COLORS.navy,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: COLORS.white, fontWeight: 600, fontSize: 15 }}>
          APR Expiry Alerts
        </span>

        {/* Tab badges */}
        <div style={{ display: 'flex', gap: 8 }}>
          {tabs.map((tier) => {
            const config = tierConfig[tier];
            const count = data.counts[tier];
            const isActive = activeTab === tier;
            return (
              <button
                key={tier}
                onClick={() => setActiveTab(tier)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 16,
                  border: isActive ? `2px solid ${COLORS.white}` : '2px solid transparent',
                  background: config.badge,
                  color: config.badgeText,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                {config.label}
                <span
                  style={{
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 12,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Alert rows */}
      <div style={{ background: COLORS.white }}>
        {visibleAlerts.length === 0 ? (
          <div
            style={{
              padding: '24px 20px',
              textAlign: 'center',
              color: COLORS.gray500,
              fontSize: 14,
            }}
          >
            No {tierConfig[activeTab].label.toLowerCase()} alerts
          </div>
        ) : (
          visibleAlerts.map((alert) => {
            const config = tierConfig[alert.tier];
            return (
              <div
                key={alert.card_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 20px',
                  borderBottom: `1px solid ${COLORS.gray100}`,
                  background: config.bg,
                  gap: 16,
                }}
              >
                {/* Client info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: COLORS.gray900,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {alert.client_name}
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.gray500, marginTop: 2 }}>
                    {alert.issuer} &middot; ****{alert.card_last_four}
                    {alert.credit_limit != null && (
                      <> &middot; ${alert.credit_limit.toLocaleString()}</>
                    )}
                  </div>
                </div>

                {/* Expiry date */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, color: COLORS.gray500 }}>
                    {new Date(alert.expiry_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: config.text,
                    }}
                  >
                    {alert.days_remaining}d remaining
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <a
                    href={`/voiceforge/outreach?client_id=${alert.client_id}`}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      background: COLORS.navy,
                      color: COLORS.white,
                      fontSize: 13,
                      fontWeight: 500,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Contact Client
                  </a>
                  <button
                    onClick={() => handleDismiss(alert)}
                    title="Dismiss alert"
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${COLORS.gray200}`,
                      background: COLORS.white,
                      color: COLORS.gray400,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    &#x2715;
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '8px 20px',
          background: COLORS.gray50,
          borderTop: `1px solid ${COLORS.gray100}`,
          fontSize: 12,
          color: COLORS.gray400,
          textAlign: 'right',
        }}
      >
        Last updated: {new Date(data.last_updated).toLocaleTimeString()}
      </div>
    </div>
  );
}
