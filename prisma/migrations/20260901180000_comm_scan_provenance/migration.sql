-- What a communication scan recorded, and who it was about.
--
-- Four problems in one table.
--
-- 1. `reviewedAt` was set to `new Date()` at scan time. A field named for
--    review recorded when the automation ran, and a compliance reader seeing
--    "reviewed 4 September" reasonably concludes a person looked at it. It is
--    `scannedAt` now, which is what the value has always meant.
--
-- 2. Human review, if it happens, is a different state and needs an actor.
--    Nullable, because most scans are never reviewed by anybody and a column
--    that defaults to a person is the defect above with a different name.
--
-- 3. Nothing recorded what the client was actually sent. The scan returns
--    `contentWithDisclosures` — the text plus the disclosures the scan
--    required — and threw it away. A complaint turns on exactly that text.
--
-- 4. `advisorId` is not constrained here, and is verified in the service
--    instead. A foreign key is not used because advisorId has been accepted
--    unverified for the life of this table: existing rows point at ids that
--    may resolve to nobody, and a constraint would fail the migration on real
--    data. The service refuses an unknown advisor going forward; the rows
--    already written stay as they are, and are identifiable by the join below
--    returning nothing.

ALTER TABLE "comm_compliance_records" RENAME COLUMN "reviewedAt" TO "scannedAt";

ALTER TABLE "comm_compliance_records" ADD COLUMN "humanReviewedAt" TIMESTAMP(3);
ALTER TABLE "comm_compliance_records" ADD COLUMN "reviewedByUserId" TEXT;
ALTER TABLE "comm_compliance_records" ADD COLUMN "requiredDisclosures" JSONB;
ALTER TABLE "comm_compliance_records" ADD COLUMN "contentWithDisclosures" TEXT;

-- No backfill for the three new columns, and that is the point. Nobody
-- reviewed the existing rows, and nothing recorded the disclosed text at the
-- time, so NULL is the honest value for every one of them. Deriving
-- `contentWithDisclosures` now by re-running the scan would record today's
-- disclosure list against a message sent months ago.

ALTER TABLE "comm_compliance_records"
  ADD CONSTRAINT "comm_compliance_records_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "comm_compliance_records_reviewedByUserId_idx"
  ON "comm_compliance_records"("reviewedByUserId");

-- Which existing rows name an advisor who does not resolve to a user in the
-- same tenant. Not repaired — there is nothing to repair them to — but a
-- countable number rather than an unknown one:
--
--   SELECT count(*) FROM comm_compliance_records r
--    WHERE NOT EXISTS (
--      SELECT 1 FROM users u
--       WHERE u.id = r."advisorId" AND u."tenantId" = r."tenantId");
