'use client';

// ============================================================
// AprExpiryTimeline — Gantt-style horizontal timeline showing
// application dates and APR expiry dates per funding round.
// Renders colored bars for intro APR periods, dotted wait
// lines between rounds, and an action-required summary.
// ============================================================

import React, { useMemo } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────

interface TimelineCard {
  name: string;
  introAprMonths: number | null; // null for charge cards
  isChargeCard?: boolean;
}

interface TimelineRound {
  round: number;
  label: string;
  cards: TimelineCard[];
  waitDays: number | null;
}

export interface AprExpiryTimelineProps {
  rounds: Array<{
    round: number;
    label: string;
    cards: Array<{
      name: string;
      introAprMonths: number | null;
      isChargeCard?: boolean;
    }>;
    waitDays: number | null;
  }>;
}

// ── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
  bg: '#0F1729',
  surface: '#1B2A4A',
  surfaceLight: '#243556',
  border: '#2D3F5E',
  text: '#E2E8F0',
  textMuted: '#94A3B8',
  textDim: '#64748B',
  white: '#FFFFFF',
  gold: '#C9A84C',
  goldDim: '#8D6C22',
  green: '#10B981',
  greenDim: '#065F46',
  amber: '#F59E0B',
  amberDim: '#92400E',
  red: '#EF4444',
  redDim: '#991B1B',
  blue: '#3B82F6',
  blueDim: '#1E3A5F',
  purple: '#8B5CF6',
  coral: '#FF6B6B',
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Returns a color based on how many intro APR months remain. */
function urgencyColor(months: number | null): { bar: string; text: string } {
  if (months === null) return { bar: COLORS.textDim, text: COLORS.textMuted };
  if (months <= 6) return { bar: COLORS.red, text: COLORS.coral };
  if (months <= 12) return { bar: COLORS.amber, text: COLORS.amber };
  if (months <= 15) return { bar: COLORS.blue, text: COLORS.blue };
  return { bar: COLORS.green, text: COLORS.green };
}

// ── Placeholder Data ────────────────────────────────────────────────────────

const PLACEHOLDER_ROUNDS: TimelineRound[] = [
  {
    round: 1,
    label: 'Foundation Round',
    cards: [
      { name: 'Chase Ink Business Unlimited', introAprMonths: 12 },
      { name: 'Amex Blue Business Plus', introAprMonths: 12 },
    ],
    waitDays: 90,
  },
  {
    round: 2,
    label: 'Growth Round',
    cards: [
      { name: 'Capital One Spark Cash Plus', introAprMonths: null, isChargeCard: true },
      { name: 'US Bank Business Triple Cash', introAprMonths: 15 },
    ],
    waitDays: 91,
  },
  {
    round: 3,
    label: 'Expansion Round',
    cards: [
      { name: 'Chase Ink Business Cash', introAprMonths: 12 },
      { name: 'Amex Business Gold', introAprMonths: null, isChargeCard: true },
    ],
    waitDays: null,
  },
];

// ── Sub-components ──────────────────────────────────────────────────────────

interface CardBarProps {
  card: TimelineCard;
  applicationDate: Date;
  maxMonths: number;
}

function CardBar({ card, applicationDate, maxMonths }: CardBarProps) {
  const isCharge = card.isChargeCard || card.introAprMonths === null;
  const months = card.introAprMonths ?? 0;
  const widthPercent = maxMonths > 0 ? Math.min((months / maxMonths) * 100, 100) : 0;
  const colors = urgencyColor(card.introAprMonths);
  const expiryDate = months > 0 ? addMonths(applicationDate, months) : null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: COLORS.text,
            fontWeight: 500,
            minWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {card.name}
        </span>
      </div>

      {isCharge ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 4,
          }}
        >
          <div
            style={{
              height: 20,
              width: 120,
              borderRadius: 4,
              border: `1px dashed ${COLORS.textDim}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' }}>
              No Intro APR
            </span>
          </div>
          <span style={{ fontSize: 11, color: COLORS.textDim }}>Charge card — pay in full monthly</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              flex: 1,
              maxWidth: '70%',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: 20,
                width: '100%',
                borderRadius: 4,
                backgroundColor: COLORS.surfaceLight,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${widthPercent}%`,
                  borderRadius: 4,
                  background: `linear-gradient(90deg, ${colors.bar}CC, ${colors.bar}88)`,
                  transition: 'width 0.3s ease',
                  minWidth: widthPercent > 0 ? 40 : 0,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8,
                }}
              >
                <span style={{ fontSize: 11, color: COLORS.white, fontWeight: 600 }}>
                  {months}mo
                </span>
              </div>
            </div>
          </div>
          <span style={{ fontSize: 11, color: colors.text, fontWeight: 500, whiteSpace: 'nowrap' }}>
            Expires {expiryDate ? formatMonthYear(expiryDate) : '—'}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function AprExpiryTimeline({ rounds }: AprExpiryTimelineProps) {
  const data = rounds.length > 0 ? rounds : PLACEHOLDER_ROUNDS;

  const { timeline, actionDates, maxMonths } = useMemo(() => {
    const today = new Date();
    let cursor = new Date(today);
    let globalMax = 0;

    // First pass: find max intro APR months for bar scaling
    for (const round of data) {
      for (const card of round.cards) {
        if (card.introAprMonths && card.introAprMonths > globalMax) {
          globalMax = card.introAprMonths;
        }
      }
    }

    // Second pass: compute dates
    const entries: Array<{
      round: typeof data[0];
      applicationDate: Date;
      waitUntil: Date | null;
    }> = [];

    const actions: Array<{
      cardName: string;
      roundLabel: string;
      actionDate: Date;
      expiryDate: Date;
      months: number;
    }> = [];

    for (const round of data) {
      const appDate = new Date(cursor);
      let waitUntil: Date | null = null;

      for (const card of round.cards) {
        if (card.introAprMonths && !card.isChargeCard) {
          const expiry = addMonths(appDate, card.introAprMonths);
          // Action required 1 month before expiry
          const actionDate = addMonths(expiry, -1);
          actions.push({
            cardName: card.name,
            roundLabel: round.label,
            actionDate,
            expiryDate: expiry,
            months: card.introAprMonths,
          });
        }
      }

      if (round.waitDays !== null) {
        waitUntil = addDays(appDate, round.waitDays);
        cursor = new Date(waitUntil);
      }

      entries.push({ round, applicationDate: appDate, waitUntil });
    }

    // Sort actions by date
    actions.sort((a, b) => a.actionDate.getTime() - b.actionDate.getTime());

    return { timeline: entries, actionDates: actions, maxMonths: globalMax };
  }, [data]);

  return (
    <div
      style={{
        backgroundColor: COLORS.bg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 24,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: COLORS.gold,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          APR Expiry Timeline
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.textMuted }}>
          Gantt view of intro APR windows per funding round
        </p>
      </div>

      {/* ── Timeline Rounds ────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {timeline.map((entry, idx) => (
          <React.Fragment key={entry.round.round}>
            {/* Round block */}
            <div
              style={{
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: 16,
              }}
            >
              {/* Round header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    backgroundColor: COLORS.gold,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    color: COLORS.bg,
                    flexShrink: 0,
                  }}
                >
                  {entry.round.round}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>
                    {formatMonthYear(entry.applicationDate)}: Round {entry.round.round} applies
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                    {entry.round.label} &mdash;{' '}
                    {entry.round.cards.map((c) => c.name).join(' + ')}
                  </div>
                </div>
              </div>

              {/* Card bars */}
              <div style={{ paddingLeft: 40 }}>
                {entry.round.cards.map((card) => (
                  <CardBar
                    key={card.name}
                    card={card}
                    applicationDate={entry.applicationDate}
                    maxMonths={maxMonths}
                  />
                ))}
              </div>
            </div>

            {/* Wait period connector */}
            {entry.waitUntil && idx < timeline.length - 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0 4px 36px',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    maxWidth: 200,
                    height: 0,
                    borderTop: `2px dashed ${COLORS.textDim}`,
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: COLORS.textMuted,
                    fontWeight: 600,
                    backgroundColor: COLORS.bg,
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: `1px solid ${COLORS.border}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Wait {entry.round.waitDays}d
                </span>
                <div
                  style={{
                    flex: 1,
                    maxWidth: 200,
                    height: 0,
                    borderTop: `2px dashed ${COLORS.textDim}`,
                  }}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* ── APR Action Required Dates ──────────────────────────── */}
      {actionDates.length > 0 && (
        <div
          style={{
            marginTop: 20,
            backgroundColor: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: 16,
          }}
        >
          <h4
            style={{
              margin: '0 0 12px',
              fontSize: 13,
              fontWeight: 700,
              color: COLORS.coral,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            APR Action Required Dates
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {actionDates.map((action, i) => {
              const colors = urgencyColor(action.months);
              return (
                <div
                  key={`${action.cardName}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 12px',
                    borderRadius: 6,
                    backgroundColor: COLORS.surfaceLight,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: colors.bar,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: COLORS.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {action.cardName}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                      {action.roundLabel}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>
                      Begin repayment by {formatFullDate(action.actionDate)}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textDim }}>
                      APR expires {formatFullDate(action.expiryDate)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          fontSize: 11,
          color: COLORS.textMuted,
        }}
      >
        {[
          { label: '> 15 mo', color: COLORS.green },
          { label: '12-15 mo', color: COLORS.blue },
          { label: '7-12 mo', color: COLORS.amber },
          { label: '<= 6 mo', color: COLORS.red },
        ].map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                backgroundColor: item.color,
              }}
            />
            <span>{item.label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              border: `1px dashed ${COLORS.textDim}`,
            }}
          />
          <span>Charge card (no intro APR)</span>
        </div>
      </div>
    </div>
  );
}
