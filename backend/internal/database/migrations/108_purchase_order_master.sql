-- Raw import of the "Moulins" purchase-order tracking sheet (Purchase Order
-- V6.xlsm) as a master reference table. Deliberately loose typing (mostly
-- TEXT) since the source sheet is inconsistent — mixed date formats, MRP
-- values that are sometimes numbers and sometimes strings like "128/STRIP",
-- status values with inconsistent casing/spelling, #VALUE! formula errors.
-- This is a staging/reference copy, not yet wired into the app; cleanup and
-- normalization happens later once it's decided what to change.
CREATE TABLE IF NOT EXISTS purchase_order_master (
    id             SERIAL PRIMARY KEY,
    sr_no          INTEGER,
    po_date        TEXT,
    po_number      TEXT,
    product_name   TEXT,
    quantity       NUMERIC,
    mrp            TEXT,
    rate           NUMERIC,
    estimate       NUMERIC,
    specifications TEXT,
    type           TEXT,
    company        TEXT,
    qty_received   NUMERIC,
    remarks        TEXT,
    category       TEXT,
    status         TEXT,
    time_stamp     TEXT,
    days_diff      TEXT,
    bill_number    TEXT,
    imported_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_master_po_number ON purchase_order_master(po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_order_master_status ON purchase_order_master(status);
CREATE INDEX IF NOT EXISTS idx_purchase_order_master_company ON purchase_order_master(company);
