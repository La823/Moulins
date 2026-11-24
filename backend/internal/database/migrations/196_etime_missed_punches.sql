-- Missed punches (24 Nov 2026): a staff member (employee or dispatch) logs a
-- check-in or check-out they forgot to punch on the scanner, with the date
-- and time; whoever approves leave (leaves_edit) approves or rejects it.
-- A log only: it is not written into etime_punches / etime_daily, so the
-- scanner sync can never overwrite or be confused by it.
CREATE TABLE IF NOT EXISTS etime_missed_punches (
    id           SERIAL PRIMARY KEY,
    emp_code     TEXT NOT NULL REFERENCES etime_employees(emp_code),
    punch_date   DATE NOT NULL,
    punch_type   TEXT NOT NULL CHECK (punch_type IN ('in', 'out')),   -- check-in or check-out
    punch_time   TIME NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    applied_by   UUID REFERENCES users(id),
    decided_by   UUID REFERENCES users(id),
    decided_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_etime_missed_punches_emp ON etime_missed_punches (emp_code, punch_date DESC);
CREATE INDEX IF NOT EXISTS idx_etime_missed_punches_status ON etime_missed_punches (status);
-- one live log per person, day and kind (a cancelled or rejected one can be logged again)
CREATE UNIQUE INDEX IF NOT EXISTS uq_etime_missed_punches_live
    ON etime_missed_punches (emp_code, punch_date, punch_type) WHERE status IN ('pending', 'approved');
