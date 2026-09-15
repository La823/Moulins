-- Widen email_send_log.channel to also allow 'pdf', for tracking who
-- printed an order's PDF (reusing this generic send-log table rather than
-- a dedicated one).
ALTER TABLE email_send_log DROP CONSTRAINT IF EXISTS email_send_log_channel_check;
ALTER TABLE email_send_log ADD CONSTRAINT email_send_log_channel_check CHECK (channel IN ('email', 'whatsapp', 'pdf'));
