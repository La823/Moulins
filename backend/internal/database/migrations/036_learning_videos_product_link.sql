ALTER TABLE learning_videos ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

CREATE INDEX IF NOT EXISTS idx_learning_videos_product ON learning_videos(product_id);
