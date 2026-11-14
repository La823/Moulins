-- Packing (decided 14 Nov 2026): the dispatch team packs confirmed orders in
-- the app, one product at a time. For each line they photograph the pack's
-- batch print; Gemini reads the batch number and expiry, the server compares
-- it with the batch chosen on the order (or, when none was chosen, with the
-- product's known Marg batches) and only a match (or an admin's override)
-- can be ticked. When every line is ticked the order goes confirmed -> packed.
--
-- order_item_packing holds each line's latest check and tick;
-- order_packing_log keeps every step (photo, result, tick, untick, override,
-- finish) with who did it, and is never shown to the partner.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS packed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packed_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS order_item_packing (
    order_item_id   UUID PRIMARY KEY REFERENCES order_items(id) ON DELETE CASCADE,
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    photo_key       TEXT,
    expected_batch  TEXT,            -- the printed batch expected (NULL: any known batch)
    expected_expiry TEXT,
    read_batch      TEXT,            -- what the photo showed (or what was typed)
    read_expiry     TEXT,
    read_product    TEXT,
    read_source     TEXT CHECK (read_source IN ('ai', 'typed')),
    result          TEXT CHECK (result IN ('match', 'mismatch', 'unreadable', 'unchecked')),
    result_note     TEXT,
    checked_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    checked_at      TIMESTAMPTZ,
    override_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    override_reason TEXT,
    override_at     TIMESTAMPTZ,
    packed_qty      INTEGER,         -- the line's quantity when ticked; a later change un-ticks it
    packed_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    packed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_order_item_packing_order ON order_item_packing(order_id);

CREATE TABLE IF NOT EXISTS order_packing_log (
    id            BIGSERIAL PRIMARY KEY,
    order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    product_name  TEXT,
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,     -- started, photo, typed, packed, unpacked, override, finished, reopened
    detail        TEXT,
    photo_key     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_packing_log_order ON order_packing_log(order_id, created_at);

-- dispatch-team logins can pack
INSERT INTO employee_permissions (user_id, permission)
SELECT id, 'packing_edit' FROM users WHERE staff_group = 'dispatch'
ON CONFLICT DO NOTHING;
