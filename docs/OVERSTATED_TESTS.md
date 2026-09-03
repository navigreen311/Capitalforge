# Overstated Tests — inventory of tests that assert less than their names claim

**Status:** live inventory. Strike a row when the test is fixed; never delete one.
**Generated:** 2026-09-01, against branch `ai-feature/consent-tenancy-and-revoke-integrity`.
**Enforced by:** `scripts/check-test-claims.ts` (`npm run check:test-claims`, run in
the Lint & Type Check CI job). It holds an allowlist of 12 confirmed rows and 5
reviewed exceptions. The list may only get SHORTER. A new violation fails CI; so does
an allowlist entry that no longer matches, so this file and that script cannot drift
apart.

**27 open, 3 fixed, 30 total.**

A test whose name claims more than its body checks is worse than no test. It occupies
the place where the real check would go, it reports green, and its name is what
somebody reads when deciding whether a behaviour is covered. The one that started this
had been passing for as long as it existed:

```ts
it('preserves history — revoked records remain in store', ...)
```

It asserted that the row was not deleted. Revocation was, at that moment, overwriting
the `metadata` column wholesale and destroying who granted the consent and from where —
which is the part of the history an audit actually reads. The row surviving is the cheap
half of the claim. Nothing checked the other half.

---

## The three shapes

| shape | what it looks like | can a script see it? |
|---|---|---|
| **Cardinality-blind** | the name says *each* / *all* / *complete*, the fixture holds one item, and no assertion counts anything | **yes** — `scripts/check-test-claims.ts` |
| **Clause unasserted** | the name names two things and the body asserts one, or asserts a type where the name claims a behaviour | no |
| **True either way** | the assertion holds in both the passing and the failing case, so the test cannot distinguish them | no |

Only the first has a mechanical signature. The second and third were found by reading and
will keep being found by reading. **A green `check:test-claims` means the cardinality
shape did not grow. It does not mean the suite is honest.**

---

## 1. Cardinality-blind — the loop that was tested with one item

Every row here is in the script's `KNOWN_OVERSTATED` allowlist.

| file:line | the name claims | what the body does |
|---|---|---|
| `tests/unit/services/twilio-integration.test.ts:775` | persists a VoiceCall record **for each** initiated call | one business, `toHaveBeenCalledOnce()`. The test **directly above it** uses two businesses and asserts `toHaveBeenCalledTimes(2)` — so a `create` outside the loop passes this one and fails that one |
| `tests/unit/services/twilio-integration.test.ts:792` | publishes call.initiated **for each** successful dial | one business; asserts `toContain('call.initiated')`, which is "at least one". Hidden until 2026-09-01 by a `.map()` extracting event types from mock calls, which the check was counting as proof of cardinality wherever it appeared |
| `tests/unit/services/kyb-kyc.test.ts:626` | publishes KYC_VERIFIED when **all** beneficial owners are verified | one owner; the fixture comment says "Business has one owner by default". A service publishing on the **first** verified owner passes. Premature KYC_VERIFIED gates downstream work |
| `tests/unit/services/kyb-kyc.test.ts:812` | readyForApplications=true when KYB verified and **all** beneficial owners KYC verified | one owner — and the negative sibling above it also uses one, so the multi-owner case is untested in both directions |
| `tests/e2e/funding-flow.test.ts:368` | marks a funding round completed when **all** applications close | `approvedApps = [one application]` |
| `tests/e2e/compliance-flow.test.ts:317` | assembles a **complete** compliance dossier | stubs a suitability check and a KYB compliance check and asserts on **neither**. The rest is three `length >= 1` and `generatedAt` defined; the dossier could omit both stubbed sections entirely |
| `tests/e2e/financial-flow.test.ts:502` | year-end fee summary across **all cards** in the stack | one application in the fixture, and the assertions do not count cards |
| `tests/unit/services/ach-controls.test.ts:485` | returns mapped alerts for **all** flagged debit events | one event, `toHaveLength(1)`. A mapper returning only the first event passes |
| `tests/unit/services/ach-controls.test.ts:878` | returns zero violations when **all** events are clean | one event |
| `tests/unit/services/complaint.test.ts:672` | returns a dossier with **all required** sections | **Half fixed 2026-09-01.** It asserted three of six sections and stubbed the other three without asserting on them; it now asserts all six, plus that the dossier is persisted. Still listed because the cardinality half stands: one document and one complaint in the fixture, so it cannot tell "all documents" from "the first document" |
| `tests/unit/services/credit-intelligence-gate.test.ts:158` | gates **each** bureau on its own credential | configures one bureau and asserts one other rejects. One pair of four |
| `tests/unit/services/funding-round.test.ts:416` | perfect score when **all cards** approved at target credit | one card |

### Reviewed and sound — plural word, no collection

In the script's `NOT_A_COLLECTION` set. Kept separate deliberately: folding them in
would make the count above meaningless.

| file:line | why it is fine |
|---|---|
| `tests/unit/readiness-score.test.ts:61` | "complete profile" is a state of one profile |
| `tests/unit/readiness-score.test.ts:299` | components are named fields on one score |
| `tests/unit/services/cost-calculator.test.ts:187` | "all balances are zero" is a boundary condition on the inputs |
| `tests/unit/services/cost-calculator.test.ts:674` | as above |
| `tests/unit/services/governance.test.ts:228` | `all` is the name of a rollout stage; `complete` is a status value |

---

## 2. A clause of the name is never asserted

No mechanical signature. Found by reading.

| file:line | unasserted clause |
|---|---|
| `tests/e2e/financial-flow.test.ts:340` | "**and marks schedule entry as paid**" — the sole assertion is `storedSchedules.length > 0` |
| `tests/e2e/financial-flow.test.ts:583` | "**and groups by category**" — asserted as `expect(categorySummaries).toBeInstanceOf(Array)`; an empty array passes |
| `tests/unit/services/product-acknowledgment.test.ts:493` | "**ordered by service**" — sole assertion is `records.length >= 2`; no ordering check, and `>= 2` cannot mean "all" |
| `tests/unit/services/workflow-engine.test.ts:580` | "records **rollbackReason** and rolledBackAt" — only `rolledBackAt` is asserted |
| `tests/unit/services/complaint.test.ts:596` | "records **responseDueDate** and deadlineStatus **correctly**" — `responseDueDate` never asserted; "correctly" is asserted as `typeof … === 'number'` |
| `tests/e2e/compliance-flow.test.ts:110` | name says the score reaches **90+**; the assertion is `toBeGreaterThanOrEqual(70)`. The number in the name is not the number checked |

---

## 3. Existence-only assertions under a completeness claim

Weaker than section 2 — these do assert something, but nothing that could fail if the
value were wrong rather than absent.

| file:line | the gap |
|---|---|
| `tests/unit/services/deal-committee.test.ts:492` | "**records** a vote" — asserts the return value of a mock the test wrote itself; nothing asserts what reached `update` |
| `tests/unit/services/deal-committee.test.ts:633` | "records counsel signoff" — as above |
| `tests/unit/services/deal-committee.test.ts:654` | "records accountant signoff" — as above |
| `tests/unit/services/cost-calculator.test.ts:328` | "**all 3** scenarios" — `toBeDefined()` on best/base/worst; defined-but-wrong passes |
| `tests/unit/services/cost-calculator.test.ts:552` | "returns **all three** scenarios" — as above |
| `tests/e2e/onboarding-flow.test.ts:347` | "with **all components**" — each component asserted `>= 0`, which a permanently-zero component satisfies |
| `tests/e2e/onboarding-flow.test.ts:413` | "**full** pipeline end-to-end" — `toBeDefined()` on the business and the owner |
| `tests/unit/services/client-graduation.test.ts:212` | "passes **all gates**" — asserts only the aggregate `eligible === true`. The sibling at `:179` shows the author's own stronger idiom, `gates.every((g) => g.passed)` |
| `tests/unit/services/client-graduation.test.ts:307` | as above |

---

## 4. Fixed

| file:line | was | now |
|---|---|---|
| ~~`tests/unit/services/consent.test.ts:351`~~ | "preserves history — revoked records remain in store" asserted only that the row was not deleted, while revocation destroyed the grant-time metadata | asserts `evidenceRef`, the granting `actorId`, `grantedByIp` and caller metadata all survive, and that the revocation is recorded under its own keys. **Verified to fail against the previous implementation** |
| ~~`tests/unit/services/consent.test.ts:321`~~ | "publishes consent.revoked event **for each** revoked record" granted one record and asserted `toHaveBeenCalledWith`, which is *at least once with* | two records and a count |
| ~~`tests/unit/services/consent.test.ts:598`~~ | "exports **full history** including revoked records" supplied `evidenceRef` on both grants and asserted on neither | asserts both |

---

## Where they concentrate

Six of the eleven cardinality rows, and five of the six in section 2, are in
`tests/e2e/*flow.test.ts`. Those files plant the most setup and assert the least against
it — `>= 1`, `toBeDefined()`, `toBeInstanceOf(Array)` — which is where an ambitious name
has the most room to outrun its assertions. The unit-service files are mostly tight; what
fails there is a single unasserted clause rather than a whole claim.

## How this was found

161 test files, 3,924 tests. A mechanical scan for all three shapes produced 121
candidates, roughly 83% of them false positives — a loop like
`for (const s of [...]) expect(f(s)).toBe(s)` is indistinguishable from planted-and-
unasserted evidence from the outside. Every row above was then read and confirmed by
hand. The count is a floor, not a total.

The guard was verified in both directions before being wired into CI: a deliberately
overstated test was added and the check failed naming it, then removed and the check
passed. A guard nobody has watched fail is not a guard.
