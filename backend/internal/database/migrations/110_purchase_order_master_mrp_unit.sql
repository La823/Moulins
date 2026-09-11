-- Let each purchase_order_master row be tagged with an MRP unit type
-- (Per Box / Per Strip / etc, from the existing `units` lookup table used
-- by products.mrp_unit) instead of leaving it baked into the raw mrp text.
ALTER TABLE purchase_order_master
    ADD COLUMN mrp_unit_id UUID REFERENCES units(id) ON DELETE SET NULL;
