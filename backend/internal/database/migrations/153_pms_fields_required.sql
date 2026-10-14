-- Each specification field can be marked mandatory. Saving a product's (or a
-- PO's) specifications with a mandatory field left empty is refused.
-- Existing fields start optional, so nothing already saved becomes invalid.
ALTER TABLE pms_fields ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT FALSE;
