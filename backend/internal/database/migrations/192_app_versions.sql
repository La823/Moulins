-- App update prompts. One row per app (client = Moulins, team = MPPL Team)
-- and platform. An installed app whose build number is below min_build is
-- blocked with "Update required"; below latest_build it is offered the
-- update. Both 0 until an admin sets them on the website.
CREATE TABLE IF NOT EXISTS app_versions (
    app           TEXT NOT NULL CHECK (app IN ('client', 'team')),
    platform      TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
    latest_build  INT  NOT NULL DEFAULT 0,
    latest_name   TEXT NOT NULL DEFAULT '',   -- e.g. 1.0.21, shown in the prompt
    min_build     INT  NOT NULL DEFAULT 0,
    message       TEXT NOT NULL DEFAULT '',
    update_url    TEXT NOT NULL DEFAULT '',
    updated_by    UUID,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (app, platform)
);

INSERT INTO app_versions (app, platform, update_url) VALUES
    ('client', 'android', 'https://play.google.com/store/apps/details?id=com.moulinspharma.app'),
    ('client', 'ios', ''),
    ('team', 'android', '')
ON CONFLICT DO NOTHING;

-- Which app and build each phone runs, sent when it registers for push.
-- NULL: an app from before this (Moulins 1.0.20 / MPPL Team 1.0.21 and
-- older), which can only be reached by a push asking it to update.
ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS app TEXT;
ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS app_build INT;
