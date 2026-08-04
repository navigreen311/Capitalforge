# Eleven of seventeen issuers have no velocity rule on file

**Status:** open, not started — this is research, not engineering
**Owner needed:** someone who can cite issuer sources
**Related:** `docs/backlog/issuer-as-foreign-key.md` — where these values should live

## What the optimizer knows

`ISSUER_COOLDOWNS` in `stacking-optimizer.service.ts` decides how many days to
wait between applications. Six entries reflect a published rule. **Eleven are a
bare 30-day default** that was chosen because a number was needed.

| Researched | Days | Rule |
|---|---|---|
| `chase` | 30 | 2/30, alongside 5/24 |
| `amex` | 90 | 2/90 velocity |
| `citi` | 8 | 1/8 rule |
| `capital_one` | 180 | one card per 6 months |
| `bank_of_america` | 60 | 2/3/4 rule |

| No published rule on file | Currently |
|---|---|
| `us_bank`, `wells_fargo`, `discover`, `td_bank`, `pnc` | 30 (default) |
| `alliant`, `becu`, `first_tech`, `lake_michigan_cu`, `navy_federal`, `penfed` | 30 (default) |

The five banks had entries all along; every one was a bare 30 with nothing
behind it, indistinguishable from Amex's researched 90. The six credit unions
had no entry at all and fell to the same default through `?? 30`.

Each is now marked `source: 'unresearched_default'`, carried on the
recommendation as `cooldownSource`, and rendered on the sequencing step as
*"no published velocity rule on file for this issuer — default"*. **That makes
the gap visible. It does not close it.**

## Why it matters

Application sequencing is the product. An advisor spacing applications by these
numbers is following the plan's timing advice, and for eleven of seventeen
issuers that advice is a placeholder wearing the same clothes as the researched
ones.

Two directions of error:

- **Too short** — the application is denied for velocity, burning an inquiry and
  a client's patience. Capital One's real rule is 180 days; a 30-day default for
  an issuer with a similar policy would fail every time.
- **Too long** — the plan takes months longer than it needs to, and the intro
  APR windows the plan is built around expire in a different order than
  modelled.

The credit unions matter less today because `includeCreditUnions` is hardcoded
`false` in the run payload, so no CU card currently reaches a plan. That will
change.

## What is needed

For each of the eleven: the issuer's published application-velocity policy, or a
documented finding that none exists. Both are useful answers — "no published
rule" recorded deliberately is different from a default nobody checked.

Where a real rule is found, it is often not a single number: Bank of America's
2/3/4 and Chase's 5/24 are constraints on counts within windows, not waits.
`ISSUER_COOLDOWNS` reduces everything to days-until-next-application. Worth
deciding whether the shape is right before filling it in — the Issuer Rules
Engine (`issuer-rules.service.ts`) already models richer rules for Chase, Amex
and Citi, and the optimizer does not call it. That duplication is its own item.

## Where the values should live

Not in a service constant. `docs/backlog/issuer-as-foreign-key.md` proposes
`Issuer` as a real table with a slug key; cooldown days and whether the cooldown
is researched belong there, next to the issuer, so this stops being a code
change.
