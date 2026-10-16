-- Leave for office staff, on top of the eTimeOffice attendance mirror.
--
-- The eTimeOffice sync only ever writes etime_punches, etime_daily and
-- etime_employees.name, so nothing here can be overwritten by a re-sync.
-- Approved leave is merged into a day's status when it is read.

-- Which staff login (users.role = 'employee') is this scanner employee, so
-- they can apply for leave themselves; and their monthly leave allowance.
ALTER TABLE etime_employees
    ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS leaves_per_month NUMERIC(4,1) NOT NULL DEFAULT 0
        CHECK (leaves_per_month >= 0);

CREATE TABLE IF NOT EXISTS etime_leave_requests (
    id             SERIAL PRIMARY KEY,
    emp_code       TEXT NOT NULL REFERENCES etime_employees(emp_code),
    from_date      DATE NOT NULL,
    to_date        DATE NOT NULL,
    half_day       BOOLEAN NOT NULL DEFAULT FALSE,
    days           NUMERIC(5,1) NOT NULL,          -- Sundays not counted
    reason         TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    paid_days      NUMERIC(5,1),                   -- set on approval; the rest is unpaid
    applied_by     UUID REFERENCES users(id),      -- the employee, or the admin entering it for them
    decided_by     UUID REFERENCES users(id),
    decided_at     TIMESTAMPTZ,
    decision_note  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (to_date >= from_date),
    CHECK (NOT half_day OR from_date = to_date)
);
CREATE INDEX IF NOT EXISTS idx_etime_leave_requests_emp ON etime_leave_requests (emp_code, from_date);
CREATE INDEX IF NOT EXISTS idx_etime_leave_requests_status ON etime_leave_requests (status);

-- One row per approved leave day. The primary key is what stops two approved
-- leaves landing on the same day. Removed with the request when it is
-- cancelled (rows are deleted explicitly; the cascade covers hard deletes).
CREATE TABLE IF NOT EXISTS etime_leave_days (
    emp_code    TEXT NOT NULL REFERENCES etime_employees(emp_code),
    leave_date  DATE NOT NULL,
    request_id  INT NOT NULL REFERENCES etime_leave_requests(id) ON DELETE CASCADE,
    portion     NUMERIC(2,1) NOT NULL CHECK (portion IN (0.5, 1.0)),
    paid        BOOLEAN NOT NULL,
    PRIMARY KEY (emp_code, leave_date)
);

-- Leave accrues month by month from here (carried within the year, reset
-- each January). Starts when this system went live, not from January, so
-- nobody begins October with nine months of unused leave.
INSERT INTO admin_settings (key, value) VALUES ('etime_leave_accrual_start', '2026-10')
ON CONFLICT (key) DO NOTHING;
