-- Cheque writer (admin panel › Cheques): the bank layouts cheques are printed
-- with, kept on the server so every admin login has the same printer setup.
--
-- A layout's settings (size, field positions, words format, printer offsets,
-- next cheque no., the scanned cheque shown behind the preview) live in
-- `data` as the page uses them; only the name is a column of its own.

CREATE TABLE IF NOT EXISTS cheque_profiles (
    id           BIGSERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    data         JSONB NOT NULL DEFAULT '{}',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
