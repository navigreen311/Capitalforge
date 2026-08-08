-- Issuer.registryId
--
-- The canonical id in src/shared/constants/issuers.ts, which uses underscores
-- (us_bank, first_tech) while issuers.slug uses hyphens (us-bank, first-tech).
-- The two spellings already diverged for every bank; this records the mapping
-- as data rather than leaving it to be inferred.
--
-- Nullable: an issuer need not appear in the registry. Unique: two issuers must
-- not claim the same canonical id.
ALTER TABLE "issuers" ADD COLUMN "registryId" TEXT;
CREATE UNIQUE INDEX "issuers_registryId_key" ON "issuers"("registryId");

-- IssuerRule.sourceNote
--
-- A citation that is not a URL. sourceUrl stays a URL and is rendered as a
-- link; writing a prose citation into it produces a broken link, and leaving
-- it null renders "No source recorded" for a rule that has a source. The
-- evidence was real and the schema was narrower than the evidence.
ALTER TABLE "issuer_rules" ADD COLUMN "sourceNote" TEXT;
