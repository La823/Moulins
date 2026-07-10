-- Chat message pushes used to be written into the notifications/
-- notification_recipients inbox tables (same as broadcasts and order
-- alerts). That inbox is meant for broadcast/order-specific messages only —
-- chat has its own dedicated UI — so remove any chat notifications already
-- sitting in there.
DELETE FROM notification_recipients
WHERE notification_id IN (
    SELECT id FROM notifications WHERE deep_link LIKE '/chat/%'
);

DELETE FROM notifications WHERE deep_link LIKE '/chat/%';
