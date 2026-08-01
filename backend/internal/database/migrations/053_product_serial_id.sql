ALTER TABLE products ADD COLUMN IF NOT EXISTS product_id SERIAL NOT NULL;
ALTER TABLE products ADD CONSTRAINT products_product_id_unique UNIQUE (product_id);
