CREATE TABLE IF NOT EXISTS purchase_order_emails (
    id              BIGSERIAL PRIMARY KEY,
    po_id           INTEGER NOT NULL REFERENCES purchase_order_master(id) ON DELETE CASCADE,
    po_number       TEXT,
    message_id      TEXT,
    conversation_id TEXT,
    to_addresses    TEXT[] NOT NULL DEFAULT '{}',
    subject         TEXT,
    body            TEXT,
    sent_by         UUID,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_emails_po_id ON purchase_order_emails(po_id);
