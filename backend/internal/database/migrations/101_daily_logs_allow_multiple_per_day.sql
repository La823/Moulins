-- Daily logs were previously one-per-(team_member, day) via a UNIQUE
-- constraint + upsert-on-submit, which silently overwrote earlier same-day
-- entries. Team members can now submit multiple entries per day (e.g. a
-- morning and an afternoon check-in), same append-only shape as
-- meeting_visit_logs.
ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_team_member_id_date_key;

CREATE INDEX IF NOT EXISTS idx_daily_logs_member_date ON daily_logs(team_member_id, date);
