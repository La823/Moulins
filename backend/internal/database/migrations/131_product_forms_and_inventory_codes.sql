-- Normalizes product_form (previously free text on products, prone to
-- casing/duplicate drift) into its own lookup table, and adds a warehouse
-- "inventory code" per product (PREFIX-N, e.g. "T-14" for the 14th tablet
-- product) generated from it. products.product_form (text) is left in
-- place and untouched — every existing query/handler that reads or writes
-- it keeps working exactly as before; product_form_id/inventory_code are
-- purely additive.
--
-- Renaming a form now only touches product_forms.name (matched by id via
-- product_form_id), so the prefix and every product's inventory_code stay
-- stable across a rename — that durability was the whole point of this
-- table existing instead of a name-keyed lookup.
CREATE TABLE IF NOT EXISTS product_forms (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    prefix TEXT UNIQUE NOT NULL,
    next_sequence INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_form_id INTEGER REFERENCES product_forms(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS inventory_code TEXT UNIQUE;

-- Backfill: create one product_forms row per distinct (trimmed) product_form
-- value already in use, choosing the shortest not-yet-taken uppercase-letter
-- prefix of that name (e.g. "Tablet" -> "T", then "Tooth Gel" -> "T" is
-- taken so "TO"). Processed alphabetically so the result is deterministic.
DO $$
DECLARE
    r RECORD;
    letters TEXT;
    candidate TEXT;
    len INT;
    suffix INT;
    taken BOOLEAN;
BEGIN
    FOR r IN
        SELECT DISTINCT TRIM(product_form) AS name
        FROM products
        WHERE product_form IS NOT NULL AND TRIM(product_form) != ''
        ORDER BY 1
    LOOP
        letters := UPPER(REGEXP_REPLACE(r.name, '[^A-Za-z]', '', 'g'));
        IF letters = '' THEN
            letters := 'X';
        END IF;

        candidate := NULL;
        len := 1;
        WHILE len <= LENGTH(letters) LOOP
            SELECT EXISTS(SELECT 1 FROM product_forms WHERE prefix = LEFT(letters, len)) INTO taken;
            IF NOT taken THEN
                candidate := LEFT(letters, len);
                EXIT;
            END IF;
            len := len + 1;
        END LOOP;

        IF candidate IS NULL THEN
            -- The whole name collided at every length (very unlikely) —
            -- fall back to appending a digit until it's unique.
            suffix := 2;
            LOOP
                SELECT EXISTS(SELECT 1 FROM product_forms WHERE prefix = letters || suffix::TEXT) INTO taken;
                IF NOT taken THEN
                    candidate := letters || suffix::TEXT;
                    EXIT;
                END IF;
                suffix := suffix + 1;
            END LOOP;
        END IF;

        INSERT INTO product_forms (name, prefix) VALUES (r.name, candidate)
        ON CONFLICT (name) DO NOTHING;
    END LOOP;
END $$;

-- Link every product to its product_forms row.
UPDATE products p
SET product_form_id = pf.id
FROM product_forms pf
WHERE pf.name = TRIM(p.product_form)
  AND p.product_form_id IS NULL;

-- Assign inventory codes to existing products, ordered by product_id (the
-- human-facing catalog number) within each form for a stable, predictable
-- sequence.
WITH ranked AS (
    SELECT p.id AS product_id,
           p.product_form_id AS form_id,
           ROW_NUMBER() OVER (PARTITION BY p.product_form_id ORDER BY p.product_id, p.id) AS rn
    FROM products p
    WHERE p.product_form_id IS NOT NULL AND p.inventory_code IS NULL
)
UPDATE products p
SET inventory_code = pf.prefix || '-' || ranked.rn
FROM ranked
JOIN product_forms pf ON pf.id = ranked.form_id
WHERE p.id = ranked.product_id;

-- Point each form's counter at the next unused sequence number.
UPDATE product_forms pf
SET next_sequence = sub.max_rn + 1
FROM (
    SELECT product_form_id, COUNT(*) AS max_rn
    FROM products
    WHERE product_form_id IS NOT NULL
    GROUP BY product_form_id
) sub
WHERE sub.product_form_id = pf.id;
