# P1-A acceptance record — Chase 5/24 credit union exemption

**Run date:** 2026-08-04
**Result:** PASS, both arms
**Records:** the acceptance criteria agreed when P1-A was scoped

## What was run

Two arms of the same client profile, differing only in `includeCreditUnions`.

| | CUs off | CUs on |
|---|---|---|
| Cards in plan | 8 | 8 |
| Counted against 5/24 | 8 | 5 |
| Exempt from 5/24 | **0** | **3** |
| Slots remaining | **−3** | **−3** |

## Why these particular numbers are the proof

**`exempt` moves 0 → 3.** This is the assertion under test. Credit union
applications do not drive Chase 5/24, and before this work the counter
included them — which told a client who had taken the recommended credit union
cards that they had exhausted their Chase eligibility when they had not. Three
CU cards entering the plan and three cards leaving the 5/24 count is that rule
working end to end.

**Slots remaining is −3 in both arms, unclamped.** This is why the run is worth
recording rather than merely passing. An earlier acceptance attempt met every
stated criterion while proving nothing, because `max(0, 5 − 17)` floors at zero
in both arms — both arms reported `0` and the number could not move. A negative
value that survives to the output is the evidence that the clamp is gone and
that the figure is a real measurement rather than a floor.

`−3` also carries the finding the user ruled on separately: the plan is three
cards past what 5/24 permits, and it says so instead of reporting `0` and
reading as "you are exactly at the limit". Reporting, not enforcement — see
`docs/backlog/chase-524-enforcement.md`, which remains open as a product
decision.

**Counts hold at 8/8.** The exemption changes what is *counted*, not what is
*recommended*. If plan size had moved between arms, the exemption would be
altering selection rather than accounting, and the two effects would be
impossible to separate in the output.

## Standing caveat, not part of this record

The 5/24 panel derives slots from approved applications only, while Inputs Used
shows a held Chase card that the panel does not reflect. That is a separate
defect, deferred deliberately, and it does not affect what this run measures —
both arms read the same application history, so the exemption delta is sound
regardless of whether the baseline is right.
