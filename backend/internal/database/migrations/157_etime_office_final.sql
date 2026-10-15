-- Biometric attendance pulled from eTimeOffice (the cloud account the
-- fingerprint scanner reports to). Kept entirely separate from the manual
-- `attendance` table, which the mobile app reads.
--
-- Two feeds are mirrored as eTimeOffice reports them:
--   etime_punches — every scan (DownloadPunchData), for the raw log
--   etime_daily   — one row per employee per day (DownloadInOutPunchData),
--                   with eTimeOffice's own status / late / hours, which it
--                   works out from each employee's shift there.
--
-- 156 created a first draft of three of these tables before the real API
-- was seen. They were never written to; drop them while they still have the
-- draft shape (and only then, so this never touches real data).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'etime_punches' AND column_name = 'm_flag')
       AND NOT EXISTS (SELECT 1 FROM etime_punches)
       AND NOT EXISTS (SELECT 1 FROM etime_employees)
       AND NOT EXISTS (SELECT 1 FROM etime_sync_runs) THEN
        DROP TABLE etime_punches, etime_employees, etime_sync_runs;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS etime_employees (
    emp_code    TEXT PRIMARY KEY,           -- eTimeOffice code, e.g. "0003"
    name        TEXT NOT NULL DEFAULT '',
    -- Unticked for people who have left, so the dashboard stops listing them.
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- punch_time is the scanner's IST wall-clock time, stored without a zone so
-- it groups by calendar day as-is. The unique key makes re-pulling an
-- overlapping window harmless.
CREATE TABLE IF NOT EXISTS etime_punches (
    id          BIGSERIAL PRIMARY KEY,
    emp_code    TEXT NOT NULL,
    punch_time  TIMESTAMP NOT NULL,
    manual      BOOLEAN NOT NULL DEFAULT FALSE,   -- M_Flag = "M": added by hand in eTimeOffice
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (emp_code, punch_time)
);
CREATE INDEX IF NOT EXISTS idx_etime_punches_time ON etime_punches (punch_time);

-- Overwritten on every sync of its date: eTimeOffice revises a day after the
-- fact (the out punch arrives, someone adds a manual punch or a holiday).
CREATE TABLE IF NOT EXISTS etime_daily (
    emp_code           TEXT NOT NULL,
    work_date          DATE NOT NULL,
    status             TEXT NOT NULL,     -- P, A, P/2, WO (weekly off), HL (holiday), ...
    in_time            TEXT,              -- "HH:MM", NULL when not punched
    out_time           TEXT,
    work_minutes       INT NOT NULL DEFAULT 0,
    overtime_minutes   INT NOT NULL DEFAULT 0,
    break_minutes      INT NOT NULL DEFAULT 0,
    late_minutes       INT NOT NULL DEFAULT 0,
    early_out_minutes  INT NOT NULL DEFAULT 0,
    remark             TEXT,              -- LT, EO, EI, OT, MIS, M — joined with "-"
    synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (emp_code, work_date)
);
CREATE INDEX IF NOT EXISTS idx_etime_daily_date ON etime_daily (work_date);

-- Every "Sync now" press: when data was last pulled, and why a pull failed.
CREATE TABLE IF NOT EXISTS etime_sync_runs (
    id                SERIAL PRIMARY KEY,
    started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at       TIMESTAMPTZ,
    status            TEXT NOT NULL DEFAULT 'running',
    date_from         DATE NOT NULL,
    date_to           DATE NOT NULL,
    days_received     INT NOT NULL DEFAULT 0,
    punches_received  INT NOT NULL DEFAULT 0,
    punches_new       INT NOT NULL DEFAULT 0,
    error             TEXT,
    triggered_by      UUID
);
