-- Retailers: shops a partner onboards, who get their own login (role
-- 'retailer', phone number as login and first password, like doctors),
-- browse the products their partner sees and order from the partner. The
-- partner accepts the order with their rates, supplies it, and can forward
-- it to Moulins as their own order. Kept apart from users.team_owner_id so
-- retailers never appear in team lists, and from orders, which is Moulins'
-- own order book (staff panel, Marg, analysis).

CREATE TABLE IF NOT EXISTS retailers (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shop_name  TEXT,
    address    TEXT,
    city       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at TIMESTAMPTZ            -- removed by the partner; login revoked
);
CREATE INDEX IF NOT EXISTS retailers_partner_idx ON retailers (partner_id);

CREATE TABLE IF NOT EXISTS retailer_orders (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no           BIGSERIAL UNIQUE,        -- shown as RO-<n>
    retailer_id        UUID NOT NULL REFERENCES users(id),
    partner_id         UUID NOT NULL REFERENCES users(id),
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'dispatched', 'delivered')),
    notes              TEXT,                    -- the retailer's
    partner_note       TEXT,                    -- the partner's (rejection reason, delivery note)
    total              NUMERIC(12, 2),          -- sum of rate x quantity, set when accepted
    forwarded_order_id UUID REFERENCES orders(id) ON DELETE SET NULL, -- the partner's order to Moulins
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status_changed_at  TIMESTAMPTZ,
    status_changed_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS retailer_orders_partner_idx ON retailer_orders (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS retailer_orders_retailer_idx ON retailer_orders (retailer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS retailer_order_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retailer_order_id UUID NOT NULL REFERENCES retailer_orders(id) ON DELETE CASCADE,
    product_id        UUID NOT NULL REFERENCES products(id),
    product_name      TEXT NOT NULL,
    quantity          INT NOT NULL CHECK (quantity > 0),
    mrp               NUMERIC(12, 2),           -- as it was when ordered
    rate              NUMERIC(12, 2),           -- the partner's, when accepting
    sort_order        INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS retailer_order_items_order_idx ON retailer_order_items (retailer_order_id);

CREATE TABLE IF NOT EXISTS retailer_order_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES retailer_orders(id) ON DELETE CASCADE,
    event       TEXT NOT NULL,
    description TEXT NOT NULL,
    actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS retailer_order_events_order_idx ON retailer_order_events (order_id, created_at);
