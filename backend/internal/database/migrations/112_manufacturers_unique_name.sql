-- Prevent case-variant duplicate manufacturers (the PO master import had
-- the same company spelled multiple ways, e.g. "Altar sri" / "ALTAR SRI").
CREATE UNIQUE INDEX IF NOT EXISTS idx_manufacturers_name_lower ON manufacturers (lower(name));
