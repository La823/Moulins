-- Product Manufacturer Specification (PMS) schema: lets staff define, per
-- product type (capsule, tablet, syrup, ...), a set of specification fields
-- with a type (text/boolean/dropdown), and for dropdown fields the list of
-- persisted options. Actual per-PO values are stored elsewhere as a JSON
-- blob keyed by field id — this schema only defines the shape.

CREATE TABLE IF NOT EXISTS pms_types (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pms_fields (
    id          SERIAL PRIMARY KEY,
    type_id     INTEGER NOT NULL REFERENCES pms_types(id) ON DELETE CASCADE,
    field_name  TEXT NOT NULL,
    field_type  TEXT NOT NULL CHECK (field_type IN ('text', 'boolean', 'dropdown')),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pms_fields_type_id ON pms_fields(type_id);

CREATE TABLE IF NOT EXISTS pms_field_options (
    id           SERIAL PRIMARY KEY,
    field_id     INTEGER NOT NULL REFERENCES pms_fields(id) ON DELETE CASCADE,
    option_value TEXT NOT NULL,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pms_field_options_field_id ON pms_field_options(field_id);
