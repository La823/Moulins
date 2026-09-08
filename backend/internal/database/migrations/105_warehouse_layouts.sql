-- 105_warehouse_layouts.sql — storage for the warehouse layout editor,
-- ported from the standalone editor's own schema/0001_init.sql. A layout is
-- stored whole, as JSONB, under a unique name. schema_version is denormalized
-- from the JSON document so rows needing migration after a format bump can be
-- queried directly.

CREATE TABLE IF NOT EXISTS warehouse_layouts (
    id             SERIAL PRIMARY KEY,
    name           TEXT        NOT NULL UNIQUE,
    schema_version INTEGER     NOT NULL,
    data           JSONB       NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_layouts_schema_version ON warehouse_layouts (schema_version);
