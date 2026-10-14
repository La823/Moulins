-- Every product form has a specification type, kept in step by the
-- database itself so it holds however a form is created:
--
--  * a new product form gets its type at once (trigger below);
--  * renaming a form renames its type's stored name;
--  * deleting a form keeps its type and fields — the link is cleared
--    (ON DELETE SET NULL) instead of the row going, so no specifications are
--    lost. If a form of the same name is created again, it takes that type
--    back, fields and all.
--
-- pms_types.name is now just the label (a copy of the form's name), so its
-- UNIQUE constraint goes — a removed form's type and a new form can share it.

ALTER TABLE pms_types DROP CONSTRAINT IF EXISTS pms_types_name_key;
ALTER TABLE pms_types DROP CONSTRAINT IF EXISTS pms_types_product_form_id_fkey;
ALTER TABLE pms_types ADD CONSTRAINT pms_types_product_form_id_fkey
    FOREIGN KEY (product_form_id) REFERENCES product_forms(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION pms_type_for_new_form() RETURNS trigger AS $$
DECLARE
    kept_id INTEGER;
BEGIN
    -- a removed form's type with this name comes back, specifications and all
    SELECT id INTO kept_id FROM pms_types
    WHERE product_form_id IS NULL AND lower(trim(name)) = lower(trim(NEW.name))
    ORDER BY id LIMIT 1;

    IF kept_id IS NOT NULL THEN
        UPDATE pms_types SET product_form_id = NEW.id, name = NEW.name WHERE id = kept_id;
    ELSE
        INSERT INTO pms_types (product_form_id, name) VALUES (NEW.id, NEW.name)
        ON CONFLICT (product_form_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_forms_pms_type ON product_forms;
CREATE TRIGGER product_forms_pms_type
    AFTER INSERT ON product_forms
    FOR EACH ROW EXECUTE FUNCTION pms_type_for_new_form();

CREATE OR REPLACE FUNCTION pms_type_follow_form_rename() RETURNS trigger AS $$
BEGIN
    UPDATE pms_types SET name = NEW.name WHERE product_form_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS product_forms_pms_type_rename ON product_forms;
CREATE TRIGGER product_forms_pms_type_rename
    AFTER UPDATE OF name ON product_forms
    FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
    EXECUTE FUNCTION pms_type_follow_form_rename();

-- every existing form that has no type yet gets one
INSERT INTO pms_types (product_form_id, name)
SELECT f.id, f.name FROM product_forms f
WHERE NOT EXISTS (SELECT 1 FROM pms_types t WHERE t.product_form_id = f.id);
