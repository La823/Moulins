UPDATE email_templates SET
    placeholders = '{{.CustomerName}}, {{.OrderCode}}, {{.Items}} (ProductName, Quantity), {{.ItemCount}}, {{.TransportMode}}, {{.ShippingAddress}}',
    body_html = '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
			<h2 style="margin-bottom:4px">Order {{.OrderCode}}</h2>
			<p style="color:#555">Hi {{.CustomerName}},</p>
			<p style="color:#555">We''ve received your order and it''s being reviewed. We''ll email you as it moves through confirmation, shipping, and delivery.</p>
			<table style="width:100%;border-collapse:collapse;margin:16px 0">
				<thead>
					<tr>
						<th style="text-align:left;font-size:11px;text-transform:uppercase;color:#999;border-bottom:1px solid #eee;padding:6px 0">Product</th>
						<th style="text-align:right;font-size:11px;text-transform:uppercase;color:#999;border-bottom:1px solid #eee;padding:6px 0">Qty</th>
					</tr>
				</thead>
				<tbody>
					{{range .Items}}
					<tr>
						<td style="padding:6px 0;border-bottom:1px solid #f3f3f3;color:#333">{{.ProductName}}</td>
						<td style="padding:6px 0;border-bottom:1px solid #f3f3f3;color:#333;text-align:right">{{.Quantity}}</td>
					</tr>
					{{end}}
				</tbody>
			</table>
			{{if .TransportMode}}<p style="color:#555;font-size:13px">Transport: {{.TransportMode}}</p>{{end}}
			{{if .ShippingAddress}}<p style="color:#555;font-size:13px">Shipping to: {{.ShippingAddress}}</p>{{end}}
			<p style="margin-top:32px;font-size:12px;color:#999">Moulins Pharma</p>
		</div>'
WHERE key = 'order_placed';

UPDATE email_templates SET
    placeholders = '{{.CustomerName}}, {{.OrderCode}}, {{.StatusLabel}}, {{.Items}} (ProductName, Quantity), {{.ItemCount}}, {{.TransportMode}}, {{.ShippingAddress}}',
    body_html = '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
			<h2 style="margin-bottom:4px">Order {{.OrderCode}}</h2>
			<p style="color:#555">Hi {{.CustomerName}},</p>
			<p style="color:#555">Your order status has been updated to <strong>{{.StatusLabel}}</strong>.</p>
			<table style="width:100%;border-collapse:collapse;margin:16px 0">
				<thead>
					<tr>
						<th style="text-align:left;font-size:11px;text-transform:uppercase;color:#999;border-bottom:1px solid #eee;padding:6px 0">Product</th>
						<th style="text-align:right;font-size:11px;text-transform:uppercase;color:#999;border-bottom:1px solid #eee;padding:6px 0">Qty</th>
					</tr>
				</thead>
				<tbody>
					{{range .Items}}
					<tr>
						<td style="padding:6px 0;border-bottom:1px solid #f3f3f3;color:#333">{{.ProductName}}</td>
						<td style="padding:6px 0;border-bottom:1px solid #f3f3f3;color:#333;text-align:right">{{.Quantity}}</td>
					</tr>
					{{end}}
				</tbody>
			</table>
			{{if .TransportMode}}<p style="color:#555;font-size:13px">Transport: {{.TransportMode}}</p>{{end}}
			{{if .ShippingAddress}}<p style="color:#555;font-size:13px">Shipping to: {{.ShippingAddress}}</p>{{end}}
			<p style="margin-top:32px;font-size:12px;color:#999">Moulins Pharma</p>
		</div>'
WHERE key = 'order_status_changed';
