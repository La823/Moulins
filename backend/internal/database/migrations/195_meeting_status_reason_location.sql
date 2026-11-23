-- When a meeting is marked done or cancelled: why (required by the app for a
-- cancellation, optional remark when done) and where the person was. Who and
-- when were already kept (status_changed_by / status_changed_at). Nullable:
-- the website and older apps send only the status.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS status_latitude DOUBLE PRECISION;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS status_longitude DOUBLE PRECISION;
