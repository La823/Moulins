-- Ties a PO to a PMS product type and stores its per-field spec values as a
-- JSON blob keyed by pms_fields.id — the field set varies by type (see
-- migration 120), so a fixed set of columns wouldn't work here.
ALTER TABLE purchase_order_master ADD COLUMN IF NOT EXISTS pms_type_id INTEGER REFERENCES pms_types(id) ON DELETE SET NULL;
ALTER TABLE purchase_order_master ADD COLUMN IF NOT EXISTS specifications JSONB;
