-- Create product_images table for multiple images per product
CREATE TABLE IF NOT EXISTS product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_key VARCHAR(500) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);

-- Migrate existing image_key data into product_images table
INSERT INTO product_images (product_id, image_key, sort_order)
SELECT id, image_key, 0 FROM products WHERE image_key IS NOT NULL AND image_key != '';

-- Drop old single image column
ALTER TABLE products DROP COLUMN IF EXISTS image_key;
