-- Product Manufacturer Specification (PMS) values belong on the product
-- itself, not on individual purchase orders — a capsule's shell color or a
-- tablet's packaging doesn't vary per PO. Superseding migration 121/122's
-- per-PO pms_specifications with the same shape here on products.
ALTER TABLE products ADD COLUMN IF NOT EXISTS pms_type_id INTEGER REFERENCES pms_types(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pms_specifications JSONB;
