# Issuer DNA flag: deleted as a literal, not yet built as a judgement

**Status:** open. The fabricated version is removed; no replacement was built.

## What was there

`/platform/issuers` showed a **DNA** badge on US Bank. Its source was a literal
in `ISSUERS_DATA`:

```ts
doNotApply: true,
doNotApplyReason: 'Temporarily paused — policy change under review',
```

`grep` for `doNotApply` outside that one file returned nothing. It was never
derived, never stored, never recomputed. One issuer was flagged because
somebody typed `true`.

Behind the badge sat a `dnaDetail` panel — decline count, approval rate in
window, days until auto-review, removal criteria, a recommendation. That field
was one of four the page read and the API never sent, so the panel had never
rendered once; clicking the row threw instead.

Both are deleted. Nothing replaced them in that change, deliberately: a
do-not-apply judgement is a real feature and needs scoping, not a side effect
of removing invented volumes.

## Why it is worth building

The data to derive it exists. `CardApplication` records decisions per issuer,
which is the raw material for the question a DNA flag answers: *are we sending
clients at this issuer into a wall?*

That makes this different from the volumes that were deleted alongside it. Those
could not be derived into anything meaningful — seven applications over six
issuers is roughly one each. A do-not-apply signal is a different shape: it is a
judgement about a pattern, and it can be stated with its own confidence.

## What needs deciding first

1. **What triggers it.** Consecutive declines? A rate below some threshold over
   a window? Both, with severity? A rule that fires on one decline is noise; a
   rule needing thirty will never fire on this book.

2. **The minimum sample.** Related, and the harder half. With seven
   applications total, no issuer has enough history for a rate to mean
   anything. A flag derived from n=1 is not a judgement, it is an anecdote —
   and the same trap that made `chargebackRatio` report 0.5 from a denominator
   of two. Whatever the rule is, it has to say how much evidence it had.

3. **Who clears it, and how.** The deleted panel implied an auto-review after
   a number of days. If a flag can expire on its own, that is a policy; if an
   advisor clears it, that is a write, an audit trail, and a state machine.

4. **Whether it is per-tenant or global.** A tenant's own decline history is
   the honest basis. A flag shared across tenants is a stronger signal and a
   different product — and would need care about what one tenant's outcomes
   reveal to another.

## What not to repeat

The version being deleted stated a conclusion — *do not apply* — with no
evidence, no sample size and no date, next to real issuer rules. Whatever
replaces it should carry the count it was computed from and the window it
covered, the way `issuer_rules` now carries `sourceUrl` and `lastVerified` for
every rule on that page.
