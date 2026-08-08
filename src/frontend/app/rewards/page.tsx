'use client';

// ============================================================
// /rewards — card benefits on record
//
// This page held CARD_SUMMARIES, SPEND_ROUTES and CATEGORY_BESTS — cards
// with earn rates, annual fees, renewal dates and "best card for this
// category" recommendations — and called nothing.
//
// A recommendation to route spend to a particular card is advice about
// money. It has to come from cards a client actually holds.
//
//   GET /api/businesses/:id/benefits — the benefits on record
//   GET /api/businesses/:id/rewards/held-cards — cards held, and what they earn
//
// That first endpoint was unreachable: it was registered at /benefits while
// its handler read a :id parameter the path never supplied. The path this
// file calls is the one its own header documents.
//
// The held-cards section states earn rates, so what it does with a card it
// cannot identify matters more than what it does with one it can. An
// unmatched card is listed with the reason it did not resolve. It is never
// dropped from the table and never shown a flat rate: a card missing from
// the client's own page is invisible, and an invented rate is a claim about
// their money produced by a failed string match.
//
// Still absent, deliberately: best-card-per-category. See the endpoint note.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { loadJson, toLoadError } from '@/lib/load-json';
import { CapabilityState } from '@/components/ui/capability-state';

interface ClientOption {
  id: string;
  businessName: string;
}

interface BenefitRow {
  id: string;
  benefitName?: string | null;
  issuer?: string | null;
  category?: string | null;
  utilized?: boolean;
  expiresAt?: string | null;
}

interface BenefitsPayload {
  benefits?: BenefitRow[];
  totalBenefits?: number;
  utilizedCount?: number;
  pendingAlerts?: number;
}

interface RewardTier {
  category: string;
  rate: number;
  unit: 'percent' | 'multiplier';
  annualCap?: number;
}

type HeldCardMatch =
  | {
      status: 'matched';
      catalogCardId: string;
      catalogCardName: string;
      rewardsType: string | null;
      rewardsTiers: RewardTier[];
      annualFee: number;
    }
  | { status: 'unmatched'; reason: string; explanation: string };

interface HeldCardRow {
  id: string;
  issuer: string;
  productName?: string | null;
  openedAt?: string | null;
  closedAt?: string | null;
  creditLimit?: number | null;
  match: HeldCardMatch;
}

interface HeldCardsPayload {
  heldCards?: HeldCardRow[];
  totalHeld?: number;
  matchedCount?: number;
  unmatchedCount?: number;
  provenance?: string;
}

function money(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value)
    : '—';
}

/**
 * Render one earn tier.
 *
 * The catalogue stores cash back as a fraction (0.05) and points as a
 * multiplier (3). Formatting them identically would print "0.05x" beside
 * "3x" — the same collapse that put "0.02% cash back" next to "2% cash
 * back" in the card list when two seed sources disagreed on the convention.
 */
function tierRate(tier: RewardTier): string {
  return tier.unit === 'percent'
    ? `${(tier.rate * 100).toFixed(tier.rate * 100 % 1 === 0 ? 0 : 1)}% back`
    : `${tier.rate}x points`;
}

function HeldCardCard({ card }: { card: HeldCardRow }) {
  const { match } = card;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">
            {card.productName ?? <span className="text-gray-400">Product not recorded</span>}
          </p>
          <p className="text-xs text-gray-500">{card.issuer}</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>Limit {money(card.creditLimit)}</p>
          <p>
            {/* An unrecorded opening date is the common case and is why the
                5/24 answer is "at most N slots open". It is stated, not
                blanked. */}
            {card.openedAt != null
              ? `Opened ${card.openedAt.slice(0, 10)}`
              : 'Opening date not recorded'}
          </p>
        </div>
      </div>

      {match.status === 'matched' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-gray-500">
            <span>Rates from {match.catalogCardName}</span>
            {match.annualFee > 0 && <span>· {money(match.annualFee)} annual fee</span>}
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {match.rewardsTiers.map((tier) => (
                <tr key={tier.category}>
                  <td className="py-1.5 pr-3 text-gray-700">{tier.category}</td>
                  <td className="py-1.5 text-right font-medium text-gray-900 whitespace-nowrap">
                    {tierRate(tier)}
                  </td>
                  <td className="py-1.5 pl-3 text-right text-xs text-gray-500 whitespace-nowrap">
                    {/* A cap is part of the rate. 5% on the first $25,000 is
                        not 5%, and omitting the cap overstates the earn on
                        exactly the categories a client spends most in. */}
                    {tier.annualCap != null ? `first ${money(tier.annualCap)}/yr` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold text-amber-900">
            Product not matched to the rate catalogue
          </p>
          <p className="mt-0.5 text-xs text-amber-800">{match.explanation}</p>
          <p className="mt-1 text-xs text-amber-700">
            The card is on record; its earn rates are not. No rate is shown rather than a
            default one.
          </p>
        </div>
      )}
    </div>
  );
}

export default function RewardsPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState<BenefitsPayload | null>(null);
  const [held, setHeld] = useState<HeldCardsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heldError, setHeldError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = (await loadJson<ClientOption[] | null>('/api/clients?limit=200')) ?? [];
        setClients(list);
        if (list.length > 0) setSelected(list[0].id);
        else setLoading(false);
      } catch (e) {
        setError(`Benefits could not be loaded. ${toLoadError(e).message}`);
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async (businessId: string) => {
    setLoading(true);
    setError(null);
    setHeldError(null);
    try {
      // The two reads are independent, and a failure of either is reported
      // rather than rendered as an empty result — "no cards on record" and
      // "the cards could not be read" are different sentences, and only one
      // of them is a fact about the client.
      const [benefitsResult, heldResult] = await Promise.all([
        loadJson<BenefitsPayload>(
          `/api/businesses/${encodeURIComponent(businessId)}/benefits`,
        )
          .then((value) => ({ loaded: true as const, value }))
          .catch(() => ({ loaded: false as const, value: null })),
        loadJson<HeldCardsPayload>(
          `/api/businesses/${encodeURIComponent(businessId)}/rewards/held-cards`,
        )
          .then((value) => ({ loaded: true as const, value }))
          .catch((e: unknown) => ({
            loaded: false as const,
            value: null,
            message: toLoadError(e).message,
          })),
      ]);

      setData(benefitsResult.value ?? null);
      if (!benefitsResult.loaded) setError('Could not reach the server.');

      setHeld(heldResult.value ?? null);
      if (!heldResult.loaded) {
        setHeldError(
          `The cards this client holds could not be read. ${'message' in heldResult ? heldResult.message : ''}`.trim(),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected !== '') void load(selected);
  }, [selected, load]);

  const benefits = data?.benefits ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rewards</h1>
          <p className="text-sm text-gray-500 mt-1">Card benefits recorded against a client.</p>
        </div>

        {clients.length > 0 && (
          <div>
            <label htmlFor="rw-client" className="block text-xs text-gray-500 mb-1">
              Client
            </label>
            <select
              id="rw-client"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && (
        <section aria-label="Cards held" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Cards held</h2>
            {held?.totalHeld != null && held.totalHeld > 0 && (
              <p className="text-xs text-gray-500">
                {/* The matched count never stands alone. Showing only the
                    matched cards' rates while reporting "3 cards" would make
                    an unresolved card look like one with no rewards. */}
                {held.matchedCount} of {held.totalHeld} matched to the rate catalogue
              </p>
            )}
          </div>

          {heldError !== null && (
            <CapabilityState state="failed" title="The cards this client holds could not be read" detail={heldError} />
          )}

          {heldError === null && (held?.heldCards ?? []).length === 0 && (
            <CapabilityState
              state="no_data"
              title="No card on record as held by this client"
              detail="Held cards are advisor-attested; none is inferred from an application, because an approved application does not say a card was opened, or is still open. Attest one and its earn rates appear here."
            />
          )}

          {(held?.heldCards ?? []).length > 0 && (
            <>
              <div className="grid gap-3 lg:grid-cols-2">
                {held!.heldCards!.map((card) => (
                  <HeldCardCard key={card.id} card={card} />
                ))}
              </div>
              {held?.provenance != null && (
                <p className="text-xs text-gray-500">{held.provenance}</p>
              )}
            </>
          )}
        </section>
      )}

      {!loading && error === null && data !== null && (
        <>
          {benefits.length === 0 ? (
            <p className="text-sm text-gray-500">
              No benefit is recorded for this client. Benefits are attached to cards a client
              holds; none is assumed from the product name.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Benefit</th>
                    <th className="px-4 py-3 text-left">Issuer</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left">Used</th>
                    <th className="px-4 py-3 text-left">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {benefits.map((b) => (
                    <tr key={b.id}>
                      <td className="px-4 py-3 text-gray-900">{b.benefitName ?? b.id}</td>
                      <td className="px-4 py-3 text-gray-600">{b.issuer ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{b.category ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{b.utilized === true ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {b.expiresAt?.slice(0, 10) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section
            aria-label="What is not here"
            className="rounded-xl border border-gray-200 bg-white p-5 space-y-2"
          >
            <h2 className="text-sm font-semibold text-gray-900">What is not here</h2>

            <CapabilityState
              state="not_built"
              size="section"
              title="Best card per category"
              detail="The cards above are the ones this client holds and what each earns — not a recommendation about where to put spend. The optimisation endpoint ranks the whole card catalogue from categories and amounts a caller supplies, so its answer is about the market rather than about this client."
              unblock={{
                kind: 'unblocked_by',
                text: "mapping the transaction categories in MCC_RISK_MAP onto the optimiser's thirteen MccCategory values. They are different vocabularies, and mapping them carelessly produces confident routing advice computed from mis-bucketed spend, which is worse than none.",
              }}
            />

            <p className="text-xs text-gray-600 leading-relaxed">
              Rates for a card whose product name does not match the catalogue. Those cards are
              listed with the reason rather than dropped, and no default rate is substituted.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
