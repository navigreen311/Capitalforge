import type { Metadata } from 'next';
import { StatCard, SectionCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BadgeStatus } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import type { ColumnDef } from '@/components/ui/data-table';

export const metadata: Metadata = {
  title: 'Dashboard',
};

// ─── Mock data (replace with real API calls via React Query) ──────────────────

interface RecentApplication {
  id: string;
  clientName: string;
  type: string;
  amount: string;
  status: BadgeStatus;
  submitted: string;
}

const RECENT_APPLICATIONS: RecentApplication[] = [
  { id: 'APP-0091', clientName: 'Meridian Holdings LLC',    type: 'Term Loan',       amount: '$250,000',  status: 'review',    submitted: '2026-03-30' },
  { id: 'APP-0090', clientName: 'Apex Ventures Inc.',       type: 'SBA 7(a)',        amount: '$500,000',  status: 'pending',   submitted: '2026-03-29' },
  { id: 'APP-0089', clientName: 'Brightline Corp',          type: 'Credit Stack',    amount: '$120,000',  status: 'approved',  submitted: '2026-03-28' },
  { id: 'APP-0088', clientName: 'Thornwood Capital',        type: 'Equipment',       amount: '$85,000',   status: 'processing',submitted: '2026-03-27' },
  { id: 'APP-0087', clientName: 'Norcal Transport LLC',     type: 'Line of Credit',  amount: '$200,000',  status: 'declined',  submitted: '2026-03-26' },
];

interface ActivityItem {
  id: string;
  icon: string;
  iconBg: string;
  iconText: string;
  description: string;
  time: string;
  category: string;
}

const ACTIVITY_ITEMS: ActivityItem[] = [
  {
    id: 'act-1',
    icon: 'AP',
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-700',
    description: 'APP-0091 moved to underwriting review',
    time: '12 min ago',
    category: 'Application',
  },
  {
    id: 'act-2',
    icon: 'CR',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-700',
    description: 'Credit pull completed — Brightline Corp (Equifax)',
    time: '1 hr ago',
    category: 'Credit',
  },
  {
    id: 'act-3',
    icon: 'CO',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    description: 'Compliance flag: Illinois disclosure deadline in 3 days',
    time: '2 hr ago',
    category: 'Compliance',
  },
  {
    id: 'act-4',
    icon: 'DC',
    iconBg: 'bg-purple-100',
    iconText: 'text-purple-700',
    description: 'Dossier exported for Apex Ventures Inc.',
    time: '4 hr ago',
    category: 'Documents',
  },
  {
    id: 'act-5',
    icon: 'FR',
    iconBg: 'bg-brand-navy/10',
    iconText: 'text-brand-navy',
    description: 'Funding Round #FR-018 created — $1.2M target',
    time: 'Yesterday',
    category: 'Funding',
  },
];

// ─── Application table columns ────────────────────────────────────────────────

const APP_COLUMNS: ColumnDef<RecentApplication>[] = [
  {
    key: 'id',
    header: 'App ID',
    sortable: true,
    cell: (row) => (
      <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
        {row.id}
      </span>
    ),
  },
  {
    key: 'clientName',
    header: 'Client',
    sortable: true,
    cell: (row) => (
      <span className="font-medium text-gray-900">{row.clientName}</span>
    ),
  },
  {
    key: 'type',
    header: 'Type',
    sortable: true,
  },
  {
    key: 'amount',
    header: 'Amount',
    sortable: true,
    align: 'right',
    cell: (row) => (
      <span className="font-semibold text-gray-900">{row.amount}</span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    cell: (row) => <Badge status={row.status} />,
  },
  {
    key: 'submitted',
    header: 'Submitted',
    sortable: true,
    cell: (row) => (
      <span className="text-gray-500 text-xs">{row.submitted}</span>
    ),
  },
];

// ─── Quick action button ──────────────────────────────────────────────────────

interface QuickActionProps {
  icon: string;
  label: string;
  description: string;
  href: string;
  accent?: boolean;
}

function QuickAction({ icon, label, description, href, accent }: QuickActionProps) {
  return (
    <a
      href={href}
      className={`
        flex items-start gap-3 p-4 rounded-xl border transition-all duration-150
        ${accent
          ? 'bg-brand-navy text-white border-brand-navy hover:bg-brand-navy-800'
          : 'bg-white border-surface-border hover:border-gray-300 hover:shadow-card'}
      `}
    >
      <span
        className={`
          inline-flex items-center justify-center w-10 h-10 rounded-lg
          text-sm font-bold flex-shrink-0
          ${accent ? 'bg-white/10 text-brand-gold' : 'bg-surface-overlay text-brand-navy'}
        `}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div>
        <p className={`text-sm font-semibold ${accent ? 'text-white' : 'text-gray-900'}`}>
          {label}
        </p>
        <p className={`text-xs mt-0.5 ${accent ? 'text-white/60' : 'text-gray-400'}`}>
          {description}
        </p>
      </div>
    </a>
  );
}

// ─── Compliance score ring (SVG) ─────────────────────────────────────────────

function ComplianceRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 96 96" aria-label={`Compliance score: ${score}%`}>
        {/* Track */}
        <circle
          cx="48" cy="48" r={radius}
          fill="none" stroke="#E5E7EB" strokeWidth="8"
        />
        {/* Fill */}
        <circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeDashoffset={circumference * 0.25} // start at top
          strokeLinecap="round"
        />
        {/* Score text */}
        <text
          x="48" y="48"
          textAnchor="middle" dominantBaseline="central"
          className="text-xl font-bold"
          style={{ fontSize: '20px', fontWeight: 700, fill: '#0F172A' }}
        >
          {score}
        </text>
      </svg>
      <p className="text-xs text-gray-500">Compliance Score</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="space-y-8">
      {/* ── Page header ─────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>
        <a
          href="/applications/new"
          className="btn-accent btn flex-shrink-0"
        >
          <span aria-hidden="true">+</span>
          New Application
        </a>
      </div>

      {/* ── KPI Summary Cards ────────────────────────────── */}
      <section aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className="sr-only">Key Performance Indicators</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Active Clients"
            value="148"
            trendLabel="+6 this month"
            trendDirection="up"
            icon="CL"
            iconBg="bg-blue-50"
            iconColor="text-blue-700"
            subtitle="vs. 142 last month"
          />
          <StatCard
            title="Pending Applications"
            value="23"
            trendLabel="+4 since Monday"
            trendDirection="up"
            icon="AP"
            iconBg="bg-amber-50"
            iconColor="text-amber-700"
            subtitle="7 need action today"
          />
          <StatCard
            title="Total Funding Deployed"
            value="$14.2M"
            trendLabel="+$1.1M this quarter"
            trendDirection="up"
            icon="FR"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-700"
            subtitle="YTD across all rounds"
          />
          <StatCard
            title="Avg. Approval Rate"
            value="68%"
            trendLabel="-2pts vs last quarter"
            trendDirection="down"
            icon="CI"
            iconBg="bg-purple-50"
            iconColor="text-purple-700"
            subtitle="industry avg: 62%"
          />
        </div>
      </section>

      {/* ── Main body — 2-col grid ───────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: Recent Applications (2/3 width) ─────── */}
        <div className="xl:col-span-2 space-y-6">
          <SectionCard
            title="Recent Applications"
            subtitle="Latest 5 submissions across all clients"
            flushBody
            action={
              <a href="/applications" className="btn-outline btn btn-sm">
                View all
              </a>
            }
          >
            <DataTable<RecentApplication>
              columns={APP_COLUMNS}
              data={RECENT_APPLICATIONS}
              rowKey="id"
              defaultPageSize={5}
              pageSizeOptions={[5, 10, 25]}
            />
          </SectionCard>

          {/* ── Quick Actions ─────────────────────────────── */}
          <section aria-labelledby="quick-actions-heading">
            <h2 id="quick-actions-heading" className="cf-section-title">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <QuickAction
                icon="AP"
                label="New Application"
                description="Submit a funding application for a client"
                href="/applications/new"
                accent
              />
              <QuickAction
                icon="CL"
                label="Add Client"
                description="Onboard a new business entity"
                href="/clients/new"
              />
              <QuickAction
                icon="CI"
                label="Pull Credit Report"
                description="Request bureau data for a client"
                href="/credit-intelligence/pull"
              />
              <QuickAction
                icon="DC"
                label="Export Dossier"
                description="Generate a client funding package"
                href="/documents/export"
              />
            </div>
          </section>
        </div>

        {/* ── Right: Activity + Compliance (1/3 width) ──── */}
        <div className="space-y-6">

          {/* Compliance score */}
          <SectionCard
            title="Compliance Health"
            subtitle="Aggregate score across active clients"
          >
            <div className="flex flex-col items-center gap-4">
              <ComplianceRing score={84} />
              <div className="w-full space-y-2">
                <ComplianceRow label="State disclosures"   status="approved"   count={42} />
                <ComplianceRow label="TILA requirements"   status="approved"   count={38} />
                <ComplianceRow label="Pending reviews"     status="pending"    count={6}  />
                <ComplianceRow label="Overdue items"       status="declined"   count={2}  />
              </div>
              <a
                href="/compliance"
                className="btn-outline btn btn-sm w-full justify-center"
              >
                Open Compliance Center
              </a>
            </div>
          </SectionCard>

          {/* Activity feed */}
          <SectionCard
            title="Recent Activity"
            action={
              <button className="text-xs text-brand-gold-600 hover:underline">
                Mark all read
              </button>
            }
          >
            <div className="divide-y divide-surface-border -mx-6">
              {ACTIVITY_ITEMS.map((item) => (
                <div key={item.id} className="px-6 py-3 flex items-start gap-3">
                  <span
                    className={`
                      inline-flex items-center justify-center w-8 h-8 rounded-full
                      flex-shrink-0 text-[10px] font-bold
                      ${item.iconBg} ${item.iconText}
                    `}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 leading-snug">
                      {item.description}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ─── Compliance row helper ────────────────────────────────────────────────────

function ComplianceRow({
  label,
  status,
  count,
}: {
  label: string;
  status: BadgeStatus;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-900">{count}</span>
        <Badge status={status} size="sm" />
      </div>
    </div>
  );
}
