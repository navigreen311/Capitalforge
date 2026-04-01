import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ListRenderItem,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../lib/theme';
import { alertsApi } from '../lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertType =
  | 'apr_expiry'
  | 'payment_due'
  | 'approval_status'
  | 'compliance_flag'
  | 'document_required'
  | 'rate_change'
  | 'system';

export interface AlertItem {
  id: string;
  type: AlertType;
  title: string;
  body: string;
  severity: 'critical' | 'warning' | 'info';
  read: boolean;
  createdAt: string;
  clientId?: string;
  clientName?: string;
  actionLabel?: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_ALERTS: AlertItem[] = [
  {
    id: '1',
    type: 'apr_expiry',
    title: 'APR Lock Expiring Soon',
    body: 'Meridian Logistics LLC — 5.75% APR lock expires in 7 days. Renew before March 37 to avoid rate adjustment.',
    severity: 'critical',
    read: false,
    createdAt: '2 min ago',
    clientId: '1',
    clientName: 'Meridian Logistics LLC',
    actionLabel: 'Renew Lock',
  },
  {
    id: '2',
    type: 'payment_due',
    title: 'Payment Due in 3 Days',
    body: 'BlueCrest Holdings — $18,400 payment due April 3, 2026. Auto-debit scheduled.',
    severity: 'warning',
    read: false,
    createdAt: '1 hr ago',
    clientId: '2',
    clientName: 'BlueCrest Holdings',
    actionLabel: 'View Schedule',
  },
  {
    id: '3',
    type: 'approval_status',
    title: 'Application Approved',
    body: 'Summit Construction Co — $500k Line of Credit has been approved by Commerce Bank. Awaiting client signature.',
    severity: 'info',
    read: false,
    createdAt: '3 hrs ago',
    clientId: '5',
    clientName: 'Summit Construction Co',
    actionLabel: 'Send for Signature',
  },
  {
    id: '4',
    type: 'compliance_flag',
    title: 'KYB Documents Required',
    body: 'Vantage Capital Partners — 2 documents missing: Beneficial Ownership Certification, Business License.',
    severity: 'critical',
    read: true,
    createdAt: '5 hrs ago',
    clientId: '4',
    clientName: 'Vantage Capital Partners',
    actionLabel: 'Capture Documents',
  },
  {
    id: '5',
    type: 'rate_change',
    title: 'Prime Rate Update',
    body: 'Federal Reserve raised prime rate +0.25%. 3 variable-rate clients may be affected. Review portfolio.',
    severity: 'warning',
    read: true,
    createdAt: 'Yesterday',
    actionLabel: 'Review Portfolio',
  },
  {
    id: '6',
    type: 'document_required',
    title: 'Tax Returns Expiring',
    body: 'Nova Tech Solutions — 2023 tax returns on file will expire for underwriting purposes. Updated returns required.',
    severity: 'warning',
    read: true,
    createdAt: 'Yesterday',
    clientId: '8',
    clientName: 'Nova Tech Solutions',
    actionLabel: 'Request Update',
  },
  {
    id: '7',
    type: 'system',
    title: 'System Maintenance Tonight',
    body: 'CapitalForge platform maintenance scheduled 2:00–4:00 AM EST. Document uploads may be temporarily unavailable.',
    severity: 'info',
    read: true,
    createdAt: '2 days ago',
  },
];

// ─── Alert config ─────────────────────────────────────────────────────────────

const ALERT_ICONS: Record<AlertType, string> = {
  apr_expiry: '⏱',
  payment_due: '$',
  approval_status: '✓',
  compliance_flag: '!',
  document_required: '≡',
  rate_change: '↑',
  system: '⊙',
};

const SEVERITY_COLORS: Record<AlertItem['severity'], { bg: string; icon: string; border: string }> = {
  critical: { bg: Colors.errorLight, icon: Colors.error, border: Colors.error },
  warning: { bg: Colors.warningLight, icon: Colors.warning, border: Colors.warning },
  info: { bg: Colors.infoLight, icon: Colors.info, border: Colors.info },
};

// ─── Alert Row ────────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  onPress,
  onMarkRead,
}: {
  alert: AlertItem;
  onPress: (a: AlertItem) => void;
  onMarkRead: (id: string) => void;
}) {
  const sev = SEVERITY_COLORS[alert.severity];

  return (
    <TouchableOpacity
      style={[
        styles.alertCard,
        { borderLeftColor: sev.border },
        !alert.read && styles.alertCardUnread,
      ]}
      onPress={() => onPress(alert)}
      activeOpacity={0.8}
    >
      <View style={styles.alertRow}>
        <View style={[styles.alertIconBg, { backgroundColor: sev.bg }]}>
          <Text style={[styles.alertIcon, { color: sev.icon }]}>
            {ALERT_ICONS[alert.type]}
          </Text>
        </View>

        <View style={styles.alertContent}>
          <View style={styles.alertTitleRow}>
            <Text style={[styles.alertTitle, !alert.read && styles.alertTitleUnread]} numberOfLines={1}>
              {alert.title}
            </Text>
            {!alert.read && <View style={styles.unreadDot} />}
          </View>

          {alert.clientName && (
            <Text style={styles.alertClient}>{alert.clientName}</Text>
          )}

          <Text style={styles.alertBody} numberOfLines={2}>{alert.body}</Text>

          <View style={styles.alertFooter}>
            <Text style={styles.alertTime}>{alert.createdAt}</Text>
            {alert.actionLabel && (
              <TouchableOpacity onPress={() => onPress(alert)}>
                <Text style={styles.alertAction}>{alert.actionLabel} →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {!alert.read && (
        <TouchableOpacity
          style={styles.markReadBtn}
          onPress={() => onMarkRead(alert.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.markReadText}>Mark read</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AlertsScreen() {
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertsApi.list(),
    placeholderData: { data: MOCK_ALERTS } as any,
    refetchInterval: 30_000, // poll every 30s
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => alertsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => alertsApi.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const alerts = (data?.data as AlertItem[]) ?? MOCK_ALERTS;
  const unreadCount = alerts.filter((a) => !a.read).length;
  const displayed = showUnreadOnly ? alerts.filter((a) => !a.read) : alerts;

  const renderItem: ListRenderItem<AlertItem> = ({ item }) => (
    <AlertRow
      alert={item}
      onPress={(a) => console.log('Alert detail', a.id)}
      onMarkRead={(id) => markReadMutation.mutate(id)}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.headerTitle}>
            {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount !== 1 ? 's' : ''}` : 'All caught up'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.filterToggle, showUnreadOnly && styles.filterToggleActive]}
            onPress={() => setShowUnreadOnly((v) => !v)}
          >
            <Text style={[styles.filterToggleText, showUnreadOnly && styles.filterToggleTextActive]}>
              Unread
            </Text>
          </TouchableOpacity>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.markAllBtn}
              onPress={() => markAllReadMutation.mutate()}
            >
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.gold} />
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing[3] }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>◉</Text>
            <Text style={styles.emptyText}>No alerts</Text>
            <Text style={styles.emptySubtext}>
              {showUnreadOnly ? 'No unread alerts. You\'re all caught up!' : 'All clear — no active alerts.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundPrimary },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  headerTitle: { fontSize: Typography.sm, fontWeight: '700', color: Colors.navy },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },

  filterToggle: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1] + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray100,
  },
  filterToggleActive: { backgroundColor: Colors.navyMid },
  filterToggleText: { fontSize: Typography.xs, fontWeight: '600', color: Colors.gray600 },
  filterToggleTextActive: { color: Colors.white },

  markAllBtn: {},
  markAllText: { fontSize: Typography.xs, fontWeight: '600', color: Colors.gold },

  list: { padding: Spacing[4], paddingBottom: Spacing[8] },

  // Alert card
  alertCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderLeftWidth: 4,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  alertCardUnread: { backgroundColor: '#FAFBFF' },
  alertRow: { flexDirection: 'row', padding: Spacing[4] },

  alertIconBg: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing[3],
    flexShrink: 0,
  },
  alertIcon: { fontSize: 15, fontWeight: '700' },

  alertContent: { flex: 1 },
  alertTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginBottom: 2 },
  alertTitle: { fontSize: Typography.sm, fontWeight: '600', color: Colors.gray700, flex: 1 },
  alertTitleUnread: { color: Colors.navy, fontWeight: '700' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gold,
  },

  alertClient: {
    fontSize: Typography.xs,
    color: Colors.gold,
    fontWeight: '600',
    marginBottom: 3,
  },
  alertBody: { fontSize: Typography.xs, color: Colors.gray500, lineHeight: 17 },
  alertFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing[2],
  },
  alertTime: { fontSize: Typography.xs, color: Colors.gray400 },
  alertAction: { fontSize: Typography.xs, fontWeight: '700', color: Colors.gold },

  markReadBtn: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    alignSelf: 'flex-end',
  },
  markReadText: { fontSize: Typography.xs, color: Colors.gray400, fontWeight: '500' },

  // Empty
  empty: { alignItems: 'center', paddingTop: Spacing[12] },
  emptyIcon: { fontSize: 40, color: Colors.gray300, marginBottom: Spacing[3] },
  emptyText: { fontSize: Typography.md, fontWeight: '700', color: Colors.gray600 },
  emptySubtext: { fontSize: Typography.sm, color: Colors.gray400, marginTop: Spacing[1], textAlign: 'center' },
});
