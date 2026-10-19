-- Marg's HSN list (the COMMCD group of the MargMST2017 Stype sub-master):
-- a product's Gcode6 is a short code into it. Only full pulls carry Stype,
-- so without keeping it a product created between full pulls never got its
-- hsn_code (42 products were missing one on 19 Oct 2026). The sync saves the
-- list whenever a pull includes it and resolves from it on every pull.
CREATE TABLE IF NOT EXISTS margmaster_commodity_codes (
    scode      TEXT PRIMARY KEY,                -- Stype scode, = margmaster_products.gcode6 (trimmed)
    hsn        TEXT NOT NULL,
    synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
