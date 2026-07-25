ALTER TABLE users ADD COLUMN customer_type TEXT NOT NULL DEFAULT 'normal';

CREATE TABLE special_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC,
    stock INT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    brand_name TEXT, hsn_code TEXT, gst_rate NUMERIC, mrp NUMERIC,
    product_form TEXT, consume_type TEXT, pack_size TEXT, pack_form TEXT,
    key_ingredients TEXT, strength TEXT, product_weight TEXT, key_benefits TEXT,
    direction_for_use TEXT, safety_info TEXT,
    audio_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_special_products_customer ON special_products(customer_id);

CREATE TABLE special_product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    special_product_id UUID NOT NULL REFERENCES special_products(id) ON DELETE CASCADE,
    image_key TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE special_product_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    special_product_id UUID NOT NULL REFERENCES special_products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
