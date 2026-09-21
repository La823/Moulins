ALTER TABLE margmaster_products
    ADD COLUMN IF NOT EXISTS gcode6 TEXT,
    ADD COLUMN IF NOT EXISTS hsn_code TEXT;
