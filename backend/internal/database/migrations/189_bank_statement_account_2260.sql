-- Read the second HDFC current account's daily statements too.
-- ***2260 (BIZ PRO PLUS) gets the same SmartStatement emails from the same
-- sender as ***1530 and opens with the same statement password, so it uses
-- the same stored credential.
INSERT INTO bank_statement_accounts (account_no, bank, last4, sender, credential_key)
VALUES ('50200108852260', 'HDFC', '2260', 'hdfcbanksmartstatement@hdfcbank.bank.in', 'hdfc_statement_password')
ON CONFLICT (account_no) DO UPDATE SET active = TRUE;
