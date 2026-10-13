-- Who did what to a meeting. A meeting only knew whose account it belongs to
-- (user_id, always the partner) and who it is assigned to, so "the partner
-- gave it to Ravi" and "Ravi booked it himself" looked the same, and nobody
-- was recorded for an edit, a completion or a cancellation.
--
-- Left NULL on meetings made before this: who made them was never stored.
-- Birthday / anniversary entries made by the system stay NULL too.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- Removing a team member marks them deleted instead of deleting the row.
-- A hard delete cascaded away their attendance and daily logs, blanked the
-- assignee on their meetings, and failed outright once they had logged a
-- doctor visit (meeting_visit_logs.user_id has no ON DELETE rule).
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
