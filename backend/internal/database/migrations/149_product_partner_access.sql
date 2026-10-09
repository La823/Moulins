-- Who can see a product.
--
-- A normal product (exclusive = false) is in everyone's catalogue, logged in
-- or not, except for partners given a 'hidden' row for it. An exclusive
-- product is in nobody's catalogue — not the public website's either —
-- except for partners given an 'allowed' row for it. Staff see everything.
--
-- Each row says what it means rather than taking its meaning from the
-- product's exclusive flag, so switching a product between normal and
-- exclusive can never silently turn its hidden-from list into an
-- allowed-for list, or the other way round.
--
-- partner_id is the partner's own user id. A team member sees what their
-- partner sees, so team members never get rows of their own.
ALTER TABLE products ADD COLUMN IF NOT EXISTS exclusive BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS product_partner_access (
    product_id UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    partner_id UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    access     TEXT        NOT NULL CHECK (access IN ('hidden', 'allowed')),
    created_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (product_id, partner_id)
);

-- the catalogue filter looks rows up by (product, partner) — the primary key
-- covers that; this one is for "what is hidden from / allowed for partner X"
CREATE INDEX IF NOT EXISTS product_partner_access_partner_idx
    ON product_partner_access (partner_id);
