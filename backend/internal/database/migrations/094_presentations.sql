ALTER TABLE product_images ADD COLUMN IF NOT EXISTS visual_aid BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS partner_presentations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Untitled Presentation',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_presentations_partner ON partner_presentations(partner_id);

CREATE TABLE IF NOT EXISTS presentation_slides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    presentation_id UUID NOT NULL REFERENCES partner_presentations(id) ON DELETE CASCADE,
    product_image_id UUID NOT NULL REFERENCES product_images(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presentation_slides_presentation ON presentation_slides(presentation_id, sort_order);
