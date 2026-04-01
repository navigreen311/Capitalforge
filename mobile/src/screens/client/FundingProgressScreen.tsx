import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type CardStatus = 'approved' | 'pending' | 'declined' | 'not_started';

interface FundingCard {
  id: string;
  name: string;
  creditLimit: number;
  status: CardStatus;
  aprExpiryDate?: string;
  apr: number;
}

interface NextStep {
  id: string;
  title: string;
  description: string;
  actionLabel?: string;
  completed: boolean;
}

interface FundingProgressData {
  targetCreditLimit: number;
  obtainedCreditLimit: number;
  cards: FundingCard[];
  aprExpiryTimeline: Array<{ date: string; lender: string; daysUntil: number }>;
  nextSteps: NextStep[];
  roundLabel: string;
  fundingObjective: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_FUNDING: FundingProgressData = {
  roundLabel: 'Round 1 — Initial Stack',
  fundingObjective: 'Business Credit Stack — $150,000 target',
  targetCreditLimit: 150_000,
  obtainedCreditLimit: 87_500,
  cards: [
    { id: 'c1', name: 'Chase Ink Business Preferred', creditLimit: 25_000, status: 'approved', aprExpiryDate: '2026-09-01', apr: 0.0 },
    { id: 'c2', name: 'Amex Blue Business Plus',     creditLimit: 20_000, status: 'approved', aprExpiryDate: '2026-07-15', apr: 0.0 },
    { id: 'c3', name: 'Capital One Spark Cash',      creditLimit: 15_000, status: 'approved', apr: 24.99 },
    { id: 'c4', name: 'Wells Fargo Business Secured',creditLimit: 15_000, status: 'approved', apr: 21.99 },
    { id: 'c5', name: 'Bank of America Business',    creditLimit: 12_500, status: 'approved', apr: 23.49 },
    { id: 'c6', name: 'US Bank Business Platinum',   creditLimit: 20_000, status: 'pending',  apr: 0.0 },
    { id: 'c7', name: 'Citi Business AAdvantage',    creditLimit: 15_000, status: 'pending',  apr: 0.0 },
    { id: 'c8', name: 'Discover Business Card',      creditLimit: 15_000, status: 'not_started', apr: 0.0 },
    { id: 'c9', name: 'TD Business Solutions',       creditLimit: 12_500, status: 'not_started', apr: 0.0 },
  ],
  aprExpiryTimeline: [
    { date: '2026-04-30', lender: 'Chase Ink Business',  daysUntil: 30 },
    { date: '2026-06-15', lender: 'Amex Blue Business',  daysUntil: 76 },
    { date: '2026-09-01', lender: 'Capital One Spark',   daysUntil: 154 },
  ],
  nextSteps: [
    { id: 's1', title: 'Complete KYB Verification',       description: 'Upload remaining beneficial ownership documents.',              actionLabel: 'Upload Docs', completed: true },
    { id: 's2', title: 'Apply for US Bank Business Platinum', description: 'Pre-approval detected. Apply now to secure the $20k limit.', actionLabel: 'Apply Now',  completed: false },
    { id: 's3', title: 'Apply for Citi Business AAdvantage',  description: 'Target 750+ FICO before applying — currently at 742.',                               completed: false },
    { id: 's4', title: 'Pay Down Amex Utilization',        description: 'Bring Amex balance below 30% ($6,000) to improve approval odds.',                       completed: false },
    { id: 's5', title: 'Initiate Round 2 Applications',   description: 'Once SBSS reaches 200+, begin SBA loan pre-qualification.',                              completed: false },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CARD_STATUS_COLOR: Record<CardStatus, string> = {
  approved:    Colors.success,
  pending:     Colors.warning,
  declined:    Colors.error,
  not_started: Colors.gray400,
};

const CARD_STATUS_BG: Record<CardStatus, string> = {
  approved:    Colors.successLight,
  pending:     Colors.warningLight,
  declined:    Colors.errorLight,
  not_started: Colors.gray100,
};

const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  approved:    'Approved',
  pending:     'Pending',
  declined:    'Declined',
  not_started: 'Not Started',
};

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CreditLimitBar({ obtained, target }: { obtained: number; target: number }) {
  const pct = Math.min(obtained / target, 1);
  return (
    <View style={styles.limitBarWrap}>
      <View style={styles.limitBarTrack}>
        <View style={[styles.limitBarFill, { width: `${pct * 100}%` as any }]} />
      </View>
      <View style={styles.limitLabels}>
        <Text style={styles.limitObtained}>{formatCurrency(obtained)} obtained</Text>
        <Text style={styles.limitTarget}>{formatCurrency(target)} target</Text>
      </View>
      <Text style={styles.limitPct}>{Math.round(pct * 100)}% of target reached</Text>
    </View>
  );
}

function CardRow({ card }: { card: FundingCard }) {
  const aprNote = card.status === 'approved' && card.apr === 0 && card.aprExpiryDate
    ? `· 0% APR exp ${card.aprExpiryDate}`
    : card.status === 'approved' && card.apr > 0
    ? `· ${card.apr}% APR`
    : '';

  return (
    <View style={styles.cardRow}>
      <View style={[styles.cardStatusDot, { backgroundColor: CARD_STATUS_COLOR[card.status] }]} />
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{card.name}</Text>
        <Text style={styles.cardLimit}>
          {card.status === 'approved' ? formatCurrency(card.creditLimit) : '—'}{' '}
          {aprNote}
        </Text>
      </View>
      <View style={[styles.cardStatusBadge, { backgroundColor: CARD_STATUS_BG[card.status] }]}>
        <Text style={[styles.cardStatusText, { color: CARD_STATUS_COLOR[card.status] }]}>
          {CARD_STATUS_LABEL[card.status]}
        </Text>
      </View>
    </View>
  );
}

function AprTimelineRow({ date, lender, daysUntil }: FundingProgressData['aprExpiryTimeline'][0]) {
  const urgent = daysUntil <= 30;
  return (
    <View style={styles.timelineRow}>
      <View style={[styles.timelineDot, { backgroundColor: urgent ? Colors.error : Colors.warning }]} />
      <View style={styles.timelineContent}>
        <Text style={styles.timelineLender}>{lender}</Text>
        <Text style={styles.timelineDate}>{date} · {daysUntil > 0 ? `${daysUntil} days` : 'Expired'}</Text>
      </View>
      {urgent && (
        <View style={styles.timelineUrgentBadge}>
          <Text style={styles.timelineUrgentText}>Urgent</Text>
        </View>
      )}
    </View>
  );
}

function NextStepRow({ step }: { step: NextStep }) {
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepCheck, step.completed && styles.stepCheckDone]}>
        {step.completed && <Text style={styles.stepCheckIcon}>✓</Text>}
      </View>
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, step.completed && styles.stepTitleDone]}>
          {step.title}
        </Text>
        <Text style={styles.stepDesc}>{step.description}</Text>
        {step.actionLabel && !step.completed && (
          <TouchableOpacity style={styles.stepAction} activeOpacity={0.75}>
            <Text style={styles.stepActionText}>{step.actionLabel} →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FundingProgressScreen() {
  const { data, isLoading, refetch } = useQuery<FundingProgressData>({
    queryKey: ['client', 'funding-progress'],
    queryFn: async () => MOCK_FUNDING,
    placeholderData: MOCK_FUNDING,
  });

  const funding = data ?? MOCK_FUNDING;

  const approvedCards  = funding.cards.filter(c => c.status === 'approved');
  const pendingCards   = funding.cards.filter(c => c.status === 'pending');
  const remainingCards = funding.cards.filter(c => c.status === 'not_started' || c.status === 'declined');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.gold} />
      }
    >
      {/* Header band */}
      <View style={styles.headerBand}>
        <Text style={styles.headerRound}>{funding.roundLabel}</Text>
        <Text style={styles.headerObjective}>{funding.fundingObjective}</Text>
      </View>

      {/* KPI Row */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, { borderTopColor: Colors.success }]}>
          <Text style={styles.kpiValue}>{approvedCards.length}</Text>
          <Text style={styles.kpiLabel}>Cards{'\n'}Approved</Text>
        </View>
        <View style={[styles.kpiCard, { borderTopColor: Colors.warning }]}>
          <Text style={styles.kpiValue}>{pendingCards.length}</Text>
          <Text style={styles.kpiLabel}>Pending{'\n'}Review</Text>
        </View>
        <View style={[styles.kpiCard, { borderTopColor: Colors.gray300 }]}>
          <Text style={styles.kpiValue}>{remainingCards.length}</Text>
          <Text style={styles.kpiLabel}>Not Yet{'\n'}Started</Text>
        </View>
      </View>

      {/* Credit Limit Progress */}
      <Text style={styles.sectionTitle}>Credit Limit Progress</Text>
      <View style={styles.progressCard}>
        <CreditLimitBar
          obtained={funding.obtainedCreditLimit}
          target={funding.targetCreditLimit}
        />
      </View>

      {/* Card Status List */}
      <Text style={styles.sectionTitle}>Funding Cards</Text>
      <View style={styles.cardsCard}>
        {funding.cards.map((card, idx) => (
          <React.Fragment key={card.id}>
            <CardRow card={card} />
            {idx < funding.cards.length - 1 && <View style={styles.divider} />}
          </React.Fragment>
        ))}
      </View>

      {/* APR Expiry Timeline */}
      <Text style={styles.sectionTitle}>APR Expiry Timeline</Text>
      <View style={styles.timelineCard}>
        {funding.aprExpiryTimeline.map((item, idx) => (
          <AprTimelineRow key={idx} {...item} />
        ))}
      </View>

      {/* Next Steps */}
      <Text style={styles.sectionTitle}>Next Steps</Text>
      <View style={styles.stepsCard}>
        {funding.nextSteps.map((step, idx) => (
          <React.Fragment key={step.id}>
            <NextStepRow step={step} />
            {idx < funding.nextSteps.length - 1 && <View style={styles.divider} />}
          </React.Fragment>
        ))}
      </View>

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundPrimary },
  content: { paddingBottom: Spacing[10] },

  headerBand: {
    backgroundColor: Colors.navy,
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[5],
    paddingBottom: Spacing[6],
    marginBottom: Spacing[4],
  },
  headerRound: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerObjective: {
    fontSize: Typography.xl,
    fontWeight: '800',
    color: Colors.white,
  },

  sectionTitle: {
    fontSize: Typography.md,
    fontWeight: '700',
    color: Colors.navy,
    marginBottom: Spacing[3],
    marginTop: Spacing[2],
    paddingHorizontal: Spacing[4],
  },

  // KPI Row
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[4],
  },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing[3],
    borderTopWidth: 3,
    alignItems: 'center',
    ...Shadow.sm,
  },
  kpiValue: { fontSize: Typography['2xl'], fontWeight: '800', color: Colors.navy },
  kpiLabel: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
    textAlign: 'center',
  },

  // Credit limit bar
  progressCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing[5],
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[4],
    ...Shadow.md,
  },
  limitBarWrap: {},
  limitBarTrack: {
    height: 14,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: Spacing[2],
  },
  limitBarFill: { height: '100%', backgroundColor: Colors.gold, borderRadius: BorderRadius.full },
  limitLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  limitObtained: { fontSize: Typography.sm, fontWeight: '700', color: Colors.navy },
  limitTarget: { fontSize: Typography.sm, color: Colors.gray500 },
  limitPct: { fontSize: Typography.xs, color: Colors.gray500, fontWeight: '500' },

  // Cards list
  cardsCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[4],
    ...Shadow.sm,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[3],
    gap: Spacing[3],
  },
  cardStatusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: Typography.sm, fontWeight: '600', color: Colors.navy },
  cardLimit: { fontSize: Typography.xs, color: Colors.gray500, marginTop: 2 },
  cardStatusBadge: { paddingHorizontal: Spacing[2], paddingVertical: 3, borderRadius: BorderRadius.full },
  cardStatusText: { fontSize: Typography.xs, fontWeight: '700' },
  divider: { height: 1, backgroundColor: Colors.gray100, marginHorizontal: Spacing[3] },

  // APR Timeline
  timelineCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[4],
    gap: Spacing[3],
    ...Shadow.sm,
  },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  timelineDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  timelineContent: { flex: 1 },
  timelineLender: { fontSize: Typography.sm, fontWeight: '600', color: Colors.navy },
  timelineDate: { fontSize: Typography.xs, color: Colors.gray500, marginTop: 2 },
  timelineUrgentBadge: {
    backgroundColor: Colors.errorLight,
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  timelineUrgentText: { fontSize: Typography.xs, fontWeight: '700', color: Colors.error },

  // Next Steps
  stepsCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[4],
    ...Shadow.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing[4],
    gap: Spacing[3],
  },
  stepCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepCheckDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  stepCheckIcon: { fontSize: 12, fontWeight: '800', color: Colors.white },
  stepContent: { flex: 1 },
  stepTitle: { fontSize: Typography.sm, fontWeight: '700', color: Colors.navy },
  stepTitleDone: { color: Colors.gray400, textDecorationLine: 'line-through' },
  stepDesc: { fontSize: Typography.xs, color: Colors.gray500, marginTop: 3, lineHeight: 18 },
  stepAction: { marginTop: Spacing[2] },
  stepActionText: { fontSize: Typography.sm, fontWeight: '700', color: Colors.gold },
});
