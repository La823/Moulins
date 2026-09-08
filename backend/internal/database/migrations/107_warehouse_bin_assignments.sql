-- Links a product to a physical storage location in a warehouse layout —
-- either a rack bin (row-bay-level) or a pallet. Kept separate from
-- warehouse_layouts (which only stores layout geometry as JSONB) so this is
-- real relational data with a proper FK to products: queryable ("where is
-- SKU X stored?"), and safe to evolve independently of layout edits.
--
-- `slot` splits a single bin into two independently-assignable halves
-- ('L'/'R'), so up to two products can share one bin. Pallets only ever use
-- one slot ('A') since a pallet is a single unit.
--
-- No quantity tracking yet (deliberately out of scope for now) — the column
-- is added already so it can be turned on later without a schema change.
CREATE TABLE IF NOT EXISTS warehouse_bin_assignments (
    id            SERIAL PRIMARY KEY,
    layout_name   TEXT        NOT NULL,
    location_type TEXT        NOT NULL CHECK (location_type IN ('bin', 'pallet')),
    location_key  TEXT        NOT NULL,
    slot          TEXT        NOT NULL DEFAULT 'A' CHECK (slot IN ('L', 'R', 'A')),
    product_id    UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity      INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (layout_name, location_type, location_key, slot)
);
CREATE INDEX IF NOT EXISTS idx_warehouse_bin_assignments_layout ON warehouse_bin_assignments (layout_name);
CREATE INDEX IF NOT EXISTS idx_warehouse_bin_assignments_product ON warehouse_bin_assignments (product_id);
