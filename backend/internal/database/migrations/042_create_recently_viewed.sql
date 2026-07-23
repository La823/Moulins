CREATE TABLE IF NOT EXISTS recently_viewed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_viewed_at ON recently_viewed(user_id, viewed_at DESC);
