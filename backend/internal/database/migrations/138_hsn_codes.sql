-- HSN/SAC reference master, loaded from the government HSN sheet.
--
-- One table, not one per digit-length. The level is derivable from the code
-- itself, and at ~22k rows the whole table plus indexes is about 5 MB — a
-- primary-key lookup measures 0.04 ms server-side, against a ~400 ms round
-- trip to the database region. Sharding by length or hand-rolling a binary
-- search would optimise something that is already four orders of magnitude
-- faster than the network it has to cross.
CREATE TABLE IF NOT EXISTS hsn_codes (
    code        TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    -- 2 = chapter, 4 = heading, 6 = subheading, 8 = tariff item.
    -- Generated so it can never drift from the code.
    level       SMALLINT GENERATED ALWAYS AS (length(code)) STORED,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- text_pattern_ops so LIKE 'prefix%' can use the index regardless of the
-- database collation.
CREATE INDEX IF NOT EXISTS idx_hsn_codes_prefix
    ON hsn_codes (code text_pattern_ops);
