CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO categories (name) VALUES
    ('Skin'),
    ('Hair'),
    ('Wellness'),
    ('Immunity'),
    ('Digestion'),
    ('Pain Relief'),
    ('Personal Care')
ON CONFLICT (name) DO NOTHING;
