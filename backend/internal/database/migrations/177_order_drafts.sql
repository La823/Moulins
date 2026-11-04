-- Unfinished staff orders: what the staff order page has built so far
-- (customer, items with quantity/rate/batch, transport, notes), saved as it
-- changes so a phone order survives a closed tab or another computer. Every
-- staff member with order access sees every draft; placing the order
-- deletes it.

CREATE TABLE IF NOT EXISTS order_drafts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  UUID REFERENCES users(id) ON DELETE CASCADE,
    data         JSONB NOT NULL DEFAULT '{}',   -- the page's state: items, notes, transport
    item_count   INT NOT NULL DEFAULT 0,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_drafts_updated_idx ON order_drafts (updated_at DESC);
