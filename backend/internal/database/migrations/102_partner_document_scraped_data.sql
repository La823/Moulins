-- Stores the raw JSON returned by the GST/drug-license government-portal
-- scrapers alongside the document row that was verified against it, so the
-- fetched details don't have to be re-scraped to display later.
ALTER TABLE partner_documents ADD COLUMN IF NOT EXISTS scraped_data JSONB;
ALTER TABLE partner_document_history ADD COLUMN IF NOT EXISTS scraped_data JSONB;
