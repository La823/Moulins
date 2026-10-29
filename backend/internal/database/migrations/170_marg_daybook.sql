-- Marg's Day Book for a whole financial year, loaded once from the Excel
-- export (FY 2025-26: devoshap_d.xls). A fixed history, kept apart from the
-- marg_ede_* tables that the Corporate EDE sync refreshes for the current
-- year — the two are to be compared before anything is merged.
--
-- One row per voucher, and one per debit/credit line of it. Each line keeps
-- the account exactly as the Day Book printed it, and is linked to
-- marg_ede_ledger where the name can be matched (the Day Book cuts names to
-- 27-30 characters and prints only a narration on some journal lines, so
-- not every line can be). Opening balances are zero: the company started in
-- March 2025.

CREATE TABLE IF NOT EXISTS marg_daybook_vouchers (
    id             BIGSERIAL PRIMARY KEY,
    fy             TEXT NOT NULL,                 -- '2025-26'
    seq            INTEGER NOT NULL,              -- order in the Day Book
    voucher_date   DATE NOT NULL,
    kind           TEXT NOT NULL,                 -- sale | purchase | receipt | payment | contra | credit_note | debit_note | tds | journal
    ref_no         TEXT,                          -- MPPL00001, supplier bill no, C/N or D/N no
    ref_date       DATE,                          -- supplier's bill date ("Dt.")
    entry_no       TEXT,                          -- Marg purchase entry no, e.g. P000001
    against_bills  TEXT[],                        -- bills a receipt was taken against ("Ag. MPPL00009")
    narration      TEXT,                          -- the reference lines, as printed
    party_code     TEXT,                          -- the voucher's party, when one line names a party
    total          NUMERIC NOT NULL DEFAULT 0,
    source_file    TEXT NOT NULL,
    source_row     INTEGER NOT NULL,              -- Excel row of the voucher's first line
    imported_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (fy, seq)
);

CREATE INDEX IF NOT EXISTS idx_marg_daybook_vouchers_date ON marg_daybook_vouchers (voucher_date);
CREATE INDEX IF NOT EXISTS idx_marg_daybook_vouchers_party ON marg_daybook_vouchers (party_code);
CREATE INDEX IF NOT EXISTS idx_marg_daybook_vouchers_ref ON marg_daybook_vouchers (ref_no);

CREATE TABLE IF NOT EXISTS marg_daybook_entries (
    id              BIGSERIAL PRIMARY KEY,
    voucher_id      BIGINT NOT NULL REFERENCES marg_daybook_vouchers(id) ON DELETE CASCADE,
    line_no         INTEGER NOT NULL,
    voucher_date    DATE NOT NULL,                -- copied from the voucher for ledger queries
    account_text    TEXT NOT NULL,                -- as printed, spaces collapsed
    ledger_marg_id  BIGINT,                       -- marg_ede_ledger.marg_id, when matched
    party_code      TEXT,                         -- marg_ede_ledger.party_code, when matched
    account_kind    TEXT,                         -- marg_ede_ledger.kind, when matched
    match_method    TEXT NOT NULL,                -- exact | prefix | ambiguous | none
    debit           NUMERIC NOT NULL DEFAULT 0,
    credit          NUMERIC NOT NULL DEFAULT 0,
    UNIQUE (voucher_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_marg_daybook_entries_party ON marg_daybook_entries (party_code, voucher_date);
CREATE INDEX IF NOT EXISTS idx_marg_daybook_entries_ledger ON marg_daybook_entries (ledger_marg_id);

-- Every account's ledger: each line with its voucher and a running balance
-- (debit minus credit, from zero). Unmatched lines form their own ledger
-- under the printed name.
CREATE OR REPLACE VIEW v_marg_daybook_ledger AS
SELECT
    COALESCE(e.party_code, 'TEXT:' || e.account_text) AS account_key,
    e.party_code,
    e.account_text,
    e.account_kind,
    v.fy,
    e.voucher_date,
    v.kind          AS voucher_kind,
    v.ref_no,
    v.against_bills,
    v.narration,
    e.debit,
    e.credit,
    SUM(e.debit - e.credit) OVER (
        PARTITION BY COALESCE(e.party_code, 'TEXT:' || e.account_text)
        ORDER BY e.voucher_date, v.seq, e.line_no
    ) AS balance,
    v.id            AS voucher_id,
    e.id            AS entry_id
FROM marg_daybook_entries e
JOIN marg_daybook_vouchers v ON v.id = e.voucher_id;
