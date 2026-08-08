// ============================================================
// The scenario result, in four bands.
//
// Ordered by the question each answers: is this the right product, can
// they afford it, what else is there, and how would it be built. The
// last is collapsed — it is mechanics, and it crowds out the first three
// at equal weight.
//
// Before this, the page rendered the whole response through one loop
// that JSON.stringify'd anything non-primitive, so all four objects
// arrived as raw JSON.
// ============================================================

import type { ScenarioResult } from '@/lib/simulator-result';
import { VerdictBand } from './VerdictBand';
import { AffordabilityBand } from './AffordabilityBand';
import { AlternativesBand } from './AlternativesBand';
import { MechanicsBand } from './MechanicsBand';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Whether the response carries the four objects this view renders.
 *
 * Checked rather than assumed: if the service changes shape, this should
 * say so and fall back to showing the response, not render a page of
 * dashes and empty tables that looks like a scenario with no numbers in
 * it.
 */
export function isScenarioResult(value: unknown): value is ScenarioResult {
  if (!isRecord(value)) return false;

  const comparison = value['alternativeComparison'];
  const repayment = value['worstCaseRepayment'];
  const model = value['multiRoundModel'];
  const approval = value['approvalProbabilityReport'];

  return (
    isRecord(comparison) &&
    Array.isArray(comparison['options']) &&
    isRecord(comparison['recommendation']) &&
    isRecord(repayment) &&
    Array.isArray(repayment['monthlySchedule']) &&
    isRecord(model) &&
    Array.isArray(model['rounds']) &&
    isRecord(approval) &&
    Array.isArray(approval['cardBreakdown'])
  );
}

export function ScenarioResultView({ result }: { result: unknown }): React.JSX.Element {
  if (!isScenarioResult(result)) {
    return (
      <section
        aria-label="Result"
        data-testid="result-unrecognised"
        className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-3"
      >
        <h2 className="text-sm font-semibold text-amber-900">
          The scenario ran, and the response is not the shape this page reads
        </h2>
        <p className="text-sm text-amber-900">
          One of <span className="font-mono">alternativeComparison</span>,{' '}
          <span className="font-mono">worstCaseRepayment</span>,{' '}
          <span className="font-mono">multiRoundModel</span> or{' '}
          <span className="font-mono">approvalProbabilityReport</span> is missing or not the
          expected type. The response is below rather than a set of empty fields, which would look
          like a scenario that returned nothing.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-white p-3 text-xs text-gray-800">
          {JSON.stringify(result, null, 2)}
        </pre>
      </section>
    );
  }

  return (
    <div className="space-y-4" data-testid="scenario-result">
      <VerdictBand comparison={result.alternativeComparison} />
      <AffordabilityBand path={result.worstCaseRepayment} />
      <AlternativesBand comparison={result.alternativeComparison} />
      <MechanicsBand
        model={result.multiRoundModel}
        approval={result.approvalProbabilityReport}
      />
    </div>
  );
}
