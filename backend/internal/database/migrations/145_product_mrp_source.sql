-- Let a product's shown MRP follow its current batch instead of a single
-- hand-typed figure.
--
-- Batches carry their own MRP and they genuinely differ: 256 of 540 products
-- have more than one distinct batch MRP. DICMOLIN GEL runs 103.13 / 103.00 /
-- 110.00 across three batches in stock while products.mrp says 103.00, and
-- CEREBOON-PGN is one unit away from its MRP stepping 2062.00 -> 2250.00. One
-- static number cannot represent that.
--
-- Resolution order, highest first:
--
--   1. mrp_override    set by staff, always wins
--   2. mrp_batch_code  a batch staff pinned, when it still exists
--   3. FEFO batch      earliest expiry still holding stock  <- the default
--   4. products.mrp    what is printed today, as the fallback
--
-- Nothing stores "the current batch". A batch stops being current the moment
-- its stock reaches zero, because it is no longer the earliest with stock —
-- so there is no pointer to advance, and no job that can lag and leave a
-- sold-out batch's price on an invoice.
--
-- The cost of resolving live is that the figure can move mid-day as stock
-- sells. mrp_batch_code exists for when that matters: pin a batch and the
-- number holds until someone changes it.

ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp_override NUMERIC(10,2);
COMMENT ON COLUMN products.mrp_override IS
    'Manually set MRP. Wins over every batch-derived value; NULL means follow the batch.';

ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp_batch_code TEXT;
COMMENT ON COLUMN products.mrp_batch_code IS
    'Pins the MRP to one batch (margmaster_product_batches.curbatch). NULL '
    'means follow FEFO — the earliest-expiring batch that still has stock.';

-- FEFO resolution reads batches by product, ordered by expiry, filtered on
-- stock. Without this it is a sequential scan of 3,096 rows per product shown.
CREATE INDEX IF NOT EXISTS idx_batches_fefo
    ON margmaster_product_batches (margmaster_product_id, exp)
    WHERE NOT is_deleted AND stock > 0;
