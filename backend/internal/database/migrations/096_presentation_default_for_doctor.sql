ALTER TABLE partner_presentations ADD COLUMN IF NOT EXISTS is_default_for_doctor BOOLEAN NOT NULL DEFAULT FALSE;

-- At most one default-generated deck per doctor — "Generate" re-populates
-- the existing one instead of spawning duplicates on repeat clicks.
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_presentations_default_per_doctor
    ON partner_presentations(doctor_id) WHERE is_default_for_doctor = TRUE;
