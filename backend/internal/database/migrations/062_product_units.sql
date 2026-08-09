CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO units (name) VALUES
    ('Per Box'),
    ('Per Strip'),
    ('Per Bottle'),
    ('Per Unit')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp_unit VARCHAR(50);
