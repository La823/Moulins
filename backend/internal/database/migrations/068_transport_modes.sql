CREATE TABLE IF NOT EXISTS transport_modes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO transport_modes (name) VALUES ('courier'), ('transport')
ON CONFLICT (name) DO NOTHING;

-- Modes are now an admin-managed, extensible list rather than a fixed pair —
-- drop the hardcoded CHECK constraints that limited every mode column to
-- exactly 'courier'/'transport'. Validity is enforced in application code
-- against transport_modes instead.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_default_transport_mode_check;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_transport_mode_check;
ALTER TABLE transports DROP CONSTRAINT IF EXISTS transports_mode_check;
