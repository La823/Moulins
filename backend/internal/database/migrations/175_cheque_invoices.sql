-- Cheques are paid against suppliers' purchase invoices, not purchase-order
-- lines (which 172 linked them to). Marg has every invoice: this year's from
-- the Corporate API (marg_ede_bills, type P), last year's from the Day Book
-- (marg_daybook_vouchers, purchase). Debit notes and purchase-return
-- challans are credits against the same suppliers. The two sources never
-- overlap: the API starts on 1 April 2026, the Day Book ends the day before.
--
-- 172's PO links (supplier_payment_allocations) and PO bill columns stay in
-- place but are no longer used.

CREATE OR REPLACE VIEW v_purchase_invoices AS
SELECT 'ede:' || b.voucher::text                                AS invoice_key,
       CASE WHEN b.bill_type = 'P' THEN 'invoice' ELSE 'debit_note' END AS kind,
       'api'::text                                          AS source,
       b.party_code,
       b.bill_no                                            AS marg_no,
       -- Marg keeps the supplier's invoice number on the batches it brought
       -- in (cut to 12 characters), not on the bill
       (SELECT string_agg(DISTINCT st.supplier_invoice, ', ')
          FROM marg_ede_bill_items i
          JOIN v_marg_ede_stock st ON st.product_pid = i.product_pid AND st.batch = i.batch
         WHERE i.voucher = b.voucher AND NOT i.is_deleted AND st.supplier_invoice IS NOT NULL
           AND b.bill_type = 'P')                           AS supplier_bill_no,
       b.bill_date,
       b.total
FROM marg_ede_bills b
WHERE b.bill_type IN ('P', 'B', 'u') AND NOT b.is_deleted AND NOT b.is_cancelled
UNION ALL
SELECT 'daybook:' || v.id::text,
       CASE WHEN v.kind = 'purchase' THEN 'invoice' ELSE 'debit_note' END,
       'daybook',
       v.party_code,
       v.entry_no,
       NULLIF(trim(v.ref_no), ''),
       COALESCE(v.ref_date, v.voucher_date)::date,
       v.total
FROM marg_daybook_vouchers v
WHERE v.kind IN ('purchase', 'debit_note');

-- payments find their invoices by key: index the keys as the view builds them
CREATE INDEX IF NOT EXISTS marg_ede_bills_invoice_key_idx ON marg_ede_bills (('ede:' || voucher::text));
CREATE INDEX IF NOT EXISTS marg_daybook_vouchers_invoice_key_idx ON marg_daybook_vouchers (('daybook:' || id::text));

-- which invoices a payment pays, and how much of each
CREATE TABLE IF NOT EXISTS supplier_payment_invoices (
    id           BIGSERIAL PRIMARY KEY,
    payment_id   BIGINT NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
    invoice_key  TEXT NOT NULL,              -- v_purchase_invoices.invoice_key
    amount       NUMERIC(14, 2) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (payment_id, invoice_key)
);
CREATE INDEX IF NOT EXISTS supplier_payment_invoices_key_idx ON supplier_payment_invoices (invoice_key);
