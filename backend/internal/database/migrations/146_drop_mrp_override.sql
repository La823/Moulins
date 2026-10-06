-- Reverses the mrp_override / mrp_batch_code columns from 145.
--
-- That design resolved a product's MRP at read time through an override, a
-- pinned batch and a FEFO fallback. It was more machinery than the problem
-- needs: products.mrp is already the one place an MRP lives, and the real gap
-- was only that filling it in meant reading batch figures off another screen.
--
-- What replaces it is a dropdown of the product's batches — code, expiry and
-- MRP — that writes the chosen MRP straight into products.mrp, with the field
-- still editable by hand and the FEFO batch offered as the default. One
-- stored value, no resolution order, and no second place for a price to live.
--
-- Neither column was ever written to outside of testing, so nothing is lost.
ALTER TABLE products DROP COLUMN IF EXISTS mrp_override;
ALTER TABLE products DROP COLUMN IF EXISTS mrp_batch_code;

-- idx_batches_fefo from 145 is kept: the batch dropdown reads batches by
-- product ordered by expiry, which is exactly what it covers.
