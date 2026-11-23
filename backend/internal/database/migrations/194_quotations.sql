-- Quotations (23 Nov 2026): a register of prices quoted, one product per
-- entry. Nothing else hangs off it (no order is made from a quotation).
--
-- customer_kind says who the quote is for:
--   existing    a customer in the app (customer_id; customer_name keeps
--               their name as it was, for the list)
--   new         a customer not in the app yet, by name
--   third_party a third party's quote, by name
-- given_by is the staff account that gave the quotation (by default whoever
-- entered it); created_by is who entered it.
CREATE TABLE IF NOT EXISTS quotations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_kind  TEXT NOT NULL CHECK (customer_kind IN ('existing', 'new', 'third_party')),
    customer_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    customer_name  TEXT NOT NULL,
    product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name   TEXT NOT NULL,
    rate           NUMERIC(12,2) NOT NULL CHECK (rate >= 0),
    remarks        TEXT,
    quoted_at      TIMESTAMPTZ NOT NULL,
    given_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ,                -- removed entries stay for the record
    CHECK (customer_kind <> 'existing' OR customer_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_quotations_quoted_at ON quotations (quoted_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations (customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_product ON quotations (product_id) WHERE deleted_at IS NULL;
