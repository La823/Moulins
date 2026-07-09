CREATE TABLE IF NOT EXISTS home_carousel_slides (
    id SERIAL PRIMARY KEY,
    position INT NOT NULL UNIQUE CHECK (position BETWEEN 1 AND 4),
    image_key TEXT,
    heading TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    button_text TEXT NOT NULL DEFAULT 'Learn More',
    button_link TEXT NOT NULL DEFAULT '/products',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO home_carousel_slides (position)
VALUES (1), (2), (3), (4)
ON CONFLICT (position) DO NOTHING;
