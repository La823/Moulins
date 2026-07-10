CREATE TABLE IF NOT EXISTS client_employee_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_client ON client_employee_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_assignments_employee ON client_employee_assignments(employee_id);
