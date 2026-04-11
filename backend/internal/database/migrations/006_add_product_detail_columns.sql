-- Add detailed product columns from the 1mg product sheet

ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_name VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_form VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS consume_type VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_form VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS key_ingredients TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS strength TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_weight VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS key_benefits TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS direction_for_use TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS safety_information TEXT;

-- Widen hsn_code in case it already existed at a smaller size
ALTER TABLE products ALTER COLUMN hsn_code TYPE VARCHAR(50);

-- Index on product_form and consume_type for filtering
CREATE INDEX IF NOT EXISTS idx_products_product_form ON products(product_form);
CREATE INDEX IF NOT EXISTS idx_products_consume_type ON products(consume_type);
