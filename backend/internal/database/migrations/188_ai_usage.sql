-- AI usage (14 Nov 2026): one row per Gemini call made for a feature, with
-- the tokens Gemini reported (usageMetadata) and, for photos, the image's
-- size, so the cost can be followed. First user: packing's batch-photo read
-- (feature 'packing_batch_read'). cost_usd is worked out at the time of the
-- call from the rates then (internal/aiusage), so later price changes don't
-- rewrite history. Rows stay when the order is deleted.

CREATE TABLE IF NOT EXISTS ai_usage (
    id              BIGSERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    feature         TEXT NOT NULL,
    model           TEXT NOT NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
    order_item_id   UUID REFERENCES order_items(id) ON DELETE SET NULL,
    photo_key       TEXT,
    image_bytes     INTEGER,
    image_width     INTEGER,
    image_height    INTEGER,
    mime_type       TEXT,
    prompt_tokens   INTEGER NOT NULL DEFAULT 0,
    image_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    thinking_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens    INTEGER NOT NULL DEFAULT 0,
    cost_usd        NUMERIC(12, 6) NOT NULL DEFAULT 0,
    duration_ms     INTEGER,
    ok              BOOLEAN NOT NULL DEFAULT TRUE,
    error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_photo ON ai_usage(photo_key) WHERE photo_key IS NOT NULL;
