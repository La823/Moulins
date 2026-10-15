-- A third status for a synced Marg party: "inactive" — a real party we no
-- longer deal with, as opposed to a "duplicate" of another one. Still ours,
-- not Marg's; the sync never writes it. (156/157 are taken by work in
-- progress, 158 by the catalog-PO change.)
ALTER TABLE margmaster_party
    DROP CONSTRAINT IF EXISTS margmaster_party_status_check;
ALTER TABLE margmaster_party
    ADD CONSTRAINT margmaster_party_status_check
    CHECK (status IN ('active', 'inactive', 'duplicate'));
