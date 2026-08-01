-- AlterTable
ALTER TABLE "disclosure_templates" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft';

-- Backfill from the fields the status used to be derived from, so an already
-- approved template does not come back as a draft. This mirrors exactly what
-- mapRecord computed before the column existed:
--   active   + approved  -> approved
--   inactive + approved  -> superseded  (approveTemplate deactivates the
--                                        previous version for the same
--                                        state and category)
--   otherwise            -> draft
--
-- pending_review has no backfill: nothing could record it until now, which is
-- the defect this column fixes.
UPDATE "disclosure_templates"
SET "status" = CASE
  WHEN "approvedAt" IS NOT NULL AND "isActive" = true  THEN 'approved'
  WHEN "approvedAt" IS NOT NULL AND "isActive" = false THEN 'superseded'
  ELSE 'draft'
END;
