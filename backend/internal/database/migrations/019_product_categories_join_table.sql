CREATE TABLE IF NOT EXISTS product_categories (
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
);

-- Backfill from the old free-text array, matching by name
INSERT INTO product_categories (product_id, category_id)
SELECT p.id, c.id
FROM products p
CROSS JOIN LATERAL unnest(p.categories) AS cat_name
JOIN categories c ON c.name = cat_name
ON CONFLICT DO NOTHING;

ALTER TABLE products DROP COLUMN categories;
