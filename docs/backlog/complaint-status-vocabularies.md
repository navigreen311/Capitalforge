# Complaint vocabularies: what is reconciled and what is not

Reconciled in the status-vocabulary fix. The rest is recorded here rather than
guessed at, because each remaining item is a product decision.

## Done

**Status.** The register holds `open | investigating | escalated | resolved |
closed`. `escalated` was added to `ComplaintStatus` and `VALID_TRANSITIONS`.
`/compliance/complaints` speaks those values; the capitals are a label applied
at render. `Received` and `Responded` are deleted — no row ever held either.

---

## Open — three status vocabularies over one column

`app/complaints/page.tsx:80` declares a **third** set for regulator inquiries:

```ts
status: 'Pending Response' | 'Under Review' | 'Responded' | 'Closed';
```

That is a different page reading a different table, so it was left alone. But
it means the word "status" has meant three different things in this codebase
over two tables, and only one of the three matched what was stored.

Worth checking whether the inquiry vocabulary matches its own column before
assuming it does. The complaint one did not, and the compiler could not see it.

## Open — category and source do not match either

`POST /api/compliance/complaints` accepts free-form `complaintType` and
`channel` from the intake form and writes them straight into `category` and
`source`:

| the form offers | the canonical enum accepts |
|---|---|
| Billing, Disclosure, Fair Lending, Product Mismatch, Advisor Conduct, Data Privacy, Other | billing, service, unauthorized_debit, compliance, other |
| Phone, Email, Web Portal, In-Person, Mail, Social Media | portal, email, phone, regulator_referral, legal, other |

So a complaint logged from that page lands with `category: 'Fair Lending'`,
which `ComplaintListQuerySchema` cannot filter for and the root-cause analytics
cannot group. It is stored, and it is invisible to every query that assumes the
enum.

This was not fixed with the status work because mapping them is a policy
question, not a repair. Does "Fair Lending" become `compliance`? Does "Data
Privacy"? Does "Web Portal" become `portal`? Each answer changes what the
analytics report, and inventing one silently would be the same mistake in a new
place.

Until it is decided, `POST /api/compliance/complaints` stays as the intake path
rather than routing to `POST /api/complaints`, whose enums would reject the
form's values outright.

## Open — the SLA is synthesized on every read

`compliance.routes.ts` computes the deadline as the row's age:

```ts
slaDeadline: new Date(c.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
```

There is **no `slaDeadline` column**, no stored deadline, and no policy behind
the 30. Consequences:

- A critical complaint and a low one get the same window. Severity does not
  enter into it.
- The deadline moves if `createdAt` is ever corrected, because it is derived
  rather than agreed.
- "30d left" reads as a commitment the system is tracking. It is arithmetic on
  a timestamp.

Deciding this needs an actual SLA policy — per severity, per category, or per
regulator — and a column to hold what was promised at intake. Until then the
number on screen is not a deadline, it is the row's age subtracted from 30.
