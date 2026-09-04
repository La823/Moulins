ALTER TABLE partner_presentations ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_partner_presentations_doctor ON partner_presentations(doctor_id);
