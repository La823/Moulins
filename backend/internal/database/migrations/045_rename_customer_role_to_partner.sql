-- "Customer" is renamed to "Partner" throughout the product (role label,
-- permission key, API routes, table/column names) — this migrates the
-- existing schema and data to match.
UPDATE users SET role = 'partner' WHERE role = 'customer';
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'partner';
UPDATE employee_permissions SET permission = 'partners' WHERE permission = 'customers';

ALTER TABLE doctors RENAME COLUMN customer_id TO partner_id;
ALTER INDEX IF EXISTS idx_doctors_customer_id RENAME TO idx_doctors_partner_id;

ALTER TABLE customer_documents RENAME TO partner_documents;
ALTER INDEX IF EXISTS idx_customer_documents_user_id RENAME TO idx_partner_documents_user_id;
ALTER INDEX IF EXISTS idx_customer_documents_verified RENAME TO idx_partner_documents_verified;
DROP TRIGGER IF EXISTS update_customer_documents_updated_at ON partner_documents;
CREATE TRIGGER update_partner_documents_updated_at BEFORE UPDATE ON partner_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE customer_ledgers RENAME TO partner_ledgers;
