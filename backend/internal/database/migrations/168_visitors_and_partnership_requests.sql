-- Visitors: people checking the website out, who sign up with Google. They
-- can browse products (without prices) and ask to become a partner —
-- nothing else. Kept out of `users` on purpose: they have no phone or
-- password, and partner lists, broadcasts, counts and the map read `users`.
-- Their login token carries role "visitor" and the visitors.id.
CREATE TABLE IF NOT EXISTS visitors (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub    TEXT NOT NULL UNIQUE,  -- Google's stable account id
    email         TEXT NOT NULL,
    name          TEXT,
    picture_url   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_visitors_email ON visitors (lower(email));

-- "Become a partner" requests from visitors, worked through by staff on the
-- Partnership requests page. One open (new/contacted) request per visitor.
CREATE TABLE IF NOT EXISTS partnership_requests (
    id           BIGSERIAL PRIMARY KEY,
    visitor_id   UUID NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
    firm_name    TEXT NOT NULL,
    contact_name TEXT,
    phone        TEXT NOT NULL,
    city         TEXT,
    message      TEXT,
    status       TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'contacted', 'converted', 'declined')),
    staff_note   TEXT,
    handled_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partnership_requests_status ON partnership_requests (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_partnership_requests_open
    ON partnership_requests (visitor_id) WHERE status IN ('new', 'contacted');
