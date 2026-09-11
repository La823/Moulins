-- Human-readable, sequential manufacturer code (MFR0001, MFR0002, ...),
-- matching the existing PO number scheme (MP0001, ...). Nullable at the DB
-- level only until the backfill runs; the app always sets it on create.
ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS code VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS idx_manufacturers_code ON manufacturers (code);
