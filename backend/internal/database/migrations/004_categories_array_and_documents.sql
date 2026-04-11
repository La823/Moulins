-- Convert single category to array of categories
ALTER TABLE products DROP COLUMN IF EXISTS category;
ALTER TABLE products ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}';

-- Create index for array searches (GIN index)
CREATE INDEX IF NOT EXISTS idx_products_categories ON products USING GIN(categories);

-- Create product_documents table for PDFs
CREATE TABLE IF NOT EXISTS product_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    file_key VARCHAR(500) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_documents_product_id ON product_documents(product_id);
