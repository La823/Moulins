-- Persistent bin-type library for the warehouse layout editor. Separate from
-- warehouse_layouts (which stores each layout's own binTypes as part of its
-- JSONB blob) — this table holds bin types that should be available in every
-- layout, including brand-new ones, instead of living inside one layout only.
CREATE TABLE IF NOT EXISTS warehouse_bin_types (
    name       TEXT        PRIMARY KEY,
    width_m    NUMERIC     NOT NULL,
    depth_m    NUMERIC     NOT NULL,
    height_m   NUMERIC     NOT NULL,
    color      TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
