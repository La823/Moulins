-- An order already sent to Marg can be changed afterwards (quantity, batch,
-- product added or removed). Marg's API only inserts order lines, so the
-- changed order is resent to Marg as a new order and the old one is deleted
-- in Marg by hand.
--   marg_changed_at: a line changed after the last send (NULL: Marg matches)
--   marg_replaced_order_nos: earlier Marg order numbers this order was sent
--     as, oldest first, so staff know which to delete in Marg
ALTER TABLE orders ADD COLUMN IF NOT EXISTS marg_changed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS marg_replaced_order_nos TEXT[] NOT NULL DEFAULT '{}';
