CREATE TABLE IF NOT EXISTS notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title               VARCHAR(255) NOT NULL,
    body                TEXT NOT NULL,
    image_key           VARCHAR(500),
    deep_link           VARCHAR(500),
    audience_type       VARCHAR(20) NOT NULL DEFAULT 'all',
    audience_filter     JSONB,
    status              VARCHAR(20) NOT NULL DEFAULT 'sending',
    recipient_count     INTEGER NOT NULL DEFAULT 0,
    push_success_count  INTEGER NOT NULL DEFAULT 0,
    push_failure_count  INTEGER NOT NULL DEFAULT 0,
    scheduled_at        TIMESTAMP WITH TIME ZONE,
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    sent_at             TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_exclusions (
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS notification_recipients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_recipients_user ON notification_recipients(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS device_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token        VARCHAR(500) NOT NULL UNIQUE,
    platform     VARCHAR(20),
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
