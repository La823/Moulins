-- Migration 127 added order_items.marg_pushed_at so a partial push failure
-- can resume without resending already-sent lines. But orders pushed
-- *before* 127 only ever had the order-level orders.marg_pushed_at set —
-- their items still show marg_pushed_at IS NULL, which the new resume
-- logic reads as "never sent" and pushes again for real. Backfill: any
-- order that already has a marg_order_no (i.e. was fully pushed under the
-- old code) gets all of its items marked pushed at that same timestamp.
UPDATE order_items oi
SET marg_pushed_at = o.marg_pushed_at
FROM orders o
WHERE oi.order_id = o.id
  AND o.marg_order_no IS NOT NULL
  AND oi.marg_pushed_at IS NULL;
