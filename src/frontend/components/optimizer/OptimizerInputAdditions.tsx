'use client';

// ============================================================
// OptimizerInputAdditions — Additional input fields for the
// optimizer form: credit portfolio, inquiry history, business
// credit scores, state of formation, and round context.
// ============================================================

import { useMemo } from 'react';

// ─── US States ───────────────────────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC',
] as const;

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  DC:'District of Columbia',
};

// ─── Props ───────────────────────────────────────────────────────────────────

export interface OptimizerInputAdditionsProps {
  totalCreditLimit: string;
  totalBalance: string;
  inquiries90d: string;
  inquiries24mo: string;
  ficoSbss: string;
  paydex: string;
  stateOfFormation: string;
  roundContext: 'round1' | 'round2plus';
  previousRoundDate: string;
  accountsAge: string;
  onChange: (field: string, value: string) => void;
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm ' +
  'text-gray-100 placeholder:text-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-transparent';

const labelClass =
  'block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide';

const sectionTitleClass = 'text-sm font-semibold text-gray-200 mb-3';

const sectionBorderClass =
  'rounded-xl border border-gray-700 bg-gray-800/50 p-4';

// ─── Component ───────────────────────────────────────────────────────────────

export function OptimizerInputAdditions({
  totalCreditLimit,
  totalBalance,
  inquiries90d,
  inquiries24mo,
  ficoSbss,
  paydex,
  stateOfFormation,
  roundContext,
  previousRoundDate,
  accountsAge,
  onChange,
}: OptimizerInputAdditionsProps) {
  // Auto-calculate utilization
  const utilization = useMemo(() => {
    const limit = parseFloat(totalCreditLimit);
    const balance = parseFloat(totalBalance);
    if (!limit || limit <= 0 || isNaN(balance)) return '—';
    const pct = (balance / limit) * 100;
    return `${Math.min(pct, 999).toFixed(1)}%`;
  }, [totalCreditLimit, totalBalance]);

  return (
    <div className="space-y-5">
      {/* ── Section 1: Current Credit Portfolio ──────────────── */}
      <div className={sectionBorderClass}>
        <h3 className={sectionTitleClass}>Current Credit Portfolio</h3>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Total Current Credit Limit ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                type="number"
                min={0}
                placeholder="e.g. 50000"
                value={totalCreditLimit}
                onChange={(e) => onChange('totalCreditLimit', e.target.value)}
                className={`${inputClass} pl-7`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Total Current Balance ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                type="number"
                min={0}
                placeholder="e.g. 5000"
                value={totalBalance}
                onChange={(e) => onChange('totalBalance', e.target.value)}
                className={`${inputClass} pl-7`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Utilization %</label>
            <div
              className={
                'w-full rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm ' +
                'text-gray-300 cursor-not-allowed select-none'
              }
            >
              {utilization}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 2: Inquiry History ───────────────────────── */}
      <div className={sectionBorderClass}>
        <h3 className={sectionTitleClass}>Inquiry History</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Hard Inquiries (last 90d)</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={inquiries90d}
              onChange={(e) => onChange('inquiries90d', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Hard Inquiries (last 24 mo)
            </label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={inquiries24mo}
              onChange={(e) => onChange('inquiries24mo', e.target.value)}
              className={inputClass}
            />
            <p className="text-[10px] text-gray-500 mt-1">Used for Chase 5/24</p>
          </div>
        </div>
      </div>

      {/* ── Section 3: Business Credit (optional) ────────────── */}
      <div className={sectionBorderClass}>
        <h3 className={sectionTitleClass}>
          Business Credit{' '}
          <span className="text-gray-500 font-normal text-xs">(optional)</span>
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>FICO SBSS Score (/300)</label>
            <input
              type="number"
              min={0}
              max={300}
              placeholder="e.g. 220"
              value={ficoSbss}
              onChange={(e) => onChange('ficoSbss', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>D&B PAYDEX Score (/100)</label>
            <input
              type="number"
              min={0}
              max={100}
              placeholder="e.g. 80"
              value={paydex}
              onChange={(e) => onChange('paydex', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* ── Section 4: State ─────────────────────────────────── */}
      <div className={sectionBorderClass}>
        <h3 className={sectionTitleClass}>State</h3>
        <div>
          <label className={labelClass}>State of Formation</label>
          <select
            value={stateOfFormation}
            onChange={(e) => onChange('stateOfFormation', e.target.value)}
            className={inputClass}
          >
            <option value="">Select state...</option>
            {US_STATES.map((code) => (
              <option key={code} value={code}>
                {STATE_NAMES[code]} ({code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Section 5: Round Context ─────────────────────────── */}
      <div className={sectionBorderClass}>
        <h3 className={sectionTitleClass}>Round Context</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="radio"
              name="roundContext"
              checked={roundContext === 'round1'}
              onChange={() => onChange('roundContext', 'round1')}
              className="w-4 h-4 text-brand-gold border-gray-600 bg-gray-900 focus:ring-brand-gold/30"
            />
            <span className="text-sm text-gray-300 group-hover:text-gray-100 transition-colors">
              Round 1 — Fresh start
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="radio"
              name="roundContext"
              checked={roundContext === 'round2plus'}
              onChange={() => onChange('roundContext', 'round2plus')}
              className="w-4 h-4 text-brand-gold border-gray-600 bg-gray-900 focus:ring-brand-gold/30"
            />
            <span className="text-sm text-gray-300 group-hover:text-gray-100 transition-colors">
              Round 2+ — Cards from previous round(s) aging
            </span>
          </label>

          {roundContext === 'round2plus' && (
            <div className="grid grid-cols-2 gap-3 mt-2 pl-6 border-l-2 border-gray-700">
              <div>
                <label className={labelClass}>Previous Round Date</label>
                <input
                  type="date"
                  value={previousRoundDate}
                  onChange={(e) => onChange('previousRoundDate', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Accounts Age (months)</label>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 6"
                  value={accountsAge}
                  onChange={(e) => onChange('accountsAge', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
