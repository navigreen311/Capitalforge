-- The maker becomes a column.
--
-- `createdByUserId` lived inside `adverseActionNotice`, a Json column named for
-- adverse action notices, written by application-pipeline.service under a
-- comment saying "stored in adverseActionNotice field for now — we use a
-- dedicated metadata column pattern".
--
-- The reason this is worth a migration is not tidiness. `checkMakerChecker`
-- tests the approver branch first:
--
--     if (!context.approverUserId) return 'No approver specified...'
--     if (context.approverUserId === context.createdByUserId) return 'self-approval'
--
-- and a missing maker arrived as `''`. So an application with no recorded
-- creator failed with "No approver specified" — told to an advisor who HAD
-- supplied one — on maker-checker, which is the control that enforces "no agent
-- submits". A refusal naming the wrong cause on that gate is worse than the
-- stash it came from.

ALTER TABLE "card_applications" ADD COLUMN "createdByUserId" TEXT;

-- Backfill from where it used to live. `->>` yields NULL for a missing key and
-- for a JSON null, which is the answer we want in both cases.
UPDATE "card_applications"
   SET "createdByUserId" = "adverseActionNotice"->>'createdByUserId'
 WHERE "adverseActionNotice" ? 'createdByUserId'
   AND "adverseActionNotice"->>'createdByUserId' IS NOT NULL;

-- Any backfilled id that does not resolve to a real user is set back to NULL
-- rather than blocking the FK. An id that resolves to nobody was never a maker;
-- it only looked like one, and `checkMakerChecker` now reports "no recorded
-- creator" as its own reason, which is the honest outcome.
UPDATE "card_applications" ca
   SET "createdByUserId" = NULL
 WHERE ca."createdByUserId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = ca."createdByUserId");

ALTER TABLE "card_applications"
  ADD CONSTRAINT "card_applications_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "card_applications_createdByUserId_idx"
  ON "card_applications"("createdByUserId");

-- The Json key is left in place, as with regulatory_alerts.businessId: it is the
-- historical record of what the row said before the column existed, and removing
-- it would destroy the only evidence of a backfill that set something to NULL.
