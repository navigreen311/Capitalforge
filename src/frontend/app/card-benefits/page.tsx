'use client';

// ============================================================
// /card-benefits — benefits on a client's cards, from card_benefits
//
// The page held three cards as literals — Amex Business Platinum at $695,
// Chase Sapphire Reserve at $550, Amex Business Gold at $375 — with twelve
// benefits between them, a "$2,450 left on the table" figure, renewal
// recommendations of keep, negotiate or cancel per card, and a client picker
// offering Acme Corp, Sterling Partners, Redwood Holdings and two more that
// do not exist.
//
// The API behind it was mock too: GET returned the same twelve benefits for
// any clientId, mark-used wrote to a module-level object that emptied on
// restart while answering 200, and the export produced a text report with
// those numbers typed into it — a document somebody could send to a client.
// All three now read and write card_benefits, scoped to the tenant.
//
// Two affordances are gone rather than rebuilt:
//
//   Log cancellation. It POSTed to /api/v1/card-benefits/cancel, which does
//   not exist, caught the failure with a comment saying to ignore network
//   errors because it was a mock, and then updated the card in React state so
//   the screen showed the cancellation as recorded. Nothing stored it.
//
//   Renewal recommendations. "Keep", "negotiate" and "cancel" per card were
//   literals in the fixture. Deciding whether a client should keep paying an
//   annual fee is advice about their money, and nothing computes it.
// ============================================================

import { useCallback, useMemo, useState } from 'react';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import { apiClient } from '@/lib/api-client';
import { toCardBenefitsView, type BenefitView } from '@/lib/card-benefits-view';
import { toCreditBuilderClients } from '@/lib/credit-view';
import { CapabilityState } from '@/components/ui/capability-state';

// ─── Issuer contact reference ────────────────────────────────────────────────
//
// Public support numbers for card issuers. Reference material about third
// parties, like the vendor list on /credit-builder — not drawn from any record
// in this system, and not specific to any client.

const ISSUER_PHONE_DIRECTORY: Record<string, string> = {
  'American Express': '1-800-528-4800',
  Chase: '1-800-935-9935',
  Citibank: '1-800-950-5114',
  'Capital One': '1-800-227-4825',
  'Wells Fargo': '1-800-869-3557',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const money = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function benefitState(b: BenefitView): { label: string; cls: string } {
  if (b.utilized) return { label: 'Used', cls: 'bg-green-900 text-green-300 border-green-700' };
  if (b.expiresAt !== null && new Date(b.expiresAt).getTime() < Date.now()) {
    return { label: 'Expired', cls: 'bg-red-900 text-red-300 border-red-700' };
  }
  return { label: 'Not used', cls: 'bg-gray-800 text-gray-400 border-gray-700' };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CardBenefitsPage() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const {
    data: clientsRaw,
    isLoading: clientsLoading,
    error: clientsError,
  } = useAuthFetch<unknown>('/api/v1/clients?pageSize=100');

  const clients = useMemo(() => toCreditBuilderClients(clientsRaw), [clientsRaw]);
  const selectedId = clientId ?? clients[0]?.id ?? null;
  const selectedName = clients.find((c) => c.id === selectedId)?.legal_name ?? null;

  const {
    data: raw,
    isLoading,
    error,
    refetch,
  } = useAuthFetch<unknown>(`/api/card-benefits/${selectedId}`);

  const view = useMemo(() => toCardBenefitsView(raw), [raw]);
  const figuresKnown = view.loaded && !isLoading && error === null;

  const markUsed = useCallback(
    async (cardId: string, benefitId: string) => {
      setBusy(true);
      setActionError(null);
      try {
        await apiClient.post(`/card-benefits/${cardId}/benefits/${benefitId}/mark-used`);
        await refetch();
      } catch (err) {
        setActionError(
          `Could not record that benefit as used: ${
            err instanceof Error ? err.message : 'the request failed'
          }`,
        );
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  const exportReport = useCallback(async () => {
    if (selectedId === null) return;
    setBusy(true);
    setActionError(null);
    setReport(null);
    try {
      const res = await apiClient.post<{ report: string }>(
        `/card-benefits/${selectedId}/export`,
      );
      setReport(res.data?.report ?? null);
    } catch (err) {
      setActionError(
        `Could not build the report: ${err instanceof Error ? err.message : 'the request failed'}`,
      );
    } finally {
      setBusy(false);
    }
  }, [selectedId]);

  const issuers = useMemo(
    () => [...new Set(view.cards.map((c) => c.issuer))].filter((i) => i in ISSUER_PHONE_DIRECTORY),
    [view.cards],
  );

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Card Benefits</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            What is recorded against each card, and what has been used.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || selectedId === null}
          onClick={() => void exportReport()}
          className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          Export report
        </button>
      </div>

      {/* ── Client picker ──────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
        <label htmlFor="card-benefits-client" className="text-xs text-gray-400 font-medium">
          Client
        </label>
        {clientsLoading ? (
          <p className="text-sm text-gray-500">Loading clients…</p>
        ) : clientsError !== null ? (
          <p className="text-sm text-red-300">
            The client list could not be read, so no client is selected.
          </p>
        ) : clients.length === 0 ? (
          <p className="text-sm text-gray-500">No clients on this tenant yet.</p>
        ) : (
          <select
            id="card-benefits-client"
            value={selectedId ?? ''}
            onChange={(e) => {
              setClientId(e.target.value);
              setReport(null);
            }}
            className="w-full sm:w-96 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legal_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {actionError !== null && (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-4">
          <p className="text-sm font-semibold text-red-300">{actionError}</p>
        </div>
      )}

      {/* ── Summary ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: 'Benefits on record',
            value: figuresKnown ? String(view.summary.totalBenefits) : '—',
            sub: figuresKnown ? `across ${view.cards.length} cards` : 'Not read',
          },
          {
            label: 'Used',
            value: figuresKnown ? String(view.summary.utilized) : '—',
            sub: figuresKnown ? `of ${view.summary.totalBenefits}` : 'Not read',
          },
          {
            label: 'Expiring soon',
            value: figuresKnown ? String(view.summary.expiringSoon) : '—',
            sub: 'within 60 days',
          },
          {
            label: 'Unused value',
            // Null when no unused benefit carries a value. $0 would say the
            // client is leaving nothing on the table, which is a claim.
            value:
              figuresKnown && view.summary.estimatedUnusedValue !== null
                ? money(view.summary.estimatedUnusedValue)
                : '—',
            sub:
              !figuresKnown
                ? 'Not read'
                : view.summary.estimatedUnusedValue === null
                  ? 'No unused benefit carries a value'
                  : `from ${view.summary.valuedBenefits} of ${view.summary.totalBenefits} valued`,
          },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">
              {c.label}
            </p>
            <p className="text-2xl font-bold text-white tabular-nums">{c.value}</p>
            <p className="text-xs text-gray-500">{c.sub}</p>
          </div>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading card benefits…</p>}

      {!isLoading && error !== null && (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-4 space-y-1">
          <p className="text-sm font-semibold text-red-300">
            Card benefits could not be read{selectedName === null ? '' : ` for ${selectedName}`}.
          </p>
          <p className="text-xs text-red-200">No benefits are shown.</p>
        </div>
      )}

      {figuresKnown && view.cards.length === 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <p className="text-sm text-gray-300">No cards are recorded for this client.</p>
          <p className="text-xs text-gray-500 mt-1">
            Benefits hang off a card application. Until one exists there is nothing to
            track, which is why this is empty rather than showing a sample card.
          </p>
        </div>
      )}

      {/* ── Expiring ───────────────────────────────────────────── */}
      {figuresKnown && view.expiring.length > 0 && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-900/10 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-amber-200">Expiring within 60 days</h2>
          <ul className="space-y-2">
            {view.expiring.map((b) => (
              <li
                key={b.benefitId}
                className="flex items-center justify-between gap-4 text-sm flex-wrap"
              >
                <span className="text-gray-200">{b.name}</span>
                <span className="text-xs text-amber-300">
                  {b.value === null ? 'value not recorded' : money(b.value)} ·{' '}
                  {b.daysRemaining} days left
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Cards ──────────────────────────────────────────────── */}
      {figuresKnown &&
        view.cards.map((card) => (
          <div key={card.cardId} className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-gray-200">
                  {card.issuer} {card.product}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {card.annualFee === null
                    ? 'Annual fee not recorded'
                    : `${money(card.annualFee)} annual fee`}{' '}
                  · {card.status}
                </p>
              </div>
              {card.issuer in ISSUER_PHONE_DIRECTORY && (
                <span className="text-xs text-gray-500">
                  {card.issuer}: {ISSUER_PHONE_DIRECTORY[card.issuer]}
                </span>
              )}
            </div>

            {card.benefits.length === 0 ? (
              <p className="text-xs text-gray-500">No benefits are recorded on this card.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500">
                    <th className="pb-2 font-medium">Benefit</th>
                    <th className="pb-2 font-medium">Value</th>
                    <th className="pb-2 font-medium">Expires</th>
                    <th className="pb-2 font-medium">State</th>
                    <th className="pb-2 font-medium sr-only">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {card.benefits.map((b) => {
                    const state = benefitState(b);
                    return (
                      <tr key={b.benefitId} className="border-t border-gray-800">
                        <td className="py-2 text-gray-200">{b.name}</td>
                        <td className="py-2 text-gray-300 tabular-nums">
                          {/* Not $0: nothing recorded is not a benefit worth nothing. */}
                          {b.value === null ? (
                            <span className="italic text-gray-500">not recorded</span>
                          ) : (
                            money(b.value)
                          )}
                        </td>
                        <td className="py-2 text-gray-400">{formatDate(b.expiresAt)}</td>
                        <td className="py-2">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${state.cls}`}
                          >
                            {state.label}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          {!b.utilized && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void markUsed(card.cardId, b.benefitId)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50 transition-colors"
                            >
                              Mark used
                            </button>
                          )}
                          {b.utilized && b.utilizedDate !== null && (
                            <span className="text-xs text-gray-500">
                              {formatDate(b.utilizedDate)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ))}

      {/* ── Export output ──────────────────────────────────────── */}
      {report !== null && (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5 space-y-2">
          <h2 className="text-sm font-semibold text-gray-200">Report</h2>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">{report}</pre>
        </div>
      )}

      {/* ── Issuer contacts ────────────────────────────────────── */}
      {issuers.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-2">
          <h2 className="text-sm font-semibold text-gray-200">Issuer contacts</h2>
          <p className="text-xs text-gray-500">
            Public support numbers for the issuers of the cards above. Reference only —
            not held against any record in this system.
          </p>
          <ul className="text-xs text-gray-400 space-y-1">
            {issuers.map((issuer) => (
              <li key={issuer}>
                {issuer}: {ISSUER_PHONE_DIRECTORY[issuer]}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── What this page no longer claims ────────────────────── */}
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">Not shown here</h2>

        <CapabilityState
          tone="dark"
          state="not_built"
          size="section"
          title="Logging a cancellation"
          detail="The button posted to an endpoint that does not exist, ignored the failure and updated the screen anyway — so a card showed as cancelled with nothing recorded."
          unblock={{
            kind: 'unblocked_by',
            text: 'an endpoint that records a cancellation, and a button that reports a failed write instead of painting success over it.',
          }}
        />

        <CapabilityState
          tone="dark"
          state="not_built"
          size="section"
          title="Keep, negotiate or cancel advice"
          detail="Those recommendations were fixed strings in the fixture."
          unblock={{
            kind: 'unblocked_by',
            text: 'a computation over the fee actually charged and the benefits actually used. Whether a client should keep paying an annual fee is advice about their money, so it waits on real inputs rather than a plausible default.',
          }}
        />
      </div>
    </div>
  );
}
