-- Official GST rates from the CBIC goods-rate schedule, keyed by HSN.
--
-- Deliberately NOT a column on hsn_codes: one HSN can carry several rates,
-- because the rate depends on the goods description, not the code alone.
-- 2106 for example spans 0% (prasadam), 5% (sweetmeats), 12% (diabetic
-- foods), 18% (food preparations n.e.s.) and 28% (pan masala). Flattening
-- that to one number per code would put a wrong figure in a tax field.
-- 269 of the 1,119 codes in the schedule are like this.
--
-- So: many rows per code, each with the description that qualifies it, and
-- the UI shows the candidates rather than picking one.
CREATE TABLE IF NOT EXISTS hsn_gst_rates (
    id          SERIAL PRIMARY KEY,
    code        TEXT NOT NULL,
    schedule    TEXT,            -- I / II / III / IV ... from the notification
    description TEXT NOT NULL,   -- the entry that qualifies this rate
    cgst        NUMERIC(6,2),
    sgst        NUMERIC(6,2),
    igst        NUMERIC(6,2),
    cess        TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hsn_gst_rates_code ON hsn_gst_rates (code);

-- One row per (code, description, igst): re-importing the schedule replaces
-- rather than duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hsn_gst_rates_unique
    ON hsn_gst_rates (code, md5(description), COALESCE(igst, -1));
