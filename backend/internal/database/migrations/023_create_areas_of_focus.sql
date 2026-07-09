CREATE TABLE IF NOT EXISTS home_focus_section (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    heading TEXT NOT NULL DEFAULT 'Areas of focus',
    description TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO home_focus_section (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS home_focus_cards (
    id SERIAL PRIMARY KEY,
    position INT NOT NULL UNIQUE CHECK (position BETWEEN 1 AND 4),
    image_key TEXT,
    title TEXT NOT NULL DEFAULT '',
    link_url TEXT NOT NULL DEFAULT '/products',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO home_focus_cards (position)
VALUES (1), (2), (3), (4)
ON CONFLICT (position) DO NOTHING;
