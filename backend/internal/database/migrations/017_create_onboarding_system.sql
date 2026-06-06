-- Create customer_documents table for storing onboarding documents
CREATE TABLE IF NOT EXISTS customer_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doc_type VARCHAR(50) NOT NULL, -- LICENSE, GST
    doc_number VARCHAR(100), -- License number or GST number
    expiry_date DATE, -- For license expiry
    photo_url TEXT, -- URL to stored photo
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL, -- Admin who verified
    verified_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT, -- If rejected by admin
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, doc_type)
);

-- Add onboarding step column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1; -- 1=Account Created, 2=License Pending, 3=GST Pending, 4=Verified

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_customer_documents_user_id ON customer_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_verified ON customer_documents(is_verified);
CREATE INDEX IF NOT EXISTS idx_users_onboarding_step ON users(onboarding_step);

-- Attach trigger to customer_documents table
DROP TRIGGER IF EXISTS update_customer_documents_updated_at ON customer_documents;
CREATE TRIGGER update_customer_documents_updated_at BEFORE UPDATE ON customer_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
