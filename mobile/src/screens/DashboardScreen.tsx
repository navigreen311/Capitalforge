import React from 'react';
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
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../lib/theme';
import { dashboardApi } from '../lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPI {
  label: string;
  value: string | number;
  delta?: string;
  deltaPositive?: boolean;
  accent?: string;
}

interface ActivityItem {
  id: string;
  type: 'approval' | 'payment' | 'compliance' | 'application' | 'alert';
  title: string;
  subtitle: string;
  timestamp: string;
}

// ─── Mock fallback data ───────────────────────────────────────────────────────

const MOCK_KPIS = {
  activeClients: 142,
  pendingApplications: 23,
  totalFundingDeployed: 8_400_000,
  complianceScore: 94,
};

const MOCK_ACTIVITY: ActivityItem[] = [
  { id: '1', type: 'approval', title: 'Meridian Logistics — Approved', subtitle: '$250,000 SBA 7(a)', timestamp: '2 min ago' },
  { id: '2', type: 'payment', title: 'BlueCrest Holdings — Payment Due', subtitle: '$18,400 due in 3 days', timestamp: '1 hr ago' },
  { id: '3', type: 'compliance', title: 'Vantage Capital — KYB Required', subtitle: '2 documents pending', timestamp: '3 hrs ago' },
  { id: '4', type: 'application', title: 'Apex Retail — Application Submitted', subtitle: 'Equipment financing $75k', timestamp: 'Yesterday' },
  { id: '5', type: 'alert', title: 'APR Rate Change Alert', subtitle: '3 clients affected by rate update', timestamp: 'Yesterday' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({ label, value, delta, deltaPositive, accent }: KPI) {
  return (
    <View style={[styles.kpiCard, { borderTopColor: accent ?? Colors.gold }]}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {delta && (
        <Text style={[styles.kpiDelta, { color: deltaPositive ? Colors.success : Colors.error }]}>
          {deltaPositive ? '↑' : '↓'} {delta}
        </Text>
      )}
    </View>
  );
}

const ACTIVITY_ICON: Record<ActivityItem['type'], string> = {
  approval: '✓',
  payment: '$',
  compliance: '!',
  application: '≡',
  alert: '◉',
};

const ACTIVITY_COLOR: Record<ActivityItem['type'], string> = {
  approval: Colors.success,
  payment: Colors.warning,
  compliance: Colors.error,
  application: Colors.info,
  alert: Colors.gold,
};

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: ACTIVITY_COLOR[item.type] + '20' }]}>
        <Text style={[styles.activityIconText, { color: ACTIVITY_COLOR[item.type] }]}>
          {ACTIVITY_ICON[item.type]}
        </Text>
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.activitySubtitle} numberOfLines={1}>{item.subtitle}</Text>
      </View>
      <Text style={styles.activityTime}>{item.timestamp}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { data: kpiData, isLoading: kpiLoading, refetch: refetchKpis } = useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: () => dashboardApi.kpis(),
    placeholderData: { data: MOCK_KPIS } as any,
  });

  const { data: activityData, isLoading: activityLoading, refetch: refetchActivity } = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => dashboardApi.recentActivity(),
    placeholderData: { data: MOCK_ACTIVITY } as any,
  });

  const kpis = (kpiData?.data as typeof MOCK_KPIS) ?? MOCK_KPIS;
  const activity = (activityData?.data as ActivityItem[]) ?? MOCK_ACTIVITY;
  const refreshing = kpiLoading || activityLoading;

  const kpiCards: KPI[] = [
    {
      label: 'Active Clients',
      value: kpis.activeClients.toLocaleString(),
      delta: '8 this month',
      deltaPositive: true,
      accent: Colors.gold,
    },
    {
      label: 'Pending Apps',
      value: kpis.pendingApplications,
      delta: '5 need review',
      deltaPositive: false,
      accent: Colors.warning,
    },
    {
      label: 'Total Funding',
      value: `$${(kpis.totalFundingDeployed / 1_000_000).toFixed(1)}M`,
      delta: '+$1.2M MTD',
      deltaPositive: true,
      accent: Colors.success,
    },
    {
      label: 'Compliance',
      value: `${kpis.complianceScore}%`,
      delta: '+2 pts',
      deltaPositive: true,
      accent: Colors.info,
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { refetchKpis(); refetchActivity(); }}
          tintColor={Colors.gold}
        />
      }
    >
      {/* KPI Grid */}
      <Text style={styles.sectionTitle}>Today's Overview</Text>
      <View style={styles.kpiGrid}>
        {kpiCards.map((k) => (
          <KPICard key={k.label} {...k} />
        ))}
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickActions}>
        {[
          { label: 'New Client', icon: '+' },
          { label: 'Capture Doc', icon: '◎' },
          { label: 'Run Report', icon: '≡' },
          { label: 'Send Alert', icon: '◉' },
        ].map(({ label, icon }) => (
          <TouchableOpacity key={label} style={styles.quickActionChip} activeOpacity={0.75}>
            <Text style={styles.quickActionIcon}>{icon}</Text>
            <Text style={styles.quickActionLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Recent Activity */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <TouchableOpacity>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.activityCard}>
        {activityLoading && activity.length === 0 ? (
          <ActivityIndicator color={Colors.gold} style={{ padding: Spacing[6] }} />
        ) : (
          activity.map((item, idx) => (
            <React.Fragment key={item.id}>
              <ActivityRow item={item} />
              {idx < activity.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundPrimary },
  content: { padding: Spacing[4], paddingBottom: Spacing[8] },

  sectionTitle: {
    fontSize: Typography.md,
    fontWeight: '700',
    color: Colors.navy,
    marginBottom: Spacing[3],
    marginTop: Spacing[2],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[3],
    marginTop: Spacing[2],
  },
  seeAll: {
    fontSize: Typography.sm,
    color: Colors.gold,
    fontWeight: '600',
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  kpiCard: {
    width: '47%',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    borderTopWidth: 3,
    ...Shadow.md,
  },
  kpiValue: {
    fontSize: Typography['2xl'],
    fontWeight: '800',
    color: Colors.navy,
  },
  kpiLabel: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    marginTop: 2,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiDelta: {
    fontSize: Typography.xs,
    marginTop: Spacing[1],
    fontWeight: '600',
  },

  // Quick Actions
  quickActions: { marginBottom: Spacing[4] },
  quickActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.navy,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    marginRight: Spacing[2],
    gap: 6,
  },
  quickActionIcon: { fontSize: 14, color: Colors.gold },
  quickActionLabel: { fontSize: Typography.sm, color: Colors.white, fontWeight: '600' },

  // Activity
  activityCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[4],
  },
  activityIcon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing[3],
  },
  activityIconText: { fontSize: 14, fontWeight: '700' },
  activityContent: { flex: 1 },
  activityTitle: { fontSize: Typography.sm, fontWeight: '600', color: Colors.gray800 },
  activitySubtitle: { fontSize: Typography.xs, color: Colors.gray500, marginTop: 2 },
  activityTime: { fontSize: Typography.xs, color: Colors.gray400, marginLeft: Spacing[2] },
  divider: { height: 1, backgroundColor: Colors.gray100, marginHorizontal: Spacing[4] },
});
