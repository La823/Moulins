-- Expands each single "manage everything" permission into separate
-- view/edit/delete permissions per panel. Existing employee grants are
-- remapped so nobody loses access they already had; then the old,
-- now-invalid keys are removed.

INSERT INTO employee_permissions (user_id, permission)
SELECT user_id, new_key FROM employee_permissions
CROSS JOIN LATERAL (VALUES
    ('products', 'products_view'), ('products', 'products_edit'), ('products', 'products_delete'),
    ('graphics_design', 'graphics_design_view'), ('graphics_design', 'graphics_design_edit'), ('graphics_design', 'graphics_design_delete'),
    ('orders', 'orders_view'),
    ('orders_edit', 'transports_edit'), ('orders_edit', 'transports_delete'),
    ('partners', 'partners_view'), ('partners', 'partners_edit'), ('partners', 'partners_delete'),
    ('partners', 'deletion_requests_view'), ('partners', 'deletion_requests_edit'),
    ('meetings', 'meetings_view'),
    ('requests', 'requests_view'), ('requests', 'requests_edit'),
    ('ledger', 'ledger_view'), ('ledger', 'ledger_edit'),
    ('payments', 'payments_view'), ('payments', 'payments_edit'),
    ('learning', 'learning_view'), ('learning', 'learning_edit'), ('learning', 'learning_delete'),
    ('notifications', 'notifications_view'), ('notifications', 'notifications_edit'),
    ('broadcast_lists', 'broadcast_lists_view'), ('broadcast_lists', 'broadcast_lists_edit'), ('broadcast_lists', 'broadcast_lists_delete'),
    ('marg_master', 'marg_master_view'), ('marg_master', 'marg_master_edit')
) AS mapping(old_key, new_key)
WHERE employee_permissions.permission = mapping.old_key
ON CONFLICT DO NOTHING;

DELETE FROM employee_permissions WHERE permission IN (
    'products', 'graphics_design', 'orders', 'meetings', 'requests', 'ledger',
    'payments', 'learning', 'notifications', 'broadcast_lists', 'marg_master'
);
