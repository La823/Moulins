ALTER TABLE doctors ADD COLUMN IF NOT EXISTS anniversary DATE;

-- Tracks which (doctor, calendar day) anniversary countdown reminders have
-- already been sent, mirroring doctor_birthday_reminders.
CREATE TABLE IF NOT EXISTS doctor_anniversary_reminders (
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    reminder_date DATE NOT NULL,
    PRIMARY KEY (doctor_id, reminder_date)
);
