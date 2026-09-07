-- Lets a partner add any number of drug licenses (not just a fixed 20B/21B
-- pair), each with its own user-chosen label (e.g. "Form 20B", "Wholesale
-- License", "Retail License"). Old doc_type values (LICENSE, LICENSE_20B,
-- LICENSE_21B, GST) keep their existing one-row-per-user upsert behavior
-- (needed for backward compatibility with app installs that predate this
-- change) via a partial unique index that excludes only the new
-- 'DRUG_LICENSE' doc_type, which is never subject to a uniqueness
-- constraint — that's what allows unlimited rows per partner.
ALTER TABLE partner_documents DROP CONSTRAINT IF EXISTS customer_documents_user_id_doc_type_key;
ALTER TABLE partner_documents DROP CONSTRAINT IF EXISTS partner_documents_user_id_doc_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS partner_documents_user_doctype_unique
    ON partner_documents (user_id, doc_type) WHERE doc_type <> 'DRUG_LICENSE';

ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS license_label TEXT;
ALTER TABLE partner_document_history ADD COLUMN IF NOT EXISTS license_label TEXT;

-- Give existing 20B/21B/legacy rows a sensible label so they display
-- correctly under the new dynamic UI without needing to be re-uploaded.
UPDATE partner_documents SET license_label = 'Form 20B' WHERE doc_type IN ('LICENSE', 'LICENSE_20B') AND license_label IS NULL;
UPDATE partner_documents SET license_label = 'Form 21B' WHERE doc_type = 'LICENSE_21B' AND license_label IS NULL;
