CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    doctor_id UUID NOT NULL REFERENCES doctors(id),
    scheduled_at TIMESTAMPTZ NOT NULL,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'upcoming',
    reminder_1day_sent BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_1hour_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_user_scheduled ON meetings (user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_doctor ON meetings (doctor_id);
CREATE INDEX IF NOT EXISTS idx_meetings_due_reminders ON meetings (scheduled_at) WHERE status = 'upcoming';

CREATE TABLE IF NOT EXISTS requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    admin_notes TEXT,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requests_user_created ON requests (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests (status);
