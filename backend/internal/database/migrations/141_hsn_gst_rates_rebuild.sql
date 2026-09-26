-- Rebuild of the GST rate data from the CBIC goods schedule.
--
-- The first load of hsn_gst_rates (migration 140) was parsed with a regex that
-- tokenised the code column on whitespace. CBIC writes tariff items spaced —
-- "4011 30 00" — so that parser emitted a bogus standalone "30" and filed
-- aircraft tyres, handmade lace, kerosene stoves and jarda tobacco under
-- chapter 30. Pharmaceuticals were the visible casualty. It also treated the
-- codes inside "[other than 1404 90 10, ...]" as codes the rate APPLIED to,
-- when they are precisely the codes it does NOT apply to.
--
-- The rebuild joins the digit runs within each comma-separated fragment before
-- validating, and routes exclusions to hsn_gst_exceptions instead of emitting
-- them as rates.
--
-- Two columns are added:
--   serial  the CBIC S. No., so any row can be traced back to the notification
--   source  provenance, because not all rows come from the same place

ALTER TABLE hsn_gst_rates ADD COLUMN IF NOT EXISTS serial TEXT;
ALTER TABLE hsn_gst_rates ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'cbic_goods_table';

-- Exceptions: everything on a schedule row that is NOT a plain "this code is
-- taxed at this rate" fact. Kept rather than discarded so the rate table can
-- be audited against the notification, and so a later pass can resolve them.
--
--   excluded_code  the rate explicitly does NOT apply to this code
--   any_chapter    entry applies across chapters, so it has no single code
--   omitted        the schedule row reads "[Omitted]"
--   unparsed       the code cell is malformed AT SOURCE (CBIC typos: S.No 22
--                  reads "7", S.No 186B reads "386" for bio-diesel). Left
--                  unresolved deliberately — guessing the intended code would
--                  put an invented number in a tax field.
CREATE TABLE IF NOT EXISTS hsn_gst_exceptions (
    id          SERIAL PRIMARY KEY,
    schedule    TEXT,
    serial      TEXT,
    kind        TEXT NOT NULL,
    code        TEXT,             -- set when kind = 'excluded_code'
    raw         TEXT,             -- the original code cell, verbatim
    description TEXT,
    igst        NUMERIC(6,2),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hsn_gst_exceptions_code ON hsn_gst_exceptions (code);
CREATE INDEX IF NOT EXISTS idx_hsn_gst_exceptions_kind ON hsn_gst_exceptions (kind);
