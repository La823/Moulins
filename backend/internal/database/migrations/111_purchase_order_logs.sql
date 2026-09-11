-- Field-level change log dedicated to purchase orders (both the live
-- purchase_orders table and the purchase_order_master reference import).
-- Kept separate from the generic audit_log table so entries are queryable
-- by field name directly ("who changed status", "who changed qty"), not
-- just by free-text description.
--
-- po_source distinguishes which table po_id belongs to, since the two
-- tables use different id types (UUID vs SERIAL int) and can't share one
-- typed foreign key — po_id is stored as text and resolved by the app.
CREATE TABLE IF NOT EXISTS purchase_order_logs (
    id          BIGSERIAL PRIMARY KEY,
    po_source   TEXT        NOT NULL CHECK (po_source IN ('purchase_orders', 'purchase_order_master')),
    po_id       TEXT        NOT NULL,
    po_number   TEXT,
    field_name  TEXT        NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_logs_po ON purchase_order_logs (po_source, po_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_logs_actor ON purchase_order_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_logs_field ON purchase_order_logs (field_name);
