-- Bank statements read from email, plus an encrypted store for the passwords
-- and tokens the job needs.
--
-- HDFC emails a "SmartStatement" every morning for the previous day to
-- arora.pardeep1973@gmail.com. The email has no PDF: it links to an HDFC page
-- that asks for the statement password and returns the statement as HTML.
-- internal/bankstatements reads the email through the Gmail API, opens the
-- link with the password from stored_credentials and saves every field of
-- the statement here.

-- Passwords and tokens, encrypted with AES-256-GCM under the CREDENTIALS_KEY
-- env var (never stored in the database). Change one with
-- `go run ./cmd/bankstatements set-credential <key>`.
CREATE TABLE IF NOT EXISTS stored_credentials (
    key         TEXT PRIMARY KEY,           -- e.g. hdfc_statement_password, gmail_reader_token
    label       TEXT NOT NULL,              -- what it is, in plain words
    username    TEXT,                       -- the account or login it belongs to
    secret_enc  TEXT NOT NULL,              -- base64(nonce || ciphertext)
    notes       TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which accounts to read. Only ***1530 for now; another account is one row.
CREATE TABLE IF NOT EXISTS bank_statement_accounts (
    account_no      TEXT PRIMARY KEY,       -- full number, e.g. 50200121551530
    bank            TEXT NOT NULL DEFAULT 'HDFC',
    last4           TEXT NOT NULL,          -- as the email subject shows it (***1530)
    sender          TEXT NOT NULL,          -- the address the statement emails come from
    credential_key  TEXT NOT NULL,          -- stored_credentials.key of the statement password
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO bank_statement_accounts (account_no, bank, last4, sender, credential_key)
VALUES ('50200121551530', 'HDFC', '1530', 'hdfcbanksmartstatement@hdfcbank.bank.in', 'hdfc_statement_password')
ON CONFLICT (account_no) DO NOTHING;

-- One row per statement (one account, one period — normally one day).
CREATE TABLE IF NOT EXISTS bank_statements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_no          TEXT NOT NULL,
    period_from         DATE NOT NULL,
    period_to           DATE NOT NULL,

    -- customer
    customer_name       TEXT,
    customer_id         TEXT,
    customer_address    TEXT,

    -- account
    account_type        TEXT,               -- Current Account
    product_type        TEXT,               -- MSME - FLEXI PLUS ACCOUNT
    currency            TEXT,
    joint_holder_1      TEXT,
    joint_holder_2      TEXT,
    nominee             TEXT,
    account_opened_on   DATE,
    account_status      TEXT,
    od_limit            NUMERIC(16,2),      -- "Limit"
    hold_balance        NUMERIC(16,2),
    expected_aqb        NUMERIC(16,2),      -- "Expected AQB/AMB"
    available_balance   NUMERIC(16,2),

    -- branch
    branch_name         TEXT,
    branch_address      TEXT,
    branch_phone        TEXT,
    ifsc                TEXT,
    micr                TEXT,

    -- summary
    opening_balance     NUMERIC(16,2),
    debit_amount        NUMERIC(16,2),
    credit_amount       NUMERIC(16,2),
    closing_balance     NUMERIC(16,2),
    debit_count         INT,
    credit_count        INT,

    statement_ref       TEXT,               -- HDFC's own statement file name
    statement_html      TEXT,               -- the statement page as HDFC sent it (images and scripts removed)

    gmail_message_id    TEXT,
    email_subject       TEXT,
    email_received_at   TIMESTAMPTZ,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (account_no, period_from, period_to)
);
CREATE INDEX IF NOT EXISTS bank_statements_account_idx ON bank_statements (account_no, period_to DESC);

-- Every transaction line, in the statement's order.
CREATE TABLE IF NOT EXISTS bank_statement_lines (
    id               BIGSERIAL PRIMARY KEY,
    statement_id     UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    line_no          INT NOT NULL,
    txn_date         DATE,
    narration        TEXT,                  -- "Transaction details"
    ref_no           TEXT,                  -- "Cheque/Ref No"
    value_date       DATE,
    withdrawal       NUMERIC(16,2),
    deposit          NUMERIC(16,2),
    closing_balance  NUMERIC(16,2),
    col8             NUMERIC(16,2),         -- HDFC's unnamed COL8 (repeats the withdrawal)
    txn_type         TEXT,                  -- HDFC's COL9: Online Txn / Cheque Txn / Others
    UNIQUE (statement_id, line_no)
);
CREATE INDEX IF NOT EXISTS bank_statement_lines_date_idx ON bank_statement_lines (txn_date);

-- Each statement email seen, and how reading it went — so an email is read
-- once, and a failure is visible instead of silent.
CREATE TABLE IF NOT EXISTS bank_statement_emails (
    gmail_message_id  TEXT PRIMARY KEY,
    account_no        TEXT NOT NULL,
    subject           TEXT,
    received_at       TIMESTAMPTZ,
    status            TEXT NOT NULL,        -- saved | failed | rejected (wrong password; not retried)
    attempts          INT NOT NULL DEFAULT 0,
    last_error        TEXT,
    statement_id      UUID REFERENCES bank_statements(id) ON DELETE SET NULL,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
