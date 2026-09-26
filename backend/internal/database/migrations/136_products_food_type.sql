-- Veg / Non-Veg marking, required on food products (the FSSAI green/brown
-- dot). Hardcoded as a CHECK rather than a lookup table like
-- product_licence_types: the two values are fixed by regulation, so there
-- is nothing for an admin to extend or rename.
--
-- Nullable, because it only applies to products whose licence type is Food.
-- Deliberately NOT constrained against licence_type_id: a cross-column
-- constraint would fail confusingly the moment a product is reclassified
-- from Food to something else. The UI shows this field only for Food
-- products and clears it when the type changes away, which achieves the
-- same thing without making a reclassification error out.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS food_type TEXT;

ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_food_type_check;

ALTER TABLE products
    ADD CONSTRAINT products_food_type_check
    CHECK (food_type IS NULL OR food_type IN ('Veg', 'Non-Veg'));
