import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BureauScore {
  bureau: 'FICO' | 'SBSS';
  score: number;
  maxScore: number;
  label: string;
  change: number; // pts change since last pull
}

interface CardUtilization {
  id: string;
  name: string;
  balance: number;
  limit: number;
}

interface CreditData {
  bureauScores: BureauScore[];
  cardUtilization: CardUtilization[];
  hardInquiries: number;
  softInquiries: number;
  lastUpdated: string;
  tips: string[];
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CREDIT: CreditData = {
  bureauScores: [
    { bureau: 'FICO', score: 742, maxScore: 850, label: 'Very Good', change: +8 },
    { bureau: 'SBSS', score: 185, maxScore: 300, label: 'Good', change: +3 },
  ],
  cardUtilization: [
    { id: '1', name: 'Chase Ink Business', balance: 4200, limit: 15000 },
    { id: '2', name: 'Amex Blue Business', balance: 8750, limit: 20000 },
    { id: '3', name: 'Capital One Spark', balance: 1100, limit: 10000 },
  ],
  hardInquiries: 3,
  softInquiries: 8,
  lastUpdated: '2026-03-30',
  tips: [
    'Pay down Chase Ink balance below 28% ($4,200) to boost FICO by ~15 pts.',
    'Keep Amex utilization under 30% ($6,000) — currently at 44%.',
    'Hard inquiries drop off after 24 months. Next removal: June 2026.',
    'Maintaining on-time payments builds SBSS score for SBA loan eligibility.',
  ],
};

// ─── Circular Score Gauge ─────────────────────────────────────────────────────

function ScoreGauge({ bureau, score, maxScore, label, change }: BureauScore) {
  const pct = score / maxScore;
  const scoreColor =
    pct >= 0.8 ? Colors.success :
    pct >= 0.65 ? Colors.gold :
    pct >= 0.5 ? Colors.warning : Colors.error;

  // Approximate arc using a bordered circle — no SVG dependency
  const size = 110;
  const half = size / 2;
  const strokeWidth = 10;

  return (
    <View style={styles.gaugeCard}>
      {/* Visual gauge ring using layered Views */}
      <View style={[styles.gaugeOuter, { width: size, height: size, borderRadius: half }]}>
        <View
          style={[
            styles.gaugeTrack,
            { width: size, height: size, borderRadius: half, borderColor: Colors.gray200, borderWidth: strokeWidth },
          ]}
        />
        {/* Progress arc approximated by gold arc overlay */}
        <View
          style={[
            styles.gaugeProgress,
            {
              width: size,
              height: size,
              borderRadius: half,
              borderColor: scoreColor,
              borderWidth: strokeWidth,
              // Clip top-right via border-specific coloring
              borderTopColor: pct >= 0.25 ? scoreColor : Colors.gray200,
              borderRightColor: pct >= 0.5 ? scoreColor : Colors.gray200,
              borderBottomColor: pct >= 0.75 ? scoreColor : Colors.gray200,
              borderLeftColor: pct >= 1.0 ? scoreColor : Colors.gray200,
            },
          ]}
        />
        <View style={styles.gaugeCenter}>
          <Text style={[styles.gaugeScore, { color: scoreColor }]}>{score}</Text>
          <Text style={styles.gaugeBureau}>{bureau}</Text>
        </View>
      </View>

      <Text style={styles.gaugeLabel}>{label}</Text>
      <Text style={[styles.gaugeChange, { color: change >= 0 ? Colors.success : Colors.error }]}>
        {change >= 0 ? '↑' : '↓'} {Math.abs(change)} pts
      </Text>
      <Text style={styles.gaugeMax}>out of {maxScore}</Text>
    </View>
  );
}

// ─── Utilization Bar ──────────────────────────────────────────────────────────

function UtilizationRow({ name, balance, limit }: CardUtilization) {
  const pct = balance / limit;
  const barColor =
    pct <= 0.3 ? Colors.success :
    pct <= 0.5 ? Colors.warning : Colors.error;

  return (
    <View style={styles.utilRow}>
      <View style={styles.utilHeader}>
        <Text style={styles.utilName} numberOfLines={1}>{name}</Text>
        <Text style={styles.utilAmount}>
          ${balance.toLocaleString()} / ${limit.toLocaleString()}
        </Text>
      </View>
      <View style={styles.utilTrack}>
        <View style={[styles.utilFill, { width: `${Math.min(pct * 100, 100)}%` as any, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.utilPct, { color: barColor }]}>{Math.round(pct * 100)}% utilized</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CreditDashboardScreen() {
  const { data, isLoading, refetch } = useQuery<CreditData>({
    queryKey: ['client', 'credit'],
    queryFn: async () => {
      // Replace with real endpoint: GET /client/credit-profile
      return MOCK_CREDIT;
    },
    placeholderData: MOCK_CREDIT,
  });

  const credit = data ?? MOCK_CREDIT;
  const overallUtilPct = credit.cardUtilization.reduce(
    (acc, c) => acc + c.balance, 0
  ) / credit.cardUtilization.reduce((acc, c) => acc + c.limit, 0);

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
        <Text style={styles.headerTitle}>Your Credit Profile</Text>
        <Text style={styles.headerSub}>Last updated {credit.lastUpdated}</Text>
      </View>

      {/* Bureau Score Gauges */}
      <Text style={styles.sectionTitle}>Bureau Scores</Text>
      {isLoading && !data ? (
        <ActivityIndicator color={Colors.gold} style={{ padding: Spacing[6] }} />
      ) : (
        <View style={styles.gaugeRow}>
          {credit.bureauScores.map((b) => (
            <ScoreGauge key={b.bureau} {...b} />
          ))}
        </View>
      )}

      {/* Inquiry Summary */}
      <Text style={styles.sectionTitle}>Inquiries</Text>
      <View style={styles.inquiryCard}>
        <View style={styles.inquiryItem}>
          <Text style={styles.inquiryCount}>{credit.hardInquiries}</Text>
          <Text style={styles.inquiryLabel}>Hard Inquiries</Text>
          <Text style={styles.inquiryNote}>Affect score for 24 mo</Text>
        </View>
        <View style={styles.inquiryDivider} />
        <View style={styles.inquiryItem}>
          <Text style={[styles.inquiryCount, { color: Colors.gray600 }]}>{credit.softInquiries}</Text>
          <Text style={styles.inquiryLabel}>Soft Inquiries</Text>
          <Text style={styles.inquiryNote}>No score impact</Text>
        </View>
      </View>

      {/* Card Utilization */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Card Utilization</Text>
        <View style={[
          styles.overallBadge,
          { backgroundColor: overallUtilPct <= 0.3 ? Colors.successLight : overallUtilPct <= 0.5 ? Colors.warningLight : Colors.errorLight },
        ]}>
          <Text style={[
            styles.overallBadgeText,
            { color: overallUtilPct <= 0.3 ? Colors.success : overallUtilPct <= 0.5 ? Colors.warning : Colors.error },
          ]}>
            {Math.round(overallUtilPct * 100)}% overall
          </Text>
        </View>
      </View>
      <View style={styles.utilCard}>
        {credit.cardUtilization.map((c, idx) => (
          <React.Fragment key={c.id}>
            <UtilizationRow {...c} />
            {idx < credit.cardUtilization.length - 1 && <View style={styles.divider} />}
          </React.Fragment>
        ))}
      </View>

      {/* Optimization Tips */}
      <Text style={styles.sectionTitle}>Optimization Tips</Text>
      <View style={styles.tipsCard}>
        {credit.tips.map((tip, idx) => (
          <View key={idx} style={styles.tipRow}>
            <View style={styles.tipBullet}>
              <Text style={styles.tipBulletText}>{idx + 1}</Text>
            </View>
            <Text style={styles.tipText}>{tip}</Text>
          </View>
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
  headerTitle: {
    fontSize: Typography['2xl'],
    fontWeight: '800',
    color: Colors.white,
  },
  headerSub: {
    fontSize: Typography.sm,
    color: Colors.goldLight,
    marginTop: 4,
  },

  sectionTitle: {
    fontSize: Typography.md,
    fontWeight: '700',
    color: Colors.navy,
    marginBottom: Spacing[3],
    marginTop: Spacing[2],
    paddingHorizontal: Spacing[4],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[3],
    marginTop: Spacing[2],
  },

  // Gauges
  gaugeRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[4],
    justifyContent: 'center',
  },
  gaugeCard: {
    flex: 1,
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing[4],
    alignItems: 'center',
    ...Shadow.md,
  },
  gaugeOuter: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[3] },
  gaugeTrack: { position: 'absolute' },
  gaugeProgress: { position: 'absolute' },
  gaugeCenter: { alignItems: 'center', justifyContent: 'center' },
  gaugeScore: { fontSize: Typography['2xl'], fontWeight: '800' },
  gaugeBureau: { fontSize: Typography.xs, fontWeight: '700', color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5 },
  gaugeLabel: { fontSize: Typography.sm, fontWeight: '600', color: Colors.navy },
  gaugeChange: { fontSize: Typography.xs, fontWeight: '700', marginTop: 2 },
  gaugeMax: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 1 },

  // Inquiries
  inquiryCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[4],
    overflow: 'hidden',
    ...Shadow.sm,
  },
  inquiryItem: { flex: 1, alignItems: 'center', padding: Spacing[4] },
  inquiryDivider: { width: 1, backgroundColor: Colors.gray100 },
  inquiryCount: { fontSize: Typography['3xl'], fontWeight: '800', color: Colors.navy },
  inquiryLabel: { fontSize: Typography.xs, fontWeight: '700', color: Colors.gray600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  inquiryNote: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 4, textAlign: 'center' },

  // Utilization
  overallBadge: {
    paddingHorizontal: Spacing[3],
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  overallBadgeText: { fontSize: Typography.xs, fontWeight: '700' },
  utilCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[4],
    overflow: 'hidden',
    ...Shadow.sm,
  },
  utilRow: { padding: Spacing[4] },
  utilHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing[2] },
  utilName: { fontSize: Typography.sm, fontWeight: '600', color: Colors.navy, flex: 1 },
  utilAmount: { fontSize: Typography.xs, color: Colors.gray500, marginLeft: Spacing[2] },
  utilTrack: {
    height: 8,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: 6,
  },
  utilFill: { height: '100%', borderRadius: BorderRadius.full },
  utilPct: { fontSize: Typography.xs, fontWeight: '600' },
  divider: { height: 1, backgroundColor: Colors.gray100, marginHorizontal: Spacing[4] },

  // Tips
  tipsCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing[4],
    padding: Spacing[4],
    gap: Spacing[3],
    ...Shadow.sm,
  },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  tipBullet: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  tipBulletText: { fontSize: Typography.xs, fontWeight: '800', color: Colors.gold },
  tipText: { fontSize: Typography.sm, color: Colors.gray700, flex: 1, lineHeight: 20 },
});
