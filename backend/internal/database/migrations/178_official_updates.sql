-- Official updates: notices, circulars and notifications published on
-- government websites (CDSCO, CBIC GST, GST Council, Department of
-- Pharmaceuticals), read once a day by internal/officialupdates. Each item is
-- kept once per source; the first read of a source only records what is
-- already there (is_baseline) so nobody is told about years of old notices.

CREATE TABLE IF NOT EXISTS official_updates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_key    TEXT NOT NULL,            -- officialupdates.Sources key, e.g. cdsco_notices
    external_id   TEXT NOT NULL,            -- the site's own id or link for the item
    title         TEXT NOT NULL,
    ref_no        TEXT,                     -- notification number, e.g. 10/2026-Central Tax (Rate)
    category      TEXT,
    published_on  DATE,                     -- the date the site shows, when it shows one
    link          TEXT,                     -- the PDF or page on the government site
    page_rank     INT,                      -- its place in the site's list when first found (orders undated items)
    is_baseline   BOOLEAN NOT NULL DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_key, external_id)
);
CREATE INDEX IF NOT EXISTS official_updates_source_idx
    ON official_updates (source_key, published_on DESC NULLS LAST, first_seen_at DESC);

-- How each source's last read went, for the page and for telling staff when
-- a site stops answering or changes its layout.
CREATE TABLE IF NOT EXISTS official_update_sources (
    key             TEXT PRIMARY KEY,
    last_checked_at TIMESTAMPTZ,
    last_ok_at      TIMESTAMPTZ,
    last_error      TEXT,
    fail_count      INT NOT NULL DEFAULT 0  -- reads failed in a row
);
