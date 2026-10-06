-- Mark one batch per product as the current one.
--
-- A product's MRP should follow the batch actually being sold. is_current
-- records which batch that is: staff can choose it, and when its stock runs
-- out the next batch in FEFO order (earliest expiry still holding stock)
-- takes over automatically at the end of a Marg sync.
--
-- This column is ours, not Marg's. The batch upsert in margsync names every
-- column it writes in its ON CONFLICT DO UPDATE SET list and is_current is not
-- among them, so a sync refreshes stock and prices without clearing it.
ALTER TABLE margmaster_product_batches
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT FALSE;

-- At most one current batch per product, enforced by the database rather
-- than trusted to the code that flips it.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_current_batch_per_product
    ON margmaster_product_batches (margmaster_product_id)
    WHERE is_current;
