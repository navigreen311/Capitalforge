'use client';

// ============================================================
// StateDisclosureDeadlines — dashboard section
//
// This showed upcoming state disclosure filing deadlines per client, with a
// Filed / Pending / Overdue chip each, a "File Disclosure" link beside every
// unfiled one, and it collapsed itself to a green "all clear" when
// everything read as filed.
//
// None of it was recorded anywhere. The endpoint derived each deadline from
// a hash of the client id and marked an item "filed" when that hash was
// divisible by four — against real client names pulled from the database,
// which is what made it convincing. "All clear" was that hash coming up
// filed for every row.
//
// Nothing in this system records a disclosure obligation or a filing, so
// there is nothing to count down to and nothing to report as done. The
// section says that instead.
// ============================================================

import Link from 'next/link';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { DashboardErrorState } from '@/components/dashboard/DashboardErrorState';

interface ComplianceDeadlinesData {
  tracked: boolean;
  why: string;
  clients: number;
  deadlines: unknown[];
  last_updated: string;
}

export function StateDisclosureDeadlines() {
  const { data, isLoading, error, refetch } = useAuthFetch<ComplianceDeadlinesData>(
    '/api/v1/dashboard/compliance-deadlines',
  );

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-48 rounded bg-gray-200" />
        <div className="h-4 w-5/6 rounded bg-gray-100" />
      </div>
    );
  }

  if (error) {
    return <DashboardErrorState error={error} onRetry={refetch} />;
  }

  if (!data) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">State disclosure filings</h3>
        {/* No badge. There is no count to put in one, and an empty green
            badge is the "all clear" this section used to show. */}
      </div>

      {data.tracked ? (
        // Reserved for when a filing record exists. Nothing reaches here yet.
        <p className="mt-2 text-xs text-gray-500">
          {data.deadlines.length} tracked filing{data.deadlines.length === 1 ? '' : 's'}.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-gray-600 leading-relaxed">Not tracked. {data.why}</p>
          <p className="mt-2 text-xs text-gray-500 leading-relaxed">
            {data.clients} active client{data.clients === 1 ? '' : 's'} on record.{' '}
            <Link href="/compliance/disclosures" className="text-brand-gold-600 hover:underline">
              See them by state of formation
            </Link>{' '}
            — an inventory, not a compliance position.
          </p>
        </>
      )}
    </div>
  );
}

export default StateDisclosureDeadlines;
