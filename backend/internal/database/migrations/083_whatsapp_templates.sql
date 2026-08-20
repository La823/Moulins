ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp'));

INSERT INTO email_templates (key, label, description, trigger_mode, channel, placeholders, subject, body_html) VALUES
('order_received_whatsapp', 'Order Received (WhatsApp)', 'Sent manually by staff from the order page — drafts a WhatsApp message with the order details, opened via a wa.me link to the customer''s number.', 'manual', 'whatsapp',
 '{{.CustomerName}}, {{.OrderCode}}, {{.Items}} (ProductName, Quantity), {{.ItemCount}}, {{.TransportMode}}, {{.ShippingAddress}}',
 '',
 'Hi {{.CustomerName}}, we''ve received your order {{.OrderCode}}.

Items:
{{range .Items}}- {{.ProductName}} x{{.Quantity}}
{{end}}
{{if .TransportMode}}Transport: {{.TransportMode}}
{{end}}{{if .ShippingAddress}}Shipping to: {{.ShippingAddress}}
{{end}}
We''ll keep you posted as it moves through confirmation, shipping, and delivery.

- Moulins Pharma')
ON CONFLICT (key) DO NOTHING;
