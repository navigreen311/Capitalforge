'use client';

// ============================================================
// What a client actually does to get this score
//
// The summary on the card says whether the client has the score. This says how
// they get one — and every sentence carries the source and date it was
// verified, because an advisor repeats these to a client.
//
// Four renderers, not one. The products differ in the way that matters most:
// PAYDEX is a sequence you walk, Intelliscore is a purchase followed by a
// correction loop, Equifax is a purchase followed by an identification
// problem, and SBSS has no path at all. A single template would flatten
// exactly that difference.
//
// Content and provenance live in `lib/score-acquisition.ts`. Nothing is
// asserted here that is not stated there.
// ============================================================

import type {
  AcquisitionPath,
  Claim,
  Statement,
  Unverified,
} from '@/lib/score-acquisition';
import { isClaim } from '@/lib/score-acquisition';

// ── Provenance, rendered ─────────────────────────────────────

function Cite({ claim }: { claim: Claim }) {
  const label = `${claim.source.publisher} · verified ${claim.verifiedOn}`;
  return (
    <span className="block mt-1 text-[10px] text-gray-600">
      {claim.source.url ? (
        <a
          href={claim.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted hover:text-gray-400"
          title={claim.source.title}
        >
          {label}
        </a>
      ) : (
        <span title={claim.source.title}>{label}</span>
      )}
    </span>
  );
}

/**
 * An unverified statement, rendered as one.
 *
 * Deliberately unlike a sourced claim: amber, labelled, and carrying what
 * would settle it. A gap that renders like a fact is the defect this whole
 * module exists to prevent — and for PAYDEX the gap is a *count*, which is the
 * single most likely thing to be mistaken for a requirement.
 */
function UnverifiedNote({ note }: { note: Unverified }) {
  return (
    <div className="mt-1 rounded-md border border-amber-900/50 bg-amber-950/20 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500/90">
        Not verified
      </p>
      <p className="text-xs text-amber-200/80 leading-relaxed mt-0.5">{note.text}</p>
      <p className="text-[10px] text-amber-500/60 leading-relaxed mt-1">
        {note.whatWouldSettleIt}
      </p>
    </div>
  );
}

function Line({ statement }: { statement: Statement }) {
  if (!isClaim(statement)) return <UnverifiedNote note={statement} />;
  return (
    <div className="mt-1">
      <p className="text-xs text-gray-400 leading-relaxed">{statement.text}</p>
      <Cite claim={statement} />
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mt-3 first:mt-0">
      {children}
    </p>
  );
}

// ── The four shapes ──────────────────────────────────────────

export function AcquisitionPathDetail({ path }: { path: AcquisitionPath }) {
  return (
    <div className="mt-3 pt-3 border-t border-gray-800">
      <p className="text-xs text-gray-300 leading-relaxed">{path.summary}</p>

      {path.kind === 'build_path' && (
        <>
          <Heading>The path</Heading>
          <ol className="mt-1 space-y-2">
            {path.steps.map((step) => (
              <li key={step.n} className="flex gap-2">
                <span className="text-[10px] font-bold text-gray-600 mt-0.5 shrink-0">
                  {step.n}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-300">{step.action}</p>
                  <Line statement={step.detail} />
                </div>
              </li>
            ))}
          </ol>

          <Heading>How long it takes</Heading>
          {path.timing.map((s, i) => (
            <Line key={i} statement={s} />
          ))}

          <Heading>Free versus paid</Heading>
          {path.freeVsPaid.map((s, i) => (
            <Line key={i} statement={s} />
          ))}
        </>
      )}

      {path.kind === 'buy_and_dispute' && (
        <>
          <Heading>What it costs</Heading>
          <Line statement={path.cost} />

          <Heading>What the file is built from</Heading>
          {path.whatTheFileIsBuiltFrom.map((s, i) => (
            <Line key={i} statement={s} />
          ))}

          <Heading>Why correcting beats building</Heading>
          <Line statement={path.whyCorrectBeforeBuild} />

          {/* Set apart. This is copy an advisor may have learned elsewhere,
              and the point is to stop them repeating it. */}
          <div className="mt-3 rounded-md border border-red-900/50 bg-red-950/20 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400/90">
              Do not say this to a client
            </p>
            <p className="text-xs text-red-200/80 leading-relaxed mt-0.5">{path.caution.text}</p>
            <Cite claim={path.caution} />
          </div>
        </>
      )}

      {path.kind === 'buy_and_identify' && (
        <>
          <Heading>What it costs</Heading>
          <Line statement={path.cost} />

          <Heading>How to order it</Heading>
          <Line statement={path.howToOrder} />

          <Heading>Which score you are holding</Heading>
          <table className="mt-1 w-full text-xs">
            <tbody>
              {path.products.map((p) => (
                <tr
                  key={p.product}
                  className={p.isTheOneTracked ? 'text-gray-200' : 'text-gray-500'}
                >
                  <td className="py-0.5 pr-2">
                    {p.product}
                    {p.isTheOneTracked && (
                      <span className="ml-1 text-[10px] text-green-400">&larr; this card</span>
                    )}
                    {p.overlapsSilently && (
                      <span className="ml-1 text-[10px] text-amber-400">
                        &larr; passes validation silently
                      </span>
                    )}
                  </td>
                  <td className="py-0.5 text-right tabular-nums whitespace-nowrap">{p.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <span className="block mt-1 text-[10px] text-gray-600">
            {path.productsSource.publisher} &middot; verified {path.productsVerifiedOn}
          </span>

          {path.trap.map((s, i) => (
            <Line key={i} statement={s} />
          ))}
        </>
      )}

      {path.kind === 'no_path' && (
        <>
          <Heading>Why nobody can pull it</Heading>
          {path.whyNobodyCanPullIt.map((s, i) => (
            <Line key={i} statement={s} />
          ))}

          <Heading>The one narrow exception</Heading>
          <Line statement={path.narrowException} />

          <Heading>What actually influences it</Heading>
          {path.whatInfluencesIt.map((s, i) => (
            <Line key={i} statement={s} />
          ))}

          <Heading>What changed in 2026</Heading>
          {path.whatChanged.map((s, i) => (
            <Line key={i} statement={s} />
          ))}

          {/* The only prescriptive list on this card, and it deliberately
              contains no SBSS number — there is no current SBA figure to aim
              at, and four different ones have been quoted as such. */}
          <Heading>What to do instead</Heading>
          <ul className="mt-1 space-y-1">
            {path.whatToDoInstead.map((item) => (
              <li key={item} className="flex gap-2 text-xs text-gray-400 leading-relaxed">
                <span className="text-gray-600 shrink-0">&bull;</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
