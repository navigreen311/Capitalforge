// ============================================================
// Band 4 — the how.
//
// Collapsed by default. Bands 1–3 answer whether the product is right,
// whether it is affordable and what else exists. The round schedule and
// the approval odds are mechanics: they matter once those three are
// settled, and they crowd them out if shown at the same weight.
// ============================================================

import {
  money,
  percent,
  count,
  type MultiRoundModel,
  type ApprovalProbabilityReport,
} from '@/lib/simulator-result';

export function MechanicsBand({
  model,
  approval,
}: {
  model: MultiRoundModel;
  approval: ApprovalProbabilityReport;
}): React.JSX.Element {
  return (
    <details
      className="rounded-xl border border-gray-200 bg-white p-5"
      data-testid="mechanics-band"
    >
      <summary className="cursor-pointer text-lg font-bold text-gray-900">
        How the stack is built
        <span className="ml-2 text-sm font-normal text-gray-500">
          {count(model.rounds.length)} rounds, {count(model.totalCards)} cards,{' '}
          {money(model.totalEstimatedCredit)} — target{' '}
          {model.targetMet ? 'met' : 'not met'}, {model.confidenceRating} confidence
        </span>
      </summary>

      <div className="mt-5 space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Rounds over {model.totalDuration}
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="rounds-table">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th scope="col" className="py-2 pr-4 font-medium">Round</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Wait before</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Cards</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Credit this round</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Cumulative</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Avg approval</th>
                  <th scope="col" className="py-2 font-medium">FICO impact</th>
                </tr>
              </thead>
              <tbody>
                {model.rounds.map((r) => (
                  <tr key={r.roundNumber} className="border-b border-gray-100">
                    <th scope="row" className="py-2 pr-4 text-left font-semibold text-gray-900">
                      {count(r.roundNumber)}
                    </th>
                    <td className="py-2 pr-4 text-gray-700">
                      {r.recommendedDelayDays === 0 ? 'start' : `${count(r.recommendedDelayDays)} days`}
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{count(r.cardCount)}</td>
                    <td className="py-2 pr-4 text-gray-700">{money(r.estimatedCreditTotal)}</td>
                    <td className="py-2 pr-4 font-semibold text-gray-900">
                      {money(r.cumulativeCreditTotal)}
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{percent(r.avgApprovalProbability)}</td>
                    <td className="py-2 text-gray-700">{count(r.ficoImpactEstimate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-900">Approval odds</h3>
          <dl className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-gray-500">Whole stack</dt>
              <dd className="text-sm font-semibold text-gray-900">
                {percent(approval.overallStackApprovalRate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">At least one</dt>
              <dd className="text-sm font-semibold text-gray-900">
                {percent(approval.atLeastOneApproval)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">All approved</dt>
              <dd className="text-sm font-semibold text-gray-900">
                {percent(approval.allApprovedProbability)}
              </dd>
            </div>
          </dl>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="card-breakdown-table">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th scope="col" className="py-2 pr-4 font-medium">Card</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Issuer</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Approval</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Min FICO</th>
                  <th scope="col" className="py-2 font-medium">FICO gap</th>
                </tr>
              </thead>
              <tbody>
                {approval.cardBreakdown.map((c) => (
                  <tr key={`${c.issuer}-${c.cardName}`} className="border-b border-gray-100">
                    <th scope="row" className="py-2 pr-4 text-left font-normal text-gray-900">
                      {c.cardName}
                    </th>
                    <td className="py-2 pr-4 text-gray-700">{c.issuer}</td>
                    <td className="py-2 pr-4 text-gray-700">{percent(c.approvalProbability)}</td>
                    <td className="py-2 pr-4 text-gray-700">{count(c.minFicoRequired)}</td>
                    <td
                      className={
                        c.ficoGap < 0 ? 'py-2 font-semibold text-red-700' : 'py-2 text-gray-700'
                      }
                    >
                      {count(c.ficoGap)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Risk factors</h3>
            {approval.riskFactors.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">None reported.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {approval.riskFactors.map((r) => (
                  <li key={r} className="text-sm text-gray-700">− {r}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Positive factors</h3>
            {approval.positiveFactors.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">None reported.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {approval.positiveFactors.map((p) => (
                  <li key={p} className="text-sm text-gray-700">+ {p}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
