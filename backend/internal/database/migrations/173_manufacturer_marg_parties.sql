-- Which Marg ledger party (or parties — Marg keeps some suppliers twice) each
-- manufacturer is. Manufacturer names follow Marg's, so cheques carry the
-- name on the supplier's bills. A manufacturer whose Marg party couldn't be
-- told apart is flagged for someone to link by hand.

CREATE TABLE IF NOT EXISTS manufacturer_marg_parties (
    party_code       TEXT PRIMARY KEY,          -- marg_ede_ledger.party_code
    manufacturer_id  UUID NOT NULL REFERENCES manufacturers(id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS manufacturer_marg_parties_mfr_idx ON manufacturer_marg_parties (manufacturer_id);

-- why a manufacturer still needs linking by hand; NULL when settled
ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS marg_flag TEXT;

-- the Marg party a payment was made to, so linking that party to a
-- manufacturer later also links its payments
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS marg_party_code TEXT;
CREATE INDEX IF NOT EXISTS supplier_payments_marg_party_idx ON supplier_payments (marg_party_code);
