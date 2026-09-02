-- A regulator dossier, as it was sent, and the business link it rests on.
--
-- Two problems in one migration because they are one problem: `exportDossier`
-- assembled a dossier for a business it found in a JSON key, and stored nothing.
--
-- 1. `regulatory_alerts.businessId` was `metadata->>'businessId'`. A link in a
--    JSON key has no foreign key, no index, and no way for the database to
--    refuse an inquiry pointing at a business that does not exist. A typo in
--    the key read as null, and null produced a dossier with every section
--    empty and no error.
--
-- 2. The dossier itself was never persisted. `exportId` was a fresh uuid handed
--    to the caller and written nowhere, so "the dossier we sent on the 14th"
--    could not be produced — only regenerated, and a regeneration differs from
--    the original the moment any underlying row changes.

-- ── 1. The business link becomes a column ───────────────────────────────────

ALTER TABLE "regulatory_alerts" ADD COLUMN "businessId" TEXT;

-- Backfill from where it used to live. `->>` yields NULL for a missing key and
-- for a JSON null, which is the answer we want in both cases.
UPDATE "regulatory_alerts"
   SET "businessId" = "metadata"->>'businessId'
 WHERE "metadata" ? 'businessId'
   AND "metadata"->>'businessId' IS NOT NULL;

-- Any backfilled id that does not resolve to a real business is set back to
-- NULL rather than blocking the FK. An unresolvable id was never a link; it
-- only looked like one, and `exportDossier` now refuses on NULL, which is the
-- honest outcome for an inquiry nobody matched to a client.
UPDATE "regulatory_alerts" ra
   SET "businessId" = NULL
 WHERE ra."businessId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "businesses" b WHERE b."id" = ra."businessId");

ALTER TABLE "regulatory_alerts"
  ADD CONSTRAINT "regulatory_alerts_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "regulatory_alerts_businessId_idx" ON "regulatory_alerts"("businessId");

-- The metadata key is left in place. It is the historical record of what the
-- row said before the column existed, and removing it would destroy the only
-- evidence of a backfill that set something to NULL.

-- ── 2. The dossier is stored ────────────────────────────────────────────────

CREATE TABLE "regulatory_dossier_exports" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "inquiryId"        TEXT NOT NULL,
    "businessId"       TEXT NOT NULL,
    "matterType"       TEXT NOT NULL,
    "generatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy"      TEXT,
    "sections"         JSONB NOT NULL,
    "documentCount"    INTEGER NOT NULL,
    "legalHoldSummary" JSONB,

    CONSTRAINT "regulatory_dossier_exports_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "regulatory_dossier_exports"
  ADD CONSTRAINT "regulatory_dossier_exports_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "regulatory_dossier_exports"
  ADD CONSTRAINT "regulatory_dossier_exports_inquiryId_fkey"
  FOREIGN KEY ("inquiryId") REFERENCES "regulatory_alerts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "regulatory_dossier_exports_tenantId_inquiryId_idx"
  ON "regulatory_dossier_exports"("tenantId", "inquiryId");

CREATE INDEX "regulatory_dossier_exports_generatedAt_idx"
  ON "regulatory_dossier_exports"("generatedAt");
