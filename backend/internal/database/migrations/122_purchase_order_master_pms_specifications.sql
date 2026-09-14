-- Migration 121 tried to add a "specifications" JSONB column for the new PMS
-- (Product Manufacturer Specification) blob, but purchase_order_master
-- already had an unrelated legacy "specifications" TEXT column (free-text
-- packaging notes like "30 GM", from migration 108) — the ADD COLUMN IF NOT
-- EXISTS silently no-op'd, so the PMS feature would have overwritten and
-- misread that legacy data. Use a distinct column name instead.
ALTER TABLE purchase_order_master ADD COLUMN IF NOT EXISTS pms_specifications JSONB;
