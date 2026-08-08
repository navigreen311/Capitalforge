// ============================================================
// Band 3 — is this the right product.
//
// One row per option, ordered by the suitability score the response
// reported. Nothing in here tests for a product type: a merchant cash
// advance sinks to the bottom on a strong profile because it scores 15
// there, and rises to the top on a distressed one because it scores 65
// and the service recommends it. Hard-coding it as the bad option would
// misrepresent the second case, which is the one where a client is most
// exposed.
//
// The APR bar is scaled to the largest effective rate in this run, so it
// cannot imply a rate the response did not return. At ~98% against
// ~11.5%, the difference draws itself.
// ============================================================

import {
  aprShare,
  money,
  percent,
  count,
  rankedOptions,
  productLabel,
  NOT_REPORTED,
  type AlternativeComparison,
  type ProductOption,
} from '@/lib/simulator-result';

function AprBar({
  option,
  options,
}: {
  option: ProductOption;
  options: readonly ProductOption[];
}): React.JSX.Element {
  const share = aprShare(option, options);

  // Null means there was nothing to scale against. A zero-width bar would
  // read as a rate of nothing, so nothing is drawn.
  if (share === null) {
    return <span className="text-xs text-gray-500">{NOT_REPORTED}</span>;
  }

  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-gray-200">
        <span
          className={share >= 0.999 ? 'block h-2 bg-red-500' : 'block h-2 bg-gray-500'}
          style={{ width: `${String(Math.max(2, share * 100))}%` }}
        />
      </span>
      <span className="font-semibold text-gray-900">{percent(option.effectiveApr, 1)}</span>
    </span>
  );
}

export function AlternativesBand({
  comparison,
}: {
  comparison: AlternativeComparison;
}): React.JSX.Element {
  const ranked = rankedOptions(comparison.options);
  const { primaryChoice } = comparison.recommendation;
  const { profileSummary } = comparison;

  return (
    <section
      aria-label="Alternative products"
      data-testid="alternatives-band"
      className="rounded-xl border border-gray-200 bg-white p-5 space-y-4"
    >
      <div>
        <h2 className="text-lg font-bold text-gray-900">Alternatives</h2>
        <p className="mt-1 text-sm text-gray-600">
          Ordered by the suitability score the service returned, best first. FICO{' '}
          {count(profileSummary.ficoScore)}, revenue {money(profileSummary.annualRevenue)}, existing
          debt {money(profileSummary.existingDebt)}, debt-service ratio{' '}
          {count(profileSummary.debtServiceRatio)}%.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="alternatives-table">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th scope="col" className="py-2 pr-4 font-medium">Product</th>
              <th scope="col" className="py-2 pr-4 font-medium">Suitability</th>
              <th scope="col" className="py-2 pr-4 font-medium">Effective APR</th>
              <th scope="col" className="py-2 pr-4 font-medium">Monthly</th>
              <th scope="col" className="py-2 pr-4 font-medium">Total, 24m</th>
              <th scope="col" className="py-2 pr-4 font-medium">Approval</th>
              <th scope="col" className="py-2 font-medium">Timeline</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((o) => {
              const isChosen = o.productType === primaryChoice;
              return (
                <tr
                  key={o.productType}
                  data-testid={`option-row-${o.productType}`}
                  data-recommended={isChosen ? 'true' : 'false'}
                  className={
                    isChosen
                      ? 'border-b border-gray-200 bg-gray-50'
                      : 'border-b border-gray-100 text-gray-600'
                  }
                >
                  <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                    <span
                      className={isChosen ? 'font-semibold text-gray-900' : 'text-gray-700'}
                    >
                      {productLabel(o)}
                    </span>
                    {isChosen && (
                      <span className="ml-2 rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Recommended
                      </span>
                    )}
                  </th>
                  <td className="py-2.5 pr-4">
                    <span className={isChosen ? 'font-semibold text-gray-900' : ''}>
                      {count(o.suitabilityScore)}/100
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <AprBar option={o} options={comparison.options} />
                  </td>
                  <td className="py-2.5 pr-4">{money(o.estimatedMonthlyPayment)}</td>
                  <td className="py-2.5 pr-4">{money(o.totalCost24m)}</td>
                  <td className="py-2.5 pr-4">{percent(o.approvalProbability)}</td>
                  <td className="py-2.5">{count(o.approvalTimelineDays)} days</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        {ranked.map((o) => (
          <details key={o.productType} className="rounded-lg border border-gray-200 px-4 py-2">
            <summary className="cursor-pointer text-sm text-gray-700">
              {productLabel(o)} — {count(o.pros.length)} pros, {count(o.cons.length)} cons
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ul className="space-y-1">
                {o.pros.map((p) => (
                  <li key={p} className="text-sm text-gray-700">
                    + {p}
                  </li>
                ))}
              </ul>
              <ul className="space-y-1">
                {o.cons.map((c) => (
                  <li key={c} className="text-sm text-gray-700">
                    − {c}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
