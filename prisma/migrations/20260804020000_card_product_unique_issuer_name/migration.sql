-- One row per product per issuer.
--
-- The primary key is derived from the issuer spelling, so two seed lists that
-- spelled it differently ("capital_one" vs "capital-one", "bank_of_america" vs
-- "boa") wrote the same card twice under two ids and the database had no
-- reason to object. Twelve products were duplicated. The optimizer read both
-- rows and returned one product at rank 1 and rank 2 of the same plan, with
-- different eligibility scores, because the two rows disagreed on nearly every
-- field.
--
-- Duplicates were collapsed by scripts/dedupe-card-products.ts before this ran.

CREATE UNIQUE INDEX "card_products_issuerId_name_key" ON "card_products"("issuerId", "name");
