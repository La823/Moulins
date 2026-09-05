-- Archives the previous partner_documents row every time a GST/license
-- document is replaced (re-upload, expiry renewal), instead of the old
-- photo/number simply being overwritten and lost.
CREATE TABLE IF NOT EXISTS partner_document_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,
    doc_number TEXT,
    expiry_date DATE,
    photo_url TEXT,
    is_verified BOOLEAN,
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    original_created_at TIMESTAMPTZ,
    original_updated_at TIMESTAMPTZ,
    replaced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_document_history_user ON partner_document_history(user_id, doc_type);
