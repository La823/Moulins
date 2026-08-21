-- 085 remapped the old "partners" permission into partners_view/edit/delete
-- but missed deleting the original "partners" rows afterward.
DELETE FROM employee_permissions WHERE permission = 'partners';
