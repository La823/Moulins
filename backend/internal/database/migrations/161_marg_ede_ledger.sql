-- The full Marg ledger (chart of accounts) from the Corporate EDE API's
-- Party blob: customers, suppliers, expense vendors, staff, banks, tax and
-- other accounts — every party a bill can point to. Filled by the same
-- 15-minute sync as marg_ede_bills.
--
-- Kept whole and separate from margmaster_party (the other Marg API, which
-- holds only customers and is used by the app). The two share the party
-- code; v_marg_ede_ledger shows, live, which ledger accounts also exist in
-- margmaster_party.

CREATE TABLE IF NOT EXISTS marg_ede_ledger (
    marg_id          BIGINT PRIMARY KEY,           -- Party.ID (CID is not unique)
    party_code       TEXT,                         -- Party.CID = marg_ede_bills.party_code
    name             TEXT NOT NULL,                -- full ParNam, spaces collapsed
    short_name       TEXT,                         -- ParNam's first 30 characters
    city             TEXT,                         -- the rest of ParNam
    group_code       TEXT,                         -- Party.SCode: C6, D3, J11, ...
    group_name       TEXT,                         -- Customers, Suppliers, ...
    kind             TEXT NOT NULL,                -- customer | supplier | expense_vendor | staff | bank_cash | tax | sales_purchase_account | expense_account | other
    address1         TEXT,
    address2         TEXT,
    address3         TEXT,
    pin              TEXT,
    gstin            TEXT,
    dl_no            TEXT,                         -- Marg cuts this at 21 characters
    phone1           TEXT,
    phone2           TEXT,
    phone3           TEXT,
    phone4           TEXT,
    area             TEXT,
    route            TEXT,
    salesman         TEXT,
    rate_flag        TEXT,                         -- Party.Rate (Y/N), meaning unconfirmed
    credit_status    TEXT,                         -- Party.CRStatus
    credit_limit     NUMERIC,
    credit_days      INTEGER,
    credit_bills     INTEGER,
    lat              TEXT,
    lng              TEXT,
    marg_deleted     BOOLEAN NOT NULL DEFAULT FALSE, -- Party.Is_Deleted
    add_field        TEXT,
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE, -- gone from Marg's full pull
    row_hash         TEXT NOT NULL,
    first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marg_ede_ledger_code ON marg_ede_ledger (party_code);
CREATE INDEX IF NOT EXISTS idx_marg_ede_ledger_kind ON marg_ede_ledger (kind);

ALTER TABLE marg_ede_sync_runs
    ADD COLUMN IF NOT EXISTS ledger_received INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ledger_new      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ledger_changed  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ledger_deleted  INTEGER NOT NULL DEFAULT 0;

-- Each ledger account with a live "is it also in Marg Parties?" marker,
-- matched on the trimmed party code (margmaster_party pads its codes).
CREATE OR REPLACE VIEW v_marg_ede_ledger AS
SELECT
    l.*,
    mp.id IS NOT NULL       AS in_marg_parties,
    mp.id                   AS marg_party_id,
    mp.name                 AS marg_party_name,
    mp.status               AS marg_party_status,
    mp.dlno                 AS marg_party_dl_no,
    mp.balance              AS marg_party_balance
FROM marg_ede_ledger l
LEFT JOIN LATERAL (
    SELECT p.id, p.name, p.status, p.dlno, p.balance
    FROM margmaster_party p
    WHERE l.party_code IS NOT NULL AND TRIM(p.code) = l.party_code
    ORDER BY p.is_deleted, p.synced_at DESC
    LIMIT 1
) mp ON TRUE
WHERE NOT l.is_deleted;
