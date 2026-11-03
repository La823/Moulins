-- Cheque register (admin panel › Cheque Register): every payment made to a
-- supplier — cheques and transfers — what it pays, where it is, and notes.
--
-- A payment is split over the purchase orders it pays (one cheque often pays
-- several POs; a PO can be paid in parts). What a PO owes is the supplier's
-- bill amount, entered when the goods arrive; the credit period starts the
-- day the PO is marked received.

-- the bill that came with the goods, and the day they arrived
ALTER TABLE purchase_order_master ADD COLUMN IF NOT EXISTS bill_date   DATE;
ALTER TABLE purchase_order_master ADD COLUMN IF NOT EXISTS bill_amount NUMERIC(14,2);
ALTER TABLE purchase_order_master ADD COLUMN IF NOT EXISTS received_on DATE;

-- POs the sheet marked received: the sheet's time stamp is the day the
-- status last changed, the nearest thing it kept to a received date
UPDATE purchase_order_master
SET received_on = time_stamp_date
WHERE received_on IS NULL AND time_stamp_date IS NOT NULL
  AND regexp_replace(lower(COALESCE(status, '')), '[^a-z]', '', 'g') IN ('received', 'recived', 'recevied');

-- days a supplier gives to pay
ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS credit_days INTEGER;

CREATE TABLE IF NOT EXISTS supplier_payments (
    id                BIGSERIAL PRIMARY KEY,
    method            TEXT NOT NULL DEFAULT 'cheque'
                      CHECK (method IN ('cheque', 'neft', 'rtgs', 'imps', 'upi', 'cash', 'other')),
    bank              TEXT,                 -- the bank it is drawn on: ICICI BANK, HDFC, …
    cheque_no         TEXT,                 -- cheques only
    payment_date      DATE,                 -- the date on the cheque, or of the transfer
    payee             TEXT NOT NULL,
    manufacturer_id   UUID REFERENCES manufacturers(id) ON DELETE SET NULL,
    amount            NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    status            TEXT NOT NULL DEFAULT 'made'
                      CHECK (status IN ('made', 'in_office', 'handed_over', 'cleared', 'cancelled')),
    status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cheque_profile_id BIGINT REFERENCES cheque_profiles(id) ON DELETE SET NULL,
    source            TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'print', 'import')),
    import_ref        TEXT UNIQUE,          -- where an imported row came from, so a re-import updates it
    created_by        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS supplier_payments_status_idx ON supplier_payments (status);
CREATE INDEX IF NOT EXISTS supplier_payments_cheque_idx ON supplier_payments (bank, cheque_no);
CREATE INDEX IF NOT EXISTS supplier_payments_mfr_idx ON supplier_payments (manufacturer_id);

-- how much of a payment goes to each PO line
CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
    id          BIGSERIAL PRIMARY KEY,
    payment_id  BIGINT NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
    po_id       INTEGER NOT NULL REFERENCES purchase_order_master(id) ON DELETE CASCADE,
    amount      NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (payment_id, po_id)
);
CREATE INDEX IF NOT EXISTS supplier_payment_allocations_po_idx ON supplier_payment_allocations (po_id);

-- a payment's history: status changes, remarks, edits — newest last
CREATE TABLE IF NOT EXISTS supplier_payment_events (
    id          BIGSERIAL PRIMARY KEY,
    payment_id  BIGINT NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('created', 'status', 'remark', 'edited')),
    status      TEXT,
    note        TEXT,
    actor_id    UUID,
    actor_name  TEXT,                       -- for rows with no user, e.g. "Excel import"
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS supplier_payment_events_payment_idx ON supplier_payment_events (payment_id, created_at);

-- shared settings for the register, e.g. the date "to be made" counts from
CREATE TABLE IF NOT EXISTS supplier_payment_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO supplier_payment_settings (key, value) VALUES ('dues_from', '2026-10-01')
ON CONFLICT (key) DO NOTHING;
