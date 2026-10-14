-- A specification type is now one of the product forms (Tablet, Capsules,
-- Syrup, ...) picked from product_forms, linked by id — not a free-typed
-- name. The type's name is read live from product_forms, so renaming a form
-- renames its specification type everywhere and nothing goes stale.
--
-- One type per form (UNIQUE). No ON DELETE rule on purpose: clearing a form
-- that still has specification fields is refused by ClearProductForm with a
-- clear message, rather than silently deleting those fields.
--
-- pms_types.name is kept (now nullable and unused) instead of dropped, so the
-- code still running when this migration lands keeps working until the new
-- code replaces it. pms_types had no rows when this was written.
ALTER TABLE pms_types ADD COLUMN IF NOT EXISTS product_form_id INTEGER UNIQUE REFERENCES product_forms(id);
ALTER TABLE pms_types ALTER COLUMN name DROP NOT NULL;

-- Any type made the old way gets linked to the form of the same name.
UPDATE pms_types t SET product_form_id = f.id
FROM product_forms f
WHERE t.product_form_id IS NULL AND lower(trim(t.name)) = lower(trim(f.name));
