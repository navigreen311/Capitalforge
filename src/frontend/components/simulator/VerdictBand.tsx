// ============================================================
// Band 1 — the verdict.
//
// First on the page because it answers whether this is the right
// product at all. If the answer is no, the repayment schedule for
// stacking is moot.
// ============================================================

import {
  deriveVerdict,
  productLabel,
  type AlternativeComparison,
} from '@/lib/simulator-result';

export function VerdictBand({ comparison }: { comparison: AlternativeComparison }): React.JSX.Element {
  const verdict = deriveVerdict(comparison);

  if (verdict === null) {
    return (
      <section
        aria-label="Recommendation"
        data-testid="verdict-band"
        className="rounded-xl border border-gray-300 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-gray-900">Recommendation</h2>
        <p className="mt-2 text-sm text-gray-700">
          The service named{' '}
          <span className="font-mono">{comparison.recommendation.primaryChoice}</span> as the
          recommended product, and that product is not among the options it returned. No verdict is
          shown, because stating one would mean choosing it here.
        </p>
      </section>
    );
  }

  const { chosen } = verdict;

  return (
    <section
      aria-label="Recommendation"
      data-testid="verdict-band"
      className="rounded-xl border border-gray-300 bg-white p-5 space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Recommended</p>
          <h2 className="text-2xl font-bold text-gray-900" data-testid="verdict-product">
            {productLabel(chosen)}
          </h2>
        </div>
        <p className="text-sm text-gray-600">
          Suitability{' '}
          <span className="font-semibold text-gray-900" data-testid="verdict-score">
            {chosen.suitabilityScore}/100
          </span>
        </p>
      </div>

      {verdict.kind === 'clear' && (
        <p className="text-sm text-gray-700" data-testid="verdict-clear">
          Highest suitability score of the four options.
        </p>
      )}

      {verdict.kind === 'tied' && (
        <div
          className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3"
          data-testid="verdict-tied"
        >
          <p className="text-sm font-semibold text-gray-900">Tied — not a clear winner</p>
          <p className="mt-1 text-sm text-gray-700">
            {productLabel(chosen)} scores {chosen.suitabilityScore}/100, and so does{' '}
            {verdict.tiedWith.map((o) => productLabel(o)).join(' and ')}. The service reports a
            single recommendation and breaks the tie by the order the options were built, so this
            is the first of {verdict.tiedWith.length + 1} equally scored products rather than the
            best of them.
          </p>
        </div>
      )}

      {verdict.kind === 'overridden' && (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
          data-testid="verdict-overridden"
        >
          <p className="text-sm font-semibold text-amber-900">
            Chosen by rule, not by score
          </p>
          <p className="mt-1 text-sm text-amber-900">
            {productLabel(chosen)} scores {chosen.suitabilityScore}/100.{' '}
            {verdict.outscoredBy
              .map((o) => `${productLabel(o)} scores ${String(o.suitabilityScore)}/100`)
              .join(', and ')}
            . The service overrides the ranking for a business with a FICO under 600 and under a
            year in operation, and recommends a merchant cash advance regardless of the scores.
          </p>
          <p className="mt-2 text-sm text-amber-900">
            The rule may well be right — a business in that position may have no other route. It is
            shown because the recommendation is not what the scores on this page say, and reading
            the scores alone would not tell you that.
          </p>
        </div>
      )}

      {comparison.recommendation.warnings.length > 0 && (
        <ul className="space-y-1" data-testid="verdict-warnings">
          {comparison.recommendation.warnings.map((w) => (
            <li key={w} className="text-sm text-gray-700">
              — {w}
            </li>
          ))}
        </ul>
      )}

      {/*
        The service's rationale always asserts that the chosen product
        "offers the highest suitability score". On the override path that
        is false about data in this same response, so it is not the
        headline. It is still shown — an advisor should be able to see
        what the service said — but labelled, and behind a disclosure
        when the scores contradict it.
      */}
      {verdict.kind === 'overridden' ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-600">
            Service&rsquo;s stated rationale — contradicted by the scores above
          </summary>
          <p className="mt-2 border-l-2 border-amber-300 pl-3 text-gray-600">
            {comparison.recommendation.rationale}
          </p>
        </details>
      ) : (
        <p className="border-l-2 border-gray-200 pl-3 text-sm text-gray-600">
          {comparison.recommendation.rationale}
        </p>
      )}
    </section>
  );
}
