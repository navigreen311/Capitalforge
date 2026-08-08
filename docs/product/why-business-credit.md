# Why business credit — the case an advisor makes before any score exists

Advisory reference for the coaching surface that precedes `/credit-builder`'s
score cards. A client at Tier 0 with no D-U-N-S does not need four scoreboards;
they need the argument.

**This document goes stale**, and its subject matter is worse for staleness than
the scores document: issuer reporting policies change without announcement, and
the strongest claims in this space are made by parties selling something. Every
factual claim below carries the date it was verified and the source it came
from. A claim without a date is a defect in this document, not a fact.

**Verified:** 2026-08-07, except where a line says otherwise.

**Sourcing standard, stricter here than for the scores.** This is the section of
the product most likely to overclaim, because overclaiming is what the industry
does here. So: a claim reaching a regulator, a bureau, a score owner, or a
primary instrument is a **claim**. A claim reaching only industry commentary —
including credit-education sites, and *especially* parties who sell cards — is
marked **unverified** and says so on the page. Marked, not removed, and not
upgraded.

---

## Why this document exists

`/credit-builder` tracks four scores. It has never made the case for having any
of them. An advisor opening the page with a brand-new client has a scoreboard
and no argument.

The argument is also the part of this product most exposed to compliance risk.
The FTC has brought and won cases against small-business financing companies for
saying precisely the things a careless version of this page would say. Those
cases are the best available source for what *not* to claim, because they state
both the representation and why it was deceptive.

---

## What a personal guarantee actually is

**Cite the instrument, not the absence.**

A personal guarantee is a contract between the **guarantor** and the **creditor**.
The business is not a party to it. That single structural fact carries most of
this section: nothing that happens to the business's credit file can alter an
agreement the business did not sign.

This is not a novel reading — it is what our own client-facing disclosure
already says, and clients sign it.

> **CORPORATE STRUCTURE DOES NOT ELIMINATE PERSONAL LIABILITY**
> Even if your business is structured as an LLC, S-Corp, C-Corp, or other
> limited liability entity, your personal guarantee on a credit card means that
> the card issuer may pursue YOU PERSONALLY for unpaid balances, including
> through collection activity, credit reporting, and civil litigation.

*(Source: `PERSONAL_GUARANTEE_V1`, `src/backend/services/acknowledgment-templates.ts`,
effective 2026-01-01, version 1.0.0. Internal, versioned, and acknowledged by the
client.)*

**The advisory consequence.** Business credit changes *who underwrites* and
*what is reported*. It does not dissolve a guarantee, because a guarantee is not
a property of the business's file. An advisor may say business credit improves
terms, capacity and separation of reporting. An advisor may not say it removes
personal exposure.

**Joint and several liability** is worth naming separately: where multiple
guarantors sign, each may be liable for the entire balance rather than a
proportional share. *(Same source.)*

---

## What business credit does NOT do — sourced from enforcement

These are not hypothetical overclaims. They are claims companies made, and were
penalised for.

### FTC v. RCG Advances (formerly Richmond Capital Group) and Jonathan Braun

The defendants' website advertised financing with **"no personal guaranty of
collateral from business owners"** and **"No Credit or Collateral
Requirements."** Their actual contracts required owners to sign a **"Security
Agreement and Guaranty"** personally guaranteeing the business's obligations,
and some owners were required to sign confessions of judgment **"individually and
personally."**

The court concluded the website statements were false and entered summary
judgment for the FTC on liability, followed by a permanent injunction banning
Braun from the merchant cash advance and debt collection industries — and
requiring him to contact credit reporting agencies to remove negative customer
reporting. Braun's monetary judgment followed the first jury trial the FTC has
ever conducted.

RCG Advances and owner Robert Giardina were permanently banned from the same
industries and returned more than **$2.7 million**.

*(Verified 2026-08-07,
[Consumer Finance Monitor — FTC targets deceptive practices in merchant cash advance case](https://www.consumerfinancemonitor.com/2023/11/06/ftc-targets-deceptive-practices-in-merchant-cash-advance-case/);
FTC case page [192-3252 RCG Advances, LLC](https://www.ftc.gov/legal-library/browse/cases-proceedings/192-3252-rcg-advances-llc)
and press release [FTC Action Results in Ban for Richmond Capital and Owner](https://www.ftc.gov/news-events/news/press-releases/2022/06/ftc-action-results-ban-richmond-capital-owner-merchant-cash-advance-debt-collection-industries).
**Limitation: ftc.gov returned HTTP 403 to automated fetching, so the FTC pages
were confirmed to exist but not read directly. The findings above come from the
secondary source named.**)*

### FTC v. Yellowstone Capital

The FTC alleged Yellowstone misled businesses about the amount of funding they
would receive, withdrew money after balances were repaid, and required
collateral and personal guarantees. The defendants surrendered **$9,837,000**,
and the FTC later returned more than **$9.7 million** to 7,731 small businesses.

*(Verified 2026-08-07, FTC case page
[182-3202 Yellowstone Capital LLC](https://www.ftc.gov/legal-library/browse/cases-proceedings/182-3202-yellowstone-capital-llc-ftc-v)
and press releases
[Cash Advance Firm to Pay $9.8M](https://www.ftc.gov/news-events/news/press-releases/2021/04/cash-advance-firm-pay-98m-settle-ftc-complaint-it-overcharged-small-businesses),
[FTC Returns More Than $9.7 Million](https://www.ftc.gov/news-events/news/press-releases/2022/06/federal-trade-commission-returns-more-97-million-small-businesses-harmed-yellowstone-capitals).
Same 403 limitation.)*

### What this means for our copy

The enforcement pattern is consistent and narrow: **the deception was the gap
between what the marketing said and what the contract did.** Neither company was
punished for offering personal guarantees. They were punished for advertising
their absence.

That is a usable standard. Our page may describe what business credit does. It
may not describe what it removes, unless the instrument removing it can be
named.

---

## Reporting to personal credit — issuer-dependent, and our brief was too strong

The working brief for this surface said business cards "generally" do not report
to personal bureaus. **That is directionally right and dangerous as stated**, for
two reasons.

**First, our own disclosure says the opposite, more conservatively:**

> **IMPACT ON PERSONAL CREDIT** — Balances, late payments, and defaults on
> personally guaranteed business credit cards **may be reported** to personal
> consumer credit bureaus (Equifax, TransUnion, Experian), potentially lowering
> your personal credit score.

*(Source: `PERSONAL_GUARANTEE_V1`, as above.)*

An advisor making the "doesn't touch personal credit" argument while the client
signs a document saying it may is a contradiction inside one engagement. The
disclosure is the conservative floor and should win.

**Second, the exceptions are mainstream cards we actively recommend.**

> ⚠️ **UNVERIFIED — industry commentary only.** The per-issuer detail below
> could not be sourced to any issuer's own terms or to a bureau. Every source
> found was a credit-education site or a card marketplace. Treat it as a
> research lead, not as something to tell a client.

| Issuer | Reported behaviour | |
|---|---|---|
| Chase (Ink) | Commercial bureaus only, unless seriously delinquent | unverified |
| American Express | Commercial bureaus only, unless seriously delinquent | unverified |
| **Capital One (most Spark)** | **Full activity to personal bureaus** | unverified |
| Discover, TD Bank | Reported as also sending full activity | unverified |

*(Sources consulted 2026-08-07, all secondary:
[Ramp](https://ramp.com/blog/business-credit-cards-that-dont-report-to-personal-credit-bureaus),
[The Points Guy](https://thepointsguy.com/credit-cards/business-credit-cards-that-affect-personal-credit/),
[Doctor of Credit](https://www.doctorofcredit.com/which-business-credit-cards-report/),
[WalletHub](https://wallethub.com/answers/cc/which-business-credit-cards-do-not-report-personal-credit-2140764437/).)*

**Why this matters more than a footnote.** Capital One Spark is a card this
system recommends. If the per-issuer claim is right, a client stacked into Spark
on the theory that business cards don't touch personal credit gets a utilisation
spike on their personal FICO — the exact harm the argument promised to avoid.

**What would settle it:** each issuer's cardmember agreement or a bureau's own
statement of what it receives. Until then the page should say reporting is
issuer-specific and name no issuer as safe.

---

## Utilisation and personal FICO — sourced to the score owner

**"Amounts Owed" is 30% of a FICO Score**, and credit utilisation is a large part
of that category. *(Verified 2026-08-07,
[myFICO — What's in your FICO Score](https://www.myfico.com/credit-education/whats-in-your-credit-score)
and [myFICO — Amounts Owed](https://www.myfico.com/credit-education/credit-scores/amount-of-debt).)*

**The 30%-utilisation rule is itself an overclaim, per FICO.** FICO's own
guidance states the data does *not* support the implication that a score dips
once utilisation crosses 30%; lower is simply better, and under 10% is better
still. *(Verified 2026-08-07,
[myFICO — What should my credit utilisation ratio be?](https://www.myfico.com/credit-education/blog/credit-utilization-be).)*

Worth repeating internally: the "keep it under 30%" figure is repeated
everywhere in this industry, attributed to nobody, and contradicted by the
company that owns the score. It is the same shape as the SBSS thresholds — a
number that survived because it was written down somewhere authoritative-looking.

---

## Capacity — not established

The brief asked for business-versus-personal credit capacity. Every source found
was published by a party that sells business cards or spend management.

> ⚠️ **UNVERIFIED — issuer and vendor marketing only.** Figures seen ranged from
> "$10,000–$50,000 typical for personal" against "$100,000, $500,000 or more"
> for business. No neutral or regulatory source was located.

*(Sources consulted 2026-08-07, all with a commercial interest in the claim:
[Brex](https://www.brex.com/spend-trends/corporate-credit-cards/business-credit-card-limits),
[Capital One](https://www.capitalone.com/learn-grow/business-resources/personal-vs-business-credit/),
[Ramp](https://ramp.com/blog/business-credit-card-vs-personal),
[Citi](https://www.citi.com/credit-cards/understanding-credit-cards/business-vs-personal-credit-cards).)*

**What would settle it:** Federal Reserve Small Business Credit Survey data, or
issuer-published limit ranges in cardmember agreements. Until then the page
should make the *structural* point — that business limits are underwritten
against business revenue as well as personal income — without quoting a figure.

---

## What the page may and may not say

Drawn from everything above, for whoever builds the component.

**May say, sourced:**
- A personal guarantee is a contract between guarantor and creditor; the
  business is not a party, and business credit does not alter it.
- Corporate structure does not eliminate personal liability. *(Our disclosure.)*
- Multiple guarantors may each be liable for the whole balance.
- Utilisation sits inside a category worth 30% of a FICO Score.
- Lower utilisation is better, and there is no 30% cliff. *(FICO.)*
- Business credit changes who underwrites and what is reported.

**May not say, on this evidence:**
- That business credit removes, reduces or shields personal liability.
- That business cards do not affect personal credit — issuer-specific, and false
  for at least one issuer we recommend.
- Any specific credit-limit figure, business or personal.
- Any specific utilisation threshold as a rule.

**Must say, if the page discusses reporting at all:** that it is issuer-specific,
and that delinquency is reported regardless.

---

## Sources

**Regulator / court**
- [FTC v. RCG Advances, LLC](https://www.ftc.gov/legal-library/browse/cases-proceedings/192-3252-rcg-advances-llc) — case 192-3252
- [FTC — Ban for Richmond Capital and owner](https://www.ftc.gov/news-events/news/press-releases/2022/06/ftc-action-results-ban-richmond-capital-owner-merchant-cash-advance-debt-collection-industries), 2022-06
- [FTC v. Yellowstone Capital LLC](https://www.ftc.gov/legal-library/browse/cases-proceedings/182-3202-yellowstone-capital-llc-ftc-v) — case 182-3202
- [FTC — Cash advance firm to pay $9.8M](https://www.ftc.gov/news-events/news/press-releases/2021/04/cash-advance-firm-pay-98m-settle-ftc-complaint-it-overcharged-small-businesses), 2021-04
- [FTC — Returns more than $9.7M](https://www.ftc.gov/news-events/news/press-releases/2022/06/federal-trade-commission-returns-more-97-million-small-businesses-harmed-yellowstone-capitals), 2022-06

**Score owner**
- [myFICO — What's in your FICO Score](https://www.myfico.com/credit-education/whats-in-your-credit-score)
- [myFICO — Amounts Owed](https://www.myfico.com/credit-education/credit-scores/amount-of-debt)
- [myFICO — What should my credit utilisation ratio be?](https://www.myfico.com/credit-education/blog/credit-utilization-be)

**Internal, versioned**
- `PERSONAL_GUARANTEE_V1` — `src/backend/services/acknowledgment-templates.ts`, effective 2026-01-01

**Secondary, used only for leads marked unverified**
- [Consumer Finance Monitor](https://www.consumerfinancemonitor.com/2023/11/06/ftc-targets-deceptive-practices-in-merchant-cash-advance-case/) — used for the RCG findings, since ftc.gov could not be fetched
- Ramp, The Points Guy, Doctor of Credit, WalletHub — per-issuer reporting
- Brex, Capital One, Ramp, Citi — capacity figures

---

## Open items

- **ftc.gov returns 403 to automated fetching.** Both cases were confirmed to
  exist and their outcomes come from secondary reporting. Someone should read
  the complaints and orders directly before this content ships.
- **Per-issuer reporting behaviour** — needs cardmember agreements or bureau
  statements. Currently commentary only, and it contradicts a working assumption
  in the original brief.
- **Capacity figures** — needs a neutral source. Federal Reserve Small Business
  Credit Survey is the obvious candidate and was not consulted.
- **Whether any issuer publishes its reporting policy in the agreement itself**,
  which would convert the whole reporting table from unverified to sourced.
- The FTC brings actions in this space regularly. This document names two; a
  periodic sweep of FTC small-business financing enforcement would keep the
  "what not to say" list current.
