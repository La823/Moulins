-- Tracks every Marg master-data sync run so a long-running sync (a full
-- pull takes many minutes) can be started in the background and watched
-- from the admin panel, instead of blocking an HTTP request that would
-- time out long before the work finishes.
CREATE TABLE IF NOT EXISTS margmaster_sync_runs (
    id              SERIAL PRIMARY KEY,
    status          TEXT        NOT NULL DEFAULT 'running',  -- running | completed | failed
    trigger_source  TEXT        NOT NULL DEFAULT 'manual',   -- manual | scheduled
    window_label    TEXT,                                    -- '1 month', 'full', ...
    datetime_from   TEXT,                                    -- the Datetime param actually sent to Marg
    phase           TEXT,                                    -- fetching | validating | products | parties | done
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,

    -- what Marg sent back
    rows_received   INTEGER     NOT NULL DEFAULT 0,          -- deduped pro_N + pro_U batch rows
    marg_datetime   TEXT,                                    -- Marg's echoed DateTime
    marg_datastatus TEXT,

    -- progress / outcome
    products_total  INTEGER     NOT NULL DEFAULT 0,
    products_done   INTEGER     NOT NULL DEFAULT 0,
    products_new    INTEGER     NOT NULL DEFAULT 0,          -- base codes not previously in the mirror
    batches_done    INTEGER     NOT NULL DEFAULT 0,
    parties_total   INTEGER     NOT NULL DEFAULT 0,
    parties_done    INTEGER     NOT NULL DEFAULT 0,

    cursor_advanced BOOLEAN     NOT NULL DEFAULT FALSE,
    warning         TEXT,
    error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_margmaster_sync_runs_started
    ON margmaster_sync_runs (started_at DESC);

-- At most one sync may be in flight at a time: a second concurrent run
-- would double-apply the same rows and fight over the cursor. Enforced in
-- the database rather than only in Go, so the scheduler and a manual
-- trigger can't race each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_margmaster_sync_runs_single_active
    ON margmaster_sync_runs ((status)) WHERE status = 'running';
