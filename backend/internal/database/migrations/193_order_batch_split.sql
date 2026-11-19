-- Orders whose lines are split over batches when one batch holds less than
-- the line asks (models.SplitOrderLinesByBatch). Only orders placed from now
-- on: existing orders are added as FALSE, then the default turns TRUE so
-- every new order row gets it without any insert changing.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS batch_split BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ALTER COLUMN batch_split SET DEFAULT TRUE;
