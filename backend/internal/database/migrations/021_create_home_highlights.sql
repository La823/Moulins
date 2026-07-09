CREATE TABLE IF NOT EXISTS home_highlights (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    heading TEXT NOT NULL DEFAULT 'Explore Our Most Curated Collection',
    card1_image_key TEXT,
    card1_button_text TEXT NOT NULL DEFAULT 'View All Products',
    card1_link_url TEXT NOT NULL DEFAULT '/products',
    card2_image_key TEXT,
    card2_button_text TEXT NOT NULL DEFAULT 'View All Products',
    card2_link_url TEXT NOT NULL DEFAULT '/products',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO home_highlights (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
