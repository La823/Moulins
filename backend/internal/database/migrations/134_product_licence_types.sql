-- Regulatory licence classification per product: Drug, Food or Cosmetic.
--
-- A lookup table rather than a text column or a CHECK constraint, even
-- though only three values exist today: the set is a business/regulatory
-- classification that admins should be able to extend or rename without a
-- migration, and linking by id means a rename never orphans the products
-- pointing at it. Same reasoning as product_forms (migration 131).
CREATE TABLE IF NOT EXISTS product_licence_types (
    id          SERIAL PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO product_licence_types (name, description) VALUES
    ('Drug',     'Manufactured and sold under a drug licence'),
    ('Food',     'Nutraceutical / food supplement, sold under an FSSAI licence'),
    ('Cosmetic', 'Sold under a cosmetic licence')
ON CONFLICT (name) DO NOTHING;

-- ON DELETE SET NULL: removing a licence type must never delete products.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS licence_type_id INTEGER
    REFERENCES product_licence_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_licence_type_id
    ON products (licence_type_id);
