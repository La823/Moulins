-- Team members who existed before team settings (migration 184) keep being
-- able to order from Moulins: the app they have installed only knows that
-- way of ordering. They also get ordering to their partner, so on the new app
-- they choose. Partners switch Moulins off per member once everyone has
-- updated. Members added from now on get the normal defaults (orders to the
-- partner only). Decided 13 Nov 2026.

INSERT INTO team_member_settings (member_id, can_add_doctors, can_add_retailers, order_to_partner, order_to_moulins)
SELECT id, TRUE, FALSE, TRUE, TRUE
FROM users
WHERE role = 'team_member' AND deleted_at IS NULL
ON CONFLICT (member_id) DO NOTHING;
