-- Lets a PO be "edited" without mutating a row that's already been acted on
-- (emailed to a manufacturer, marked received, etc.): instead of changing
-- fields in place, a revision inserts a NEW row with the same po_number and
-- a bumped revision_number. The superseded row is flagged non-latest and
-- its status set to 'Revised' so it drops out of the active list while
-- staying visible in the PO database as history (see the {id}/revisions
-- endpoint, which lists every row sharing a po_number).
ALTER TABLE purchase_order_master ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE purchase_order_master ADD COLUMN IF NOT EXISTS is_latest_revision BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE purchase_order_master ADD COLUMN IF NOT EXISTS revised_from_id INTEGER REFERENCES purchase_order_master(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_order_master_po_number_rev ON purchase_order_master(po_number, revision_number);
