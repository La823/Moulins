INSERT INTO email_templates (key, label, description, trigger_mode, placeholders, subject, body_html) VALUES
('partner_welcome_credentials', 'Welcome — Login Details', 'Sent manually by staff, e.g. right after creating a partner account, with their login phone number and password.', 'manual',
 '{{.CustomerName}}, {{.Phone}}, {{.Password}}',
 'Your Moulins Pharma account is ready',
 '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
			<h2 style="margin-bottom:4px">Welcome to Moulins Pharma</h2>
			<p style="color:#555">Hi {{.CustomerName}},</p>
			<p style="color:#555">Your account has been created. Here are your login details:</p>
			<table style="width:100%;border-collapse:collapse;margin:16px 0">
				<tr>
					<td style="padding:6px 0;color:#999;font-size:12px;text-transform:uppercase">Login (Phone)</td>
					<td style="padding:6px 0;color:#1a1a1a;font-weight:bold;text-align:right">{{.Phone}}</td>
				</tr>
				<tr>
					<td style="padding:6px 0;color:#999;font-size:12px;text-transform:uppercase">Password</td>
					<td style="padding:6px 0;color:#1a1a1a;font-weight:bold;text-align:right">{{.Password}}</td>
				</tr>
			</table>
			<p style="color:#555;font-size:13px">We recommend changing your password after your first login.</p>
			<p style="margin-top:32px;font-size:12px;color:#999">Moulins Pharma</p>
		</div>')
ON CONFLICT (key) DO NOTHING;
