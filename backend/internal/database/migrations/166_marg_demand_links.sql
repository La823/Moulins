-- Working through the Demand & reorder list (Marg Analysis): a flagged
-- product can be linked to the purchase orders raised for it, snoozed for a
-- while, and given remarks. Products are Marg product PIDs (the demand
-- list's key), not products.id — not every Marg product is in the catalog.

-- POs linked to a product, by PO number: the demand list reads the PO's
-- quantity, status and received quantity from purchase_order_master's
-- latest revision of that number, so a PO marked received or revised there
-- shows here with no second entry. Unlinking sets removed_at; rows stay as
-- history.
CREATE TABLE IF NOT EXISTS marg_demand_po_links (
    id           BIGSERIAL PRIMARY KEY,
    product_pid  BIGINT NOT NULL,
    po_number    TEXT NOT NULL,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    removed_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_marg_demand_po_links_active
    ON marg_demand_po_links (product_pid, po_number) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_marg_demand_po_links_po ON marg_demand_po_links (po_number);

-- Everything said or decided about a product, newest last: remarks, and
-- snoozes (hidden from "To review" until snooze_until; the latest snooze or
-- unsnooze decides). Remarks are soft-deleted by their author.
CREATE TABLE IF NOT EXISTS marg_demand_log (
    id            BIGSERIAL PRIMARY KEY,
    product_pid   BIGINT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('remark', 'snooze', 'unsnooze')),
    body          TEXT,
    snooze_until  DATE,
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    CHECK (kind <> 'snooze' OR snooze_until IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_marg_demand_log_product ON marg_demand_log (product_pid, created_at);
