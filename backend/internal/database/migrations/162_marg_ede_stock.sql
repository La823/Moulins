-- Products and batch-wise stock from Marg's Corporate EDE API (Product and
-- Stock blobs), filled by the same 15-minute sync as marg_ede_bills.
--
-- Separate from margmaster_products / margmaster_product_batches (the other
-- Marg API, used by the app). Compared on 19 Oct 2026: MRP, purchase rate
-- and expiry agree; stock agrees except that the other API never sends
-- negative stock (it shows 0) and updates some batches late.
-- v_marg_ede_stock shows, per batch, how it compares.

CREATE TABLE IF NOT EXISTS marg_ede_products (
    product_pid        BIGINT PRIMARY KEY,           -- Product.PID = margmaster_products.base_code
    marg_id            BIGINT,                       -- Product.ID
    code               TEXT,                         -- the code shown in Marg, e.g. 109, A00087, ###5
    name               TEXT NOT NULL,
    unit               TEXT,
    pack               NUMERIC,
    kind               TEXT NOT NULL DEFAULT 'item', -- item | charge (### freight/insurance/...)
    company_code       TEXT,                         -- GCode: IB, IC, ID
    company_name       TEXT,
    form_code          TEXT,                         -- GCode3 (Marg's "SALT" list: tablet, capsule, ...)
    form_name          TEXT,
    hsn_code           TEXT,                         -- GCode6 resolved through the COMMCD list
    gst_percent        NUMERIC,
    add_field          TEXT,
    is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,
    row_hash           TEXT NOT NULL,
    first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marg_ede_stock (
    marg_id            BIGINT PRIMARY KEY,           -- Stock.ID
    product_pid        BIGINT NOT NULL,
    batch              TEXT,                         -- NULL on batch-less rows
    item_company_code  TEXT,
    batch_date         DATE,
    expiry             DATE,
    supplier_invoice   TEXT,
    supplier_invoice_date DATE,
    supplier_code      TEXT,
    opening            NUMERIC NOT NULL DEFAULT 0,   -- stock on 1 April
    stock              NUMERIC NOT NULL DEFAULT 0,   -- current; can be negative
    broken_stock       NUMERIC NOT NULL DEFAULT 0,
    cost_rate          NUMERIC,                      -- LPRate
    purchase_rate      NUMERIC,                      -- PRate
    mrp                NUMERIC,
    rate_a             NUMERIC,
    rate_b             NUMERIC,
    rate_c             NUMERIC,
    add_field          TEXT,
    is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,
    row_hash           TEXT NOT NULL,
    first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marg_ede_stock_product ON marg_ede_stock (product_pid);
CREATE INDEX IF NOT EXISTS idx_marg_ede_stock_expiry  ON marg_ede_stock (expiry) WHERE NOT is_deleted;

ALTER TABLE marg_ede_sync_runs
    ADD COLUMN IF NOT EXISTS products_received INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS products_new      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS products_changed  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS products_deleted  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stock_received    INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stock_new         INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stock_changed     INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stock_deleted     INTEGER NOT NULL DEFAULT 0;

-- Each live batch with its product and the matching product-master batch
-- (margmaster_product_batches.code is "PID-BATCH", or "PID" with no batch).
CREATE OR REPLACE VIEW v_marg_ede_stock AS
SELECT
    s.*,
    p.code              AS product_code,
    p.name              AS product_name,
    p.kind              AS product_kind,
    p.company_name,
    mb.id IS NOT NULL   AS in_master,
    mb.stock            AS master_stock,
    mb.mrp              AS master_mrp,
    mb.prate            AS master_purchase_rate,
    mb.exp              AS master_expiry,
    mb.synced_at        AS master_synced_at,
    CASE
        WHEN mb.id IS NULL THEN 'not_in_master'
        WHEN mb.is_deleted THEN 'deleted_in_master'
        WHEN s.stock < 0 AND COALESCE(mb.stock, 0) = 0 THEN 'negative_master_zero'
        WHEN s.stock IS DISTINCT FROM mb.stock
          OR s.mrp IS DISTINCT FROM mb.mrp
          OR s.purchase_rate IS DISTINCT FROM mb.prate
          OR TO_CHAR(s.expiry, 'YYYYMMDD') IS DISTINCT FROM NULLIF(TRIM(mb.exp), '') THEN 'differs'
        ELSE 'match'
    END                 AS master_status
FROM marg_ede_stock s
LEFT JOIN marg_ede_products p ON p.product_pid = s.product_pid
LEFT JOIN margmaster_product_batches mb
       ON mb.code = s.product_pid::text || COALESCE('-' || s.batch, '')
WHERE NOT s.is_deleted;
