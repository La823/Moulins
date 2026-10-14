-- A specification field can be shown only when another field of the same
-- type has a given answer — e.g. "Carton remark" only when "Carton
-- required" is Yes. One rule per field.
--
-- show_if_field_id: the field it depends on, by id (a rename can't break
-- it). Must be a Yes/No or dropdown field. Deleting it drops the rule
-- (SET NULL), and the dependent field is then always shown.
-- show_if_values: the answers that show this field, as a JSON array —
-- [true] for a Yes/No, ["Blister", "Strip"] for a dropdown.
--
-- A hidden field is not required, and its value is cleared on save.
ALTER TABLE pms_fields ADD COLUMN IF NOT EXISTS show_if_field_id INTEGER REFERENCES pms_fields(id) ON DELETE SET NULL;
ALTER TABLE pms_fields ADD COLUMN IF NOT EXISTS show_if_values JSONB;
