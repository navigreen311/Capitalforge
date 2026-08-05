# Business Credit Scores — what they are and how a client gets one

Advisory reference for the four score products `/credit-builder` tracks.

**This document goes stale.** Bureau pricing changes, products get renamed, and
the SBA rewrites its underwriting requirements — twice in the eight weeks
covered below. Every factual claim here carries the date it was verified and
the source it came from. A claim without a date is a defect in this document,
not a fact.

**Verified:** 2026-08-05, except where a line says otherwise.

---

## Why this document exists

`/credit-builder` tracks whether a client *has* each score and what threshold
it must clear. Until now nothing in the app said where a score comes from, who
can request it, what it costs, or how long it takes to move. An advisor could
read the whole page and still not be able to answer "so what do I tell them to
do on Monday."

The four products differ in the one way that matters most for advice: **who
computes the score, and whether the client can obtain it at all.** Three of the
four are client-obtainable. One is not, and the page has been treating it
identically to the others.

---

## The four products at a glance

| Product | Bureau / owner | Scale | Client can obtain? | Cost to client |
|---|---|---|---|---|
| PAYDEX | Dun & Bradstreet | 0–100 | Yes, paid | ~$60 one-time report |
| Intelliscore Plus | Experian | 1–100 | **Yes, on demand** | ~$49.95/report, ~$199/yr |
| Business Credit Risk Score | Equifax | 101–992 | Yes, paid | Not verified — see below |
| FICO SBSS | FICO (not a bureau) | 0–300 | **No — lender-computed** | n/a |

The last column is the design-relevant one. "Not yet pulled" is a sensible
empty state for the first three. For SBSS there is nothing to pull.

---

## PAYDEX (Dun & Bradstreet)

**Who computes it.** D&B, from trade payment experiences reported by the
client's suppliers.

**Can the client cause it to exist?** Yes — this is the most directly
controllable score of the four. It requires a D-U-N-S number plus trade
experiences reported to D&B. *(Not verified: the minimum number of trade
experiences D&B requires before it calculates a PAYDEX. Treat any specific
count as unconfirmed until someone checks it.)*

**Can the client obtain it?** Partly. D&B's free **CreditSignal** gives change
alerts but not the number — exact numerical scores stop after a 14-day preview.
The score itself needs a paid product; one-time reports start around **$60**.
*(Verified 2026-08-05, [Startup Owl business credit monitoring guide](https://startupowl.com/fund/business-credit-monitoring).)*

**How long it takes to move.** Reporting lag first, then score movement. Our
own vendor data puts Uline at *"reports to D&B within 30–60 days of your first
paid invoice… expect your Paydex to begin reflecting activity after 2 billing
cycles"* — a reasonable shape for Net-30 vendors generally, though each vendor
differs.

**What to tell a client.**
1. Get a D-U-N-S number — free, direct from D&B.
2. Open Net-30 accounts with vendors that report to D&B.
3. Pay **early**, not merely on time. PAYDEX rewards days-early.
4. Buy visibility only when the number itself is needed; alerts are free.

---

## Intelliscore Plus (Experian)

**Who computes it.** Experian, from trade data it receives. For thin or new
business files Experian blends the **owner's personal credit** — so a client
with no business history is partly being scored on themselves.

**Can the client cause it to exist?** Yes, indirectly — it exists once
suppliers report. The client controls who reports, not whether Experian scores.

**Can the client obtain it?** **Yes, on demand, today.** Around **$49.95 per
report** or **$199/year** for monitoring. *(Verified 2026-08-05,
[Startup Owl Experian review](https://startupowl.com/reviews/experian-business).)*

> **Correction to earlier product copy.** The Tier 2 coaching card in
> `EstimatedProgressTimeline.tsx` tells advisors to have the client *"pull a
> free report."* That is wrong and should not be repeated to a client — they
> will find out at the paywall. Experian does not give the business its own
> Intelliscore Plus for free.

**How long it takes to move.** Same reporting-lag shape as PAYDEX, but the
personal-credit blend means an owner's personal credit improvements can move a
thin file without any new trade data.

**What to tell a client.** Buy the report. Read it for errors and dispute what
is wrong — this is the one score where a same-week action can produce a real
change, because correcting bad data is faster than building good data.

---

## Business Credit Risk Score (Equifax)

**Who computes it.** Equifax. **Scale 101–992** — its own product, and *not*
SBSS, which is FICO's and runs 0–300. These were conflated in this codebase
until the `equifax_business_risk` score type was added; the Equifax adapter was
writing its output under FICO's product name.

**Can the client obtain it?** Believed yes, via a paid Equifax business report.
**Not verified as of 2026-08-05** — current pricing and product name were not
confirmed. Do not quote a price to a client from this document.

**What to tell a client.** Nothing specific yet. This section is incomplete and
is the first gap to close if Equifax gating becomes product-relevant.

---

## FICO SBSS — and the 2026 regulatory change

### What it is

**FICO Small Business Scoring Service**, scale **0–300**. FICO is not a credit
bureau; SBSS is a scoring model that consumes bureau data rather than a score
held at a bureau.

**It is computed when a lender requests it**, blending:

1. the **personal credit history of the business owners** — per FICO, typically
   the most influential factor,
2. business credit bureau data,
3. business financials,
4. the loan application itself.

*(Verified 2026-08-05, [CRS Credit API — SBSS score components](https://crscreditapi.com/sbss-score-calculation-factors/)
and [Nav — FICO SBSS in 2026](https://www.nav.com/business-credit/fico-sbss/).)*

### Can a client cause it to exist?

**The question is malformed for SBSS.** The other three scores are records held
about a business. SBSS is an output computed at request time from an
application that does not exist until someone applies. There is no dormant SBSS
waiting to be pulled, so there is nothing for a client to "establish."

A client influences the **inputs** — chiefly the owners' personal credit — not
the existence of the score.

### Can a client obtain their own?

**Essentially no.** *"FICO does not sell a FICO SBSS product directly to
business owners, like it does with its MyFICO products for consumers."*
*(Verified 2026-08-05, [Nav](https://www.nav.com/business-credit/fico-sbss/).)*
Only lenders and approved entities can request it during underwriting.

**One narrow exception.** Nav states it provides access to *"one version of your
FICO SBSS scores"* through its monitoring platform. Two caveats, both material:
the source is Nav's own marketing, and *one version* is not the score a
particular lender will compute from a particular application. Treat it as
indicative visibility, **not** as a number to gate a decision on.

A client can also simply **ask the loan officer** who pulled it.

### The regulatory change — three documents, in order

Citing only the first of these encodes underwriting language that has since
been replaced.

| Document | Type | Dated | Effective | Status |
|---|---|---|---|---|
| [5000-875701](https://www.sba.gov/document/procedural-notice-5000-875701-sunset-sbss-score-7a-small-loans) — *Sunset of SBSS Score for 7(a) Small Loans* | Procedural Notice | 2026-01-16 | 2026-03-01 | **Superseded in part** — its SOP 50 10 8 amendments were replaced |
| [5000-876777](https://www.sba.gov/document/procedural-notice-5000-876777-sunset-sbss-score-supplemental-guidance) — *Sunset of SBSS Score – Supplemental Guidance* | Procedural Notice | 2026-02-20 | 2026-03-01 | **Operative for requirements** |
| [5000-877673](https://www.sba.gov/document/information-notice-5000-877673-guidance-frequently-asked-questions-related-recent-sba-procedural-notices) — *Guidance for FAQs Related to Recent SBA Procedural Notices* | Information Notice | 2026-04-02 | 2026-03-01 | Clarifying FAQ; does not supersede |

**Cite 5000-876777 for any requirement.** It revised and replaced the SOP 50 10
8 amendments issued in 5000-875701.

**What changed.** Effective **1 March 2026**, the SBA discontinued the mandatory
FICO SBSS prescreen for **7(a) Small Loans of $350,000 and under**, mandatory
for loans receiving SBA loan numbers on or after that date. In its place, all
7(a) Small Loans require **full credit analysis** — the narrative underwriting
previously reserved for larger or more complex Standard 7(a) loans. Per NAGGL's
summary of 876777, that includes a minimum **debt service coverage ratio of
1.10:1** and **two months of commercial bank statements**.
*(Verified 2026-08-05, [NAGGL summary](https://www.naggl.org/sba-notice-revising-previously-issued-underwriting-requirements-for-7a-small-loans/);
notice bodies are PDFs and were not read directly.)*

**Scope.** 7(a) Small Loans only. **SBA Express is explicitly unaffected**, and
the prescreen never applied to 504 loans.

### The threshold history

| Period | SBA minimum |
|---|---|
| Until Oct 2020 | 140 |
| Oct 2020 – Jun 2025 | 155 |
| Jun 2025 – Mar 2026 (SOP 50 10 8) | 165 |
| From 2026-03-01 | **No SBA minimum — mandate sunset** |

*(Verified 2026-08-05, [Nav — SBSS sunset](https://www.nav.com/blog/sba-to-sunset-fico-sbss-for-small-loans-what-does-this-mean-for-your-small-business/)
and [Nav — FICO SBSS in 2026](https://www.nav.com/business-credit/fico-sbss/).)*

### The distinction that matters most

**The SBA removed the requirement, not the option.**

SBSS is *not* irrelevant. Many lenders continue to use it by choice — banks are
unlikely to accept the risk of an abrupt change in underwriting standards — and
lenders now apply their **own** credit models, which vary between them.

What ended is SBSS as a **universal floor**. Before March 2026 there was one
national number every 7(a) Small Loan applicant had to clear. Now there is no
single number to aim at, and no way to know in advance which model a given
lender uses.

That is why "raise your SBSS to *N*" is no longer sound advice — not because
SBSS stopped mattering, but because **N no longer exists**, and the client could
not observe their score against it in any case.

---

## Advising against a score nobody can pull

The honest coaching for SBSS targets its inputs:

1. **Owner personal credit first** — per FICO, typically the most influential
   factor, and the one the client can both obtain and improve.
2. **Business bureau data** — the PAYDEX and Intelliscore work above feeds SBSS.
3. **Financials** — post-sunset, full credit analysis means DSCR and bank
   statements are read directly. A 1.10:1 DSCR is now a concrete target where a
   score threshold used to be.
4. **Application quality** — completeness and documentation are inputs.

None of these is "check your SBSS," and an advisor should not imply the client
can.

---

## Standing pattern: an uncited threshold gets marked, not removed

When a number in this system turns out to have no source behind it, **mark it
unverified in place. Do not delete it, and do not replace it with a better
guess.**

Deleting destroys the question. A threshold that quietly disappears takes with
it the fact that somebody once thought it mattered, and the next person to need
one starts from nothing — or worse, invents a replacement.

Asserting is how 140 got there. Some number was written down, it looked
authoritative because it was in the code, and it survived two official
revisions and an outright retirement without anyone re-checking it.

Marked-unverified keeps both halves: the reader sees the figure *and* sees that
nobody has stood behind it. It is also the only one of the three that can be
resolved later by someone who knows the answer.

Applied so far to the Preferred Lender Program's **160** — the programme is
real, the figure has no source I could find on 2026-08-05, and it now says so
on the page rather than reading as fact.

The same logic is why unassessable and not-met are separate states in the
stacking criteria: a claim about the world and a claim about our knowledge of
it must not render identically.

---

## Known defects this document identifies

Recorded here so they are not lost. Items marked **fixed** were corrected after
this document was first written.

| Where | Problem | Status |
|---|---|---|
| `EstimatedProgressTimeline.tsx` coaching `c2-2` | Says "pull a **free** report" for Experian. It costs ~$49.95. **Instructs an advisor to tell a client something untrue.** | **Fixed** 2026-08-05 |
| `page.tsx` SBSS milestone 2 | *"Minimum SBSS to pass SBA automated pre-screening (7a/504)"* — 140 is stale, and **504 is wrong**; the prescreen was 7(a) Small Loans only. | **Fixed** 2026-08-05 |
| `EstimatedProgressTimeline.tsx` coaching `c3-1` | *"Schedule credit review at SBSS 160"* — a third inconsistent threshold, telling a client to wait for a number they cannot see. | **Fixed** 2026-08-05 |
| `credit-builder.service.ts` roadmap | *"SBA Express loan pre-qualification"* at SBSS 140 and *"SBA 7(a) loan ($500K–$5M)"* at 200. Express sat outside the prescreen; it never touched loans above $350K. | **Fixed** 2026-08-05 |
| `credit-optimizer.ts` | Titled itself *"SBA Threshold: 155"*, tested against 160, reported impact `160 - score`. Also read a null-score row as an SBSS of **0**. | **Fixed** 2026-08-05 |
| `stacking-criteria.service.ts` `sc_004` | Gates Tier 2 on **SBSS ≥ 140** — two official revisions stale on a requirement that no longer exists. | Open |
| `stacking-criteria.service.ts` `sc_008` | Gates Tier 3 on **SBSS ≥ 175**. No SBA basis found for this number. | Open |
| `BusinessCreditScoresPanel.tsx` | Renders **"Not yet pulled"** for SBSS, implying a retrievable record and an omission by the advisor. Neither is true. | Open |

**The 504 error was a sample, not the population.** It was the only visible
instance — on the page, in front of an advisor. Checking it surfaced two more
of exactly the same kind in a roadmap ladder nobody had opened. Three
occurrences of one mistake: attaching an SBA product to an SBSS number that
never gated it.

Nine sites carry an SBSS threshold, and four different numbers — 140, 155, 160,
175 — were quoted as the SBA's. None matches any current SBA figure, because
there is no longer a current SBA figure.

---

## Sources

All verified 2026-08-05 unless noted. SBA notice bodies are PDFs; the notice
metadata below was confirmed on sba.gov, and the requirement summaries come
from the secondary sources named.

- SBA Procedural Notice [5000-875701](https://www.sba.gov/document/procedural-notice-5000-875701-sunset-sbss-score-7a-small-loans) — *Sunset of SBSS Score for 7(a) Small Loans*, 2026-01-16
- SBA Procedural Notice [5000-876777](https://www.sba.gov/document/procedural-notice-5000-876777-sunset-sbss-score-supplemental-guidance) — *Sunset of SBSS Score – Supplemental Guidance*, 2026-02-20 — **operative**
- SBA Information Notice [5000-877673](https://www.sba.gov/document/information-notice-5000-877673-guidance-frequently-asked-questions-related-recent-sba-procedural-notices) — *Guidance for FAQs*, 2026-04-02
- [NAGGL — SBA notice revising previously-issued underwriting requirements for 7(a) Small Loans](https://www.naggl.org/sba-notice-revising-previously-issued-underwriting-requirements-for-7a-small-loans/)
- [Nav — SBA to sunset FICO SBSS for small loans](https://www.nav.com/blog/sba-to-sunset-fico-sbss-for-small-loans-what-does-this-mean-for-your-small-business/)
- [Nav — FICO SBSS Score in 2026](https://www.nav.com/business-credit/fico-sbss/)
- [Nav — Experian Intelliscore Plus explained](https://www.nav.com/business-credit/experian-business-credit-score/)
- [CRS Credit API — SBSS score calculation factors](https://crscreditapi.com/sbss-score-calculation-factors/)
- [Credit Suite — FICO SBSS score](https://www.creditsuite.com/blog/sbss-score/)
- [Startup Owl — Experian Business Credit review 2026](https://startupowl.com/reviews/experian-business)
- [Startup Owl — Business credit monitoring 2026](https://startupowl.com/fund/business-credit-monitoring)

## Open items

- Equifax Business Credit Risk Score: self-access route, product name, price.
- D&B minimum trade experiences before PAYDEX calculates.
- Notice PDFs not read directly — requirement details are from secondary sources.
- Whether any lender publishes its post-sunset model, which would give SBSS
  coaching a concrete target again.
