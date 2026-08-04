# Should the optimizer plan past Chase 5/24?

**Status:** open, not started — this is a product decision, not a bug
**Surfaced by:** the 5/24 reporting work, 2026-08-04

## What happens now

The optimizer **reports** 5/24 and does not **enforce** it. At `maxCards: 20`
against a client with five open slots, it recommends **17 bank cards** — twelve
past the limit — and now says so:

> This plan cannot be executed as sequenced — 12 cards past the Chase 5/24 limit.

Before this, `chase524HeadroomAfter` was clamped at zero, so that plan reported
`0`. Technically true, and it reads as "you are at the limit" rather than "you
are twelve past it".

Reporting was the right first step: the optimizer has never enforced this, and
adding enforcement silently would have changed what plans it produces without
anyone deciding that it should. But leaving it here means the product knowingly
recommends a sequence that cannot be executed.

## Why this is not obviously a bug

A plan past 5/24 is not necessarily wrong.

- The limit binds **Chase** applications, not the others. A seventeen-card plan
  where the Chase cards come first is executable; the same plan in a different
  order is not. The optimizer sequences, so it is in a position to know.
- Credit union cards are exempt, which is the whole reason the credit union pass
  exists. A plan can go past five *total* cards and remain within 5/24.
- An advisor may want the full picture — "here is everything you qualify for" —
  and sequence it across more than 24 months deliberately.

## The three options

### A. Refuse to plan past the limit

Stop admitting bank cards once headroom is exhausted.

- **For:** every plan is executable as printed. No advisor carries an
  impossible sequence to a client.
- **Against:** hides capacity the client genuinely has. Someone with five slots
  and $500k of qualifying capacity sees five cards and no indication the rest
  exists. It also makes the plan silently depend on 5/24 headroom, which is
  derived from a `CardApplication` history that may be incomplete — a client
  whose old cards were never recorded gets a fuller plan than one whose were.
- **Risk:** the failure is invisible. A truncated plan looks like a small plan.

### B. Plan past it, warn clearly *(what is built today)*

- **For:** shows the whole opportunity and names the constraint. Nothing is
  hidden, and the advisor decides.
- **Against:** the warning is one panel against seventeen recommendation cards.
  It is the weakest position on any output where the advisor is scrolling.
- **Risk:** warning fatigue. A plan that always exceeds the limit trains people
  past the notice — the same failure as a banner that fires on every run.

### C. Split into executable and aspirational phases

"Phase 1 — executable now (5 cards, within 5/24). Phase 2 — after your 5/24
window clears in *N* months, or via credit unions now."

- **For:** answers the question the advisor is actually asking. Keeps the full
  capacity visible while making the executable subset unambiguous. It also gives
  credit unions a natural place: they are exempt, so they belong in phase 1
  regardless of bank headroom — which is exactly the strategic case the CU panel
  was built for.
- **Against:** most work. Needs a real date model — when does the oldest card in
  the window age out — and the plan shape grows a phase dimension that the UI,
  the saved strategy and the funding round all have to carry.
- **Risk:** phases invite a false precision about *when* the window clears,
  which depends on application dates the system may not hold.

## My read

**C, eventually. B until then — which is where it now is.**

A is the tempting one and I think it is wrong. Truncating to what fits produces
a plan that looks complete and is not, and that is the failure mode this codebase
has spent a long time removing: an absence indistinguishable from an answer. It
also makes plan size a function of how complete the client's application history
happens to be, which is a data-quality artefact rather than a strategy.

C is right because the phase split is not presentation — it is the actual
recommendation. "Five now, three more in eleven months, or two credit unions now
instead" is what an advisor would say out loud, and the optimizer already holds
every input needed to say it: sequencing, cooldowns, 5/24 headroom, and the
credit union exemption.

The thing that blocks C is the date model. Headroom is currently a count, not a
timeline — the plan knows *how many* slots are free but not *when* the next one
opens, because that needs the oldest in-window application date and
`CardApplication.submittedAt` is not reliably populated on historical rows. That
should be established first, and it is worth doing regardless: the sequencing
timeline has the same gap.

**Not to be built as part of the reporting work.** Whichever option is chosen
changes what the optimizer recommends, and that deserves its own decision.
