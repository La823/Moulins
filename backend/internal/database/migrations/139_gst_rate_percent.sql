-- gst_rate held a mix of fractions (0.05) and percents (5.0) for the same
-- 5% rate — 366 rows one way, 149 the other.
--
-- The cause is the column type: NUMERIC(5,4) caps at 9.9999, so it was built
-- for fractions and physically cannot store 18.0. Any product at 12% or 18%
-- was forced into the fraction form, while newer writes used percent and fit
-- only because 5.0 happens to be under the cap.
--
-- Standardising on percent (5.0 = 5%), which is how the value is entered and
-- displayed. Nothing computes with this column today — it is selected and
-- passed through only — so widening and rescaling is safe.
ALTER TABLE products
    ALTER COLUMN gst_rate TYPE NUMERIC(6,2);

-- Only values below 1 are fractions. Guarded so a re-run cannot
-- double-convert a row that is already a percent.
UPDATE products
SET gst_rate = ROUND(gst_rate * 100, 2)
WHERE gst_rate IS NOT NULL AND gst_rate < 1;
