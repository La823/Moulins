-- Batch selection for pushing an order line to Marg is now made inline on
-- the order itself (a dropdown per item) rather than in the "Send to Marg"
-- modal, which becomes a read-only preview of what will be sent. This
-- column persists that staff-only selection between visits.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_batch_code TEXT;
