CREATE TABLE IF NOT EXISTS broadcast_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_lists_created_by ON broadcast_lists(created_by);

CREATE TABLE IF NOT EXISTS broadcast_list_members (
    list_id UUID NOT NULL REFERENCES broadcast_lists(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (list_id, user_id)
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS broadcast_list_id UUID REFERENCES broadcast_lists(id) ON DELETE SET NULL;
