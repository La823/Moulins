-- A retailer's GST number and drug licences, saved by their partner and
-- checked against the government portals (the same GST / DL lookups as
-- partner onboarding). details is the portal's answer as it was when last
-- checked; verified_at is null for a number saved without checking.
CREATE TABLE IF NOT EXISTS retailer_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retailer_id UUID NOT NULL REFERENCES retailers(user_id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('gst', 'dl')),
    number      TEXT NOT NULL,
    details     JSONB,
    verified_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (retailer_id, kind, number)
);
