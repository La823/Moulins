-- A small copy of each product's first image, for product cards and lists,
-- so a page of cards doesn't download every full-size original.
--
-- It is a separate file (under thumbs/ in the bucket), made by reading the
-- first image — the original is never modified. The product page, full
-- screen view and visual aids keep using the originals.
--
-- thumb_source_key is the image the thumbnail was made from, so the admin
-- page can tell when the first image has since changed and offer to
-- regenerate. Both are NULL until a thumbnail is made; cards then fall back
-- to the original.
ALTER TABLE products ADD COLUMN IF NOT EXISTS thumb_key        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS thumb_source_key TEXT;
