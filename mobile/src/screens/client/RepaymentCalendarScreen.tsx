import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../../lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentStatus = 'paid' | 'upcoming' | 'overdue';

interface PaymentEntry {
  id: string;
  date: string;       // 'YYYY-MM-DD'
  amount: number;
  lender: string;
  status: PaymentStatus;
  aprExpiry?: string; // 'YYYY-MM-DD' if associated with an expiring APR
}

interface RepaymentData {
  payments: PaymentEntry[];
  totalBalance: number;
  nextPaymentDate: string;
  nextPaymentAmount: number;
  aprExpiryAlerts: Array<{ lender: string; expiryDate: string; currentApr: number }>;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_REPAYMENT: RepaymentData = {
  totalBalance: 142_500,
  nextPaymentDate: '2026-04-05',
  nextPaymentAmount: 3_840,
  aprExpiryAlerts: [
    { lender: 'Chase Ink Business', expiryDate: '2026-04-30', currentApr: 0.0 },
    { lender: 'Amex Blue Business', expiryDate: '2026-06-15', currentApr: 0.0 },
  ],
  payments: [
    { id: 'p1', date: '2026-03-05', amount: 3840, lender: 'Chase Ink', status: 'paid' },
    { id: 'p2', date: '2026-03-12', amount: 2200, lender: 'Amex Blue', status: 'paid' },
    { id: 'p3', date: '2026-03-20', amount: 1500, lender: 'Capital One', status: 'paid' },
    { id: 'p4', date: '2026-04-05', amount: 3840, lender: 'Chase Ink', status: 'upcoming' },
    { id: 'p5', date: '2026-04-12', amount: 2200, lender: 'Amex Blue', status: 'upcoming' },
    { id: 'p6', date: '2026-04-20', amount: 1500, lender: 'Capital One', status: 'upcoming' },
    { id: 'p7', date: '2026-02-15', amount: 980, lender: 'SBA Loan', status: 'overdue' },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<PaymentStatus, string> = {
  paid: Colors.success,
  upcoming: Colors.warning,
  overdue: Colors.error,
};

const STATUS_BG: Record<PaymentStatus, string> = {
  paid: Colors.successLight,
  upcoming: Colors.warningLight,
  overdue: Colors.errorLight,
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── APR Expiry Alert Banner ──────────────────────────────────────────────────

function AprAlertBanner({ lender, expiryDate, currentApr }: RepaymentData['aprExpiryAlerts'][0]) {
  const days = daysUntil(expiryDate);
  const urgent = days <= 14;

  return (
    <View style={[styles.aprBanner, urgent && styles.aprBannerUrgent]}>
      <Text style={styles.aprBannerIcon}>{urgent ? '⚠' : '◉'}</Text>
      <View style={styles.aprBannerContent}>
        <Text style={styles.aprBannerTitle}>
          {lender} — {currentApr === 0 ? '0% APR' : `${(currentApr * 100).toFixed(1)}% APR`} expires
        </Text>
        <Text style={styles.aprBannerSub}>
          {days > 0 ? `${days} days remaining (${formatDate(expiryDate)})` : 'Expired'}
        </Text>
      </View>
      <View style={[styles.aprCountdown, urgent && { backgroundColor: Colors.error }]}>
        <Text style={styles.aprCountdownText}>{days}d</Text>
      </View>
    </View>
  );
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────

function CalendarGrid({
  year,
  month,
  payments,
  onDayPress,
}: {
  year: number;
  month: number; // 0-indexed
  payments: PaymentEntry[];
  onDayPress: (day: number) => void;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Build payment lookup: day -> status (prioritize overdue > upcoming > paid)
  const dayMap: Record<number, PaymentStatus> = {};
  payments.forEach((p) => {
    const d = new Date(p.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      const existing = dayMap[day];
      if (!existing ||
        (p.status === 'overdue') ||
        (p.status === 'upcoming' && existing === 'paid')) {
        dayMap[day] = p.status;
      }
    }
  });

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Pad to complete rows
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  return (
    <View style={styles.calendarGrid}>
      {/* Day headers */}
      <View style={styles.calendarWeekRow}>
        {DAYS_OF_WEEK.map((d) => (
          <Text key={d} style={styles.calendarWeekLabel}>{d}</Text>
        ))}
      </View>

      {rows.map((row, rIdx) => (
        <View key={rIdx} style={styles.calendarRow}>
          {row.map((day, cIdx) => {
            if (!day) return <View key={cIdx} style={styles.calendarCell} />;
            const status = dayMap[day];
            const todayFlag = isToday(day);

            return (
              <TouchableOpacity
                key={cIdx}
                style={[
                  styles.calendarCell,
                  todayFlag && styles.calendarCellToday,
                  status && { backgroundColor: STATUS_BG[status] },
                ]}
                onPress={() => status ? onDayPress(day) : undefined}
                activeOpacity={status ? 0.7 : 1}
              >
                <Text style={[
                  styles.calendarDayText,
                  todayFlag && styles.calendarDayToday,
                  status && { color: STATUS_COLOR[status], fontWeight: '700' },
                ]}>
                  {day}
                </Text>
                {status && (
                  <View style={[styles.calendarDot, { backgroundColor: STATUS_COLOR[status] }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RepaymentCalendarScreen() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedPayments, setSelectedPayments] = useState<PaymentEntry[] | null>(null);

  const { data, isLoading, refetch } = useQuery<RepaymentData>({
    queryKey: ['client', 'repayment'],
    queryFn: async () => MOCK_REPAYMENT,
    placeholderData: MOCK_REPAYMENT,
  });

  const repayment = data ?? MOCK_REPAYMENT;

  function handleDayPress(day: number) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hits = repayment.payments.filter((p) => p.date === dateStr);
    if (hits.length) setSelectedPayments(hits);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  const monthLabel = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.gold} />
      }
    >
      {/* APR Expiry Alerts */}
      {repayment.aprExpiryAlerts.length > 0 && (
        <View style={styles.alertsSection}>
          <Text style={styles.alertsHeading}>APR Expiry Alerts</Text>
          {repayment.aprExpiryAlerts.map((a, i) => (
            <AprAlertBanner key={i} {...a} />
          ))}
        </View>
      )}

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Balance</Text>
          <Text style={styles.summaryValue}>${repayment.totalBalance.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Next Payment</Text>
          <Text style={styles.summaryValue}>${repayment.nextPaymentAmount.toLocaleString()}</Text>
          <Text style={styles.summaryDate}>{formatDate(repayment.nextPaymentDate)}</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {(['paid', 'upcoming', 'overdue'] as PaymentStatus[]).map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: STATUS_COLOR[s] }]} />
            <Text style={styles.legendLabel}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
          </View>
        ))}
      </View>

      {/* Calendar */}
      <View style={styles.calendarCard}>
        {/* Month nav */}
        <View style={styles.calendarNav}>
          <TouchableOpacity style={styles.navBtn} onPress={prevMonth} activeOpacity={0.7}>
            <Text style={styles.navBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity style={styles.navBtn} onPress={nextMonth} activeOpacity={0.7}>
            <Text style={styles.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>

        <CalendarGrid
          year={viewYear}
          month={viewMonth}
          payments={repayment.payments}
          onDayPress={handleDayPress}
        />
      </View>

      {/* Upcoming Payments List */}
      <Text style={styles.sectionTitle}>Upcoming Payments</Text>
      <View style={styles.paymentsList}>
        {repayment.payments
          .filter((p) => p.status !== 'paid')
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((p, idx, arr) => (
            <React.Fragment key={p.id}>
              <View style={styles.paymentRow}>
                <View style={[styles.statusPill, { backgroundColor: STATUS_BG[p.status] }]}>
                  <Text style={[styles.statusPillText, { color: STATUS_COLOR[p.status] }]}>
                    {p.status}
                  </Text>
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentLender}>{p.lender}</Text>
                  <Text style={styles.paymentDate}>{formatDate(p.date)}</Text>
                </View>
                <Text style={styles.paymentAmount}>${p.amount.toLocaleString()}</Text>
              </View>
              {idx < arr.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
      </View>

      {/* Payment Detail Modal */}
      <Modal
        visible={!!selectedPayments}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPayments(null)}
      >
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setSelectedPayments(null)} activeOpacity={1}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Payment Details</Text>
            {selectedPayments?.map((p) => (
              <View key={p.id} style={styles.modalRow}>
                <View style={styles.modalRowLeft}>
                  <Text style={styles.modalLender}>{p.lender}</Text>
                  <Text style={styles.modalDate}>{formatDate(p.date)}</Text>
                </View>
                <View style={styles.modalRowRight}>
                  <Text style={styles.modalAmount}>${p.amount.toLocaleString()}</Text>
                  <View style={[styles.modalStatusPill, { backgroundColor: STATUS_BG[p.status] }]}>
                    <Text style={[styles.modalStatusText, { color: STATUS_COLOR[p.status] }]}>
                      {p.status}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedPayments(null)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundPrimary },
  content: { padding: Spacing[4], paddingBottom: Spacing[10] },

  sectionTitle: {
    fontSize: Typography.md,
    fontWeight: '700',
    color: Colors.navy,
    marginBottom: Spacing[3],
    marginTop: Spacing[2],
  },

  // APR Alerts
  alertsSection: { marginBottom: Spacing[4] },
  alertsHeading: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing[2],
  },
  aprBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warningLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing[3],
    marginBottom: Spacing[2],
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  aprBannerUrgent: {
    backgroundColor: Colors.errorLight,
    borderLeftColor: Colors.error,
  },
  aprBannerIcon: { fontSize: 20, marginRight: Spacing[3] },
  aprBannerContent: { flex: 1 },
  aprBannerTitle: { fontSize: Typography.sm, fontWeight: '700', color: Colors.navy },
  aprBannerSub: { fontSize: Typography.xs, color: Colors.gray600, marginTop: 2 },
  aprCountdown: {
    backgroundColor: Colors.warning,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing[2],
    paddingVertical: 4,
    marginLeft: Spacing[2],
  },
  aprCountdownText: { fontSize: Typography.xs, fontWeight: '800', color: Colors.white },

  // Summary
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.navy,
    borderRadius: BorderRadius.xl,
    padding: Spacing[5],
    marginBottom: Spacing[4],
    ...Shadow.lg,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: Colors.navyMid },
  summaryLabel: { fontSize: Typography.xs, color: Colors.goldLight, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: Typography['2xl'], fontWeight: '800', color: Colors.white, marginTop: 4 },
  summaryDate: { fontSize: Typography.xs, color: Colors.gray400, marginTop: 2 },

  // Legend
  legend: { flexDirection: 'row', gap: Spacing[4], marginBottom: Spacing[3] },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: BorderRadius.full },
  legendLabel: { fontSize: Typography.xs, color: Colors.gray600, fontWeight: '500' },

  // Calendar Card
  calendarCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing[4],
    marginBottom: Spacing[4],
    ...Shadow.md,
  },
  calendarNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[3] },
  navBtn: { padding: Spacing[2] },
  navBtnText: { fontSize: Typography['2xl'], fontWeight: '700', color: Colors.navy },
  monthLabel: { fontSize: Typography.md, fontWeight: '700', color: Colors.navy },

  calendarGrid: { gap: 4 },
  calendarWeekRow: { flexDirection: 'row' },
  calendarWeekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: Typography.xs,
    fontWeight: '600',
    color: Colors.gray500,
    paddingBottom: Spacing[2],
  },
  calendarRow: { flexDirection: 'row', gap: 2 },
  calendarCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    gap: 2,
  },
  calendarCellToday: { borderWidth: 1.5, borderColor: Colors.navy },
  calendarDayText: { fontSize: Typography.xs, color: Colors.gray700 },
  calendarDayToday: { fontWeight: '800', color: Colors.navy },
  calendarDot: { width: 5, height: 5, borderRadius: BorderRadius.full },

  // Payments list
  paymentsList: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[4],
    gap: Spacing[3],
  },
  statusPill: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusPillText: { fontSize: Typography.xs, fontWeight: '700', textTransform: 'capitalize' },
  paymentInfo: { flex: 1 },
  paymentLender: { fontSize: Typography.sm, fontWeight: '600', color: Colors.navy },
  paymentDate: { fontSize: Typography.xs, color: Colors.gray500, marginTop: 2 },
  paymentAmount: { fontSize: Typography.md, fontWeight: '700', color: Colors.navy },
  divider: { height: 1, backgroundColor: Colors.gray100, marginHorizontal: Spacing[4] },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    padding: Spacing[5],
    paddingBottom: Spacing[10],
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.gray300,
    alignSelf: 'center', marginBottom: Spacing[4],
  },
  modalTitle: { fontSize: Typography.lg, fontWeight: '800', color: Colors.navy, marginBottom: Spacing[4] },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  modalRowLeft: {},
  modalRowRight: { alignItems: 'flex-end', gap: 4 },
  modalLender: { fontSize: Typography.sm, fontWeight: '600', color: Colors.navy },
  modalDate: { fontSize: Typography.xs, color: Colors.gray500, marginTop: 2 },
  modalAmount: { fontSize: Typography.md, fontWeight: '700', color: Colors.navy },
  modalStatusPill: { paddingHorizontal: Spacing[2], paddingVertical: 2, borderRadius: BorderRadius.full },
  modalStatusText: { fontSize: Typography.xs, fontWeight: '700', textTransform: 'capitalize' },
  modalClose: {
    backgroundColor: Colors.navy,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing[4],
    alignItems: 'center',
    marginTop: Spacing[5],
  },
  modalCloseText: { fontSize: Typography.md, fontWeight: '700', color: Colors.white },
});
