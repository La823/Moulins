-- Ledger group D34 holds Moulins' manufacturers (contract makers in Baddi,
-- Solan, Sirmour, ... — every one with a GSTIN and drug licence), which were
-- listed as "Suppliers (manufacturers)" under kind 'supplier'. They get their
-- own kind. The sync writes the new values for rows it rewrites; this fixes
-- the rows already stored (their Marg data is unchanged, so the sync would
-- not touch them).
UPDATE marg_ede_ledger
SET kind = 'manufacturer', group_name = 'Manufacturers'
WHERE group_code = 'D34' AND kind <> 'manufacturer';
