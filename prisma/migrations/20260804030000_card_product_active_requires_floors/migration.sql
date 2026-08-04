-- An active card product must declare its eligibility floors.
--
-- `revenueMinimum` and `businessAgeMinimum` are read by the optimizer as the
-- thresholds a client must clear. Zero does not mean "no minimum" — it means
-- nobody filled the field in — and the optimizer cannot tell the difference.
-- Six rows arrived with both at zero, and each of them passed every revenue
-- and trading-history check for every client, silently, while looking like a
-- normal recommendation.
--
-- Those six were deactivated by hand. A note saying "do not reactivate until
-- these are populated" is only as good as the next person reading it, and
-- nothing stopped an automated path setting isActive back to true. This makes
-- the state unrepresentable: a product with no declared floors cannot be
-- active, whatever writes it.
--
-- A product genuinely open to any business should say so with a real value —
-- 1 for a one-month minimum, or a documented 0 for one field but not both.
-- Both at zero is the signature of missing data, not of an open product.

ALTER TABLE "card_products"
  ADD CONSTRAINT "card_products_active_requires_floors"
  CHECK (
    NOT (
      "isActive" = true
      AND "revenueMinimum" = 0
      AND "businessAgeMinimum" = 0
    )
  );
