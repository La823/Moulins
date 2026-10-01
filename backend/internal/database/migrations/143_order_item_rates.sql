-- Per-line rate on received orders, with a line total derived from it.
--
-- Orders previously carried no money at all -- only what was ordered and how
-- many. The rate is filled in by staff when an order is received, so it stays
-- NULL until then rather than defaulting from products.price: an order that
-- has not been priced yet should read as unpriced, not as priced at today's
-- list price.
--
-- The 178 existing items are deliberately left NULL. Backfilling them with
-- the current price would invent a number nobody agreed to at the time.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS rate NUMERIC(10,2);

-- line_total is generated, not written by the application. Postgres keeps it
-- equal to quantity * rate, so it cannot drift when a quantity is edited or a
-- rate is corrected, and no code path can forget to recompute it. It is NULL
-- whenever rate is NULL, which is what keeps an unpriced line out of a total
-- instead of contributing a silent zero.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_total NUMERIC(12,2)
    GENERATED ALWAYS AS (quantity * rate) STORED;

-- The order total is deliberately NOT stored. It is SUM(line_total) on read:
-- a stored copy becomes a second source of truth that goes stale the moment a
-- line is added, removed or re-rated. The per-line rates are already a
-- snapshot, so the sum is stable over time without being persisted.
