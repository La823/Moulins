-- Marg sends four extra rate columns on every product/batch row that we
-- have been silently discarding, because Go's json.Unmarshal ignores
-- fields the struct doesn't declare.
--
--   RateB, RateC : lower price tiers. Populated only where Rate is set,
--                  always as a descending ladder (Rate > RateB > RateC).
--   RateD        : a fourth tier, 0 everywhere in the data so far, stored
--                  for completeness so it can't become the next silent gap.
--   RateF        : NOT a duplicate of PRate — it differs on 179 of 3,050
--                  rows, so it carries its own value and is kept separately.
--
-- Note these arrive as JSON numbers, unlike MRP/Rate/PRate which arrive as
-- strings; numeric here either way.
ALTER TABLE margmaster_products
    ADD COLUMN IF NOT EXISTS rate_b NUMERIC,
    ADD COLUMN IF NOT EXISTS rate_c NUMERIC,
    ADD COLUMN IF NOT EXISTS rate_d NUMERIC,
    ADD COLUMN IF NOT EXISTS rate_f NUMERIC;

ALTER TABLE margmaster_product_batches
    ADD COLUMN IF NOT EXISTS rate_b NUMERIC,
    ADD COLUMN IF NOT EXISTS rate_c NUMERIC,
    ADD COLUMN IF NOT EXISTS rate_d NUMERIC,
    ADD COLUMN IF NOT EXISTS rate_f NUMERIC;
