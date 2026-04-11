-- Add role column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'customer';

-- Create index for role-based lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
