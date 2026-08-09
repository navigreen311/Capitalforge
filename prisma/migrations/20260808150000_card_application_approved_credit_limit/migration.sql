-- CardApplication.approvedCreditLimit
--
-- The limit actually granted. Distinct from creditLimit, which holds the
-- amount REQUESTED at draft and is populated on declined applications —
-- BoA 20000, US Bank 18000, Wells Fargo 12000, none of which was granted.
ALTER TABLE "card_applications" ADD COLUMN "approvedCreditLimit" DECIMAL(65,30);

-- The defect being fixed is precisely a limit sitting on a decline, so the
-- database refuses it rather than trusting every writer to remember.
--
-- Prisma cannot express CHECK constraints in schema.prisma. This lives here
-- only, is invisible to `prisma migrate diff`, and a future generated
-- migration could therefore drop it silently.
--
--   asserted by: tests/integration/approved-credit-limit-constraint.test.ts
--
-- That test fails if this constraint is removed. It is the reason removal
-- does not pass unnoticed.
ALTER TABLE "card_applications"
  ADD CONSTRAINT "approved_limit_requires_approval"
  CHECK ("approvedCreditLimit" IS NULL OR status = 'approved');
