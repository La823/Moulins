ALTER TABLE users ADD COLUMN IF NOT EXISTS team_owner_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS daily_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    notes TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(team_member_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_logs_member ON daily_logs(team_member_id);
