-- The InsertOrderDetail spec says to always pass OrderNo="0" on insert, but
-- in practice Marg's server rejects/collides on repeated "0" submissions —
-- confirmed by hands-on testing against the live API. Use a local
-- incrementing placeholder instead, starting at 30 per that testing.
CREATE SEQUENCE IF NOT EXISTS marg_order_no_seq START 30;
