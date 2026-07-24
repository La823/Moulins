ALTER TABLE doctors ADD COLUMN IF NOT EXISTS dob DATE;

-- Tracks which (doctor, calendar day) birthday countdown reminders have
-- already been sent, so the once-daily scheduler check stays idempotent
-- even if it runs more than once on the same day.
CREATE TABLE IF NOT EXISTS doctor_birthday_reminders (
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    reminder_date DATE NOT NULL,
    PRIMARY KEY (doctor_id, reminder_date)
);
