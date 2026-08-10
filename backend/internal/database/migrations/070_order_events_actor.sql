ALTER TABLE order_events ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_events_actor_id ON order_events(actor_id);
