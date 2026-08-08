// ============================================================
// Band 2 — can they afford it.
//
// The shock month is the point of this object, so it is the first thing
// on screen rather than a field among fourteen. Everything else in the
// band explains what happens at that month.
// ============================================================

import { money, ratio, count, type WorstCaseRepaymentPath } from '@/lib/simulator-result';

function Figure({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

export function AffordabilityBand({ path }: { path: WorstCaseRepaymentPath }): React.JSX.Element {
  const schedule = path.monthlySchedule;
  const peak = schedule.reduce((m, s) => (s.remainingBalance > m ? s.remainingBalance : m), 0);

  return (
    <section
      aria-label="Worst-case repayment"
      data-testid="affordability-band"
      className="rounded-xl border border-gray-200 bg-white p-5 space-y-5"
    >
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">Worst case</p>
        <h2 className="text-lg font-bold text-gray-900">
          Interest shock at month{' '}
          <span data-testid="shock-month">{count(path.interestShockMonth)}</span>
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          When the intro APRs expire, the monthly payment moves from{' '}
          <span className="font-semibold text-gray-900" data-testid="pre-shock-payment">
            {money(path.preShockMonthlyPayment)}
          </span>{' '}
          to{' '}
          <span className="font-semibold text-gray-900" data-testid="post-shock-payment">
            {money(path.postShockMonthlyPayment)}
          </span>
          .
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Balance at shock" value={money(path.balanceAtShock)} testId="balance-at-shock" />
        <Figure label="Payment increase" value={ratio(path.paymentIncreaseRatio)} />
        <Figure label="Interest over 24 months" value={money(path.totalInterest24m)} />
        <Figure
          label="Revenue coverage"
          value={ratio(path.revenueCoverageRatio)}
          testId="revenue-coverage"
        />
      </dl>

      <div
        className={
          path.isSustainable
            ? 'rounded-lg border border-gray-300 bg-gray-50 px-4 py-3'
            : 'rounded-lg border border-red-300 bg-red-50 px-4 py-3'
        }
        data-testid="sustainability"
      >
        <p
          className={
            path.isSustainable
              ? 'text-sm font-semibold text-gray-900'
              : 'text-sm font-semibold text-red-900'
          }
        >
          {path.isSustainable
            ? 'Revenue covers the post-shock payment'
            : 'Revenue does not cover the post-shock payment'}
        </p>
        <p className={path.isSustainable ? 'text-sm text-gray-700' : 'text-sm text-red-900'}>
          Coverage ratio {ratio(path.revenueCoverageRatio)} — the service&rsquo;s own judgement,
          reported as <span className="font-mono">isSustainable: {String(path.isSustainable)}</span>.
        </p>
      </div>

      {path.alerts.length > 0 && (
        <ul className="space-y-1" data-testid="repayment-alerts">
          {path.alerts.map((a) => (
            <li key={a} className="text-sm text-gray-700">
              — {a}
            </li>
          ))}
        </ul>
      )}

      {/*
        The schedule as bars, one per month, height from the reported
        remaining balance and scaled to the largest in the series. The
        shock month is marked from each row's own isShockMonth flag
        rather than by comparing against interestShockMonth, so the
        marker is the response's, not a guess at where it belongs.
      */}
      {schedule.length > 0 && peak > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Remaining balance, months 1–{count(schedule.length)}</p>
          <div className="flex items-end gap-px overflow-x-auto" data-testid="repayment-chart">
            {schedule.map((s) => (
              <div
                key={s.month}
                title={`Month ${String(s.month)} — balance ${money(s.remainingBalance)}, interest ${money(s.interestCharge)}, payment ${money(s.requiredPayment)}`}
                data-testid={s.isShockMonth ? 'shock-bar' : undefined}
                className={
                  s.isShockMonth
                    ? 'min-w-[8px] flex-1 rounded-t-sm bg-red-500'
                    : 'min-w-[8px] flex-1 rounded-t-sm bg-gray-300'
                }
                style={{ height: `${String(Math.max(2, (s.remainingBalance / peak) * 96))}px` }}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            The red bar is the shock month. Hover a bar for that month&rsquo;s balance, interest and
            payment.
          </p>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-gray-600">Month-by-month schedule</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <th scope="col" className="py-2 pr-4 font-medium">Month</th>
                <th scope="col" className="py-2 pr-4 font-medium">Remaining balance</th>
                <th scope="col" className="py-2 pr-4 font-medium">Interest</th>
                <th scope="col" className="py-2 font-medium">Required payment</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((s) => (
                <tr
                  key={s.month}
                  className={s.isShockMonth ? 'bg-red-50 font-semibold' : 'border-b border-gray-100'}
                >
                  <td className="py-1.5 pr-4 text-gray-900">
                    {count(s.month)}
                    {s.isShockMonth ? ' — shock' : ''}
                  </td>
                  <td className="py-1.5 pr-4 text-gray-900">{money(s.remainingBalance)}</td>
                  <td className="py-1.5 pr-4 text-gray-900">{money(s.interestCharge)}</td>
                  <td className="py-1.5 text-gray-900">{money(s.requiredPayment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
