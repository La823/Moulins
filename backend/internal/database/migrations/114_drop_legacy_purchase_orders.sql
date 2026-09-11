-- The live purchase_orders table is no longer used — new POs are created
-- directly into purchase_order_master (see migration 108/110 and
-- CreatePurchaseOrderInMaster). No other table has a foreign key into it
-- (purchase_order_items, the only one that did, was already dropped by
-- migration 015).
DROP TABLE IF EXISTS purchase_orders CASCADE;
