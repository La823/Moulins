-- Discrete columns for the fields pulled from the GST/drug-license scrapers,
-- instead of relying only on the scraped_data JSON blob (102). Which columns
-- apply depends on doc_type: GST rows use legal_name/trade_name/business_type/
-- registered_date; LICENSE_20B/21B rows use legal_name (institute name),
-- first_issue_date, tech_person_name/tech_person_reg_no. status/address are
-- shared since only one doc type occupies a given row.
ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS trade_name TEXT;
ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS registered_date DATE;
ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS first_issue_date DATE;
ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS tech_person_name TEXT;
ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS tech_person_reg_no TEXT;

ALTER TABLE partner_document_history ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE partner_document_history ADD COLUMN IF NOT EXISTS trade_name TEXT;
ALTER TABLE partner_document_history ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE partner_document_history ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE partner_document_history ADD COLUMN IF NOT EXISTS registered_date DATE;
ALTER TABLE partner_document_history ADD COLUMN IF NOT EXISTS first_issue_date DATE;
ALTER TABLE partner_document_history ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE partner_document_history ADD COLUMN IF NOT EXISTS tech_person_name TEXT;
ALTER TABLE partner_document_history ADD COLUMN IF NOT EXISTS tech_person_reg_no TEXT;
