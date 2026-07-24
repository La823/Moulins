-- Internal-only field for staff data cleanup — never exposed on any
-- partner-facing doctor endpoint (see doctorColumns in doctorModel.go,
-- which deliberately excludes it).
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS internal_contact_name TEXT;
