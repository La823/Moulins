-- A push-to-marg call that fails partway through (e.g. a sequence/OrderNo
-- collision on line 19 of 42) previously left no record of which lines had
-- already gone through — order_items.selected_batch_code existed, but
-- nothing tracked "was this specific line actually sent to Marg". Any
-- retry (manual or otherwise) therefore resent every line from scratch,
-- duplicating whatever had already succeeded. Track push status per item
-- so a retry only ever sends what's still missing.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS marg_pushed_at TIMESTAMPTZ;

-- Marg's InsertOrderDetail groups lines into one order via an internal
-- OrderID it assigns on the first line and expects echoed back on every
-- subsequent line. Only the human-facing marg_order_no (OrderNo) was ever
-- persisted — the internal OrderID was kept in a local variable and
-- discarded after the request, so a later resume had no way to append to
-- the same Marg-side order and always started an entirely new one.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS marg_insert_order_id TEXT;
