ALTER TABLE meetings ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;

-- Existing meetings had no explicit assignee — default them to whoever they
-- were scheduled under, so they keep showing up for that person.
UPDATE meetings SET assigned_to = user_id WHERE assigned_to IS NULL;

CREATE TABLE IF NOT EXISTS meeting_visit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    notes TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_visit_logs_meeting ON meeting_visit_logs(meeting_id);
