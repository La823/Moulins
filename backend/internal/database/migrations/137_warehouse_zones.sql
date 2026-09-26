-- Four physical warehouse zones from the WMS SKU Architecture spec. These
-- are the [ZONE] segment of [ZONE]-[SEQUENCE]-[FORM]/[REGULATORY]/[DIET],
-- and they drive pick routing and binning.
--
-- A table rather than a CHECK constraint: zones are physical warehouse
-- layout, which changes when the warehouse does, and forms reference them by
-- id so renaming a zone never orphans anything.
CREATE TABLE IF NOT EXISTS warehouse_zones (
    id          SERIAL PRIMARY KEY,
    code        TEXT UNIQUE NOT NULL,   -- OS / LQ / IN / TP — the SKU prefix
    name        TEXT NOT NULL,
    description TEXT,                   -- handling/storage rationale
    scope       TEXT,                   -- which forms belong here, per the spec
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO warehouse_zones (code, name, description, scope, sort_order) VALUES
    ('OS', 'Oral Solids',
     'Dry ambient storage, high-density bins. Minimal spill risk.',
     'Tablets, Capsules, Softgels, Granules, Bulk/Protein Powders, Sachets.', 1),
    ('LQ', 'Liquids & Drops',
     'Secondary containment, lower-tier shelving to protect dry stock from leaks.',
     'Syrups, Suspensions, Dry Syrups, Oral Drops, Eye/Ear Drops, Nano Shots.', 2),
    ('IN', 'Injections & Sterile',
     'High-value, breakable glass ampoules/vials. Secured access.',
     'Injections, Infusions, Respules (Aerosol/Nebulizer).', 3),
    ('TP', 'Topicals & External',
     'Non-ingestible quarantine to avoid cross-contamination with ingestibles.',
     'Creams, Ointments, Gels, Oils, Soaps, Washes, Roll-ons, Sprays, Oral Care.', 4)
ON CONFLICT (code) DO NOTHING;

-- ON DELETE SET NULL: removing a zone must never delete product forms (and
-- through them, unlink products). The forms simply become unassigned.
ALTER TABLE product_forms
    ADD COLUMN IF NOT EXISTS zone_id INTEGER
    REFERENCES warehouse_zones(id) ON DELETE SET NULL;

-- form_code is the 3-letter [FORM] token (TAB, CAP, SGC ...). Distinct from
-- the existing `prefix`, which drives today's inventory_code and is 1-4
-- chars; both are kept so the current codes keep working while the new
-- scheme is built out.
ALTER TABLE product_forms
    ADD COLUMN IF NOT EXISTS form_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_forms_form_code
    ON product_forms (form_code) WHERE form_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_forms_zone_id
    ON product_forms (zone_id);
