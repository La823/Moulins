CREATE TABLE IF NOT EXISTS margmaster_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    company TEXT,
    salt TEXT,
    gcode TEXT,
    mrp NUMERIC,
    rate NUMERIC,
    prate NUMERIC,
    deal NUMERIC,
    free NUMERIC,
    total_stock NUMERIC NOT NULL DEFAULT 0,
    batch_count INT NOT NULL DEFAULT 0,
    current_batch TEXT,
    exp TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS margmaster_product_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    margmaster_product_id UUID NOT NULL REFERENCES margmaster_products(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    rid TEXT,
    curbatch TEXT,
    exp TEXT,
    stock NUMERIC NOT NULL DEFAULT 0,
    mrp NUMERIC,
    rate NUMERIC,
    prate NUMERIC,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_margmaster_product_batches_product_id ON margmaster_product_batches(margmaster_product_id);

CREATE TABLE IF NOT EXISTS margmaster_party (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rid TEXT UNIQUE NOT NULL,
    code TEXT,
    name TEXT,
    area TEXT,
    address TEXT,
    balance NUMERIC,
    pdc NUMERIC,
    gcode TEXT,
    opening NUMERIC,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    phone1 TEXT,
    phone2 TEXT,
    phone3 TEXT,
    phone4 TEXT,
    email1 TEXT,
    email2 TEXT,
    email3 TEXT,
    bank TEXT,
    branch TEXT,
    margcode TEXT,
    gstin TEXT,
    dlno TEXT,
    ledgercode TEXT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS margmaster_sync_state (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    last_synced_at TIMESTAMPTZ,
    CONSTRAINT margmaster_sync_state_single_row CHECK (id)
);
