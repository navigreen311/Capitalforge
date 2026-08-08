# Spend governance — flags that no rule produced, and categories that cannot hold them

Two findings from the spend-governance risk-summary work. Neither is fixed
by that change; both are recorded here because both will outlive it.

Status: **open**. Raised 2026-08-07 alongside
`ai-feature/spend-governance-honest-risk-summary`.

---

## 1. The seed encodes behaviour the service cannot generate

`prisma/seed.ts` writes `seed-txn-002` with the flag set by hand:

```ts
flagged: true,
flagReason: 'Personal-likely merchant over the documentation threshold.',
```

`assessTransactionRisk` never ran on this row. Three things follow, and the
third is the one that matters.

**The reason string is not one the service can produce.** There are exactly
four `flagReason` templates in `assessTransactionRisk` — cash-like MCC,
suspicious rail, merchant-name match, and score-over-threshold. None of them
generates that sentence, or anything like it.

**The rule it names does not exist in this service.** "Personal-likely
merchant over the documentation threshold" is the condition
`checkNetworkRuleCompliance` evaluates, in a different code path, against
different inputs. The seed comment says so plainly. So the fixture describes
one subsystem's rule while sitting in another subsystem's table.

**Nothing can fail because of this.** The row satisfies the schema. It reads
correctly to a human. Every test touching it passes, and would keep passing
if `assessTransactionRisk` were deleted outright — because the fixture never
called it. A test built on this row proves that the *display* handles a
flagged transaction. It proves nothing about whether the system flags
transactions, which is the property anyone reading the test name would
assume it covers.

This is the shape CLAUDE.md warns about from the other direction: a passing
test is not evidence the behaviour it asserts is correct. Here it is worse
than that — the assertion is not attached to the behaviour at all. The
fixture is a hand-drawn picture of an output, and the code that would
produce that output is not in the loop.

The flag itself is legitimate data. An advisor should see it, and after the
summary fix they will. But "on what rule?" has no answer inside this
service, and that is the defect.

### What to do

Seed through `recordTransaction` rather than `prisma.spendTransaction.create`,
so the fixture is whatever the scoring rules actually produce for a given
MCC, amount and merchant. If a fixture is needed that the rules cannot
produce, that is a signal the rule is missing — write the rule.

Note this also reaches the two MCC values: the seed hardcodes
`mccCategory: 'office_supplies'` for MCC 5111 and `'personal_likely'` for
5712, and neither code is in `MCC_RISK_MAP`. Run through `scoreMcc` both
would come back `unclassified` at score 20. The seed asserts a
classification the catalogue does not contain — the same defect in
miniature, and the reason both rows carry `riskScore: null`.

---

## 2. The three category arrays are non-exhaustive over flagged rows by construction

`RiskSummary` carried `flaggedCount` alongside three arrays, and no array
containing the flagged rows. This was not a fixture accident. The four
quantities key off four independent fields:

| Quantity | Predicate |
|---|---|
| `flaggedCount` | `flagged` |
| `highRiskTransactions` | `riskScore >= 60` |
| `cashLikeTransactions` | `isCashLike` |
| `suspiciousRailTransactions` | `mcc ∈ {6051, 4829, 6540, 7995}` |

`assessTransactionRisk` sets `flagged` from a four-term disjunction, and one
of those terms — the merchant-name regex at `spend-governance.service.ts:253`
— corresponds to none of the three arrays.

**The worked case.** A $50 transfer to a merchant named `Zelle Transfer` at
MCC 5812 (Restaurants):

- base score 25 from the MCC, +15 for the merchant-name match = **40**
- `isCashLike` false — 5812 is not a cash-like code
- `suspiciousRail` false — 5812 is not in `SUSPICIOUS_RAIL_MCCS`
- 40 < 60, so not high-risk

`flagged: true`, and it appears in **none of the three arrays**. This is a
real production path, not a seed artifact: it is the P2P-rail detection
working exactly as designed.

So any consumer built on the three arrays loses flagged transactions
permanently, and loses precisely the ones the merchant-name heuristic exists
to catch. The seed made this visible by having all three arrays empty at
once; removing the seed would hide it again without fixing it.

### What was done

`flaggedTransactions` now ships in the summary, capped at `sampleLimit` with
the exact `flaggedCount` beside it. `tests/unit/services/spend-governance.test.ts`
covers the Zelle case directly, asserting the row is absent from all three
categories and present in `flaggedTransactions`.

### What remains

The underlying asymmetry is unchanged: `flagged` is still a fourth
independent field rather than a derived union of named categories. Adding a
fifth flag reason tomorrow will not add a category, and the same gap reopens
for any consumer that reasons over categories instead of over
`flaggedTransactions`. The durable fix is to make the flag reasons a typed
enum on the record, so every flag carries the category that produced it and
the arrays are a partition rather than three overlapping filters.

---

## The pattern shared by both

A number was reported that could not be traced to the rows behind it, and
nothing failed. `flaggedCount: 1` rendered next to a table showing "—" in
every Flag cell; the count was right, the rows were right, and the link
between them existed in neither the service nor the page. Same family as the
5/24 panel and the tier counts.

The standing check: **when a summary reports a count, ask which array a
reader opens to see what it counted.** If the answer is "none", the count is
an assertion with no evidence attached — and on this surface the assertion is
about how a client spent money.
