import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Colors, Spacing, FontSizes, BorderRadius } from '../../lib/theme';

interface FundingRound {
  roundNumber: number;
  status: 'planning' | 'in_progress' | 'completed';
  targetCredit: number;
  obtainedCredit: number;
  cardsApproved: number;
  cardsTotal: number;
  aprExpiryDate: string | null;
  daysUntilExpiry: number | null;
}

interface NextStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}

const PLACEHOLDER_ROUNDS: FundingRound[] = [
  {
    roundNumber: 1,
    status: 'completed',
    targetCredit: 50000,
    obtainedCredit: 47500,
    cardsApproved: 4,
    cardsTotal: 5,
    aprExpiryDate: '2026-09-15',
    daysUntilExpiry: 168,
  },
  {
    roundNumber: 2,
    status: 'in_progress',
    targetCredit: 75000,
    obtainedCredit: 25000,
    cardsApproved: 2,
    cardsTotal: 6,
    aprExpiryDate: null,
    daysUntilExpiry: null,
  },
];

const PLACEHOLDER_STEPS: NextStep[] = [
  { id: '1', title: 'Complete Chase Ink application', description: 'Submit pending application for Round 2', completed: false },
  { id: '2', title: 'Review Capital One offer', description: 'Counteroffer received — accept or negotiate', completed: false },
  { id: '3', title: 'Set up autopay on Round 1 cards', description: 'Ensure all 4 approved cards have autopay enabled', completed: true },
  { id: '4', title: 'Monitor utilization', description: 'Keep below 30% across all cards before Round 2 apps', completed: true },
];

export default function FundingProgressScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const totalObtained = PLACEHOLDER_ROUNDS.reduce((s, r) => s + r.obtainedCredit, 0);
  const totalTarget = PLACEHOLDER_ROUNDS.reduce((s, r) => s + r.targetCredit, 0);
  const overallProgress = totalTarget > 0 ? totalObtained / totalTarget : 0;

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const getExpiryColor = (days: number | null) => {
    if (days === null) return Colors.gray[500];
    if (days <= 15) return Colors.status.error;
    if (days <= 30) return Colors.status.warning;
    if (days <= 60) return '#F59E0B';
    return Colors.status.success;
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold.DEFAULT} />}
    >
      {/* Overall Progress */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>Total Funding Obtained</Text>
        <Text style={styles.heroValue}>${totalObtained.toLocaleString()}</Text>
        <Text style={styles.heroSub}>of ${totalTarget.toLocaleString()} target</Text>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${Math.min(overallProgress * 100, 100)}%` }]} />
        </View>
        <Text style={styles.progressText}>{Math.round(overallProgress * 100)}% complete</Text>
      </View>

      {/* Rounds */}
      <Text style={styles.sectionTitle}>Funding Rounds</Text>
      {PLACEHOLDER_ROUNDS.map((round) => {
        const roundProgress = round.targetCredit > 0 ? round.obtainedCredit / round.targetCredit : 0;
        return (
          <View key={round.roundNumber} style={styles.roundCard}>
            <View style={styles.roundHeader}>
              <Text style={styles.roundTitle}>Round {round.roundNumber}</Text>
              <View style={[styles.statusBadge, {
                backgroundColor: round.status === 'completed' ? Colors.status.success + '20' :
                  round.status === 'in_progress' ? Colors.gold.DEFAULT + '20' : Colors.gray[700],
              }]}>
                <Text style={[styles.statusText, {
                  color: round.status === 'completed' ? Colors.status.success :
                    round.status === 'in_progress' ? Colors.gold.DEFAULT : Colors.gray[400],
                }]}>
                  {round.status === 'in_progress' ? 'In Progress' : round.status === 'completed' ? 'Completed' : 'Planning'}
                </Text>
              </View>
            </View>

            <View style={styles.roundStats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>${round.obtainedCredit.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Obtained</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{round.cardsApproved}/{round.cardsTotal}</Text>
                <Text style={styles.statLabel}>Cards Approved</Text>
              </View>
              {round.daysUntilExpiry !== null && (
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: getExpiryColor(round.daysUntilExpiry) }]}>
                    {round.daysUntilExpiry}d
                  </Text>
                  <Text style={styles.statLabel}>APR Expiry</Text>
                </View>
              )}
            </View>

            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${Math.min(roundProgress * 100, 100)}%` }]} />
            </View>
          </View>
        );
      })}

      {/* Next Steps */}
      <Text style={styles.sectionTitle}>Next Steps</Text>
      {PLACEHOLDER_STEPS.map((step) => (
        <View key={step.id} style={[styles.stepCard, step.completed && styles.stepCompleted]}>
          <View style={[styles.stepIndicator, step.completed && styles.stepIndicatorDone]}>
            <Text style={styles.stepCheck}>{step.completed ? '✓' : ''}</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, step.completed && styles.stepTitleDone]}>{step.title}</Text>
            <Text style={styles.stepDesc}>{step.description}</Text>
          </View>
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy.DEFAULT, padding: Spacing.md },
  heroCard: { backgroundColor: Colors.navy[800], borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.gold.DEFAULT + '30' },
  heroLabel: { color: Colors.gray[400], fontSize: FontSizes.sm, marginBottom: 4 },
  heroValue: { color: Colors.gold.DEFAULT, fontSize: 36, fontWeight: '700' },
  heroSub: { color: Colors.gray[400], fontSize: FontSizes.sm, marginBottom: Spacing.md },
  progressBarBg: { height: 8, backgroundColor: Colors.navy[700], borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Colors.gold.DEFAULT, borderRadius: 4 },
  progressText: { color: Colors.gray[300], fontSize: FontSizes.xs, marginTop: 6, textAlign: 'right' },
  sectionTitle: { color: Colors.gray[200], fontSize: FontSizes.lg, fontWeight: '600', marginBottom: Spacing.sm, marginTop: Spacing.md },
  roundCard: { backgroundColor: Colors.navy[800], borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.gray[700] },
  roundHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  roundTitle: { color: Colors.gray[100], fontSize: FontSizes.md, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: FontSizes.xs, fontWeight: '600' },
  roundStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: Spacing.sm },
  stat: { alignItems: 'center' },
  statValue: { color: Colors.gray[100], fontSize: FontSizes.lg, fontWeight: '700' },
  statLabel: { color: Colors.gray[500], fontSize: FontSizes.xs, marginTop: 2 },
  stepCard: { flexDirection: 'row', backgroundColor: Colors.navy[800], borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.xs, borderWidth: 1, borderColor: Colors.gray[700] },
  stepCompleted: { opacity: 0.6 },
  stepIndicator: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: Colors.gold.DEFAULT, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm },
  stepIndicatorDone: { backgroundColor: Colors.gold.DEFAULT + '30' },
  stepCheck: { color: Colors.gold.DEFAULT, fontSize: 14, fontWeight: '700' },
  stepContent: { flex: 1 },
  stepTitle: { color: Colors.gray[100], fontSize: FontSizes.sm, fontWeight: '600' },
  stepTitleDone: { textDecorationLine: 'line-through' },
  stepDesc: { color: Colors.gray[400], fontSize: FontSizes.xs, marginTop: 2 },
});
