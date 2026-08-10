-- Deleting a transport shouldn't be permanently blocked by historical
-- orders that reference it — clear the reference instead, keeping the
-- order's own transport_mode intact.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_transport_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_transport_id_fkey
    FOREIGN KEY (transport_id) REFERENCES transports(id) ON DELETE SET NULL;
