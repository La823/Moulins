-- A status we keep against a synced Marg party, so staff can mark the
-- duplicates Marg's party list accumulates without touching Marg itself.
--
-- This column is ours, not Marg's. The party upsert in margsync names every
-- column it writes in its ON CONFLICT DO UPDATE SET list, and status is not
-- among them, so a sync refreshes the party's details and leaves the status
-- alone. Adding a column to that upsert later would silently reset every
-- status on the next run.
ALTER TABLE margmaster_party
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Constrained rather than free text: the value drives a dropdown, and a typo
-- would quietly create a third status nothing filters on.
ALTER TABLE margmaster_party
    DROP CONSTRAINT IF EXISTS margmaster_party_status_check;
ALTER TABLE margmaster_party
    ADD CONSTRAINT margmaster_party_status_check
    CHECK (status IN ('active', 'duplicate'));

CREATE INDEX IF NOT EXISTS idx_margmaster_party_status
    ON margmaster_party (status);
