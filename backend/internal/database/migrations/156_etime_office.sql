-- Biometric attendance pulled from eTimeOffice (the cloud account the
-- fingerprint scanners report to). Kept entirely separate from the manual
-- `attendance` table: punches are stored as eTimeOffice reports them and the
-- dashboard derives first-in / last-out / late from them on read.
--
-- NOTE: this first draft was applied to the shared database on 15 Oct 2026
-- before the real API responses were seen. 157 replaces these tables (they
-- were still empty); this file is kept exactly as applied.

-- One row per scan. punch_time is the scanner's local (IST) wall-clock time,
-- stored without a zone so it groups by calendar day as-is. The unique key
-- makes re-pulling an overlapping window harmless.
CREATE TABLE IF NOT EXISTS etime_punches (
    id          BIGSERIAL PRIMARY KEY,
    emp_code    TEXT NOT NULL,
    punch_time  TIMESTAMP NOT NULL,
    m_flag      TEXT,
    mcid        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (emp_code, punch_time)
);
CREATE INDEX IF NOT EXISTS idx_etime_punches_time ON etime_punches (punch_time);

-- Everyone eTimeOffice has ever reported a punch for. `active` lets the
-- dashboard stop counting someone who has left as absent every day.
CREATE TABLE IF NOT EXISTS etime_employees (
    emp_code    TEXT PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT '',
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    first_seen  TIMESTAMP,
    last_seen   TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every "Sync now" press, so the dashboard can show when data was last
-- pulled and why a pull failed.
CREATE TABLE IF NOT EXISTS etime_sync_runs (
    id                SERIAL PRIMARY KEY,
    started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at       TIMESTAMPTZ,
    status            TEXT NOT NULL DEFAULT 'running',
    range_from        TIMESTAMP NOT NULL,
    range_to          TIMESTAMP NOT NULL,
    punches_received  INT NOT NULL DEFAULT 0,
    punches_new       INT NOT NULL DEFAULT 0,
    error             TEXT,
    triggered_by      UUID
);
