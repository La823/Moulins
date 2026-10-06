-- Freight on the order and a remarks note per line, both filled in by staff
-- when an order is received, alongside the per-line rates from 143.
--
-- freight is added to the order total. It is NULL until someone enters it,
-- for the same reason rate is: "not entered yet" and "free delivery" are
-- different statements, and a zero would silently say the second.
--
-- remarks is per order line, not per order. The order already has notes —
-- what the customer types at checkout — and remarks are ours, about a
-- specific product on it ("short-dated", "replace with SO-89", ...).
ALTER TABLE orders      ADD COLUMN IF NOT EXISTS freight NUMERIC(10,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS remarks TEXT;
