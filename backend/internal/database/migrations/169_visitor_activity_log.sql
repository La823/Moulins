-- Visitors log for the admin panel: when each visitor signs in, when they
-- were last on the site, and what they looked at — product information only.
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS sign_in_count INTEGER NOT NULL DEFAULT 0;
-- refreshed (at most every 10 minutes) when the website checks who's
-- logged in, which it does on each page load
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
-- visitors who signed in before this log existed have done so at least once
UPDATE visitors SET sign_in_count = 1 WHERE sign_in_count = 0 AND last_login_at IS NOT NULL;

-- One row per Google sign-in. user_agent is the browser's own description,
-- shown as e.g. "Chrome on Android". No IP address is kept.
CREATE TABLE IF NOT EXISTS visitor_sign_ins (
    id           BIGSERIAL PRIMARY KEY,
    visitor_id   UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
    signed_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_visitor_sign_ins_visitor ON visitor_sign_ins (visitor_id, signed_in_at DESC);

-- What a visitor did on the site, sent by the website in small batches:
--   product_view   — product_id, product_name
--   search         — query, result_count
--   division_view  — label (the division or form)
--   locked_action  — label (cart, favourite, download, page), product if any
--   request_sent   — a partnership request
-- Rows older than 6 months are deleted daily (services/scheduler.go).
CREATE TABLE IF NOT EXISTS visitor_events (
    id           BIGSERIAL PRIMARY KEY,
    visitor_id   UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL
                 CHECK (kind IN ('product_view', 'search', 'division_view', 'locked_action', 'request_sent')),
    product_id   UUID,
    product_name TEXT,
    query        TEXT,
    result_count INTEGER,
    label        TEXT,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor ON visitor_events (visitor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_events_kind ON visitor_events (kind, occurred_at DESC);
