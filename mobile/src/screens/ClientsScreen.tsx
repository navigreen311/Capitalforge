import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ListRenderItem,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../lib/theme';
import { clientsApi } from '../lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  industry: string;
  status: 'active' | 'prospect' | 'inactive' | 'review';
  fundingReadinessScore: number;
  totalFunding: number;
  lastActivity: string;
  advisor: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CLIENTS: Client[] = [
  { id: '1', name: 'Meridian Logistics LLC', industry: 'Transportation', status: 'active', fundingReadinessScore: 87, totalFunding: 750000, lastActivity: '2 hrs ago', advisor: 'J. Carter' },
  { id: '2', name: 'BlueCrest Holdings', industry: 'Real Estate', status: 'active', fundingReadinessScore: 92, totalFunding: 2100000, lastActivity: 'Today', advisor: 'M. Reeves' },
  { id: '3', name: 'Apex Retail Group', industry: 'Retail', status: 'review', fundingReadinessScore: 61, totalFunding: 125000, lastActivity: 'Yesterday', advisor: 'J. Carter' },
  { id: '4', name: 'Vantage Capital Partners', industry: 'Finance', status: 'prospect', fundingReadinessScore: 74, totalFunding: 0, lastActivity: '3 days ago', advisor: 'S. Lin' },
  { id: '5', name: 'Summit Construction Co', industry: 'Construction', status: 'active', fundingReadinessScore: 83, totalFunding: 500000, lastActivity: 'Today', advisor: 'M. Reeves' },
  { id: '6', name: 'Crestwood Dining Group', industry: 'Food & Beverage', status: 'inactive', fundingReadinessScore: 45, totalFunding: 80000, lastActivity: '2 wks ago', advisor: 'J. Carter' },
  { id: '7', name: 'Pinnacle Health Services', industry: 'Healthcare', status: 'active', fundingReadinessScore: 96, totalFunding: 1800000, lastActivity: '1 hr ago', advisor: 'S. Lin' },
  { id: '8', name: 'Nova Tech Solutions', industry: 'Technology', status: 'prospect', fundingReadinessScore: 68, totalFunding: 0, lastActivity: '1 week ago', advisor: 'J. Carter' },
];

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<Client['status'], { bg: string; text: string }> = {
  active: { bg: Colors.successLight, text: Colors.statusApproved },
  prospect: { bg: Colors.infoLight, text: Colors.statusReview },
  review: { bg: Colors.warningLight, text: Colors.statusPending },
  inactive: { bg: Colors.gray100, text: Colors.statusExpired },
};

function StatusBadge({ status }: { status: Client['status'] }) {
  const colors = STATUS_COLORS[status];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.badgeText, { color: colors.text }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
}

// ─── Readiness Score Bar ──────────────────────────────────────────────────────

function ReadinessBar({ score }: { score: number }) {
  const color = score >= 80 ? Colors.success : score >= 60 ? Colors.warning : Colors.error;
  return (
    <View style={styles.readinessContainer}>
      <View style={styles.readinessTrack}>
        <View style={[styles.readinessFill, { width: `${score}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.readinessLabel, { color }]}>{score}</Text>
    </View>
  );
}

// ─── Client Row ───────────────────────────────────────────────────────────────

function ClientRow({ client, onPress }: { client: Client; onPress: (c: Client) => void }) {
  return (
    <TouchableOpacity style={styles.clientCard} onPress={() => onPress(client)} activeOpacity={0.75}>
      <View style={styles.clientHeader}>
        <View style={styles.clientAvatar}>
          <Text style={styles.clientAvatarText}>{client.name.charAt(0)}</Text>
        </View>
        <View style={styles.clientInfo}>
          <Text style={styles.clientName} numberOfLines={1}>{client.name}</Text>
          <Text style={styles.clientIndustry}>{client.industry}</Text>
        </View>
        <StatusBadge status={client.status} />
      </View>

      <View style={styles.clientMeta}>
        <View style={styles.clientMetaItem}>
          <Text style={styles.clientMetaLabel}>Funding Readiness</Text>
          <ReadinessBar score={client.fundingReadinessScore} />
        </View>
        <View style={styles.clientMetaRight}>
          {client.totalFunding > 0 && (
            <Text style={styles.clientFunding}>
              ${(client.totalFunding / 1000).toFixed(0)}k funded
            </Text>
          )}
          <Text style={styles.clientLastActivity}>{client.lastActivity}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ClientsScreen() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<Client['status'] | 'all'>('all');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['clients', search],
    queryFn: () => clientsApi.list({ search: search || undefined }),
    placeholderData: { data: MOCK_CLIENTS } as any,
  });

  const clients = (data?.data as Client[]) ?? MOCK_CLIENTS;

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.industry.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filterStatus === 'all' || c.status === filterStatus;
      return matchesSearch && matchesFilter;
    });
  }, [clients, search, filterStatus]);

  const renderItem: ListRenderItem<Client> = ({ item }) => (
    <ClientRow client={item} onPress={(c) => console.log('Navigate to client', c.id)} />
  );

  const FILTER_OPTIONS: Array<{ label: string; value: Client['status'] | 'all' }> = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Prospect', value: 'prospect' },
    { label: 'Review', value: 'review' },
    { label: 'Inactive', value: 'inactive' },
  ];

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>⊞</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search clients or industry…"
          placeholderTextColor={Colors.gray400}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map(({ label, value }) => (
          <TouchableOpacity
            key={value}
            style={[styles.filterChip, filterStatus === value && styles.filterChipActive]}
            onPress={() => setFilterStatus(value)}
            activeOpacity={0.75}
          >
            <Text style={[styles.filterChipText, filterStatus === value && styles.filterChipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Results count */}
      <Text style={styles.resultCount}>{filtered.length} client{filtered.length !== 1 ? 's' : ''}</Text>

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
            <Text style={styles.emptyText}>No clients found</Text>
            <Text style={styles.emptySubtext}>Try adjusting your search or filters</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundPrimary },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    margin: Spacing[4],
    marginBottom: Spacing[2],
    paddingHorizontal: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.gray200,
    ...Shadow.sm,
  },
  searchIcon: { fontSize: 16, color: Colors.gray400, marginRight: Spacing[2] },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing[3],
    fontSize: Typography.base,
    color: Colors.gray900,
  },

  // Filters
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[4],
    gap: Spacing[2],
    marginBottom: Spacing[2],
  },
  filterChip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1] + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  filterChipActive: {
    backgroundColor: Colors.navy,
    borderColor: Colors.navy,
  },
  filterChipText: { fontSize: Typography.xs, fontWeight: '600', color: Colors.gray600 },
  filterChipTextActive: { color: Colors.white },

  resultCount: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[2],
  },

  list: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[8] },

  // Client card
  clientCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing[4],
    ...Shadow.sm,
  },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  clientAvatar: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.navyMid,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing[3],
  },
  clientAvatarText: { fontSize: Typography.md, fontWeight: '700', color: Colors.gold },
  clientInfo: { flex: 1 },
  clientName: { fontSize: Typography.sm, fontWeight: '700', color: Colors.navy },
  clientIndustry: { fontSize: Typography.xs, color: Colors.gray500, marginTop: 1 },

  // Badge
  badge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },

  // Meta row
  clientMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clientMetaItem: { flex: 1, marginRight: Spacing[3] },
  clientMetaLabel: { fontSize: Typography.xs, color: Colors.gray500, marginBottom: 4 },
  clientMetaRight: { alignItems: 'flex-end' },
  clientFunding: { fontSize: Typography.xs, fontWeight: '600', color: Colors.navy },
  clientLastActivity: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },

  // Readiness bar
  readinessContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readinessTrack: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  readinessFill: { height: '100%', borderRadius: BorderRadius.full },
  readinessLabel: { fontSize: Typography.xs, fontWeight: '700', minWidth: 22 },

  // Empty state
  empty: { alignItems: 'center', paddingTop: Spacing[12] },
  emptyText: { fontSize: Typography.md, fontWeight: '600', color: Colors.gray600 },
  emptySubtext: { fontSize: Typography.sm, color: Colors.gray400, marginTop: Spacing[1] },
});
