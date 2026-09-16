ALTER TABLE pms_fields DROP CONSTRAINT pms_fields_field_type_check;
ALTER TABLE pms_fields ADD CONSTRAINT pms_fields_field_type_check CHECK (field_type IN ('text', 'boolean', 'dropdown', 'image'));
