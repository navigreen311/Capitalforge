import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ListRenderItem,
  Animated,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../lib/theme';
import { applicationsApi } from '../lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Application {
  id: string;
  clientName: string;
  productType: string;
  amount: number;
  status: 'pending' | 'in_review' | 'approved' | 'declined' | 'funded';
  submittedAt: string;
  lender?: string;
  advisor: string;
  notes?: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_APPLICATIONS: Application[] = [
  { id: '1', clientName: 'Meridian Logistics LLC', productType: 'SBA 7(a)', amount: 250000, status: 'pending', submittedAt: '2026-03-30', lender: 'First National Bank', advisor: 'J. Carter' },
  { id: '2', clientName: 'Apex Retail Group', productType: 'Equipment Financing', amount: 75000, status: 'in_review', submittedAt: '2026-03-29', lender: 'EquipFin Capital', advisor: 'J. Carter' },
  { id: '3', clientName: 'Summit Construction', productType: 'Line of Credit', amount: 500000, status: 'approved', submittedAt: '2026-03-25', lender: 'Commerce Bank', advisor: 'M. Reeves' },
  { id: '4', clientName: 'Nova Tech Solutions', productType: 'Venture Debt', amount: 1000000, status: 'pending', submittedAt: '2026-03-28', advisor: 'J. Carter' },
  { id: '5', clientName: 'Crestwood Dining', productType: 'MCA Bridge', amount: 45000, status: 'declined', submittedAt: '2026-03-20', lender: 'FastFund LLC', advisor: 'J. Carter' },
  { id: '6', clientName: 'BlueCrest Holdings', productType: 'CRE Bridge Loan', amount: 2100000, status: 'funded', submittedAt: '2026-03-15', lender: 'Westfield Capital', advisor: 'M. Reeves' },
  { id: '7', clientName: 'Pinnacle Health Services', productType: 'SBA 504', amount: 1800000, status: 'in_review', submittedAt: '2026-03-27', lender: 'US Bank', advisor: 'S. Lin' },
];

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Application['status'], { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: Colors.warningLight, text: Colors.statusPending },
  in_review: { label: 'In Review', bg: Colors.infoLight, text: Colors.statusReview },
  approved: { label: 'Approved', bg: Colors.successLight, text: Colors.statusApproved },
  declined: { label: 'Declined', bg: Colors.errorLight, text: Colors.statusDeclined },
  funded: { label: 'Funded', bg: '#E0F2E9', text: '#0D7A4A' },
};

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTER_TABS: Array<{ label: string; value: Application['status'] | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'In Review', value: 'in_review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Declined', value: 'declined' },
];

// ─── Application Card ─────────────────────────────────────────────────────────

function ApplicationCard({
  application,
  onApprove,
  onDecline,
}: {
  application: Application;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[application.status];
  const canAct = application.status === 'pending' || application.status === 'in_review';

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.clientName} numberOfLines={1}>{application.clientName}</Text>
          <Text style={styles.productType}>{application.productType}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Amount + Meta */}
      <View style={styles.cardMeta}>
        <View>
          <Text style={styles.metaLabel}>Amount</Text>
          <Text style={styles.metaValue}>
            ${application.amount >= 1_000_000
              ? `${(application.amount / 1_000_000).toFixed(1)}M`
              : `${(application.amount / 1000).toFixed(0)}k`}
          </Text>
        </View>
        {application.lender && (
          <View>
            <Text style={styles.metaLabel}>Lender</Text>
            <Text style={styles.metaValue} numberOfLines={1}>{application.lender}</Text>
          </View>
        )}
        <View>
          <Text style={styles.metaLabel}>Submitted</Text>
          <Text style={styles.metaValue}>{application.submittedAt}</Text>
        </View>
        <View>
          <Text style={styles.metaLabel}>Advisor</Text>
          <Text style={styles.metaValue}>{application.advisor}</Text>
        </View>
      </View>

      {/* Swipe Actions — rendered as buttons for accessibility */}
      {canAct && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.declineBtn]}
            onPress={() => onDecline(application.id)}
            activeOpacity={0.8}
          >
            <Text style={styles.actionBtnText}>✕ Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={() => onApprove(application.id)}
            activeOpacity={0.8}
          >
            <Text style={[styles.actionBtnText, { color: Colors.white }]}>✓ Approve</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PipelineScreen() {
  const [activeFilter, setActiveFilter] = useState<Application['status'] | 'all'>('all');
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['applications'],
    queryFn: () => applicationsApi.list(),
    placeholderData: { data: MOCK_APPLICATIONS } as any,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => applicationsApi.approve(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });

  const declineMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      applicationsApi.decline(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });

  const applications = (data?.data as Application[]) ?? MOCK_APPLICATIONS;

  const filtered = activeFilter === 'all'
    ? applications
    : applications.filter((a) => a.status === activeFilter);

  function handleApprove(id: string) {
    Alert.alert('Approve Application', 'Confirm approval for this application?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        style: 'default',
        onPress: () => approveMutation.mutate(id),
      },
    ]);
  }

  function handleDecline(id: string) {
    Alert.prompt(
      'Decline Application',
      'Please provide a reason for declining:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: (reason) => {
            if (reason?.trim()) {
              declineMutation.mutate({ id, reason: reason.trim() });
            }
          },
        },
      ],
      'plain-text',
    );
  }

  const renderItem: ListRenderItem<Application> = ({ item }) => (
    <ApplicationCard
      application={item}
      onApprove={handleApprove}
      onDecline={handleDecline}
    />
  );

  return (
    <View style={styles.container}>
      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          <Text style={styles.summaryCount}>{applications.filter(a => a.status === 'pending').length}</Text> pending review
        </Text>
        <Text style={styles.summaryDivider}>·</Text>
        <Text style={styles.summaryText}>
          <Text style={styles.summaryCount}>{applications.filter(a => a.status === 'approved').length}</Text> approved
        </Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map(({ label, value }) => (
          <TouchableOpacity
            key={value}
            style={[styles.filterTab, activeFilter === value && styles.filterTabActive]}
            onPress={() => setActiveFilter(value)}
            activeOpacity={0.75}
          >
            <Text style={[styles.filterTabText, activeFilter === value && styles.filterTabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.gold} />
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing[3] }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No applications in this stage</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundPrimary },

  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.navy,
    gap: Spacing[3],
  },
  summaryText: { fontSize: Typography.sm, color: Colors.gray300 },
  summaryCount: { fontWeight: '800', color: Colors.gold },
  summaryDivider: { color: Colors.gray500 },

  // Filter tabs
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    gap: Spacing[2],
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  filterTab: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1] + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray100,
  },
  filterTabActive: { backgroundColor: Colors.gold },
  filterTabText: { fontSize: Typography.xs, fontWeight: '600', color: Colors.gray600 },
  filterTabTextActive: { color: Colors.navy },

  list: { padding: Spacing[4], paddingBottom: Spacing[8] },

  // Card
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    ...Shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing[3],
  },
  cardHeaderLeft: { flex: 1, marginRight: Spacing[2] },
  clientName: { fontSize: Typography.sm, fontWeight: '700', color: Colors.navy },
  productType: { fontSize: Typography.xs, color: Colors.gray500, marginTop: 2 },

  statusBadge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusText: { fontSize: 11, fontWeight: '700' },

  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing[3],
    marginBottom: Spacing[3],
  },
  metaLabel: { fontSize: Typography.xs, color: Colors.gray400, marginBottom: 2 },
  metaValue: { fontSize: Typography.sm, fontWeight: '600', color: Colors.gray800, maxWidth: 100 },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    paddingTop: Spacing[3],
  },
  actionBtn: {
    flex: 1,
    paddingVertical: Spacing[2] + 2,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  approveBtn: { backgroundColor: Colors.success },
  declineBtn: { backgroundColor: Colors.errorLight, borderWidth: 1, borderColor: Colors.error },
  actionBtnText: { fontSize: Typography.sm, fontWeight: '700', color: Colors.error },

  // Empty
  empty: { alignItems: 'center', paddingTop: Spacing[12] },
  emptyText: { fontSize: Typography.md, fontWeight: '600', color: Colors.gray500 },
});
