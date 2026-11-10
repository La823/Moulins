-- Retailers order single packs (a strip, a bottle), not the partner's boxes:
-- each line keeps the unit it was ordered in and how many of them made one
-- of the partner's packs then, so forwarding to Moulins can order whole
-- boxes. mrp on these lines is the MRP of one unit. Lines from before this
-- were ordered in packs: per_box 1.
ALTER TABLE retailer_order_items ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE retailer_order_items ADD COLUMN IF NOT EXISTS per_box INT NOT NULL DEFAULT 1;
