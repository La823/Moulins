-- Staff groups: an employee login can belong to a group with its own list in
-- the panel. 'dispatch' is the dispatch team (decided 14 Nov 2026): accounts
-- that, for now, can only view products, use the same attendance system as
-- employees (they stay role = 'employee', so scanner linking, My Attendance
-- and leave work unchanged) and get no automatic staff alerts.
-- NULL = an ordinary employee.

ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_group TEXT
    CHECK (staff_group IN ('dispatch'));
