-- Dispatch team, part 2 (decided 16 Nov 2026).
--
-- 1. Rotating assignment. When an order is sent to packing it is assigned to
--    the next dispatch member present that day, round-robin (internal/dispatch).
--    Present = punched in on the fingerprint scanner today and not on a full
--    day of approved leave; a member whose login isn't linked to the scanner
--    can't be checked and counts as present. An admin can take a member out
--    of the rotation (the team lead, or someone at the other warehouse).
--    Everyone on the team still sees every order to pack, their own first,
--    and staff can reassign.
ALTER TABLE users ADD COLUMN IF NOT EXISTS packing_rotation_skip BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packing_assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packing_assigned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_orders_packing_assigned_at ON orders (packing_assigned_at DESC) WHERE packing_assigned_at IS NOT NULL;

-- 2. Freight bills: the dispatch team records each transporter's freight bill
--    (a photo or PDF of it) and what was paid for it; admins see them all.
CREATE TABLE IF NOT EXISTS freight_bills (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_no           TEXT,
    bill_date         DATE,
    transport_id      UUID REFERENCES transports(id) ON DELETE SET NULL,
    transporter_name  TEXT,                 -- as picked, or typed when not in the list
    amount_paid       NUMERIC(12,2) NOT NULL CHECK (amount_paid >= 0),
    payment_mode      TEXT NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'bank', 'cheque', 'other')),
    paid_by           TEXT,                 -- who paid, in plain words
    remarks           TEXT,
    file_key          TEXT NOT NULL,        -- the bill's photo or PDF in S3
    file_name         TEXT,
    content_type      TEXT,
    created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ           -- removed bills stay for the record
);
CREATE INDEX IF NOT EXISTS idx_freight_bills_date ON freight_bills (bill_date DESC, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_freight_bills_created_by ON freight_bills (created_by) WHERE deleted_at IS NULL;

-- 3. Dispatch logins also see Marg stock and record freight bills.
INSERT INTO employee_permissions (user_id, permission)
SELECT u.id, p.permission
FROM users u CROSS JOIN (VALUES ('marg_stock_view'), ('freight_bills_edit')) AS p(permission)
WHERE u.staff_group = 'dispatch'
ON CONFLICT DO NOTHING;
