-- deleted_in_marg: Marg no longer sends this party. Marg sometimes recreates
-- a party under a new rid (QBY Khedapati and five others on 5-6 Nov 2026);
-- the old rid then simply stops arriving, with no Is_Deleted flag, so the
-- upsert kept it forever with a frozen balance.
--
-- Set by the sync after a full pull (a party missing from the full list is
-- gone from Marg) and cleared whenever Marg sends the rid again. Delta pulls
-- only carry changed parties, so they never set it.
ALTER TABLE margmaster_party
    ADD COLUMN IF NOT EXISTS deleted_in_marg BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_in_marg_at TIMESTAMPTZ;

-- The rows missing from Marg's full party list pulled on 27 Nov 2026.
UPDATE margmaster_party
   SET deleted_in_marg = TRUE, deleted_in_marg_at = NOW()
 WHERE rid IN ('2090625', '2090727', '2090856', '2090830', '2090837', '2090844', '2779603')
   AND NOT deleted_in_marg;
