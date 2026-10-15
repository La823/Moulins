-- A purchase order created from the product catalog keeps a link to that
-- product by id, so renaming the product never breaks it and its
-- specifications are copied from the right product (they were matched by
-- exact name before). Older POs, and ones for products not in the catalog,
-- leave it empty. (Numbered 158: 156/157 are taken by work in progress.)
ALTER TABLE purchase_order_master ADD COLUMN IF NOT EXISTS catalog_product_id UUID REFERENCES products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_po_master_catalog_product ON purchase_order_master (catalog_product_id);
