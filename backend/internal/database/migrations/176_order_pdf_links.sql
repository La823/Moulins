-- Links that let a customer open their order's PDF (the customer copy: no
-- warehouse codes, no staff remarks) without logging in — sent in the
-- WhatsApp message, which can only carry text. The token is long and random,
-- and a link stops working once it expires.

CREATE TABLE IF NOT EXISTS order_pdf_links (
    token           TEXT PRIMARY KEY,
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    opened_count    INT NOT NULL DEFAULT 0,
    last_opened_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS order_pdf_links_order_idx ON order_pdf_links (order_id, expires_at DESC);

-- The order WhatsApp message can place the link with {{.PDFLink}}; without
-- it, the link is added at the end. The stored text is not changed here: the
-- database is shared, and a server still on the older code would fail to
-- render a template naming a field it doesn't have.
UPDATE email_templates
SET placeholders = placeholders || ', {{.PDFLink}}'
WHERE key = 'order_received_whatsapp' AND placeholders NOT LIKE '%PDFLink%';
