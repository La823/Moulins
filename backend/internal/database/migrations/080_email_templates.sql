CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    trigger_mode TEXT NOT NULL DEFAULT 'automated' CHECK (trigger_mode IN ('automated', 'manual')),
    placeholders TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO email_templates (key, label, description, trigger_mode, placeholders, subject, body_html) VALUES
('order_placed', 'Order Received', 'Sent automatically the moment a customer places an order.', 'automated',
 '{{.CustomerName}}, {{.OrderCode}}',
 'Order {{.OrderCode}} received',
 '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
			<h2 style="margin-bottom:4px">Order {{.OrderCode}}</h2>
			<p style="color:#555">Hi {{.CustomerName}},</p>
			<p style="color:#555">We''ve received your order and it''s being reviewed. We''ll email you as it moves through confirmation, shipping, and delivery.</p>
			<p style="margin-top:32px;font-size:12px;color:#999">Moulins Pharma</p>
		</div>'),
('order_status_changed', 'Order Status Update', 'Sent automatically whenever staff change an order''s status (confirmed, shipped, delivered, cancelled, refunded).', 'automated',
 '{{.CustomerName}}, {{.OrderCode}}, {{.StatusLabel}}',
 'Order {{.OrderCode}} — {{.StatusLabel}}',
 '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
			<h2 style="margin-bottom:4px">Order {{.OrderCode}}</h2>
			<p style="color:#555">Hi {{.CustomerName}},</p>
			<p style="color:#555">Your order status has been updated to <strong>{{.StatusLabel}}</strong>.</p>
			<p style="margin-top:32px;font-size:12px;color:#999">Moulins Pharma</p>
		</div>')
ON CONFLICT (key) DO NOTHING;
