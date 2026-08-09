ALTER TABLE users ADD COLUMN IF NOT EXISTS default_transport_mode VARCHAR(20) NOT NULL DEFAULT 'courier';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_default_transport_mode_check;
ALTER TABLE users ADD CONSTRAINT users_default_transport_mode_check CHECK (default_transport_mode IN ('courier', 'transport'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS transport_mode VARCHAR(20) NOT NULL DEFAULT 'courier';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_transport_mode_check;
ALTER TABLE orders ADD CONSTRAINT orders_transport_mode_check CHECK (transport_mode IN ('courier', 'transport'));
