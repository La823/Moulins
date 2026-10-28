-- A note on a specification field, set on the Product Specifications page
-- and shown under the field wherever it is filled in (e.g. "match the
-- shade on the approved sample"). Optional; NULL = no note.
--
-- The per-answer comment needs no column: it is saved beside the answer in
-- the same specifications blob, under "<field id>_comment".
ALTER TABLE pms_fields ADD COLUMN IF NOT EXISTS help_text TEXT;
