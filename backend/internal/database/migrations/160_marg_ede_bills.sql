-- Bills from Marg's Corporate EDE API (MargCorporateEDE): one row per bill
-- (MDis) and one per bill line (Dis), for every voucher type — sales,
-- purchases, credit/debit notes, adjustments. Separate from the
-- margmaster_* tables, which mirror the other (MargMST2017) API and which
-- the mobile app reads; nothing here is read by the app.
--
-- Keys are Marg's own: a bill's Voucher and a line's ID. Both were checked
-- to survive edits between pulls. Products and parties are kept as codes
-- (product_pid = margmaster_products.base_code, party_code =
-- margmaster_party.code) so ledger data can be joined in later.

CREATE TABLE IF NOT EXISTS marg_ede_bills (
    voucher             BIGINT PRIMARY KEY,           -- MDis.Voucher
    marg_row_id         BIGINT,                       -- MDis.ID
    bill_no             TEXT NOT NULL,                -- MDis.VCN, e.g. MPPL02646
    bill_type           TEXT NOT NULL,                -- MDis.Type: S P R B D T u
    bill_type_name      TEXT,                         -- Sale, Purchase, Credit note, ...
    bill_date           DATE NOT NULL,                -- Marg sends no time of day
    party_code          TEXT,                         -- MDis.CID
    bill_mode           TEXT,                         -- credit | cash (AddField pos 0)
    total               NUMERIC NOT NULL DEFAULT 0,   -- MDis.Final, incl. GST
    cash                NUMERIC,
    others              NUMERIC,
    sale_purchase_type  TEXT,                         -- MDis.Salun (GST ledger code)
    salesman            TEXT,                         -- MDis.MR
    route               TEXT,
    area                TEXT,
    order_refs          TEXT,                         -- MDis.ORN, e.g. LVO-140929;140930
    order_date          DATE,
    extra_amount        NUMERIC,                      -- AddField pos 1, meaning unconfirmed
    ref_bill_no         TEXT,                         -- credit/debit notes: original bill
    ref_bill_date       DATE,
    ref_amount          NUMERIC,
    reason              TEXT,                         -- e.g. RATE DIFF
    adjusted_against    TEXT,                         -- AddField pos 7
    adjusted_amount     NUMERIC,                      -- AddField pos 8
    is_cancelled        BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at        TIMESTAMPTZ,
    lines_count         INTEGER NOT NULL DEFAULT 0,   -- live lines we hold
    lines_total         NUMERIC NOT NULL DEFAULT 0,   -- sum(amount + gst_amount) of those
    lines_complete      BOOLEAN NOT NULL DEFAULT TRUE,-- lines_total within 1 of total
    add_field           TEXT,                         -- raw, kept until fully understood
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE, -- gone from Marg's full pull
    row_hash            TEXT NOT NULL,
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marg_ede_bills_date  ON marg_ede_bills (bill_date);
CREATE INDEX IF NOT EXISTS idx_marg_ede_bills_party ON marg_ede_bills (party_code);
CREATE INDEX IF NOT EXISTS idx_marg_ede_bills_type  ON marg_ede_bills (bill_type, bill_date);
CREATE INDEX IF NOT EXISTS idx_marg_ede_bills_no    ON marg_ede_bills (bill_no);

CREATE TABLE IF NOT EXISTS marg_ede_bill_items (
    marg_line_id        BIGINT PRIMARY KEY,           -- Dis.ID
    voucher             BIGINT NOT NULL REFERENCES marg_ede_bills(voucher) ON DELETE CASCADE,
    line_type           TEXT,                         -- Dis.Type: G P R B X D O
    line_bill_no        TEXT,                         -- Dis.VCN: supplier's bill no on purchases
    bill_date           DATE NOT NULL,
    party_code          TEXT,
    product_pid         BIGINT NOT NULL,              -- = margmaster_products.base_code
    item_company_code   TEXT,                         -- Dis.GCode: IB Moulins, IC others, ID third party
    line_kind           TEXT NOT NULL DEFAULT 'item', -- item | charge (### freight/insurance/...)
    batch               TEXT,
    expiry              DATE,                         -- AddField pos 6
    qty                 NUMERIC NOT NULL DEFAULT 0,
    free                NUMERIC NOT NULL DEFAULT 0,
    mrp                 NUMERIC,
    rate                NUMERIC,
    discount            NUMERIC NOT NULL DEFAULT 0,
    amount              NUMERIC NOT NULL DEFAULT 0,   -- qty * rate - discount
    gst_percent         NUMERIC,
    gst_amount          NUMERIC NOT NULL DEFAULT 0,
    salesman            TEXT,                         -- AddField pos 2
    challan_no          TEXT,                         -- AddField pos 22
    challan_date        DATE,                         -- AddField pos 23
    add_field           TEXT,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    row_hash            TEXT NOT NULL,
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marg_ede_bill_items_voucher ON marg_ede_bill_items (voucher);
CREATE INDEX IF NOT EXISTS idx_marg_ede_bill_items_product ON marg_ede_bill_items (product_pid, bill_date);
CREATE INDEX IF NOT EXISTS idx_marg_ede_bill_items_party   ON marg_ede_bill_items (party_code, bill_date);

-- One row per sync attempt, same idea as margmaster_sync_runs.
CREATE TABLE IF NOT EXISTS marg_ede_sync_runs (
    id               SERIAL PRIMARY KEY,
    status           TEXT        NOT NULL DEFAULT 'running',  -- running | completed | failed
    trigger_source   TEXT        NOT NULL DEFAULT 'manual',   -- manual | scheduled | cli
    datetime_from    TEXT,                                    -- Datetime sent to Marg; '' = full pull
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at      TIMESTAMPTZ,
    marg_datetime    TEXT,
    marg_datastatus  TEXT,
    bills_received   INTEGER NOT NULL DEFAULT 0,
    items_received   INTEGER NOT NULL DEFAULT 0,
    bills_new        INTEGER NOT NULL DEFAULT 0,
    bills_changed    INTEGER NOT NULL DEFAULT 0,
    items_new        INTEGER NOT NULL DEFAULT 0,
    items_changed    INTEGER NOT NULL DEFAULT 0,
    bills_deleted    INTEGER NOT NULL DEFAULT 0,
    items_deleted    INTEGER NOT NULL DEFAULT 0,
    warning          TEXT,
    error            TEXT
);

CREATE INDEX IF NOT EXISTS idx_marg_ede_sync_runs_started ON marg_ede_sync_runs (started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_marg_ede_sync_runs_single_active
    ON marg_ede_sync_runs ((status)) WHERE status = 'running';

-- Every line next to its bill's header fields: the "one flat table" view.
CREATE OR REPLACE VIEW v_marg_ede_bill_items AS
SELECT
    i.marg_line_id,
    b.voucher,
    b.bill_no,
    b.bill_type,
    b.bill_type_name,
    b.bill_date,
    b.party_code,
    b.bill_mode,
    b.total            AS bill_total,
    b.is_cancelled,
    b.lines_complete,
    i.line_type,
    i.line_kind,
    i.line_bill_no,
    i.product_pid,
    i.item_company_code,
    i.batch,
    i.expiry,
    i.qty,
    i.free,
    i.mrp,
    i.rate,
    i.discount,
    i.amount,
    i.gst_percent,
    i.gst_amount,
    i.amount + i.gst_amount AS line_total,
    i.salesman,
    i.challan_no,
    i.challan_date
FROM marg_ede_bill_items i
JOIN marg_ede_bills b ON b.voucher = i.voucher
WHERE NOT i.is_deleted AND NOT b.is_deleted;
